# SESSION HANDOFF 2026-06-11: the upgrade run (local, nothing pushed)

Self-contained handoff for a fresh session (any model — continuity lives in the files, not
the model). EVERYTHING below is LOCAL under B's standing ruling: the live OG build stays
working until the upgrade is clean; no pushes to master. Prod is untouched. Two Claude
sessions had this tree open; audits flag the other session's edits as "undeclared drift,"
which is expected, not a problem.

Read order: THE_VOID_BUILD_PLAN.md, BUILD_PLAN.md, docs/handoffs/JOB_0/JOB_1/JOB_13/JOB_14,
docs/LOCKFILE_JOB13.md (the slice-by-slice journal of THIS run), docs/WATCHLIST.md, then this.

## The lockfile protocol (B's discipline, enforced this run)
docs/BASELINE.md5 holds MD5s of the whole tree. Before a slice: declare the UNLOCKED files in
docs/LOCKFILE_JOB13.md. After: `md5sum -c docs/BASELINE.md5 | grep -v ': OK$'` and every
FAILED path must be in the declared set (or the other session's). I drifted from declaring-
before mid-run once; B caught it; corrected. Re-lock (regenerate BASELINE) at each checkpoint.

## Local dev (servers run in background shells; the Preview tool can't own :8081)
- Spine :3002  `cd spine && SPINE_ADMIN_KEY=void-spine-dev node spine.js`
- Backend :3001 `cd backend && node server.js` (reads backend/.env; SPINE_URL routes Archive
  through the Spine). Restart needed to pick up server.js + categories.js changes.
- Web :8081 `cd mobile && npx expo start --web`. Verify a build: curl the bundle, expect it to
  start `var __BUNDLE_START_TIME__`. Metro hot-reloads mobile/src edits.
- Recurring trap ALL SESSION: stale browser bundle. Hard refresh (Ctrl+Shift+R) after edits.
  JOB_19's version handshake (below) now fixes this class for users.

## SHIPPED THIS RUN (slices 1-21 in LOCKFILE_JOB13.md; headlines)
- JOB_13 source adapters: NASA + Wikimedia Commons live in the Spine; Wikidata is the index
  (gems pass). NASA needs no key; Commons is WebM (stream_format flag for the iOS notice).
- JOB_14 the Programming Desk: backend/theme-config.json + themes.js -> a pinned theme crate
  at theme.slot rows into the wall (B: gems never LEAD; default slot 5).
- THE DIAL was built then PULLED off the wall (B: clutter). Its clock-sync mechanic now powers
  the kids time-travel channel (below). DialRow.js is parked, not deleted.
- Era-lean was silently DEAD since the JOB_1 migration (spine default-filled cat.sort, which
  the backend's eraExempt treats as a ranking row -> whole wall exempted). Fixed in
  spine/categories.js: emit sort only when authored. Genz features lead recent again.
- Player: fullscreen engages via the instance ref (not a global selector); volume slider is
  real (was NaN from locationX); controls auto-hide 1s; tuning-static between Dial channels.
- THE LIBRARY: search lens chips (genre + length + era) browse the Spine pools instantly
  (no fresh Archive search per tap). Typed text stays raw. Lens bar = compact pickers.
- THE CATALOG (slice A): spine/grouping.js (title-regex + crate series grouping) + a WIDENED
  Wikidata films table. MOVIES chip = verified film grid (3827 films); TV chip = series cards
  -> episodes in order. Slice B (TMDB verify + posters) is blocked, see Determinations.
- SECURITY BATCH (Move 3 prereqs, BUILT): backend/maturegate.js (PIN-gated 18+, server STRIPS
  mature from payloads without a verified gate token; gated responses are private/no-store so
  the CDN never caches them), express-rate-limit per-IP (general/search/auth tiers),
  schema-mature-pin.sql + schema-rls-audit.sql for B to run.
- JOB_19 PWA: DONE. manifest + sw.js + icons served; App.js registers them; VersionWatch.js
  polls /api/version and shows "NEW VERSION READY - TAP TO REFRESH" on change (kills the stale-
  bundle phantom) + an INSTALL pill. Web push is the deferred half.
- VOIDtv KIDS (the big thread): a HARD, fail-closed, allowlist gate. Server-filtered payload,
  client render belt as a second enforcement layer, cache bypassed in kids. Removes search,
  the Dial, snacks, 18+, donate, comments, related, community rows, Continue Watching; tabs
  reduce to Browse; UI flips sunny + "VOIDtv KIDS"; EXIT needs a parent math-gate. Allowlist
  evolved v1->v6 as B tightened: now pbs_kids + saturday_morning + the VOUCHED LANES.

## THE KIDS CURATION ARCHITECTURE (B's ruling: "I will personally select all kids")
The only real <=11 guarantee is B's vouch. Three vouched lanes, all voice:b, 60s TTL, no
restart, all share resolvePick (must resolve to a PLAYABLE video; NAMES must title-match so
"Bill Nye Outer Space" can't grab Ghostbusters):
- backend/kids-picks.json {ids:[...]} -> THE SAFE SHELF row (ids OR names).
- backend/kids-saturday.json {blocks:[...]} -> the SATURDAY MORNING time-travel card: tap to
  drop in AS IF live (clock-derived offset from the video's real duration; period ads ride
  along on purpose). B's vision (NOT built): MULTIPLE network channels (ABC/Fox/NBC) each as
  its own card -> extend this file to channels:[{name,blocks}] and render one card per channel.
- backend/kids-sources/ drop-folder: each *.json (raw IA advancedsearch JSON, {identifiers},
  {ids}, or bare array) -> its own kids row (id kidsrc_<file>). GET /api/kids-sources/check
  reports per-file what resolved (with titles + the wiki signal) and what failed.
- THE WIKI CENSOR GATE (backend/wikigate.js, B's idea): wikiSignalBest -> confirmed|flagged|
  unknown via Wikidata. CONFIRMS clear kids shows, FLAGS the never-kids class (Unus Annus =
  YouTube channel), leaves ambiguous as unknown (vouch governs). Wired as (1) a serve backstop
  dropWikiFlagged that removes flagged items from the kids wall, (2) signals in the check
  report. Fails OPEN on a Wikidata outage.

## OPEN VERIFICATION (do this before kids ships)
- The dropWikiFlagged coreTitle fix (slice 21 tail) was edited but NOT re-verified after B
  interrupted. The failing case: a vouched "Unus Annus" resolved to the IA upload titled
  "Complete Unus Annus Archive", whose messy title hid the flagged entity, so it SLIPPED onto
  the kids wall. The fix adds a cleaned-core title check (coreTitle -> "unus annus" -> flagged).
  RESTART backend, add Unus Annus to a kids-source, confirm it is FLAGGED in /check AND ABSENT
  from /api/categories?kids=1. This is a real safety gap until confirmed.
- My test file kids-sources/wikitest.json (Arthur + Unus Annus) may still be on disk; remove
  it so B's folder is clean.

## PENDING / B's COURT
- Run in Supabase: backend/schema-mature-pin.sql (mature gate dead-ends until then),
  backend/schema-rls-audit.sql (Part 1 audit, then enable RLS per table; deny-by-default is
  correct, the service key bypasses it). Set MATURE_GATE_SECRET on Render at cutover.
- TMDB key: B applied for a free nonprofit/commercial key. LICENSING RISK (watchlist): TMDB
  section 2 likely classes VOIDtv commercial (donations + recommends movies/TV + has an LLM).
  If they require a paid agreement, DROP TMDB and build the Wikidata catalog/poster path
  instead (CC0, no agreement). Catalog slice B and the TMDB age-cert half of the kids gate
  both wait on this answer.
- Keys still open: OpenSubtitles (docs/SUBTITLES_PIPELINE.md), NASA api.nasa.gov (only for
  non-images endpoints), AAPB application (slow; submit early) — though B cut AAPB earlier.
- Network Saturday-morning channels (the "pretty damn good" multi-card vision) — design above.
- Move 1 prod cutover (Spine production home determination) still parked under OG-stays-live.
- Move 3 Edit Layer (JOB_18): security prereqs are now BUILT, so it unblocks once B runs the
  SQL. Void Tics (20s clip engagement, "engagement on the tic") is the lane-B follow-up.

## DETERMINATIONS CARRIED (do not decide for B)
Spine production home; founding member $5/YEAR vs MONTHLY; TMDB pursue-vs-drop; which crates
stay in kids; network-channel block picks; theme cadence + first theme copy; throughput floors.

## ============ END-OF-DAY ADDITIONS (late 2026-06-11 -> 2026-06-12) ============

### SHIPPED (slices 22-23, on top of everything above)
- KIDS NETWORK TIME-TRAVEL CHANNELS from B's harvest. He dropped 234 link-grabber files in
  kids-sources/; the 34k scraped links were 95% IA site-chrome, the GOLD was the 231 SOURCE
  pages he visited (kid broadcasts). Consolidated by network into backend/kids-saturday.json
  channels:[{name,blocks}] -> SATURDAY MORNING / FOX KIDS / KIDS WB / ABC / CBS / NBC /
  CARTOON NETWORK / NICKELODEON. Raw files archived to kids-sources/_raw/ (ignored). Each
  network renders as a full browse ROW (CategoryRow); every tape taps to play AS IF live
  (liveSync). VERIFIED on screen: 8 network rows of real broadcast tapes (Fox Kids 1997/98
  full episodes, ABC 1985 w/ Scooby, CBS Nov 1985...). pbs_kids + saturday_morning machine
  crates KEPT alongside (B: "keep what we have found is good in our accepted").
- KIDS EXIT = STRAIGHT PIN (not the math captcha). KidsContext: parent sets a 4-8 digit PIN
  on enter, enters it to leave. Web prompt v1, localStorage-obscured.
- WIKI CENSOR GATE made RELIABLE + DURABLE. Was failing OPEN under load (concurrent Wikidata
  calls throttled). Now verdicts persist to backend/wiki-cache.json; the serve backstop uses
  CACHED verdicts only (cannot fail open); /api/kids-sources/check does live lookups + warms
  the cache. PROVEN across a restart: a vouched Unus Annus is flagged and dropped.
- CHANNEL QUALITY filters (resolveChannelBlocks): dedupe by id (+ a client dedupe belt for
  immediate effect), cut "seconds long" ephemera (title heuristic, IA runtime is null), cut
  empty DVD-rip menus/intros (DEAD_T). NOTE: these backend cuts apply on the NEXT RESTART.

### TOMORROW'S TODO (prioritized; all discussed today, none built)
1. CATALOG FRONT DOOR (B's pick, do FIRST): the series/movies catalog is built and serves,
   but is UNREACHABLE in the UI (you can only reach SearchScreen with a query; catalog needs
   no query). Add a direct entry: "SHOWS" + "MOVIES" nav/drawer items OR two cards atop the
   Browse wall, routing straight into the catalog grid (series cards -> episodes / film grid).
   Small: a route flag + entry buttons. B to choose nav-items vs wall-cards.
2. WIKIDATA FUZZY-FIT for series (replaces the DEAD TMDB step). Current grouping is crate +
   title-regex: clean for show-crates (Popeye 98, Disney 97, Looney Tunes 94...) but produces
   junk groups ("My Love (") and weak episode ordering (most items unlabeled). A Wikidata pass
   (P179 part-of-series, P1545 episode number, P4908 season) gives real membership + ordering,
   no key, CC0. This is THE "fuzzy fit" B keeps asking to see done properly.
3. PLAYER GRACEFUL-SKIP: HALF DONE + interim heuristic added. (a) The player no longer hangs
   on a dead source — drops the tuning static immediately and shows "This recording won't
   play... tap back" (PlayerScreen handleVideoError). (b) INTERIM: a BAD_ENCODE id heuristic
   (client kids-channel render + backend resolveChannelBlocks) hides uploader re-encodes
   (h-264/x265/480p/pdtv/128kbit/aac-sx/videoplayback tags) that IA has no playable derivative
   for - the real broadcast tapes carry no codec tags so they survive. (c) KIDS CHANNELS NOW
   HAVE A QUEUE: handleKidsLivePress passes the whole channel as queue+index, so a dead tape
   AUTO-SKIPS to the next and autoplay walks the channel (vouched only, no catIds, no related-
   fetch into kids). B's exact complaint ("no autoplay or right-side videos in kids to go to")
   addressed. (d) DVD-rip MENUS cut (BAD_TITLE dvd/disc/title menu) - Preston's-style disc
   images that play a navigable MENU instead of a broadcast (they don't error, so the skip
   never fired). (e) THE REAL LEAK FOUND + FIXED: the BAD_ENCODE/BAD_TITLE filter was only on
   the ROW RENDER, so dead tapes still surfaced as the kids HERO and rode in the auto-play
   QUEUE. Moved the filter to the DATA LEVEL (HomeScreen typeCats kids branch) so hero + queue
   + rows all draw the same clean set; also added YouTube-ripper id prefixes (y-2mate, youtube,
   ssyoutube, savefrom, 2conv) which are a major dead-rip source. STILL PENDING (the real fix):
   a resolve-time playability check (HEAD/ffprobe) so dead/menu tapes never reach the wall at
   all, incl. tagless ones (daniel-tiger-s-neighborhood). Heuristics are whack-a-mole; the
   playability check is the actual guarantee and should be tomorrow's work, not more patches.
4. VIDEO CSS-FILTER BLANKET (the VIABLE half of B's VHS-cleaner idea). CSS/SVG filter on the
   <video> (gentle contrast + gamma + mild sharpen) is composite-level, NO CORS issue, app-
   wide, strength slider. The AUDIO half (RNNoise/hum-notch) is BLOCKED (cross-origin audio is
   silenced by Web Audio; watchlist). Build the video blanket only.
5. RESTART the backend on fresh start so the slice-23 channel cuts (shorts/dead-intro/dedupe)
   take effect. (Client dedupe + PIN are already live.)
6. B is bringing MORE Nick / ABC / CBS / WB Saturday-morning links -> drop in kids-sources/,
   consolidate into the network channels the same way (the 234-file consolidation is repeatable).

### STILL IN B'S COURT (carried, unchanged)
- Run backend/schema-mature-pin.sql + backend/schema-rls-audit.sql in Supabase; set
  MATURE_GATE_SECRET on Render at cutover. (schema-item-type.sql from JOB_1 also still pending.)
- TMDB: RECOMMEND DROP (commercial-licence wall, watchlist) -> use Wikidata for catalog + gate.
  B applied for a free nonprofit key; if granted free, reconsider; if it needs payment, drop.
- OpenSubtitles key (docs/SUBTITLES_PIPELINE.md) for the captions pipeline.
- Move 1 prod cutover (Spine production home) still parked under OG-stays-live.
