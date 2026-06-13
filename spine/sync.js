// Pool-accumulating sync. Each pass rotates sort and page per category so pools DEEPEN with
// genuinely new items instead of snapshotting the same 50. Failures leave the last good pool
// intact and are reported on /health. Archive is touched gently: staggered, circuit-breakered
// (the breaker lives in archive.js search), partial success is normal output.
const archive = require('../backend/archive.js');
const cats = require('./categories.js');
const dbx = require('./db.js');
// Non-IA source adapters (JOB_13). A category with cat.source routes its fetch through the
// matching adapter; everything else stays on the direct IA path below, untouched.
const adapters = {
  nasa: require('./adapters/nasa.js'),
  wikidata: require('./adapters/wikidata.js'),
  commons: require('./adapters/commons.js'),
};

const STAGGER_MS = parseInt(process.env.SPINE_STAGGER_MS || '2000', 10);
const ROWS_PER_SYNC = 50;
const SORTS = ['downloads desc', 'addeddate desc', 'week desc', 'year desc'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildQuery(cat) {
  let q = cat.query;
  if (cat.exclude_nsfw && archive.NSFW_EXCLUDE) q += archive.NSFW_EXCLUDE;
  // B's ruling 2026-06-11 (closes ops-log §15.1): curated pools never hold items that 401
  // for anonymous users (recent broadcast recordings, e.g. Russian 1TV). Raw search stays
  // raw; this is sync-time hygiene for every curated surface.
  q += ' AND NOT access-restricted-item:true';
  return q;
}

// Future-dated items are metadata garbage (fake "2037 Convention" JW spam). They poison
// pools — worst on year-desc/all-time rows where they sort to the very top (P3). Drop them
// at ingestion so they never enter ANY pool. (Search is unaffected — it doesn't sync.)
const MAX_SYNC_YEAR = new Date().getFullYear() + 1;
function notFutureDated(item) {
  const y = parseInt(item && item.year, 10);
  return !(Number.isFinite(y) && y > MAX_SYNC_YEAR);
}

async function syncCategory(cat, syncCount) {
  // A category with a FIXED sort (e.g. most_popular -> downloads desc) must sync with THAT
  // sort, not the rotation: rotating most_popular through year-desc filled "all-time popular"
  // with freshly-uploaded future-dated spam (P3). Rotation still drives the variety rows.
  const sort = cat.sort || SORTS[(syncCount + cat.id.length) % SORTS.length];
  const page = 1 + ((syncCount + cat.id.length) % 4);
  let raw;
  if (cat.source && adapters[cat.source]) {
    raw = await adapters[cat.source].fetchPage(cat, page, ROWS_PER_SYNC);
    if ((!Array.isArray(raw) || raw.length === 0) && page > 1) {
      raw = await adapters[cat.source].fetchPage(cat, 1, ROWS_PER_SYNC);
    }
  } else {
    raw = await archive.search(buildQuery(cat), ROWS_PER_SYNC, page, sort);
    // Thin categories do not reach rotated pages; an empty draw on page>1 falls back to page 1
    // so a niche crate can never be parked empty for multiple sync cycles.
    if ((!Array.isArray(raw) || raw.length === 0) && page > 1) {
      raw = await archive.search(buildQuery(cat), ROWS_PER_SYNC, 1, sort);
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return { id: cat.id, added: 0, seen: 0, note: 'empty result (throttle or thin query), pool unchanged' };
  }
  let added = 0;
  for (const item of raw) {
    if (!item || !item.id) continue;
    if (!notFutureDated(item)) continue; // drop fake-future spam at ingestion (P3)
    if (dbx.upsertItem(cat.id, cat.type, { ...item, type: cat.type })) added++;
  }
  dbx.capPool(cat.id);
  return { id: cat.id, added, seen: raw.length };
}

let running = false;

async function fullSync() {
  if (running) return { skipped: 'sync already running' };
  running = true;
  const startedAt = Date.now();
  const syncCount = parseInt(dbx.metaGet('sync_count') || '0', 10);
  const errors = [];
  let totalAdded = 0;
  try {
    for (const cat of cats.list()) {
      if (!cat.active) continue;
      try {
        const r = await syncCategory(cat, syncCount);
        totalAdded += r.added || 0;
      } catch (err) {
        errors.push({ id: cat.id, error: String(err.message || err).slice(0, 200) });
      }
      await sleep(STAGGER_MS);
    }
  } finally {
    // THE CATALOG (slice 12): after every full sync, regroup the pools into series
    // (waterfall steps 1+2) and refresh the verified films table. Failures keep last-good.
    try {
      const g = require('./grouping.js').regroup(dbx);
      console.log(`  -> catalog regroup: ${g.grouped}/${g.scanned} grouped`);
    } catch (e) { errors.push({ id: '_regroup', error: String(e.message || e).slice(0, 200) }); }
    // Step 3, the fuzzy fit: verdicts cache per name, so steady-state passes are no-ops.
    try {
      const v = await require('./grouping.js').verifyPass(dbx);
      console.log(`  -> catalog verify: ${v.confirmed}/${v.checked} confirmed`);
    } catch (e) { errors.push({ id: '_verify', error: String(e.message || e).slice(0, 200) }); }
    try {
      const f = await adapters.wikidata.syncFilms();
      console.log(`  -> catalog films: ${f.films}`);
    } catch (e) { errors.push({ id: '_films', error: String(e.message || e).slice(0, 200) }); }
    running = false;
    dbx.metaSet('sync_count', syncCount + 1);
    dbx.metaSet('last_sync', new Date().toISOString());
    dbx.metaSet('last_sync_ms', Date.now() - startedAt);
    dbx.metaSet('last_sync_errors', JSON.stringify(errors));
    dbx.metaSet('last_sync_added', totalAdded);
  }
  return { categories: cats.list().filter((c) => c.active).length, added: totalAdded, errors };
}

async function syncOne(id) {
  const cat = cats.get(id);
  if (!cat) throw new Error(`unknown category ${id}`);
  const syncCount = parseInt(dbx.metaGet('sync_count') || '0', 10);
  const r = await syncCategory(cat, syncCount);
  return r;
}

function isRunning() { return running; }

module.exports = { fullSync, syncOne, isRunning };
