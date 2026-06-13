# LOCKFILE: the upgrade build (JOB_13 onward)

## SLICE 66 (IA RECOVERY FIX, SHIPPED 414bb56): Render logs proved archive.org TARPITS our
## throttled IP — requests HANG ~30s ("[spine search] The user aborted a request" /
## "/api/search -> 200 (30170ms)"), not a 429/403. node-fetch's soft `timeout` does NOT fire
## under a tarpit, so hung connections piled up and kept IA from ever seeing a QUIET window to
## expire the throttle (block dragged hours = self-inflicted). FIX: archive.search, getItem,
## and the vet _rangeFetch now hard-abort at 8s via AbortSignal.timeout (was the ignored
## `timeout: 15000`); getItem also fails fast to the no-video fallback when the breaker is open
## and feeds _noteArchiveFail on failure. Fail fast -> trip breaker -> back off -> go QUIET ->
## IA releases the IP. Dormant when IA is healthy (<1s). Low-risk: 8s > occasional fail on a
## genuinely-slow query (tunable); search+getItem share one breaker (intentional, a transient
## search blip can <=60s short-circuit playback). UNLOCKED: backend/archive.js.
## RESULT: shipped + verified live (new build spine:up, degraded:false). Recovery pending —
## the throttle needs time to expire now that we are quiet. (Detail: SESSION_FULL_2026-06-13.md
## section 3.)

## SLICE 56 (declared before edit): P8 — SPINE DEATH WAS SILENT (blanked the whole wall +
## search with no signal). Two diagnostic fixes, no behavior change: (1) /health pings the
## spine (1.5s timeout) and reports { spine: up|down, degraded } so monitoring/loop flows
## catch a dead spine instantly instead of via a blank wall; (2) start-void.cmd redirects
## each server's stderr to spine-error.log / backend-error.log so a silent crash leaves a
## trace (the reason vanished with the window today). Logs gitignored + baseline-excluded.
## A client-side "reconnecting" state is the user-facing half — deferred to B (mobile/src,
## bigger; logged in sweep P8). UNLOCKED: backend/server.js, start-void.cmd,
## docs/LOCKFILE_JOB13.md, docs/DEBUG_SWEEP_2026-06-12.md.
## RESULT: shipped + verified both ways. Spine up -> {spine:up,degraded:false}; killed the
##   spine -> {spine:down,degraded:true}; restarted -> green again. Error-log redirect armed
##   (files appear on first stderr; clean now = none, as expected).

## SLICE 55 (declared before edit): P4 — STALE SEARCH. A plain text query used a FIXED
## downloads-desc sort, so searching "X" returned the identical top forever. Fix: rotate the
## default sort over a 6h bucket keyed by the query (downloads/week/month/avg_rating — all
## quality-biased, no recency/year that surface fresh junk). Stable within a session
## (pagination consistent), fresh across time; relevance preserved because the query still
## constrains every result. Explicit ?sort, category/collection/creator keep their order.
## UNLOCKED: backend/server.js, docs/LOCKFILE_JOB13.md, docs/DEBUG_SWEEP_2026-06-12.md.
## RESULT: shipped + verified. Sort selection cycles all 4 across buckets (node proof); live
##   "charlie chaplin" -> week desc this bucket, returns 4 real matches. NOTE: the long
##   0-hits debug detour was the SPINE being DOWN (backend degrades to empty silently when
##   spineGet fails) — NOT this change. Restarted spine; logged as new sweep item P8.

## SLICE 54 (declared before edit): P3 — MOST POPULAR LED BY FUTURE-DATED SPAM. Two stacked
## bugs: (1) the sync rotated most_popular through SORTS incl. 'year desc', which ranks fake
## "2037 Convention" JW spam FIRST -> the all-time pool filled with 7-download future junk;
## (2) the wall builder bucketSample-SHUFFLED even fixed-sort rows, so downloads order was
## destroyed. Fixes: sync respects a category's FIXED sort (most_popular -> downloads desc,
## no rotation) + drops future-dated items at ingestion (notFutureDated, pool-only, search
## untouched); serve-side dropFutureDated + real downloads-rank (no shuffle) on downloads-sort
## rows + dropJunk screen for high-download NON-FILM spam (capcut/iptv/m3u/whatsapp/keygen).
## Purged 50 already-poisoned pool rows from spine.db. UNLOCKED: backend/archive.js,
## spine/sync.js, docs/LOCKFILE_JOB13.md, docs/DEBUG_SWEEP_2026-06-12.md (spine.db = runtime,
## unlocked by definition).
## RESULT: shipped + verified. Most Popular: 0 future-dated, 0 capcut/iptv; now leads with
##   real high-download content (Spider-Man TAS, Anpanman, Rick Astley, Unus Annus, VHS
##   captures) properly ranked by downloads. Residual: 2 Spanish-titled oddities of unclear
##   quality remain (not clearly spam; NOT filtered — would be guessing). Re-locked.

## SLICE 53 (declared before edit): P2 — VOID SNACKS SERVED ADULT-BRAND PROMO on the ungated
## default wall ("Playboy TV Promo"). The query NSFW_EXCLUDE is subject/collection-based, so
## an adult-brand item in a mainstream collection (classic_tv_commercials) was untagged and
## passed; the snacks' generic-word title regex had no BRAND names; it matched the commercials
## pool's \bpromo\b keep. Fix: archive.MATURE_TITLE_RE — a shared, word-bounded brand+marker
## screen (playboy/penthouse/hustler/strip-club/lingerie/adult-film/18+/hentai/...), applied
## as the snacks NSFW title filter. CORRAL NOT CENSOR: items stay in search + behind the 18+
## gate, only off ungated surfaces. False-positive guards verified (Comic Strip / Essex /
## Sussex / Victoria-alone pass). UNLOCKED: backend/archive.js, backend/server.js,
## docs/LOCKFILE_JOB13.md, docs/DEBUG_SWEEP_2026-06-12.md.
## RESULT: shipped + verified. 13/13 regex unit cases pass; live snacks = 23 clean items
##   (real trailers/spots), 0 adult-brand. (Cold-start right after restart briefly serves 0
##   snacks until the IA pools warm — expected, self-heals.) Re-locked.

## SLICE 51 (declared before edit): P1 — KIDS NETWORK CHANNELS MISSING FROM THE WALL.
## Cold ?kids=1 served 1 of 10 channels in 150s and the partial got cached 10m. Root causes,
## fixed in layers: (1) vouched kids resolve ran the slice-36 playability vet -> a ranged GET
## per file -> request storm; threaded skipVet through resolvePick -> getItem -> spine
## /item?novet=1 -> mappers (vouched content is B-approved, the player graceful-skip is the
## net). (2) NO resolved-item cache: the spine video path re-fetched IA for all ~240 tapes on
## every build; added a 6h _resolved cache in mappers.getDetailedItem (the actual storm fix).
## (3) full-parallel Promise.all over 240 ids; added mapLimit(5) concurrency cap. (4) partial
## builds armed the 10m cache; now best-so-far shows immediately but the 10m lock arms ONLY
## on a full build, and never regresses a fuller cache. (5) boot warm + 10m re-warm moves the
## cold build off the first kid's request (also fixes P5 latency).
## UNLOCKED: backend/server.js, backend/archive.js, spine/spine.js, spine/mappers.js,
## docs/LOCKFILE_JOB13.md, docs/DEBUG_SWEEP_2026-06-12.md.
## RESULT: shipped + verified. Cold build now resolves all 10 channels; served wall = 10
##   channels with tapes (saturday_morning/fox_kids/kids_wb/cartoon_network/pbs_kids 12 each,
##   cbs 7, nick 7, abc 5, disney 4, nbc 3), 0 junk/actinf. Full wall 6.7s (was 171s/blank),
##   channels cached 10m, boot-warmed so the first kid meets a ready wall. Re-locked.

## SLICE 50 (declared before edit): VOID TVs = 10% OF CARDS, HARDWIRED (B's STANDING RULING,
## stated firmly: "i want this hard wired as im tired of it not being accepted and lost").
## Replaces the slice-45 "1-in-5 rows, one tile" with a per-CARD ratio: insert a void TV
## after every ~9th real card across ALL non-kids rows so ~10% of rendered cards are TVs.
## First-insertion offset by row-id hash so TVs don't stack into one vertical column. Each
## tile is a fresh VoidLoader instance -> VoidLoader's _staticVideoSeq gives each a unique
## 10s-staggered start (already built). Lazy-load (slice 45) keeps only near-viewport tiles
## mounted, so more tiles != load storm. Stream stays ONE swappable URL (B swaps the file
## over time, no code change). Kids/vouched lanes excluded. Constant VOID_TV_CARD_RATIO is
## B-LOCKED: any change needs his explicit go. Saved to memory: voidtv-void-tv-cards.
## UNLOCKED: mobile/src/components/CategoryRow.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. VOID_TV_CARD_RATIO=0.10 -> 1 TV per 9 real cards = exactly
##   10% by construction (tiles/(cards+tiles) = (1/9)/(10/9) = 1/10). Live: 14 tiles across
##   rows, hash-offset so columns don't stack, staggers distinct (10s/18s observed),
##   lazy-load mounted only the 2 in-viewport videos (density != load storm). One swappable
##   stream URL. Re-locked into BASELINE.md5.

