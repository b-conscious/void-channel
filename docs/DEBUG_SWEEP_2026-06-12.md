# DEBUG SWEEP — 2026-06-12 (phase a: evidence only, nothing fixed)

B's mandate: "absolute debug session with surgical md5 check locks... things are not
changing, same side vids on most vids, stale search results etc and many other small
things i wont say and want you to see and correct after."

Fixed BEFORE this sweep (same day, verified): same-side-vids root cause (collection
page-1 rails + "!" mirror junk, slice 47), foreign bleed (slice 48), nonsense wall
(era window unbounded, slice 44), player sliver (slice 46).

## PUNCH LIST (severity order — B triages, then one declared unlock per item)

P1. [DONE — slice 51] KIDS NETWORK CHANNELS MISSING. Fixed in 5 layers (skipVet for
    vouched, spine resolved-item cache = the real storm fix, mapLimit(5), full-build-only
    cache arm, boot warm). Now 10/10 channels with tapes, full wall 6.7s (was 171s/blank).

P1-orig. KIDS NETWORK CHANNELS MISSING FROM THE WALL. Cold ?kids=1: 3 rows, 0 channels, 57s.
    Second hit: only 1 of 10 channels. Mechanism: cold channel build resolves 100+ items
    through getItem; slice 36's playability vet adds one ranged GET per uncached file
    (codec-cache has only ~3 entries), doubling IA calls -> timeouts/rate-limit ->
    failed resolves, and the 10-min channel cache HOLDS the empty/partial result.
    Fix directions for triage: (a) skip the vet for B-vouched kids-saturday ids (vouch
    implies played-and-approved), (b) never cache an EMPTY channel set (retry next hit),
    (c) background-warm channels at boot instead of first-request, (d) batch-limit vet
    concurrency. Probably (a)+(b) minimum.

P2. VOID SNACKS SERVING ADULT-BRAND PROMO. /api/shorts returned "Playboy TV Promo" +
    movie trailers on the default wall. Mature-posture breach (corral ruling) + snacks
    quality. Inspect the shorts pool query + add the corral exclude / title screen.

P3. [DONE — slice 54] Sync respects fixed sort + drops future-dated at ingestion; serve
    re-ranks by downloads (no shuffle) + screens capcut/iptv junk; 50 poisoned rows purged.
    Now leads with real content (Spider-Man TAS, Anpanman, Rick Astley). 2 Spanish oddities
    remain (not clearly spam, left alone).

P3-orig. MOST POPULAR LEADS WITH FUTURE-DATED JW CONVENTION SPAM ("2038-2039...", "2035...").
    Row is era-exempt (authored downloads sort) so slice 44's sanity clamp doesn't apply.
    Options: year-sanity filter at the POOL level (year > now+1 = metadata garbage,
    null it), or a downloads-sort quality screen for this row. B's call.

P4. [DONE — slice 55] Default sort now rotates over a 6h bucket keyed by the query
    (downloads/week/month/avg_rating). Repeat searches freshen; pagination stays stable;
    relevance preserved. Verified live.

P8. [PARTLY DONE — slice 56] /health now reports spine reachability ({spine,degraded},
    verified both ways); start-void.cmd captures stderr to *-error.log so the next silent
    crash leaves a trace. REMAINING (B's call, mobile/src): a client "reconnecting" state
    instead of a blank wall when degraded. Root cause of today's death still unknown — the
    logfile will catch the next one.

P8-orig. SPINE-DOWN = SILENT EMPTY WALL. When the spine (:3002) is down,
    the backend's spineGet fails and archive.search/getAllCategories return [] per the
    degrade-to-empty contract — so the WHOLE app (wall, search) goes blank with NO error
    surfaced. The spine died silently mid-session today and only deep probing caught it.
    Fix directions (B triage): (a) backend /health should report spine reachability;
    (b) a visible "backend reconnecting" state client-side instead of a blank wall;
    (c) consider why the spine died (no crash log captured — needs the cmd window's stderr
    or a logfile). Related to the watchlist mirror/resilience entry.

P4-orig. SEARCH FEELS STALE BY DESIGN: default sort is downloads desc — deterministic, same
    top results forever (cache is NOT the issue: spine 5m + backend 30m only). Option:
    blend a rotating page/sort tier into search results like the wall's bucketSample,
    OR a "freshness" toggle. B's call — raw-search law says don't curate, but ranking
    rotation isn't curation.

P5. KIDS COLD-BUILD LATENCY: 57s first load after restart = long blank wall for kids.
    Tied to P1; background warm at boot fixes both.

P6. Dev-only console warning "Unexpected text node: ." on some player state (slice 35
    note). Cosmetic, prod builds strip it. Low.

P7. videoUrlHQ null when best===fast after slice 31's size-pick (cosmetic; HQ toggle
    rarely used). Low.

OBSERVATIONS (no action without B):
- Catalog healthy and growing: 34 verified series, 3,974 films.
- Kids payload junk-free in the rows that DID serve (0 "!" titles, 0 actinf).
- Millennial faces correct (1981-1999). Genz faces correct post-slice-44.
- Search IS live (spine raw passthrough), search-raw law intact.
- Client wall cache (localStorage) can mask backend recovery — the known trap; consider
  a payload-age stamp + auto-refetch in VersionWatch's pattern someday.

## CLEANUP (slice 52, B: "clean this... procrastination is the devil")
- .gitignore now covers runtime state: codec-cache.json, wiki-cache.json, kids-sources/_raw/
  (data/ + hearts.json already covered). These mutate every request — out of git AND out of
  the lock baseline.
- BASELINE.md5 REGENERATED as a COMPLETE source lock: 187 files (was a partial 134 — only
  the files we'd touched). Excludes node_modules/.git/.expo/dist, runtime caches, spine.db,
  .env, logs. This is the surgical gate for the rest of the debug session.
- Inbox cleared: removed my ia_*demo test files; archived B's unusable YouTube-chrome drop
  to _raw/. kids-sources/ is a clean empty inbox again.

## RE-LOCK STATE
BASELINE.md5 regenerated at the evening checkpoint (133 files, 133/133 OK) BEFORE this
sweep; this doc + the punch list are the only additions since. Re-lock again after each
triage fix lands.
