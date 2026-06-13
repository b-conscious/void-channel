// THE ARCHIVE SPINE. Standalone service. Owns all communication with archive.org.
// Downstream (the Void Backend) treats this service with last-known-good caching and
// stale-while-revalidate; this service treats Archive the same way via accumulated pools.
const express = require('express');
const archive = require('../backend/archive.js');
const cats = require('./categories.js');
const dbx = require('./db.js');
const sync = require('./sync.js');
const mappers = require('./mappers.js');

const PORT = parseInt(process.env.SPINE_PORT || '3002', 10);
const ADMIN_KEY = process.env.SPINE_ADMIN_KEY || '';
const SYNC_INTERVAL_MS = parseInt(process.env.SPINE_SYNC_INTERVAL_MS || String(8 * 60 * 60 * 1000), 10);

const app = express();
const startedAt = Date.now();

// Short-TTL cache for live passthroughs (search, item detail rides mappers' own cache).
const liveCache = new Map();
function cached(key, ttlMs, fn) {
  const hit = liveCache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return Promise.resolve(hit.v);
  return Promise.resolve(fn()).then((v) => {
    liveCache.set(key, { t: Date.now(), v });
    if (liveCache.size > 300) liveCache.delete(liveCache.keys().next().value);
    return v;
  });
}

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'SPINE_ADMIN_KEY not set' });
  if (req.get('x-spine-key') !== ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.get('/categories', (req, res) => {
  const type = req.query.type || null;
  res.json(cats.list(type).map(({ query, ...pub }) => pub));
});

app.get('/category/:id', async (req, res) => {
  const cat = cats.get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'unknown category' });
  const page = parseInt(req.query.page, 10) || 1;
  const rows = Math.min(parseInt(req.query.rows, 10) || 50, 100);
  if (req.query.refresh === 'true') {
    if (req.get('x-spine-key') !== ADMIN_KEY) return res.status(401).json({ error: 'refresh is admin-only' });
    try { await sync.syncOne(cat.id); } catch (e) { /* pool stays last-good */ }
  }
  const items = dbx.getPool(cat.id, page, rows);
  res.json({ id: cat.id, type: cat.type, name: cat.name, subtitle: cat.subtitle, page, rows, items });
});

// Bulk wall: every active category of a type with a slice of its pool. ONE call builds the
// Void Backend's wall payload; request-time policy (era lean, gating) stays downstream.
app.get('/wall', (req, res) => {
  const type = req.query.type || 'video';
  const rows = Math.min(parseInt(req.query.rows, 10) || 50, 100);
  // wall:false crates (series seeds) pool + group + serve via catalog, but never row the wall
  const wall = cats.list(type).filter((c) => c.active && c.wall !== false).map(({ query, ...pub }) => ({
    ...pub,
    items: dbx.getPool(pub.id, 1, rows),
  }));
  res.json({ type, rows, categories: wall });
});

app.get('/item/:identifier', async (req, res) => {
  try {
    const type = req.query.type || 'video';
    // novet=1: vouched kids resolve skips the playability vet (P1 — the vet stormed IA and
    // blanked the kids wall). The backend only sets this for B-approved content.
    const opts = req.query.novet === '1' ? { skipVet: true } : {};
    const item = await mappers.getDetailedItem(req.params.identifier, type, opts);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err).slice(0, 200) });
  }
});

// Local FTS over curated pools when local=true; otherwise raw live passthrough.
// SEARCH STAYS RAW on the passthrough: no curation filters applied.
app.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ q, items: [] });
  const type = req.query.type || null;
  const rows = Math.min(parseInt(req.query.rows, 10) || 50, 100);
  try {
    if (req.query.local === 'true') {
      return res.json({ q, source: 'local', items: dbx.searchLocal(q, type, rows) });
    }
    const typeClause = type ? ` AND mediatype:(${type === 'text' ? 'texts' : type === 'video' ? 'movies' : type === 'game' ? 'software' : 'audio'})` : '';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = String(req.query.sort || 'downloads desc');
    // raw=true skips the type clause entirely: the caller controls the full query string
    const fullQ = req.query.raw === 'true' ? q : `(${q})${typeClause}`;
    const items = await cached(`s:${type}:${rows}:${page}:${sort}:${fullQ}`, 5 * 60 * 1000,
      () => archive.search(fullQ, rows, page, sort));
    res.json({ q, source: 'live', page, items: items || [] });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err).slice(0, 200) });
  }
});