## SLICE 46 (declared before edit): player viewport (B: static video "forces an
## uncomfortable sliver viewing" for comments). Desktop left column becomes ONE ScrollView
## (video + info panel together) so the video scrolls away and the info gets full height.
## UNLOCKED: mobile/src/screens/PlayerScreen.js, docs/LOCKFILE_JOB13.md.

## SLICE 47 (declared before edit): related rail junk + sameness (B's screenshot: "!"
## Twitch-mirror cards identical across most videos). Mechanism: tier-1 same-collection
## seeds sort titleSorter ASC and "!" sorts FIRST — giant mirror collections give every
## member the same "!"-led rail; hasRealTitle only drops contentless titles. Fix: drop
## ^!-prefixed titles in related (both tiers); page the collection slice by item-id hash so
## same-collection items get different rail windows. UNLOCKED: backend/archive.js.

## SLICE 48 (declared before edit): FOREIGN GATE (B: "foreign needs gating unless
## selected. new cat needed to catch" — French politics leading noir/hero). Detection:
## non-Latin scripts + explicit language markers in title. Wall assembly moves detected
## items OUT of general rows and INTO the existing 'foreign' row (the catch category);
## 'foreign' and 'anime' rows exempt; SEARCH untouched (raw law). UNLOCKED:
## backend/archive.js (the serve-wrapper layer).
## RESULTS 46-48 (all verified): (46) desktop video scrolls away with the page — one
##   ScrollView owns video+info (verified: video top moves on scroll; full height for
##   comments once loaded). (47) related rail: 0 "!"-titles served for a mirror-collection
##   item, rails now window different collection pages per item (hash-paged, page-1
##   fallback). (48) noir face clean of French politics; foreign row caught 25 items;
##   search untouched.
## ============ CHECKPOINT RE-LOCK 2026-06-12 evening ============
## B's order: surgical md5 discipline restored. BASELINE.md5 REGENERATED at this point —
## slices 24-48 are now the locked baseline. Every subsequent edit must be declared here
## FIRST and audited against the NEW baseline after. Next session: the absolute debug
## sweep (B: staleness symptoms, accumulated small breaks — find and fix surgically).

## SLICE 44 (declared before edit): THE NONSENSE WALL (B: "yesterday we had actual
## enjoyment... now its mainly nonsense everywhere. its degrading"). Diagnosed with payload
## data: genz era window is 2005->NULL (unbounded) with year-desc sort, so every leaned row
## FACES with the newest-DATED uploads — 2026 town-council meetings, iPhone gameplay rips,
## mirror spam, and even future-dated garbage (2037 JW conventions). "Lean recent" became
## "newest junk first". Fix: (1) cap genz anchor at 2022 so the face is the 2005-2022
## generational core and the 2024-2026 upload wave TRAILS by proximity; (2) year sanity in
## applyEraLean — years > now+1 are metadata garbage, treated as unknown. NOTE surfaced to
## B, not changed: Most Popular is lean-exempt (authored downloads sort) and still leads
## with high-download JW convention spam — separate curation call.
## UNLOCKED: backend/archive.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. genz faces now: horror leads 2009-2012 features, afterschool
##   leads K-12-era, toy ads lead Transformers spots — recognizable in-era texture restored,
##   zero meetings/2037/gameplay in any checked face.

## SLICE 45 (declared before edit): VOID TVs AS CARDS (B: "use the void tv video to place
## instead of actual cards somewhere at all times" — he doesn't see the sparse 1-in-6 row
## TVs). CategoryRow: a deterministic 1-in-3 of rows (id hash) carries a void TV TILE at
## card slot 3 — always there, web only, persist blink-cycle, card-sized. Kids rows and
## vouched lanes excluded (kids_*/pbs_kids/saturday_morning — sunny UI, no slot theft).
## The 1-in-6 full-width wall TVs stay as the big set pieces.
## UNLOCKED: mobile/src/components/CategoryRow.js, mobile/src/components/VoidLoader.js
## (lazy-load amendment), docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified, two iterations. First cut (1-in-3 rows) mounted 20
##   simultaneous videos of the same stream -> Chrome stalled ALL at readyState 0 (the load
##   storm). Final: 1-in-5 rows + LAZY LOAD — each TV mounts its <video> only near the
##   viewport (IntersectionObserver + a rect-poll belt, because IO never fires in hidden
##   tabs). Verified: exactly 1 TV mounted in-view, readyState 4, staggered to 85s.
##   Playback needs a visible tab (preview is hidden; B's browser plays). Tile slots are
##   deterministic (row-id hash) so they sit in the SAME rows every load, web only, kids
##   and vouched lanes excluded.

## SLICE 43 (declared before edit): two B orders. (1) KILL "ActInf GuestStream 115.1"
## from kids saturday — it rides the saturday_morning MACHINE crate (id
## archive-org_85ob-jrG7xQ, a YouTube-mirror rip). Kid-scoped per his wording: KIDS_BLOCK
## gains |actinf (covers every ActInf stream; backstop already wired through all kids
## lanes incl. machine crates since slice 25). (2) VOID INTRO SOUND on desktop: browsers
## block unmuted autoplay pre-gesture; intro now TRIES unmuted first (works when the
## browser has an engagement history for the site / PWA), falls back muted + unmutes on
## the FIRST gesture anywhere. Mobile keeps muted (B: "i get it wont work on mobile").
## UNLOCKED: backend/server.js, mobile/src/components/VoidIntro.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. (1) ?kids=1 payload: 0 actinf hits after restart. (2) Intro
##   verified in preview: plays UNMUTED immediately when the browser has site engagement
##   (B's daily case); fresh visitors get muted -> unmute on first gesture anywhere. ENTER
##   button unmute path unchanged as the final fallback. ALSO: B dropped a 16-sheet NEON
##   CRT ICON SYSTEM (labeled sheets per surface: Header/Top Bar, search suite...) — the
##   aesthetic remodel material. Extracted to temp, INVENTORIED, NOT integrated (his call
##   on direction first; sheets need slicing into individual assets before any use).

## SLICE 42 (declared before edit): the disappearing wall TVs (B: "saw the void video
## staggered by 10s across the wall like i had wanted and now i no longer do"). Root cause
## is StaticVideo's own lifecycle: every instance blinks out after 20-40s and settles to
## PulsingVoid PERMANENTLY (blinkedOut never resets) — the wall's TV field dies within a
## minute of load. Fix: new `persist` prop — wall TVs (HomeScreen 'tv' rows) now CYCLE
## (power-off, dark 0.7-2.5s, power back on at a fresh staggered offset), loading-row TVs
## keep the one-way blink-out (a load should never show video forever).
## UNLOCKED: mobile/src/components/VoidLoader.js, mobile/src/screens/HomeScreen.js,
## docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified live. Two bugs deep: (1) the one-way blinkOut (fixed with
##   persist+cycle), then (2) my first cycle implementation cleared its own relight timer
##   on the dark flip (effect cleanup) — TVs stuck dark as pulsing VOIDs. Relight now lives
##   in its OWN effect. Verified: 6 TVs playing, phases spread across the 116s stream
##   (17/50/107/114...), each blink advances the phase + 0-6s jitter, field flickers
##   forever. Loading-row TVs keep one-way blink-out. NOTE: initial mounts can briefly
##   cluster before the first cycles spread them — self-heals in 20-40s, cosmetic.
##   ALSO: Expo on :8081 is now owned by the Preview tool (old orphaned background-shell
##   expo killed); B's start-void.cmd has the commented expo line if it ever needs manual
##   relaunch. Dead VOID terminal windows (9) closed; live spine/backend windows kept.

## SLICE 41 (declared before edit): HARD EXCLUDES — B's kill switch (his ruling class:
## "only Bryan's own rulings gate"). First kill: sctvct-Underrated_Transformers_Show.
## No per-item exclude existed (only kids blocklist + NSFW query filter). New:
## backend/hard-excludes.json {ids:[...]} (B-editable, 60s re-read, no restart) enforced in
## archive.js at the chokepoints: both search paths (spine transport + direct) filter ids
## out of every payload; getItem returns the no-video shape for killed ids (direct links
## die gracefully). Spine pool + grouping rows for killed ids deleted so library/catalog
## can't resurface them. UNLOCKED: backend/archive.js, backend/hard-excludes.json (new),
## docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. Wrapper layer sits AFTER the transport reassignments so one
##   filter covers both spine and direct paths (search/getItem/getAllCategories/
##   getCategoryItems). Killed item: /api/item returns excluded:true + null videoUrl
##   ("This item has been removed from VOIDtv."), search returns 0 hits, spine pool row
##   purged (1 deleted; was in 'hunted'). Future kills: add the id to hard-excludes.json,
##   live within 60s, no restart.

