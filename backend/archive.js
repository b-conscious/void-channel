const fetch = require("node-fetch");

const BASE = "https://archive.org";
const SEARCH_URL = `${BASE}/advancedsearch.php`;
const META_URL = (id) => `${BASE}/metadata/${id}`;
// Full-resolution thumbnails — Archive.org serves them at native size.
// Speed comes from skeleton wireframes during load, not from resolution reduction.
const THUMB_URL = (id, w = null) => `${BASE}/services/img/${id}${w ? `?w=${w}` : ''}`;
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

// Exclude news/politics/current-events bleed from entertainment categories.
// Archive.org metadata is community-tagged — people slap "anime" on political videos, etc.
// This filter keeps news/politics contained to their own category (newsreels, documentary).
const NEWS_POLITICS_EXCLUDE = ' ' + [
  'NOT subject:(politics OR political OR politician OR government OR election',
  '  OR congress OR senate OR democrat OR republican OR presidential OR president',
  '  OR trump OR obama OR biden OR clinton OR campaign OR legislation OR ballot',
  '  OR "current events" OR "breaking news" OR "press conference" OR protest',
  '  OR referendum OR parliament OR partisan OR "executive order" OR geopolitics',
  '  OR "foreign policy" OR diplomacy OR sanctions)',
  'NOT subject:(news OR newsreel OR "news report" OR "news clip" OR "news broadcast"',
  '  OR headline OR journalism OR "news anchor" OR "press release")',
  'NOT collection:(newsreels OR news OR opensource_media)',
].join(' ');

// Categories that should NEVER have news/politics bleed
const ENTERTAINMENT_IDS = new Set([
  'anime', 'cartoons', 'saturday_morning', 'afterschool', 'comedy', 'horror', 'feature_length', 'most_popular',
  'scifi', 'noir', 'western', 'romance', 'silent_film', 'blaxploitation',
  'music_video', 'sports', 'nature_wildlife', 'game_shows', 'art_film',
  'abstract', 'theatre', 'foreign', 'shopping', 'ephemeral', 'amateur',
  'howto', 'deep_creature', 'deep_camp', 'deep_vampire', 'deep_space',
  'deep_cartoon_silly', 'deep_cigarette_ads', 'deep_food_ads',
]);

