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

// Mature-by-TITLE screen for UNGATED surfaces (snacks, default wall, related). The
// query-level NSFW_EXCLUDE is subject/collection-based, so an adult-BRAND item sitting in a
// mainstream collection (e.g. "Playboy TV Promo" in classic_tv_commercials) sails through
// untagged (P2). This catches the brands + explicit markers by title. CORRAL, NOT CENSOR
// (B's standing ruling): these items stay findable in search and behind the 18+ gate — this
// only keeps them off the ungated default surfaces. Word-bounded to avoid false hits.
const MATURE_TITLE_RE = new RegExp([
  'playboy', 'penthouse', 'hustler', 'brazzers', 'bangbros', 'naughty america',
  'girls gone wild', 'emmanuelle', 'x-?rated', '\\bxxx\\b', 'hardcore', 'softcore',
  'erotic', 'erotica', 'pornograph', '\\bporn\\b', '\\bnude\\b', 'nudity', 'topless',
  'full frontal', 'strip ?club', 'strip ?tease', 'stripper', '\\bescort\\b', 'brothel',
  'lingerie', 'wet t-?shirt', 'bikini contest', 'adult (film|video|entertainment|movie)',
  '\\b18\\+', 'for adults only', 'hentai', '\\becchi\\b', 'sensual', '\\bsex\\b',
  // explicit markers that slipped the wall (B 2026-06-28): "(NSFW)" + the "NFSW" misspelling,
  // "Uncensored"/"decensored" adult re-cuts, and the notorious "Boku no Pico".
  '\\bnsfw\\b', '\\bnfsw\\b', 'uncensored', 'decensored', 'boku no pico',
].join('|'), 'i');

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

// Never surface UNVIEWABLE items (they 401/500 on play — no point showing a thumbnail you can't
// watch). Two signals: `access-restricted-item:true` (lending/dark; indexed + queryable), and the
// YouTube/social MIRROR collections whose files are flagged `private:true` (e.g. funnyordie —
// the .mp4 401s). `private` is a FILE-level flag advancedsearch doesn't index, so we exclude the
// mirror collections themselves. Add more here as dead-video sources surface. Applied in search().
const RESTRICTED_EXCLUDE =
  ' NOT collection:(funnyordie OR podcasts_mirror OR mirrortube) NOT access-restricted-item:true';

// Keep graphic/clinical medical content (surgery, autopsy, anatomy, childbirth) out of the TV
// rows — it belongs in The Operating Theater (`medical`), not the main TV feed. Append to a query.
const MEDICAL_EXCLUDE = ' NOT (subject:(surgery OR surgical OR autopsy OR dissection OR anatomy'
  + ' OR "medical procedure" OR childbirth OR obstetric OR cadaver OR pathology OR vivisection)'
  + ' OR collection:(medicalheritagelibrary))';