## SLICE 40 (declared before edit): B's VT swirl icon (Downloads/704d0021-...jpg) becomes
## the PWA/taskbar icon set: icon-192.png + icon-512.png regenerated from his art (square
## canvas, dark #0c0c0f backfill matching theme_color so the circle sits on the app's
## black, not white) + favicon. Manifest already points at these paths; no manifest edit
## needed unless favicon is added. UNLOCKED: mobile/public/icon-192.png,
## mobile/public/icon-512.png, mobile/public/favicon.png (new), mobile/assets/favicon.png
## (expo tab icon, app.json already points there), docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. Circle-masked onto VOID black (#0c0c0f) so the white-corner
##   source art sits clean on dark taskbar/tab; 512/192/64 generated LANCZOS; all serve 200
##   on :8081 with fresh sizes; eyeballed the 192 render. NOTE for B: an already-installed
##   PWA caches its icon — uninstall + reinstall via the INSTALL pill to see the new one on
##   the taskbar. Native app icon (app.json "icon") is the native lane's job later.

## SLICE 39 (declared before edit): ARCHIVIST RIGHTS-GATING (B's screenshot: it refused
## "dragon ball z" as "still under copyright — not in the public-domain collection" while
## IA serves pages of it). Root cause: NOT a hard rule — the persona line + tool description
## both say "public-domain video library", and the model infers refusals from that framing.
## Violates B's standing ruling (rights inform, never gate; VOIDtv points at what IA serves;
## only B's rulings gate). Fix: strip "public-domain" framing, add an explicit RIGHTS
## POSTURE rule (never refuse/lecture on rights; if IA serves it, it's recommendable; IA's
## hosting calls are IA's). Rule 2 (explicit content -> mature corral) is B's OWN ruling and
## stays. UNLOCKED: backend/archivist.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped. Persona + tool description now say "everything Archive.org hosts and
##   serves"; new HARD RULE 5 RIGHTS POSTURE (never refuse/lecture/hedge/speculate on
##   rights; search whatever is asked; only rule 2 declines). Backend restarted with it.
##   Live test is B's (Archivist needs his session): re-ask "dragon ball z".

## SLICE 37 (declared before edit): GATE THE TV/MOVIES DOORS (B, twice: "they still contain
## junk and thats not where that goes. we have areas to search that"). The TELEVISION and
## FULL LENGTH FILMS spotlight cards feed from RAW machine crates (tv_movies,
## feature_length) — junk-rich by construction. Curated doors must serve verified content:
## both spotlights now route into the catalog (catalog:'series' / catalog:'movies', the
## same destinations as the slice-24 SHOWS/MOVIES cards) and their rotating thumbnails draw
## from getCatalogSeries/getCatalogMovies instead of the raw crates. Raw crates stay on the
## wall rows + in search (the hunt is untouched; the DOORS are clean).
## UNLOCKED: mobile/src/screens/HomeScreen.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified on screen. Both spotlights fetch /api/catalog/* (10 rows) for
##   thumbnails; TELEVISION click lands on the verified shows grid (31 shows), MOVIES on the
##   film catalog. Movie preview thumbs play directly (films are items); series thumbs go to
##   the grid (show cards aren't playable). Raw tv_movies/feature_length crates untouched on
##   the wall and in search.

## SLICE 38 (declared before edit): THE HUNT FEEDS THE CATALOG + live series guess (B's
## screenshot flow: search -> open Celebrity DeathMatch -> sidebar should already be
## grouping "like" + a see-more-of-X tab; "everytime a search is done by anyone bringing
## new content in, scan it and add it"). Three parts:
## (a) spine POST /catalog/ingest (admin): pool the opened item under a synthetic 'hunted'
##     crate + grouping title-parse; the next verifyPass wikidata-verifies new keys, so
##     user hunting GROWS the catalog (junk stays out: catalog face still needs conf>=0.85;
##     'hunted' is not on any kids allowlist, fail-closed).
## (b) backend /api/item fires ingest to the spine (fire-and-forget) for every successfully
##     resolved non-fallback item. Opened-item-only by design — raw search RESULTS are not
##     ingested wholesale, opening is the curation signal.
## (c) client PlayerScreen: when the item has no verified grouping, derive a series GUESS
##     from the title (client twin of grouping.parseTitle); auto-fetch show-mates into a
##     "MORE OF THIS SHOW" block atop the sidebar + a "(SHOW)" chip = the see-more tab.
##     Works for never-seen content; kids untouched.
## UNLOCKED: spine/spine.js, backend/server.js, mobile/src/screens/PlayerScreen.js,
## docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified end-to-end on B's exact flow. Opening Celebrity DeathMatch:
##   (a) ingest fired -> spine pool 'hunted' row + grouping celebrity-deathmatch (title 0.6;
##   singletons skip wikidata verify by design — catalog face needs 2+ episodes; once more
##   deathmatch items get opened/hunted the key verifies and enters the catalog);
##   (b) player sidebar leads with "MORE OF CELEBRITY DEATHMATCH" (real mates: Spanish dub,
##   Russian 72-ep release...) + the "▸ Celebrity DeathMatch" chip as the see-more tab; tap
##   hands mates over as the autoplay queue. GOTCHA fixed mid-slice: deep-link route stubs
##   carry no title, so the guess now runs on the RESOLVED item title (effect, once per id);
##   verified groups always override a live guess, never null-overwrite. Audit: clean.

## SLICE 36 (declared before edit): RESOLVE-TIME PLAYABILITY VET (the handoff's "real fix",
## B's go after "why can't we find a workaround"). Calibrated on live files first:
## daniel-tiger's "video" URL returns an HTML LOGIN WALL with HTTP 200 (<!DOCTYPE html> —
## that's the unfixable dead class, not codec); DBZ vets ok; 512kb classics vet ok (catalog
## safe). getItem now vets the picked file with ONE ranged GET (~128KB): HTML body -> bad,
## moov/stsd-region codec scan (scan AFTER the marker so ftyp brands can't false-pass):
## avc1/avc3/vp09/av01 ok, mp4v/xvid/divx/DX50/hevc bad; 403/404 bad; flakes/no-verdict ->
## unknown (FAIL OPEN, the player graceful-skip stays the catcher's mitt). bad fast ->
## try best; all bad -> videoUrl null (kids drop fail-closed, player shows honest error).
## Verdicts persist to backend/codec-cache.json (codec never changes; one sniff per file
## EVER). UNLOCKED: backend/archive.js, docs/LOCKFILE_JOB13.md (+ codec-cache.json runtime).
## RESULT: shipped + verified end-to-end after spine+backend bounce (B's persistent windows).
##   Verdicts on live items: daniel-tiger ep16 OK + serves (the handoff's "dead tape" was
##   EXONERATED — my truncated-filename probe hit IA's HTML 404 page, which the vet correctly
##   calls bad); DBZ ok; 512kb classics ok; HTML walls/404 pages suppressed. codec-cache.json
##   accumulating. Audit: clean except BUILD_PLAN.md = yesterday's content-direction entry
##   (other session, baseline predates it — expected drift, untouched).

## SLICE 35 (declared before edit): the OTHER _512kb fabrication — client edition (B's DBZ
## console spam). PlayerScreen "optimistically" guesses <id>_512kb.mp4 before /api/item
## resolves; modern uploads/rippers have no such derivative -> NotSupportedError retry spam,
## and a phantom "broken episode" when the real fetch is slow (the DBZ file itself plays
## fine: verified 854x480 h.264 in-browser). The guess predates the Spine's fast cached
## item resolution; its value is gone, its cost is the bug class. Remove it: videoUrl
## starts null, the existing tuning-static/loader covers the (sub-second warm) wait.
## UNLOCKED: mobile/src/screens/PlayerScreen.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. videoUrl starts null (loader covers the wait); the adoption
##   effect (was error-recovery-only) is now the normal metadata->picture path; guessVideoUrl
##   deleted. DBZ ep 237 on screen: real file adopted (no _512kb anywhere), readyState 4,
##   zero NotSupportedError. The episode was NEVER broken — h.264, 854x480 — only the guess
##   was. OBSERVED, parked: a dev-only "Unexpected text node: ." warning fires on some
##   transient player state (player page only, content invisible, prod builds strip it);
##   hunted briefly, not worth more tokens now.

