// Wikidata: the index, not a source (plan JOB_13). One SPARQL pass at SYNC time, never at
// request time. Finds public domain films that carry an Internet Archive identifier
// (P724 + P6216=Q19652), ranked by sitelink count as the notability proxy. The result IS the
// canonical gems list powering the recency ruling's curated "classic gems & cult" crates.
// Items keep their BARE IA ids so playback rides the existing archive.js resolution path
// untouched; the enrichment (director, genres, date, cross-source links) is merged onto the
// item json and recorded in the enrichment table for any future crate to reuse.

const dbx = require('../db.js');

const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'VOIDtv-Spine/0.1 (https://voidtv.net; github.com/b-conscious/void-channel)';

const SPARQL = `
SELECT ?film ?filmLabel ?ia (MAX(?sl) AS ?sitelinks)
  (SAMPLE(YEAR(?date)) AS ?year)
  (GROUP_CONCAT(DISTINCT ?directorLabel; separator="; ") AS ?directors)
  (GROUP_CONCAT(DISTINCT ?genreLabel; separator="; ") AS ?genres)
  (SAMPLE(?commons) AS ?commonsFile)
  (SAMPLE(?yt) AS ?youtube)
WHERE {
  VALUES ?cls { wd:Q11424 wd:Q226730 wd:Q202866 wd:Q24862 wd:Q506240 wd:Q20667187 }
  ?film wdt:P31 ?cls ;
        wdt:P724 ?ia ;
        wdt:P6216 wd:Q19652 ;
        wikibase:sitelinks ?sl .
  OPTIONAL { ?film wdt:P57 ?dir . ?dir rdfs:label ?directorLabel . FILTER(LANG(?directorLabel) = "en") }
  OPTIONAL { ?film wdt:P136 ?gen . ?gen rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }
  OPTIONAL { ?film wdt:P577 ?date }
  OPTIONAL { ?film wdt:P10 ?commons }
  OPTIONAL { ?film wdt:P1651 ?yt }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?film ?filmLabel ?ia
ORDER BY DESC(?sitelinks)
LIMIT 300`;

