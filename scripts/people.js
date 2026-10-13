// PEOPLE AND CONNECTIONS (X-Ray data). For every show with a TMDB record, pull the aggregate
// credits: cast with headshots, characters and episode counts; creators, writers, directors.
// Then build the connections graph restricted to OUR library: person -> other VoidTV shows,
// show -> shows that share people. Every hop lands on something that plays here.
// Writes catalog/people/<slug>.json (per show) and catalog/graph.json (people + links).
// TMDB only; no Archive calls. Usage: node scripts/people.js [--fresh]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const ART = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'art.json'), 'utf8'));
const CACHE_DIR = path.join(ROOT, 'catalog', 'cache');
const OUT_DIR = path.join(ROOT, 'catalog', 'people');
const GRAPH = path.join(ROOT, 'catalog', 'graph.json');
const IMG = 'https://image.tmdb.org/t/p/w185';
const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
if (!TOKEN) { console.error('No TMDB_READ_TOKEN'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-');
const CREW_JOBS = new Set(['Creator', 'Writer', 'Director', 'Executive Producer', 'Showrunner', 'Developed By', 'Original Music Composer', 'Teleplay', 'Story']);

async function tmdb(p) {
  const url = 'https://api.themoviedb.org/3' + p;
  for (let a = 0; a < 5; a++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await sleep(220);
    return r.json();
  }
  throw new Error('rate limited');
}

async function creditsFor(tmdbId) {
  const cf = path.join(CACHE_DIR, `tmdb-credits-${tmdbId}.json`);
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const [agg, det] = [await tmdb(`/tv/${tmdbId}/aggregate_credits`), await tmdb(`/tv/${tmdbId}`)];
  const out = { agg: agg || { cast: [], crew: [] }, creators: (det && det.created_by) || [] };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(out));
  return out;
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const people = {}; // id -> { name, photo, shows: { slug: role } }
  let done = 0, skipped = 0;
  for (const entry of LIST.shows) {
    const s = slug(entry.name);
    const a = ART[s];
    if (!a || !a.tmdbId) { skipped++; continue; }
    const outFile = path.join(OUT_DIR, s + '.json');
    let rec;
    if (!fresh && fs.existsSync(outFile)) rec = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    else {
      let c;
      try { c = await creditsFor(a.tmdbId); } catch (e) { console.log(`${entry.name}: ${e.message}`); continue; }
      const cast = (c.agg.cast || []).slice(0, 24).map((p) => ({
        id: p.id, name: p.name, photo: p.profile_path ? IMG + p.profile_path : null,
        character: (p.roles || []).map((r) => r.character).filter(Boolean).slice(0, 3).join(' / '),
        episodes: p.total_episode_count || 0,
      }));
      const crewMap = new Map();
      for (const p of c.creators) crewMap.set(p.id, { id: p.id, name: p.name, photo: p.profile_path ? IMG + p.profile_path : null, jobs: ['Creator'] });
      for (const p of c.agg.crew || []) {
        const jobs = (p.jobs || []).map((j) => j.job).filter((j) => CREW_JOBS.has(j));
        if (!jobs.length) continue;
        const e = crewMap.get(p.id) || { id: p.id, name: p.name, photo: p.profile_path ? IMG + p.profile_path : null, jobs: [] };
        for (const j of jobs) if (!e.jobs.includes(j)) e.jobs.push(j);
        e.episodes = Math.max(e.episodes || 0, p.total_episode_count || 0);
        crewMap.set(p.id, e);
      }
      const crew = [...crewMap.values()].sort((x, y) => (y.jobs.includes('Creator') - x.jobs.includes('Creator')) || (y.episodes || 0) - (x.episodes || 0)).slice(0, 16);
      rec = { show: entry.name, slug: s, tmdbId: a.tmdbId, cast, crew, fetchedAt: new Date().toISOString() };
      fs.writeFileSync(outFile, JSON.stringify(rec, null, 1));
      done++;
      if (done % 50 === 0) console.log(`  ${done} shows credited`);
    }
    for (const p of rec.cast) { const e = people[p.id] = people[p.id] || { name: p.name, photo: p.photo, shows: {} }; e.shows[s] = p.character || 'Cast'; if (!e.photo && p.photo) e.photo = p.photo; }
    for (const p of rec.crew) { const e = people[p.id] = people[p.id] || { name: p.name, photo: p.photo, shows: {} }; e.shows[s] = (e.shows[s] ? e.shows[s] + ' / ' : '') + p.jobs.join(', '); }
  }
  // Graph: only people who connect two or more of our shows carry weight, but keep everyone for X-Ray.
  const connectors = Object.entries(people).filter(([, p]) => Object.keys(p.shows).length >= 2);
  const showLinks = {};
  for (const [id, p] of connectors) {
    const slugs = Object.keys(p.shows);
    for (const x of slugs) for (const y of slugs) if (x !== y) { (showLinks[x] = showLinks[x] || {}); (showLinks[x][y] = showLinks[x][y] || []).push(+id); }
  }
  fs.writeFileSync(GRAPH, JSON.stringify({ builtAt: new Date().toISOString(), people, showLinks }));
  const shows = Object.keys(showLinks).length;
  console.log(`\n${done} shows credited this run (${skipped} without TMDB id). ${Object.keys(people).length} people, ${connectors.length} connect 2+ shows, ${shows} shows have connections. -> catalog/people/, catalog/graph.json`);
  const top = connectors.map(([id, p]) => [p.name, Object.keys(p.shows).length]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('most connected: ' + top.map(([n, k]) => `${n} (${k})`).join(', '));
}
main().catch((e) => { console.error(e); process.exit(1); });