## SLICE 34 (declared before edit): SERIES SEEDS — B's catalog buildout ("dbz, macgyver,
## jeaporday, comedy series etc"). New B-editable spine/series-seeds.json -> each name
## becomes a show crate (show_seed_<key>, group 'show', NEW wall:false flag) that sync pools
## from IA title search; grouping then makes it a series (crate conf 0.9) and the wikidata
## pass canonicalizes. wall:false keeps seed crates OFF the browse wall (catalog + rails
## destinations only) — /wall filters them; pool/catalog/search unaffected. Seeded with B's
## three + classic comedy starters; he edits the file freely, next sync picks it up.
## UNLOCKED: spine/series-seeds.json (new), spine/categories.js, spine/spine.js,
## docs/LOCKFILE_JOB13.md, BUILD_PLAN.md (Tics/Snacks ruling note, not code).
## RESULT: shipped + verified. 10 seeds synced (403 eps: DBZ 50, Petticoat 50, Abbott 48,
##   Lucy 48, Jeopardy 48, Hillbillies 47, MacGyver 36, Burns&Allen 26, Benny 23, Mister Ed
##   15); catalog now 31 series; /wall stays 91 rows, zero seed leakage. Films refresh threw
##   a transient wikidata fetch fail — last-good table stands. Verify pass found 0 new
##   regex-groups to check (seeds are crate-source). Tics/Snacks ruling recorded in
##   BUILD_PLAN.md: one shared clip pool, forever-scrollable + emotable, builds in the
##   Move 3 lane after B runs the Supabase SQL.

## SLICE 33 (declared before edit): VIDEO CSS-FILTER BLANKET (handoff TODO #4, the VIABLE
## half of B's VHS cleaner; audio half stays parked on the CORS wall per watchlist). Web
## only: a wrapper around VideoView (so controls stay unfiltered) gets data-vhsclean=level;
## injected stylesheet maps levels to gentle contrast/saturate/brightness chains, MED/HIGH
## add an SVG feConvolveMatrix sharpen (composite-level, no canvas, no CORS). CLEAN button
## next to the speed cycle: OFF/LOW/MED/HIGH, persisted to localStorage.
## UNLOCKED: mobile/src/components/VideoPlayer.js, docs/LOCKFILE_JOB13.md.
## (Also declared: docs/WATCHLIST.md gained the mirror/file-state entry last turn — the
## standing vigilance practice, not a slice.)
## RESULT: shipped + verified live on the Popeye player. CLN button cycles OFF/LOW/MED/HIGH
##   next to the speed cycle; at MED the wrapper computes
##   url(#void-sharpen-soft) contrast(1.08) saturate(1.1) brightness(1.02); persisted
##   (@void_vhs_clean). Controls stay unfiltered (wrapper holds ONLY the video subtree).
##   The preview browser was left at CLN MED for B to eyeball. Sane runtime visible too
##   (31:47 on the bar — slice 26 in the UI). Audit: zero undeclared drift.

## SLICE 32 (declared before edit): PLAYER RAILS, the "same" half (B chose BOTH surfaces;
## rails first, show page later). MORE LIKE THIS already exists (related + collection/creator
## chips). NEW: when the playing item belongs to a VERIFIED series (grouping conf >= 0.85 =
## crate or wikidata), the sidebar gains a "(SHOW NAME)" chip -> flips the list to episodes
## in order; tapping an episode hands the EPISODE LIST as the player queue so autoplay walks
## the show. Kids untouched (no related/rails by ruling). Desktop sidebar this slice (web
## first-class); mobile below-video list later. Plumbing: spine GET /catalog/item/:id/series
## (grouping lookup by item_id + seriesItems), backend proxy /api/item/:id/series (1h cache),
## client getItemSeries.
## UNLOCKED: spine/db.js, spine/spine.js, backend/server.js, mobile/src/api/client.js,
## mobile/src/screens/PlayerScreen.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified on screen end to end. popeye-untold-episode-1 -> chip
##   "(Popeye the Sailor)" leads the sidebar chips -> click flips list to 120 episodes in
##   order -> tapping episode 36 plays it with channelLabel + UP NEXT armed (queue walks the
##   show). Membership API: /api/item/:id/series (backend 1h cache, {series:null} on spine-
##   down so the player never breaks). Kids untouched. client.js: BOTH export places updated
##   (the slice-9 lesson). Note: crate-sourced groups include whatever the crate holds
##   (Popeye Subliminal Messages rides in the Popeye crate) — crate hygiene is B's curation
##   lane, or a future relevance trim. Audit: zero undeclared drift.

## SLICE 31 (declared before edit): pickVideos "fast" by SIZE (the slice-30 observation,
## B's go). The format ladder assumes MPEG4 < h.264 IA, but screen-recording uploads put the
## giant ORIGINAL under MPEG4 and the streaming derivative under h.264 IA — so "fast" played
## 2.3GB originals. New fast pick: smallest mp4 over 1MB (skipping *sample* files); ladder
## stays for "best". UNLOCKED: backend/archive.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified (fast = 150MB .ia.mp4, was the 2.3GB original). GOTCHA worth
##   remembering: backend/archive.js is loaded by BOTH processes — the backend proxies items
##   to the spine (SPINE_URL transport), and the SPINE imports ../backend/archive.js for the
##   actual resolution. An archive.js edit needs a SPINE restart, not just backend (lost 10
##   minutes to this). Minor: videoUrlHQ now null for this shape (best===fast dedupe; the
##   giant original could arguably be HQ) — cosmetic, parked.

## SLICE 30 (declared before edit): the dead-tape FACTORY found (B's console paste:
## NotSupportedError on live-tv-pbs-kids-...). The item HAS a playable h.264 derivative —
## but when IA's metadata fetch flakes (we rate-limit ourselves under churn), getItem returns
## a FALLBACK with a FABRICATED <id>_512kb.mp4 URL (wrong for screen-recording uploads) and
## /api/item caches that guess for 6 HOURS. This explains the tagless dead-tape class
## (daniel-tiger too) better than any heuristic. Fix: fallback carries videoUrl null +
## fallback:true (graceful-skip handles null; kids resolvePick drops nulls fail-closed);
## /api/item caches fallbacks 60s instead of 6h. The TODO-#3 HEAD-check becomes mostly moot:
## real metadata = real file list = no guessing. UNLOCKED: backend/archive.js,
## backend/server.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. B's exact dead tape now resolves its REAL file and streams
##   (HEAD 200, video/mp4). Restart also flushed the poisoned L1 entries. Audit: zero
##   undeclared drift. OBSERVED while verifying (future raise, not done): pickVideos' "fast"
##   tier ladder assumes MPEG4 < h.264 IA, so this item streams the 2.3GB ORIGINAL instead
##   of the 150MB .ia.mp4 streaming derivative — works, but heavy; smallest-playable-by-size
##   would be the better fast pick.

## SLICE 29 (declared before edit): kids-sources/ becomes a PURE INBOX (B's ruling: his
## extension is hardwired to it; batches of kids OR adult OR normal content all land there,
## get worked, then move to their home). Safety prerequisite: the folder currently
## AUTO-SERVES to the kids wall (kidsrc_ rows, 60s TTL) — an adult batch would hit the kids
## wall within a minute of dropping. Fix: kidsShape stops serving kidsSourceCategories;
## /api/kids-sources/check stays (it is the vetting tool for the inbox). Folder is empty
## today (all archived), so nothing is lost. UNLOCKED: backend/server.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. ?kids=1 payload: 0 kidsrc rows, all 10 network channels live
##   incl. new PBS KIDS (12 tapes) + DISNEY (4). INBOX WORKFLOW now: extension drops batch ->
##   B says the word -> run /api/kids-sources/check (vetting) if kids-bound -> consolidate
##   (consolidate-harvest.py for channel batches; future lanes for general/mature) -> raw to
##   _raw/. NOTHING serves straight from the folder anymore. Audit: declared files only.

## SLICE 28 (declared before edit): B's second harvest — 80 link-grabber files dropped in
## kids-sources/ this morning (Barney/PBS, Pokemon/Kids WB, Fox Kids, Cartoon Network, Nick,
## Disney...). Same consolidation as slice 22: extract the SOURCE page per file, classify by
## network from the page title, merge into kids-saturday.json channels (dedupe against
## existing blocks), archive raw files to kids-sources/_raw/. New channels where the harvest
## demands (PBS KIDS for the Barney batch, DISNEY for Marsupilami/Teamo Supremo/JoJo).
## All assignments reported to B for re-bucketing.
## UNLOCKED: backend/kids-saturday.json, kids-sources file moves, docs/LOCKFILE_JOB13.md.
## RESULT: 79 added (1 dup) via backend/consolidate-harvest.py (NEW, kept — the repeatable
##   consolidation tool for future drops). Channels now: SATURDAY MORNING 181, FOX KIDS 29,
##   KIDS WB 30 (Pokemon/Animaniacs/Static Shock batch), CARTOON NETWORK 25, PBS KIDS 18
##   (NEW, the Barney batch), NICKELODEON 7, CBS 7, ABC 5, NBC 4, DISNEY 4 (NEW). Raw files
##   archived to _raw/. Serve-side quality filters (BAD_ENCODE/SHORT_T/DEAD_T) + cached wiki
##   backstop govern as always; backend picks the file up on the 10-min channel cache roll.
##   Known soft assignment: "One Saturday Morning (ABC)" bucketed DISNEY — B may re-bucket.
## PARKED with B's blessing-to-come: (1) user-submitted grouping corrections ("this item IS
##   part of series X") = Edit Layer lane (JOB_18, unblocks when B runs the Supabase SQL);
##   grouping already records source/confidence so human verdicts slot in at conf 1.0 above
##   wikidata. (2) B will drop CURATED ADULT/NORMAL content via the drop-folder workflow —
##   routing ruling needed BEFORE first such drop (kids-sources/*.json all become KIDS rows).

