# JOB_14 HANDOFF: The Programming Desk, cheap v1 (pinned theme crate)

Status: BUILT and verified locally 2026-06-11. LOCAL ONLY under the OG-stays-live ruling.
Nothing pushed. Lockfile slice 3 in docs/LOCKFILE_JOB13.md; drift audit clean.

## What exists
- `backend/theme-config.json` NEW: the editorial calendar v1. First theme whose window
  contains today wins. B edits this file directly (title, copy, crateId, dates); the server
  re-reads it on a 30s TTL, so copy lands without restarts. All strings marked PENDING_B.
- `backend/themes.js` NEW: GET /api/theme returns the active theme or {theme:null}. A broken
  config edit serves last-good and warns, never takes the wall down. Mounted in server.js
  (one line) with a 5m edge-cache header (one line).
- `mobile/src/api/client.js`: getTheme() named export AND added to the default export object.
- `mobile/src/screens/HomeScreen.js`: theme state, fetched in the tier-3 waterfall. wallData
  pins the theme's crate ABOVE the wall (and removes it from its normal slot). The crate is
  pulled from the ALREADY LOADED payload: zero extra fetches, missing crate = no pin, theme
  null = wall byte-identical to before. Render: mono eyebrow title in the gen accent, one
  copy line, then a normal CategoryRow.

## Verified (live, preview at 2200x1100)
- /api/theme serves the window; all three gen payloads carry gems_wikidata (15 items).
- The pinned row renders at wall top: title, copy, then Classic Gems and Cult with enriched
  items (Shree 420 / Raj Kapoor 1955, Life with Father / Michael Curtiz 1947, The Knockout
  1914). The Wikidata enrichment is visible on cards end to end.
- Wall with theme=null verified unchanged earlier in the session (pre-fix states).
- Bundle compiles (curl gate) and the exact browser variant contains the new code.

## Failures hit and resolved (the lesson carries)
1. THE BIG ONE: client.js exports BOTH named functions and a curated `export default {...}`
   object; HomeScreen imports the DEFAULT. The new getTheme named export never joined the
   object, so api.getTheme was undefined: getShorts fired, getTheme silently did not.
   Cost an hour of stale-bundle ghost-hunting because the failure shape was identical to
   the documented service-worker cling. RULE FOR EVERY FUTURE client.js FUNCTION: add it in
   BOTH places. The default-export object is a footgun; collapsing it to `export default
   * as` shape is a candidate cleanup for the upgrade.
2. Preview page black screen is the VoidIntro tap gate (localStorage cleared in debugging
   re-armed it), not a render failure. innerText probes work through it; screenshots do not.
3. Diagnosis chain that finally worked: backend request log (server-side truth) showed
   shorts arriving without theme; bundle grep proved the code was on the wire; resource
   timing proved the page executed the new bundle; that isolated the call site.

## RULED by B (2026-06-11, after seeing it live)
- Gems do NOT lead the wall: leading with old PD reads like every unfiltered IA front-end,
  and recency-first is the identity. The pin now lands at `theme.slot` (category rows before
  it, default 5, per-theme in theme-config.json). Verified: 5 row headers + the Dial render
  before the pin.
- localStorage quota bug (B caught it on gen switch): the cached wall payload outgrew the
  web quota at 90+ crates x 3 gen keys, and FAILED writes left stale payloads serving
  forever (the session's stale-wall ghosts, explained). Fix in store/cache.js: cached copy
  is slim (12 items/crate, 140-char descriptions), only the active gen key survives, quota
  errors clear-and-retry once. In-memory payload stays full; only persistence slims.

## Determinations pending (B)
- All theme copy (title, copy line) and the first real theme week (config has a placeholder
  window 2026-06-11 to 2026-06-18 on gems_wikidata, slot 5).
- Cadence (weekly vs monthly) and whether the pinned row gets a distinct visual treatment
  in the aesthetic remodel (current: minimal eyebrow + copy, intentionally quiet).

## THE DIAL (slice 4, same day): BUILT and verified
- `mobile/src/components/DialRow.js` NEW, self-contained: 8 authored channels (mixes copied
  from HomeScreen's channelDefs on purpose; consolidation is a named cleanup), one cached
  /api/channel/queue call per channel (50 deep, spine-backed), clock math against a fixed
  epoch (2026-01-01 UTC), runtime||900s duration rule (MUST stay identical across clients or
  viewers desync; version-bump the row to change it). Cards: thumbnail, ON NOW badge,
  live progress bar (10s tick), channel label, on-now title. Tap = tune.
- HomeScreen: DialRow mounted in the wall's opening block; handleDialTune hands the player
  the SAME queue, index, and offset the card showed. PlayerScreen: `startAtSeconds` param +
  one-shot poll-seek (VideoPlayer has no onReady; polls imperatives, gives up at 20s,
  never re-seeks after recovery, restarts item when the slot outruns real runtime).
- ZERO new backend: /api/channel/queue serves unchanged. VideoPlayer.js untouched.
- VERIFIED live in the preview: row renders with ON NOW + progress alongside the theme pin;
  tapping a card navigated to /watch/... and the video sat at 366s of 1258s, mid-scene,
  matching the schedule. Auto-advance inherits the existing channel machinery.
- Queue stability note: positions stay in sync across viewers within a cache window
  (30m edge in prod) and drift only at spine sync boundaries. Honest v1.

## Next in Move 2 (not started)
- JOB_19: PWA manifest, install prompt, web push, service-worker version handshake.
- Dial polish candidates: per-gen channel ordering, a Friday-night programming-desk block
  scheduling the Dial (the JOB_14 theme system can drive it), surf-flip transition statics.
