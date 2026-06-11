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

app.get('/item/:identifier', async (req, res) => {
  try {
    const type = req.query.type || 'video';
    const item = await mappers.getDetailedItem(req.params.identifier, type);
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
    const items = await cached(`s:${type}:${rows}:${q}`, 5 * 60 * 1000,
      () => archive.search(`(${q})${typeClause}`, rows, 1, 'downloads desc'));
    res.json({ q, source: 'live', items: items || [] });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err).slice(0, 200) });
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
  // Sync on startup only when the pool is empty or stale; a restart with a healthy db must NOT
  // trigger a full re-sync (that is the cold-boot problem this service exists to kill).
  const last = Date.parse(dbx.metaGet('last_sync') || 0) || 0;
  if (Date.now() - last > SYNC_INTERVAL_MS) {
    console.log('  -> pool stale, starting sync');
    sync.fullSync().then((r) => console.log(`  -> sync done: +${r.added} items, ${r.errors ? r.errors.length : 0} errors`)).catch((e) => console.error('[spine sync]', e));
  } else {
    console.log(`  -> pool fresh (last sync ${dbx.metaGet('last_sync')}), no startup sync`);
  }
  setInterval(() => {
    sync.fullSync().then((r) => console.log(`  -> scheduled sync: +${r.added}, ${r.errors ? r.errors.length : 0} errors`)).catch((e) => console.error('[spine sync]', e));
  }, SYNC_INTERVAL_MS);
});
