# The Archive Spine

Standalone service. Owns all communication with archive.org for THE VOID. Accumulates deep
per-category pools (cap 300, oldest out) instead of snapshotting, so variety and the era lean
always have material. Serves normalized items over REST. See THE_VOID_BUILD_PLAN.md section 2.

## Run
```
cd spine
npm install
set SPINE_ADMIN_KEY=pick-a-secret
node spine.js          # or: pm2 start spine.js --name spine
```
Port 3002 by default (`SPINE_PORT`). On first boot it syncs every active category (staggered
2s, circuit-breakered). On later boots it syncs only when the pool is stale; a restart with a
healthy `spine.db` does NOT re-sync.

## Persistence (the named trap)
`spine.db` must survive restarts. Render instance disks are ephemeral: a plain Render service
loses the db on every deploy, forcing a full Archive re-sync, which defeats the service.
DETERMINATION PENDING: Render persistent disk, a real box, or db snapshot to Supabase Storage
restored on boot.

## Endpoints
```
GET  /categories?type=audio
GET  /category/:id?page=2&rows=50
GET  /category/:id?refresh=true        admin (x-spine-key)
GET  /item/:identifier?type=audio
GET  /search?q=...&type=video          live passthrough, raw, 5m cache
GET  /search?q=...&local=true          FTS5 over the pools, instant
GET  /random?type=game
GET  /health                           pool depths, last sync, errors
GET  /health/playability?crate=X&n=5   admin; the ship/cut number per crate
POST /sync                             admin
POST /sync/:id                         admin
```

## Env
- `SPINE_PORT` (3002), `SPINE_DB` (./spine.db), `SPINE_POOL_CAP` (300)
- `SPINE_ADMIN_KEY` (required for admin endpoints)
- `SPINE_STAGGER_MS` (2000), `SPINE_SYNC_INTERVAL_MS` (8h)

## Tests
`node test-fixtures.js` runs the permanent fixture set in /fixtures and prints one line per
item. CI runs this plus a web bundle export on every push.

## Notes
- Video list normalization and item resolution reuse `../backend/archive.js` directly (zero
  duplication; the circuit breaker and NSFW excludes ride along). JOB_1 may relocate the file.
- Audio/game/text item mappers are JOB_0 stubs; JOB_3/6/7 complete them.
- The `query` field is stripped from public /categories responses.
