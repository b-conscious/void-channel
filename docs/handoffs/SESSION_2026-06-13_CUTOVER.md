# SESSION HANDOFF — 2026-06-12/13: debug sweep, then the production cutover

## ICON SYSTEM (B's neon-CRT icons — IN PROGRESS, phased)
B dropped 16 neon-CRT icon sheets (~150 icons) to replace Ionicons app-wide — his aesthetic
remodel. Source sheets: C:/Users/bryan/AppData/Local/Temp/zipdrop (re-share if temp cleared).
Pipeline: PIL slice each sheet -> transparent PNG (key near-black to alpha, autocrop) ->
mobile/assets/voidicons/<surface>_<role>.png -> VoidIcon.js (static require map) -> wire per
surface, replacing Ionicons. Icons carry their own neon COLOR + glow (not tintable — palette
is intentional); halftone texture fades below ~28px but silhouette+color read fine.
SHEET INVENTORY (surface -> file):
 header(3cb52282 clean) · content-types(1a84042b clean,18) · game+community(3247674a clean) ·
 bottom-nav inactive(37ecc14f framed) · bottom-nav ACTIVE(4732bb8e clean) · player ctrls
 (3e68ae91 framed) · audio-player(7c503a0a framed) · video-player ext(d88d7108 CRT bezel) ·
 card actions(73ef31ee CRT bezel) · settings(3d57987a framed) · settings mono-blue(c497b016) ·
 search suite(0468217f) · reader(055c9109 CRT) · empty/error states(2471fc59) ·
 share/notif/social(c099fc1b) · single: share-to-facebook(a9ae9848).
DONE: VoidIcon component built; header hamburger + back wired & VERIFIED live (looks good);
 sliced so far = content-types(18) + header(5) + bottom-nav(5). NEXT PASSES (priority): bottom
 nav (NOTE: app has 3 tabs Browse/Signal/MyVoid but B's sheet has 5 home/browse/search/library/
 settings — mapping needs B: Browse->nav_browse, MyVoid->nav_library, Signal->? ), player
 controls, content-type badges on cards, then settings/drawer + the framed/CRT sheets (harder
 crops). All held with the deploy batch (frontend, no IA dependency).



Self-contained handoff for a fresh session (any model). Continuity lives in the files, not
the model. Read order: THE_VOID_BUILD_PLAN.md, BUILD_PLAN.md, docs/ROADMAP_2026-06-12.md,
docs/DEBUG_SWEEP_2026-06-12.md, docs/LOCKFILE_JOB13.md (slice-by-slice detail for everything
below), docs/WATCHLIST.md, then this.

This session did three things: (1) finished a debug punch-list, (2) cut the upgraded build
over to production on Render, (3) fought and mostly won an out-of-memory incident on the live
box. The OG-stays-live freeze was LIFTED by B mid-session — the upgrade is shipped.

================================================================================
## CURRENT STATE — THE ONE OPEN GATE (read this first)
================================================================================
Production is LIVE on the upgraded build (api.voidtv.net + www.voidtv.net). The backend is
stable on a Render **Standard 2 GB** instance. The SPINE (data layer) is the last loose end:

THE GATE: three env vars from the 512 MB "squeeze" must be DELETED on Render and the service
redeployed: `BACKEND_HEAP_MB`, `SPINE_HEAP_MB`, `SPINE_POOL_CAP`. While `SPINE_HEAP_MB=230`
is set, the spine OOMs at ~227 MB heap on EVERY sync regardless of the 2 GB box — the cap is
the ceiling, not the RAM. B did not save the deletion the first time (the boot log still read
`pool cap 80`, the tell). Success signal after deleting + redeploy: boot log reads
`pool cap 300/category`, no heap crash after "starting sync", `/health` shows
`spine:"up", degraded:false` and STAYS there, and pools fill over a one-time ~30-40 min sync.

After that gate clears: verify the live wall reflects the session's fixes (Most Popular clean,
no future-dated spam, snacks corral-safe, kids channels present, 10% void-TV cards, the VT
icon). Nothing else blocks.

