# JOB_0 HANDOFF: The Archive Spine

Status: ACCEPTED. Built and verified 2026-06-11 on B's machine.

## What exists
- `/spine/`: standalone Express service, port 3002. `spine.js` (routes), `db.js` (SQLite + FTS5),
  `categories.js` (registry), `sync.js` (pool-accumulating sync), `mappers.js` (item detail),
  `test-fixtures.js`, `README.md`.
- `/fixtures/fixtures.json`: 10 real fixtures across all four types plus 10 PENDING_B slots.
- `/.github/workflows/ci.yml`: syntax checks + fixture run + web bundle export on every push.
- 92 categories registered: 81 video (required live from `backend/archive.js`, zero duplication),
  5 audio, 3 game, 3 text.

## Verified acceptance
- First full sync: 4195 items into 84 of 92 pools, 390s, ZERO errors. The 8 empty pools kept
  last-good state and fill on later sort/page rotations (this is designed behavior).
- `/category/shellac` serves audio items; `?page=2` serves different items (pagination over pool).
- `/item/ZydereenOfNeptune` resolves videoUrl. `/item/...gbia3037740a?type=audio` returns a
  tracklist with parsed duration (192s).
- `/search?q=polka&local=true` returns FTS5 hits instantly. Live passthrough stays raw.
- `/health/playability?crate=ephemeral&n=4` returned 1.0 (4 of 4 resolve playable URLs).
- Fixture run: 10 of 10 map without throwing. `Be_Ye_Holy` correctly reports NOURL (an audio
  item in a video crate; the graceful-failure case).
- RESTART TEST: process killed and restarted against the existing db. Pool intact at 4195,
  no startup re-sync, log line "pool fresh". The cold-boot problem is dead at this layer.

## Failures hit and resolved
1. better-sqlite3 failed to install: node-gyp native compile, no prebuilt binary for Node 24,
   no build tools on the box. RESOLVED by switching to node:sqlite (built into Node 22.5+,
   FTS5 included, zero native deps). package.json now carries `engines.node >= 22.5`.
2. First FTS probe returned 0 hits and looked broken. It was correct: the probed title was a
   fixture id, not a pool member. Re-probed with an in-pool term, 2 hits. Lesson recorded:
   probe with data you know is in the pool.
3. Eight categories returned empty on their first page draw (thin pages or Archive throttle).
   Not resolved because it is not a defect: empty results never overwrite a pool, and rotation
   fills them on later syncs. Health reports them.

## Determinations
- DETERMINATION PENDING: deployment target. The ephemeral-disk trap is documented in the README.
  Candidates: Render persistent disk, a real box, or db snapshot to Supabase Storage on boot.
- DETERMINATION PENDING: B's 10 fixture picks (PENDING_B slots, see fixtures.json for the wanted
  shapes: etree multi-set show, em-dosbox game, JSMESS game, EPUB novel, comic, sheet music,
  no-derivative item).
- TAKEN (simpler option): admin auth is a shared secret header `x-spine-key` from env
  `SPINE_ADMIN_KEY`. Admin endpoints return 503 when the env var is unset.
- TAKEN: setInterval over node-cron (one less dependency; pm2 owns process lifetime).
- TAKEN: video categories are required live from `backend/archive.js` rather than copied.
  JOB_1 may relocate the file physically; the registry mapping isolates the dependency.

## For JOB_1 (Void Channel migration)
- Spine base URL env var: `SPINE_URL` (default http://localhost:3002).
- The backend keeps request-time policy (era lean, mature gate, diversify, snacks heuristics)
  and treats the Spine with last-known-good + stale-while-revalidate. Plan section 10.7.
- Parity is verified by payload diffs per generation, not eyeballs.
- `/api/shorts` pool sources can become spine categories or stay backend-side; either is fine,
  the title heuristics must survive verbatim.
- Note: spine pools serve list-level items already shaped like the frontend expects (`id`,
  `title`, `thumbnail`, `year`, ...) because normalizeItem is shared.
