# JOB_13 HANDOFF: Source adapters, slices 1 + 2 (Wikidata gems, NASA, Commons)

Status: BUILT and verified locally 2026-06-11. Local only, nothing pushed, prod untouched.
STANDING RULING (B, 2026-06-11): the live OG build stays working until the upgraded build is
clean. No pushes to master. This supersedes the marching orders' Move 1 cutover-first order.
Lockfile protocol enforced from the start: docs/BASELINE.md5 + docs/LOCKFILE_JOB13.md. Drift
audit at slice end: zero undeclared changes. backend/* and mobile/* byte-identical.

## What exists
- `spine/adapters/nasa.js` NEW: the template source adapter. Keyless images-api.nasa.gov, all
  public domain. `fetchPage` for sync, `getFullItem` for detail. Emits the exact normalizeItem
  list shape plus `source: 'nasa'`. Ids namespaced `nasa:<nasa_id>`; videoUrl prefers the
  ~medium mp4, HQ the ~orig/~large.
- `spine/adapters/wikidata.js` NEW: the index, not a source. One SPARQL pass at sync time:
  films (P31 in film classes) with IA ids (P724) and PD status (P6216=Q19652), ranked by
  sitelinks, LIMIT 300. Dedupes IA mirror ids per film (first wins, all mirrors recorded as
  iaAliases). Writes the new `enrichment` table keyed by BARE IA id and fills the
  `gems_wikidata` crate. Gems keep bare IA ids: playback rides the existing archive.js path.
- `spine/db.js`: additive `enrichment` table + enrichSet/enrichGet.
- `spine/sync.js`: categories with `cat.source` dispatch to their adapter; the IA path is
  untouched. Empty/failed adapter draws leave last-known-good pools (same contract as IA).
- `spine/mappers.js`: `getDetailedItem` dispatches on id prefix (`nasa:`); bare ids unchanged.
- `spine/categories.js`: +3 crates. `nasa_missions`, `nasa_apollo` (source nasa),
  `gems_wikidata` (source wikidata). 109 -> 112 registered. Names are placeholders, B rewrites.
- `fixtures/fixtures.json`: +2 real fixtures (a NASA video with a space in its id, and
  `royal_wedding` as the enriched-gem representative). wikibase-sdk installed per the toolkit
  ruling, with a manual URL fallback so a packaging change can never park the gems crate.

## Verified acceptance (live probes, spine on :3002)
- Fixture run: 12 of 12 real fixtures map, both new ones PLAYS, the original 10 unchanged.
- `/item/nasa:NDTV000908...` resolves a playable images-assets.nasa.gov mp4 through the
  normal item endpoint. `/category/gems_wikidata` serves enriched items (Royal Wedding,
  Stanley Donen, 1951, genres as subjects, qid + sitelinks attached).
- `/wall?type=video` now carries 88 crates including all three new ones. Health: 112 cats,
  pool_total 5588 (gems 169 unique films from 300 ranked rows, nasa 50+50).
- Restart against the existing db: no re-sync, pools intact (the JOB_0 guarantee held).
- Enrichment sample: royal_wedding -> {qid Q538600, directors, genres, year, iaAliases}.

## Failures hit and resolved
1. First SPARQL draw returned books and Quran scans (Book of Mormon was the top "gem"):
   P724+P6216 alone matches ANY PD entity with an IA id. RESOLVED with a VALUES film-class
   constraint (film, silent film, animated, short, TV film, serial).
2. Same film arrived under 3 mirror IA ids (Battleship Potemkin x3). RESOLVED with per-qid
   dedupe; mirrors kept as iaAliases in the enrichment row (future fuel for the standing
   rabbit-hole dedupe debt).
3. NASA asset manifests return http hrefs with literal spaces. RESOLVED: https upgrade +
   encodeURI in the adapter.

## Determinations pending (B)
- Crate names/subtitles and wall placement for the three new crates (all currently active,
  group 'type', LOCAL ONLY until prod cutover; prod still runs direct Archive paths).
- Which mirror id a gem should prefer when several exist (currently first by rank; the right
  answer is the playability/throughput gate, next slice).
- Throughput floor values (the streaming-reliability gate, not yet built).
- NASA key (api.nasa.gov) only if non-images NASA endpoints are wanted later; images API needs
  none. AAPB application: submit early, approval is slow.

## Slice 2: Wikimedia Commons (B re-ruled it IN, 2026-06-11)
Demotion reason aged out: iOS Safari plays WebM since iOS 15 (full on 17.6+). B's ruling:
no playability gate, a simple "may have issues on iOS" notice instead; items carry
`stream_format: 'webm'` and the frontend renders B's banner copy off that flag (copy is his,
lands with the upgraded frontend). `spine/adapters/commons.js` NEW: full-text file search
(rotation via sroffset), batched videoinfo for list metadata, detail resolves server-side
VP9 webm transcodes (mid-size as videoUrl, largest as HQ, original only when no transcode).
Rights capture free via extmetadata LicenseShortName (rights INFORMS, never gates). Crates
commons_timelapse + commons_aerial (queries validated live: 4516 and 2614 hits). Verified:
50+50 synced, /item/commons:122663668 serves CC BY 3.0 + webm flag + transcoded URL over
HTTP, fixture added and PLAYS, 114 categories total, restart kept pools. Tubi was assessed
the same day and is structurally impossible as a source (no API, licensed content);
availability LINK-OUTS via Wikidata/Watchmode remain the only viable Tubi shape.

## Deferred to later slices (named, not forgotten)
- Rights capture (licenseurl in the IA fl[] set): touches backend/archive.js, kept LOCKED
  while prod cutover is pending.
- Streaming-reliability gate (range-request sampling, stream_ok flag) + ffprobe codec truth.
- LoC adapter, AAPB adapter, Commons (demoted), episode grouping pipeline (TMDB attribution).
- Enrichment merge into OTHER crates' items (the map exists; nothing reads it outside gems yet).
