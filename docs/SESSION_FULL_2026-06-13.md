# VOIDtv — FULL SESSION RECORD (2026-06-12 → 06-13)

Exhaustive log of everything done across this run: the upgrade slices, the debug sweep, the
production cutover, the OOM incident, the archive.org rate-limit block, and the icon system.
Companion to the slice-by-slice detail in docs/LOCKFILE_JOB13.md and the sweep in
docs/DEBUG_SWEEP_2026-06-12.md. Lock protocol: docs/BASELINE.md5 (184 source files, runtime/
secrets/media excluded). Every change declared UNLOCKED + re-locked.

================================================================================
## 0. CURRENT STATE (read first)
================================================================================
- PROD is LIVE on the upgraded build (api.voidtv.net + www.voidtv.net), Render Standard 2 GB,
  co-located backend+spine via start-prod.js, spine.db on a 1 GB persistent disk at /var/data.
- BLOCKER (DIAGNOSED + FIX SHIPPED 2026-06-13): archive.org is THROTTLING Render's Oregon
  egress IP — but NOT a 429 reject and NOT a 403 ban. It TARPITS: holds our requests open
  ~30s with no response. Proof from Render logs: "[spine search] The user aborted a request"
  + "/api/search -> 200 (30170ms)". Proof it is IP-specific not a code bug: local/home IP
  resolves IA instantly on the SAME code. WHY IT DRAGGED FOR HOURS: node-fetch's soft
  `timeout` does NOT fire under a tarpit, so every search + every 15-min sync retry left a
  30s hanging connection open — which kept signalling activity to IA, so the throttle never
  got a QUIET window to expire. We were prolonging our own block. FIX (slice 66): hard-abort
  every IA fetch at 8s via AbortSignal.timeout (search/getItem/vet) + feed/check the circuit
  breaker -> fail fast -> back off -> go QUIET -> IA can release the IP. Seeded wall + catalog
  keep working throughout (they read the pool/films table, not live IA).
- SHIPPED 2026-06-13 (pushed, commit 414bb56, batch of 11): the kids non-blocking fix,
  catalog-doors consolidation, back button, void-icon system pass 1 (VoidIcon + header +
  wordmark + SHOWS/MOVIES content-type icons), new transparent VT app icon, FAB removal,
  and the hard-abort recovery fix. Render backend + Vercel frontend both deployed; new build
  confirmed live (spine:up, degraded:false). Awaiting IA throttle to expire now that we're
  quiet. NOTHING is held anymore — the tree is fully pushed.

================================================================================
## 1. PRODUCTION CUTOVER + ARCHITECTURE
================================================================================
OG-stays-live freeze LIFTED by B 2026-06-12. Cut the upgraded build over to Render.
ONE Render Web Service "void-channel" (Starter -> upgraded to Standard 2 GB), repo
b-conscious/void-channel @ master, auto-deploy on commit.
- Root Directory: BLANK (repo root). Build: `npm install --prefix backend && npm install
  --prefix spine`. Start: `node start-prod.js`. `.node-version` = 24 (node:sqlite needs it;
  CONFIRMED working on Render).
- start-prod.js: backend = PRIMARY (public on $PORT=10000, api.voidtv.net); spine = restartable
  SECONDARY (internal localhost:3002). Backend death -> exit (Render restarts); spine death ->
  log + restart with backoff, backend stays up. Heap caps opt-in via env only. Strips the
  512MB squeeze env vars in code. Seeds the disk from seed-spine.db on boot when empty.
- Persistent disk 1 GB at /var/data; SPINE_DB=/var/data/spine.db survives deploys.
- Env (keep): SPINE_DB, SPINE_URL=http://localhost:3002, SPINE_PORT=3002, SPINE_ADMIN_KEY,
  SUPABASE_*, UPSTASH_*.
- Frontend: Vercel, same push, `cd mobile && expo export --platform web`. New UI + PWA
  manifest + VT icon live.
