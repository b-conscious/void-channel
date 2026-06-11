// Pool-accumulating sync. Each pass rotates sort and page per category so pools DEEPEN with
// genuinely new items instead of snapshotting the same 50. Failures leave the last good pool
// intact and are reported on /health. Archive is touched gently: staggered, circuit-breakered
// (the breaker lives in archive.js search), partial success is normal output.
const archive = require('../backend/archive.js');
const cats = require('./categories.js');
const dbx = require('./db.js');

const STAGGER_MS = parseInt(process.env.SPINE_STAGGER_MS || '2000', 10);
const ROWS_PER_SYNC = 50;
const SORTS = ['downloads desc', 'addeddate desc', 'week desc', 'year desc'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildQuery(cat) {
  let q = cat.query;
  if (cat.exclude_nsfw && archive.NSFW_EXCLUDE) q += archive.NSFW_EXCLUDE;
  return q;
}

async function syncCategory(cat, syncCount) {
  const sort = SORTS[(syncCount + cat.id.length) % SORTS.length];
  const page = 1 + ((syncCount + cat.id.length) % 4);
  let raw = await archive.search(buildQuery(cat), ROWS_PER_SYNC, page, sort);
  // Thin categories do not reach rotated pages; an empty draw on page>1 falls back to page 1
  // so a niche crate can never be parked empty for multiple sync cycles.
  if ((!Array.isArray(raw) || raw.length === 0) && page > 1) {
    raw = await archive.search(buildQuery(cat), ROWS_PER_SYNC, 1, sort);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return { id: cat.id, added: 0, seen: 0, note: 'empty result (throttle or thin query), pool unchanged' };
  }
  let added = 0;
  for (const item of raw) {
    if (!item || !item.id) continue;
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
