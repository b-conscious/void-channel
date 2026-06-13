// NASA source adapter: the template for every non-IA source (plan JOB_13).
// images-api.nasa.gov is keyless, clean REST, and everything on it is public domain.
// Item ids are namespaced 'nasa:<nasa_id>'; bare ids everywhere else remain IA by contract.
// Emits the exact list shape archive.js normalizeItem emits so downstream never branches.

const API = 'https://images-api.nasa.gov';

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`nasa ${res.status}`);
  return res.json();
}

function stripHTML(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

function normalize(entry) {
  const d = (entry.data && entry.data[0]) || {};
  const preview = (entry.links || []).find((l) => l.rel === 'preview');
  const year = d.date_created ? parseInt(String(d.date_created).slice(0, 4), 10) : null;
  return {
    id: `nasa:${d.nasa_id}`,
    source: 'nasa',
    title: d.title || 'Untitled',
    description: stripHTML(d.description).slice(0, 400),
    year: year || null,
    creator: d.center || 'NASA',
    downloads: 0,
    runtime: null,
    subjects: Array.isArray(d.keywords) ? d.keywords.map(String).slice(0, 10) : [],
    thumbnail: preview ? preview.href : '',
    archiveUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id || '')}`,
    videoUrl: null,
  };
}

// One sync page for a crate. cat.query is the NASA free-text q. NASA has no sort control,
// so rotation variety comes from the page rotation alone.
async function fetchPage(cat, page, rows) {
  const url = `${API}/search?media_type=video&page_size=${rows}&page=${page}&q=${encodeURIComponent(cat.query)}`;
  const json = await getJson(url);
  const items = ((json.collection || {}).items || []).filter((e) => e.data && e.data[0] && e.data[0].nasa_id);
  return items.map(normalize);
}

// Full detail for a bare nasa_id (prefix already stripped by the mapper dispatch).
// videoUrl prefers the ~medium mp4 (mobile-safe), videoUrlHQ the largest other mp4.
async function getFullItem(nasaId) {
  const [meta, asset] = await Promise.all([
    getJson(`${API}/search?nasa_id=${encodeURIComponent(nasaId)}`),
    getJson(`${API}/asset/${encodeURIComponent(nasaId)}`),
  ]);
  const entry = ((meta.collection || {}).items || [])[0];
  if (!entry) return null;
  const out = normalize(entry);
  const hrefs = (((asset.collection || {}).items) || []).map((i) => i.href).filter((h) => /\.mp4$/i.test(h || ''));
  // https upgrade + encode: asset manifests return http hrefs with literal spaces
  const mp4s = hrefs.map((h) => encodeURI(h.replace(/^http:/, 'https:')));
  const medium = mp4s.find((h) => /~medium\.mp4$/i.test(h));
  const small = mp4s.find((h) => /~small\.mp4$/i.test(h));
  const large = mp4s.find((h) => /~large\.mp4$/i.test(h));
  const orig = mp4s.find((h) => /~orig\.mp4$/i.test(h));
  out.videoUrl = medium || small || large || orig || mp4s[0] || null;
  out.videoUrlHQ = orig || large || null;
  out.type = 'video';
  out.collections = ['nasa'];
  return out;
}

module.exports = { prefix: 'nasa', fetchPage, getFullItem, normalize };
