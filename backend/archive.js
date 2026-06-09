const fetch = require("node-fetch");

const BASE = "https://archive.org";
const SEARCH_URL = `${BASE}/advancedsearch.php`;
const META_URL = (id) => `${BASE}/metadata/${id}`;
const THUMB_URL = (id) => `${BASE}/services/img/${id}`;
const FILE_URL = (id, file) => `${BASE}/download/${id}/${encodeURIComponent(file)}`;

// Exclude adult/mature/sex-ed content from all regular category & search queries.
// Anything caught here lives in the dedicated "Human Sexuality Through Time" category instead.
// Leading space so it's safe to concatenate directly: query + NSFW_EXCLUDE
const NSFW_EXCLUDE = ' ' + [
  'NOT collection:(stag_films OR exploitation_films)',
  'NOT subject:(erotic OR erotica OR stag OR nudity OR nude OR pornograph*',
  '  OR "blue film" OR "adults only" OR "adult film" OR burlesque OR "pin-up"',
  '  OR "strip tease" OR striptease OR "sex education" OR "sex hygiene"',
  '  OR "venereal disease" OR "social hygiene" OR prostitution',
  '  OR "sexual behavior" OR "human sexuality" OR "birth control"',
  '  OR "family planning" OR reproduction OR "sex instruction"',
  '  OR risque OR boudoir OR "girlie" OR pinup OR cheesecake',
  '  OR "peep show" OR "burlesque show" OR provocative)',
].join(' ');

