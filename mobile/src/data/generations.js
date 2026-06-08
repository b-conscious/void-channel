// ─── Generation definitions ────────────────────────────────────────────────
// Each generation has: accentColor, category copy, vibe tags, and UI copy.
// The default (Millennial) mirrors the existing amber theme.

export const GENERATION_IDS = ['boomer', 'millennial', 'genz'];

export const GENERATIONS = {
  boomer: {
    id: 'boomer',
    label: 'Boomer',
    range: '1946 – 1964',
    accentColor: '#d4a843',
    accentOnDark: '#000',
    taglines: [
      "They don't make 'em like this anymore.",
      "A trip down memory lane.",
      "Real craftsmanship. Real storytelling.",
      "Back when they took their time.",
      "Television the way it was meant to be.",
    ],
    loadingMessages: [
      "FINDING THE TAPE...",
      "TUNING THE ANTENNA...",
      "REWINDING...",
      "WARMING UP THE SET...",
    ],
    heroEyebrow: '◈ ON THE AIR ◈',
    watchBtnText: 'WATCH THIS',
    searchTitle: 'SEARCH THE COLLECTION',
    searchPlaceholder: '',
    searchHints: [
      'try: americana',
      'try: family values',
      'try: the golden age',
      'try: wholesome',
      'try: classic television',
      'try: the war years',
    ],
    emptySearch: 'Nothing found. Perhaps try a different term.',
    noSignal: '— NOTHING ON THIS CHANNEL —',
    categories: {
      prelinger: { name: 'Industrial & Educational',   subtitle: 'Training films, documentaries, ephemera' },
      horror:    { name: 'Drive-In Classics',          subtitle: 'Horror and science fiction from the B-movie era' },
      computers: { name: 'Computer Chronicles',        subtitle: 'Technology television from the 80s and 90s' },
      cartoons:  { name: 'Classic Cartoons',           subtitle: 'Animation from the early days of television' },
      psa:       { name: 'Civil Defense & Safety',     subtitle: 'Public service films and announcements' },
      noir:      { name: 'Film Noir & Mystery',        subtitle: 'Detective stories from classic Hollywood' },
      scifi:     { name: 'Vintage Science Fiction',    subtitle: 'Space-age films and the future as imagined' },
      ephemeral:   { name: 'Home Movies & Newsreels', subtitle: 'Found footage and family films' },
      commercials:       { name: 'TV Commercials',                  subtitle: 'Vintage advertisements and TV ads' },
      show_betty_boop:   { name: 'Betty Boop',                      subtitle: 'Fleischer Studios — 1930s' },
      show_popeye:       { name: 'Popeye the Sailor',               subtitle: 'Spinach-fueled cartoons' },
      show_looney:       { name: 'Looney Tunes & Merrie Melodies',  subtitle: 'Bugs, Daffy, Porky, etc.' },
      show_woody:        { name: 'Woody Woodpecker',                subtitle: "Walter Lantz's chaos bird" },
      show_mickey:       { name: 'Classic Disney',                  subtitle: 'Mickey, Donald, Goofy — public domain era' },
      show_felix:        { name: 'Felix the Cat',                   subtitle: 'The original cartoon star' },
      show_threestooges: { name: 'The Three Stooges',               subtitle: 'Slapstick shorts' },
      show_twilightzone: { name: 'Twilight Zone-Adjacent',          subtitle: 'Anthology-style retro sci-fi' },
      d1930s:            { name: 'The 1930s',                       subtitle: 'Films from the early sound era' },
      d1940s:    { name: 'The 1940s',                  subtitle: 'The wartime and post-war years' },
      d1950s:    { name: 'The 1950s',                  subtitle: 'The atomic age' },
      d1960s:    { name: 'The 1960s',                  subtitle: 'The sixties' },
      d1970s:    { name: 'The 1970s',                  subtitle: 'The seventies' },
      d1980s:    { name: 'The 1980s',                  subtitle: 'The eighties' },
    },
    vibes: [
      { label: 'VINTAGE' },
      { label: 'CLASSIC' },
      { label: 'ARCHIVED' },
      { label: 'RARE FIND' },
      { label: 'PUBLIC DOMAIN' },
      { label: 'COLLECTOR' },
      { label: 'FROM THE ARCHIVES' },
      { label: 'WORTH PRESERVING' },
    ],
  },

  millennial: {
    id: 'millennial',
    label: 'Millennial',
    range: '1981 – 1996',
    accentColor: '#f5a623',
    accentOnDark: '#000',
    taglines: [
      "90% of this should not have been filmed.",
      "core memory unlocked.",
      "the 90s called and left a voicemail.",
      "sponsored by whoever funded this in 1974.",
      "certified strange.",
    ],
    loadingMessages: [
      "REWINDING TAPE...",
      "ADJUSTING RABBIT EARS...",
      "BUFFERING (1998 STYLE)...",
      "TUNING THE SIGNAL...",
    ],
    heroEyebrow: '◈ ON THE AIR RIGHT NOW ◈',
    watchBtnText: 'WATCH THIS',
    searchTitle: 'FIND SOMETHING WEIRD',
    searchPlaceholder: '',
    searchHints: [
      'try: robots',
      'try: communism',
      'try: cheese',
      'try: the future (1987)',
      'try: teenagers',
      'try: nuclear family',
    ],
    emptySearch: 'Nothing found. The algorithm has failed you.',
    noSignal: '— DEAD AIR ON THIS CHANNEL —',
    categories: {
      prelinger: { name: 'Industrial & Educational Films', subtitle: 'Training films, documentaries, weird workplace stuff' },
      horror:    { name: 'Drive-In Horror',                subtitle: 'Low-budget horror and sci-fi from another era' },
      computers: { name: 'Computer Chronicles',            subtitle: 'Retro tech TV from the 80s and 90s' },
      cartoons:  { name: 'Classic Cartoons',               subtitle: 'Old-school animation from early TV' },
      psa:       { name: 'Civil Defense Films',            subtitle: 'Public safety and educational reels' },
      noir:      { name: 'Film Noir',                      subtitle: 'Detective and mystery from classic Hollywood' },
      scifi:     { name: 'Retro Sci-Fi',                   subtitle: 'Space-age films and the future they imagined' },
      ephemeral:   { name: 'Home Movies & Newsreels',     subtitle: 'Found footage and family films' },
      commercials:       { name: 'TV Commercials',                 subtitle: 'Vintage ads from the broadcast era' },
      show_betty_boop:   { name: 'Betty Boop',                     subtitle: 'Pre-Hays Code Fleischer cartoons' },
      show_popeye:       { name: 'Popeye',                         subtitle: 'Spinach + chaos' },
      show_looney:       { name: 'Looney Tunes',                   subtitle: 'Bugs, Daffy, the gang' },
      show_woody:        { name: 'Woody Woodpecker',               subtitle: "That bird's chaotic" },
      show_mickey:       { name: 'Classic Disney',                 subtitle: 'Mickey, Donald, Goofy (public domain era)' },
      show_felix:        { name: 'Felix the Cat',                  subtitle: 'Pre-everyone-else cartoon star' },
      show_threestooges: { name: 'The Three Stooges',              subtitle: 'Original slapstick comedy' },
      show_twilightzone: { name: 'Twilight Zone-Adjacent',         subtitle: 'Anthology weirdness from the era' },
      d1930s:            { name: 'The 1930s',                      subtitle: 'Early sound era cinema' },
      d1940s:    { name: 'The 1940s',                      subtitle: 'Wartime and post-war film' },
      d1950s:    { name: 'The 1950s',                      subtitle: 'The atomic age' },
      d1960s:    { name: 'The 1960s',                      subtitle: 'The sixties on film' },
      d1970s:    { name: 'The 1970s',                      subtitle: 'Peak weird decade' },
      d1980s:    { name: 'The 1980s',                      subtitle: 'The MTV-era catalog' },
    },
    vibes: [
      { label: 'VINTAGE' },
      { label: 'RETRO' },
      { label: 'CLASSIC' },
      { label: 'ARCHIVED' },
      { label: 'TIME CAPSULE' },
      { label: 'OLDIE' },
      { label: 'PUBLIC DOMAIN' },
      { label: 'THROWBACK' },
    ],
  },

  genz: {
    id: 'genz',
    label: 'Gen Z',
    range: '1997 – 2012',
    accentColor: '#b2ff3e',
    accentOnDark: '#000',
    taglines: [
      "ngl this shouldn't exist but here we are.",
      "the internet archive said no notes.",
      "POV: you found something cursed.",
      "fr fr who approved this",
      "no thoughts just vibes (1963)",
    ],
    loadingMessages: [
      "FINDING THE TAPE...",
      "BUFFERING FR FR...",
      "LOADING (PLEASE)...",
      "ONE SEC BESTIE...",
    ],
    heroEyebrow: 'POV: ON THE AIR',
    watchBtnText: 'WATCH THIS (TRUST)',
    searchTitle: 'find something weird',
    searchPlaceholder: '',
    searchHints: [
      'try: robots fr',
      'try: understood the assignment',
      'try: no context',
      'try: 1970s vibes',
      'try: what even is this',
      'try: unhinged',
    ],
    emptySearch: "ngl this search flopped. try something else bestie.",
    noSignal: '— dead air. nothing here. —',
    categories: {
      prelinger: { name: 'old industrial films',  subtitle: 'training films & workplace stuff from way back' },
      horror:    { name: 'drive-in horror',       subtitle: 'low budget scares from another era' },
      computers: { name: 'computer chronicles',   subtitle: 'tech tv from when computers were new' },
      cartoons:  { name: 'old cartoons',          subtitle: 'classic animation from early tv' },
      psa:       { name: 'civil defense films',   subtitle: 'public safety stuff from the cold war era' },
      noir:      { name: 'film noir',             subtitle: 'detective movies, everyone smokes' },
      scifi:     { name: 'retro sci-fi',          subtitle: 'what people thought the future would look like' },
      ephemeral:   { name: 'home movies',         subtitle: 'random people filming random stuff' },
      commercials:       { name: 'old tv ads',              subtitle: 'when commercials were like 30 seconds' },
      show_betty_boop:   { name: 'betty boop',              subtitle: "fr the original it-girl (1930)" },
      show_popeye:       { name: 'popeye',                  subtitle: 'spinach guy, sailor era' },
      show_looney:       { name: 'looney tunes',            subtitle: 'bugs & friends' },
      show_woody:        { name: 'woody woodpecker',        subtitle: 'unhinged bird energy' },
      show_mickey:       { name: 'classic disney',          subtitle: 'mickey before he was corporate' },
      show_felix:        { name: 'felix the cat',           subtitle: 'literally the first famous cartoon' },
      show_threestooges: { name: 'the three stooges',       subtitle: 'original slapstick' },
      show_twilightzone: { name: 'twilight zone-adjacent',  subtitle: 'old anthology weirdness' },
      d1930s:            { name: 'the 1930s',               subtitle: 'films from like a hundred years ago' },
      d1940s:    { name: 'the 1940s',             subtitle: 'wartime cinema' },
      d1950s:    { name: 'the 1950s',             subtitle: 'atomic age, suburbs, doom' },
      d1960s:    { name: 'the 1960s',             subtitle: 'swinging sixties' },
      d1970s:    { name: 'the 1970s',             subtitle: 'peak weird decade' },
      d1980s:    { name: 'the 1980s',             subtitle: 'neon era' },
    },
    vibes: [
      { label: 'vintage' },
      { label: 'retro' },
      { label: 'old' },
      { label: 'archive' },
      { label: 'classic' },
      { label: 'time capsule' },
      { label: 'pre-internet' },
      { label: 'throwback' },
    ],
  },
};