// Categories that should NEVER have news/politics bleed
const ENTERTAINMENT_IDS = new Set([
  'anime', 'cartoons', 'saturday_morning', 'afterschool', 'comedy', 'horror', 'feature_length', 'most_popular', 'cringe', 'tv_movies', 'banned',
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
    subtitle: "Someone's life on 8mm, found, digitized, yours now",
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
    subtitle: "Saturday mornings across the decades, 30s shorts to 90s/2000s series",
    // Span the GENERATIONS of animation, not just 1930s theatrical shorts. Draw from the broad
    // animationandcartoons umbrella + recognizable cross-decade series (X-Men, Transformers,
    // Gargoyles, Animaniacs, PPG…), and EXCLUDE the shows that already have their own rows so the
    // Vault is "everything else animation" instead of a Betty Boop/Popeye dump. The `diversify`
    // flag then caps any one series so a single show can't flood the row.
    // Clause budget matters: getCategoryItems auto-appends NSFW_EXCLUDE + NEWS_POLITICS_EXCLUDE
    // (cartoons is an ENTERTAINMENT_ID), and if the combined query gets too long Archive returns
    // ZERO. So this stays lean: the broad animationandcartoons umbrella (spans the decades) +
    // a handful of recognizable cross-decade series, betty/popeye excluded (they own their rows),
    // map/pmv fan-junk filtered. The `diversify` cap then stops any one show flooding the row.
    query:
      '(collection:(animationandcartoons) ' +
      'OR title:("x-men") OR title:("transformers") OR title:("he-man") OR title:("thundercats") ' +
      'OR title:("scooby-doo") OR title:("ducktales") OR title:("gargoyles") OR title:("animaniacs") ' +
      'OR title:("the powerpuff girls")) ' +
      'AND mediatype:(movies) ' +
      'NOT title:(map) NOT title:(pmv) ' +
      'NOT collection:(betty_boop_cartoons) NOT collection:(popeyethesailorman) ' +
      'NOT title:("betty boop") NOT title:(popeye)',
    diversify: true,
    recognizable: true,
  },
  {
    id: "most_popular",
    group: "type",
    name: "Most Popular",
    subtitle: "The most watched films on the Internet Archive, all time",
    // Constrained to the feature_films collection (B 2026-06-15: raw mediatype:(movies) downloads
    // are ~80% non-film junk: editing templates, "test file mp4", "graphics", batch dumps, gameplay
    // rips). feature_films is curated real cinema, so downloads here reflect actual film popularity.
    query: 'collection:(feature_films) AND mediatype:(movies)',
    sort: 'downloads desc',
  },
  {
    id: "feature_length",
    group: "type",
    name: "Feature Films",
    subtitle: "Full-length movies, grab the popcorn, this'll take a while",
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
    subtitle: "How every decade imagined tomorrow, and got it wrong",
    query: 'subject:("science fiction" OR "atomic age" OR "space") AND mediatype:(movies) AND collection:(feature_films OR prelinger)',
  },
  {
    id: "noir",
    group: "type",
    name: "Smoke & Shadows",
    subtitle: "Detectives, dames, double-crosses, the noir canon",
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
    query: '(subject:("educational television" OR "classroom film" OR "school" OR "instructional") OR collection:(classic_tv)) AND mediatype:(movies) AND NOT collection:(prelinger)' + MEDICAL_EXCLUDE,
  },
  {
    id: "anime",
    name: "Anime & Manga",
    subtitle: "Japanese animation, from vintage to fan-subbed obscurities",
    query: "(subject:(anime) OR subject:(manga) OR collection:(anime) OR collection:(japanese_animation)) AND mediatype:(movies)",
  },
  {
    id: "saturday_morning",
    name: "Saturday Morning",
    subtitle: "Pour the cereal, turn on the TV, it's 1987 and nothing matters",
    query: "(subject:(\"saturday morning\") OR subject:(\"children's television\") OR collection:(saturdaymorningcartoons) OR (title:(\"He-Man\") OR title:(\"Transformers\") OR title:(\"GI Joe\") OR title:(\"Thundercats\") OR title:(\"Voltron\") OR title:(\"Teenage Mutant Ninja\"))) AND mediatype:(movies)",
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
    subtitle: "Subtitles optional, vibes mandatory, cinema without borders",
    query: "(subject:(\"foreign film\") OR subject:(\"world cinema\") OR subject:(\"french film\") OR subject:(\"italian film\") OR subject:(\"german film\") OR subject:(\"japanese film\") OR subject:(\"indian cinema\") OR collection:(world_cinema)) AND mediatype:(movies)",
  },
  // HINDI SECTION (B 2026-06-15): a deliverable for Hindi-speaking partners. group:'hindi' keeps
  // these OFF the main wall and OUT of the generic Vault; the route serves them at ?tier=hindi.
  // UNFILTERED (B's standing rights posture: no junk/piracy/ripper screen); sort downloads-desc
  // surfaces the recognizable canon (Sholay, Padosan) AND the modern uploads. Exempt from the
  // foreign-gate (Devanagari titles must show) and the era-lean/recency-floor (the classics are
  // pre-1965). See memory voidtv-rights-posture-dont-moralize.
  {
    id: "hindi_popular",
    group: "hindi",
    name: "Bollywood",
    subtitle: "Hindi cinema, the whole shelf: classics to this year's uploads",
    query: "language:(Hindi) AND mediatype:(movies)",
    sort: "downloads desc",
  },
  {
    id: "hindi_golden",
    group: "hindi",
    name: "Golden Age",
    subtitle: "The canon: Pyaasa, Mughal-e-Azam, Sholay, Padosan",
    query: "language:(Hindi) AND mediatype:(movies) AND year:[1950 TO 1985]",
    sort: "downloads desc",
  },
  {
    id: "hindi_new",
    group: "hindi",
    name: "New Releases",
    subtitle: "Recent Hindi films, fresh off the upload",
    query: "language:(Hindi) AND mediatype:(movies) AND year:[2015 TO 2035]",
    sort: "downloads desc",
  },
  {
    id: "art_film",
    name: "Art House",
    subtitle: "Avant-garde, experimental, and deliberately confusing, on purpose",
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
    subtitle: "No plot, no characters, just light, color, and motion",
    query: "(subject:(abstract) OR subject:(\"visual art\") OR subject:(\"video art\") OR subject:(\"motion graphics\") OR subject:(\"experimental animation\")) AND mediatype:(movies)",
  },
  {
    id: "conspiracy",
    name: "Conspiracy",
    subtitle: "Conspiracy docs, fringe theories, and late-night paranoia fuel",
    query: "(subject:(conspiracy) OR subject:(\"conspiracy theory\") OR subject:(ufo) OR subject:(paranormal) OR subject:(\"secret society\") OR title:(\"conspiracy\") OR title:(\"coverup\")) AND mediatype:(movies)",
  },
  {
    id: "public_access",
    name: "Public Access",
    subtitle: "Local cable TV, unfiltered, unhinged, unforgettable",
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
    subtitle: "Stunts, fights, explosions, the good stuff",
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
    subtitle: "Slapstick, stand-up, sketch, humor that aged in every direction",
    query: "(subject:(comedy) OR subject:(\"comedy film\") OR subject:(\"stand-up comedy\") OR subject:(humor) OR subject:(slapstick)) AND mediatype:(movies)",
  },
  {
    id: "western",
    name: "The Western",
    subtitle: "Outlaws, showdowns, and dust, the original American genre",
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
    subtitle: "Real people, real stories, before everything was 'content'",
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
    subtitle: "Before sound ruined everything, pure visual storytelling",
    query: "(subject:(\"silent film\") OR subject:(\"silent movie\") OR subject:(\"silent era\") OR collection:(silent_films) OR year:[1895 TO 1929]) AND mediatype:(movies)",
  },
  {
    id: "war_footage",
    name: "War Footage",
    subtitle: "Real conflict on film, not for the faint of heart",
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
    id: "cringe",
    group: "type",
    name: "Cringe Archive",
    subtitle: "So bad it's good, awkward PSAs, bizarre ads, and pure secondhand embarrassment",
    query: '(subject:(awkward OR cringe OR "bad acting" OR "so bad" OR embarrassing OR cheesy) OR collection:(Drive-in_Ads OR ephemeral OR oddball_films) OR (subject:(training OR educational) AND subject:(dating OR hygiene OR etiquette))) AND mediatype:(movies)',
  },
  {
    id: "tv_movies",
    group: "type",
    name: "The TV Set",
    subtitle: "Real shows across the decades, the set never turned off",
    // Actual TV episodes spanning eras (recognizable series + classic_tv/old_tv collections),
    // fenced from the classroom/instructional + graphic-medical films that were leaking on-main.
    // Lean on the curated collections + the SPECIFIC subjects "television series"/"sitcom" (the
    // BARE "television" subject tag is garbage: childbirth clips, "HARLEM SHAKE POOP", so it stays
    // out) + a few era anchors: 50s-60s classics AND proven-available 90s (Roseanne, NewsRadio,
    // Farscape, Forensic Files). dropBroadcastJunk strips the off-air news captures; the
    // generational era-lean surfaces the 90s for millennial/genz. Kept short so the news/NSFW
    // fences don't tip Archive past its query-complexity limit (0 results).
    query:
      '(collection:(classic_tv OR old_tv) '
      + 'OR subject:("television series" OR sitcom) '
      + 'OR title:("i love lucy") OR title:("the twilight zone") OR title:("star trek") '
      + 'OR title:("roseanne") OR title:("newsradio") OR title:("farscape") OR title:("forensic files")) '
      + 'AND mediatype:(movies) '
      + 'NOT title:(surgery OR autopsy OR childbirth OR dissection OR delivery OR medical OR poop)'
      + MEDICAL_EXCLUDE,
  },
  {
    id: "banned",
    group: "type",
    name: "Banned",
    subtitle: "Censored, pulled, prohibited, the cinema they tried to bury",
    // Banned CINEMA only. The bare `banned`/`censored` subject tags pull modern deplatformed
    // extremist channels (verified in testing), so we lean on film terms + known cult/banned
    // titles, exclude propaganda/extremist/religious, and the category is in ENTERTAINMENT_IDS
    // so NEWS_POLITICS_EXCLUDE strips political bleed too.
    query: '(subject:("video nasty" OR "pre-code" OR "banned film" OR "censored film" OR "exploitation film" OR "cult film") '
      + 'OR title:("reefer madness") OR title:("freaks") OR title:("the tingler") OR title:("glen or glenda") '
      + 'OR title:("maniac") OR title:("the last house") OR title:("i drink your blood")) '
      + 'AND mediatype:(movies) '
      + 'NOT subject:(propaganda OR extremist OR nazi OR conspiracy OR religion OR religious OR sermon)',
  },
  {
    id: "mature",
    group: "type",
    name: "⚠ Behind Closed Doors",
    subtitle: "How every era talked about bodies, stag reels, burlesque, peep shows",
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
    subtitle: "Scare-film driver's ed, they really showed you the wreck",
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
    subtitle: "Fleischer Studios, 1930s, jazz-age animation at its weirdest",
    query: "collection:(betty_boop_cartoons) OR (title:(\"betty boop\") AND mediatype:(movies))",
  },
  {
    id: "show_popeye",
    group: "show",
    parent: "cartoons",
    name: "Popeye the Sailor",
    subtitle: "Spinach, punching, and Olive Oyl, repeat forever",
    query: "(title:(popeye) OR collection:(popeyethesailorman)) AND mediatype:(movies)",
  },
  {
    id: "show_looney",
    group: "show",
    parent: "cartoons",
    name: "Looney Tunes",
    subtitle: "Bugs, Daffy, Porky, the originals, not the reboots",
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
    subtitle: "Mickey, Donald, Goofy, before the copyright wall",
    query: "(title:(\"mickey mouse\") OR title:(\"donald duck\") OR title:(\"goofy\")) AND mediatype:(movies)",
  },
  {
    id: "show_felix",
    group: "show",
    parent: "cartoons",
    name: "Felix the Cat",
    subtitle: "The first cartoon star, silent era, pure imagination",
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
    subtitle: "Twilight Zone, Outer Limits, anthology sci-fi that still hits",
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
    subtitle: "Y2K survived, reality TV didn't, the camcorder-to-digital shift",
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

// ── Generational treatment rollout ───────────────────────────────────────────────────────────
// Stamp the "cartoon treatment" across the main browse rows so the whole app gets a better, more
// varied selection across the eras — WITHOUT disturbing the category specifics or the void's weird.
//   • diversify    → per-series cap (de-flood) on every `type` browse row
//   • recognizable → popular-leaning blend (vs deep-obscure) for the genre/nostalgia rows
// Deliberately-weird void rows (Lost Reels, The Weird Shelf, The Projection Room, Public Access,
// Cringe…) get diversify only — they KEEP the deep-obscure blend, that's their whole point. The
// `deep` cuts, the dedicated `show` rows, the `decade` rows, and `mature` are left exactly as
// authored. Single-source rows (one collection / one show) skip the cap so it can't starve them.
const RECOGNIZABLE_IDS = new Set([
  'cartoons', 'tv_movies', 'banned',
  'horror', 'scifi', 'noir', 'feature_length', 'anime', 'saturday_morning', 'afterschool',
  'foreign', 'violence', 'music_video', 'sports', 'nature_wildlife', 'comedy', 'western',
  'romance', 'documentary', 'game_shows', 'blaxploitation', 'war_footage',
]);
const NO_DIVERSIFY_IDS = new Set(['computers']); // single-collection rows the cap would starve
// TIGHT HOME WALL (B 2026-06-15): only these 11 ride the main wall; everything else moves to the
// Vault (still fully searchable + directly reachable). Stamped as cat.wall so the /api/categories
// route can tier the ONE shared payload. Was ~80 obscure-first rows -> the "too much going on /
// old categories on the wall" problem; this is the accessibility cut.
const WALL_IDS = new Set([
  'most_popular', 'feature_length', 'tv_movies', 'comedy', 'violence', 'cartoons',
  'anime', 'documentary', 'banned', 'conspiracy',
  // music_video (Music Videos & Concerts) pulled off the wall 2026-06-28 (B); still searchable + in the Vault.
]);

// MODERN MODE content set (B 2026-06-28; default mode, 90s-current). Genre/format rows for the
// "modern shows & movies app" face, recency-floored to 1990 in the tier handler (server.js). Same
// backend, player, search - a cleaner content lens; everything else stays in Void mode + search.
// Reoriented to "genuinely entertaining + wanted" (B 2026-06-28): the curated entertainment set, not
// a broad genre dump. READY rows below; "Adult Humor" + "Past Premium Programming" are pending new
// query-backed cats (content depth on IA still to be tested).
const MODERN_IDS = new Set([
  'feature_length', 'tv_movies', 'cartoons', 'anime', 'comedy', 'documentary',
]);
// Clean genre labels for Modern Mode (the Void names are flavored: "Classic Cartoons", "Drive-In
// Horror"). Applied only in the modern tier; the Void wall keeps its character.
const MODERN_LABELS = {
  feature_length: { name: 'Movies',        subtitle: 'Feature-length films' },
  tv_movies:      { name: 'Sitcoms',       subtitle: 'Series and sitcoms' },
  cartoons:       { name: 'Cartoons',      subtitle: 'Animation' },
  anime:          { name: 'Anime',         subtitle: 'Japanese animation' },
  comedy:         { name: 'Comedy',        subtitle: 'Stand-up, sketch, and sitcom comedy' },
  documentary:    { name: 'Documentaries', subtitle: 'Real stories' },
};
for (const cat of CATEGORIES) {
  cat.wall = WALL_IDS.has(cat.id);
  // Skip the "category specifics": deep cuts, dedicated shows, decade rows — left as authored.
  // (Many genre rows have no `group` field at all, so we exclude the specifics rather than
  //  require group==='type'.)
  if (cat.group === 'deep' || cat.group === 'show' || cat.group === 'decade') continue;
  if (cat.mature || cat.sort) continue;     // mature + fixed-sort (Most Popular) rows stay as-is
  if (!NO_DIVERSIFY_IDS.has(cat.id)) cat.diversify = true;
  if (RECOGNIZABLE_IDS.has(cat.id)) cat.recognizable = true;
}

// ── Generational era-lean — the "signal" default ordering (Bryan) ─────────────────────────────
// The default browse display leans to the user's content era WITHOUT walling the rest off:
//   • boomer     → leads from the '60s, works up (lead ~1960–1985); cross-era variety trails
//   • millennial → the middle, works up to current (lead ~1980–2012); cross-era variety trails
//   • genz       → recent-first (lead 2005+), but variety reaches back to the '70s (floor 1970) —
//                  '70s/'80s content is "good gen z cringe" (Bryan); still the only gen with a floor,
//                  so it never drops to 1930s–50s reels, just down to the '70s
// HEAVIER + WALL-WIDE (Bryan: "heavier lean for all"): applies to EVERY row except the rows whose
// identity IS an era or a ranking — decade rows, the dedicated show rows, The Silent Era, mature,
// and fixed-sort community rows (Most Popular). The weird/deep void rows keep their deep-obscure
// CONTENT (the blend is untouched) but their display ORDER now leans to the generation too — they
// were the old-skew mass at the top of the wall. SEARCH is never touched. Tunable windows below.
const GENERATION_ERAS = {
  boomer:     { anchor: { from: 1960, to: 1985, sort: 'year asc'  }, floor: null },
  millennial: { anchor: { from: 1980, to: 2012, sort: 'year asc'  }, floor: null },
  // genz capped at 2022: unbounded meant year-desc FACED every row with the newest-dated
  // uploads (civic meetings, gameplay rips, mirror spam — "nonsense everywhere", B). The
  // 2005-2022 core leads; the 2023+ upload wave ranks by proximity and trails.
  genz:       { anchor: { from: 2005, to: 2022, sort: 'year desc' }, floor: 1970 },
  // VOID = the single default lean (B 2026-06-28, signal removal): newest-first on every row,
  // variety reaching back to 1970; older media lives in search/void-hunting, not the default wall.
  void:       { anchor: { from: 2008, to: 2025, sort: 'year desc' }, floor: 1970 },
};

// Rows the era-lean must never touch: their items stay exactly as authored.
const ERA_EXEMPT_IDS = new Set(['silent_film']);
function eraExempt(cat) {
  if (!cat) return true;
  if (cat.group === 'decade' || cat.group === 'show' || cat.group === 'hindi') return true;  // era/series-defined + hindi rows
  if (cat.mature || cat.sort) return true;                          // sequestered + rank-ordered rows
  return ERA_EXEMPT_IDS.has(cat.id);
}

// Returns the era-lean config for a (generation, category) pair, or undefined when no lean applies
// (unknown gen, or an era-exempt row).
function eraFor(gen, cat) {
  if (!gen || !cat || eraExempt(cat)) return undefined;
  return GENERATION_ERAS[gen];
}

// Cheap, in-memory era-lean for the HOME payload: reorder every non-exempt row's items by the
// generation's year lean — NO Archive fetches. This lets /api/categories serve a per-gen lean
// derived from the ONE shared (no-gen) payload, instead of fetching all ~80 categories once per
// generation (which overwhelmed Archive.org → request timeouts). Weaker than the per-category true
// lean (getCategoryItems still does the deep year-windowed fetch for the See-More page), but it's
// instant + reliable and keeps the home wall leaning. Pure function; returns a new array.
//
// HEAVIER (v2): the lean shapes the whole wall, not just a row's interior —
//   • each row's FACE is pure in-era (PURE_HEAD cards before any variety weaves in; was slot 2)
//   • off-era items rank by PROXIMITY to the era window, so far-off decades always trail
//   • genz's 1970 floor applies to every leaned row (never-blank-a-row guard kept)
//   • ROW ORDER leans too: rows are scored by how era-fitting their face is, so e.g. a 1930s-heavy
//     PSA row sinks for genz and the decade rows drift toward their own generation
function applyEraLean(categories, gen) {
  // One lean for everyone now (signal removal): always the VOID newest-first profile, whatever
  // gen the (possibly legacy/cached) client sends. The `gen` param is kept for call-site signature.
  const eraDef = GENERATION_ERAS.void;
  if (!eraDef || !Array.isArray(categories)) return categories;
  const { anchor, floor } = eraDef;
  // Years beyond next year are metadata garbage ("2037 Convention" was leading rows on a
  // year-desc lean) — treat as unknown so they rank like any undated item.
  const MAX_SANE_YEAR = new Date().getFullYear() + 1;
  const yearOf = (it) => {
    const y = parseInt(it && it.year, 10);
    return Number.isFinite(y) && y <= MAX_SANE_YEAR ? y : null;
  };
  const dir = anchor && anchor.sort === 'year desc' ? -1 : 1;
  // Distance (in years) from the era window — 0 = inside it, 999 = unknown year.
  const winDist = (y) => {
    if (y == null) return 999;
    if (anchor.from != null && y < anchor.from) return anchor.from - y;
    if (anchor.to != null && y > anchor.to) return y - anchor.to;
    return 0;
  };

  const PURE_HEAD = 6;   // the row face: this many pure in-era cards before any variety
  const WEAVE_EVERY = 4; // then one variety card every N era cards

  const leaned = categories.map((cat) => {
    if (eraExempt(cat) || !Array.isArray(cat.items) || cat.items.length < 3) return cat;
    let items = cat.items;

    // genz: keep only items at/above the floor (mid-to-current) — but never blank a row.
    if (floor != null) {
      const kept = items.filter((it) => { const y = yearOf(it); return y != null && y >= floor; });
      if (kept.length >= 3) items = kept;
    }

    // Split into the era window (the lead, year-sorted in the lean direction) + the rest.
    const lead = [], rest = [];
    for (const it of items) (winDist(yearOf(it)) === 0 ? lead : rest).push(it);
    lead.sort((a, b) => dir * ((yearOf(a) || 0) - (yearOf(b) || 0)));
    // Off-era items: closest-to-the-window first (ties break in the lean direction), so when a row
    // has little or no in-era content it still leads with its most era-adjacent items.
    rest.sort((a, b) => {
      const da = winDist(yearOf(a)), db = winDist(yearOf(b));
      return da !== db ? da - db : dir * ((yearOf(a) || 0) - (yearOf(b) || 0));
    });

    // Pure in-era face, then weave the (proximity-ranked) variety in sparsely.
    let woven;
    if (lead.length && rest.length) {
      woven = lead.slice(0, PURE_HEAD);
      let ri = 0;
      for (let i = PURE_HEAD; i < lead.length; i++) {
        woven.push(lead[i]);
        if ((i - PURE_HEAD + 1) % WEAVE_EVERY === 0 && ri < rest.length) woven.push(rest[ri++]);
      }
      while (ri < rest.length) woven.push(rest[ri++]);
    } else {
      woven = lead.concat(rest);
    }
    return { ...cat, items: woven };
  });

  // Row-order lean: score each row by how era-fitting its face is (in-window = 1, decaying per
  // decade away, unknown years a small constant) and surface the best fits first. Exempt rows are
  // scored on their authored items, so old decade rows naturally sink for genz and rise for boomer.
  // Stable tiebreak keeps the authored order between equal rows. The client's banded reshuffle
  // jitters within this spine for per-visit variety without undoing it.
  const rowScore = (cat) => {
    if (!cat || !Array.isArray(cat.items) || cat.items.length === 0) return -1;
    const face = cat.items.slice(0, 10);
    let s = 0;
    for (const it of face) {
      const d = winDist(yearOf(it));
      s += d === 999 ? 0.2 : 1 / (1 + d / 10);
    }
    return s / face.length;
  };
  return leaned
    .map((cat, i) => ({ cat, i, s: rowScore(cat) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.cat);
}

// WALL RECENCY FLOOR (B 2026-06-15): keep the home wall in the color era so stray black-and-white
// archival thumbnails stop facing newcomers. Drops DATED items older than minYear from wall rows;
// undated items are kept (lots of fine content lacks a year, and the floor's target is the dated
// pre-color mass). Never blanks a row (falls back to the row's authored items if the floor guts it).
// Most Popular (sort) is exempt — it's a ranking row by identity. Pairs with the category cut.
function applyWallRecencyFloor(categories, minYear = 1965) {
  if (!Array.isArray(categories)) return categories;
  const MAX_SANE_YEAR = new Date().getFullYear() + 1;
  const yearOf = (it) => {
    const y = parseInt(it && it.year, 10);
    return Number.isFinite(y) && y <= MAX_SANE_YEAR ? y : null;
  };
  return categories.map((cat) => {
    if (!cat || cat.mature || cat.sort || !Array.isArray(cat.items) || cat.items.length < 3) return cat;
    const kept = cat.items.filter((it) => { const y = yearOf(it); return y == null || y >= minYear; });
    return kept.length >= 3 ? { ...cat, items: kept } : cat;
  });
}

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

// Archive's `runtime` is a DISPLAY STRING ("1:23:45", "11:03", "0:45" — sometimes an array or a
// bare number of seconds). Search-side `runtime:[a TO b]` ranges are lexical compares on that
// string and therefore broken — filter AFTER fetching, with this. Returns seconds, or null.
function parseRuntimeSeconds(runtime) {
  if (runtime == null) return null;
  if (Array.isArray(runtime)) runtime = runtime[0];
  const s = String(runtime).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s)); // bare seconds
  const m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  return m[3] != null
    ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])  // H:MM:SS
    : (+m[1]) * 60 + (+m[2]);                  // M:SS
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
    runtime: parseRuntimeSeconds(doc.runtime),
    subjects,
    thumbnail: THUMB_URL(doc.identifier),
    archiveUrl: `${BASE}/details/${doc.identifier}`,
    videoUrl: null,
  };
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