- KNOWN COUPLING (fix later): Render auto-deploys on ANY commit (root dir blank), so a
  frontend-only push also restarts the backend (re-pokes IA). Proper fix = Render Build
  Filter, Ignored Paths: mobile/** (frontend is Vercel's job). Not yet set.
- Spine fresh-IP escalation (if IA block persists): a same-region new service WON'T dodge it
  (Render shares egress IPs). Real fresh IP = spine in a DIFFERENT Render region, or off-Render
  hosting. Fully reversible. B approved "as long as not permanent"; deferred in favor of
  waiting out the block.

================================================================================
## 2. THE OOM INCIDENT (cutover aftermath) — timeline + fixes + lessons
================================================================================
1. First cutover (06ad7bd): spine booted, node:sqlite confirmed. First full sync + backend +
   SQLite blew the 512 MB Starter -> OOM.
2. Original launcher exited the whole service when the spine died -> 502 CRASH-LOOP.
3. Fix 0cc6efc: decoupled launcher (backend primary, spine restartable) + heap caps. Killed
   the 502, but a CONTAINER OOM kills both regardless of process structure.
4. Fix e369882: heap caps opt-in only (low caps would starve the spine on a bigger box).
5. DECISION: upgrade to Standard 2 GB (one click, correct-now). Two-services (~$14/mo) noted
   as a cheaper future optimization.
6. Fix 0ba6c64: backend getAllCategories degrades to [] (not 500) when spine unreachable, so
   the site stays up through any spine restart ("warming" wall, never ECONNREFUSED 500).
7. The squeeze env vars (BACKEND_HEAP_MB/SPINE_HEAP_MB=230/SPINE_POOL_CAP=80) stayed set on
   Render and kept OOM-ing the spine at the 230 MB cap even on 2 GB (boot log "pool cap 80"
   was the tell; B couldn't get the UI deletion to stick).
8. Fix 47aa708: launcher STRIPS those three env vars from process.env before spawning, so the
   spine runs uncapped regardless of dashboard state. Spine then stayed up 5+ min stable.
LESSONS: 512 MB cannot co-locate backend+spine+SQLite+sync. Hard heap caps trade an OOM for a
heap-OOM — the fix is right-sizing RAM, not a tighter cap. A co-located launcher must keep the
public process alive independent of the data process. Render auto-deploy fires on env changes
too; verify via /health uptime reset + boot log, not assumption.

================================================================================
## 3. THE ARCHIVE.ORG RATE-LIMIT BLOCK
================================================================================
CAUSE: the OOM crash-loop restarted the spine dozens of times, each firing a full sync at
archive.org from Render's IP -> IA rate-limited the IP. Every live IA call (search, item
resolve/playback, kids channel resolve) returns empty/fails. Seeded data (wall rows, catalog
films) works because it is static.
EXACT MECHANISM (from Render logs 2026-06-13): NOT a 429 reject, NOT a 403 ban — a TARPIT.
Requests to archive.org HANG ~30s with no response, then our own timeout aborts ("[spine
search] The user aborted a request" / "/api/search -> 200 (30170ms)"). NOT a code bug —
local/home IP resolves IA instantly on identical code, so it is purely the throttled Render IP.
WHY IT DRAGGED HOURS (the key insight): node-fetch's soft `timeout` does NOT fire under a
tarpit (the socket stays "active"), so every search + every 15-min sync retry left a 30s
hanging connection open. That sustained signal kept IA from ever seeing a QUIET window to
expire the throttle — we were prolonging our own block.
FIXES SHIPPED so prod survives + RECOVERS:
- Seed (c7e004c, 52a73b9): committed spine/seed-spine.db (local 17k-item sync, 39 MB) +
  launcher seeds the disk on boot when empty. Decided by ROW COUNT (<500 video rows), not file
  size (an empty schema+WAL exceeds 1 MB — the size check skipped the seed; row-count fixed it).
  Wall fills instantly from the seed, no IA needed. Clears stale WAL/SHM before copy.
- Self-healing sync scheduler (d86eed8): the spine retries sync every 15 min while the pool is
  THIN (<500 video rows), then backs off to 8 h once healthy. Removes the 8-hour-empty trap
  (the old code banked an empty sync as "fresh"). Fills the moment IA lets us back in.
- HARD-ABORT (slice 66, commit 414bb56) — THE RECOVERY FIX: every IA fetch (search, getItem,
  vet _rangeFetch) now uses AbortSignal.timeout(8000) instead of node-fetch's ignored `timeout`
  option, so a tarpitted request dies in 8s -> trips the circuit breaker (6 fails -> 60s
  backoff) -> we go QUIET. getItem also fails fast to the no-video fallback when the breaker is
  open (playback stops hanging 30s) and feeds the breaker on failure. Going quiet is the
  mechanism that lets IA release the IP. KNOWN low-risk downstream: 8s is more aggressive than
  the old 15s (a genuinely-slow-but-working query could occasionally fail — tune up if seen);
  search+getItem now share one breaker (intentional for "go quiet"; a transient search blip can
  briefly <=60s short-circuit playback). Dormant entirely when IA is healthy (<1s responses).
STATUS (session end): batch pushed; new build live (spine:up); we have gone quiet; awaiting the
throttle to expire. If it does not clear in a reasonable window, escalate to a DIFFERENT-REGION
spine (fresh egress IP; reversible) — same-region won't help (Render shares egress IPs).

================================================================================
## 4. DEBUG SWEEP — punch list P1-P8 (docs/DEBUG_SWEEP_2026-06-12.md)
================================================================================
- P1 [DONE] Kids network channels missing: the slice-36 playability vet doubled IA calls on
  channel builds -> rate-limit storm -> empty channels cached 10m. Fix: vouched kids content
  skips the vet (skipVet threaded backend->spine->getItem); mapLimit(5) concurrency; cache
  only on a FULL build; never regress a fuller cache.
- P2 [DONE] Void Snacks served adult-brand promo ("Playboy TV Promo") on the ungated wall.
  Fix: archive.MATURE_TITLE_RE (shared, word-bounded brand+marker screen). Corral not censor.
- P3 [DONE] Most Popular led by future-dated JW-convention spam. Two bugs: sync rotated the
  row through 'year desc' (ranked 2037 spam first); wall builder bucketSample-SHUFFLED fixed-
  sort rows. Fix: sync respects a category's fixed sort + drops future-dated at ingestion;
  serve re-ranks by downloads; dropJunk screen (capcut/iptv/keygen). Purged 50 poisoned rows.
- P4 [open, B's call] Search determinism (downloads desc = same results forever). Ranking
  rotation reads as raw-law-compatible; not built.
- P5 [DONE via kids non-blocking] kids cold-start latency.
- P6/P7 [low] dev-only "text node" warning; videoUrlHQ null when best===fast.
- P8 [PARTLY DONE] silent spine death: /health reports {spine,degraded} (verified both ways);
  start-void.cmd captures stderr to *-error.log. REMAINING: client "reconnecting" state.

================================================================================
## 5. SLICE-BY-SLICE WORK (24 onward; detail in LOCKFILE_JOB13.md)
================================================================================
- 24 Catalog front door: SHOWS + MOVIES cards + drawer items into the verified catalog.
- 25 SupercookieArchives kids kill: KIDS_BLOCK regex (id/creator/title) in dropWikiFlagged;
  ALSO routed the machine-crate lane through the backstop (the real leak).
- 26 Runtime units fix: normalizeItem used a parser whose bare-number<=300 heuristic turned
  seconds into hours. Switched to parseRuntimeSeconds; deleted the old parser.
- 27 Wikidata fuzzy-fit (catalog step 3): regex-guessed series verified via wbsearchentities +
  CirrusSearch fulltext + a batched P31/P279* SPARQL; confirmed groups get canonical name +
  conf 0.95; verdicts cached per series:<key> (7-day retry on unknowns). catalogSeries shows
  only conf>=0.85 (crate 0.9 / wikidata 0.95); regex junk leaves the catalog face. Hardening:
  coreName strip, stopword guard, fulltext for short famous names (Arthur).
- 28 Harvest consolidation: 79 of 80 new link-grabber files -> network channels via
  consolidate-harvest.py (kept). New channels PBS KIDS + DISNEY. Raw -> _raw/.
- 29 kids-sources = PURE INBOX: stopped auto-serving the drop folder to the kids wall
  (B's extension drops every batch there — kids/normal/adult). /check still vets.
- 30 Dead-tape factory (server): getItem fabricated <id>_512kb.mp4 on metadata-fetch flake and
  cached the lie 6h. Now fallback videoUrl=null + fallback:true, cached 60s.
- 31 Fast-pick by size: pickVideos "fast" picked 2.3GB originals over the 150MB derivative.
  Now smallest mp4 >1MB (skip *sample*). GOTCHA: archive.js loads in BOTH backend AND spine;
  an edit needs a SPINE restart.
- 32 Player series rails: spine itemSeries + /catalog/item/:id/series; backend proxy; client
  getItemSeries; sidebar "(SHOW)" chip -> episodes-in-order queue.
- 33 VHS-clean CSS filter (web): CLN button OFF/LOW/MED/HIGH, SVG sharpen + contrast/saturate,
  wrapper around the video only, persisted. Audio half parked (CORS).
- 34/36 PLAYABILITY VET: one ranged GET reads moov/stsd region -> avc1/vp09/av01 ok, mp4v/xvid/
  divx/hevc bad, HTML body (login wall) bad, 403/404 bad; verdicts persist to codec-cache.json.
  Daniel-tiger EXONERATED (real h.264). skipVet added for vouched (P1).
- 35 Dead-tape factory (client): PlayerScreen guessed <id>_512kb.mp4 too; removed, videoUrl
  starts null, adopts confirmed URL on metadata arrival.
- 37/53 Gate TV/MOVIES doors to verified catalog (was raw machine crates); MATURE_TITLE_RE.
- 40 New PWA/app icon (VT swirl, circle-masked on void black) -> icon-192/512 + favicon.
- 41 HARD EXCLUDES kill switch: backend/hard-excludes.json {ids}, 60s re-read, enforced in
  archive.js across search/getItem/getAllCategories/getCategoryItems (both transports). First
  kill: sctvct-Underrated_Transformers_Show (also purged from spine pool).
- 42 Wall void-TVs blink-CYCLE (were one-way blink-out that killed the field permanently).
- 43 ActInf kids kill (KIDS_BLOCK |actinf); VoidIntro desktop sound (unmuted-first, fallback
  muted+unmute-on-gesture).
- 44 Era-lean nonsense fix: genz window was unbounded year-desc -> faced rows with newest junk.
  Capped genz 2005-2022 + future-year sanity clamp (>now+1 = garbage).
- 45/50 VOID TVs = 10% OF CARDS (B's HARDWIRED standing ruling): VOID_TV_CARD_RATIO=0.10 in
  CategoryRow (1 per 9 cards), hash-offset, per-tile 10s stagger, blink-cycle ~20s. One
  swappable stream URL. B-LOCKED. Saved to memory voidtv-void-tv-cards.
- 46 Player viewport: desktop video+info share one scroll (was pinned video / sliver comments).
- 47 Related rail junk/sameness: drop ^!-titles, page collection slice by item-id hash.
- 48 Foreign gate: non-Latin scripts + language markers -> collected into the 'foreign' row,
  out of general rows. Search untouched.
- 49 fetch-ia-source.py (kept): turn an IA query into a ready inbox JSON with title preview.
- 51 Kids skipVet + mapLimit + full-build cache (P1).
- 52 CLEANUP: .gitignore covers runtime caches (codec-cache/wiki-cache/_raw/_disabled/*-error.
  log/.claude); BASELINE regenerated as a COMPLETE 184-file lock; inbox cleared.
- 54 Most Popular spam fix (P3).
- 56 /health spine reachability + stderr logfiles (P8).
- 57 start-prod.js launcher.
- 58 Launcher decouple + heap fit; 59 heap caps opt-in; 61 strip squeeze env in code.
- 62 Seed disk from local DB; (row-count fix folded in).
- 63 Void-TV stagger via #t media-fragment per tile (identical-src elements shared one Chrome
  buffer -> all synced to same frame; distinct #t = distinct resource + native start offset).
  PUSHED (3fdb3b7) — live.
- 64 Pick-a-lane: removed duplicate SpotlightRow (TV/FILMS); SHOWS/MOVIES doors are the one
  lane. SHIPPED.
- 65 Persistent back button (nav canGoBack/goBack + TopBar chevron). SHIPPED. Shows only when
  there is a previous screen (not on the home root).
- 66 HARD-ABORT IA fetches (the recovery fix) — see section 3. SHIPPED (414bb56).
- Kids non-blocking build: channel build runs in BACKGROUND (deduped, incremental per channel,
  warmed at boot + 10m); requests serve cached pool crates instantly (0.013s, was 90-120s
  timeout). Verified local: 9 channels populate. SHIPPED. Trade-off: kids first-load shows pool
  crates immediately, network channels fill ~90s later (instant load > old 90s blocking).
- ICON SYSTEM (B's neon-CRT icons, replacing Ionicons app-wide; inventory in
  SESSION_2026-06-13_CUTOVER.md). SHIPPED so far: VoidIcon.js (static require map; icons carry
  their own neon color+glow, NOT tintable; size sets box, contain-fit; hasVoidIcon() guard ->
  Ionicon fallback). Wired+live: header (hamburger/back/etc.), the neon VOIDtv WORDMARK in
  TopBar (replaces text logo; assets/voidtv-wordmark.png), SHOWS/MOVIES doors (type_tv_show /
  type_movie). Sliced+registered: 17 content-type icons. Sliced, NOT wired: 5 bottom-nav (needs
  B's 3-tab mapping: Browse/Signal/MyVoid <-> the sheet's home/browse/search/library/settings).
  Pipeline: PIL slice sheet -> key near-black to alpha -> autocrop -> assets/voidicons/<surface>_
  <role>.png -> add require line in VoidIcon -> wire surface. NEXT: player controls, content-type
  badges on cards, settings/drawer, the framed/CRT sheets (harder crops).
- NEW APP ICON: bold VT-swirl logo -> icon-192/512 + favicon. TRANSPARENT circular cutout (B:
  no black outside the circle); mask centered on the badge bbox with a ~1.5% inset to kill stray
  edge pixels; manifest icon-512 purpose changed "any maskable" -> "any" so launchers honor the
  transparency. SHIPPED.
- FAB REMOVED (B): the mobile floating menu FAB stacked bottom-left behind the Archivist console
  (both at left, the code comment wrongly assumed it was on the right). Removed; TopBar hamburger
  is the menu. SHIPPED. (Dead: unused fabAnim + styles.fab remain, harmless.)
- MONITORING (B flagged the gap): WATCHLIST entry added. Recommended UptimeRobot KEYWORD monitor
  on /health, keyword `"degraded":false`, alert when NOT found (catches spine-degraded AND total
  down; a plain HTTP monitor misses spine-down because /health returns 200 when degraded).
  Zero-code, no deploy. Optional /health?strict=1 (503 when degraded) for status-based tools.

================================================================================
## 6. SUPABASE SQL (run this session)
================================================================================
- RLS audit: ALL public tables already rls_enabled=true (watchlist's #1 risk RESOLVED SAFE —
  deny-by-default, backend uses service key). Nothing to enable.
- Additive/safe: mature_pin_hash/salt on profiles; item_type columns (real tables are hearts/
  watch_history/watchlist; the best-effort SQL named some that don't exist — no-op'd).

================================================================================
## 7. SHIP STATUS (the held batch was PUSHED 2026-06-13)
================================================================================
The batch is no longer held — pushed as commit 414bb56 (11 commits): kids non-blocking,
pick-a-lane, back button, void-icon system pass 1 (VoidIcon + header + wordmark + content-type
doors), new transparent app icon, FAB removal, hard-abort recovery fix. Render backend + Vercel
frontend deployed; new build live (spine:up, degraded:false). Tree fully pushed, working tree
clean. REMAINING after IA recovers: verify the live wall reflects all fixes (Most Popular clean,
snacks corral, kids channels populate, 10% TVs, icons, wordmark, transparent app icon).

================================================================================
## 8. STANDING RULINGS / MEMORY
================================================================================
10% void-TVs hardwired; recency-first default; mature corral (not censor); kids fail-closed +
B vouches all kids; rights-posture-don't-moralize (only B's rulings gate); OG freeze LIFTED;
talk-before-deciding; web first-class / native parallel lane; no em dashes in repo artifacts;
B pays out of pocket (token economy).

================================================================================
## 9. OPEN / NEXT (B's court unless noted)
================================================================================
- IA RECOVERY WATCH: batch is pushed, we've gone quiet (slice 66). Watch for the throttle to
  expire (search returns hits, item resolve gives a videoUrl). Probe SPARINGLY — each search
  pokes IA; the self-healing scheduler already probes every 15 min. If it does not clear in a
  reasonable window, escalate to a DIFFERENT-REGION spine (fresh IP; reversible). When it
  clears, verify the wall reflects all fixes.
- DOC-PUSH COUPLING: pushing ANY commit (incl docs) restarts the Render backend (root dir blank,
  auto-deploy on commit) which RE-POKES IA. So doc-only updates are committed LOCALLY and the
  push is HELD until IA recovers, to preserve the quiet window. The real fix is a Render Build
  Filter (Ignored Paths: mobile/**, docs/**) so frontend/doc changes don't restart the backend.
- EPISODE FAN-OUT (B decision; design docs/FANOUT_DESIGN.md): step 1 DONE — spine/fanout.js
  pure module (17/17 offline tests, scene-tag stripping incl.). RESUME at step 2: pool schema
  (is_bundle/fanned/fan_version, additive) -> step 3 getItem file selector (additive) -> step 4
  wall emits ONE season card per bundle in general rows (full fan-out in series view) -> step 5
  series-rails wiring -> step 6 backfill (GATED on IA healthy, only step that waits). Steps 2-5
  are throttle-safe (compute off existing metadata). fanout.js is NOT yet wired into getItem.
- Icon system: continue pass-by-pass — bottom nav (NEEDS B's 3-tab mapping Browse/Signal/MyVoid);
  player controls; content-type badges on cards; settings/drawer; framed/CRT sheets (harder
  crops). 28 icons sliced, VoidIcon built, header+wordmark+doors wired.
- Hero video at top of wall should CYCLE through fresh picks (B ask, not built).
- Hover-to-preview clips on cards (B idea, not built).
- P4 search ranking rotation (B's call).
- Monitoring: B to set up the UptimeRobot keyword monitor (zero-code); optional /health?strict=1.
- Two-services or different-region spine (memory isolation / fresh IP) — reversible, deferred.
- KIDS-WARM GATING (small, B 2026-06-13): the kids channel boot/10-min warm (buildKidsSat
  Channels -> resolvePick -> search) still gives IA a tiny breaker-limited poke each cycle
  while throttled. Gate it to SKIP the warm while the circuit breaker is open (Date.now() <
  _archiveCircuitUntil) so we are PERFECTLY silent during a throttle. Low effort, do in the
  consolidation pass.
- CONSOLIDATION / DURABILITY PHASE (B, planned ~a few days out, when prod is stable — NOT
  mid-incident). Goal: rewind complexity where we iterated past issues with whack-a-mole, and
  harden. Concretely: (1) replace heuristic pile-ups (BAD_ENCODE/DEAD_T/SHORT_T regex screens,
  the multiple title filters) with the ROOT-CAUSE fixes we found (the playability vet + metadata
  resolution already supersede much of it); (2) unify duplicated classification (kids/mature/
  foreign screens into one pass); (3) ADD A REAL TEST SUITE first (the fanout tests are the
  model) so simplification is safe — you cannot simplify confidently without regression tests;
  (4) durability: the IA dependency (partnership/self-host hot content), single-instance file
  state -> durable shared store, monitoring (UptimeRobot + /health?strict=1), the deploy
  coupling (Render Build Filter). Method: deliberate, one consolidation per slice, tests-first,
  the lock protocol, on a STABLE prod (simplifying a live system is its own risk).
- FUNDING / ORG AVENUES (B curious). The 501(c)(3) status is the key enabler (grants, tax-
  deductible donations, org partnerships). Natural allies/paths: (1) INTERNET ARCHIVE
  partnership FIRST — a 501c3 making the Archive usable for humans IS IA's mission story; could
  give rate-limit relief / blessed status / visibility AND solve the existential IA-dependency
  risk at once (watchlist already flags this; Opus can draft the letter). (2) Open-culture orgs:
  Creative Commons, Wikimedia Foundation (we use Wikidata/Commons), DPLA, Public Domain Review,
  library/archive assns. (3) Grants: NEH (humanities), IMLS (libraries/museums), Knight (media/
  civic), Mozilla (open web); the "before AI slop, human creativity" thesis is timely and
  fundable right now. LEAD ASSET: a LIVE working demo (you now have one) beats a pitch deck.
  CAVEAT (vigilant): funder/partner association raises the stakes on the rights posture + the
  mature corral (same optic as app-store review) — clean that up before the conversations.
  SEQUENCE: harden/consolidate -> clean rights posture -> IA conversation -> open-culture/grants.
- Standing court: founding-member pricing; TMDB drop-vs-wait; OpenSubtitles key; native lane.

================================================================================
## BRANDING / LOGO TERMS (so it stays straight)
================================================================================
- WORDMARK (a.k.a. logotype): the brand NAME styled as a logo - text-based. VOIDtv's is the
  neon "VOIDtv" (blue VOID + orange Tv). Lives in the HEADER (TopBar, assets/voidtv-wordmark.png).
- APP ICON / LOGOMARK: the SYMBOL/badge - the round VT swirl. The PWA/install/favicon/taskbar
  icon (mobile/public/icon-192|512.png, favicon, transparent circular cutout on void black).
- They are a PAIR: wordmark in the header, logomark as the app icon. Do NOT swap one for the
  other (an earlier session put the app icon in the header by mistake; corrected 2026-06-13).