// ─── Ranks ─────────────────────────────────────────────────────────────────

export const RANKS = [
  { id: 'wanderer',  label: 'Wanderer',          minXP: 0,    maxXP: 99 },
  { id: 'explorer',  label: 'Explorer',           minXP: 100,  maxXP: 299 },
  { id: 'digger',    label: 'Digger',             minXP: 300,  maxXP: 699 },
  { id: 'archivist', label: 'Archivist',          minXP: 700,  maxXP: 1499 },
  { id: 'curator',   label: 'Curator',            minXP: 1500, maxXP: 2999 },
  { id: 'keeper',    label: 'Keeper of Records',  minXP: 3000, maxXP: Infinity },
];

export function getRank(xp) {
  return RANKS.find(r => xp >= r.minXP && xp <= r.maxXP) || RANKS[0];
}

export function getNextRank(xp) {
  const idx = RANKS.findIndex(r => xp >= r.minXP && xp <= r.maxXP);
  return RANKS[idx + 1] || null;
}

// ─── Daily Bounties ────────────────────────────────────────────────────────

const BOUNTY_DECADES = [1920, 1930, 1940, 1950, 1960, 1970, 1980];
const BOUNTY_TOPICS  = ['space', 'cars', 'robots', 'science', 'nature', 'animals', 'music', 'cooking', 'dancing', 'history'];
const BOUNTY_CATS    = ['prelinger', 'horror', 'computers', 'cartoons', 'psa', 'noir', 'scifi', 'ephemeral'];