================================================================================
## THE PRODUCTION ARCHITECTURE (as cut over this session)
================================================================================
ONE Render service "void-channel" (Starter -> upgraded to Standard 2 GB), repo
b-conscious/void-channel @ master, auto-deploy on commit. Co-locates BOTH processes:
- **start-prod.js** (repo root) is the start command. It launches the BACKEND as primary
  (public on $PORT=10000, api.voidtv.net) and the SPINE as a restartable secondary
  (internal localhost:3002). If the backend dies, the launcher exits so Render restarts;
  if the SPINE dies, the launcher logs it and restarts just the spine with backoff — the
  backend (and thus the site) never goes down with it. Heap caps are OPT-IN via env only.
- **Render config:** Root Directory = blank (repo root); Build = `npm install --prefix
  backend && npm install --prefix spine`; Start = `node start-prod.js`; `.node-version`=24
  (node:sqlite needs it — confirmed working on Render).
- **Persistent disk** 1 GB at `/var/data`; `SPINE_DB=/var/data/spine.db` so the pool DB
  survives deploys (the whole point — no cold resync per deploy).
- **Env (keep):** SPINE_DB, SPINE_URL=http://localhost:3002, SPINE_PORT=3002,
  SPINE_ADMIN_KEY, SUPABASE_*, UPSTASH_*. **Env (delete — the gate):** BACKEND_HEAP_MB,
  SPINE_HEAP_MB, SPINE_POOL_CAP.
- **Frontend** = Vercel, same push, `cd mobile && expo export --platform web`. Live with the
  new UI + PWA manifest + the VT icon.