// wikibase-sdk is the ruled toolkit; the manual URL is the fallback so a packaging change can
// never park the gems crate empty (SPARQL flake already leaves last-good state by design).
function sparqlUrl(query) {
  try {
    const { WBK } = require('wikibase-sdk');
    const wbk = WBK({ instance: 'https://www.wikidata.org', sparqlEndpoint: ENDPOINT });
    return wbk.sparqlQuery(query);
  } catch (e) {
    return `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  }
}

function val(binding, key) {
  return binding[key] ? binding[key].value : null;
}

function normalize(b) {
  const ia = String(val(b, 'ia') || '').trim();
  const qid = String(val(b, 'film') || '').split('/').pop();
  const year = parseInt(val(b, 'year'), 10) || null;
  const directors = val(b, 'directors') || '';
  const genres = (val(b, 'genres') || '').split('; ').filter(Boolean);
  const links = {};
  if (val(b, 'commonsFile')) links.commons = val(b, 'commonsFile');
  if (val(b, 'youtube')) links.youtube = `https://www.youtube.com/watch?v=${val(b, 'youtube')}`; // LINK-OUT ONLY by ruling
  return {
    id: ia,
    title: val(b, 'filmLabel') || ia,
    description: '',
    year,
    creator: directors,
    downloads: 0,
    runtime: null,
    subjects: genres.slice(0, 10),
    thumbnail: `https://archive.org/services/img/${encodeURIComponent(ia)}`,
    archiveUrl: `https://archive.org/details/${encodeURIComponent(ia)}`,
    videoUrl: null,
    wikidata: { qid, sitelinks: parseInt(val(b, 'sitelinks'), 10) || 0 },
    links: Object.keys(links).length ? links : undefined,
  };
}

// One shot returns the whole ranked list; page rotation is meaningless for an index pass.
// Empty or failed results leave the pool at last-known-good (sync.js contract).
async function fetchPage(cat, page, rows) {
  if (page > 1) return [];
  const res = await fetch(sparqlUrl(SPARQL), { headers: { accept: 'application/sparql-results+json', 'user-agent': UA } });
  if (!res.ok) throw new Error(`wikidata sparql ${res.status}`);
  const json = await res.json();
  const all = ((json.results || {}).bindings || []).map(normalize).filter((it) => it.id);
  // One film often carries several P724 values (IA mirrors of the same print). One entry per
  // FILM: first id wins (rows arrive sitelink-ranked, same film adjacent), every mirror id is
  // recorded as an alias in the enrichment map for later dedupe/playability work.
  const byQid = new Map();
  for (const it of all) {
    const hit = byQid.get(it.wikidata.qid);
    if (hit) hit.iaAliases.push(it.id);
    else byQid.set(it.wikidata.qid, { ...it, iaAliases: [it.id] });
  }
  const rowsOut = [...byQid.values()];
  for (const it of rowsOut) {
    dbx.enrichSet(it.id, { qid: it.wikidata.qid, sitelinks: it.wikidata.sitelinks, year: it.year, directors: it.creator, genres: it.subjects, links: it.links || {}, iaAliases: it.iaAliases });
  }
  return rowsOut;
}

// THE CATALOG (slice 12): the WIDENED film pass. Every film Wikidata knows that IA hosts,
// notability-capped at 5000, written to the films table = the verified movie catalog.
// No PD requirement here: the catalog LISTS what IA hosts; rights inform, never gate.
const FILMS_SPARQL = SPARQL.replace('LIMIT 300', 'LIMIT 5000').replace('wdt:P6216 wd:Q19652 ;\n        ', '');

async function syncFilms() {
  const res = await fetch(sparqlUrl(FILMS_SPARQL), { headers: { accept: 'application/sparql-results+json', 'user-agent': UA } });
  if (!res.ok) throw new Error(`wikidata films ${res.status}`);
  const json = await res.json();
  const rows = ((json.results || {}).bindings || []).map(normalize).filter((it) => it.id);
  const byQid = new Map();
  for (const it of rows) if (!byQid.has(it.wikidata.qid)) byQid.set(it.wikidata.qid, it);
  const films = [...byQid.values()].map((it) => ({
    ia_id: it.id, qid: it.wikidata.qid, title: it.title, year: it.year,
    directors: it.creator || '', genres: (it.subjects || []).join('; '), sitelinks: it.wikidata.sitelinks,
  }));
  const n = dbx.filmsUpsert(films);
  return { films: n };
}

// THE FUZZY FIT (catalog waterfall step 3): verify regex-guessed series names against
// Wikidata. wbsearchentities finds label candidates (fuzzy, no key), then ONE batched SPARQL
// confirms which candidates are actually series (P31/P279* television series or series of
// creative works) and returns canonical label + first-air year. A confirmed name must still
// token-match the guess (same guard idea as the kids resolver) so a fragment can't latch
// onto an unrelated entity. Sequential + 60ms gap: polite to both endpoints at sync cadence.
const SEARCH_API = 'https://www.wikidata.org/w/api.php';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on']);
function tokenMatch(guess, label) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  // Stopwords can't carry a match alone ("V The..." must not latch onto any "The ..." title).
  const g = norm(guess).filter((w) => !STOP.has(w));
  if (!g.length) return false;
  const l = new Set(norm(label));
  return g.filter((w) => l.has(w)).length / g.length >= 0.6;
}