## SLICE 27 (declared before edit): WIKIDATA FUZZY-FIT, catalog waterfall step 3 (handoff
## TODO #2; B chose BOTH for the more-like surfaces — player rails next, this is the
## membership foundation). Per-episode P1545/P4908 entities rarely exist for IA uploads, so
## the honest step 3 is SERIES verification: each regex-sourced group name -> wbsearchentities
## -> one batched SPARQL P31/P279* check (television/creative-work series) -> confirmed groups
## get canonical name + qid, source 'wikidata', conf 0.95; verdicts (incl. negatives) cached
## in the enrichment map under series:<key> so passes are cheap and re-runs skip lookups.
## catalogSeries then shows only crate-sourced or verified groups (conf >= 0.85) — junk like
## "My Love (" leaves the catalog face, items stay in pools/search. Ordering stays regex
## season/episode (real per-episode Wikidata data is a future raise, not a rework).
## UNLOCKED: spine/adapters/wikidata.js, spine/grouping.js, spine/db.js, spine/spine.js,
## spine/sync.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified live. Catalog: 21 series, ALL verified (8 crate + 13 Wikidata),
##   zero junk. The fuzzy fit RESCUED mangled names: "My Love (" -> My Love from the Star,
##   "TMNT 1987" -> Teenage Mutant Ninja Turtles, "the-power-game-1969-hd" -> POWER GAME,
##   plus Arthur (Q1056342). Three hardenings mid-slice: (1) coreName strips year/HD/Complete
##   qualifiers before search; (2) tokenMatch ignores stopwords so "V The..." can't latch onto
##   any "The ..." title (V stays honestly unverified); (3) wbsearchentities is PREFIX-only so
##   a second FULLTEXT pass (list=search, "<core> television series") finds shows drowned by
##   famous names ("Arthur") — name guard then runs against the confirmed canonical label.
##   Unknown verdicts retry after 7 days (confirmed are final). Known miss: "Nickelodeon Guts"
##   vs canonical label "GUTS" fails the token guard — alias matching is a future raise.
##   One transient Wikidata JSON control-char error on films sync; last-good held, next pass
##   clean (3823). Audit: declared files only. NOTE backend edge-cache may briefly serve the
##   old series list to the UI (20m categories / 30m search TTLs).
## SLICE 26 (declared before edit): runtime unit bug (B: "seconds/minutes read like hrs and
## vice versa" in the player). Two parsers in archive.js; normalizeItem used the OLD one whose
## bare-number heuristic (<=300 -> minutes) turns "180" (3 min in seconds) into 3 HOURS.
## Fix: normalizeItem -> parseRuntimeSeconds (bare = seconds, the documented-correct parser);
## delete the old parseRuntime. UNLOCKED: backend/archive.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped. Parser probe: "180"->180s, "1:23:45"->5025, "11:03"->663, junk->null.
## Old parseRuntime deleted (0 refs). Backend restarted (uptime 34s). NOTE: item caches
## (search 30m / items 6h) still hold old-unit runtimes until they expire or next warm.
## Audit: declared files only (+ slices 24-25 set + BASELINE self-ref noise).

## SLICE 25 (declared before edit): kids cut, B's ruling — SupercookieArchives (YouTube
## mirror account) is suspect for kids; not in any vouched file, leaks in via the machine
## crates. Add a KIDS_BLOCK uploader/title/id blocklist inside dropWikiFlagged (the shared
## kids serve backstop) so picks, channels, sources and crates are all covered.
## UNLOCKED: backend/server.js, docs/LOCKFILE_JOB13.md.
## RESULT: shipped + verified. KIDS_BLOCK regex (id + creator + title) in dropWikiFlagged;
##   kidsFilter (the machine-crate lane, the actual leak — it skipped the backstop entirely)
##   now routes crate items through dropWikiFlagged too, so blocklist AND cached wiki
##   verdicts cover all four kids lanes. Backend restarted; /api/categories?kids=1 = 0
##   supercookie hits. Raw search untouched. Audit: declared files only.

## SLICE 24 (declared before edit): CATALOG FRONT DOOR (handoff TODO #1, B's pick: BOTH
## entry styles — drawer items AND wall cards). The catalog (slice 12) serves but is
## unreachable without a query. Plan: SearchScreen route-params effect gains a `catalog`
## branch ('series'|'movies') mirroring the chip destinations (direct api calls like the
## q/collection/creator branches; sets the matching genre chip so load-more pages through
## doSearch); DrawerMenu gains SHOWS + MOVIES nav items (non-kids drawer only); HomeScreen
## gains a compact two-card CatalogDoorRow atop the wall (under the hero, !kidsMode),
## routing navigate('Search', { catalog, _ts }).
## UNLOCKED: mobile/src/screens/SearchScreen.js, mobile/src/components/DrawerMenu.js,
## mobile/src/screens/HomeScreen.js, docs/LOCKFILE_JOB13.md.
## (Backend restarted fresh this session — the slice-23 channel cuts are now serving.)
## RESULT: shipped + verified on screen. SHOWS card -> /search?catalog=series, TV chip set,
##   "20 SHOWS IN THE LIBRARY" series cards (Popeye 98 eps, Disney 97, Looney Tunes 94...);
##   drawer MOVIES -> /search?catalog=movies, MOVIES chip set, verified film grid page 1
##   (The Godfather 1972 leads). Drawer order: VAULT/SIGNAL/MY VOID/SHOWS/MOVIES/HISTORY/KIDS.
##   Wall cards hidden in kids mode (the !kidsMode gate confirmed by the latched kids browser).
##   Spine-down fallback: catalog .fallback -> live composed genre search, nothing breaks.
##   Load-more pages through doSearch normally (the branch sets the matching genre chip).
##   MD5 audit: only the four declared files FAILED (+ BASELINE.md5 self-reference noise).
##   NOTE: a kids-mode browser from a prior session latches @void_kids_mode in localStorage —
##   looks like "my change didn't render" on the wall; check that flag before debugging.

## SLICE 23 (late-night quality pass on the network channels):
## - Kids EXIT gate: math captcha -> STRAIGHT PIN (B). KidsContext: parent sets a 4-8 digit
##   PIN on enter (localStorage, obscured), enters it to leave. Web-first prompt.
## - Network channels became full browse ROWS (CategoryRow per network, B: "load the rest into
##   the rows"); each tape taps to play AS IF live (handleKidsLivePress, liveSync). Machine
##   crates pbs_kids + saturday_morning KEPT (B: "keep what we have found is good in our
##   accepted"). Per-channel resolve capped 12, _kidsSat cache 10m (resolution is ~75s cold).
## - Channel QUALITY filters in resolveChannelBlocks: dedupe by id (fixed React dup-key
##   BNTSG_2; ALSO a client-side dedupe belt in HomeScreen for immediate effect), cut "seconds
##   long" ephemera (SHORT_T title heuristic since IA runtime metadata is null), cut empty
##   DVD-rip menus/intros that hang the player (DEAD_T, B's report).
## - VHS CLEANER (B asked, the CAS/RNNoise spec): RESEARCHED, BLOCKED, parked -> watchlist.
##   CORS on Archive media taints canvas/WebAudio; would need costly video proxy. Viable only
##   on self-hosted content.
## OPEN for tomorrow: backend NOT restarted (B declined mid-session) so the dead-intro/shorts/
##   backend-dedupe cuts apply on the next restart (fresh start). Some dead tapes still hang
##   the player (e.g. nbc-...128kbit-aac, videoplayback_* youtube rips) - the robust fix is a
##   player graceful-skip on NotSupportedError + a resolve-time playability HEAD check (both
##   future). Client dedupe + PIN are live via hot-reload now.