// THE LIBRARY: instant filtered browse over the pools (genre terms/crates, year window,
// runtime window, optional title contains). The chips downstream filter THIS, not live
// Archive: that was the clunk. Raw live search stays untouched on /search.
app.get('/library', (req, res) => {
  const split = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const items = dbx.libraryQuery({
    type: req.query.type || 'video',
    terms: split(req.query.terms),
    crates: String(req.query.crates || '').split(',').map((x) => x.trim()).filter(Boolean),
    yearFrom: parseInt(req.query.yearFrom, 10) || null,
    yearTo: parseInt(req.query.yearTo, 10) || null,
    minR: parseInt(req.query.minRuntime, 10) || null,
    maxR: parseInt(req.query.maxRuntime, 10) || null,
    q: String(req.query.q || '').trim().toLowerCase(),
    rows: Math.min(parseInt(req.query.rows, 10) || 60, 200),
    page: Math.max(1, parseInt(req.query.page, 10) || 1),
  });
  res.json(items);
});

// THE CATALOG (slice 12): destinations, not searches. Movies = the Wikidata-verified films
// table; series = the grouped shows with episodes in broadcast order.
app.get('/catalog/movies', (req, res) => {
  res.json(dbx.catalogMovies({
    rows: Math.min(parseInt(req.query.rows, 10) || 60, 200),
    page: Math.max(1, parseInt(req.query.page, 10) || 1),
    yearFrom: parseInt(req.query.yearFrom, 10) || null,
    yearTo: parseInt(req.query.yearTo, 10) || null,
    q: String(req.query.q || '').trim().toLowerCase(),
  }));
});
app.get('/catalog/series', (req, res) => {
  res.json(dbx.catalogSeries({
    rows: Math.min(parseInt(req.query.rows, 10) || 60, 200),
    page: Math.max(1, parseInt(req.query.page, 10) || 1),
    q: String(req.query.q || '').trim().toLowerCase(),
  }));
});
app.get('/catalog/series/:key', (req, res) => {
  res.json(dbx.seriesItems(req.params.key, Math.min(parseInt(req.query.rows, 10) || 200, 300)));
});
// Player rail: which verified series does this item belong to, and its episodes in order.
app.get('/catalog/item/:id/series', (req, res) => {
  const s = dbx.itemSeries(req.params.id);
  if (!s) return res.json({ series: null });
  res.json({ series: s, ...dbx.seriesItems(s.key, 120) });
});
// THE HUNT FEEDS THE CATALOG: the backend posts every item a user successfully OPENS.
// Pool it under the synthetic 'hunted' crate (findable in the library, NEVER on a kids
// allowlist) and title-parse it into grouping; the next verifyPass wikidata-verifies new
// keys, so real hunting grows the verified catalog while junk stays below the 0.85 face.
app.post('/catalog/ingest', requireAdmin, express.json({ limit: '64kb' }), (req, res) => {
  try {
    const it = req.body && req.body.item;
    if (!it || !it.id || !it.title) return res.status(400).json({ error: 'item required' });
    const id = String(it.id).slice(0, 200);
    const slim = {
      id,
      title: String(it.title).slice(0, 300),
      description: String(it.description || '').slice(0, 400),
      year: parseInt(it.year, 10) || null,
      creator: typeof it.creator === 'string' ? it.creator.slice(0, 200) : '',
      downloads: parseInt(it.downloads, 10) || 0,
      runtime: parseInt(it.runtime, 10) || null,
      subjects: Array.isArray(it.subjects) ? it.subjects.slice(0, 10).map(String) : [],
      thumbnail: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      archiveUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
      videoUrl: null,
    };
    dbx.upsertItem('hunted', 'video', slim);
    const parsed = require('./grouping.js').parseTitle(slim.title);
    if (parsed) {
      dbx.db.prepare(`
        INSERT INTO grouping (item_id, series_key, series_name, season, episode, source, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
          series_key = excluded.series_key, series_name = excluded.series_name,
          season = excluded.season, episode = excluded.episode,
          source = excluded.source, confidence = excluded.confidence
        WHERE excluded.confidence >= grouping.confidence
      `).run(id, parsed.key, parsed.name, parsed.season, parsed.episode, 'title', parsed.conf);
    }
    res.json({ ok: true, grouped: parsed ? parsed.key : null });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err).slice(0, 200) });
  }
});

// Manual regroup + films refresh without waiting for a sync cycle (admin)
app.post('/catalog/rebuild', requireAdmin, async (req, res) => {
  try {
    const g = require('./grouping.js').regroup(dbx);
    let verify = null;
    try { verify = await require('./grouping.js').verifyPass(dbx); } catch (e) { verify = { error: String(e.message || e).slice(0, 120) }; }
    let films = null;
    try { films = await require('./adapters/wikidata.js').syncFilms(); } catch (e) { films = { error: String(e.message || e).slice(0, 120) }; }
    res.json({ grouped: g, verify, films });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err).slice(0, 200) });
  }
});

app.get('/random', (req, res) => {
  const item = dbx.randomItem(req.query.type || null);
  if (!item) return res.status(404).json({ error: 'pool empty' });
  res.json(item);
});