const CATEGORIES = [
  // ── By type — ordered obscure-first, mainstream later ───────────────────
  // Voice: "generating since 1895" — every name should feel like a channel you'd tune into
  {
    id: "ephemeral",
    group: "type",
    name: "Lost Reels",
    subtitle: "Someone's life on 8mm — found, digitized, yours now",
    query: "collection:(home_movies) AND mediatype:(movies)",
  },
  {
    id: "prelinger",
    group: "type",
    name: "The Projection Room",
    subtitle: "Training films, workplace oddities, corporate propaganda",
    query: "collection:(prelinger) AND mediatype:(movies)",
  },
  {
    id: "oddities",
    group: "type",
    name: "The Weird Shelf",
    subtitle: "Uncategorizable things someone pointed a camera at",
    query: '(subject:(oddity OR curiosity OR "freak" OR unusual OR bizarre OR strange OR weird OR experimental) OR collection:(ephemeral)) AND mediatype:(movies) AND NOT collection:(prelinger)',
  },
  {
    id: "religious",
    group: "type",
    name: "Sunday Morning Reel",
    subtitle: "Church basements, missionary footage, moral tales",
    query: '(subject:(religious OR church OR "sunday school" OR missionary OR sermon OR gospel OR bible OR devotional) OR collection:(religious_films)) AND mediatype:(movies)',
  },
  {
    id: "medical",
    group: "type",
    name: "The Operating Theater",
    subtitle: "Clinical training, surgical footage, health films",
    query: '(subject:(medical OR surgical OR "mental health" OR hospital OR disease OR anatomy OR "health education" OR nursing) OR collection:(medicalheritagelibrary)) AND mediatype:(movies)',
  },
  {
    id: "amateur",
    group: "type",
    name: "Garage Cinema",
    subtitle: "No budget, no studio, no permission needed",
    query: '(subject:(amateur OR "home movie" OR underground OR experimental OR "student film" OR "independent film" OR "avant garde") OR collection:(amateur_films)) AND mediatype:(movies)',
  },
  {
    id: "psa",
    group: "type",
    name: "Duck & Cover",
    subtitle: "How to survive the bomb, your neighbor, and bad posture",
    query: 'collection:(prelinger) AND subject:(safety OR "civil defense" OR warning OR danger OR survival) AND mediatype:(movies)',
  },
  {
    id: "commercials",
    group: "type",
    name: "Dead Brands & Sold Dreams",
    subtitle: "Vintage ads for things that no longer exist",
    query: '(collection:(classic_tv_commercials) OR subject:(commercial OR advertisement OR "tv ad" OR ads OR "tv commercial")) AND mediatype:(movies)',
  },
  {
    id: "travelogues",
    group: "type",
    name: "Before Google Maps",
    subtitle: "How the world looked when you had to go there to see it",
    query: '(subject:(travelogue OR "travel film" OR "around the world" OR expedition OR journey OR foreign) OR collection:(travelfilms)) AND mediatype:(movies)',
  },
  {
    id: "computers",
    group: "type",
    name: "The Computer Chronicles",
    subtitle: "When a hard drive was the size of a washing machine",
    query: "collection:(computerchronicles) AND mediatype:(movies)",
  },
  {
    id: "cartoons",
    group: "type",
    name: "The Animation Vault",
    subtitle: "Hand-drawn, cel-painted, before pixels existed",
    query: "collection:(classic_cartoons) AND mediatype:(movies)",
  },
  {
    id: "most_popular",
    group: "type",
    name: "Most Popular",
    subtitle: "The most watched films on the Internet Archive — all time",
    query: 'mediatype:(movies)',
    sort: 'downloads desc',
  },
  {
    id: "feature_length",
    group: "type",
    name: "Feature Films",
    subtitle: "Full-length movies — grab the popcorn, this'll take a while",
    query: 'collection:(feature_films) AND mediatype:(movies)',
  },
  {
    id: "horror",
    group: "type",
    name: "The Drive-In",
    subtitle: "Low-budget terror, creature features, midnight screenings",
    query: 'collection:(feature_films) AND subject:(horror OR "science fiction") AND mediatype:(movies)',
  },
  {
    id: "scifi",
    group: "type",
    name: "Futures That Never Happened",
    subtitle: "How every decade imagined tomorrow — and got it wrong",
    query: 'subject:("science fiction" OR "atomic age" OR "space") AND mediatype:(movies) AND collection:(feature_films OR prelinger)',
  },
  {
    id: "noir",
    group: "type",
    name: "Smoke & Shadows",
    subtitle: "Detectives, dames, double-crosses — the noir canon",
    query: "(collection:(Film_Noir) OR subject:(noir OR detective)) AND mediatype:(movies)",
  },
  {
    id: "newsreels",
    group: "type",
    name: "The Evening Report",
    subtitle: "Breaking news from decades you weren't alive for",
    query: '(collection:(newsreels) OR collection:(news) OR subject:(newsreel OR "news clip" OR "news film" OR "march of time")) AND mediatype:(movies)',
  },
  {
    id: "educational_tv",
    group: "type",
    name: "The TV Cart",
    subtitle: "The teacher wheeled it in and everyone shut up",
    query: '(subject:("educational television" OR "classroom film" OR "school" OR "instructional") OR collection:(classic_tv)) AND mediatype:(movies) AND NOT collection:(prelinger)',
  },
  {
    id: "anime",
    name: "Anime & Manga",
    subtitle: "Japanese animation — from vintage to fan-subbed obscurities",
    query: "(subject:(anime) OR subject:(manga) OR collection:(anime) OR collection:(japanese_animation)) AND mediatype:(movies)",
  },
  {
    id: "saturday_morning",
    name: "Saturday Morning",
    subtitle: "Pour the cereal, turn on the TV — it's 1987 and nothing matters",
    query: "(subject:(\"saturday morning\") OR subject:(\"children's television\") OR collection:(saturday_morning_cartoons) OR (title:(\"He-Man\") OR title:(\"Transformers\") OR title:(\"GI Joe\") OR title:(\"Thundercats\") OR title:(\"Voltron\") OR title:(\"Teenage Mutant Ninja\"))) AND mediatype:(movies)",
  },
  {
    id: "afterschool",
    name: "After School Special",
    subtitle: "The 3:30 PM life lessons nobody asked for but everyone remembers",
    query: "(subject:(\"after school\") OR title:(\"after school special\") OR (subject:(children) AND subject:(educational) AND year:[1970 TO 1999])) AND mediatype:(movies)",
  },
  {
    id: "education",
    name: "The Classroom",
    subtitle: "Lectures, lessons, and the stuff teachers showed when they were tired",
    query: "(subject:(educational) OR subject:(\"educational films\") OR collection:(educationalfilms)) AND mediatype:(movies)",
  },
  {
    id: "howto",
    name: "How To",
    subtitle: "Step-by-step instructions from when YouTube didn't exist yet",
    query: "(subject:(\"how to\") OR subject:(instructional) OR subject:(tutorial) OR title:(\"how to\")) AND mediatype:(movies)",
  },
  {
    id: "foreign",
    name: "World Cinema",
    subtitle: "Subtitles optional, vibes mandatory — cinema without borders",
    query: "(subject:(\"foreign film\") OR subject:(\"world cinema\") OR subject:(\"french film\") OR subject:(\"italian film\") OR subject:(\"german film\") OR subject:(\"japanese film\") OR subject:(\"indian cinema\") OR collection:(world_cinema)) AND mediatype:(movies)",
  },
  {
    id: "art_film",
    name: "Art House",
    subtitle: "Avant-garde, experimental, and deliberately confusing — on purpose",
    query: "(subject:(\"art film\") OR subject:(\"experimental film\") OR subject:(\"avant-garde\") OR subject:(\"art house\") OR collection:(art_films)) AND mediatype:(movies)",
  },
  {
    id: "theatre",
    name: "Stage & Theatre",
    subtitle: "Live performances captured before they vanished forever",
    query: "(subject:(theatre) OR subject:(theater) OR subject:(\"stage performance\") OR subject:(\"live performance\") OR subject:(\"broadway\") OR subject:(\"stage play\")) AND mediatype:(movies)",
  },
  {
    id: "abstract",
    name: "Abstract & Visual",
    subtitle: "No plot, no characters — just light, color, and motion",
    query: "(subject:(abstract) OR subject:(\"visual art\") OR subject:(\"video art\") OR subject:(\"motion graphics\") OR subject:(\"experimental animation\")) AND mediatype:(movies)",
  },
  {
    id: "conspiracy",
    name: "Down the Rabbit Hole",
    subtitle: "Conspiracy docs, fringe theories, and late-night paranoia fuel",
    query: "(subject:(conspiracy) OR subject:(\"conspiracy theory\") OR subject:(ufo) OR subject:(paranormal) OR subject:(\"secret society\") OR title:(\"conspiracy\") OR title:(\"coverup\")) AND mediatype:(movies)",
  },
  {
    id: "public_access",
    name: "Public Access",
    subtitle: "Local cable TV — unfiltered, unhinged, unforgettable",
    query: "(subject:(\"public access\") OR subject:(\"public access television\") OR collection:(public_access_tv) OR subject:(\"cable access\") OR title:(\"public access\")) AND mediatype:(movies)",
  },
  {
    id: "shopping",
    name: "Home Shopping",
    subtitle: "QVC, infomercials, and products that definitely didn't work",
    query: "(subject:(infomercial) OR subject:(\"home shopping\") OR subject:(\"shopping channel\") OR title:(infomercial) OR title:(\"home shopping\") OR title:(\"as seen on tv\")) AND mediatype:(movies)",
  },
  {
    id: "violence",
    name: "Action & Violence",
    subtitle: "Stunts, fights, explosions — the good stuff",
    query: "(subject:(action) OR subject:(\"martial arts\") OR subject:(\"action film\") OR subject:(war) OR subject:(violence) OR subject:(\"fight scene\")) AND mediatype:(movies)",
  },
  {
    id: "music_video",
    name: "Music Videos & Concerts",
    subtitle: "Live shows, music films, and the MTV era before it died",
    query: "(subject:(\"music video\") OR subject:(concert) OR subject:(\"live music\") OR subject:(\"live performance\" AND music) OR collection:(music_videos)) AND mediatype:(movies)",
  },
  {
    id: "sports",
    name: "Classic Sports",
    subtitle: "When athletes were regular-sized and the footage was grainy",
    query: "(subject:(sports) OR subject:(\"sports film\") OR subject:(baseball) OR subject:(boxing) OR subject:(football) OR subject:(olympics)) AND mediatype:(movies)",
  },
  {
    id: "nature_wildlife",
    name: "Nature & Wildlife",
    subtitle: "Planet Earth before it needed saving",
    query: "(subject:(nature) OR subject:(wildlife) OR subject:(\"nature documentary\") OR subject:(\"national parks\") OR subject:(\"animal\") OR collection:(nature_docs)) AND mediatype:(movies)",
  },
  {
    id: "comedy",
    name: "Comedy Gold",
    subtitle: "Slapstick, stand-up, sketch — humor that aged in every direction",
    query: "(subject:(comedy) OR subject:(\"comedy film\") OR subject:(\"stand-up comedy\") OR subject:(humor) OR subject:(slapstick)) AND mediatype:(movies)",
  },
  {
    id: "western",
    name: "The Western",
    subtitle: "Outlaws, showdowns, and dust — the original American genre",
    query: "(subject:(western) OR subject:(\"western film\") OR subject:(cowboy) OR subject:(\"wild west\")) AND mediatype:(movies)",
  },
  {
    id: "romance",
    name: "Love Stories",
    subtitle: "When romance meant actual dialogue and not a dating app",
    query: "(subject:(romance) OR subject:(\"romantic film\") OR subject:(\"love story\") OR subject:(\"romantic drama\")) AND mediatype:(movies)",
  },
  {
    id: "documentary",
    name: "The Documentary",
    subtitle: "Real people, real stories — before everything was 'content'",
    query: "(subject:(documentary) OR subject:(\"documentary film\") OR collection:(documentaries)) AND mediatype:(movies)",
  },
  {
    id: "game_shows",
    name: "Game Shows",
    subtitle: "Prizes, buzzers, and hosts who smiled too much",
    query: '(subject:("game show" OR "game shows" OR "quiz show" OR "quiz shows" OR "tv game" OR "television game") OR collection:(game_shows OR gameshow) OR title:("wheel of fortune") OR title:("jeopardy") OR title:("price is right") OR title:("family feud") OR title:("match game") OR title:("hollywood squares") OR title:("lets make a deal") OR title:("password") OR title:("to tell the truth") OR title:("press your luck") OR title:("card sharks") OR title:("sale of the century") OR title:("name that tune") OR title:("what\'s my line") OR title:("i\'ve got a secret") OR title:("supermarket sweep") OR title:("double dare") OR title:("nickelodeon guts") OR title:("legends of the hidden temple") OR title:("wipeout") OR title:("deal or no deal") OR title:("who wants to be a millionaire")) AND mediatype:(movies)',
  },
  {
    id: "silent_film",
    name: "The Silent Era",
    subtitle: "Before sound ruined everything — pure visual storytelling",
    query: "(subject:(\"silent film\") OR subject:(\"silent movie\") OR subject:(\"silent era\") OR collection:(silent_films) OR year:[1895 TO 1929]) AND mediatype:(movies)",
  },
  {
    id: "war_footage",
    name: "War Footage",
    subtitle: "Real conflict on film — not for the faint of heart",
    query: "(subject:(\"world war\") OR subject:(\"war footage\") OR subject:(\"military film\") OR subject:(\"combat footage\") OR subject:(\"war documentary\") OR collection:(war_footage)) AND mediatype:(movies)",
  },
  {
    id: "blaxploitation",
    name: "Blaxploitation",
    subtitle: "Shaft, Foxy Brown, and the baddest soundtracks ever recorded",
    query: "(subject:(blaxploitation) OR title:(\"shaft\") OR title:(\"foxy brown\") OR title:(\"dolemite\") OR subject:(\"black cinema\" AND year:[1970 TO 1985])) AND mediatype:(movies)",
  },
  {
    id: "sex_ed",
    group: "type",
    name: "The Talk",
    subtitle: "How every decade explained the birds and the bees",
    query: [
      '(subject:("sex education" OR "sex hygiene" OR "venereal disease"',
      '  OR "social hygiene" OR "sex instruction" OR "human sexuality"',
      '  OR "family planning" OR "birth control" OR reproduction',
      '  OR "sexual behavior" OR "puberty" OR "menstruation"',
      '  OR "dating etiquette" OR "marriage guidance" OR "family life education"',
      '  OR "vd" OR "std" OR "sexually transmitted"))',
      'AND mediatype:(movies)',
    ].join(' '),
    mature: true,
  },
  {
    id: "mature",
    group: "type",
    name: "⚠ Behind Closed Doors",
    subtitle: "How every era talked about bodies — stag reels, burlesque, peep shows",
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

  // ── Deep cuts — for the rabbit-holers ──────
  {
    id: "deep_driver_ed",
    group: "deep",
    parent: "prelinger",
    name: "Blood on the Highway",
    subtitle: "Scare-film driver's ed — they really showed you the wreck",
    query: 'collection:(prelinger) AND subject:("driver education" OR "traffic safety" OR driving OR "automobile safety" OR highway) AND mediatype:(movies)',
  },
  {
    id: "deep_mental_hygiene",
    group: "deep",
    parent: "prelinger",
    name: "Are You Popular?",
    subtitle: "Films about fixing your personality, circa 1952",
    query: 'collection:(prelinger) AND subject:("mental hygiene" OR "social guidance" OR "emotional health" OR adjustment OR personality) AND mediatype:(movies)',
  },
  {
    id: "deep_dating",
    group: "deep",
    parent: "prelinger",
    name: "How to Behave",
    subtitle: "Dating advice from people who are all dead now",
    query: 'collection:(prelinger) AND subject:(dating OR etiquette OR manners OR "social guidance" OR courtship) AND mediatype:(movies)',
  },
  {
    id: "deep_hygiene",
    group: "deep",
    parent: "prelinger",
    name: "Wash Your Hands",
    subtitle: "Personal cleanliness was a national emergency",
    query: 'collection:(prelinger) AND subject:(hygiene OR health OR "personal hygiene" OR cleanliness OR grooming) AND mediatype:(movies)',
  },
  {
    id: "deep_propaganda",
    group: "deep",
    parent: "psa",
    name: "The Red Scare Reel",
    subtitle: "When communism was hiding under every bed",
    query: 'collection:(prelinger) AND subject:("cold war" OR propaganda OR "duck and cover" OR "red scare" OR communism OR "civil defense") AND mediatype:(movies)',
  },
  {
    id: "deep_atomic",
    group: "deep",
    parent: "scifi",
    name: "The Bomb",
    subtitle: "Nuclear paranoia, fallout shelters, the end of everything",
    query: 'subject:("atomic" OR "nuclear" OR "atomic age" OR "hydrogen bomb" OR radiation OR fallout) AND mediatype:(movies)',
  },
  {
    id: "deep_telephone",
    group: "deep",
    parent: "prelinger",
    name: "Please Hold",
    subtitle: "AT&T made hundreds of films about the miracle of calling someone",
    query: '(subject:(telephone OR "bell system" OR "bell telephone" OR "AT&T" OR "long distance") OR creator:("Bell Telephone")) AND mediatype:(movies)',
  },
  {
    id: "deep_farming",
    group: "deep",
    parent: "prelinger",
    name: "Amber Waves",
    subtitle: "USDA propaganda, county fairs, and the glory of tractors",
    query: '(subject:(agriculture OR farming OR "farm life" OR crop OR livestock OR USDA OR "county fair" OR rural) OR collection:(usda)) AND mediatype:(movies)',
  },
  {
    id: "deep_cigarette_ads",
    group: "deep",
    parent: "commercials",
    name: "Doctor Recommended",
    subtitle: "When cigarette ads ran during the news",
    query: '(subject:(cigarette OR tobacco OR smoking) AND subject:(commercial OR advertisement OR ad)) AND mediatype:(movies)',
  },
  {
    id: "deep_food_ads",
    group: "deep",
    parent: "commercials",
    name: "Jello Molds & TV Dinners",
    subtitle: "Peak mid-century cuisine, now in commercial form",
    query: '(subject:(food OR cereal OR "soft drink" OR cola OR beer OR candy OR "tv dinner" OR jello) AND (collection:(classic_tv_commercials) OR subject:(commercial OR advertisement))) AND mediatype:(movies)',
  },
  {
    id: "deep_creature",
    group: "deep",
    parent: "horror",
    name: "It Came From the Swamp",
    subtitle: "Giant ants, radioactive mutants, rubber suit monsters",
    query: 'collection:(feature_films) AND subject:(monster OR creature OR giant OR mutant OR "creature feature") AND mediatype:(movies)',
  },
  {
    id: "deep_camp",
    group: "deep",
    parent: "horror",
    name: "So Bad It's Perfect",
    subtitle: "The films that loop back around to genius",
    query: 'collection:(feature_films) AND subject:("b movie" OR "b-movie" OR camp OR "low budget" OR exploitation) AND mediatype:(movies)',
  },
  {
    id: "deep_space",
    group: "deep",
    parent: "scifi",
    name: "Rockets & Saucers",
    subtitle: "Every alien spoke English and the future was chrome",
    query: '(subject:(rocket OR "flying saucer" OR "outer space" OR "space travel" OR alien OR "space ship") OR title:("from outer space" OR "space patrol")) AND mediatype:(movies)',
  },
  {
    id: "deep_cartoon_silly",
    group: "deep",
    parent: "cartoons",
    name: "Before Television",
    subtitle: "One-reel cartoon shorts from the theater days",
    query: '(subject:("silly symphonies" OR "cartoon short" OR "animated short") OR collection:(classic_cartoons)) AND year:[1920 TO 1950] AND mediatype:(movies)',
  },
  {
    id: "deep_vampire",
    group: "deep",
    parent: "horror",
    name: "Children of the Night",
    subtitle: "Dracula, Nosferatu, and every undead thing in between",
    query: '(subject:(vampire OR dracula OR nosferatu OR ghoul OR undead) OR title:(vampire OR dracula OR nosferatu)) AND mediatype:(movies)',
  },
  {
    id: "deep_toy_ads",
    group: "deep",
    parent: "commercials",
    name: "Christmas Morning, 1963",
    subtitle: "Every toy you begged for, sold in 30 seconds",
    query: '(subject:(toy OR toys OR "action figure" OR doll OR "board game") AND (collection:(classic_tv_commercials) OR subject:(commercial OR advertisement))) AND mediatype:(movies)',
  },

  // ── By show / series ────────────────────────────────────────────
  {
    id: "show_betty_boop",
    group: "show",
    parent: "cartoons",
    name: "Betty Boop",
    subtitle: "Fleischer Studios, 1930s — jazz-age animation at its weirdest",
    query: "collection:(betty_boop_cartoons) OR (title:(\"betty boop\") AND mediatype:(movies))",
  },
  {
    id: "show_popeye",
    group: "show",
    parent: "cartoons",
    name: "Popeye the Sailor",
    subtitle: "Spinach, punching, and Olive Oyl — repeat forever",
    query: "(title:(popeye) OR collection:(popeyethesailorman)) AND mediatype:(movies)",
  },
  {
    id: "show_looney",
    group: "show",
    parent: "cartoons",
    name: "Looney Tunes",
    subtitle: "Bugs, Daffy, Porky — the originals, not the reboots",
    query: "(title:(\"looney tunes\") OR title:(\"merrie melodies\") OR title:(\"bugs bunny\")) AND mediatype:(movies)",
  },
  {
    id: "show_woody",
    group: "show",
    parent: "cartoons",
    name: "Woody Woodpecker",
    subtitle: "Walter Lantz's unhinged bird, laughing since 1940",
    query: "title:(\"woody woodpecker\") AND mediatype:(movies)",
  },
  {
    id: "show_mickey",
    group: "show",
    parent: "cartoons",
    name: "Classic Disney",
    subtitle: "Mickey, Donald, Goofy — before the copyright wall",
    query: "(title:(\"mickey mouse\") OR title:(\"donald duck\") OR title:(\"goofy\")) AND mediatype:(movies)",
  },
  {
    id: "show_felix",
    group: "show",
    parent: "cartoons",
    name: "Felix the Cat",
    subtitle: "The first cartoon star — silent era, pure imagination",
    query: "title:(\"felix the cat\") AND mediatype:(movies)",
  },
  {
    id: "show_threestooges",
    group: "show",
    parent: "horror",
    name: "Three Stooges",
    subtitle: "Physical comedy that would get you arrested today",
    query: "(title:(\"three stooges\") OR creator:(\"three stooges\")) AND mediatype:(movies)",
  },
  {
    id: "show_twilightzone",
    group: "show",
    parent: "scifi",
    name: "The Fifth Dimension",
    subtitle: "Twilight Zone, Outer Limits — anthology sci-fi that still hits",
    query: "(title:(\"twilight zone\") OR title:(\"outer limits\") OR title:(\"one step beyond\")) AND mediatype:(movies)",
  },

  // ── By decade ───────────────────────────────────────────────
  {
    id: "d1930s",
    group: "decade",
    name: "The Thirties",
    subtitle: "Talkies arrived and everything changed",
    query: "year:[1930 TO 1939] AND mediatype:(movies)",
  },
  {
    id: "d1940s",
    group: "decade",
    name: "The Forties",
    subtitle: "War, rationing, and film as duty",
    query: "year:[1940 TO 1949] AND mediatype:(movies)",
  },
  {
    id: "d1950s",
    group: "decade",
    name: "The Fifties",
    subtitle: "Atoms, suburbs, and the fear of everything",
    query: "year:[1950 TO 1959] AND mediatype:(movies)",
  },
  {
    id: "d1960s",
    group: "decade",
    name: "The Sixties",
    subtitle: "The rules broke and the cameras kept rolling",
    query: "year:[1960 TO 1969] AND mediatype:(movies)",
  },
  {
    id: "d1970s",
    group: "decade",
    name: "The Seventies",
    subtitle: "Grit, grain, and nobody asked permission",
    query: "year:[1970 TO 1979] AND mediatype:(movies)",
  },
  {
    id: "d1980s",
    group: "decade",
    name: "The Eighties",
    subtitle: "VHS tapes, neon, and the last analog decade",
    query: "year:[1980 TO 1989] AND mediatype:(movies)",
  },
  {
    id: "d1990s",
    group: "decade",
    name: "The Nineties",
    subtitle: "Grunge, dial-up, and the last decade before the internet ate everything",
    query: "year:[1990 TO 1999] AND mediatype:(movies)",
  },
  {
    id: "d2000s",
    group: "decade",
    name: "The 2000s",
    subtitle: "Y2K survived, reality TV didn't — the camcorder-to-digital shift",
    query: "year:[2000 TO 2009] AND mediatype:(movies)",
  },
  {
    id: "d2010s",
    group: "decade",
    name: "The 2010s",
    subtitle: "HD uploads, YouTube culture, and independent everything",
    query: "year:[2010 TO 2019] AND mediatype:(movies)",
  },
  {
    id: "d2020s",
    group: "decade",
    name: "The 2020s",
    subtitle: "Pandemic footage, livestreams, and whatever this era turns out to be",
    query: "year:[2020 TO 2029] AND mediatype:(movies)",
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
  // Flatten subjects to an array of strings
  let subjects = [];
  if (doc.subject) {
    if (Array.isArray(doc.subject)) subjects = doc.subject.map(String).slice(0, 10);
    else if (typeof doc.subject === 'string') subjects = doc.subject.split(';').map((s) => s.trim()).filter(Boolean).slice(0, 10);
  }
  return {
    id: doc.identifier || "",
    title: doc.title || "Untitled",
    description: stripHTML(doc.description).slice(0, 400),
    year: doc.year || null,
    creator: flattenCreator(doc.creator),
    downloads: doc.downloads || 0,
    runtime: parseRuntime(doc.runtime),
    subjects,
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
  const fields = ["identifier", "title", "description", "year", "creator", "downloads", "runtime", "subject"];
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
  // Strip version suffixes (e.g. ":1") that Archive search sometimes appends
  var cleanId = identifier.replace(/:\d+$/, '');
  var fallback = {
    id: cleanId,
    title: cleanId.replace(/_/g, " "),
    description: "Item metadata unavailable from Archive.org.",
    year: null, creator: null, duration: null,
    thumbnail: THUMB_URL(cleanId, null),
    archiveUrl: `${BASE}/details/${cleanId}`,
    videoUrl: FILE_URL(cleanId, `${cleanId}_512kb.mp4`),
    videoUrlHQ: null, videoSize: null, videoFormat: null,
    availableFormats: [],
  };

  var res;
  try {
    var url = META_URL(cleanId);
    res = await fetch(url, {
      headers: { "User-Agent": "VoidChannel/0.2" },
      timeout: 15000,
    });
  } catch (err) {
    console.warn(`[archive] getItem(${cleanId}) network error:`, err.message);
    return fallback;
  }
  if (!res.ok) {
    console.warn(`[archive] getItem(${cleanId}) HTTP ${res.status}`);
    return fallback;
  }
  let data;
  try { data = await res.json(); } catch { data = {}; }

  const meta = data?.metadata || {};
  const files = data?.files || [];
  const { fast, best } = pickVideos(files);

  // Extract collections and subjects for "browse this collection" feature
  const rawCollections = Array.isArray(meta.collection)
    ? meta.collection : meta.collection ? [meta.collection] : [];
  // Filter out internal/system collections
  const collections = rawCollections.filter(c =>
    c && !c.startsWith('fav-') && c !== 'opensource' && c !== 'community'
    && c !== 'movies' && c !== 'opensource_movies'
  );
  const subjects = Array.isArray(meta.subject)
    ? meta.subject.map(String).slice(0, 15)
    : meta.subject ? String(meta.subject).split(';').map(s => s.trim()).filter(Boolean).slice(0, 15) : [];

  return {
    id: cleanId,
    title: meta.title || "Untitled",
    description: stripHTML(meta.description).slice(0, 800),
    year: meta.year || meta.date || null,
    creator: flattenCreator(meta.creator),
    duration: meta.runtime || null,
    collections,
    subjects,
    thumbnail: THUMB_URL(cleanId, null),
    archiveUrl: `${BASE}/details/${cleanId}`,
    videoUrl: fast ? FILE_URL(cleanId, fast.name) : null,
    videoUrlHQ: best ? FILE_URL(cleanId, best.name) : null,
    videoSize: fast ? parseInt(fast.size || 0) : null,
    videoFormat: fast ? fast.format : null,
    availableFormats: files
      .filter((f) => f.name && f.name.toLowerCase().endsWith(".mp4"))
      .map((f) => ({
        name: f.name,
        format: f.format || "unknown",
        size: parseInt(f.size || 0),
        url: FILE_URL(cleanId, f.name),
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
  let query = cat.mature ? cat.query : cat.query + NSFW_EXCLUDE;
  // Keep news/politics out of entertainment categories
  if (ENTERTAINMENT_IDS.has(cat.id)) query += NEWS_POLITICS_EXCLUDE;

  let items;
  if (shuffle) {
    items = await searchVariety(query, rows);
  } else if (cat.sort) {
    // Category has a fixed sort (e.g. most_popular → downloads desc) — no blending
    items = await search(query, rows, page, cat.sort);
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
  // Batch in groups of 6 — smaller rows (15 items) and 100px thumbs mean each
  // request is lighter, so we can safely run more in parallel for faster load.
  const BATCH_SIZE = 6;
  const allResults = [];

  for (let i = 0; i < CATEGORIES.length; i += BATCH_SIZE) {
    const batch = CATEGORIES.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (cat) => {
        let query = cat.mature ? cat.query : cat.query + NSFW_EXCLUDE;
        if (ENTERTAINMENT_IDS.has(cat.id)) query += NEWS_POLITICS_EXCLUDE;
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
    var cleanId = identifier.replace(/:\d+$/, '');
    const url = META_URL(cleanId);
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
    const rawCollections = Array.isArray(meta.collection)
      ? meta.collection
      : meta.collection ? [meta.collection] : [];
    // Filter to meaningful collections (skip internal Archive.org ones)
    const collections = rawCollections.filter(c =>
      c && !c.startsWith('fav-') && c !== 'opensource' && c !== 'community'
      && c !== 'movies' && c !== 'opensource_movies'
    );

    // ── TIER 1: Same show / same collection ──────────────────
    // If this item belongs to a real collection (= a show/series on Archive.org),
    // fetch more episodes from that collection first. Sort by title so episodes
    // appear in roughly the right order (most Archive uploads name files sequentially).
    var sameShow = [];
    if (collections.length > 0) {
      const colClauses = collections.slice(0, 3).map(c => `collection:(${c})`).join(' OR ');
      const colQuery = `(${colClauses}) AND mediatype:(movies) NOT identifier:(${cleanId})` + NSFW_EXCLUDE;
      try {
        sameShow = await search(colQuery, limit, 1, 'titleSorter asc');
      } catch { sameShow = []; }
    }

    // If same-show filled everything we need, done — no mixing required
    if (sameShow.length >= limit) return sameShow.slice(0, limit);

    // ── TIER 2: Subject-based backfill ───────────────────────
    // Fill remaining slots with content that shares subjects/tags but
    // isn't from the same collection (avoid duplicates).
    var backfill = [];
    const remaining = limit - sameShow.length;
    if (remaining > 0 && subjects.length > 0) {
      const subClauses = subjects
        .slice(0, 4)
        .map(s => `subject:(${JSON.stringify(s)})`)
        .join(' OR ');
      // Exclude same-collection items so we don't duplicate tier 1
      const excludeCol = collections.length > 0
        ? collections.slice(0, 3).map(c => ` NOT collection:(${c})`).join('')
        : '';
      const subQuery = `(${subClauses}) AND mediatype:(movies) NOT identifier:(${cleanId})${excludeCol}` + NSFW_EXCLUDE;
      try {
        backfill = await searchVariety(subQuery, remaining);
      } catch { backfill = []; }
    }

    // Merge: same-show episodes on top (ordered), then subject-based variety
    const seenIds = new Set(sameShow.map(i => i.id));
    const deduped = backfill.filter(i => !seenIds.has(i.id));
    return [...sameShow, ...deduped].slice(0, limit);
  } catch (err) {
    console.error(`[getRelated] ${identifier}:`, err.message);
    return [];
  }
}

/**
 * Browse a raw Archive.org collection — "more from this show/series".
 * Used when the user taps a collection chip on the player page.
 */
async function searchCollection(collectionId, query = '', rows = 30, page = 1) {
  let lucene = `collection:(${collectionId})`;
  if (query && query.trim().length >= 2) {
    lucene = `${lucene} AND (${query.trim()})`;
  }
  lucene += ' AND mediatype:(movies)' + NSFW_EXCLUDE;
  return search(lucene, rows, page, 'downloads desc');
}

/**
 * Search by creator — "more by this director/studio".
 */
async function searchCreator(creator, rows = 30, page = 1) {
  const lucene = `creator:(${JSON.stringify(creator)}) AND mediatype:(movies)` + NSFW_EXCLUDE;
  return search(lucene, rows, page, 'downloads desc');
}

module.exports = {
  CATEGORIES,
  NSFW_EXCLUDE,
  search,
  getItem,
  getRelated,
  getCategoryItems,
  getAllCategories,
  searchCollection,
  searchCreator,
  normalizeItem,
  THUMB_URL,
  FILE_URL,
};
