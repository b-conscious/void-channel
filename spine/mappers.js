// Item-detail mappers. Video delegates to the existing battle-tested resolver in archive.js.
// Audio, game, and text are JOB_0 stubs: they map what the metadata gives and skip what it
// does not, logging rather than throwing. JOB_3/6/7 complete them.
const archive = require('../backend/archive.js');

const META_TTL = 1000 * 60 * 60 * 6; // 6h detail cache
const metaCache = new Map();

async function rawMetadata(identifier) {
  const hit = metaCache.get(identifier);
  if (hit && Date.now() - hit.t < META_TTL) return hit.v;
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { timeout: 20000 });
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  const v = await res.json();
  metaCache.set(identifier, { t: Date.now(), v });
  if (metaCache.size > 500) metaCache.delete(metaCache.keys().next().value);
  return v;
}

function fileUrl(identifier, name) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(name)}`;
}

function baseDetail(identifier, md, type) {
  const m = md.metadata || {};
  return {
    id: identifier,
    type,
    title: String(m.title || identifier),
    creator: Array.isArray(m.creator) ? m.creator[0] : (m.creator || ''),
    year: parseInt(m.year, 10) || null,
    description: String(m.description || '').replace(/<[^>]*>/g, '').slice(0, 2000),
    thumbnail: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    subjects: Array.isArray(m.subject) ? m.subject.slice(0, 10) : (m.subject ? [String(m.subject)] : []),
    collections: Array.isArray(m.collection) ? m.collection : (m.collection ? [m.collection] : []),
    archiveUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
  };
}

// VIDEO: the existing resolver already returns videoUrl/videoUrlHQ and friends.
async function video(identifier) {
  return archive.getItem(identifier);
}

// AUDIO stub: playable tracks (mp3/ogg), FLAC as hqUrl, ordered by track field else filename.
async function audio(identifier) {
  const md = await rawMetadata(identifier);
  const out = baseDetail(identifier, md, 'audio');
  const files = (md.files || []).filter((f) => f.name && !/__ia_thumb|_spectrogram/.test(f.name));
  const playable = files.filter((f) => /\.(mp3|ogg)$/i.test(f.name));
  const flacs = files.filter((f) => /\.flac$/i.test(f.name));
  const parseLen = (l) => {
    if (l == null) return null;
    const s = String(l);
    if (/^[\d.]+$/.test(s)) return Math.round(parseFloat(s));
    const m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return null;
    return m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  };
  const tracks = playable
    .map((f, i) => ({
      n: parseInt(f.track, 10) || i + 1,
      title: String(f.title || f.name.replace(/\.[^.]+$/, '')),
      duration_s: parseLen(f.length),
      streamUrl: fileUrl(identifier, f.name),
      hqUrl: (() => {
        const stem = f.name.replace(/\.[^.]+$/, '');
        const fl = flacs.find((x) => x.name.replace(/\.[^.]+$/, '') === stem);
        return fl ? fileUrl(identifier, fl.name) : null;
      })(),
      source_file: f.name,
    }))
    .sort((a, b) => a.n - b.n || a.source_file.localeCompare(b.source_file));
  out.tracks = tracks;
  out.artwork = out.thumbnail;
  out.downloadable = !(md.metadata && (md.metadata['access-restricted-item'] === 'true' || md.is_dark));
  out.variant_note = null; // georgeblood stylus collapse is JOB_3
  return out;
}

// GAME stub: emulator detection + Archive embed playUrl.
async function game(identifier) {
  const md = await rawMetadata(identifier);
  const out = baseDetail(identifier, md, 'game');
  const m = md.metadata || {};
  out.emulator = m.emulator || null;
  out.emulator_start = m.emulator_start || null;
  out.platform = Array.isArray(m.collection) ? m.collection[0] : (m.collection || null);
  out.playUrl = `https://archive.org/embed/${encodeURIComponent(identifier)}`;
  out.screenshot = out.thumbnail;
  out.may_not_load = !m.emulator;
  return out;
}

// TEXT stub: formats, reader embed, OCR flag, page count.
async function text(identifier) {
  const md = await rawMetadata(identifier);
  const out = baseDetail(identifier, md, 'text');
  const files = md.files || [];
  const fmt = (re, label) => files.filter((f) => re.test(f.name || '')).map((f) => ({ format: label, url: fileUrl(identifier, f.name) }));
  out.formats = [
    ...fmt(/\.pdf$/i, 'PDF'),
    ...fmt(/\.epub$/i, 'EPUB'),
    ...fmt(/_djvu\.txt$/i, 'TEXT'),
    ...fmt(/\.djvu$/i, 'DJVU'),
  ];
  out.pageCount = parseInt((md.metadata || {}).imagecount, 10) || null;
  out.readerUrl = `https://archive.org/details/${encodeURIComponent(identifier)}?ui=embed`;
  out.hasOcr = files.some((f) => /_djvu\.txt$/i.test(f.name || ''));
  out.coverImage = out.thumbnail;
  return out;
}

const byType = { video, audio, game, text };

async function getDetailedItem(identifier, type = 'video') {
  const fn = byType[type] || video;
  return fn(identifier);
}

module.exports = { getDetailedItem };