// A "series key" groups items that are really the same show/creator, so a row can cap how many
// of them it shows. Prefer the creator (studio/uploader); fall back to a normalized title root.
function seriesKey(it) {
  const c = Array.isArray(it.creator) ? it.creator[0] : it.creator;
  if (c && String(c).trim().length > 1) return 'c:' + String(c).trim().toLowerCase();
  const t = String(it.title || '')
    .toLowerCase()
    .replace(/[\W_]+/g, ' ')
    .replace(/\b(episode|ep|vol|volume|part|pt|no|number|chapter|disc)\b.*$/i, '')
    .trim();
  const root = t.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  return 't:' + (root || String(it.id || '').toLowerCase());
}

// Variety treatment: cap how many items share a series/creator so one show can't flood a row.
// This is "variety over virality" applied to the final assembled list — the same ethos as the
// blended search, but enforced on output. Opt-in per category (see `diversify` flag) so it never
// starves a legitimately single-source row (e.g. The Computer Chronicles, the decade rows).
function diversify(items, maxPerKey = 2) {
  const counts = new Map();
  const out = [];
  for (const it of items || []) {
    const k = seriesKey(it);
    const n = counts.get(k) || 0;
    if (n >= maxPerKey) continue;
    counts.set(k, n + 1);
    out.push(it);
  }
  return out;
}

