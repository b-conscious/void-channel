# VOIDtv — Episode Fan-Out (design + build, AGREED 2026-06-13)

Surface every video file inside a bundled IA item as its own episode, instead of collapsing
the whole item to one picked video under a mislabeled item title. B's decision; Option B
(contained). This is the working spec; amendments from review are folded in below.

## DECISION + APPROACH
- Do the fan-out. Unit becomes the FILE, but via CONTAINED expansion: pool stays keyed by IA
  identifier; a small amount of fan-out data is added to the row and EXPANDED into cards at
  wall-build. Single-video items behave EXACTLY as today (is_bundle=0, pickVideos unchanged).
- Rejected: re-keying the pool by identifier+filename (high blast radius vs a live box).

## AMENDMENTS FROM REVIEW (agreed with B)
1. WALL EXPLOSION FIX (changes the original section 4): in GENERAL rows a bundle emits ONE
   show/season card (tap -> the season grid / in-order queue), NOT one card per episode. The
   full per-episode fan-out lives in the SERIES/CATALOG view + the in-order queue (slice-32).
   Fan-out ENRICHES the season experience without flooding browse or bloating the payload.
2. POPULATION = a metadata fetch per item. fan-out needs files[], which only getItem returns
   (sync uses archive.search, no files[]). So is_bundle is populated EAGER-GATED: the
   self-healing scheduler (d86eed8) backfills incrementally when the breaker is closed + IA
   healthy (one getItem per item; ~17k over many cycles = days), PLUS lazily at getItem when a
   user opens an item (opportunistic). The wall shows a collapsed item until it has been fanned.
3. ENGAGEMENT IDS: a fanned episode saves/hearts/views under the composite id (per-episode
   semantics — each episode is its own thing). Verify hearts/watch_history/watchlist + the
   player queue round-trip the "::" id; views are per-episode (splits a bundle's counts, OK).
4. ROUTE SAFETY: card id = `${identifier}::${fileIndex}`; PlayerScreen/getItemSeries split on
   "::". fan_version + filename fallback guard index drift; verify "::" survives the web
   /watch/:id deep-link round-trip.

## SCHEMA (additive only, no key change)
pool/video row gains: is_bundle INTEGER 0/1; fanned TEXT(JSON array | null); fan_version INTEGER.
fanned[] entry: { file, contentType (episode|music_video|trailer|extra), season, episode,
episodeTitle, displayTitle, confidence, source (filename|wikidata|item_title_fallback) }.

## FAN-OUT LOGIC (spine/fanout.js — BUILT + TESTED, slice 67)
Pure module, no IA / no DB. computeFanOut(meta, parseRuntimeSeconds):
- filter files[] to playable video by ext (skip *sample*, >1MB), reuse the pickVideos screen.
- <=1 playable video -> null (not a bundle; pickVideos as today).
- per file: classify (filename keyword > duration; explicit SxxExx overrides duration) +
  parseFilename (the slice-2 patterns run against the FILENAME — note trailing assertion is
  (?!\d) not \b, because "_" is a word char and \b fails on S02E04_Title) + assembleTitle.
- GATE: fan out ONLY when >=1 file parsed a real episode number; a messy no-S/E multi-video
  item stays a single card (could be a film collection, not a show).
Wikidata enrichment (slice-27, reused not rebuilt): the bundle's show name -> wbsearchentities
+ CirrusSearch + P31/P279* verify; canonical name + episode titles where Wikidata lists them.
Title enrichment only; does not gate whether a card shows.

## PLAYBACK (getItem gains a file selector)
getItem(identifier, opts): when opts.file / opts.fanIndex is present, resolve THAT file's
videoUrl directly and SKIP pickVideos. Absent -> pickVideos as today (additive, default path
unchanged). Playback otherwise unchanged: same archive.org file URL, same player, no buffering
impact. PLAYABILITY VET runs per file now = an IA call, so it MUST respect the circuit breaker
(slice-66): breaker open -> defer the vet, resolve on seeded/cached verdict; never let fan-out
reopen the tarpit. Vouched content skips the vet (skipVet).

## SERIES RAILS (slice-32 — the payoff)
itemSeries treats a bundle's fanned episodes as show members ordered by (season, episode); the
in-order queue plays through the bundle's files then continues to sibling items in the same
verified series. Mostly wiring existing parts.

## WALL RULES (apply per emitted card)
10% void-TV ratio counts expanded cards; recency-first; foreign gate (slice-48); hard-excludes
(slice-41, now per-file matchable); mature corral (MATURE_TITLE_RE) on the per-file
displayTitle/id; kids fail-closed (a fanned file shows on kids only if the parent is vouched).
Corralled music_video/trailer/extra are reachable via an "extras" link on the parent (open-Q
default (a)), never silently deleted.

## FILES TOUCHED (lock declaration, as built)
- spine/fanout.js (NEW, slice 67) — computeFanOut/classify/parseFilename/assembleTitle. DONE+TESTED.
- spine/test-fanout.js (NEW) — 14 offline tests vs synthetic manifests. PASS.
Remaining seams (next slices, throttle-safe except backfill):
- spine archive.js: call computeFanOut at getItem/ingest; getItem file selector. SPINE RESTART.
- backend archive.js: mirror the getItem file-selector passthrough (same file, both processes).
- pool schema/sync: add is_bundle/fanned/fan_version; populate.
- wall/category builder: expand is_bundle rows into ONE season card (general) / full episodes
  (series view); apply existing screens per card.
- series module (slice-32): accept fanned episodes as members.
- PlayerScreen/nav: parse "::" ids; pass file selector to getItem.
- normalizeItem: carry displayTitle/contentType onto the card model.

## BUILD ORDER (throttle-aware)
1. [DONE] spine/fanout.js pure module + offline tests.
2. Pool schema additions (additive).
3. getItem file selector (additive).
4. Wall build-time expansion (season card in general rows; full episodes in series view).
5. Series-rails wiring.
6. Backfill, GATED on IA healthy (after the throttle clears; incremental via the scheduler).
Steps 1-5 compute off metadata; step 6 is the only one that waits on IA.

## DOES NOT TOUCH
Playback/buffering (same URL/player); single-video items; Wikidata logic (reused); the circuit
breaker / hard-abort (respected, never bypassed); seeded wall/catalog (keep working).