app.get('/health', (req, res) => {
  const depths = dbx.poolDepths();
  const total = Object.values(depths).reduce((a, b) => a + b, 0);
  res.json({
    status: 'ok',
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    categories: cats.list().length,
    pool_total: total,
    pool_depths: depths,
    pool_cap: dbx.POOL_CAP,
    sync_running: sync.isRunning(),
    sync_count: parseInt(dbx.metaGet('sync_count') || '0', 10),
    last_sync: dbx.metaGet('last_sync'),
    last_sync_ms: parseInt(dbx.metaGet('last_sync_ms') || '0', 10),
    last_sync_added: parseInt(dbx.metaGet('last_sync_added') || '0', 10),
    last_sync_errors: JSON.parse(dbx.metaGet('last_sync_errors') || '[]'),
  });
});

// Playability rate: the number that decides whether a crate ships. Samples N pool items and
// resolves real derivatives. Video implemented; other types report null until their mapper JOB.
// Slow and Archive-touching by design, so admin-only and on demand, never in /health.
app.get('/health/playability', requireAdmin, async (req, res) => {
  const cat = cats.get(String(req.query.crate || ''));
  if (!cat) return res.status(404).json({ error: 'unknown crate' });
  const n = Math.min(parseInt(req.query.n, 10) || 5, 15);
  const sample = dbx.getPool(cat.id, 1, 100).sort(() => Math.random() - 0.5).slice(0, n);
  if (!sample.length) return res.json({ crate: cat.id, playability: null, note: 'pool empty' });
  if (cat.type !== 'video') return res.json({ crate: cat.id, playability: null, note: `${cat.type} playability lands with its mapper JOB` });
  let playable = 0; const failures = [];
  for (const it of sample) {
    try {
      const d = await mappers.getDetailedItem(it.id, 'video');
      if (d && d.videoUrl) playable++; else failures.push(it.id);
    } catch (e) { failures.push(it.id); }
  }
  res.json({ crate: cat.id, sampled: sample.length, playable, playability: Math.round((playable / sample.length) * 100) / 100, failures });
});

app.post('/sync', requireAdmin, (req, res) => {
  if (sync.isRunning()) return res.status(409).json({ error: 'sync already running' });
  sync.fullSync().catch((e) => console.error('[spine sync]', e));
  res.json({ started: true });
});

app.post('/sync/:id', requireAdmin, async (req, res) => {
  try {
    res.json(await sync.syncOne(req.params.id));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err).slice(0, 200) });
  }
});

app.listen(PORT, () => {
  console.log(`\n  THE ARCHIVE SPINE`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log(`  -> categories: ${cats.list().length} (video ${cats.list('video').length}, audio ${cats.list('audio').length}, game ${cats.list('game').length}, text ${cats.list('text').length})`);
  console.log(`  -> pool cap ${dbx.POOL_CAP}/category, sync every ${Math.round(SYNC_INTERVAL_MS / 3600000)}h\n`);
  // SELF-HEALING SYNC SCHEDULER (cutover lesson 2026-06-13): a full sync that lands almost
  // nothing means Archive is rate-limiting our IP (the crash-loop hammered it). The old code
  // banked last_sync=now even on an empty sync and then waited 8h — leaving the wall blank for
  // hours after IA cooled off. Now: if the pool is UNHEALTHY after a sync, retry on a short
  // interval (15m) until a real sync lands; once healthy, back off to the normal 8h. This fills
  // the wall the moment IA lets us back in, with no manual trigger and no 8h trap.
  const RETRY_MS = 15 * 60 * 1000;
  const HEALTHY_MIN = 500; // video pool rows that count as "we actually have content"
  function poolHealthy() {
    try { return dbx.db.prepare("SELECT COUNT(*) c FROM pool WHERE type='video'").get().c >= HEALTHY_MIN; }
    catch (e) { return false; }
  }
  async function syncCycle() {
    try {
      const r = await sync.fullSync();
      console.log(`  -> sync: +${r.added || 0} items, ${r.errors ? r.errors.length : 0} errors`);
    } catch (e) { console.error('[spine sync]', e); }
    const healthy = poolHealthy();
    const next = healthy ? SYNC_INTERVAL_MS : RETRY_MS;
    console.log(`  -> pool ${healthy ? 'healthy' : 'THIN (likely IA rate-limit) — retrying in 15m'}; next sync in ${Math.round(next / 60000)}m`);
    setTimeout(syncCycle, next);
  }
  const last = Date.parse(dbx.metaGet('last_sync') || 0) || 0;
  if (!poolHealthy() || Date.now() - last > SYNC_INTERVAL_MS) {
    console.log('  -> pool stale/thin, starting sync');
    syncCycle();
  } else {
    console.log(`  -> pool fresh + healthy (last sync ${dbx.metaGet('last_sync')}), no startup sync`);
    setTimeout(syncCycle, SYNC_INTERVAL_MS);
  }
});