// ── Archive circuit-breaker ──────────────────────────────────────────────────────────────────
// When archive.org starts failing (timeouts / 5xx — usually because it's rate-limiting OUR IP),
// retrying just prolongs the limit window. After a burst of consecutive failures we OPEN the breaker:
// every search() returns [] IMMEDIATELY without touching Archive, for a short cooldown — so its limiter
// can relax. One success closes it again. This stops the warm + searchBlended's empty-result fallbacks
// from hammering a throttled Archive — the exact failure that took the home wall down (an over-eager
// warm got the IP rate-limited, then the retries kept it limited).
let _archiveFails = 0;
let _archiveCircuitUntil = 0;
const ARCHIVE_FAIL_THRESHOLD = 6;   // consecutive failures that trip the breaker
const ARCHIVE_COOLDOWN_MS = 60000;  // 60s breather before we probe Archive again
function _noteArchiveFail() {
  _archiveFails++;
  if (_archiveFails >= ARCHIVE_FAIL_THRESHOLD && Date.now() >= _archiveCircuitUntil) {
    _archiveCircuitUntil = Date.now() + ARCHIVE_COOLDOWN_MS;
    console.warn(`[archive] circuit OPEN ${ARCHIVE_COOLDOWN_MS / 1000}s — backing off; Archive is rate-limiting us`);
  }
}