## SLICE 22 (B's harvest): NETWORK time-travel channels + wiki backstop made RELIABLE.
## B dropped 234 link-grabber files into kids-sources/. The 34k scraped links were 95% IA
## site-chrome (texts/movies/GratefulDead); the GOLD = 231 SOURCE pages he visited (kid
## broadcasts). Consolidated by network into kids-saturday.json channels:[{name,blocks}]
## (SATURDAY MORNING 169, FOX KIDS 23, CARTOON NETWORK 19, CBS 6, ABC 5, KIDS WB/NBC 4,
## NICKELODEON 1); 234 raw files archived to kids-sources/_raw/ (ignored). Backend
## kidsSaturdayChannels (plural) renders one card per network, resolving ONLY the day-rotated
## block (~1 getItem/channel). Client renders kids_channel_* cards with the network name.
## CRITICAL FIX: the wiki backstop was failing OPEN under load (concurrent Wikidata calls
## throttled -> errored -> kept the item; Unus Annus slipped through). Now: verdicts persist
## to backend/wiki-cache.json; serve path uses CACHED verdicts only (cachedSignalBest, no
## network, cannot fail open); /check does live lookups + warms the cache. PROVEN across a
## restart: a vouched Unus Annus is flagged by /check and dropped from the served kids wall.
## Workflow: add kids content -> run /api/kids-sources/check -> flagged items permanently drop.
## NEW: backend/wiki-cache.json (durable verdicts), kids-sources/_raw/ (archived harvest).
## OPEN VERIFICATION item from the prior checkpoint: RESOLVED.

## CHECKPOINT 2026-06-11 end of run: BASELINE regenerated over the full tree (325 files).
## Session handoff: docs/handoffs/SESSION_2026-06-11_UPGRADE_RUN.md. All slices 1-21 shipped
## local, nothing pushed, prod untouched (OG-stays-live). JOB_19 DONE. ONE open safety verify:
## the dropWikiFlagged coreTitle fix (slice 21) needs a backend restart + re-probe to confirm
## "Complete Unus Annus Archive" is dropped from the kids wall (see the handoff's OPEN
## VERIFICATION). Future work unlocks from THIS baseline, declared first.


## SLICE 10 (declared before edit): JOB_19 The Installable Void, slice 1
Manifest + installability, runtime-injected (zero build-config risk); our own service
worker with an update flow; the VERSION HANDSHAKE (backend /api/version + header, client
poll, "new version, tap to refresh" toast: kills the stale-bundle phantom class); installed
standalone display skips the TAP TO ENTER gate and opens with sound (Chrome grants audible
autoplay to installed PWAs); INSTALL affordance in the drawer (copy PENDING_B). Web push
DEFERRED to its own slice (VAPID + sender + Programming Desk consumer).
UNLOCKED: mobile/App.js, mobile/src/components/DrawerMenu.js,
mobile/src/components/VoidIntro.js, backend/server.js (version line),
mobile/src/components/VideoPlayer.js (one line: standalone counts as the sound gesture),
mobile/src/api/client.js (export BASE_URL for the version poll).
NEW: mobile/public/manifest.json, mobile/public/sw.js, mobile/public/icon-192.png,
mobile/public/icon-512.png (ffmpeg-resized from existing assets).
STATUS: DONE (resumed after the kids/library run). App.js injectWebHead now links the
manifest + apple-touch-icon, registers /sw.js, and captures beforeinstallprompt. NEW
mobile/src/components/VersionWatch.js mounts in the app tree: polls /api/version every 5min,
shows "NEW VERSION READY — TAP TO REFRESH" when it changes (kills the stale-bundle phantom),
and shows a dismissable "INSTALL VOIDtv" pill when installable. The install affordance lives
here instead of the DrawerMenu (avoids contention with the other session). Verified: bundle
compiles, /api/version serves, Metro serves manifest.json + sw.js (200). Web-push (VAPID +
sender + Programming Desk consumer) remains the deferred half of JOB_19.

## SLICE 11 (declared before edit): THE LIBRARY, B's ruling on the filter chips
B: chips firing a fresh Archive search per tap is clunky; he wants an actual searchable
library. The Spine pools ARE the library. NO TEXT + any lens = instant library mode over
pools; typed text keeps the raw live path (search stays raw, ruling intact); 18+ stays
live+gated. UNLOCKED: spine/spine.js (+/library endpoint), spine/db.js (libraryQuery),
backend/server.js (/api/library proxy + cache header line, graceful fallback flag when
SPINE_URL unset so prod-direct keeps working), mobile/src/api/client.js (getLibrary, BOTH
export places), mobile/src/screens/SearchScreen.js (library mode + chip term/crate maps).

## SLICE 12 (declared before edit): THE CATALOG, slice A of the verified library
B's ruling: TV and MOVIES are DESTINATIONS, not search lenses. Tap MOVIES = verified film
catalog; tap TV = series cards, episodes in order. Waterfall steps 1+2 (crate structure +
title regex) over existing pools at sync time; Wikidata film pass WIDENED (all films with
IA ids, sitelink-capped) into a films table = the verified movie catalog. Steps 3+4
(Wikidata P179, TMDB fuzzy + posters + attribution) = slice B, blocked on B's TMDB key.
The old "quiet labels, not a binge UI" stance superseded by B's ruling today.
UNLOCKED: spine/db.js (grouping + films tables, catalog queries), spine/sync.js (regroup
pass after sync), spine/adapters/wikidata.js (films query), spine/spine.js (catalog
endpoints), backend/server.js (proxy + cache line), mobile/src/api/client.js (catalog
functions, BOTH export places), mobile/src/screens/SearchScreen.js (destination pages).
NEW: spine/grouping.js (the title-regex parser + the regroup pass).
ADDENDUM (declared before edit): B wants HISTORY in the left drawer. UNLOCKED additionally:
mobile/src/components/DrawerMenu.js (HISTORY item; file was already unlocked in slice 10),
mobile/src/screens/WatchlistScreen.js (route-param opens the history section).
Baseline regenerated, 112 files, zero drift. Adds since the first lockdown, all
SearchScreen.js: the lens bar (GENRE/LENGTH/ERA pills, tap-to-expand, selection becomes the
pill label), chip brightness step, era lens renamed to the generation vocabulary
(BOOMER pre-1980 / MILLENNIAL 1980-2004 / GEN Z 2005+), under-20-min restored after B
confirmed the MIN suffix reads as runtime, not age.

## SLICE 13 (declared before edit): VOIDtv KIDS, the hard gate (B's ruling)
Allowlist-only, fail closed, server-filtered: /api/categories?kids=1 serves ONLY the kids
allowlist (shows + NASA + Commons nature + education); nothing else exists in the payload.
Kids mode REMOVES: raw search, the Dial, snacks (ads), 18+, donate, Archivist, comments,
related rail, theme pin, random. UI flips loud: sunny accent, VOIDtv KIDS wordmark.
Exit = parent gate (multiplication check). v1 honest limits recorded: pools are machine-
picked so the allowlist is conservative; the human kid-verified tag (curation commons /
Edit Layer) is the eventual real guarantee; native gate UX is a web-first v1.
UNLOCKED: backend/server.js (allowlist + kids filter), mobile/App.js (provider),
mobile/src/components/TopBar.js, mobile/src/components/DrawerMenu.js,
mobile/src/screens/HomeScreen.js, mobile/src/screens/PlayerScreen.js (hide comments/
related in kids), mobile/src/api/client.js (kids param).
NEW: mobile/src/context/KidsContext.js.
ADDENDUM: mobile/src/screens/SearchScreen.js also UNLOCKED (kids guard: the /search deep
link must not open raw search inside kids mode).
NOTE: the other session pruned this file between my edits (the second-lockdown section is
gone); two writers, one tree, audits will keep saying so.

## SLICE 14 (declared before edit): B's three rulings
1. RESTRICTED OUT OF POOLS ("i dont want the russian shit"): spine sync appends
   AND NOT access-restricted-item:true to every crate query; tv crates purged + resynced.
   Closes the §15.1 open decision. Raw search stays raw.
2. KIDS = MODERN ONLY: classic B&W shows cut from the allowlist; Archive crates get an
   item-level 1980+ year floor in kidsFilter (unknown years DROP, fail closed); NASA and
   Commons crates exempt from the floor (inherently modern).
3. OpenSubtitles pipeline captured as docs/SUBTITLES_PIPELINE.md (B-supplied design, web
   correction recorded; build blocked on B's OpenSubs key; pairs with the Whisper watchlist
   item).
