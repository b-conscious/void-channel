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

function metaGet(key) {
  const r = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key);
  return r ? r.value : null;
}
function metaSet(key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, String(value));
}

module.exports = { db, upsertItem, capPool, getPool, poolDepths, randomItem, searchLocal, metaGet, metaSet, POOL_CAP };
