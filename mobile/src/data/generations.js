// ─── VOID identity ─────────────────────────────────────────────────────────
// Collapsed from the old boomer/millennial/genz "signal" mechanics (B 2026-06-28):
// one identity for everyone, the wall always leans newest, everything older is
// reachable via search / void hunting. The generation PICKER is gone; this single
// profile carries the voice, accent, copy, and vibe labels app-wide. We keep the
// GENERATIONS map + GENERATION_IDS export surface (one key: 'void') so existing
// consumers (useGeneration().gen, gen.accentColor, gen.vibes, etc.) keep working
// untouched. RANKS + bounties below are identity-agnostic and unchanged.

const VOID = {
  id: 'void',
  label: 'VOID',
  range: '',
  accentColor: '#f5a623',
  accentOnDark: '#000',
  // Row display priority — leans newest/popular first; older decades sink to the
  // bottom (and live mostly in search now, not the default wall).
  categoryPriority: [
    'anime', 'horror', 'comedy', 'scifi', 'music_video', 'cartoons',
    'documentary', 'conspiracy', 'oddities', 'abstract', 'violence', 'amateur',
    'computers', 'noir', 'western', 'public_access', 'blaxploitation', 'foreign',
    'psa', 'commercials', 'newsreels', 'travelogues', 'ephemeral', 'prelinger',
    'd2020s', 'd2010s', 'd2000s', 'd1990s', 'd1980s', 'd1970s', 'd1960s', 'd1950s',
  ],
  taglines: [
    "Before AI slop, there was human creativity.",
    "No algorithm would have recommended this.",
    "The original generators.",
    "Generating since 1895.",
    "Every frame, a human decision.",
  ],
  loadingMessages: [
    "FINDING THE TAPE...",
    "TUNING THE SIGNAL...",
    "REWINDING...",
    "WARMING UP THE SET...",
  ],
  heroEyebrow: '◈ ON THE AIR ◈',
  watchBtnText: 'WATCH',
  searchTitle: 'FIND SOMETHING WEIRD',
  searchPlaceholder: '',
  searchHints: [
    'try: robots',
    'try: the future (1987)',
    'try: nuclear family',
    'try: 1970s vibes',
    'try: what even is this',
    'try: unhinged',
  ],
  emptySearch: 'Nothing found. The algorithm has failed you.',
  noSignal: '— DEAD AIR ON THIS CHANNEL —',
  categories: {
    ephemeral:     { name: 'Found Footage & Home Movies',  subtitle: "Somebody's past life on 8mm" },
    prelinger:     { name: 'Industrial & Educational',     subtitle: 'Training films, documentaries, weird workplace stuff' },
    oddities:      { name: 'Oddities & Curiosities',      subtitle: 'Uncategorizable things that someone filmed' },
    religious:     { name: 'Religious & Devotional',       subtitle: 'Church basements, missionary reels, moral lessons' },
    medical:       { name: 'Medical & Health Films',       subtitle: 'Clinical training, health propaganda, body horror' },
    amateur:       { name: 'Amateur & Underground',        subtitle: 'No-budget filmmakers, outsider cinema' },
    psa:           { name: 'Civil Defense Films',          subtitle: 'What to do when the world ends' },
    commercials:   { name: 'TV Commercials',               subtitle: "Vintage ads for things that don't exist anymore" },
    travelogues:   { name: 'Travelogues & World Films',    subtitle: 'How other places looked before Google' },
    computers:     { name: 'Computer Chronicles',          subtitle: 'Retro tech TV from the 80s and 90s' },
    cartoons:      { name: 'Classic Cartoons',             subtitle: 'Old-school animation from early TV' },
    horror:        { name: 'Drive-In Horror',              subtitle: 'Low-budget horror and sci-fi from another era' },
    scifi:         { name: 'Retro Sci-Fi',                 subtitle: 'Space-age films and the future they imagined' },
    noir:          { name: 'Film Noir',                    subtitle: 'Detective and mystery from classic Hollywood' },
    newsreels:     { name: 'Newsreels & News Clips',       subtitle: 'How people learned what happened' },
    educational_tv: { name: 'Educational Television',      subtitle: 'The stuff they wheeled the TV cart in for' },
    // Deep cuts
    deep_driver_ed:      { name: "Driver's Ed Films",           subtitle: 'Signal 30 and the scare-them-straight school' },
    deep_mental_hygiene: { name: 'Mental Hygiene Films',        subtitle: "Are you popular? Let's find out." },
    deep_dating:         { name: 'Dating & Etiquette',          subtitle: 'How to behave at the sock hop' },
    deep_hygiene:        { name: 'Hygiene & Health',            subtitle: 'Personal cleanliness was serious business' },
    deep_propaganda:     { name: 'Cold War Propaganda',         subtitle: 'Duck and cover, red scare, civil defense' },
    deep_atomic:         { name: 'Atomic Age',                  subtitle: 'Nuclear paranoia and fallout shelters' },
    deep_telephone:      { name: 'Bell System Films',           subtitle: 'AT&T made hundreds of these' },
    deep_farming:        { name: 'Farm Life & Agriculture',     subtitle: 'USDA films and tractor propaganda' },
    deep_cigarette_ads:  { name: 'Cigarette Ads',              subtitle: 'Doctors recommend this brand' },
    deep_food_ads:       { name: 'Food & Drink Ads',           subtitle: 'Jello molds and TV dinners' },
    deep_creature:       { name: 'Creature Features',          subtitle: 'Giant ants, swamp things, mutants' },
    deep_camp:           { name: 'Camp & B-Movies',            subtitle: 'So bad it loops back to good' },
    deep_space:          { name: 'Space Adventures',           subtitle: 'Rockets, aliens, flying saucers' },
    deep_cartoon_silly:  { name: 'Silly Symphonies & Shorts',  subtitle: 'Pre-TV animated shorts' },
    deep_vampire:        { name: 'Vampires & Ghouls',         subtitle: 'Dracula, Nosferatu, the undead' },
    deep_toy_ads:        { name: 'Toy Commercials',            subtitle: 'Action figures, dolls, board games' },
    // Shows
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
    { label: 'HUMAN-MADE' },
    { label: 'ARCHIVED' },
    { label: 'TIME CAPSULE' },
    { label: 'PRE-ALGORITHM' },
    { label: 'PUBLIC DOMAIN' },
    { label: 'THROWBACK' },
    { label: 'GENERATING SINCE 1895' },
    { label: 'WORTH PRESERVING' },
  ],
};

// One id now. Aliases keep any stored '@void_generation' value (boomer/millennial/genz)
// resolving to VOID instead of falling over.
export const GENERATION_IDS = ['void'];
export const GENERATIONS = {
  void: VOID,
  boomer: VOID,
  millennial: VOID,
  genz: VOID,
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
