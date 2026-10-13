// THE HUNT (builder stage 1): search loose, judge strict.
// For each show: pull every Archive item that mentions it ANYWHERE (scrape API, all text
// fields), open each promising item's file list (metadata API), and score every video file
// against the show's real runtime from TVmaze. Writes one candidates file per show under
// catalog/candidates/<slug>.json plus a summary table in docs/HUNT.md.
//
// Polite by design: one Archive call at a time, a pause between calls, a per-run call budget,
// and a long quiet period whenever the Archive refuses. Reads only, never downloads video.
//
// Usage: node scripts/hunt.js "Space Ghost"          one show (name substring)
//        node scripts/hunt.js --missing              every show the census marked NOT THERE
//        node scripts/hunt.js --type "Adult Swim"    one row
//        node scripts/hunt.js --budget 150           cap Archive calls this run (default 300)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const CENSUS = fs.existsSync(path.join(__dirname, 'show-probe-results.json'))
  ? JSON.parse(fs.readFileSync(path.join(__dirname, 'show-probe-results.json'), 'utf8')).results : [];
const OUT_DIR = path.join(ROOT, 'catalog', 'candidates');
const OUT_MD = path.join(ROOT, 'docs', 'HUNT.md');
const CACHE_DIR = path.join(ROOT, 'catalog', 'cache');

