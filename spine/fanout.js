// Episode fan-out (B's decision, June 2026): turn a bundled IA item's files[] manifest into
// per-file episode records, so "Show Season 1 with Music Videos" stops being one mislabeled
// card and becomes correctly-titled episodes (with the music videos corralled). See
// docs/FANOUT_DESIGN.md. PURE module: no IA call, no DB. Tested offline (test-fanout.js).
// computeFanOut(meta, parseRuntimeSeconds) is the entry point; parseRuntimeSeconds is passed
// in from archive.js to avoid duplicating it. NOTE: archive.js loads in BOTH backend + spine,
// so a change to the seam that calls this needs a SPINE restart (slice-31 gotcha).

const VIDEO_EXT = /\.(mp4|mkv|avi|ogv|webm|m4v|mpg|mpeg)$/i;
const SAMPLE_RE = /sample/i;

// Episode patterns run against the FILENAME (filenames inside a bundle carry the real SxxExx,
// unlike the single mislabeled item title). Mirrors the slice-2 / grouping.js patterns.
// NOTE: trailing assertion is (?!\d) not \b — filenames separate with "_" (a word char), so
// \b after the episode digits FAILS on "S02E04_Title" (4 and _ are both \w, no boundary).
const EP_PATTERNS = [
  { re: /(.*?)[\s._-]*s(\d{1,2})[\s._-]*e(\d{1,3})(?!\d)/i, s: 2, e: 3, conf: 0.92 },
  { re: /(.*?)[\s._-]*\b(\d{1,2})x(\d{1,3})(?!\d)/i, s: 2, e: 3, conf: 0.9 },
  { re: /(.*?)[\s._-]*season[\s._-]*(\d{1,2})[\s._-]*(?:episode|ep)[\s._-]*(\d{1,3})(?!\d)/i, s: 2, e: 3, conf: 0.85 },
  { re: /(.*?)[\s._-]*\b(?:episode|ep|part|pt)[\s._-]*(\d{1,3})(?!\d)/i, s: null, e: 2, conf: 0.6 },
];

const MUSIC_RE = /music\s*video|\bmv\b/i;
const TRAILER_RE = /trailer|promo|teaser|tv[\s._-]*spot|\bbumper\b/i;
const EXTRA_RE = /bonus|extra|behind[\s._-]the[\s._-]scenes|deleted|blooper|gag[\s._-]reel|featurette|interview|\bintro\b|\boutro\b/i;

function cleanName(raw) {
  return String(raw || '').replace(VIDEO_EXT, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/[\s:;,_-]+$/, '').trim();
}

function parseFilename(name) {
  const base = String(name || '').replace(VIDEO_EXT, '');
  for (const p of EP_PATTERNS) {
    const m = p.re.exec(base);
    if (!m) continue;
    const show = cleanName(m[1]);
    const season = p.s && m[p.s] ? parseInt(m[p.s], 10) : null;
    const episode = p.e && m[p.e] ? parseInt(m[p.e], 10) : null;
    let epTitle = cleanName(base.slice(m.index + m[0].length)) || null;
    return { show, season, episode, episodeTitle: epTitle, conf: p.conf };
  }
  return null;
}

function classify(file, parsed, parseRuntimeSeconds) {
  const name = String(file.name || '');
  if (parsed && parsed.episode != null) return 'episode';     // explicit SxxExx wins over duration
  if (MUSIC_RE.test(name)) return 'music_video';
  if (TRAILER_RE.test(name)) return 'trailer';
  if (EXTRA_RE.test(name)) return 'extra';
  const sec = typeof parseRuntimeSeconds === 'function' ? parseRuntimeSeconds(file.length) : null;
  if (sec != null && sec > 0) {
    if (sec < 120) return 'trailer';
    if (sec < 300) return 'music_video';
    return 'episode';
  }
  return 'episode';                                            // a playable video in a bundle defaults to episode
}

function assembleTitle(show, parsed, itemTitle) {
  if (parsed && parsed.episode != null) {
    const tag = parsed.season != null
      ? `S${String(parsed.season).padStart(2, '0')}E${String(parsed.episode).padStart(2, '0')}`
      : `E${String(parsed.episode).padStart(2, '0')}`;
    const base = cleanName(show) || cleanName(itemTitle) || 'Episode';
    return parsed.episodeTitle ? `${base} ${tag}: ${parsed.episodeTitle}` : `${base} ${tag}`;
  }
  return cleanName(parsed && parsed.show) || cleanName(itemTitle) || 'Untitled';
}

// meta = the IA metadata object ({ metadata: {...}, files: [...] }). Returns the fanned[]
// array (>1 playable video AND >=1 real episode) or null (single video / no episodes -> the
// item stays a single card, pickVideos as today).
function computeFanOut(meta, parseRuntimeSeconds) {
  const itemTitle = (meta && meta.metadata && meta.metadata.title) || '';
  const files = (meta && meta.files) || [];
  const vids = files.filter((f) =>
    f && f.name && VIDEO_EXT.test(f.name) && !SAMPLE_RE.test(f.name) &&
    (f.size == null || parseInt(f.size, 10) > 1024 * 1024));
  if (vids.length <= 1) return null;                          // not a bundle
  const fanned = vids.map((f) => {
    const parsed = parseFilename(f.name);
    const contentType = classify(f, parsed, parseRuntimeSeconds);
    const show = (parsed && parsed.show) || cleanName(itemTitle);
    return {
      file: f.name,
      contentType,
      season: parsed ? parsed.season : null,
      episode: parsed ? parsed.episode : null,
      episodeTitle: parsed ? parsed.episodeTitle : null,
      displayTitle: assembleTitle(show, parsed, itemTitle),
      confidence: parsed ? parsed.conf : 0.4,
      source: parsed ? 'filename' : 'item_title_fallback',
    };
  });
  // Open-question ruling: fan out ONLY when there is REAL episode structure (at least one file
  // parsed a season/episode number) — not just the default "episode" classification. A messy
  // multi-video bundle with no S/E anywhere stays a single card (could be a film collection,
  // not a show; don't manufacture a fake season).
  if (!fanned.some((x) => x.episode != null)) return null;
  return fanned;
}

module.exports = { computeFanOut, parseFilename, classify, assembleTitle, VIDEO_EXT };
