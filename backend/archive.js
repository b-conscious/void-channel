const fetch = require("node-fetch");

const BASE = "https://archive.org";
const SEARCH_URL = `${BASE}/advancedsearch.php`;
const META_URL = (id) => `${BASE}/metadata/${id}`;
const THUMB_URL = (id) => `${BASE}/services/img/${id}`;
const FILE_URL = (id, file) => `${BASE}/download/${id}/${encodeURIComponent(file)}`;

// Exclude adult/mature content from all regular category & search queries
const NSFW_EXCLUDE = ' NOT collection:(stag_films) NOT subject:(erotic OR stag OR nudity OR nude OR pornograph* OR "blue film" OR "adults only" OR "adult film")';

const CATEGORIES = [
  // ── By type — ordered by Gen Z engagement (short/visual/weird first) ───
  {
    id: "cartoons",
    group: "type",
    name: "Classic Cartoons",
    subtitle: "Animation from the early days of TV",
    query: "collection:(classic_cartoons) AND mediatype:(movies)",
  },
  {
    id: "commercials",
    group: "type",
    name: "TV Commercials",
    subtitle: "Vintage advertisements and TV ads",
    query: '(collection:(classic_tv_commercials) OR subject:(commercial OR advertisement OR "tv ad" OR ads OR "tv commercial")) AND mediatype:(movies)',
  },
  {
    id: "horror",
    group: "type",
    name: "Drive-In Horror",
    subtitle: "Low-budget horror and sci-fi",
    query: 'collection:(feature_films) AND subject:(horror OR "science fiction") AND mediatype:(movies)',
  },
  {
    id: "ephemeral",
    group: "type",
    name: "Home Movies & Newsreels",
    subtitle: "Found footage and family films",
    query: "collection:(home_movies) AND mediatype:(movies)",
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
    id: "computers",
    group: "type",
    name: "Computer Chronicles",
    subtitle: "Retro tech TV from the 80s and 90s",
    query: "collection:(computerchronicles) AND mediatype:(movies)",
  },
  {
    id: "prelinger",
    group: "type",
    name: "Industrial & Educational",
    subtitle: "Training films, documentaries, ephemera",
    query: "collection:(prelinger) AND mediatype:(movies)",
  },
  {
    id: "psa",
    group: "type",
    name: "Civil Defense Films",
    subtitle: "Public safety and educational reels",
    query: 'collection:(prelinger) AND subject:(safety OR "civil defense") AND mediatype:(movies)',
  },
  {
    id: "mature",
    group: "type",
    name: "⚠ Mature Viewers Only",
    subtitle: "Burlesque, stag films, vintage curiosities — adults only",
    query: '(collection:(stag_films) OR subject:(erotic OR stag OR "pin-up" OR burlesque OR "adults only")) AND mediatype:(movies)',
    mature: true,
  },

  // ── Deep cuts — granular sub-categories for rabbit-holers ──────
  // Cartoons
  {
    id: "deep_cartoon_silly",
    group: "deep",
    parent: "cartoons",
    name: "Silly Symphonies & Shorts",
    subtitle: "Pre-TV one-off cartoon shorts",
    query: '(subject:("silly symphonies" OR "cartoon short" OR "animated short") OR collection:(classic_cartoons)) AND year:[1920 TO 1950] AND mediatype:(movies)',
  },
  // Horror
  {
    id: "deep_creature",
    group: "deep",
    parent: "horror",
    name: "Creature Features",
    subtitle: "Giant ants, swamp things, mutants",
    query: 'collection:(feature_films) AND subject:(monster OR creature OR giant OR mutant OR "creature feature") AND mediatype:(movies)',
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
    id: "deep_camp",
    group: "deep",
    parent: "horror",
    name: "Camp & B-Movies",
    subtitle: "So bad it loops back to good",
    query: 'collection:(feature_films) AND subject:("b movie" OR "b-movie" OR camp OR "low budget" OR exploitation) AND mediatype:(movies)',
  },
  // Commercials
  {
    id: "deep_cigarette_ads",
    group: "deep",
    parent: "commercials",
    name: "Cigarette & Tobacco Ads",
    subtitle: "Doctors recommend this brand",
    query: '(subject:(cigarette OR tobacco OR smoking) AND subject:(commercial OR advertisement OR ad)) AND mediatype:(movies)',
  },
  {
    id: "deep_toy_ads",
    group: "deep",
    parent: "commercials",
    name: "Toy Commercials",
    subtitle: "Action figures, dolls, board games",
    query: '(subject:(toy OR toys OR "action figure" OR doll OR "board game") AND (collection:(classic_tv_commercials) OR subject:(commercial OR advertisement))) AND mediatype:(movies)',
  },
  {
    id: "deep_food_ads",
    group: "deep",
    parent: "commercials",
    name: "Food & Drink Ads",
    subtitle: "Jello molds and TV dinners",
    query: '(subject:(food OR cereal OR "soft drink" OR cola OR beer OR candy OR "tv dinner" OR jello) AND (collection:(classic_tv_commercials) OR subject:(commercial OR advertisement))) AND mediatype:(movies)',
  },
  // Sci-Fi
  {
    id: "deep_atomic",
    group: "deep",
    parent: "scifi",
    name: "Atomic Age",
    subtitle: "Nuclear paranoia, fallout shelters, the bomb",
    query: 'subject:("atomic" OR "nuclear" OR "atomic age" OR "hydrogen bomb" OR radiation OR fallout) AND mediatype:(movies)',
  },
  {
    id: "deep_space",
    group: "deep",
    parent: "scifi",
    name: "Space Adventures",
    subtitle: "Rockets, aliens, flying saucers",
    query: '(subject:(rocket OR "flying saucer" OR "outer space" OR "space travel" OR alien OR "space ship") OR title:("from outer space" OR "space patrol")) AND mediatype:(movies)',
  },
  // Educational — the ironic watch
  {
    id: "deep_hygiene",
    group: "deep",
    parent: "prelinger",
    name: "Hygiene & Health Films",
    subtitle: "Personal cleanliness was serious business",
    query: 'collection:(prelinger) AND subject:(hygiene OR health OR "personal hygiene" OR cleanliness OR grooming) AND mediatype:(movies)',
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
    id: "deep_propaganda",
    group: "deep",
    parent: "psa",
    name: "Cold War Propaganda",
    subtitle: "Duck and cover, red scare, civil defense",
    query: 'collection:(prelinger) AND subject:("cold war" OR propaganda OR "duck and cover" OR "red scare" OR communism OR "civil defense") AND mediatype:(movies)',
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
    thumbnail: THUMB_URL(doc.identifier),
    archiveUrl: `${BASE}/details/${doc.identifier}`,
    videoUrl: null,
  };
}

