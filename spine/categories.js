// Spine category registry. Video categories come from the existing battle-tested archive.js
// CATEGORIES array (required directly, zero duplication; JOB_1 may move the file physically).
// Audio, game, and text seeds are defined here. B rewrites names and subtitles.
const archive = require('../backend/archive.js');

const VIDEO = archive.CATEGORIES.map((c) => ({
  id: c.id,
  type: 'video',
  name: c.name,
  subtitle: c.subtitle || '',
  group: c.group || 'type',
  query: c.query,
  // sort is passed through ONLY when authored. The backend's eraExempt treats cat.sort as
  // "this row's identity is a ranking" (Most Popular); default-filling it here exempted the
  // ENTIRE wall from the era lean through the /wall passthrough (B caught it on genz
  // feature films, 2026-06-11). The spine's own sync never reads cat.sort.
  ...(c.sort ? { sort: c.sort } : {}),
  // Flags the Void Backend acts on at request time (carried through, not interpreted here)
  recognizable: !!c.recognizable,
  diversify: !!c.diversify,
  mature: !!c.mature,
  exclude_nsfw: c.mature ? false : true,
  exclude_news: true,
  active: true,
}));

// IA-collection crates: every collection id below was validated against live counts on
// 2026-06-11 (film_noir, comedy_films, nes_library, gameboy_library do NOT exist and were cut).
const AUDIO = [
  { id: 'shellac', name: 'The Shellac Stack', subtitle: 'Crackle, hiss, and songs that outlived the singers', query: 'collection:(georgeblood) AND mediatype:(audio)' },
  // Live-concert items use mediatype:(etree), NOT audio. The audio clause silently zeroed both
  // taper crates from JOB_0 until the dead crate exposed it.
  { id: 'tapers', name: "The Taper's Section", subtitle: 'Every show someone loved enough to record', query: 'collection:(etree) AND mediatype:(etree)' },
  { id: 'theater_of_mind', name: 'Theater of the Mind', subtitle: 'Stories told to a room full of ears', query: 'collection:(oldtimeradio) AND mediatype:(audio)' },
  { id: 'netlabel', name: 'Net Label Underground', subtitle: 'Music released free on purpose', query: 'collection:(netlabels) AND mediatype:(audio)' },
  { id: 'gospel', name: 'The Amen Corner', subtitle: 'Sacred music, public domain, yours to sing', query: 'subject:(gospel OR spiritual) AND mediatype:(audio)' },
  { id: 'dead', name: '2,000 Nights of the Dead', subtitle: 'The longest setlist in history', query: 'collection:(GratefulDead) AND mediatype:(etree)' },
  { id: 'unlocked', name: 'The Unlocked Vault', subtitle: 'Songs freed from their masters', query: 'collection:(unlockedrecordings) AND mediatype:(audio)' },
  { id: 'radio_air', name: 'Dead Air Resurrected', subtitle: 'Broadcasts nobody saved except someone did', query: 'collection:(radioprograms) AND mediatype:(audio)' },
  { id: 'audiobooks', name: 'Books Read Aloud', subtitle: 'Volunteers reading the public domain to you', query: 'collection:(librivoxaudio) AND mediatype:(audio)' },
  { id: 'revival', name: 'The Revival Tent', subtitle: 'Sermons, choirs, and the long tradition of belief out loud', query: 'collection:(audio_religion) AND mediatype:(audio)' },
].map((c) => ({ type: 'audio', group: 'audio', exclude_nsfw: true, exclude_news: false, active: true, ...c }));

const GAMES = [
  { id: 'quarter_eaters', name: 'Quarter Eaters', subtitle: 'The machines that ate your allowance', query: 'collection:(internetarcade)' },
  { id: 'dos_box', name: 'Before Windows', subtitle: 'When you typed to start a game', query: 'collection:(softwarelibrary_msdos_games)' },
  { id: 'console_atari', name: 'The 2600 Vault', subtitle: '128 bytes of RAM and infinite imagination', query: 'collection:(atari_2600_library)' },
  { id: 'console_genesis', name: 'Genesis Block', subtitle: 'Blast processing was a lie but the games were real', query: 'collection:(sega_genesis_library)' },
  { id: 'living_room', name: 'The Console Living Room', subtitle: 'Every cartridge from the carpet era', query: 'collection:(consolelivingroom)' },
  { id: 'pc_classics', name: 'Shareware and Floppies', subtitle: 'PC games from the install-disk decades', query: 'collection:(classicpcgames)' },
  { id: 'apple_ii', name: 'The Apple ][ Shelf', subtitle: 'Beige boxes, green screens, pure invention', query: 'collection:(softwarelibrary_apple)' },
].map((c) => ({ type: 'game', group: 'games', exclude_nsfw: true, exclude_news: false, active: true, ...c }));

const TEXTS = [
  { id: 'pulp', name: 'The Pulp Rack', subtitle: 'Lurid covers, disposable stories, somehow immortal', query: 'collection:(pulpmagazinearchive) AND mediatype:(texts)' },
  { id: 'sheet_music', name: 'The Music Stand', subtitle: 'Notes on paper before streaming', query: 'collection:(sheetmusic) AND mediatype:(texts)' },
  { id: 'hymnal', name: 'The Hymnal Shelf', subtitle: 'Public domain hymnals, free to sing', query: 'subject:(hymnal OR hymns) AND mediatype:(texts)' },
  { id: 'gutenberg', name: 'The Gutenberg Shelf', subtitle: 'The books that belong to everyone now', query: 'collection:(gutenberg) AND mediatype:(texts)' },
  { id: 'magazine_rack', name: 'The Magazine Rack', subtitle: 'Every waiting room in history, preserved', query: 'collection:(magazine_rack) AND mediatype:(texts)' },
  { id: 'comics_longbox', name: 'The Comics Longbox', subtitle: 'Capes, crooks, and four-color paper', query: 'collection:(comics) AND mediatype:(texts)' },
  { id: 'americana', name: 'Deep Americana', subtitle: 'The national attic, unsorted and bottomless', query: 'collection:(americana) AND mediatype:(texts)' },
].map((c) => ({ type: 'text', group: 'texts', exclude_nsfw: true, exclude_news: false, active: true, ...c }));