UNLOCKED: spine/sync.js, backend/server.js (kidsFilter v2), docs/*.
NEW: docs/SUBTITLES_PIPELINE.md.

## SLICE 15 (declared before edit): KIDS v3, B's absolute bar
"no anything that can at all be the holder of smutty shit or news." Allowlist cut to
cartoons + saturday_morning + nature_wildlife (NASA out: government broadcast is
news-class; Commons out: open uploads). Community surfaces DIE in kids: Community Loves,
spotlight, subscriptions feed, trending, the Signal tab, Continue Watching (local history
may predate the toggle). Tabs reduce to Browse only. SignalScreen gets the same deep-link
guard as Search. Drawer fix folded in: KIDS item moved up beside nav + drawer scrolls
(B's screen clipped everything below SURPRISE ME).
UNLOCKED: backend/server.js (allowlist v3), mobile/src/screens/HomeScreen.js (community
rows + continue gated), mobile/src/navigation/index.js (tabs reduce in kids; file carries
the other session's blur fix, ours is additive), mobile/src/screens/SignalScreen.js
(kids guard), mobile/src/components/DrawerMenu.js (already edited: item moved + scroll).
ADDENDUM: backend/archive.js UNLOCKED for ONE token: the saturday_morning crate queried
collection:(saturday_morning_cartoons) which is a DEAD id (0 items, live-validated); the
real id saturdaymorningcartoons holds 1702 kid-targeted items. Rule 10 enforcement.

## SLICE 16 (declared before edit): THE SECURITY BATCH (B quoted the server-strip back: go)
Move 3 prerequisites, one pass:
1. MATURE PIN: additive profiles.mature_pin_hash (SQL file, B runs); set/verify endpoints
   (scrypt hash, no new deps); verify returns a short-lived HMAC gate token; client keeps it
   IN MEMORY only (re-ask each session).
2. SERVER STRIP: /api/categories drops mature categories unless the request carries a valid
   gate token header. Enforcement, not politeness.
3. PER-IP RATE LIMITING: express-rate-limit on /api/* (general + tighter auth/search tiers).
4. RLS AUDIT: runnable SQL (audit query + enable+policy template per table) for B to execute
   and review in Supabase; results recorded back here.
UNLOCKED: backend/server.js, backend/package.json(+lock), mobile/src/api/client.js,
mobile/src/components/DrawerMenu.js, mobile/src/screens/HomeScreen.js (18+ chip flow).
NEW: backend/maturegate.js, backend/schema-mature-pin.sql, backend/schema-rls-audit.sql.
Void Tics: B's engagement-on-tic requirement recorded; build follows THIS batch (lane B).
ADDENDUM (B's PBS Kids finds, validated): creator:("PBS Kids") = 1587 items, 96% with year
>= 1980. The RIGHT class (kids-network interstitials, broadcast-ephemera family), unlike
the rejected Blippi mirror dumps. NEW crate pbs_kids wired into spine/categories.js + BOTH
kids allowlists (server + client render belt). Files already unlocked in slices 13-16.

## SLICE 19b (B: "fix"): allowlist v5, saturday_morning dropped too. Kids = pbs_kids +
## vouched lanes (kids_picks, kids_channel) ONLY. Maximum safety, nothing machine-broad.
## SLICE 19c (B: "replace back the saturday mornings"): saturday_morning re-added (v6 =
## pbs_kids + saturday_morning + vouched). Also: resolvePick gained a titleMatches guard
## (>=0.6 token overlap) after name-resolution put Unus Annus + Filmation's Ghostbusters on
## the kids shelf; names now resolve only to title-matching items, exact ids skip the check.
## NEXT (B asked, not yet built): a WIKI censor gate (Wikidata children's-classification +
## TMDB age cert) for per-item kid verification. Discuss/spec before building.
## SLICE 21 (B: "use wiki to assist the censor gate"): backend/wikigate.js. wikiKidsSignal
## (Wikidata wbsearchentities + P31/P136) returns confirmed|flagged|unknown. Probed honest:
## it CONFIRMS clear kids shows (Sesame, VeggieTales, Barney), FLAGS the never-kids class
## (Unus Annus=YouTube channel), leaves ambiguous as unknown (vouch governs). Wired as: (1)
## serve backstop dropWikiFlagged drops flagged from kids_picks/sources/channel (fails OPEN
## on outage), (2) /api/kids-sources/check reports per-item wiki signal + counts. TMDB age-cert
## half deferred (commercial-licence risk, watchlist; B applied for a free nonprofit key).
## NEW: backend/wikigate.js. UNLOCKED: backend/server.js.

## SLICE 20 (B: "create a folder and function to save json of specific IA pages for kids"):
## backend/kids-sources/ drop-folder. Each *.json (raw IA advancedsearch JSON, {identifiers},
## {ids}, or bare array) becomes a kids row (id kidsrc_<file>), resolved via resolvePick (same
## titleMatches/playable guards). GET /api/kids-sources/check reports per-file resolved titles
## + failures so B verifies safety before use. Wired into kidsShape; client allowlist accepts
## kidsrc_* (vouched, floor-exempt). UNLOCKED: backend/server.js, HomeScreen.js. NEW:
## backend/kids-sources/README.md.

## SLICE 19 (declared before edit): KIDS allowlist v4, plug the bleed (B reported nature +
## others leaking). Dropped cartoons (all-animation, adult/anime) + nature_wildlife
## (predation) from BOTH allowlists. Kids stands on pbs_kids + saturday_morning + vouched
## lanes only. Genre chips confirmed unreachable in kids (search gated off). UNLOCKED:
## backend/server.js, mobile/src/screens/HomeScreen.js (both already unlocked this session).

## SLICE 18 (declared before edit): +4 genre lenses (B): CRIME, GANGSTER, HOOD, URBAN.
Validated live (crime 35k, urban-culture 16k, gangs 7k, gangster 6k, hood/blax 4.9k).
SearchScreen GENRES only (already unlocked); each carries q + library terms/crates. CRIME
reuses noir crate, HOOD reuses blaxploitation crate. Filters AND browsable categories in one.

## SLICE 17 (declared before edit): Dial OFF the wall, time-travel TV INTO kids
B: not sold the Dial adds value, it takes space + confuses. The clock-sync mechanic gets ONE
real home: a SATURDAY MORNING time-travel channel in kids mode, played AS IF live (drop in at
the clock position into a vouched 90s broadcast block, period ads and all = the time machine;
B ruled 90s period ads fine for kids, "we had better ethics then"). Seed blocks are VOUCHED
(Safe Shelf trust model), resolver shared with kids-picks. Empty until B fills it.
UNLOCKED: mobile/src/screens/HomeScreen.js (remove DialRow row, add kids channel card),
mobile/src/components/DialRow.js (export dialPosition; component parked, not deleted),
backend/server.js (kids channel resolution + allowlist).
NEW: backend/kids-saturday.json (vouched 90s blocks, empty to start).

## LOCKDOWN 2026-06-11 end of session
Baseline regenerated over the full working tree: 112 files, zero drift (the baseline file
itself always self-reports, documented). This state = everything below, LOCKED: slices 1-9
plus addenda (Wikidata gems + NASA + Commons adapters; theme desk with slot; the Dial gated
with static tune-ins; era-lean revival; quota cache fix; smooth signal switch; player 1s
controls, real volume, ref-scoped fullscreen; plain WATCH; live-width arrows; search lens
rows: 26 genres + length + era, stacking). All LOCAL, nothing pushed, prod untouched per
the OG-stays-live ruling. Future work unlocks from THIS baseline, declared here first.

## (history) JOB_13 slice 1 (Wikidata gems + NASA adapter)

Protocol: everything starts LOCKED. Baseline MD5 of all 98 tracked files generated at slice
start into docs/BASELINE.md5 (gitignored or committed, B's call). Only UNLOCKED files may
change. New files are marked NEW. After work, verify with:

    git ls-files | xargs md5sum -c docs/BASELINE.md5 2>/dev/null | grep -v ': OK'
    (or: md5sum -c docs/BASELINE.md5 | grep -v OK)

Any FAILED path not in the UNLOCKED list below is drift and must be investigated.

## UNLOCKED (this slice)
- spine/sync.js            (adapter dispatch in syncCategory)
- spine/mappers.js         (id-prefix dispatch to source adapters)
- spine/categories.js      (2 NASA crates + 1 Wikidata gems crate)
- spine/db.js              (additive enrichment table + helpers)
- spine/package.json       (wikibase-sdk dependency)
- spine/package-lock.json  (pre-existed in baseline, updated by npm install)
- spine/README.md          (document adapters)
- fixtures/fixtures.json   (one NASA fixture + one enriched gem fixture)

## NEW (this slice)
- spine/adapters/nasa.js       (template source adapter, keyless images-api.nasa.gov)
- spine/adapters/wikidata.js   (the index, not a source: SPARQL gems pass at sync time)
- docs/LOCKFILE_JOB13.md       (this file)
- docs/BASELINE.md5            (the baseline)

## AUDIT RESULT (slice 1 end)
Drift check run after work: 7 FAILED paths, all in the UNLOCKED list. spine/spine.js
unchanged (stayed locked). backend/* and mobile/* fully unchanged. Zero undeclared drift.

## SLICE 2 (Commons adapter, B's ruling: in with the iOS notice, no gate)
Baseline regenerated at slice start (103 files, includes slice 1 NEW files).
UNLOCKED: spine/sync.js, spine/mappers.js (one-line adapter registrations),
spine/categories.js (+2 commons crates), fixtures/fixtures.json (+1 fixture),
spine/README.md, docs/handoffs/JOB_13_HANDOFF.md, this file.
NEW: spine/adapters/commons.js.
Note: docs/BASELINE.md5 always reports FAILED against itself after regeneration; expected.

## AUDIT RESULT (slice 2 end)
4 FAILED paths plus the baseline self-hash, all declared. backend/* and mobile/* unchanged.

## SLICE 3 (JOB_14 cheap v1: pinned theme crate. First slice to touch live-product files,
## LOCAL ONLY under the OG-stays-live ruling, nothing pushes)
Baseline regenerated at slice start (108 files).
UNLOCKED: backend/server.js (one cache-header line + one mount line),
mobile/src/api/client.js (getTheme), mobile/src/screens/HomeScreen.js (pinned theme row),
docs/handoffs/* and this file.
NEW: backend/themes.js, backend/theme-config.json.
AUDIT (slice 3 end): server.js, client.js, HomeScreen.js + docs, all declared. Clean.
LESSON: client.js needs every new function in BOTH the named exports and the default
export object; screens import the default.

## SLICE 4 (THE DIAL: clock-synchronized channels, zero server state)
Baseline regenerated at slice start (111 files).
UNLOCKED: mobile/src/screens/HomeScreen.js (mount the row + tune handler),
mobile/src/screens/PlayerScreen.js (startAtSeconds param + one-shot mid-scene seek),
docs/handoffs/* and this file.
NEW: mobile/src/components/DialRow.js (defs, queue fetch, clock math, ON NOW cards).
LOCKED explicitly: backend/* (the existing /api/channel/queue serves unchanged),
VideoPlayer.js (the seek uses existing imperatives), spine/*, client.js.
AUDIT (slice 4 end): HomeScreen, PlayerScreen + docs, all declared. Clean.

## SLICE 5 (B's placement ruling + the localStorage quota bug he caught live)
Baseline regenerated at slice start (112 files).
UNLOCKED: mobile/src/store/cache.js (slim cached copy, single-gen eviction, quota
clear-and-retry), mobile/src/screens/HomeScreen.js (theme pin moves to theme.slot),
backend/theme-config.json (slot field, readme), docs/* and this file.
B's ruling encoded: gems never lead the wall. theme.slot = category rows before the pin
(default 5). The quota bug also explained the stale-wall ghosts: failed writes left old
payloads serving forever. Verified: single gen key in storage, write succeeds, pin renders
after 5 row headers with the Dial above it.

## SLICE 6 (gen-switch freeze: commit the wall swap BEHIND the drawer)
Baseline regenerated at slice start (112 files). UNLOCKED: mobile/src/screens/HomeScreen.js
only, plus docs. B's report: switch "looks as if it does but then it freezes." B's design:
do the wall change when the signal is selected, so stepping out lands on a finished wall.
Implemented exactly that: every wall payload application routes through applyWallPayload;
fetch fires at selection (the existing gen effect); while the drawer is open the prepared
payload is stashed; on drawer close it commits after the close animation inside
startTransition (non-urgent, old wall stays interactive); payloads arriving with the drawer
closed commit immediately, also in a transition. Bundle compiles; smoothness is B's
acceptance instrument on his machine. Audit clean (HomeScreen only).
ADDENDA (same slice, B's live test notes, in order):
- DialRow: HEAVY gate per B's ruling. Channel mixes re-cut to show/movie crates (PSA,
  newsreel, war-footage, oddities mixes dropped), MOVIE HOUSE channel added (ia_features +
  scifi_horror_ia, 45 min floor), per-channel minRuntime floors, junk-title kill list
  (meetings, VJ loops, trailers, airchecks, podcasts, news, test patterns). A channel that
  cannot field 3 real shows does not air.
- Tune-in static: PlayerScreen shows the void-stream static full-bleed with "TUNING <label>"
  until the mid-scene seek lands (8s cap, clears on give-up), then hard-cuts to picture.
- VideoPlayer.js UNLOCKED for one line: HIDE_DELAY 4000 -> 2000 -> 1000 (B tuned twice).
- generations.js UNLOCKED: watchBtnText flattened to WATCH in all three gens (B: "lose
  watch this trust, and similar"). Wider genz-slang purge offered, awaiting B's ruling.
- pointerEvents prop -> style.pointerEvents on the new overlay (RN-web deprecation, mine).
- DEBT noted: "Unexpected text node: ." on player pages is PRE-EXISTING PlayerScreen markup
  (bare conditional separator as a View child), dev-only; aria-hidden focus warning is
  react-navigation upstream; textShadow/shadow deprecations pre-existing (VoidLoader,
  TheArchivist). None of these block.
- Provider-crash B hit mid-session was the documented HMR context-identity phantom; source
  verified intact (App.js provider tree), cleared by hard refresh.

## PROTOCOL CORRECTION (B asked "are you remembering our rules on md5", answer: drifted)
During the rapid live-fix loop, unlocks became after-the-fact notes and two went unrecorded.
Declared retroactively, which is a protocol violation logged as such, not erased:
- mobile/src/components/CategoryRow.js UNLOCKED (was never declared): live-width arrows fix
  (module-load IS_DESKTOP froze arrows off when the page loaded under the breakpoint).
- mobile/src/components/VideoPlayer.js: beyond the declared HIDE_DELAY line, the volume
  slider is now permanent-on-web beside mute (B: "fill this out").
Rule going forward, restated: declare the unlock in this file BEFORE the edit, even
mid-loop; audit at the end of every batch, not only at slice ends.

## SLICE 7 (declared BEFORE edit): era-lean silently dead since the migration
B caught genz feature films serving old-old. Root cause: archive.js eraExempt treats any
cat.sort as a rank-identity row; spine/categories.js default-fills sort onto EVERY crate;
the /wall passthrough therefore exempted the whole wall from the item-level lean. This is
the exact JOB_1 watchlist risk ("wall renders but loses the living texture") shipping
through a side door. The payload-diff acceptance checked ids and row order, not face years:
acceptance gap noted for the parity harness.
UNLOCKED: spine/categories.js ONLY (emit sort only when a crate explicitly declares one;
the spine's own sync never consumed cat.sort, it rotates SORTS independently).
LOCKED: backend/archive.js stays untouched; eraExempt semantics are correct for explicit
sorts (Most Popular keeps its exemption through the passthrough of its authored sort).
Requires spine + backend restart to rebuild the wall. Verify: genz feature_length face
leads 2005+, most_popular unchanged, boomer/millennial distinct.
RESULT: verified live (genz face 2021,1983,1979...; boomer 1963-lead at pos 6; most_popular
identical across gens). Audit also caught UNDECLARED drift in mobile/src/navigation/index.js
(a blur-on-navigation a11y fix nobody declared); RESOLVED: B confirmed another session has
the folder open — its edit, reviewed and sound, kept. Standing note: two sessions writing
one tree will keep tripping audits; the marching orders' rule (integration serial through
ONE session) is the cure when it matters.

## SLICE 8 (declared before edit): fullscreen engage + real volume, VideoPlayer.js
- FS: toggleFullscreen/togglePiP target the component's OWN containerRef instead of a global
  [data-vpcontainer] querySelector; the documented expo-video non-release ghost can leave a
  dead container in the DOM and the global selector grabs it (engage no-ops). Failure now
  warns instead of dying silent.
- Volume: handleVolSliderPress used nativeEvent.locationX which RN-web does not provide
  (NaN volume, dead fill). Web derives X from pageX minus the bar's live rect and uses the
  real bar width. NaN guarded.
RESULT: B confirms "it works now".

## SLICE 9 (declared before edit): search filter chips, B's spec
Genre + length chips on the search RESULTS surface (supersedes the §16 "remove the seen
filters" removal, B's call 2026-06-11): comedy, sci-fi, horror, TV, movies, cartoons,
drama, thriller, mystery, cult, skits, adult(18+, member-gated like the wall corral),
length under 20 / 20-60 / over 60. Genre = Lucene clause composed with the text query
(genre-only search allowed); length = existing backend minDuration/maxDuration params;
adult = mature=true param. Search REMAINS raw when no chip is active.
UNLOCKED: mobile/src/screens/SearchScreen.js; mobile/src/api/client.js only if the param
plumbing is missing.
RESULT: shipped + extended same day on B's second list. THREE lens rows: 26 genre chips
(B's full list + my four fillers NOIR/ANIME/MUSIC/NATURE), length (any/under20/over20/
over60), era ranges (40s-and-earlier through 2010s+). All compose with the text query AND
each other; any lens alone browses. client.js gained the mature param (BOTH export places
checked: named-only function file edit, the default-object lesson did not recur because
searchItems already existed in both). Clauses apostrophe-free (the Lucene breaker). Live
probes: educational, commercials, western+50s-60s, romance+90s-00s, music+2010s+ all
return real results. Audit: SearchScreen + client.js, declared.

## LOCKED, explicitly
- backend/* in full. archive.js rights capture (licenseurl in fl[]) is DEFERRED to slice 2
  so the shared riskiest file stays untouched while prod cutover is pending.
- mobile/* in full. Zero frontend changes this slice.
- spine/spine.js stays locked unless routing forces otherwise; if it unlocks, this file gets
  amended first with the reason.
