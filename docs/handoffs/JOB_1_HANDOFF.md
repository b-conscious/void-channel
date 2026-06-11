# JOB_1 HANDOFF: Void Channel Migration

Status: ACCEPTED locally 2026-06-11. Prod cutover requires Render env + manual deploy (below).

## What changed
- `backend/archive.js` gained a SPINE TRANSPORT block (above module.exports). When `SPINE_URL`
  is set, the four low-level functions are rebound: `search` -> Spine /search raw passthrough,
  `getItem` -> Spine /item, `getAllCategories` -> Spine /wall pools with per-20-minute-bucket
  deterministic sampling (replaces the old live-blend randomness, zero Archive load),
  `getCategoryItems` -> Spine /category pages with applyEraLean applied per request.
  Rebinding the declarations also reroutes every INTERNAL caller (getRelated, searchBlended,
  shorts, trending, collections, creators). When `SPINE_URL` is unset, the direct Archive paths
  run untouched: the Spine process requires this same file and stays direct. No recursion.
- `spine/spine.js` gained `/wall?type=&rows=` (bulk pool payload, one call builds the backend
  wall) and `/search` gained `page`, `sort`, and `raw=true` (full caller-controlled query).
- `spine/sync.js`: empty draw on a rotated page now falls back to page 1, so thin crates can
  never be parked empty across sync cycles.
- `backend/schema-item-type.sql`: additive item_type columns. DETERMINATION PENDING: B runs it
  in the Supabase SQL editor (verify table names).
- server.js: ZERO changes. All existing social features untouched by construction.

## Verified acceptance
- Parity by payload diff against pre-migration baselines: 81 categories per generation, same id
  set, 22 recognizable rows, item key shape intact, generation row orders DISTINCT (era lean
  alive), shorts texture intact through the passthrough (21 items, heuristics verbatim).
- Wall serves in 17ms from pools (was 28s live-warming). Backend restart re-warms in
  milliseconds: the cold-boot problem is dead in the backend too.
- /api/item resolves, /api/search returns 25, /api/related returns 15, See More page 2 works.
- Backend log contains ZERO archive.org URLs across a full wall load. The Spine is the only
  process talking to archive.org.

## Failures hit and resolved
1. SPINE_URL invisible at module load: dotenv ran after archive.js was required. RESOLVED with
   an idempotent `require('dotenv').config()` inside the transport block.
2. The .env append FUSED onto the last line (file had no trailing newline): `...TOKENSPINE_URL=`.
   Both variables corrupted silently. RESOLVED by splitting the line. Lesson: check trailing
   newlines before appending to env files.
3. Six wall rows empty after migration: their first sync drew thin or throttled pages. Four
   filled on re-sync; `deep_driver_ed` needed the new page-1 fallback (24 items exist, page 3
   does not); `blaxploitation` returns zero on EVERY page: its QUERY is broken (nested
   `subject:("black cinema" AND year:[...])` is malformed Lucene). Pre-existing content bug the
   Spine exposed. OPEN: fix the blaxploitation crate query.
4. Diversify over-fetch broke pool pagination (page 2 at rows*2 jumped past the pool end) and
   the per-series cap starved finite pool pages (25 raw -> 4 survivors). RESOLVED: over-fetch
   and diversify apply on page 1 only.

## Notes for the next session
- Pools deepen toward cap 300 across sync cycles; page-2+ texture improves on its own.
- Prod cutover: set SPINE_URL on Render (the Spine needs a deployment home first: the
  persistence DETERMINATION from JOB_0 now blocks prod cutover, not local work).
- The old searchBlended/searchVariety live-blend code is dormant in the backend process, still
  live for the Spine process. Physical relocation of archive.js into the Spine remains optional
  future cleanup; the env gate makes it safe to defer.
- Backend warm logs still say "fetching from Archive.org": stale log copy, cosmetic, via Spine.