const PAUSE_MS = 4000;          // between Archive calls
const BACKOFF_MS = [60000, 180000, 600000];
const SCRAPE_COUNT = 500;       // items per scrape page
const MAX_ITEMS_TO_OPEN = 40;   // metadata reads per show, best-scored first
const VIDEO_FORMATS = new Set(['MPEG4', 'h.264', 'h.264 IA', 'Matroska', 'Ogg Video', 'WebM', 'Windows Media', 'AVI', 'QuickTime', 'MPEG2', 'MPEG1', 'RealMedia', 'Flash Video', 'DivX', 'XviD', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);
const PLAYABLE_FORMATS = new Set(['MPEG4', 'h.264', 'h.264 IA', 'WebM', 'Ogg Video', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
let budget = 300;

function norm(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function slug(s) { return norm(s).replace(/ /g, '-'); }
function searchWords(show) {
  return show.toLowerCase().replace(/&/g, ' and ').replace(/’/g, "'")
    .split(/[^a-z0-9']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean)
    .map((w) => (w.includes("'") ? w.split("'")[0] + '*' : w))
    .filter((w) => w !== '*' && !['the', 'and', 'a', 'of', 'with'].includes(w));
}

// ---- polite fetch with cache -------------------------------------------------------------
async function getJson(url, cacheKey) {
  const cf = cacheKey && path.join(CACHE_DIR, cacheKey + '.json');
  if (cf && fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  if (calls >= budget) throw new Error('budget exhausted');
  for (let attempt = 0; ; attempt++) {
    calls++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'user-agent': 'voidtv-hunt/1 (offline catalog builder; one call at a time)' } });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) {
        const j = JSON.parse(text);
        if (cf) { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cf, text); }
        await sleep(PAUSE_MS);
        return j;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= BACKOFF_MS.length) throw e;
      console.log(`    Archive refused (${e.message}); quiet for ${BACKOFF_MS[attempt] / 1000}s`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

// ---- TVmaze: the show's real shape --------------------------------------------------------
async function tvmaze(show) {
  const key = 'tvmaze-' + slug(show);
  const cf = path.join(CACHE_DIR, key + '.json');
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  try {
    // Punctuation confuses TVmaze's search ("NTSF:SD:SUV::" finds nothing; "NTSF SD SUV" does).
    const r = await fetch('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(show.replace(/[^\w\s'&!.-]/g, ' ').replace(/\s+/g, ' ').trim()), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const s = await r.json();
    const er = await fetch(`https://api.tvmaze.com/shows/${s.id}/episodes`, { signal: AbortSignal.timeout(20000) });
    const eps = er.ok ? await er.json() : [];
    const out = {
      id: s.id, name: s.name, runtime: s.runtime || s.averageRuntime || null, premiered: s.premiered || null,
      network: ((s.network || s.webChannel || {}).name) || null,
      episodes: eps.map((e) => ({ season: e.season, number: e.number, name: e.name, airdate: e.airdate, runtime: e.runtime })),
    };
    fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cf, JSON.stringify(out));
    return out;
  } catch (e) { return null; }
}

// ---- Archive: wide search -----------------------------------------------------------------
async function scrape(show) {
  const words = searchWords(show);
  const q = `(${words.join(' AND ')}) AND mediatype:movies`;
  const items = [];
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    const url = 'https://archive.org/services/search/v1/scrape?' + new URLSearchParams({
      q, fields: 'identifier,title,description,subject,year,downloads,collection,creator', count: String(SCRAPE_COUNT),
      ...(cursor ? { cursor } : {}),
    });
    const j = await getJson(url, `scrape-${slug(show)}-${page}`);
    items.push(...(j.items || []));
    cursor = j.cursor;
    if (!cursor || items.length >= 2000) break;
  }
  return items;
}

// Score an item from search fields alone (0..1): does it look like it holds this show?
function itemScore(it, show, tv) {
  const core = norm(show).replace(/^the /, '');
  const title = norm(it.title), desc = norm(Array.isArray(it.description) ? it.description.join(' ') : it.description), id = norm(it.identifier);
  const subj = norm(Array.isArray(it.subject) ? it.subject.join(' ') : it.subject);
  let s = 0;
  if (title.includes(core)) s += 0.5; else if (id.includes(core.replace(/ /g, ''))) s += 0.4; else if (desc.includes(core) || subj.includes(core)) s += 0.3;
  if (/\bs\d{1,2}\s?e\d{1,3}\b|\bseason\b|\bcomplete\b|\bepisodes?\b|\bseries\b|\barchive\b|\bcollection\b|\bmarathon\b|\bbumps?\b/.test(title + ' ' + desc)) s += 0.2;
  if (/\bytp\b|youtube poop|\bamv\b|remix|reaction|review|gameplay|soundtrack|\bost\b|theme song|trailer|\bpromo\b/.test(title)) s -= 0.4;
  if (tv && tv.premiered && it.year && +it.year < +tv.premiered.slice(0, 4) - 1) s -= 0.3;
  const colls = (Array.isArray(it.collection) ? it.collection : [it.collection]).filter((c) => c && !String(c).startsWith('fav-'));
  if (colls.some((c) => /television|vhsvault|animation|cartoon/i.test(c))) s += 0.05;
  return Math.max(0, Math.min(1, s));
}

// ---- Archive: open an item, judge its files ---------------------------------------------
function runtimeBand(seconds, tv) {
  const m = seconds / 60;
  const rt = tv && tv.runtime ? tv.runtime : null;
  if (m < 4) return 'clip';
  if (rt) {
    if (m >= rt * 0.7 && m <= rt * 1.35) return 'episode';
    if (m >= rt * 1.7 && m <= rt * 2.5) return 'double';
    if (m > rt * 4) return 'block';
    return 'odd';
  }
  if (m <= 16) return 'short';
  if (m <= 32) return 'half-hour';
  if (m <= 65) return 'hour';
  return 'block';
}

const EP_RE = [
  /\bs(\d{1,2})\s?e(\d{1,3})\b/i, /\b(\d{1,2})x(\d{1,3})\b/i, /\bseason\s?(\d{1,2})\D{0,12}ep(?:isode)?\s?(\d{1,3})\b/i,
  /\b(\d)(\d{2})\b(?=\D*(?:-|\.| ))/, // 101, 213 style
];
function parseEp(name) {
  for (const re of EP_RE) { const m = re.exec(name); if (m) return { season: +m[1], episode: +m[2] }; }
  const e = /\b(?:ep|episode)\s?(\d{1,3})\b/i.exec(name); if (e) return { season: null, episode: +e[1] };
  return null;
}

async function openItem(id, show, tv) {
  const j = await getJson('https://archive.org/metadata/' + encodeURIComponent(id), 'meta-' + id.replace(/[^a-z0-9._-]/gi, '_'));
  const m = j.metadata || {};
  const core = norm(show).replace(/^the /, '');
  const files = (j.files || []).filter((f) => VIDEO_FORMATS.has(f.format) && f.length);
  // Group originals with their IA derivatives (same stem) so each episode counts once.
  const byStem = new Map();
  for (const f of files) {
    const stem = f.name.replace(/\.ia\.mp4$/i, '').replace(/\.[^.]+$/, '');
    const g = byStem.get(stem) || { stem, files: [] };
    g.files.push(f); byStem.set(stem, g);
  }
  const vids = [];
  for (const g of byStem.values()) {
    const best = g.files.find((f) => PLAYABLE_FORMATS.has(f.format) && f.source === 'original') || g.files.find((f) => PLAYABLE_FORMATS.has(f.format)) || g.files[0];
    const secs = parseFloat(best.length) || 0;
    const nameHit = norm(g.stem).includes(core);
    vids.push({
      name: g.stem, file: best.name, format: best.format, playable: PLAYABLE_FORMATS.has(best.format),
      seconds: Math.round(secs), band: runtimeBand(secs, tv), sizeMB: Math.round((+best.size || 0) / 1e6),
      nameHit, ep: parseEp(g.stem), url: `https://archive.org/download/${id}/${encodeURIComponent(best.name)}`,
    });
  }
  const episodes = vids.filter((v) => v.band === 'episode' || v.band === 'double' || (!tv && (v.band === 'short' || v.band === 'half-hour' || v.band === 'hour')));
  const hits = episodes.filter((v) => v.nameHit).length;
  return {
    id, title: m.title, uploader: m.uploader, date: m.date, collection: m.collection,
    description: String(m.description || '').slice(0, 300),
    totalVideo: vids.length, episodeShaped: episodes.length, nameHits: hits,
    files: vids,
  };
}

// ---- per show -----------------------------------------------------------------------------
async function huntShow(entry) {
  const show = entry.name;
  console.log(`\n== ${show} (${entry.type} / ${entry.network})`);
  const tv = await tvmaze(show);
  console.log(tv ? `   TVmaze: ${tv.name}, ${tv.runtime} min, ${tv.episodes.length} episodes, from ${tv.premiered}` : '   TVmaze: no match');
  const items = await scrape(show);
  const scored = items.map((it) => ({ ...it, score: itemScore(it, show, tv) })).filter((it) => it.score >= 0.3)
    .sort((a, b) => b.score - a.score || (+b.downloads || 0) - (+a.downloads || 0));
  console.log(`   Archive mentions: ${items.length}; worth opening: ${scored.length}; opening up to ${MAX_ITEMS_TO_OPEN}`);
  const opened = [];
  for (const it of scored.slice(0, MAX_ITEMS_TO_OPEN)) {
    try {
      const o = await openItem(it.identifier, show, tv);
      o.searchScore = it.score; o.year = it.year; o.downloads = it.downloads;
      opened.push(o);
      if (o.episodeShaped) console.log(`   + ${it.identifier}: ${o.episodeShaped} episode-shaped of ${o.totalVideo} video (${o.nameHits} named) | ${String(o.title).slice(0, 60)}`);
    } catch (e) {
      if (/budget/.test(e.message)) { console.log('   budget exhausted; stopping this show'); break; }
      console.log(`   ! ${it.identifier}: ${e.message}`);
    }
  }
  const episodeFiles = opened.reduce((n, o) => n + o.episodeShaped, 0);
  const named = opened.reduce((n, o) => n + o.nameHits, 0);
  const result = {
    show, type: entry.type, network: entry.network, huntedAt: new Date().toISOString(),
    tvmaze: tv ? { id: tv.id, runtime: tv.runtime, premiered: tv.premiered, episodes: tv.episodes.length } : null,
    archiveMentions: items.length, itemsOpened: opened.length, episodeShapedFiles: episodeFiles, namedEpisodeFiles: named,
    verdict: episodeFiles >= 8 ? 'FOUND' : episodeFiles >= 1 ? 'TRACES' : 'NOT FOUND',
    items: opened.sort((a, b) => b.episodeShaped - a.episodeShaped),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, slug(show) + '.json'), JSON.stringify(result, null, 2));
  console.log(`   => ${result.verdict}: ${episodeFiles} episode-shaped files across ${opened.length} items (${calls} calls used)`);
  return result;
}

