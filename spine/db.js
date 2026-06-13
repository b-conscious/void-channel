// SQLite layer for the Spine. One file database, pool accumulation, FTS5 search.
// Uses node:sqlite (built into Node 22.5+): zero native dependencies, no node-gyp, no build
// tools. better-sqlite3 was rejected because it needs a native compile on Node 24.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.SPINE_DB || path.join(__dirname, 'spine.db');
const POOL_CAP = parseInt(process.env.SPINE_POOL_CAP || '300', 10);

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS pool (
  category_id TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  type        TEXT NOT NULL,
  json        TEXT NOT NULL,
  added_at    INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  PRIMARY KEY (category_id, item_id)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS enrichment (
  item_id    TEXT PRIMARY KEY,
  json       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS grouping (
  item_id     TEXT PRIMARY KEY,
  series_key  TEXT NOT NULL,
  series_name TEXT NOT NULL,
  season      INTEGER,
  episode     INTEGER,
  source      TEXT NOT NULL,
  confidence  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grouping_series ON grouping(series_key);
CREATE TABLE IF NOT EXISTS films (
  ia_id      TEXT PRIMARY KEY,
  qid        TEXT,
  title      TEXT NOT NULL,
  year       INTEGER,
  directors  TEXT,
  genres     TEXT,
  sitelinks  INTEGER DEFAULT 0,
  fetched_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS pool_fts USING fts5(
  item_id, category_id, type, title, creator, description, subjects
);
`);

const upsertStmt = db.prepare(`
  INSERT INTO pool (category_id, item_id, type, json, added_at, last_seen)
  VALUES (@category_id, @item_id, @type, @json, @now, @now)
  ON CONFLICT(category_id, item_id)
  DO UPDATE SET json = @json, last_seen = @now
`);
const ftsDelStmt = db.prepare(`DELETE FROM pool_fts WHERE item_id = ? AND category_id = ?`);
const ftsInsStmt = db.prepare(`
  INSERT INTO pool_fts (item_id, category_id, type, title, creator, description, subjects)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Insert or refresh one normalized item in a category pool. Returns true when newly added.
function upsertItem(categoryId, type, item) {
  const now = Date.now();
  const existed = db.prepare(`SELECT 1 FROM pool WHERE category_id=? AND item_id=?`).get(categoryId, item.id);
  upsertStmt.run({ category_id: categoryId, item_id: item.id, type, json: JSON.stringify(item), now });
  ftsDelStmt.run(item.id, categoryId);
  ftsInsStmt.run(
    item.id, categoryId, type,
    String(item.title || ''), String(item.creator || ''),
    String(item.description || '').slice(0, 500),
    Array.isArray(item.subjects) ? item.subjects.join(' ') : ''
  );
  return !existed;
}

// Enforce the pool cap, oldest out.
function capPool(categoryId) {
  db.prepare(`
    DELETE FROM pool WHERE category_id = ? AND item_id IN (
      SELECT item_id FROM pool WHERE category_id = ?
      ORDER BY last_seen DESC, added_at DESC LIMIT -1 OFFSET ?
    )
  `).run(categoryId, categoryId, POOL_CAP);
}

function getPool(categoryId, page = 1, rows = 50) {
  const offset = (Math.max(1, page) - 1) * rows;
  return db.prepare(`
    SELECT json FROM pool WHERE category_id = ?
    ORDER BY last_seen DESC, added_at DESC LIMIT ? OFFSET ?
  `).all(categoryId, rows, offset).map((r) => JSON.parse(r.json));
}

function poolDepths() {
  const rows = db.prepare(`SELECT category_id, COUNT(*) AS n FROM pool GROUP BY category_id`).all();
  const out = {};
  for (const r of rows) out[r.category_id] = r.n;
  return out;
}

function randomItem(type) {
  const row = type
    ? db.prepare(`SELECT json FROM pool WHERE type = ? ORDER BY RANDOM() LIMIT 1`).get(type)
    : db.prepare(`SELECT json FROM pool ORDER BY RANDOM() LIMIT 1`).get();
  return row ? JSON.parse(row.json) : null;
}

// FTS5 local search. Terms sanitized to bare words, implicit AND.
function searchLocal(q, type, rows = 50) {
  const terms = String(q).split(/\s+/).map((t) => t.replace(/[^\w]/g, '')).filter(Boolean);
  if (!terms.length) return [];
  const match = terms.join(' ');
  const sql = type
    ? `SELECT DISTINCT p.json FROM pool_fts f JOIN pool p ON p.item_id=f.item_id AND p.category_id=f.category_id
       WHERE pool_fts MATCH ? AND f.type = ? LIMIT ?`
    : `SELECT DISTINCT p.json FROM pool_fts f JOIN pool p ON p.item_id=f.item_id AND p.category_id=f.category_id
       WHERE pool_fts MATCH ? LIMIT ?`;
  const rowsOut = type ? db.prepare(sql).all(match, type, rows) : db.prepare(sql).all(match, rows);
  const seen = new Set();
  const items = [];
  for (const r of rowsOut) {
    const it = JSON.parse(r.json);
    if (!seen.has(it.id)) { seen.add(it.id); items.push(it); }
  }
  return items;
}

// Cross-source enrichment map (JOB_13): Wikidata facts keyed by bare IA id, written at sync
// time, readable by any crate or mapper that wants to merge them later.
function enrichSet(itemId, data) {
  db.prepare(`INSERT INTO enrichment (item_id, json, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`)
    .run(itemId, JSON.stringify(data), Date.now());
}
function enrichGet(itemId) {
  const r = db.prepare(`SELECT json FROM enrichment WHERE item_id = ?`).get(itemId);
  return r ? JSON.parse(r.json) : null;
}

// THE LIBRARY (slice 11): instant filtered browse over the accumulated pools. Items pass
// when they match the genre filter (crate membership OR a term in subjects/title), the year
// window, and the runtime window. Deduped across crates, ranked by downloads. The pool is a
// few thousand rows; a full scan parses in tens of milliseconds and the backend edge-caches.
function libraryQuery({ type = 'video', terms = [], crates = [], yearFrom = null, yearTo = null, minR = null, maxR = null, q = '', rows = 60, page = 1 }) {
  const all = db.prepare(`SELECT item_id, json FROM pool WHERE type = ?`).all(type);
  const seen = new Set();
  const out = [];
  const hasGenre = terms.length > 0 || crates.length > 0;
  const crateSet = new Set(crates);
  const rowsByItem = new Map();
  for (const r of all) {
    let entry = rowsByItem.get(r.item_id);
    if (!entry) { entry = { json: r.json, crates: [] }; rowsByItem.set(r.item_id, entry); }
  }
  // Crate membership needs the category column; collect it in one pass
  const withCat = db.prepare(`SELECT item_id, category_id FROM pool WHERE type = ?`).all(type);
  for (const r of withCat) {
    const entry = rowsByItem.get(r.item_id);
    if (entry) entry.crates.push(r.category_id);
  }
  for (const [id, entry] of rowsByItem) {
    if (seen.has(id)) continue;
    let it;
    try { it = JSON.parse(entry.json); } catch (e) { continue; }
    if (hasGenre) {
      const inCrate = entry.crates.some((c) => crateSet.has(c));
      const hay = (String(it.title || '') + ' ' + (Array.isArray(it.subjects) ? it.subjects.join(' ') : '')).toLowerCase();
      const termHit = terms.some((t) => hay.includes(t));
      if (!inCrate && !termHit) continue;
    }
    if (yearFrom && (!it.year || it.year < yearFrom)) continue;
    if (yearTo && (!it.year || it.year > yearTo)) continue;
    if (minR && (!it.runtime || it.runtime < minR)) continue;
    if (maxR && (it.runtime == null || it.runtime > maxR)) continue;
    if (q && !(String(it.title || '').toLowerCase().includes(q))) continue;
    seen.add(id);
    out.push(it);
  }
  out.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  const start = (Math.max(1, page) - 1) * rows;
  return { total: out.length, items: out.slice(start, start + rows) };
}

// THE CATALOG (slice 12): verified films table written by the Wikidata pass.
function filmsUpsert(rows) {
  const stmt = db.prepare(`INSERT INTO films (ia_id, qid, title, year, directors, genres, sitelinks, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ia_id) DO UPDATE SET qid=excluded.qid, title=excluded.title, year=excluded.year,
      directors=excluded.directors, genres=excluded.genres, sitelinks=excluded.sitelinks, fetched_at=excluded.fetched_at`);
  const now = Date.now();
  let n = 0;
  for (const f of rows) { stmt.run(f.ia_id, f.qid, f.title, f.year, f.directors, f.genres, f.sitelinks, now); n++; }
  return n;
}

// Movie catalog: every entry a Wikidata-verified film IA hosts, notability-ranked.
function catalogMovies({ rows = 60, page = 1, yearFrom = null, yearTo = null, q = '' }) {
  const where = ['1=1'];
  const args = [];
  if (yearFrom) { where.push('year >= ?'); args.push(yearFrom); }
  if (yearTo) { where.push('year <= ?'); args.push(yearTo); }
  if (q) { where.push('LOWER(title) LIKE ?'); args.push(`%${q}%`); }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM films WHERE ${where.join(' AND ')}`).get(...args).n;
  const out = db.prepare(`SELECT * FROM films WHERE ${where.join(' AND ')}
    ORDER BY sitelinks DESC, year DESC LIMIT ? OFFSET ?`).all(...args, rows, (Math.max(1, page) - 1) * rows);
  const items = out.map((f) => ({
    id: f.ia_id, title: f.title, year: f.year, creator: f.directors || '',
    description: '', downloads: f.sitelinks, runtime: null,
    subjects: f.genres ? f.genres.split('; ').slice(0, 6) : [],
    thumbnail: `https://archive.org/services/img/${encodeURIComponent(f.ia_id)}`,
    archiveUrl: `https://archive.org/details/${encodeURIComponent(f.ia_id)}`,
    videoUrl: null, verified: 'wikidata',
  }));
  return { total, items };
}

// Series catalog: grouped shows with episode counts; singletons are not shows.
function catalogSeries({ rows = 60, page = 1, q = '' }) {
  const where = q ? `WHERE LOWER(series_name) LIKE ?` : '';
  const args = q ? [`%${q}%`] : [];
  const all = db.prepare(`
    SELECT series_key, series_name, COUNT(*) AS episodes, MAX(confidence) AS confidence
    FROM grouping ${where}
    GROUP BY series_key HAVING COUNT(*) >= 2 AND MAX(confidence) >= 0.85
    ORDER BY episodes DESC`).all(...args);
  // Catalog face = VERIFIED destinations only: crate groups (0.9, B's structure) and
  // Wikidata-confirmed groups (0.95, the fuzzy fit). Regex-only guesses ("My Love (")
  // stay in the grouping table and in search, but never lead the catalog.
  const total = all.length;
  const pageRows = all.slice((Math.max(1, page) - 1) * rows, (Math.max(1, page) - 1) * rows + rows);
  const thumbStmt = db.prepare(`
    SELECT p.json FROM grouping g JOIN pool p ON p.item_id = g.item_id
    WHERE g.series_key = ? LIMIT 1`);
  const items = pageRows.map((s) => {
    let thumb = '';
    let year = null;
    try {
      const r = thumbStmt.get(s.series_key);
      if (r) { const it = JSON.parse(r.json); thumb = it.thumbnail || ''; year = it.year || null; }
    } catch (e) {}
    return { key: s.series_key, name: s.series_name, episodes: s.episodes, confidence: s.confidence, thumbnail: thumb, year };
  });
  return { total, items };
}

// Which verified series does one item belong to? (Player rail: "more of this show".)
// Same confidence bar as the catalog face — regex-only guesses don't get a rail.
function itemSeries(itemId) {
  const r = db.prepare(`SELECT series_key AS key, series_name AS name, confidence
    FROM grouping WHERE item_id = ?`).get(itemId);
  return r && r.confidence >= 0.85 ? { key: r.key, name: r.name } : null;
}

// Episodes of one series, broadcast order (season, episode, then title).
function seriesItems(key, rows = 200) {
  const out = db.prepare(`
    SELECT DISTINCT g.item_id, g.season, g.episode, p.json
    FROM grouping g JOIN pool p ON p.item_id = g.item_id
    WHERE g.series_key = ?
    ORDER BY g.season IS NULL, g.season, g.episode IS NULL, g.episode LIMIT ?`).all(key, rows);
  const seen = new Set();
  const items = [];
  for (const r of out) {
    if (seen.has(r.item_id)) continue;
    seen.add(r.item_id);
    try {
      const it = JSON.parse(r.json);
      if (r.season != null || r.episode != null) {
        it.episodeLabel = (r.season != null ? `S${r.season}` : '') + (r.episode != null ? `E${r.episode}` : '');
      }
      items.push(it);
    } catch (e) {}
  }
  return { total: items.length, items };
}

function metaGet(key) {
  const r = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key);
  return r ? r.value : null;
}
function metaSet(key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, String(value));
}

module.exports = { db, upsertItem, capPool, getPool, poolDepths, randomItem, searchLocal, libraryQuery, filmsUpsert, catalogMovies, catalogSeries, seriesItems, itemSeries, metaGet, metaSet, enrichSet, enrichGet, POOL_CAP };