function seeded(seed, max) {
  // Simple deterministic pseudo-random from seed
  const x = Math.sin(seed) * 10000;
  return Math.abs(Math.floor((x - Math.floor(x)) * max));
}

export function getDailyBounties(dateStr) {
  const seed = parseInt((dateStr || '').replace(/-/g, ''), 10) || 20240101;
  const decade = BOUNTY_DECADES[seeded(seed + 1, BOUNTY_DECADES.length)];
  const topic  = BOUNTY_TOPICS[seeded(seed + 2, BOUNTY_TOPICS.length)];
  const catId  = BOUNTY_CATS[seeded(seed + 3, BOUNTY_CATS.length)];

  return [
    {
      id: `decade_${dateStr}`,
      type: 'decade',
      value: decade,
      label: `Watch something from the ${decade}s`,
      xp: 50,
    },
    {
      id: `topic_${dateStr}`,
      type: 'topic',
      value: topic,
      label: `Find a film about "${topic}"`,
      xp: 50,
    },
    {
      id: `rare_${dateStr}`,
      type: 'rare',
      value: 5000,
      label: 'Unearth a hidden gem (< 5k views)',
      xp: 50,
    },
  ];
}

export function checkBounty(bounty, item, categoryId) {
  if (!item) return false;
  switch (bounty.type) {
    case 'decade':
      return item.year && Math.floor(parseInt(item.year, 10) / 10) * 10 === bounty.value;
    case 'topic':
      return (item.title + ' ' + (item.description || '')).toLowerCase().includes(bounty.value);
    case 'rare':
      return typeof item.downloads === 'number' && item.downloads < bounty.value;
    case 'category':
      return categoryId === bounty.value;
    default:
      return false;
  }
}