function writeSummary() {
  const rows = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'))) : [];
  const order = { FOUND: 0, TRACES: 1, 'NOT FOUND': 2 };
  rows.sort((a, b) => order[a.verdict] - order[b.verdict] || a.type.localeCompare(b.type) || a.show.localeCompare(b.show));
  const tally = rows.reduce((t, r) => ((t[r.verdict] = (t[r.verdict] || 0) + 1), t), {});
  const lines = ['# The Hunt', '', `Wide-net results, ${rows.length} shows: ` + Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ') + '.', '',
    'Mentions = Archive items naming the show in any field. Episode-shaped = video files whose runtime fits the show\'s TVmaze runtime. Named = those whose filename also carries the show name. FOUND = 8+ episode-shaped files.', '',
    '| Verdict | Show | Row | Mentions | Opened | Episode-shaped | Named | Best item |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const best = r.items[0];
    lines.push(`| ${r.verdict} | ${r.show} | ${r.type} | ${r.archiveMentions} | ${r.itemsOpened} | ${r.episodeShapedFiles} | ${r.namedEpisodeFiles} | ${best ? `${best.id} (${best.episodeShaped})` : ''} |`);
  }
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf('--budget'); if (bi >= 0) budget = +args[bi + 1] || budget;
  const ti = args.indexOf('--type'); const type = ti >= 0 ? args[ti + 1] : null;
  const missing = args.includes('--missing');
  const filter = (args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--budget' && args[i - 1] !== '--type') || '').toLowerCase();
  const notThere = new Set(CENSUS.filter((r) => r.verdict === 'NOT THERE').map((r) => r.show));
  const jobs = LIST.shows.filter((s) => (filter ? s.name.toLowerCase().includes(filter) : true) && (type ? s.type === type : true) && (missing ? notThere.has(s.name) : true));
  console.log(`${jobs.length} shows to hunt, budget ${budget} Archive calls`);
  for (const j of jobs) {
    if (calls >= budget) { console.log('\nBudget spent; stopping. Re-run to continue (cached calls are free).'); break; }
    try { await huntShow(j); } catch (e) { console.log(`   !! ${j.name}: ${e.message}`); }
  }
  writeSummary();
  console.log(`\nDone. ${calls} Archive calls. Summary in docs/HUNT.md, details in catalog/candidates/.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