const CATEGORIES = [
  // ── By type — ordered obscure-first, mainstream later ───────────────────
  // Lead with the weird, forgotten, "what even is this" content
  {
    id: "ephemeral",
    group: "type",
    name: "Found Footage & Home Movies",
    subtitle: "Somebody's past life on 8mm",
    query: "collection:(home_movies) AND mediatype:(movies)",
  },
  {
    id: "prelinger",
    group: "type",
    name: "Industrial & Educational",
    subtitle: "Training films, workplace oddities, forgotten ephemera",
    query: "collection:(prelinger) AND mediatype:(movies)",
  },
  {
    id: "oddities",
    group: "type",
    name: "Oddities & Curiosities",
    subtitle: "Uncategorizable things that someone filmed",
    query: '(subject:(oddity OR curiosity OR "freak" OR unusual OR bizarre OR strange OR weird OR experimental) OR collection:(ephemeral)) AND mediatype:(movies) AND NOT collection:(prelinger)',
  },
  {
    id: "religious",
    group: "type",
    name: "Religious & Devotional Films",
    subtitle: "Church basements, missionary reels, moral lessons",
    query: '(subject:(religious OR church OR "sunday school" OR missionary OR sermon OR gospel OR bible OR devotional) OR collection:(religious_films)) AND mediatype:(movies)',
  },
  {
    id: "medical",
    group: "type",
    name: "Medical & Health Films",
    subtitle: "Clinical training, surgical footage, health propaganda",
    query: '(subject:(medical OR surgical OR "mental health" OR hospital OR disease OR anatomy OR "health education" OR nursing) OR collection:(medicalheritagelibrary)) AND mediatype:(movies)',
  },
  {
    id: "amateur",
    group: "type",
    name: "Amateur & Underground",
    subtitle: "No-budget filmmakers, outsider art, garage cinema",
    query: '(subject:(amateur OR "home movie" OR underground OR experimental OR "student film" OR "independent film" OR "avant garde") OR collection:(amateur_films)) AND mediatype:(movies)',
  },
  {
    id: "psa",
    group: "type",
    name: "Civil Defense & Safety Films",
    subtitle: "What to do when the world ends",
    query: 'collection:(prelinger) AND subject:(safety OR "civil defense" OR warning OR danger OR survival) AND mediatype:(movies)',
  },
  {
    id: "commercials",
    group: "type",
    name: "TV Commercials",
    subtitle: "Vintage ads for things that don't exist anymore",
    query: '(collection:(classic_tv_commercials) OR subject:(commercial OR advertisement OR "tv ad" OR ads OR "tv commercial")) AND mediatype:(movies)',
  },
  {
    id: "travelogues",
    group: "type",
    name: "Travelogues & World Films",
    subtitle: "How other places looked before you could Google them",
    query: '(subject:(travelogue OR "travel film" OR "around the world" OR expedition OR journey OR foreign) OR collection:(travelfilms)) AND mediatype:(movies)',
  },
  {
    id: "computers",
    group: "type",
    name: "Computer Chronicles",
    subtitle: "Retro tech TV from the 80s and 90s",
    query: "collection:(computerchronicles) AND mediatype:(movies)",
  },
  {
    id: "cartoons",
    group: "type",
    name: "Classic Cartoons",
    subtitle: "Animation from the early days of TV",
    query: "collection:(classic_cartoons) AND mediatype:(movies)",
  },
  {
    id: "horror",
    group: "type",
    name: "Drive-In Horror",
    subtitle: "Low-budget horror and sci-fi",
    query: 'collection:(feature_films) AND subject:(horror OR "science fiction") AND mediatype:(movies)',
  },
  {
    id: "scifi",
    group: "type",
    name: "Retro Sci-Fi",
    subtitle: "Space-age films and the future as imagined",
    query: 'subject:("science fiction" OR "atomic age" OR "space") AND mediatype:(movies) AND collection:(feature_films OR prelinger)',
  },
  {
    id: "noir",
    group: "type",
    name: "Film Noir",
    subtitle: "Detective and mystery from classic Hollywood",
    query: "(collection:(Film_Noir) OR subject:(noir OR detective)) AND mediatype:(movies)",
  },
  {
    id: "newsreels",
    group: "type",
    name: "Newsreels & News Clips",
    subtitle: "How people learned what happened before TV news",
    query: '(collection:(newsreels) OR collection:(news) OR subject:(newsreel OR "news clip" OR "news film" OR "march of time")) AND mediatype:(movies)',
  },
  {
    id: "educational_tv",
    group: "type",
    name: "Educational Television",
    subtitle: "The stuff they wheeled the TV cart in for",
    query: '(subject:("educational television" OR "classroom film" OR "school" OR "instructional") OR collection:(classic_tv)) AND mediatype:(movies) AND NOT collection:(prelinger)',
  },
  {
    id: "mature",
    group: "type",
    name: "⚠ Human Sexuality Through Time",
    subtitle: "Sex ed, burlesque, social hygiene, stag reels — how every era talked about bodies",
    query: [
      '(collection:(stag_films OR exploitation_films)',
      'OR subject:(erotic OR stag OR "pin-up" OR burlesque OR "sex education"',
      '  OR "sex hygiene" OR "venereal disease" OR "social hygiene"',
      '  OR "sexual behavior" OR "human sexuality" OR "birth control"',
      '  OR "family planning" OR reproduction OR "sex instruction"',
      '  OR nudity OR nude OR striptease OR "strip tease"',
      '  OR "adults only" OR risque OR provocative OR "peep show"',
      '  OR cheesecake OR pinup OR boudoir))',
      'AND mediatype:(movies)',
    ].join(' '),
    mature: true,
  },

  // ── Deep cuts — granular sub-categories for rabbit-holers ──────
  // Obscure deep cuts first
  {
    id: "deep_driver_ed",
    group: "deep",
    parent: "prelinger",
    name: "Driver's Ed & Traffic Safety",
    subtitle: "Signal 30 and the scare-them-straight school of driving",
    query: 'collection:(prelinger) AND subject:("driver education" OR "traffic safety" OR driving OR "automobile safety" OR highway) AND mediatype:(movies)',
  },
  {
    id: "deep_mental_hygiene",
    group: "deep",
    parent: "prelinger",
    name: "Mental Hygiene Films",
    subtitle: "Are you popular? Do you have friends? Let's fix that.",
    query: 'collection:(prelinger) AND subject:("mental hygiene" OR "social guidance" OR "emotional health" OR adjustment OR personality) AND mediatype:(movies)',
  },
  {
    id: "deep_dating",
    group: "deep",
    parent: "prelinger",
    name: "Dating & Etiquette",
    subtitle: "How to behave at the sock hop",
    query: 'collection:(prelinger) AND subject:(dating OR etiquette OR manners OR "social guidance" OR courtship) AND mediatype:(movies)',
  },
  {
    id: "deep_hygiene",
    group: "deep",
    parent: "prelinger",
    name: "Hygiene & Health Films",
    subtitle: "Personal cleanliness was serious business",
    query: 'collection:(prelinger) AND subject:(hygiene OR health OR "personal hygiene" OR cleanliness OR grooming) AND mediatype:(movies)',
  },
  {
    id: "deep_propaganda",
    group: "deep",
    parent: "psa",
    name: "Cold War Propaganda",
    subtitle: "Duck and cover, red scare, civil defense",
    query: 'collection:(prelinger) AND subject:("cold war" OR propaganda OR "duck and cover" OR "red scare" OR communism OR "civil defense") AND mediatype:(movies)',
  },
  {
    id: "deep_atomic",
    group: "deep",
    parent: "scifi",
    name: "Atomic Age",
    subtitle: "Nuclear paranoia, fallout shelters, the bomb",
    query: 'subject:("atomic" OR "nuclear" OR "atomic age" OR "hydrogen bomb" OR radiation OR fallout) AND mediatype:(movies)',
  },
  {
    id: "deep_telephone",
    group: "deep",
    parent: "prelinger",
    name: "Telephone & Bell System",
    subtitle: "AT&T made hundreds of films about calling people",
    query: '(subject:(telephone OR "bell system" OR "bell telephone" OR "AT&T" OR "long distance") OR creator:("Bell Telephone")) AND mediatype:(movies)',
  },
  {
    id: "deep_farming",
    group: "deep",
    parent: "prelinger",
    name: "Agriculture & Farm Life",
    subtitle: "USDA films, county fairs, and tractor propaganda",
    query: '(subject:(agriculture OR farming OR "farm life" OR crop OR livestock OR USDA OR "county fair" OR rural) OR collection:(usda)) AND mediatype:(movies)',
  },
  {
    id: "deep_cigarette_ads",
    group: "deep",
    parent: "commercials",
    name: "Cigarette & Tobacco Ads",
    subtitle: "Doctors recommend this brand",
    query: '(subject:(cigarette OR tobacco OR smoking) AND subject:(commercial OR advertisement OR ad)) AND mediatype:(movies)',
  },
  {
    id: "deep_food_ads",
    group: "deep",
    parent: "commercials",
    name: "Food & Drink Ads",
    subtitle: "Jello molds and TV dinners",
    query: '(subject:(food OR cereal OR "soft drink" OR cola OR beer OR candy OR "tv dinner" OR jello) AND (collection:(classic_tv_commercials) OR subject:(commercial OR advertisement))) AND mediatype:(movies)',
  },
  {
    id: "deep_creature",
    group: "deep",
    parent: "horror",
    name: "Creature Features",
    subtitle: "Giant ants, swamp things, mutants",
    query: 'collection:(feature_films) AND subject:(monster OR creature OR giant OR mutant OR "creature feature") AND mediatype:(movies)',
  },
  {
    id: "deep_camp",
    group: "deep",
    parent: "horror",
    name: "Camp & B-Movies",
    subtitle: "So bad it loops back to good",
    query: 'collection:(feature_films) AND subject:("b movie" OR "b-movie" OR camp OR "low budget" OR exploitation) AND mediatype:(movies)',
  },
  {
    id: "deep_space",
    group: "deep",
    parent: "scifi",
    name: "Space Adventures",
    subtitle: "Rockets, aliens, flying saucers",
    query: '(subject:(rocket OR "flying saucer" OR "outer space" OR "space travel" OR alien OR "space ship") OR title:("from outer space" OR "space patrol")) AND mediatype:(movies)',
  },
  {
    id: "deep_cartoon_silly",
    group: "deep",
    parent: "cartoons",
    name: "Silly Symphonies & Shorts",
    subtitle: "Pre-TV one-off cartoon shorts",
    query: '(subject:("silly symphonies" OR "cartoon short" OR "animated short") OR collection:(classic_cartoons)) AND year:[1920 TO 1950] AND mediatype:(movies)',
  },
  {
    id: "deep_vampire",
    group: "deep",
    parent: "horror",
    name: "Vampires & Ghouls",
    subtitle: "Dracula, Nosferatu, the undead",
    query: '(subject:(vampire OR dracula OR nosferatu OR ghoul OR undead) OR title:(vampire OR dracula OR nosferatu)) AND mediatype:(movies)',
  },
  {
    id: "deep_toy_ads",
    group: "deep",
    parent: "commercials",
    name: "Toy Commercials",
    subtitle: "Action figures, dolls, board games",
    query: '(subject:(toy OR toys OR "action figure" OR doll OR "board game") AND (collection:(classic_tv_commercials) OR subject:(commercial OR advertisement))) AND mediatype:(movies)',
  },

  // ── By show / series ────────────────────────────────────────────
  {
    id: "show_betty_boop",
    group: "show",
    parent: "cartoons",
    name: "Betty Boop",
    subtitle: "Fleischer Studios — 1930s",
    query: "collection:(betty_boop_cartoons) OR (title:(\"betty boop\") AND mediatype:(movies))",
  },
  {
    id: "show_popeye",
    group: "show",
    parent: "cartoons",
    name: "Popeye the Sailor",
    subtitle: "Spinach-fueled cartoons",
    query: "(title:(popeye) OR collection:(popeyethesailorman)) AND mediatype:(movies)",
  },
  {
    id: "show_looney",
    group: "show",
    parent: "cartoons",
    name: "Looney Tunes & Merrie Melodies",
    subtitle: "Bugs, Daffy, Porky, etc.",
    query: "(title:(\"looney tunes\") OR title:(\"merrie melodies\") OR title:(\"bugs bunny\")) AND mediatype:(movies)",
  },
  {
    id: "show_woody",
    group: "show",
    parent: "cartoons",
    name: "Woody Woodpecker",
    subtitle: "Walter Lantz's chaos bird",
    query: "title:(\"woody woodpecker\") AND mediatype:(movies)",
  },
  {
    id: "show_mickey",
    group: "show",
    parent: "cartoons",
    name: "Classic Disney",
    subtitle: "Mickey, Donald, Goofy — public domain era",
    query: "(title:(\"mickey mouse\") OR title:(\"donald duck\") OR title:(\"goofy\")) AND mediatype:(movies)",
  },
  {
    id: "show_felix",
    group: "show",
    parent: "cartoons",
    name: "Felix the Cat",
    subtitle: "The original cartoon star",
    query: "title:(\"felix the cat\") AND mediatype:(movies)",
  },
  {
    id: "show_threestooges",
    group: "show",
    parent: "horror",
    name: "Three Stooges",
    subtitle: "Slapstick shorts",
    query: "(title:(\"three stooges\") OR creator:(\"three stooges\")) AND mediatype:(movies)",
  },
  {
    id: "show_twilightzone",
    group: "show",
    parent: "scifi",
    name: "Twilight Zone-Adjacent",
    subtitle: "Anthology-style retro sci-fi",
    query: "(title:(\"twilight zone\") OR title:(\"outer limits\") OR title:(\"one step beyond\")) AND mediatype:(movies)",
  },

  // ── By decade ───────────────────────────────────────────────
  {
    id: "d1930s",
    group: "decade",
    name: "The 1930s",
    subtitle: "Early sound era",
    query: "year:[1930 TO 1939] AND mediatype:(movies)",
  },
  {
    id: "d1940s",
    group: "decade",
    name: "The 1940s",
    subtitle: "Wartime and post-war",
    query: "year:[1940 TO 1949] AND mediatype:(movies)",
  },
  {
    id: "d1950s",
    group: "decade",
    name: "The 1950s",
    subtitle: "The atomic age",
    query: "year:[1950 TO 1959] AND mediatype:(movies)",
  },
  {
    id: "d1960s",
    group: "decade",
    name: "The 1960s",
    subtitle: "The sixties",
    query: "year:[1960 TO 1969] AND mediatype:(movies)",
  },
  {
    id: "d1970s",
    group: "decade",
    name: "The 1970s",
    subtitle: "The seventies",
    query: "year:[1970 TO 1979] AND mediatype:(movies)",
  },
  {
    id: "d1980s",
    group: "decade",
    name: "The 1980s",
    subtitle: "The eighties",
    query: "year:[1980 TO 1989] AND mediatype:(movies)",
  },
];