// VIDEO additions from IA's own taxonomy (validated counts: vhsvault 116k, feature_films 28k,
// SciFi_Horror 957, television 735k). These join the 81 migrated crates.
const VIDEO_IA = [
  // B's find 2026-06-11, validated live (1587 items, 96% year>=1980): PBS Kids
  // interstitials, bumpers, and segments. Kid-targeted by construction; on both kids
  // allowlists (backend/server.js + the HomeScreen render belt).
  { id: 'pbs_kids', name: 'PBS Kids Rewind', subtitle: 'Bumpers, segments, and the channel between the shows', query: 'creator:("PBS Kids") AND mediatype:(movies)' },
  { id: 'vhs_vault', name: 'The VHS Vault', subtitle: 'Tracking lines, tape hiss, and everything someone kept', query: 'collection:(vhsvault) AND mediatype:(movies)' },
  { id: 'ia_features', name: 'The Feature Vault', subtitle: 'Full length films from the open stacks', query: 'collection:(feature_films) AND mediatype:(movies)' },
  { id: 'scifi_horror_ia', name: 'Saucers and Screams', subtitle: 'The double bill that never ended', query: 'collection:(SciFi_Horror) AND mediatype:(movies)' },
  { id: 'tv_static', name: 'The Television Static', subtitle: 'Broadcast leftovers from the antenna age', query: 'collection:(television) AND mediatype:(movies)' },
].map((c) => ({ type: 'video', group: 'type', recognizable: false, diversify: true, mature: false, exclude_nsfw: true, exclude_news: true, active: true, ...c }));

// JOB_13 multi-source crates. cat.source routes sync through spine/adapters/<source>.js.
// NASA: keyless, PD guaranteed, the adapter template. Names are placeholders, B rewrites.
const VIDEO_NASA = [
  { id: 'nasa_missions', name: 'Mission Footage', subtitle: 'NASA pressed record on everything', source: 'nasa', query: 'mission launch' },
  { id: 'nasa_apollo', name: 'The Apollo Tapes', subtitle: 'The moon, as broadcast', source: 'nasa', query: 'apollo' },
].map((c) => ({ type: 'video', group: 'type', recognizable: false, diversify: false, mature: false, exclude_nsfw: false, exclude_news: false, active: true, ...c }));

// Commons crates (JOB_13 slice 2, B's ruling: in, with the iOS notice instead of a gate).
// Queries validated live 2026-06-11: timelapse 4516 hits, aerial drone 2614.
const VIDEO_COMMONS = [
  { id: 'commons_timelapse', name: 'Time Compressed', subtitle: 'Hours folded into seconds', source: 'commons', query: 'timelapse' },
  { id: 'commons_aerial', name: 'The Drone Age', subtitle: 'The world from above, license-free', source: 'commons', query: 'aerial drone' },
].map((c) => ({ type: 'video', group: 'type', recognizable: false, diversify: false, mature: false, exclude_nsfw: false, exclude_news: false, active: true, ...c }));

// The gems crate: Wikidata-verified public domain films with IA ids, ranked by notability.
// This is the recency ruling's home for pre-1975: curated gems, not ambient default.
const GEMS = [
  // sort is AUTHORED here on purpose: the gems crate is era-exempt by identity (it IS the
  // curated old shelf; the genz floor must never gut it).
  { id: 'gems_wikidata', name: 'Classic Gems and Cult', subtitle: 'The old stuff that earned its place', source: 'wikidata', query: 'pd-films-with-ia-id', type: 'video', group: 'type', sort: 'downloads desc', recognizable: true, diversify: false, mature: false, exclude_nsfw: false, exclude_news: false, active: true },
];

// SERIES SEEDS (B's catalog buildout): spine/series-seeds.json names become show crates that
// sync pools and grouping turns into catalog series. wall:false keeps them OFF the browse
// wall (catalog + rails destinations only). Fail-soft: a broken file seeds nothing.
let VIDEO_SEEDS = [];
try {
  const seeds = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'series-seeds.json'), 'utf8'));
  VIDEO_SEEDS = (seeds.series || []).map((s) => {
    const name = typeof s === 'string' ? s : s.name;
    const key = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) return null;
    return {
      id: `show_seed_${key}`, name, subtitle: 'From the series catalog',
      query: (typeof s === 'object' && s.query) || `title:("${name}") AND mediatype:(movies)`,
      type: 'video', group: 'show', wall: false, recognizable: false, diversify: false,
      mature: false, exclude_nsfw: true, exclude_news: true, active: true,
    };
  }).filter(Boolean);
} catch (e) { /* no seeds file or bad JSON — seed nothing */ }

const ALL = [...VIDEO, ...VIDEO_IA, ...VIDEO_NASA, ...VIDEO_COMMONS, ...GEMS, ...VIDEO_SEEDS, ...AUDIO, ...GAMES, ...TEXTS];

function list(type) {
  return type ? ALL.filter((c) => c.type === type) : ALL;
}
function get(id) {
  return ALL.find((c) => c.id === id) || null;
}

module.exports = { ALL, list, get };
