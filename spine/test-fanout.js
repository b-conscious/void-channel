// Offline tests for fanout.js — synthetic IA manifests, NO IA call, NO DB. Run: node test-fanout.js
// Tests the fan-out logic in isolation during the archive.org throttle (slice-66).
const { computeFanOut, parseFilename, classify } = require('./fanout.js');

// minimal parseRuntimeSeconds (mirrors archive.js) so duration heuristics work in the test
function parseRuntimeSeconds(v) {
  if (v == null) return null;
  if (Array.isArray(v)) v = v[0];
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  const m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  return m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log('  XX', label); } }

// ── 1. A real show bundle: episodes + a music video + a trailer ──────────────────────────
const dragnet = {
  metadata: { title: 'Dragnet Season 2 (with bonus music videos)' },
  files: [
    { name: 'Dragnet_S02E04_The_Big_Thief.mp4', size: '210000000', length: '25:40' },
    { name: 'Dragnet_S02E05_The_Big_Crime.mp4', size: '208000000', length: '26:10' },
    { name: 'Dragnet_S02E06.mp4', size: '205000000', length: '25:00' },
    { name: 'Badge714_Theme_Music_Video.mp4', size: '40000000', length: '3:10' },
    { name: 'Dragnet_1954_Trailer.mp4', size: '12000000', length: '1:30' },
    { name: 'sample.mp4', size: '500000' },          // sample -> excluded
    { name: 'cover.jpg', size: '90000' },            // not video -> excluded
  ],
};
const f = computeFanOut(dragnet, parseRuntimeSeconds);
ok(f && f.length === 5, '5 playable files fanned (sample + jpg excluded)');
const eps = f ? f.filter((x) => x.contentType === 'episode') : [];
ok(eps.length === 3, '3 episodes classified');
ok(eps[0].season === 2 && eps[0].episode === 4, 'S02E04 parsed');
ok(eps[0].episodeTitle === 'The Big Thief', 'episode title parsed');
ok(eps[0].displayTitle === 'Dragnet S02E04: The Big Thief', 'display title assembled');
ok(f && f.some((x) => x.contentType === 'music_video'), 'music video corralled');
ok(f && f.some((x) => x.contentType === 'trailer'), 'trailer corralled');

// ── 2. A single-video item: NOT a bundle ─────────────────────────────────────────────────
const single = { metadata: { title: 'Popeye for President' }, files: [
  { name: 'Popeye_forPresident_512kb.mp4', size: '40000000' },
  { name: 'Popeye_forPresident.gif', size: '900000' },
] };
ok(computeFanOut(single, parseRuntimeSeconds) === null, 'single video -> not a bundle (null)');

// ── 3. Messy multi-video, NO episode numbers anywhere -> stays a single card ──────────────
const messy = { metadata: { title: 'Random VHS Capture Tape 3' }, files: [
  { name: 'capture_part_a.mp4', size: '300000000', length: '45:00' },
  { name: 'capture_part_b.mp4', size: '300000000', length: '50:00' },
] };
ok(computeFanOut(messy, parseRuntimeSeconds) === null, 'messy bundle (no S/E) -> stays single (null)');

// ── 4. NxNN pattern + bare Episode pattern ───────────────────────────────────────────────
ok(parseFilename('Twilight.Zone.1x05.mp4').episode === 5, '1x05 -> episode 5');
ok(parseFilename('Bewitched Episode 12.mp4').episode === 12, 'Episode 12 parsed');
ok(parseFilename('no_pattern_here.mp4') === null, 'no pattern -> null');

// ── 5. Duration heuristic (no S/E, but a long video in a bundle that HAS an S/E elsewhere) ─
ok(classify({ name: 'feature.mp4', length: '48:00' }, null, parseRuntimeSeconds) === 'episode', 'long video -> episode by duration');
ok(classify({ name: 'spot.mp4', length: '0:45' }, null, parseRuntimeSeconds) === 'trailer', 'short -> trailer by duration');

// ── 6. Real-world scene-tagged filenames -> clean titles ─────────────────────────────────
const scene = parseFilename('Adventures.of.Superman.S01E03.The.Mind.Machine.1080p.WEB-DL.x264-GROUP.mkv');
ok(scene && scene.season === 1 && scene.episode === 3, 'scene name: S01E03 parsed');
ok(scene && scene.episodeTitle === 'The Mind Machine', 'scene tags stripped from ep title');
const yr = parseFilename('Dragnet.1954.S02E04.The.Big.Thief.720p.mp4');
ok(yr && yr.episode === 4 && yr.episodeTitle === 'The Big Thief', 'year-in-name + tags -> clean title');

console.log(`\nfanout tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