// Upload names carry qualifiers Wikidata labels never have ("TMNT 1987", "Twilight Zone –
// Complete", "V The Series 1984 85") — search on the stripped core, match against the core.
function coreName(name) {
  return String(name || '')
    .replace(/[([{].*$/, '')
    .replace(/\b(19|20)\d{2}(\s*-?\s*\d{2,4})?\b/g, '')
    .replace(/\b(complete|uncut|hd|remastered|tv series|series)\b/gi, '')
    .replace(/[\s–—-]+$/g, '').replace(/\s+/g, ' ').trim();
}

async function searchOnce(term, core) {
  const url = `${SEARCH_API}?action=wbsearchentities&format=json&language=en&type=item&limit=10&search=${encodeURIComponent(term)}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`wbsearch ${res.status}`);
  const json = await res.json();
  return (json.search || []).map((s) => ({ qid: s.id, label: s.label || '' })).filter((c) => tokenMatch(core, c.label));
}

// Fulltext pass (CirrusSearch): wbsearchentities is PREFIX-only, so "Arthur television
// series" finds nothing there — but fulltext ranks the show first. Titles ARE qids; no
// labels here, so the name guard runs later against the confirmed canonical label.
async function searchFulltext(core) {
  const url = `${SEARCH_API}?action=query&list=search&format=json&srlimit=6&srsearch=${encodeURIComponent(`${core} television series`)}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`fulltext ${res.status}`);
  const json = await res.json();
  return (((json.query || {}).search) || []).map((s) => ({ qid: s.title, label: '' })).filter((c) => /^Q\d+$/.test(c.qid));
}

async function searchCandidates(name) {
  const core = coreName(name) || name;
  const plain = await searchOnce(core, core);
  const tv = await searchFulltext(core).catch(() => []);
  const seen = new Set();
  return [...plain, ...tv].filter((c) => !seen.has(c.qid) && seen.add(c.qid));
}

// One SPARQL for ALL candidate qids: which are series, with canonical label + start year.
async function confirmSeries(qids) {
  if (!qids.length) return new Map();
  const q = `
SELECT ?item ?itemLabel (SAMPLE(YEAR(?start)) AS ?year) WHERE {
  VALUES ?item { ${qids.map((id) => `wd:${id}`).join(' ')} }
  VALUES ?seriesCls { wd:Q5398426 wd:Q7725310 }
  ?item wdt:P31/wdt:P279* ?seriesCls .
  OPTIONAL { ?item wdt:P580 ?start } OPTIONAL { ?item wdt:P577 ?start }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?item ?itemLabel`;
  const res = await fetch(sparqlUrl(q), { headers: { accept: 'application/sparql-results+json', 'user-agent': UA } });
  if (!res.ok) throw new Error(`series sparql ${res.status}`);
  const json = await res.json();
  const out = new Map();
  for (const b of ((json.results || {}).bindings || [])) {
    const qid = String(val(b, 'item') || '').split('/').pop();
    out.set(qid, { label: val(b, 'itemLabel') || '', year: parseInt(val(b, 'year'), 10) || null });
  }
  return out;
}

// candidates: [{ key, name }] -> Map(key -> { verdict:'confirmed'|'unknown', qid?, label?, year? })
async function verifySeries(candidates) {
  const found = new Map(); // key -> ordered candidate qids
  const allQids = [];
  for (const c of candidates) {
    try {
      const hits = await searchCandidates(c.name);
      found.set(c.key, hits);
      for (const h of hits) allQids.push(h.qid);
    } catch (e) { found.set(c.key, null); } // null = lookup failed, do NOT cache a negative
    await new Promise((r) => setTimeout(r, 60));
  }
  const confirmed = await confirmSeries([...new Set(allQids)]).catch(() => new Map());
  const out = new Map();
  for (const c of candidates) {
    const hits = found.get(c.key);
    if (hits === null) continue; // transient failure, retry next pass
    // The guard runs against the CONFIRMED canonical label (fulltext hits carry no label):
    // an entity only wins if it is a series AND its real name matches the guess.
    const core = coreName(c.name) || c.name;
    const hit = (hits || []).find((h) => {
      const conf = confirmed.get(h.qid);
      return conf && tokenMatch(core, conf.label || h.label);
    });
    out.set(c.key, hit
      ? { verdict: 'confirmed', qid: hit.qid, label: confirmed.get(hit.qid).label || hit.label, year: confirmed.get(hit.qid).year }
      : { verdict: 'unknown' });
  }
  return out;
}

module.exports = { fetchPage, normalize, syncFilms, verifySeries };