// Available Archive.org sort options. We rotate through these for variety.
const SORT_OPTIONS = [
  "downloads desc",     // most popular all-time
  "week desc",          // popular this week
  "month desc",         // popular this month
  "avg_rating desc",    // best rated
  "addeddate desc",     // recently added
  "year desc",          // newest first
  "year asc",           // oldest first
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function search(query, rows = 25, page = 1, sort = "downloads desc") {
  const fields = ["identifier", "title", "description", "year", "creator", "downloads"];
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

// Variety search: pulls 3× the items from a randomly-chosen page+sort combo,
// then shuffles and trims. Used when shuffle=true.
async function searchVariety(query, rows = 25) {
  const sort = SORT_OPTIONS[Math.floor(Math.random() * SORT_OPTIONS.length)];
  const page = Math.floor(Math.random() * 3) + 1; // page 1, 2, or 3
  const items = await search(query, rows * 3, page, sort);
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
  const videoFile = pickBestVideo(files);

  return {
    id: identifier,
    title: meta.title || "Untitled",
    description: stripHTML(meta.description).slice(0, 800),
    year: meta.year || meta.date || null,
    creator: flattenCreator(meta.creator),
    duration: meta.runtime || null,
    thumbnail: THUMB_URL(identifier),
    archiveUrl: `${BASE}/details/${identifier}`,
    videoUrl: videoFile ? FILE_URL(identifier, videoFile.name) : null,
    videoSize: videoFile ? parseInt(videoFile.size || 0) : null,
    videoFormat: videoFile ? videoFile.format : null,
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

function pickBestVideo(files) {
  if (!files || files.length === 0) return null;
  const mp4s = files.filter((f) => f.name && f.name.toLowerCase().endsWith(".mp4"));
  if (mp4s.length === 0) return null;

  const priorities = [
    (f) => f.format === "512Kb MPEG4",
    (f) => f.format === "h.264" || f.format === "h.264 IA",
    (f) => f.format === "MPEG4",
    (f) => f.format === "HiRes MPEG4",
  ];

  for (const test of priorities) {
    const match = mp4s.find(test);
    if (match) return match;
  }

  mp4s.sort((a, b) => parseInt(a.size || 0) - parseInt(b.size || 0));
  return mp4s[0];
}

async function getCategoryItems(categoryId, rows = 25, page = 1, shuffle = false) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return { error: "Category not found" };
  const query = cat.mature ? cat.query : cat.query + NSFW_EXCLUDE;
  const items = shuffle
    ? await searchVariety(query, rows)
    : await search(query, rows, page);
  return { ...cat, items };
}

async function getAllCategories(rowsPerCategory = 20, shuffle = false) {
  // Batch in groups of 6 to avoid overwhelming Archive.org
  // (36 parallel requests gets rate-limited → timeouts)
  const BATCH_SIZE = 6;
  const allResults = [];

  for (let i = 0; i < CATEGORIES.length; i += BATCH_SIZE) {
    const batch = CATEGORIES.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (cat) => {
        const query = cat.mature ? cat.query : cat.query + NSFW_EXCLUDE;
        return {
          ...cat,
          items: shuffle
            ? await searchVariety(query, rowsPerCategory)
            : await search(query, rowsPerCategory),
        };
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
  search,
  getItem,
  getRelated,
  getCategoryItems,
  getAllCategories,
  normalizeItem,
  THUMB_URL,
  FILE_URL,
};