async function search(query, rows = 25, page = 1, sort = "downloads desc") {
  // Breaker open → skip the call so Archive's rate-limit window can expire (don't hammer it).
  if (Date.now() < _archiveCircuitUntil) return [];

  const fields = ["identifier", "title", "description", "year", "creator", "downloads", "runtime", "subject"];
  const fieldStr = fields.map((f) => `fl[]=${f}`).join("&");
  const sortParam = `sort[]=${encodeURIComponent(sort)}`;
  // RESTRICTED_EXCLUDE is TEMPORARILY OFF — Bryan wants to re-test the previously-filtered videos now
  // that the player is fixed. To re-enable, append ` + RESTRICTED_EXCLUDE` to `query` below.
  // (Verified earlier: funny_or_die files are private:true→401, access-restricted movies 403 for anon,
  //  so most are still genuinely dead — the proper fix is a resolve-time playable check, not this.)
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&${fieldStr}&${sortParam}&rows=${rows}&page=${page}&output=json`;

  // Resilient: Archive.org intermittently returns 5xx / HTML (under load, or during our cold
  // starts). Never let that throw — it would surface as a 500 on /api/search & /api/shorts.
  // Return [] so callers degrade to an empty result. (Routes must not cache empty — see server.js.)
  try {
    // HARD abort at 8s via AbortSignal — node-fetch's `timeout` option does NOT reliably
    // fire when Archive TARPITS a throttled IP (holds the socket open, trickles nothing).
    // Those 30s hangs piled up open connections and kept signalling activity to IA, so the
    // throttle never got a quiet window to expire (the block dragged for hours). A hard abort
    // fails fast, trips the breaker, and lets us go QUIET so IA releases the IP. (2026-06-13)
    const res = await fetch(url, { headers: { "User-Agent": "VoidChannel/0.3" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.warn(`[archive.search] HTTP ${res.status}`); _noteArchiveFail(); return []; }
    const data = await res.json();
    const docs = data?.response?.docs || [];
    _archiveFails = 0; // success → close the breaker (reset the failure streak)
    return docs.map(normalizeItem);
  } catch (e) {
    console.warn(`[archive.search] ${e && e.message}`);
    _noteArchiveFail();
    return [];
  }
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
// Blend preset for "recognizable" rows (cartoons / nostalgia): mostly popular picks from shallow
// pages, and the non-anchor portion drawn from the SAME quality sorts (not the deep-obscure ones)
// so known series surface reliably instead of amateur fan junk. The deep-obscure default still
// powers the weird-film rows — the 60%-obscure ethos is gold for Lost Reels, junk for cartoons,
// so it's now a per-category choice (see `recognizable` flag). NOTE: this only shapes the curated
// BROWSE rows; search stays raw so the full stream of noise remains discoverable + curatable.
const RECOGNIZABLE_BLEND = { anchorRatio: 0.65, anchorPageMax: 3, deepPageMax: 8, deepFromAnchor: true };

async function searchBlended(query, rows = 20, opts = {}) {
  const anchorRatio   = opts.anchorRatio   ?? 0.3;   // share of popular "anchor" picks
  const anchorPageMax = opts.anchorPageMax ?? 5;     // how deep the anchor pages roam
  const deepPageMax   = opts.deepPageMax   ?? 30;    // how deep the "obscure" pull roams
  const deepSorts     = opts.deepFromAnchor ? ANCHOR_SORTS : DEEP_SORTS;
  const era           = opts.era;                    // generational era-lean (optional, see GENERATION_ERAS)

  const anchorCount = Math.max(3, Math.ceil(rows * anchorRatio));
  const deepCount = rows - anchorCount;

  // Archive year range; open-ended bounds use '*'. Short clause — safe for the §budget gotcha.
  const yearClause = (from, to) =>
    (from == null && to == null) ? '' : ` AND year:[${from == null ? '*' : from} TO ${to == null ? '*' : to}]`;

  // The era lean shapes the ANCHOR (the lead of the row) by a year window + sort direction. The
  // deep/variety pull stays cross-era — EXCEPT a generation with a `floor` (genz) bounds its variety
  // too, so even the mixed-in items stay mid-to-current.
  const anchorQuery = era && era.anchor ? query + yearClause(era.anchor.from, era.anchor.to) : query;
  const deepQuery   = era && era.floor != null ? query + yearClause(era.floor, null) : query;

  const anchorSort = era && era.anchor ? era.anchor.sort : pickRandom(ANCHOR_SORTS);
  const anchorPage = Math.floor(Math.random() * anchorPageMax) + 1;

  const deepSort = pickRandom(deepSorts);
  const deepPage = Math.floor(Math.random() * deepPageMax) + 1;

  // Two parallel requests — anchor + deep (keep it lean for bulk loads)
  let [anchorItems, deepItems] = await Promise.all([
    search(anchorQuery, anchorCount + 8, anchorPage, anchorSort),
    search(deepQuery, deepCount + 10, deepPage, deepSort),
  ]);

  // Fallback: an era-constrained anchor can come back empty (e.g. genz + noir has ~no recent items).
  // Retry without the era WINDOW so the row still fills — but use deepQuery (not the bare query) so a
  // floored generation (genz) still never drops below its floor even in the fallback. The lean is
  // best-effort; the floor is not. (boomer/millennial have no floor → deepQuery === query here.)
  if (anchorItems.length === 0 && era && era.anchor) {
    anchorItems = await search(deepQuery, anchorCount + 8, 1, pickRandom(ANCHOR_SORTS));
  }
  // Fallback: if deep page was past end of results, retry with low page
  if (deepItems.length === 0) {
    deepItems = await search(deepQuery, deepCount + 10, 1, pickRandom(deepSorts));
  }
  // Fallback: if anchor page was too deep for a small collection
  if (anchorItems.length === 0 && anchorPage > 1) {
    anchorItems = await search(anchorQuery, anchorCount + 8, 1, anchorSort);
  }

  // Anchor items stay in order (era-leaned: oldest-first / newest-first per generation, else
  // most-recognizable first). Deep items get shuffled (randomize within the variety pool).
  const anchor = anchorItems.slice(0, anchorCount);
  const deep = shuffleArray(deepItems).slice(0, deepCount);

  let combined;
  if (era && deep.length) {
    // Era lean: WEAVE the variety through the year-ordered backbone ("works up, with variety thrown
    // in") rather than appending it — otherwise a downstream diversify+trim crops the variety off the
    // tail and the row reads as one solid year.
    combined = [];
    let di = 0;
    const everyN = Math.max(2, Math.round(anchor.length / deep.length));
    for (let i = 0; i < anchor.length; i++) {
      combined.push(anchor[i]);
      if ((i + 1) % everyN === 0 && di < deep.length) combined.push(deep[di++]);
    }
    while (di < deep.length) combined.push(deep[di++]); // any leftover variety
  } else {
    // Default: era/mainstream lead → variety trailing (the established mainstream→obscure gradient).
    combined = [...anchor, ...deep];
  }
  return dedupeItems(combined).slice(0, rows);
}

// Variety search: fully random sort + page, shuffled. Used for "repopulate" and rabbit hole.
async function searchVariety(query, rows = 25) {
  const allSorts = [...ANCHOR_SORTS, ...DEEP_SORTS];
  const sort = pickRandom(allSorts);
  // Pages 1-12: Archive.org's advancedsearch slows down sharply at deep pages, and deep
  // pages past the end of smaller collections return empty → triggers a 2nd fallback request.
  // 1-12 (× varied sorts) keeps good rotation while staying in Archive's fast, populated range.
  // (Was 1-40, which made the full shuffle pass take ~80s and hammered Archive.org.)
  const page = Math.floor(Math.random() * 12) + 1;
  const items = await search(query, rows * 2, page, sort);
  // If deep page returned nothing (past end of results), fall back to page 1
  if (items.length === 0) {
    const fallback = await search(query, rows * 2, 1, pickRandom(allSorts));
    return shuffleArray(fallback).slice(0, rows);
  }
  return shuffleArray(items).slice(0, rows);
}

// ── PLAYABILITY VET (the "real fix" for dead tapes) ─────────────────────────────────────
// A file URL can exist and still be unplayable in a browser: restricted items serve an HTML
// login wall with HTTP 200 (daniel-tiger), ripper uploads carry codecs Chrome can't decode
// (xvid/divx/mpeg4-part2/hevc). One ranged GET reads enough to tell. Verdicts persist —
// a codec never changes, so each file is sniffed ONCE ever. Fail OPEN on no-verdict: only a
// POSITIVE bad suppresses; the player's graceful-skip stays the catcher's mitt.
const _vfs = require("fs");
const _vpath = require("path");
const CODEC_CACHE_PATH = _vpath.join(__dirname, "codec-cache.json");
let _codecCache = {};
try { _codecCache = JSON.parse(_vfs.readFileSync(CODEC_CACHE_PATH, "utf8")); } catch {}
let _codecSaveTimer = null;
function _codecCacheSet(key, v) {
  _codecCache[key] = v;
  clearTimeout(_codecSaveTimer);
  _codecSaveTimer = setTimeout(() => {
    try { _vfs.writeFileSync(CODEC_CACHE_PATH, JSON.stringify(_codecCache)); } catch {}
  }, 2000);
  if (_codecSaveTimer.unref) _codecSaveTimer.unref();
}

const GOOD_CODEC = /avc1|avc3|vp09|av01/;
const BAD_CODEC = /mp4v|xvid|divx|DX50|mpg4|hvc1|hev1|3iv2|s263/i;

// Scan one fetched region. HTML body = login wall/error page = definitively dead. For mp4
// bytes, only scan AFTER the moov/stsd marker so ftyp compatible brands ("avc1" appears
// there on Part-2 files too) cannot false-pass. null = no verdict in this region.
function _scanRegion(buf) {
  const s = buf.toString("latin1");
  if (/^\s*</.test(s.slice(0, 64)) || s.slice(0, 512).includes("<!DOCTYPE") || s.slice(0, 512).includes("<html")) return "html";
  let at = s.indexOf("stsd");
  if (at === -1) at = s.indexOf("moov");
  if (at === -1) return null;
  const region = s.slice(at);
  if (GOOD_CODEC.test(region)) return "ok";
  if (BAD_CODEC.test(region)) return "bad";
  return null;
}

async function _rangeFetch(url, range, timeoutMs = 8000) {
  const res = await fetch(url, { headers: { Range: `bytes=${range}`, "User-Agent": "VoidChannel/0.2" }, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 403 || res.status === 404) return { gone: true };
  if (!res.ok && res.status !== 206) throw new Error(`range ${res.status}`);
  return { buf: Buffer.from(await res.arrayBuffer()) };
}

async function vetPlayable(cleanId, file) {
  if (!file) return "bad";
  const fmt = String(file.format || "");
  if (fmt === "h.264" || fmt === "h.264 IA") return "ok"; // IA-made derivative, always avc1
  const key = `${cleanId}/${file.name}`;
  if (_codecCache[key]) return _codecCache[key];
  const url = FILE_URL(cleanId, file.name);
  let verdict = "unknown";
  try {
    const head = await _rangeFetch(url, "0-131071");
    if (head.gone) verdict = "bad";
    else {
      let v = _scanRegion(head.buf);
      if (v === null) {
        // moov at the END (non-faststart) — the tail carries the codec atoms instead.
        const tail = await _rangeFetch(url, "-262144");
        v = tail.gone ? "html" : _scanRegion(tail.buf);
      }
      verdict = v === "html" ? "bad" : (v || "unknown");
    }
  } catch (e) {
    return "unknown"; // network flake — no verdict, no cache, retry naturally next resolve
  }
  if (verdict !== "unknown") _codecCacheSet(key, verdict);
  return verdict;
}

const { computeFanOut } = require('../spine/fanout.js'); // episode fan-out for bundled series items (pure module)

async function getItem(identifier, opts = {}) {
  // Strip version suffixes (e.g. ":1") that Archive search sometimes appends
  var cleanId = identifier.replace(/:\d+$/, '');
  // When the metadata fetch fails we know NOTHING about the files — fabricating a
  // <id>_512kb.mp4 guess here poisoned the wall with dead tapes (screen-recording uploads
  // never have that derivative; the cached guess 404s as NotSupportedError for 6h).
  // videoUrl null is the honest signal: the player graceful-skips it, the kids resolver
  // drops it fail-closed, and /api/item caches fallbacks briefly so a flake heals fast.
  var fallback = {
    id: cleanId,
    title: cleanId.replace(/_/g, " "),
    description: "Item metadata unavailable from Archive.org.",
    year: null, creator: null, duration: null,
    thumbnail: THUMB_URL(cleanId, null),
    archiveUrl: `${BASE}/details/${cleanId}`,
    videoUrl: null,
    videoUrlHQ: null, videoSize: null, videoFormat: null,
    captions: [],
    availableFormats: [],
    fallback: true,
  };

  // Breaker open (Archive throttling us) → fail FAST with the no-video fallback instead of
  // hanging 30s on a tarpitted metadata fetch (the playback-side of the same hang). Lets the
  // IP go quiet so the throttle can expire. (2026-06-13)
  if (Date.now() < _archiveCircuitUntil) return fallback;
  var res;
  try {
    var url = META_URL(cleanId);
    res = await fetch(url, {
      headers: { "User-Agent": "VoidChannel/0.2" },
      signal: AbortSignal.timeout(8000), // HARD abort — node-fetch `timeout` doesn't fire under tarpit
    });
  } catch (err) {
    console.warn(`[archive] getItem(${cleanId}) network error:`, err.message);
    _noteArchiveFail();
    return fallback;
  }
  if (!res.ok) {
    console.warn(`[archive] getItem(${cleanId}) HTTP ${res.status}`);
    _noteArchiveFail();
    return fallback;
  }
  _archiveFails = 0; // success → close the breaker
  let data;
  try { data = await res.json(); } catch { data = {}; }

  const meta = data?.metadata || {};
  const files = data?.files || [];
  let { fast, best } = pickVideos(files);
  const captions = detectCaptions(files);
  // Episode fan-out: a bundled "complete series" item is many episode FILES, not one video with
  // many "formats" — that mislabeling dumped all episodes under AVAILABLE FORMATS (Aqua Teen,
  // 2026-06-14). When the manifest fans out, resolve it AS A SERIES (episodes[]); default-play the
  // first episode and SKIP the single-file vet (fanout already chose an mp4/non-x265 file per
  // episode, and vetting one arbitrary file of hundreds would wrongly condemn the whole series).
  let episodes = null;
  const fan = computeFanOut(data, parseRuntimeSeconds);
  if (fan && fan.length) {
    const sizeByName = new Map(files.map((f) => [f.name, parseInt(f.size || 0) || null]));
    episodes = fan.map((e) => ({
      file: e.file, title: e.displayTitle, season: e.season, episode: e.episode,
      episodeTitle: e.episodeTitle, contentType: e.contentType,
      videoUrl: FILE_URL(cleanId, e.file), size: sizeByName.get(e.file) || null,
    }));
    const firstEp = episodes.find((x) => x.contentType === 'episode') || episodes[0];
    fast = { name: firstEp.file, size: firstEp.size, format: 'mp4' };
    best = null;
  } else if (!opts.skipVet && fast && (await vetPlayable(cleanId, fast)) === "bad") {
    // Playability vet: suppress files that are POSITIVELY unplayable (HTML wall, bad codec). A bad
    // fast falls through to best; all bad -> no videoUrl (kids drop it fail-closed). skipVet
    // (vouched kids content) trusts B's approval — vetting it stormed IA and blanked kids (P1).
    fast = (best && (await vetPlayable(cleanId, best)) !== "bad") ? best : null;
    best = null;
  }

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
    captions,
    availableFormats: episodes ? [] : files
      .filter((f) => f.name && f.name.toLowerCase().endsWith(".mp4"))
      .map((f) => ({
        name: f.name,
        format: f.format || "unknown",
        size: parseInt(f.size || 0),
        url: FILE_URL(cleanId, f.name),
      })),
    ...(episodes ? { isBundle: true, episodes } : {}),
  };
}

// CAPTIONS layer 1: surface sidecar subtitle files IA sometimes ships alongside a video
// (.srt / .vtt). The player requests these through /api/captions, which fetches + converts to
// WebVTT and serves same-origin. Language is a best-effort guess from the filename
// (movie.en.srt / movie_fr.vtt), default 'en'. Binary 608/.scc closed-caption is intentionally
// skipped here — it needs decoding, not a text passthrough (a later layer).
function detectCaptions(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((f) => f.name && /\.(srt|vtt)$/i.test(f.name))
    .map((f) => {
      const lower = f.name.toLowerCase();
      const m = lower.match(/[._-]([a-z]{2,3})\.(?:srt|vtt)$/);
      return { file: f.name, lang: m ? m[1] : 'en', format: lower.endsWith('.vtt') ? 'vtt' : 'srt' };
    });
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

  // Fast = smallest real mp4 by SIZE, not the format ladder: screen-recording uploads put
  // the multi-GB ORIGINAL under "MPEG4" and the streaming derivative under "h.264 IA", so
  // the ladder picked 2.3GB originals (slice 30). Floor 1MB + no *sample* files so a stub
  // can't win. Ladder still ranks "best" below.
  let fast = null;
  const sized = mp4s.filter((f) => parseInt(f.size || 0) > 1024 * 1024 && !/sample/i.test(f.name));
  if (sized.length) {
    fast = sized.reduce((a, b) => (parseInt(a.size || 0) <= parseInt(b.size || 0) ? a : b));
  } else {
    for (const test of tiers) {
      fast = mp4s.find(test);
      if (fast) break;
    }
    if (!fast) {
      mp4s.sort((a, b) => parseInt(a.size || 0) - parseInt(b.size || 0));
      fast = mp4s[0];
    }
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

async function getCategoryItems(categoryId, rows = 25, page = 1, shuffle = false, gen = null) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return { error: "Category not found" };
  let query = cat.mature ? cat.query : cat.query + NSFW_EXCLUDE;
  // Keep news/politics out of entertainment categories
  if (ENTERTAINMENT_IDS.has(cat.id)) query += NEWS_POLITICS_EXCLUDE;

  // When a category opts into the variety treatment, over-fetch so capping per series doesn't
  // leave the row short, then diversify + trim back to `rows`.
  const fetchRows = cat.diversify ? rows * 2 : rows;
  // Merge the recognizable blend (if any) with the generational era-lean (if any) into one opts bag.
  const era = eraFor(gen, cat);
  const blendOpts = (cat.recognizable || era)
    ? { ...(cat.recognizable ? RECOGNIZABLE_BLEND : {}), ...(era ? { era } : {}) }
    : undefined;

  let items;
  if (shuffle) {
    items = await searchVariety(query, fetchRows);
  } else if (cat.sort) {
    // Category has a fixed sort (e.g. most_popular → downloads desc) — no blending
    items = await search(query, rows, page, cat.sort);
  } else if (page === 1) {
    // First page: blended (mainstream → obscure gradient, or recognizable-leaning per category)
    items = await searchBlended(query, fetchRows, blendOpts);
  } else {
    // Subsequent pages: straight paginated search
    items = await search(query, fetchRows, page);
  }
  if (cat.diversify) items = diversify(items, 2).slice(0, rows);
  return { ...cat, items };
}

async function getAllCategories(rowsPerCategory = 20, shuffle = false, gen = null) {
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
        const fetchRows = cat.diversify ? rowsPerCategory * 2 : rowsPerCategory;
        // Recognizable blend + generational era-lean (both optional) merged into one opts bag.
        const era = eraFor(gen, cat);
        const blendOpts = (cat.recognizable || era)
          ? { ...(cat.recognizable ? RECOGNIZABLE_BLEND : {}), ...(era ? { era } : {}) }
          : undefined;
        let items;
        if (shuffle) {
          items = await searchVariety(query, fetchRows);
        } else {
          // Default: blended rows — mainstream first, obscure trailing (or recognizable-leaning)
          items = await searchBlended(query, fetchRows, blendOpts);
        }
        if (cat.diversify) items = diversify(items, 2).slice(0, rowsPerCategory);
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

// An item whose title has NO real letters/numbers in any script — e.g. social-mirror VODs
// (youtube-*/twitch-vod-*) literally titled "!" — is contentless junk in a "more like this"
// rail (it renders as a bare "!" card). Drop it. Uses a Unicode-aware test so real non-Latin
// titles (Korean, Arabic, CJK) are KEPT; only punctuation-only titles ("!", "?!", "…") fall out.
// Scoped to the curated related rail — global search stays raw on purpose.
function hasRealTitle(it) {
  const t = Array.isArray(it && it.title) ? it.title[0] : (it && it.title);
  return !!t && /[\p{L}\p{N}]/u.test(String(t));
}

// Recency floor for the AUTOPLAY / UP NEXT rail (B 2026-06-28: an 80s trailer's "next" was a wall
// of 1900s-1920s silent films; then "can we not have the same era as playing?"). The floor is
// RELATIVE to the item you're watching: keep "next" in the same era, never jumping more than
// ERA_LOOKBACK years OLDER than the current item (newer is fine, recency-first). So an '85 item ->
// ~1970+, a 2010 item -> ~1995+. With no known item year, fall back to the absolute color-era line.
// Drops only KNOWN-year items below the floor; undated pass. Curated only - search stays raw, and a
// direct visit to an old title still plays.
const RELATED_YEAR_FLOOR = 1965;
const ERA_LOOKBACK = 15;
function dropOld(items, baseYear) {
  if (!Array.isArray(items)) return items;
  const floor = (Number.isFinite(baseYear) && baseYear) ? (baseYear - ERA_LOOKBACK) : RELATED_YEAR_FLOOR;
  return items.filter((it) => {
    const y = parseInt(it && it.year, 10);
    return !(Number.isFinite(y) && y < floor);
  });
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

    // The year of the item being watched — drives the era-relative floor (keep "next" in the same
    // era). From `year`, else the first 4-digit run in `date`. null = unknown -> absolute floor.
    const _ym = (v) => { const m = String(Array.isArray(v) ? v[0] : (v || '')).match(/\b(1[89]\d{2}|20\d{2})\b/); return m ? parseInt(m[1], 10) : null; };
    const baseYear = _ym(meta.year) || _ym(meta.date) || null;

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
      // Page by item-id hash: every member of a big collection used to get the IDENTICAL
      // page-1 rail ("same side vids on most vids", B). Different items now window
      // different slices of the collection; page 1 stays the fallback.
      let h = 0;
      for (let i = 0; i < cleanId.length; i++) h = ((h * 31) + cleanId.charCodeAt(i)) >>> 0;
      const colPage = 1 + (h % 3);
      try {
        sameShow = await search(colQuery, limit, colPage, 'titleSorter asc');
        if (sameShow.length === 0 && colPage > 1) sameShow = await search(colQuery, limit, 1, 'titleSorter asc');
      } catch { sameShow = []; }
      // Drop contentless "!" junk (social-mirror VODs) BEFORE the early return below — otherwise a
      // mirror-collection seed returns a rail full of "!" cards without ever hitting the merge loop.
      // ^!-PREFIXED titles are the same mirror class with words attached ("! Charity Stream...")
      // and they sort FIRST under titleSorter asc — drop them too (B's screenshot, 2026-06-12).
      sameShow = sameShow.filter((it) => hasRealTitle(it) && !/^\s*!/.test(String(it.title || '')));
      // Curated-rail junk screen: credit-fragment / *Prototype* / livestream / dump spam can fill a
      // whole same-collection rail in title order (B 2026-06-28: the "Dangerous Assignment Ending
      // Credits [#11..#25]" flood). Filter BEFORE the early return so junk never short-circuits it.
      sameShow = dropOld(cleanRail(sameShow), baseYear);
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

    // Merge: same-show episodes on top (ordered), then subject-based variety.
    // Dedupe by BASE identifier (strip ":3" segment suffixes) and drop the current item, so the
    // same film — uploaded as multiple segments, or returned twice by Archive's unsorted/un-deduped
    // results — can't surface as "the first three recommendations are all identical".
    const baseId = (x) => String(x || '').replace(/:\d+$/, '');
    const seenBases = new Set([baseId(cleanId)]);
    const merged = [];
    for (const it of [...sameShow, ...backfill]) {
      const b = baseId(it.id);
      if (!b || seenBases.has(b)) continue;
      if (!hasRealTitle(it)) continue; // skip contentless "!" junk (social-mirror VODs)
      if (/^\s*!/.test(String(it.title || ''))) continue; // ^!-prefixed mirror VODs (B 2026-06-12)
      seenBases.add(b);
      merged.push(it);
    }
    return dropOld(cleanRail(merged), baseYear).slice(0, limit); // junk-screen + era-relative floor, then trim
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

// ── SPINE TRANSPORT (JOB_1) ─────────────────────────────────────────────────────────────────
// When SPINE_URL is set (the Void Backend process), ALL Archive traffic routes through the
// Archive Spine: wall and category pages come from accumulated pools, search/item are raw
// passthroughs. When unset (the Spine process itself requires this very file), the direct
// Archive paths above run unchanged. One module, two processes, no recursion. Reassigning the
// function declarations below also reroutes every INTERNAL caller (getRelated, searchBlended,
// shorts, trending) in the backend process, which is the point.
// dotenv here (idempotent) because this module can be required BEFORE server.js configures it;
// the Spine process has no .env in its working directory, so it stays on the direct paths.
try { require('dotenv').config(); } catch (e) {}
const SPINE_URL = process.env.SPINE_URL || null;

async function spineGet(path, timeoutMs = 10000) {  // 10s default: the spine's own IA fetches abort at 8s, so waiting 30s only stacked hung requests (2026-06-14)
  const opts = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? { signal: AbortSignal.timeout(timeoutMs) } : {};
  const res = await fetch(`${SPINE_URL}${path}`, opts);
  if (!res.ok) throw new Error(`spine ${res.status} on ${path.slice(0, 60)}`);
  return res.json();
}

// Deterministic per-20-minute-bucket shuffle: the pool is stable between syncs, so this is
// what keeps the wall's per-visit variety alive without any Archive load (the old role of
// the searchBlended sort/page randomness).
function bucketRng(key) {
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
function bucketSample(items, n, key) {
  const bucket = Math.floor(Date.now() / (20 * 60 * 1000));
  const rnd = bucketRng(`${key}:${bucket}`);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

// Drop future-dated items: a year past next year is metadata garbage (P3 — fake-dated
// "2037 Convention" JW spam was LEADING Most Popular). Global wall sanity; items with no/
// sane year pass untouched. Items missing year are kept (most pool items lack year).
const _MAX_WALL_YEAR = new Date().getFullYear() + 1;
function dropFutureDated(items) {
  if (!Array.isArray(items)) return items;
  return items.filter((it) => {
    const y = parseInt(it && it.year, 10);
    return !(Number.isFinite(y) && y > _MAX_WALL_YEAR);
  });
}

// High-download NON-FILM spam that floods IA's most-downloaded "movies" (P3 follow-on):
// CapCut/editing templates, IPTV reseller ads, contact-spam uploads. These aren't films and
// have no business leading "the most watched films". Title-only, word-bounded; legit popular
// uploads (Rick Astley, Open Library howtos) pass. Used on the downloads-ranked rows.
// ...|"<name> videos" personal upload dumps (residentmikelee/ghomayshi/solati/black cats/tm-bax)
// |bare spam-domain titles (Fullvideo.video-baran3.com). These are non-content dumps, not films
// (B 2026-06-28). Quality filter only, NOT a rights/origin call.
// ...|credit-sequence fragments ("Ending/Opening/Closing/End Credits") |bracketed/asterisked
// "*Prototype*" dumps. These are an upscaler/colorizer channel's numbered fragment spam that
// flooded the autoplay rail (B 2026-06-28). Quality junk, not a creator/origin call. We match the
// wrapped Prototype tag so a real film literally named "Prototype" is NOT dropped.
const JUNK_TITLE_RE = /capcut|beat ?sync template|\btemplate\b|\biptv\b|\bm3u\b|whatsapp|telegram ?(channel|link)|free ?download (link|now)|\bcrack(ed)?\b|keygen|\bapk\b|t\.me\/|\btest ?file\b|\bpublicvideos?\b|\btosec\b|\bdat ?pack\b|\bgameplay\b|^\s*graphics\s*$|\bvideos\s*$|\b[\w-]+\.(?:com|net|info|xyz|biz|online|site)\b|\b(?:ending|opening|closing|end)\s+credits\b|[\*\[\(]\s*prototype\s*[\*\]\)]/i;
function dropJunk(items) {
  if (!Array.isArray(items)) return items;
  return items.filter((it) => !JUNK_TITLE_RE.test(String((it && it.title) || '')));
}

// Off-air broadcast captures (B 2026-06-15: "The TV Set is mostly junk recorded from TV", and the
// showcase example "20260220-Lokala-Nyheter-Smaland-Fre-20-feb-07-07"). These DVR / news-archive
// rips name their files with the recording timestamp, in several formats real shows/films never
// carry: a month-name date + clock ("DW News : DW : June 9, 2026 4:00am"), a numeric YYYYMMDD stamp
// ("20260220"), an ISO date ("2026-02-20"), or an am/pm broadcast slot. We keep the CLOCK
// requirement on the month-name form so a date-titled film ("December 7, 1941") is NOT dropped.
// ...|a month-name range ("Feb23-March 3 2026") |a numeric D/M/Y or M/D/Y date ("2/14/2026",
// "21/2/26") — these flag livestream / WoE-style capture titles (B 2026-06-28).
const BROADCAST_TITLE_RE = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s*\d{2,4}\s+\d{1,2}[:.]\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\s*[-–]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\b(?:19|20)\d{6}\b|\b(?:19|20)\d{2}[-\/._]\d{2}[-\/._]\d{2}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{1,2}[:.\-]\d{2}\s*(?:am|pm)\b/i;
function dropBroadcastJunk(items) {
  if (!Array.isArray(items)) return items;
  return items.filter((it) => {
    const t = Array.isArray(it && it.title) ? it.title[0] : (it && it.title);
    return !(t && BROADCAST_TITLE_RE.test(String(t)));
  });
}

// Social-mirror VODs (youtube-*/twitch-*/soop-*/tiktok-* ids) are bulk rips of current-affairs and
// commentary channels (e.g. "China Insights" geopolitics) living in IA's mirrortube /
// social-media-video / deemphasize collections. VOIDtv is a cinema platform, NOT a news feed
// (B 2026-06-15: "this isnt a news site or app"); these flooded the hero + Most Popular. Real films
// never carry a youtube- id, so the prefix is a zero-false-positive drop. Curated surfaces only;
// search stays raw (memory: voidtv-social-mirror-junk).
function dropSocialMirror(items) {
  if (!Array.isArray(items)) return items;
  return items.filter((it) => !/^(?:youtube|twitch|soop|tiktok|funnyordie)[-_]/i.test(String((it && it.id) || '')));
}

// Livestream tags vs real concerts (B 2026-06-28: "live by itself = trash, but live WITH
// connecting words / music city / band = not"). We only drop when "live" is a bare stream marker
// AND there's no music/concert context. So "Piece of Pie LIVE", "...livestream", "LIVE NOW", a 🔴
// title, or a creator channel ending in "LIVE" go; but "Live at Wembley", "Queen - Live in Concert",
// "Music City Live", "Nirvana Unplugged" stay, and ordinary titles that merely contain the word
// ("Live and Let Die", "Live Free or Die Hard", "Live Nation Presents") are never touched.
// LIVE_OK = music/concert context that ALWAYS protects a title. LIVE_TRASH = the only
// unambiguous livestream-marker forms (we deliberately do NOT treat "(Live)" as trash: it's the
// standard concert-track suffix, e.g. "Bohemian Rhapsody (Live)"). A trailing ALL-CAPS "LIVE" is a
// drop signal ONLY in the creator/channel field ("Piece of Pie LIVE") — in a title it's usually a
// concert ("Metallica LIVE"), so we leave titles alone there.
const LIVE_OK_RE = /\b(?:concert|band|orchestra|symphony|philharmonic|tour|festival|acoustic|unplugged|setlist|gig|jam|on ?stage|musical?|sessions?|performance|recital|ensemble|quartet|choir|opera|jazz|blues|reggae|in concert|at the|live at|live in|live from|live aid|live ?8|music city|wembley|red rocks)\b/i;
const LIVE_TRASH_RE = /\bli?ve ?stream\b|\blive now\b|🔴/i;
function dropLiveStreams(items) {
  if (!Array.isArray(items)) return items;
  return items.filter((it) => {
    const t = Array.isArray(it && it.title) ? it.title[0] : (it && it.title);
    const cr = Array.isArray(it && it.creator) ? it.creator[0] : (it && it.creator);
    const title = String(t || '');
    const creator = String(cr || '');
    if (LIVE_OK_RE.test(title)) return true;                                  // music/concert context -> keep
    if (LIVE_TRASH_RE.test(title) || LIVE_TRASH_RE.test(creator)) return false; // livestream-form -> drop
    if (/\bLIVE\s*$/.test(creator)) return false;                             // channel named "... LIVE" (caps) -> drop
    return true;
  });
}

// The full curated-junk chain, for any curated surface (wall rows + the related/autoplay rail).
// Search stays raw on purpose (rights posture).
function cleanRail(items) {
  return dropLiveStreams(dropJunk(dropSocialMirror(dropBroadcastJunk(dropFutureDated(items || [])))));
}

if (SPINE_URL) {
  console.log(`[archive] SPINE transport active -> ${SPINE_URL}`);

  search = async (query, rows = 25, page = 1, sort = 'downloads desc') => {
    if (Date.now() < _archiveCircuitUntil) return []; // breaker: stop hammering a struggling spine/IA
    try {
      const r = await spineGet(`/search?raw=true&q=${encodeURIComponent(query)}&rows=${rows}&page=${page}&sort=${encodeURIComponent(sort)}`);
      _archiveFails = 0; // success closes the breaker
      return r.items || [];
    } catch (e) {
      console.error('[spine search]', e.message);
      _noteArchiveFail(); // feed the breaker so repeated spine/IA failures back off (was missing — search never tripped it)
      return []; // same degrade-to-empty contract the direct path has
    }
  };

  getItem = (identifier, opts) => spineGet(`/item/${encodeURIComponent(identifier)}${opts && opts.skipVet ? '?novet=1' : ''}`);

  getAllCategories = async (rowsPerCategory = 20) => {
    // Degrade to empty (NOT 500) when the spine is unreachable — e.g. while it restarts
    // after a crash. The /api/categories handler + warm guard treat [] as "keep last good /
    // warming", so the site stays up instead of throwing ECONNREFUSED 500s at users.
    let wall;
    try {
      wall = await spineGet(`/wall?type=video&rows=50`, 20000);
    } catch (e) {
      console.error('[spine wall] unreachable, serving empty:', e.message);
      return [];
    }
    return (wall.categories || []).map((c) => {
      const pool = dropLiveStreams(dropJunk(dropSocialMirror(dropBroadcastJunk(dropFutureDated(c.items || []))))); // future-spam (P3) + off-air captures + youtube mirrors (B) + dump/spam junk + bare-LIVE streams (B 2026-06-28, ALL wall rows)
      let items;
      if (/downloads/.test(c.sort || '')) {
        // Fixed downloads-sort rows (Most Popular): ACTUALLY rank by downloads — bucketSample
        // shuffled them, so 7-download spam led "the most watched films" (P3). No shuffle.
        items = pool.slice().sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, rowsPerCategory);
      } else {
        items = bucketSample(pool, c.diversify ? rowsPerCategory * 2 : rowsPerCategory, c.id);
        if (c.diversify) items = diversify(items, 2).slice(0, rowsPerCategory);
      }
      return { ...c, items };
    });
  };

  getCategoryItems = async (categoryId, rows = 25, page = 1, shuffle = false, gen = null) => {
    // Spine-registered crates (IA-collection additions) may not exist in the local CATEGORIES
    // array; serve them straight from the pool with generic flags instead of 404ing.
    const cat = CATEGORIES.find((c) => c.id === categoryId)
      || { id: categoryId, recognizable: false, diversify: false, mature: false };
    try {
      // Over-fetch for the diversify cap ONLY on page 1: against a finite pool, rows*2 paging
      // would jump the offset past the pool end (page 2 of a 50-pool at rows=50 returns zero).
      const fetchRows = (cat.diversify && page === 1) ? rows * 2 : rows;
      const r = await spineGet(`/category/${encodeURIComponent(categoryId)}?page=${page}&rows=${fetchRows}`);
      let items = dropLiveStreams(dropJunk(dropSocialMirror(dropBroadcastJunk(dropFutureDated(r.items || []))))); // future-spam (P3) + off-air captures + youtube mirrors (B) + dump/spam junk + bare-LIVE streams (B 2026-06-28)
      if (/downloads/.test(cat.sort || '') && !shuffle) {
        items = items.slice().sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      }
      if (shuffle) items = bucketSample(items, items.length, `${categoryId}:reroll:${Date.now()}`);
      // Diversify only on page 1: on a finite pool page the per-series cap starves the row
      // (25 raw -> 4 survivors when one series dominates); deeper pages serve the pool as-is.
      if (cat.diversify && page === 1) items = diversify(items, 2).slice(0, rows);
      if (gen) {
        const leaned = applyEraLean([{ ...cat, items }], gen);
        items = (leaned && leaned[0] && leaned[0].items) || items;
      }
      return { ...cat, ...(r.name ? { name: r.name, subtitle: r.subtitle, type: r.type } : {}), items };
    } catch (e) {
      console.error('[spine category]', e.message);
      return { ...cat, items: [] };
    }
  };
}

// ── HARD EXCLUDES: B's kill list ──────────────────────────────────────────────────────────
// hard-excludes.json ids vanish from EVERY surface. Wraps whatever search/getItem/category
// functions are live at this point (direct or spine transport), so one layer covers both
// paths. File re-reads every 60s — B edits and saves, no restart. Only B's rulings gate.
let _hex = { t: 0, ids: new Set() };
// Admin kill list from Supabase (hard_excludes table), injected by the backend's 60s poller and
// MERGED with hard-excludes.json. The spine has no Supabase, but prod enforcement runs in the
// backend's spine-transport wrappers (dropExcluded below), so this backend-injected set covers it.
let _extraHex = new Set();
function setExtraExcludes(ids) { _extraHex = new Set((Array.isArray(ids) ? ids : []).map(String)); }
function hardExcludes() {
  if (Date.now() - _hex.t > 60 * 1000) {
    _hex.t = Date.now();
    try {
      const j = JSON.parse(_vfs.readFileSync(_vpath.join(__dirname, "hard-excludes.json"), "utf8"));
      _hex.ids = new Set((j.ids || []).map(String));
    } catch (e) { /* keep last good list */ }
  }
  if (!_extraHex.size) return _hex.ids;
  const merged = new Set(_hex.ids);
  for (const id of _extraHex) merged.add(id);
  return merged;
}
// CSA / child-exploitation HARD BLOCK (B 2026-06-28: "look what just showed up" - børneporno +
// "Viols d'Enfants" surfaced on the wall). A categorical, fail-CLOSED title block so these don't
// have to be killed one identifier at a time. Applies to EVERY curated surface AND search (unlike
// the junk/quality filters, which leave search raw) - this is a legal/safety line, same posture as
// kids-fail-closed, NOT the rights/ethics-of-others filtering. High-precision terms only.
const CSA_BLOCK_RE = /b[oø]rneporno|kinderporno|child\s*porn|childporn|child pornography|kiddie\s*porn|viols?\s*d['’]enfants?|p[ée]dophil|paedophil|lolicon|shotacon|jailbait|\bcsam\b|child\s+(?:sex|sexual)\s*abuse|under\s?age\s+(?:sex|nude|porn)|minors?\s+(?:sex|nude|porn)/i;
function isCSATitle(it) {
  const t = Array.isArray(it && it.title) ? it.title[0] : (it && it.title);
  return !!t && CSA_BLOCK_RE.test(String(t));
}
function dropExcluded(items) {
  if (!Array.isArray(items)) return items;
  const kill = hardExcludes();
  return items.filter((it) => it && !kill.has(it.id) && !isCSATitle(it));
}

// ── FOREIGN GATE (B: "foreign needs gating unless selected, new cat to catch") ──────────
// Foreign-language items leave the GENERAL rows and collect into the existing 'foreign'
// row — gated unless selected, never deleted. Detection: non-Latin scripts + explicit
// language markers in the title. anime/foreign/show/mature rows are exempt; SEARCH is
// never sifted (the raw law).
const FOREIGN_SCRIPT = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ一-鿿぀-ヿ가-힯฀-๿]/;
const FOREIGN_MARK = /\b(espa[nñ]ol|latino|castellano|subtitulado|dublado|legendado|en fran[cç]ais|vostfr|deutschsprachig|auf deutsch|po polsku|на русском|русская версия)\b/i;
const FOREIGN_EXEMPT = new Set(['foreign', 'anime']);
function isForeignTitle(t) {
  t = String(t || '');
  return FOREIGN_SCRIPT.test(t) || FOREIGN_MARK.test(t);
}
function siftForeign(cats) {
  if (!Array.isArray(cats)) return cats;
  const caught = [];
  const out = cats.map((c) => {
    if (!c || FOREIGN_EXEMPT.has(c.id) || c.group === 'show' || c.group === 'hindi' || c.mature) return c;
    const keep = [];
    for (const it of (c.items || [])) {
      if (it && isForeignTitle(it.title)) caught.push(it);
      else keep.push(it);
    }
    return { ...c, items: keep };
  });
  const f = out.find((c) => c && c.id === 'foreign');
  if (f && caught.length) {
    const seen = new Set((f.items || []).map((i) => i && i.id));
    f.items = [...(f.items || []), ...caught.filter((i) => i && !seen.has(i.id))].slice(0, 60);
  }
  return out;
}
{
  const _search = search;
  search = async (...a) => dropExcluded(await _search(...a));
  const _getItem = getItem;
  getItem = async (identifier, opts) => {
    const cleanId = String(identifier || "").replace(/:\d+$/, "");
    const _removed = () => ({
      id: cleanId, title: "This item has been removed from VOIDtv.", description: "",
      year: null, creator: null, duration: null, thumbnail: null,
      archiveUrl: `${BASE}/details/${cleanId}`, videoUrl: null, videoUrlHQ: null,
      videoSize: null, videoFormat: null, availableFormats: [], excluded: true,
    });
    // Direct links die gracefully: known shape, no video, clearly marked.
    if (hardExcludes().has(cleanId)) return _removed();
    const it = await _getItem(identifier, opts);
    if (isCSATitle(it)) return _removed(); // CSA hard block also covers direct links
    return it;
  };
  const _getAll = getAllCategories;
  getAllCategories = async (...a) => siftForeign(((await _getAll(...a)) || []).map((c) => ({ ...c, items: dropExcluded(c.items) })));
  const _getCat = getCategoryItems;
  getCategoryItems = async (...a) => {
    const r = await _getCat(...a);
    if (!r || !r.items) return r;
    let items = dropExcluded(r.items);
    // Single-row fetches: gate foreign out of general rows (no catch destination here —
    // the items remain in the foreign row on the wall and in raw search).
    if (!FOREIGN_EXEMPT.has(r.id) && r.group !== 'show' && r.group !== 'hindi' && !r.mature) items = items.filter((it) => !it || !isForeignTitle(it.title));
    return { ...r, items };
  };
}

module.exports = {
  CATEGORIES,
  NSFW_EXCLUDE,
  MATURE_TITLE_RE,
  search,
  diversify,
  parseRuntimeSeconds,
  getItem,
  getRelated,
  getCategoryItems,
  getAllCategories,
  applyEraLean,
  applyWallRecencyFloor,
  MODERN_IDS,
  MODERN_LABELS,
  setExtraExcludes,
  searchCollection,
  searchCreator,
  normalizeItem,
  THUMB_URL,
  FILE_URL,
};
