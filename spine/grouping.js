// THE CATALOG, waterfall steps 1+2 (slice A). Groups pool items into SERIES at sync time:
// step 1 reads crate structure (the dedicated show crates ARE series), step 2 parses titles
// (S01E02, 1x14, "season 2", "episode 5"). Every row records its source and confidence;
// low-confidence guesses are Edit Layer bait later. Steps 3 (Wikidata P179) and 4 (TMDB
// fuzzy verify + posters) land in slice B and only RAISE confidence, never rework this.
const cats = require('./categories.js');

// Ordered cheapest-first; first match wins. Group 1 = series name, then season?, episode?.
const PATTERNS = [
  { re: /^(.*?)[\s._-]*s(\d{1,2})[\s._-]*e(\d{1,3})\b/i, s: 2, e: 3, conf: 0.8 },
  { re: /^(.*?)[\s._-]*\b(\d{1,2})x(\d{1,3})\b/i, s: 2, e: 3, conf: 0.8 },
  { re: /^(.*?)[\s._-]*season[\s._-]*(\d{1,2})(?:[\s._-]*(?:episode|ep)[\s._-]*(\d{1,3}))?/i, s: 2, e: 3, conf: 0.6 },
  { re: /^(.*?)[\s._-]*\b(?:episode|ep)[\s._-]*(\d{1,3})\b/i, s: null, e: 2, conf: 0.6 },
];

function cleanName(raw) {
  const name = String(raw || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:;,]+$/, '')
    .trim();
  if (name.replace(/[^a-z0-9]/gi, '').length < 3) return null;
  return name;
}

function seriesKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Step 2: parse one title. Returns { name, key, season, episode, conf } or null.
function parseTitle(title) {
  for (const p of PATTERNS) {
    const m = p.re.exec(String(title || ''));
    if (!m) continue;
    const name = cleanName(m[1]);
    if (!name) continue;
    return {
      name,
      key: seriesKey(name),
      season: p.s && m[p.s] ? parseInt(m[p.s], 10) : null,
      episode: p.e && m[p.e] ? parseInt(m[p.e], 10) : null,
      conf: p.conf,
    };
  }
  return null;
}

// Full regroup pass over the video pools. Step 1 (crate structure) outranks step 2 for the
// series identity; the regex still contributes season/episode numbers when it matches.
function regroup(dbx) {
  const showCrates = new Map(); // crate id -> series name
  for (const c of cats.list('video')) {
    if (c.group === 'show') showCrates.set(c.id, c.name);
  }
  const rows = dbx.db.prepare(`SELECT item_id, category_id, json FROM pool WHERE type = 'video'`).all();
  const upsert = dbx.db.prepare(`
    INSERT INTO grouping (item_id, series_key, series_name, season, episode, source, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      series_key = excluded.series_key, series_name = excluded.series_name,
      season = excluded.season, episode = excluded.episode,
      source = excluded.source, confidence = excluded.confidence
    WHERE excluded.confidence >= grouping.confidence
  `);
  let grouped = 0;
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.item_id)) continue;
    seen.add(r.item_id);
    let it;
    try { it = JSON.parse(r.json); } catch (e) { continue; }
    const parsed = parseTitle(it.title);
    const crateName = showCrates.get(r.category_id);
    if (crateName) {
      // Step 1: the crate IS the series; regex may still supply numbering
      upsert.run(r.item_id, seriesKey(crateName), crateName,
        parsed ? parsed.season : null, parsed ? parsed.episode : null, 'crate', 0.9);
      grouped++;
    } else if (parsed) {
      upsert.run(r.item_id, parsed.key, parsed.name, parsed.season, parsed.episode, 'title', parsed.conf);
      grouped++;
    }
  }
  return { scanned: rows.length, grouped };
}

// Step 3, THE FUZZY FIT: verify regex-guessed groups against Wikidata. Confirmed groups get
// the canonical name + conf 0.95 (source 'wikidata'); verdicts cache in the enrichment map
// under series:<key> (negatives too) so each name is looked up ONCE. Crate groups (0.9) are
// already B-vouched structure and skip the pass. Cap per pass keeps sync cadence polite;
// uncached keys roll into the next pass.
async function verifyPass(dbx, cap = 60) {
  const wikidata = require('./adapters/wikidata.js');
  const rows = dbx.db.prepare(`
    SELECT series_key AS key, series_name AS name, COUNT(*) AS n FROM grouping
    WHERE source = 'title' GROUP BY series_key HAVING COUNT(*) >= 2 ORDER BY n DESC`).all();
  // Confirmed verdicts are final; unknowns retry after 7 days (search quality improves,
  // Wikidata grows — a miss today is not a miss forever).
  const RETRY_MS = 7 * 24 * 3600 * 1000;
  const todo = rows.filter((r) => {
    const v = dbx.enrichGet(`series:${r.key}`);
    return !v || (v.verdict !== 'confirmed' && Date.now() - (v.t || 0) > RETRY_MS);
  }).slice(0, cap);
  if (!todo.length) return { checked: 0, confirmed: 0 };
  const verdicts = await wikidata.verifySeries(todo);
  const upd = dbx.db.prepare(`
    UPDATE grouping SET series_name = ?, source = 'wikidata', confidence = 0.95
    WHERE series_key = ? AND source = 'title'`);
  let confirmed = 0;
  for (const [key, v] of verdicts) {
    dbx.enrichSet(`series:${key}`, { ...v, t: Date.now() });
    if (v.verdict === 'confirmed') { upd.run(v.label || key, key); confirmed++; }
  }
  return { checked: verdicts.size, confirmed };
}

module.exports = { parseTitle, regroup, seriesKey, verifyPass };