function stripHTML(str) {
  if (!str) return "";
  if (Array.isArray(str)) str = str[0] || "";
  return String(str).replace(/<[^>]*>/g, "").trim();
}

function flattenCreator(c) {
  if (!c) return "";
  if (Array.isArray(c)) return c[0] || "";
  return String(c);
}

function normalizeItem(doc) {
  return {
    id: doc.identifier || "",
    title: doc.title || "Untitled",
    description: stripHTML(doc.description).slice(0, 400),
    year: doc.year || null,
    creator: flattenCreator(doc.creator),
    downloads: doc.downloads || 0,
    runtime: parseRuntime(doc.runtime),
    thumbnail: THUMB_URL(doc.identifier),
    archiveUrl: `${BASE}/details/${doc.identifier}`,
    videoUrl: null,
  };
}

/** Parse Archive.org runtime into total seconds. Handles "HH:MM:SS", "MM:SS", "123" (seconds), etc. */
function parseRuntime(raw) {
  if (!raw) return null;
  const str = Array.isArray(raw) ? raw[0] : String(raw);
  if (!str) return null;
  // "HH:MM:SS" or "MM:SS"
  const parts = str.split(":");
  if (parts.length === 3) return (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
  if (parts.length === 2) return (+parts[0]) * 60 + (+parts[1]);
  // Plain number (seconds or minutes — if > 300 assume seconds, else minutes)
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return num > 300 ? Math.round(num) : Math.round(num * 60);
}

// Sort tiers: "anchor" sorts give recognizable items, "deep" sorts surface obscure ones.
const ANCHOR_SORTS = [
  "downloads desc",     // most popular all-time
  "avg_rating desc",    // best rated
  "num_favorites desc", // most favorited on archive.org
  "num_reviews desc",   // most reviewed
  "month desc",         // trending this month
  "week desc",          // trending this week
];
const DEEP_SORTS = [
  "addeddate desc",     // recently added (often newly-digitized obscure stuff)
  "addeddate asc",      // oldest uploads — deep archive
  "publicdate desc",    // recently published
  "publicdate asc",     // oldest publications
  "year asc",           // oldest content first — truly ancient
  "year desc",          // newest content — 70s/80s oddities
  "downloads asc",      // LEAST downloaded — the stuff nobody's found yet
  "createdate desc",    // recently created metadata
  "reviewdate desc",    // recently reviewed items
  "title asc",          // alphabetical — hits different letters each page
  "title desc",         // reverse alphabetical
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// De-duplicate items by id
function dedupeItems(items) {
  const seen = new Set();
  return items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
}

async function search(query, rows = 25, page = 1, sort = "downloads desc") {
  const fields = ["identifier", "title", "description", "year", "creator", "downloads", "runtime"];
  const fieldStr = fields.map((f) => `fl[]=${f}`).join("&");
  const sortParam = `sort[]=${encodeURIComponent(sort)}`;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&${fieldStr}&${sortParam}&rows=${rows}&page=${page}&output=json`;

  const res = await fetch(url, {
    headers: { "User-Agent": "VoidChannel/0.3" },
    timeout: 15000,
  });
  const data = await res.json();
  const docs = data?.response?.docs || [];
  return docs.map(normalizeItem);
}

/**
 * Blended search: builds a row that mixes mainstream and obscure.
 * - ~30% of items: popular/recognizable (anchor sort, random page 1-5)
 * - ~70%: deep cuts from 2 different obscure sorts + random deep pages
 * Items are ordered: anchor first, then deep — giving the hierarchy the user wants.
 *
 * Key to variety: we now randomize ANCHOR pages (1-5) and go deep (pages 1-50).
 * Archive.org has millions of videos — page 35 of "addeddate asc" is totally
 * different content than page 2.
 */
async function searchBlended(query, rows = 20) {
  const anchorCount = Math.max(3, Math.ceil(rows * 0.3));
  const deepCount = rows - anchorCount;

  const anchorSort = pickRandom(ANCHOR_SORTS);
  const anchorPage = Math.floor(Math.random() * 5) + 1;   // pages 1-5 (was always 1)

  const deepSort = pickRandom(DEEP_SORTS);
  const deepPage = Math.floor(Math.random() * 30) + 1;    // pages 1-30 (was 1-8)

  // Two parallel requests — anchor + deep (keep it lean for bulk loads)
  let [anchorItems, deepItems] = await Promise.all([
    search(query, anchorCount + 8, anchorPage, anchorSort),
    search(query, deepCount + 10, deepPage, deepSort),
  ]);

  // Fallback: if deep page was past end of results, retry with low page
  if (deepItems.length === 0) {
    deepItems = await search(query, deepCount + 10, 1, pickRandom(DEEP_SORTS));
  }
  // Fallback: if anchor page was too deep for a small collection
  if (anchorItems.length === 0 && anchorPage > 1) {
    anchorItems = await search(query, anchorCount + 8, 1, anchorSort);
  }

  // Anchor items stay in order (most recognizable first)
  // Deep items get shuffled (randomize within the obscure pool)
  const anchor = anchorItems.slice(0, anchorCount);
  const deep = shuffleArray(deepItems).slice(0, deepCount);

  // Combine: mainstream → obscure gradient within the row
  return dedupeItems([...anchor, ...deep]).slice(0, rows);
}

// Variety search: fully random sort + page, shuffled. Used for "repopulate" and rabbit hole.
async function searchVariety(query, rows = 25) {
  const allSorts = [...ANCHOR_SORTS, ...DEEP_SORTS];
  const sort = pickRandom(allSorts);
  const page = Math.floor(Math.random() * 40) + 1; // pages 1-40 (was 1-5)
  const items = await search(query, rows * 2, page, sort);
  // If deep page returned nothing (past end of results), fall back to page 1
  if (items.length === 0) {
    const fallback = await search(query, rows * 2, 1, pickRandom(allSorts));
    return shuffleArray(fallback).slice(0, rows);
  }
  return shuffleArray(items).slice(0, rows);
}

async function getItem(identifier) {
  const url = META_URL(identifier);
  const res = await fetch(url, {
    headers: { "User-Agent": "VoidChannel/0.2" },
    timeout: 15000,
  });
  const data = await res.json();

  const meta = data?.metadata || {};
  const files = data?.files || [];
  const { fast, best } = pickVideos(files);

  return {
    id: identifier,
    title: meta.title || "Untitled",
    description: stripHTML(meta.description).slice(0, 800),
    year: meta.year || meta.date || null,
    creator: flattenCreator(meta.creator),
    duration: meta.runtime || null,
    thumbnail: THUMB_URL(identifier),
    archiveUrl: `${BASE}/details/${identifier}`,
    videoUrl: fast ? FILE_URL(identifier, fast.name) : null,
    videoUrlHQ: best ? FILE_URL(identifier, best.name) : null,
    videoSize: fast ? parseInt(fast.size || 0) : null,
    videoFormat: fast ? fast.format : null,
    availableFormats: files
      .filter((f) => f.name && f.name.toLowerCase().endsWith(".mp4"))
      .map((f) => ({
        name: f.name,
        format: f.format || "unknown",
        size: parseInt(f.size || 0),
        url: FILE_URL(identifier, f.name),
      })),
  };
}

/**
 * Pick a fast-loading video (smallest/lowest quality) for immediate playback.
 * Returns { fast, best } — fast is the quick-start version, best is higher quality.
 * If only one quality exists, both are the same.
 */
function pickVideos(files) {
  if (!files || files.length === 0) return { fast: null, best: null };
  const mp4s = files.filter((f) => f.name && f.name.toLowerCase().endsWith(".mp4"));
  if (mp4s.length === 0) return { fast: null, best: null };

  // Quality tiers from lowest to highest
  const tiers = [
    (f) => f.format === "512Kb MPEG4",
    (f) => f.format === "MPEG4",
    (f) => f.format === "h.264" || f.format === "h.264 IA",
    (f) => f.format === "HiRes MPEG4",
  ];

  // Find the lowest available (fast start)
  let fast = null;
  for (const test of tiers) {
    fast = mp4s.find(test);
    if (fast) break;
  }
  if (!fast) {
    // Fallback: smallest file
    mp4s.sort((a, b) => parseInt(a.size || 0) - parseInt(b.size || 0));
    fast = mp4s[0];
  }

  // Find the best available (highest quality)
  let best = null;
  for (let i = tiers.length - 1; i >= 0; i--) {
    best = mp4s.find(tiers[i]);
    if (best) break;
  }
  if (!best) best = fast;

  // If fast and best are the same file, no point upgrading
  return { fast, best: best === fast ? null : best };
}

// Legacy compat wrapper
function pickBestVideo(files) {
  const { fast } = pickVideos(files);
  return fast;
}

async function getCategoryItems(categoryId, rows = 25, page = 1, shuffle = false) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return { error: "Category not found" };
  const query = cat.mature ? cat.query : cat.query + NSFW_EXCLUDE;

  let items;
  if (shuffle) {
    items = await searchVariety(query, rows);
  } else if (page === 1) {
    // First page: blended (mainstream → obscure gradient)
    items = await searchBlended(query, rows);
  } else {
    // Subsequent pages: straight paginated search
    items = await search(query, rows, page);
  }
  return { ...cat, items };
}

async function getAllCategories(rowsPerCategory = 20, shuffle = false) {
  // Batch in groups of 4 — each blended search makes 2 parallel requests,
  // so this is 8 concurrent requests to Archive.org (safe under rate limits)
  const BATCH_SIZE = 4;
  const allResults = [];

  for (let i = 0; i < CATEGORIES.length; i += BATCH_SIZE) {
    const batch = CATEGORIES.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (cat) => {
        const query = cat.mature ? cat.query : cat.query + NSFW_EXCLUDE;
        let items;
        if (shuffle) {
          items = await searchVariety(query, rowsPerCategory);
        } else {
          // Default: blended rows — mainstream first, obscure trailing
          items = await searchBlended(query, rowsPerCategory);
        }
        return { ...cat, items };
      })
    );
    allResults.push(...batchResults.map((r, j) => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[archive] failed to fetch ${batch[j].id}:`, r.reason);
      return { ...batch[j], items: [] };
    }));
  }

  return allResults;
}

