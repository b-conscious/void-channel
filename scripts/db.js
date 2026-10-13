// THE DATABASE: catalog/shows/*.json -> catalog/voidtv.db (SQLite, one file, metadata only).
// Rebuilt from scratch on every run, so the JSON grids stay the source of truth and the db is
// always a faithful, queryable copy. Open it with any SQLite viewer. No video is ever stored.
// Usage: node scripts/db.js
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const SHOWS_DIR = path.join(ROOT, 'catalog', 'shows');
const OUT = path.join(ROOT, 'catalog', 'voidtv.db');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));

for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(OUT + ext); } catch (e) {} }
const db = new DatabaseSync(OUT);
db.exec(`
PRAGMA journal_mode = DELETE;
CREATE TABLE shows (
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, network TEXT,
  tvmaze_id INTEGER, runtime INTEGER, premiered TEXT, tvmaze_network TEXT,
  episodes_total INTEGER, live INTEGER, review INTEGER, missing INTEGER, covered_pct INTEGER,
  hunted INTEGER NOT NULL DEFAULT 0, matched_at TEXT,
  tmdb_id INTEGER, poster TEXT, backdrop TEXT, overview TEXT, genres TEXT, rating REAL
);
CREATE TABLE episodes (
  show_slug TEXT NOT NULL REFERENCES shows(slug), season INTEGER NOT NULL, number INTEGER NOT NULL,
  name TEXT, airdate TEXT, state TEXT NOT NULL,
  confidence REAL, why TEXT, item TEXT, item_title TEXT, file TEXT, url TEXT,
  seconds INTEGER, format TEXT, playable INTEGER, size_mb INTEGER, alternates INTEGER,
  PRIMARY KEY (show_slug, season, number)
);
CREATE TABLE movies (
  tmdb_id INTEGER PRIMARY KEY, kind TEXT, title TEXT NOT NULL, year INTEGER, runtime INTEGER, rating REAL, votes INTEGER,
  poster TEXT, backdrop TEXT, overview TEXT, state TEXT NOT NULL, confidence REAL, item TEXT, item_title TEXT, file TEXT, url TEXT,
  seconds INTEGER, format TEXT, playable INTEGER, size_mb INTEGER, archive_mentions INTEGER, hunted_at TEXT
);
CREATE INDEX idx_movies_state ON movies(state);
CREATE INDEX idx_episodes_state ON episodes(state);
CREATE INDEX idx_episodes_item ON episodes(item);
CREATE VIEW coverage AS
  SELECT type, COUNT(*) AS shows, SUM(live) AS live, SUM(review) AS review, SUM(missing) AS missing,
         SUM(CASE WHEN covered_pct >= 80 THEN 1 ELSE 0 END) AS mostly_complete
  FROM shows WHERE hunted = 1 GROUP BY type ORDER BY live DESC;
CREATE VIEW review_queue AS
  SELECT e.show_slug, s.name AS show, e.season, e.number, e.name AS episode, e.confidence, e.why, e.url
  FROM episodes e JOIN shows s ON s.slug = e.show_slug WHERE e.state = 'REVIEW' ORDER BY s.name, e.season, e.number;
`);

const slugOf = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-');
const ART_FILE = path.join(ROOT, 'catalog', 'art.json');
const ART = fs.existsSync(ART_FILE) ? JSON.parse(fs.readFileSync(ART_FILE, 'utf8')) : {};
const artCols = (slug) => { const a = ART[slug] || {}; return [a.tmdbId || null, a.poster || null, a.backdrop || null, a.overview || null, a.genres ? a.genres.join(', ') : null, a.rating || null]; };
const insShow = db.prepare(`INSERT INTO shows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insEp = db.prepare(`INSERT INTO episodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

let shows = 0, eps = 0;
db.exec('BEGIN');
for (const entry of LIST.shows) {
  const slug = slugOf(entry.name);
  const f = path.join(SHOWS_DIR, slug + '.json');
  const g = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  if (!g || !g.seasons) {
    insShow.run(slug, entry.name, entry.type, entry.network, null, null, null, null, null, null, null, null, null, 0, null, ...artCols(slug));
    continue;
  }
  insShow.run(slug, entry.name, entry.type, entry.network, g.tvmaze.id, g.tvmaze.runtime, g.tvmaze.premiered, g.tvmaze.network,
    g.coverage.total, g.coverage.live, g.coverage.review, g.coverage.missing, g.coverage.pct, 1, g.matchedAt, ...artCols(slug));
  shows++;
  for (const se of g.seasons) for (const e of se.episodes) {
    const p = e.file;
    insEp.run(slug, se.season, e.number, e.name, e.airdate, e.state,
      p ? p.conf : null, p ? p.why : null, p ? p.item : null, p ? p.itemTitle : null, p ? p.file : null, p ? p.url : null,
      p ? p.seconds : null, p ? p.format : null, p ? (p.playable ? 1 : 0) : null, p ? p.sizeMB : null, e.alternates ? e.alternates.length : 0);
    eps++;
  }
}
// TV movies and specials from catalog/movies/*.json (written by hunt-movies.js).
const MOV_DIR = path.join(ROOT, 'catalog', 'movies');
const insMov = db.prepare(`INSERT OR REPLACE INTO movies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
let movies = 0;
if (fs.existsSync(MOV_DIR)) {
  for (const f of fs.readdirSync(MOV_DIR)) {
    if (!f.endsWith('.json')) continue;
    const m = JSON.parse(fs.readFileSync(path.join(MOV_DIR, f), 'utf8'));
    const p = m.file;
    insMov.run(m.tmdbId, m.kind, m.title, m.year ? +m.year : null, m.runtime, m.rating, m.votes, m.poster, m.backdrop, m.overview, m.state,
      p ? p.conf : null, p ? p.item : null, p ? p.itemTitle : null, p ? p.file : null, p ? p.url : null, p ? p.seconds : null, p ? p.format : null,
      p ? (p.playable ? 1 : 0) : null, p ? p.sizeMB : null, m.archiveMentions, m.huntedAt);
    movies++;
  }
}
db.exec('COMMIT');
const liveMovies = db.prepare(`SELECT COUNT(*) c FROM movies WHERE state='LIVE'`).get().c;
const live = db.prepare(`SELECT COUNT(*) c FROM episodes WHERE state='LIVE'`).get().c;
const review = db.prepare(`SELECT COUNT(*) c FROM episodes WHERE state='REVIEW'`).get().c;
db.close();
console.log(`${path.relative(ROOT, OUT)}: ${shows} matched shows (${LIST.shows.length} listed), ${eps} episode rows, ${live} live, ${review} review; ${movies} movies hunted, ${liveMovies} live; ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
