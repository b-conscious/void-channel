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
  sort: c.sort || 'downloads desc',
  // Flags the Void Backend acts on at request time (carried through, not interpreted here)
  recognizable: !!c.recognizable,
  diversify: !!c.diversify,
  mature: !!c.mature,
  exclude_nsfw: c.mature ? false : true,
  exclude_news: true,
  active: true,
}));

const AUDIO = [
  { id: 'shellac', name: 'The Shellac Stack', subtitle: 'Crackle, hiss, and songs that outlived the singers', query: 'collection:(georgeblood) AND mediatype:(audio)' },
  { id: 'tapers', name: "The Taper's Section", subtitle: 'Every show someone loved enough to record', query: 'collection:(etree) AND mediatype:(audio)' },
  { id: 'theater_of_mind', name: 'Theater of the Mind', subtitle: 'Stories told to a room full of ears', query: 'collection:(oldtimeradio) AND mediatype:(audio)' },
  { id: 'netlabel', name: 'Net Label Underground', subtitle: 'Music released free on purpose', query: 'collection:(netlabels) AND mediatype:(audio)' },
  { id: 'gospel', name: 'The Amen Corner', subtitle: 'Sacred music, public domain, yours to sing', query: 'subject:(gospel OR spiritual) AND mediatype:(audio)' },
].map((c) => ({ type: 'audio', group: 'audio', sort: 'downloads desc', exclude_nsfw: true, exclude_news: false, active: true, ...c }));

const GAMES = [
  { id: 'quarter_eaters', name: 'Quarter Eaters', subtitle: 'The machines that ate your allowance', query: 'collection:(internetarcade)' },
  { id: 'dos_box', name: 'Before Windows', subtitle: 'When you typed to start a game', query: 'collection:(softwarelibrary_msdos_games)' },
  { id: 'console_atari', name: 'The 2600 Vault', subtitle: '128 bytes of RAM and infinite imagination', query: 'collection:(atari_2600_library)' },
].map((c) => ({ type: 'game', group: 'games', sort: 'downloads desc', exclude_nsfw: true, exclude_news: false, active: true, ...c }));

const TEXTS = [
  { id: 'pulp', name: 'The Pulp Rack', subtitle: 'Lurid covers, disposable stories, somehow immortal', query: 'collection:(pulpmagazinearchive) AND mediatype:(texts)' },
  { id: 'sheet_music', name: 'The Music Stand', subtitle: 'Notes on paper before streaming', query: 'collection:(sheetmusic) AND mediatype:(texts)' },
  { id: 'hymnal', name: 'The Hymnal Shelf', subtitle: 'Public domain hymnals, free to sing', query: 'subject:(hymnal OR hymns) AND mediatype:(texts)' },
].map((c) => ({ type: 'text', group: 'texts', sort: 'downloads desc', exclude_nsfw: true, exclude_news: false, active: true, ...c }));

const ALL = [...VIDEO, ...AUDIO, ...GAMES, ...TEXTS];

function list(type) {
  return type ? ALL.filter((c) => c.type === type) : ALL;
}
function get(id) {
  return ALL.find((c) => c.id === id) || null;
}

module.exports = { ALL, list, get };
