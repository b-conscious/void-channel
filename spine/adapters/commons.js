// Wikimedia Commons source adapter (JOB_13 slice 2). Promoted from DEMOTED by B's ruling
// 2026-06-11: playability is handled by a simple iOS notice, not a gate. Everything here is
// WebM/OGV (Commons hosts no H.264 by policy); modern iOS Safari plays WebM since iOS 15,
// older devices may struggle, so list and detail both carry stream_format: 'webm' and the
// frontend renders B's "may have issues on iOS" banner off that flag.
// Ids are namespaced 'commons:<pageid>'. License rides along: rights INFORMS, never gates.

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'VOIDtv-Spine/0.1 (https://voidtv.net; github.com/b-conscious/void-channel)';

async function getJson(params) {
  const url = `${API}?action=query&format=json&origin=*&${params}`;
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`commons ${res.status}`);
  return res.json();
}

function stripHTML(s) { return String(s || '').replace(/<[^>]*>/g, '').trim(); }

function meta(vi, key) {
  const em = (vi.extmetadata || {})[key];
  return em ? String(em.value || '') : '';
}

function normalize(pageid, title, vi) {
  const yearMatch = (meta(vi, 'DateTimeOriginal') || meta(vi, 'DateTime')).match(/(18|19|20)\d{2}/);
  return {
    id: `commons:${pageid}`,
    source: 'commons',
    title: String(title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
    description: stripHTML(meta(vi, 'ImageDescription')).slice(0, 400),
    year: yearMatch ? parseInt(yearMatch[0], 10) : null,
    creator: stripHTML(meta(vi, 'Artist')).slice(0, 80),
    downloads: 0,
    runtime: null,
    subjects: [],
    thumbnail: vi.thumburl || '',
    archiveUrl: `https://commons.wikimedia.org/?curid=${pageid}`,
    videoUrl: null,
    rights: meta(vi, 'LicenseShortName') || null,
    stream_format: 'webm',
  };
}

// One sync page: full-text file search, then one batched videoinfo call for the metadata.
// Page rotation maps to sroffset, same variety contract as the other adapters.
async function fetchPage(cat, page, rows) {
  const offset = (Math.max(1, page) - 1) * rows;
  const s = await getJson(`list=search&srsearch=${encodeURIComponent('filetype:video ' + cat.query)}&srnamespace=6&srlimit=${rows}&sroffset=${offset}`);
  const hits = ((s.query || {}).search || []).filter((h) => h.pageid);
  if (!hits.length) return [];
  const ids = hits.map((h) => h.pageid).join('|');
  const d = await getJson(`pageids=${ids}&prop=videoinfo&viprop=url|mime|extmetadata&viurlwidth=640`);
  const pages = (d.query || {}).pages || {};
  const out = [];
  for (const h of hits) {
    const p = pages[h.pageid];
    const vi = p && p.videoinfo && p.videoinfo[0];
    if (vi) out.push(normalize(h.pageid, p.title, vi));
  }
  return out;
}

// Detail: derivatives are Commons' server-side transcodes. videoUrl prefers a mid-size VP9
// webm (mobile-safe), HQ the largest rendition; the original only when no transcode exists.
async function getFullItem(pageid) {
  const d = await getJson(`pageids=${encodeURIComponent(pageid)}&prop=videoinfo&viprop=url|size|mime|derivatives|extmetadata&viurlwidth=960`);
  const p = ((d.query || {}).pages || {})[pageid];
  const vi = p && p.videoinfo && p.videoinfo[0];
  if (!vi) return null;
  const out = normalize(pageid, p.title, vi);
  const ders = (vi.derivatives || []).filter((x) => /webm|ogv|ogg/i.test(x.type || ''));
  const byHeight = (max) => ders.filter((x) => x.height && x.height <= max).sort((a, b) => b.height - a.height)[0];
  const largest = ders.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  const mid = byHeight(720) || largest;
  out.videoUrl = (mid && mid.src) || vi.url || null;
  out.videoUrlHQ = (largest && largest.src) || vi.url || null;
  out.type = 'video';
  out.collections = ['commons'];
  return out;
}

module.exports = { prefix: 'commons', fetchPage, getFullItem, normalize };