/**
 * Rabbit Hole — find items adjacent to the one the user just watched.
 * Uses the item's subjects + collection to build a "more like this" query,
 * deliberately varied so it surfaces similar-but-different content.
 */
async function getRelated(identifier, limit = 15) {
  try {
    const url = META_URL(identifier);
    const res = await fetch(url, {
      headers: { "User-Agent": "VoidChannel/0.3" },
      timeout: 12000,
    });
    const data = await res.json();
    const meta = data?.metadata || {};

    // Gather subjects and collections
    const subjects = Array.isArray(meta.subject)
      ? meta.subject
      : meta.subject ? String(meta.subject).split(";").map((s) => s.trim()) : [];
    const collections = Array.isArray(meta.collection)
      ? meta.collection
      : meta.collection ? [meta.collection] : [];

    // Build OR clauses from top subjects (cap at 4 to keep query sane)
    const subClauses = subjects
      .slice(0, 4)
      .map((s) => `subject:(${JSON.stringify(s)})`)
      .join(" OR ");
    const colClauses = collections
      .slice(0, 2)
      .map((c) => `collection:(${c})`)
      .join(" OR ");

    let query;
    if (subClauses && colClauses) {
      query = `(${subClauses} OR ${colClauses})`;
    } else if (subClauses) {
      query = `(${subClauses})`;
    } else if (colClauses) {
      query = `(${colClauses})`;
    } else {
      return []; // no metadata to build from
    }

    query += ` AND mediatype:(movies) NOT identifier:(${identifier})`;
    query += NSFW_EXCLUDE;

    return await searchVariety(query, limit);
  } catch (err) {
    console.error(`[getRelated] ${identifier}:`, err.message);
    return [];
  }
}

module.exports = {
  CATEGORIES,
  NSFW_EXCLUDE,
  search,
  getItem,
  getRelated,
  getCategoryItems,
  getAllCategories,
  normalizeItem,
  THUMB_URL,
  FILE_URL,
};
