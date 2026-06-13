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
- BLOCKER: archive.org has rate-limited Render's Oregon egress IP (earned by the cutover
  crash-loop hammering it). Seeded wall + catalog WORK; anything live (search, playback,
  kids channels) returns empty until the block lifts. It is TEMPORARY (automated cooldown,
  not a ban — local/home IP works fine). B chose to WAIT it out. Do NOT redeploy while
  waiting (a restart re-pokes IA and resets the cooldown).
- HELD (committed locally, NOT pushed — ships in one push when IA clears): kids non-blocking
  fix, catalog-doors consolidation, new VT app icon, icon-system pass 1 (VoidIcon + header).
  The back button was in an earlier held commit; it only shows when there is a previous
  screen (not on the home root).

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
NOT PERMANENT: automated cooldown, not a ban. Proven not VOIDtv-wide — local/home IP resolves
IA instantly. Will not re-trigger (circuit breaker backs off; self-healing sync is gentle).
FIXES SHIPPED so prod survives + self-heals:
- Seed (c7e004c, 52a73b9): committed spine/seed-spine.db (local 17k-item sync, 39 MB) +
  launcher seeds the disk on boot when empty. Decided by ROW COUNT (<500 video rows), not file
  size (an empty schema+WAL exceeds 1 MB — the size check skipped the seed; row-count fixed it).
  Wall fills instantly from the seed, no IA needed. Clears stale WAL/SHM before copy.
- Self-healing sync scheduler (d86eed8): the spine retries sync every 15 min while the pool is
  THIN (<500 video rows), then backs off to 8 h once healthy. Removes the 8-hour-empty trap
  (the old code banked an empty sync as "fresh"). Fills the moment IA lets us back in.
STATUS: still blocked as of session end. B is waiting it out.

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
  lane. HELD.
- 65 Persistent back button (nav canGoBack/goBack + TopBar chevron). HELD. Shows only when
  there is a previous screen.
- Kids non-blocking build: channel build runs in BACKGROUND (deduped, incremental per channel,
  warmed at boot + 10m); requests serve cached pool crates instantly (0.013s, was 90-120s
  timeout). Verified local: 9 channels populate. HELD.
- ICON SYSTEM pass 1: see the dedicated section in SESSION_2026-06-13_CUTOVER.md. VoidIcon
  component + header hamburger/back wired + verified; 28 icons sliced; 16-sheet inventory
  documented. HELD.

================================================================================
## 6. SUPABASE SQL (run this session)
================================================================================
- RLS audit: ALL public tables already rls_enabled=true (watchlist's #1 risk RESOLVED SAFE —
  deny-by-default, backend uses service key). Nothing to enable.
- Additive/safe: mature_pin_hash/salt on profiles; item_type columns (real tables are hearts/
  watch_history/watchlist; the best-effort SQL named some that don't exist — no-op'd).

================================================================================
## 7. HELD COMMITS (push in ONE go when IA clears -> one deploy, everything lands)
================================================================================
On local master ahead of origin: kids non-blocking + pick-a-lane; back button + first icons;
new app icon; icon pass 1 (VoidIcon + header). When IA is confirmed cooled: `git push origin
master`, then verify /health + wall + playback + kids.

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
- Wait out the IA block, then push the held batch + verify prod (playback/kids/search).
- Icon system: continue pass-by-pass (bottom nav — needs B's "Signal" mapping; player controls;
  content-type badges; settings/drawer; framed/CRT sheets). All held, frontend-only.
- Hero video at top of wall should CYCLE through fresh picks (B ask, not built).
- Hover-to-preview clips on cards (B idea, not built).
- P4 search ranking rotation (B's call).
- Render Build Filter (mobile/** ignored) so frontend pushes don't restart the backend.
- Two-services or different-region spine (memory isolation / fresh IP) — reversible, deferred.
- Standing court: founding-member pricing; TMDB drop-vs-wait; OpenSubtitles key; native lane.