- **Supabase SQL run this session:** RLS audit returned ALL tables rls_enabled=true (the
  watchlist's #1 risk RESOLVED SAFE — deny-by-default, backend uses service key). mature-pin
  + item-type columns are additive/safe; item-type real tables are hearts/watch_history/
  watchlist (the best-effort SQL named some that don't exist — no-op'd).

================================================================================
## WHAT SHIPPED — DEBUG SWEEP (slices 44-58; detail in LOCKFILE_JOB13.md)
================================================================================
The sweep (docs/DEBUG_SWEEP_2026-06-12.md) was B's call after "a cascade of complexity" and
"nonsense everywhere." Evidence-first, one declared unlock + re-lock per fix.

- **P-NONSENSE WALL (44):** genz era window was unbounded (2005->null, year-desc), so every
  row FACED with newest-dated uploads — 2026 civic meetings, gameplay rips, even future-dated
  garbage. Capped genz to 2005-2022 + year-sanity clamp (years > now+1 = garbage). The
  generational core leads; the recent upload wave trails.
- **P SAME-SIDE-VIDS (47):** related rail led with identical "!" Twitch-mirror cards on most
  videos — collection page-1 + titleSorter put "!" first. Fixed: drop ^!-titles, page the
  collection slice by item-id hash so each item gets a different window.
- **P PLAYER SLIVER (46):** desktop player video was pinned, forcing a sliver view of
  comments. Video + info now share one scroll.
- **P FOREIGN (48):** foreign-language items bled into general rows. Detected (non-Latin
  scripts + language markers) and moved into the existing 'foreign' row. Search untouched.
- **P1 KIDS CHANNELS MISSING (51):** the slice-36 playability vet doubled IA calls on channel
  builds -> rate-limit storm -> empty channels cached 10 min. Fixed: vouched kids content
  skips the vet (skipVet threaded backend->spine->getItem); mapLimit(5) concurrency; cache
  only on a FULL build; never regress a fuller cache to thinner.
- **P2 SNACKS ADULT BLEED (53):** "Playboy TV Promo" reached the ungated wall (untagged in a
  mainstream collection; generic word-screen missed brand names). New shared
  archive.MATURE_TITLE_RE (brands + markers, word-bounded). Corral not censor — still in
  search + behind the 18+ gate.
- **P3 MOST POPULAR SPAM (54):** future-dated JW-convention spam led the row. Two bugs: sync
  rotated most_popular through 'year desc' (ranked 2037 spam first); the wall builder
  bucketSample-SHUFFLED fixed-sort rows. Fixed: sync respects a category's fixed sort + drops
  future-dated at ingestion; serve re-ranks by downloads; dropJunk screen for high-download
  non-film spam (capcut/iptv/keygen). Purged 50 poisoned rows.
- **P8 SILENT SPINE DEATH (56):** /health now pings the spine and reports
  {spine,degraded}; start-void.cmd captures stderr to logfiles. Plus this session:
  getAllCategories degrades to [] (not a 500) when the spine is unreachable, so the site
  stays up through any spine restart.
- Earlier same-day (slices 24-43, detail in LOCKFILE): catalog front door (SHOWS/MOVIES,
  gated to verified catalog not raw crates), SupercookieArchives + ActInf kids kills, runtime
  unit fix, Wikidata fuzzy-fit series verification, the 80-file harvest -> PBS KIDS + DISNEY
  channels, kids-sources turned into a pure inbox, the dead-tape factory fix (fabricated
  _512kb URLs, server + client), fast-pick by size, player show-rails, VHS-clean CSS filter,
  hard-excludes kill switch, the playability vet, fetch-ia-source.py + consolidate-harvest.py
  tools, VoidIntro desktop sound, the VT swirl PWA icon.

================================================================================
## STANDING RULING SHIPPED: VOID TVs = 10% OF CARDS (slice 50)
================================================================================
B's hardwired ruling (also in memory voidtv-void-tv-cards): void-stream TVs occupy ~10% of
wall cards (1 per ~9 real cards, hash-offset so columns don't stack), each on its own 10s
stagger, blink-cycling forever (slice 42 fixed the one-way blink-out that killed the field).
VOID_TV_CARD_RATIO in CategoryRow.js is B-LOCKED. Stream is ONE swappable URL
(void-stream.mp4) — B swaps the file over time, zero code change.

================================================================================
## THE OOM INCIDENT — TIMELINE + LESSONS
================================================================================
1. Cut over (commit 06ad7bd): spine booted, node:sqlite confirmed on Render. Then the first
   full sync + backend + SQLite blew the 512 MB Starter -> OOM.
2. The original launcher exited the whole service when the spine died -> 502 crash-LOOP.
3. Fix 1 (0cc6efc): decoupled launcher (backend primary, spine restartable) + heap caps.
   Stopped the 502 — but a container OOM kills both regardless of process structure.
4. Fix 2 (e369882): heap caps opt-in only.
5. Decision (NO hedging, B's call honored): upgrade to Standard 2 GB. Co-located stays;
   two-services (~$14/mo) is the cheaper future optimization, Standard ($25/mo) is the
   one-click correct-now answer with roadmap headroom.
6. Fix 3 (0ba6c64): backend degrades to empty wall, never 500, when spine is down.
7. REMAINING: the squeeze env vars were never actually saved-deleted, so the spine still
   OOMs at the 230 MB cap. THE GATE above.

LESSONS (carry these): 512 MB cannot co-locate backend + spine + SQLite + a sync. Hard heap
caps trade an OOM for a heap-OOM — the real fix is right-sizing RAM, not a tighter cap.
node:sqlite works on Render Node 24. A co-located launcher must keep the public process alive
independent of the data process. Render auto-deploy "On Commit" fires on env changes too;
verify deploys via /health uptime reset + the boot log, not assumption.

================================================================================
## OPEN / NEXT (B's court unless noted)
================================================================================
- THE GATE: delete the 3 env vars + redeploy (above). Then verify the live wall.
- P4 search determinism (downloads desc = same top results forever) — discussed, ranking
  rotation reads as raw-law-compatible; B's call, not yet built.
- P5 kids cold-start latency — should be much better post-P1; re-measure once the gate clears.
- P6/P7 cosmetics (dev-only "text node" warning; videoHQ null) — low.
- Client "reconnecting" state instead of the "server sleeping" screen when degraded (the
  user-facing half of P8) — mobile/src, deferred.
- Two-services migration as a cost optimization (~$14/mo vs $25) once stable + funded.
- The neon CRT icon system (16 sheets, B's aesthetic remodel material) — inventoried, not
  integrated; needs slicing + a direction call.
- Standing court: founding-member pricing, TMDB drop-vs-wait, OpenSubtitles key, the
  native iOS/Android lane (separate from this web cutover).

## LOCK DISCIPLINE
docs/BASELINE.md5 is the surgical gate — 182 source files, runtime/secrets/media excluded
(see .gitignore). Every change this session was declared UNLOCKED + re-locked. Regenerate the
baseline with the canonical find (excludes node_modules/.git/.expo/dist/.claude, runtime
caches, spine.db, .env, logs, _disabled, _raw) after each fix.
