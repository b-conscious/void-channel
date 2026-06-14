# THE VOID - THE MAP

*The north-star for building VOIDtv purposefully, from line 1.*

We walked these woods once already. The first build had to be defensive: you cannot route
intentionally through terrain you have never crossed, so every surprise got a path hacked around
it, and the app runs and does what we wanted in most areas. That expedition's real product was
not getting through - it was THIS MAP. Now the terrain is known, and known terrain gets a road,
not a trail of detours. This document is the map so that others (future contributors, the next
session, future-Bryan) arrive to intentional understanding instead of surprise.

A purposeful line 1 serves a purpose that exists as an artifact first. This is that artifact.

---

## HOW TO READ THIS MAP (the legend)

Every terrain feature is one entry: **what it is -> why it's there -> the intentional route ->
label.** The label tells you how to treat it in the rebuild:

- **[HAZARD]** - terrain that does not move. A fact of the environment. Design so you cannot
  fall in. Marked "here be dragons; route accordingly."
- **[DETOUR->ROAD]** - a hack we made because we were surprised. The road bypasses it entirely.
  Discard the improvised version.
- **[BRIDGE]** - looks temporary, is actually sound infrastructure we would build again on
  purpose. Re-lay it as permanent road: keep the engineering, drop the improvised packaging.
- **[GATE]** - a hard, fail-closed safety or legal rail. Stays defensive ON PURPOSE. Few,
  explicit, auditable, tested. Never softened into "intent."
- **[INTENT]** - knowledge currently expressed as a defensive filter that should FLIP polarity:
  same knowledge, stated as what the product wants, not what it rejects.

The single way to get the rebuild wrong is to mislabel: preserve a DETOUR, tear out a BRIDGE,
soften a GATE, or keep an INTENT as a negative filter. The label is the decision.

---

## SECTION 0 - THE DESTINATION (what line 1 serves)

The road leads somewhere specific. These are non-negotiable, and every routing decision below
is in service of them:

- **The HUNT is the product.** VOIDtv is the search/discovery experience over a vast archive,
  not a fixed catalog. Raw noise stays discoverable; curation shapes the surfaces, never the
  underlying stream.
- **VOIDtv POINTS at IA-served media; it does not host it.** Rights inform decisions, they do
  not gate them. Only Bryan's own rulings gate (hard excludes, mature corral, kids fail-closed).
  Never moralize branded/ripped material as a posture blocker.
- **Recency-first** (post ~1975 lean) everywhere by default; pre-1975 only as curated "gems &
  cult" surfaces. The living recent stream leads.
- **The void-TV aesthetic** is the identity: a wall of channels, lean-back, made for the 10-foot
  room. Void-TV cards are ~10% of cards, staggered. Standing, hardwired, never diluted.
- **Kids is fail-closed; mature is corralled, not censored.** Safety is a hard rail; everything
  else stays findable.

---

## SECTION 1 - FOUNDING PRINCIPLES (the lessons, turned into constraints)

These are earned, with receipts in the map below. In the rebuild they are load-bearing from
line 1, not bolted on later.

1. **One external-call gate.** Nothing calls `fetch` directly. Every outbound request goes
   through a single client that enforces abort+timeout, the circuit breaker, and structured
   logging. Whole classes of bug (ignored timeouts, un-broken retries) become impossible by
   construction.
2. **Explicit process boundaries with a typed contract.** Backend and Spine are two roles joined
   by an explicit transport module and a defined contract. Never one shared file that changes
   behavior based on which process loaded it or what ambient env it sees.
3. **No behavior decided by ambient global env deep in a module.** Config is passed at the
   boundary, explicitly. What a process must NOT see, you strip at the boundary; never rely on a
   var being absent.
4. **Observability and version-stamping from line 1.** Every deploy stamps a version; `/health`
   reports it; logs name the code path. "Behavior outranks the dashboard" becomes a capability,
   not a detective skill earned at 3am.
5. **Classification is ONE tested pipeline, not scattered regexes.** A single source of truth,
   fixture-tested, feeding the intent model and the gates.
6. **Durable shared state from line 1.** No per-instance local files for anything that must be
   consistent across instances. Decide the state home before line 1, not after growth forces it.
7. **Tests/fixtures + CI before features.** Every phantom bug this build produced was
   CI-catchable. The web bundle compile + fixture tests run on every push, before deploy.
8. **Forward-facing intent over defensive reaction.** Express what the product WANTS (positive
   selection per surface); let what does not match fall away. Reserve hard gates for safety and
   legal only. (Section 4 is this principle in full.)

---

## SECTION 2 - THE MAP, TERRAIN BY TERRAIN

### A. Runtime, deploy, and the launcher

**A1. The Spine self-recursion (2026-06-14, the one that cost a multi-hour false "IA ban").**
- *What:* `start-prod.js` spawned the spine with the full `process.env`, which on Render includes
  the platform-injected `SPINE_URL`. So the spine's own `archive.search`/`getItem` rerouted to
  `localhost:3002` = itself, recursing until the 30s timeout. Search returned empty after 30s;
  item resolves 500'd; IA was never actually reached on those paths.
- *Why it bit:* `archive.js` assumed "no `.env` in the spine's cwd => direct paths." True locally;
  FALSE on Render, where env is injected at the platform level and inherited by every child.
- *Route:* two roles, explicit transport. The spine has no notion of a self-URL. The backend's
  client points at the spine through an explicit transport module. Config crosses the boundary
  on purpose. (See Principle 2, 3.)
- **[HAZARD]** (env inheritance on hosted platforms) + **[DETOUR->ROAD]** (the env-reroute
  shapeshift of one shared file).

**A2. The reroute-by-reassignment pattern.**
- *What:* `archive.js` reassigned its own exported `search`/`getItem` at module load when
  `SPINE_URL` was set ("one module, two processes, no recursion"). Clever, and the direct cause
  of A1.
- *Route:* never monkey-patch a module's exports by ambient env. A transport is a separate object
  you inject. (Principle 1, 2.)
- **[DETOUR->ROAD].**

**A3. Dead timeout (undici ignores `{timeout}`).**
- *What:* `spine/mappers.js` used `fetch(url, { timeout: 20000 })`. That is node-fetch syntax;
  Node's built-in fetch (undici) SILENTLY ignores it. Item-metadata resolves had no working
  timeout, hung ~30s under any IA slowness, and kept signalling a throttled IA so it never got a
  quiet window.
- *Route:* the one HTTP gate (Principle 1) enforces `AbortSignal.timeout` on every call. No raw
  fetch exists to carry a node-fetch-ism.
- **[HAZARD]** (undici != node-fetch) + **[DETOUR->ROAD].**

**A4. Behavior outranks the dashboard.**
- *What:* this session, git was correct and the deploy read "Live," yet the running path was
  broken. Hours went to reconciling the contradiction. The decisive clue was a LOG PREFIX
  (`[spine search]`, not `[archive.search]`) revealing which code path actually ran.
- *Route:* version-stamp every deploy; surface it on `/health`; have logs name the path. Diagnose
  the path that RUNS, not the file you remember fixing. (Principle 4.)
- **[BRIDGE]** (version-stamping + path-named logs, build it as road).

**A5. The OOM crash-loop (2026-06-12 cutover).**
- *What:* co-locating backend + spine + SQLite + first sync blew the 512MB box. The original
  launcher exited the whole service when the spine died, turning a spine OOM into a 502
  crash-loop, which hammered IA and earned the throttle.
- *Route, learned the hard way:* the public process stays alive independently of the data
  process. Backend = primary (its death = restart); spine = restartable secondary (its death =
  log + backoff-restart, site stays up). Right-size RAM rather than capping heaps (hard caps
  trade an OOM for a heap-OOM). The launcher is the source of truth for child env, not the
  dashboard.
- **[BRIDGE]** (decoupled-process supervision) + **[HAZARD]** (a single box cannot co-locate
  everything; sizing is a design input).

**A6. Squeeze env vars that would not die.**
- *What:* `BACKEND_HEAP_MB/SPINE_HEAP_MB/SPINE_POOL_CAP` left set on Render kept starving the
  spine even after the box grew; deleting them in the UI did not stick.
- *Route:* the launcher strips such vars in code before spawning. Config that must be off is
  enforced at the boundary, not trusted to a dashboard. (Same family as A1.)
- **[BRIDGE]** (strip-at-spawn) .

**A7. Render auto-deploy does not reliably cut over.**
- *What:* a push's auto-deploy often does not swap the running container; the fix is a manual
  "Clear build cache & deploy," verified by `/health` uptime reset + the version stamp.
- *Route:* a deploy is not "done" until the version stamp confirms it. Pair with a build filter
  (ignore `docs/**`, `mobile/**`) so doc/frontend pushes do not needlessly restart the backend.
- **[HAZARD]** (platform deploy semantics) .

### B. The Internet Archive relationship

**B1. IA tarpits a throttled IP (does not 429/403).**
- *What:* when IA throttles an IP it holds requests open ~30s with no response, rather than
  rejecting. A soft timeout that does not fire then stacks 30s connections, which signals
  continued activity and prevents the throttle from ever expiring.
- *Route:* hard-abort every IA call fast (8s) via the one gate; fail to a fallback; go quiet so
  IA can release the IP. Never health-probe IA (poking a throttled IA prolongs the block).
- **[HAZARD].**

**B2. The circuit breaker.**
- *What:* after N consecutive failures, open the breaker: return empty immediately without
  touching IA for a cooldown; one success closes it. Stops retries from prolonging a throttle.
- *Route:* first-class in the one HTTP gate, fed by EVERY external path (the rerouted search did
  not feed it - that gap was a bug). Shared, observable.
- **[BRIDGE].**

**B3. Seed-from-disk.**
- *What:* a committed `seed-spine.db` (a known-good local sync) is copied to the disk on boot
  when the DB is effectively empty, so the wall fills instantly with zero IA dependency. Decided
  by ROW COUNT, not file size (an empty schema+WAL exceeds 1MB and fooled the size check).
- *Route:* keep exactly this. Seeded reads (wall, catalog) must always work even when live IA is
  down. Decide emptiness by content, never by bytes.
- **[BRIDGE].**

**B4. Self-healing sync with backoff.**
- *What:* the spine retries sync every 15min while the pool is THIN (<500 video rows), then backs
  off to 8h once healthy. Avoids the "banked an empty sync as fresh" 8-hour-empty trap.
- *Route:* keep. Health is measured by pool content, and cadence adapts to it.
- **[BRIDGE].**

**B5. Degrade to empty, never 500.**
- *What:* when the spine is unreachable, the backend serves an empty/last-good wall (treated as
  "warming") instead of throwing ECONNREFUSED 500s at users. The site stays up through any spine
  restart.
- *Route:* keep as a contract: a data-layer outage degrades the surface, never breaks it.
- **[BRIDGE].**

**B6. The playability vet storm (P1).**
- *What:* a per-item playability check doubled IA calls on kids-channel builds, stormed the
  rate-limit, and blanked the wall (then cached the blank for 10m).
- *Route:* vouched content skips the vet; bounded concurrency; cache only on a FULL successful
  build; never regress a fuller cache with a thinner one. The proper long-term answer is a
  resolve-time playable check, not a pre-storm.
- **[DETOUR->ROAD]** (the skip-vet patch) + **[BRIDGE]** (bounded concurrency + cache-only-on-full).

**B7. The CORS wall on IA media.**
- *What:* IA serves media without permissive CORS, so reading pixels/audio cross-origin taints
  the canvas (SecurityError). This blocks any in-browser video/audio cleaner. Proxying full video
  through our backend is the bandwidth cliff (it took prod down once).
- *Route:* in-browser media processing is VIABLE only on content WE host with CORS. Do not build
  it app-wide into the wall. Mark the wall.
- **[HAZARD].**

**B8. Our own API has no rate limiting.**
- *What:* IA's limits are breakered, but `api.voidtv.net` itself can be hammered or used to
  relay-hammer IA through us.
- *Route:* a modest per-IP limiter at the edge from line 1; protects the bill and the IA
  relationship.
- **[GATE]** (light, but a protective rail).

**B9. Thumbnail proxy bandwidth.**
- *What:* `/api/thumb/*` rides Render bandwidth; an edge cache rule in front of it removes a cost
  cliff + latency tax.
- *Route:* edge-cache thumbnails from line 1.
- **[BRIDGE].**

### C. Content, curation, and the intent model

**C0. The polarity flip (the heart of the rebuild).**
- *What:* nearly every content heuristic today is DEFENSIVE - a reaction to an obstacle that bit
  us: `dropJunk`, `dropFutureDated`, `MATURE_TITLE_RE`, `JUNK_TITLE_RE`, the snack
  compilation-filter. A wall of negative guards scattered across files. That is the clutter, and
  it buries what VOIDtv is under what it is against.
- *Route:* keep the KNOWLEDGE, flip the POLARITY. Surfaces DECLARE what they want; positive
  signals compose into a fitness score; what does not match falls away as a consequence, instead
  of being individually hunted and blocked. Selection by intent, not rejection by patch.
- **[INTENT]** (the whole class).

**C1. Junk and future-dated spam.**
- *What:* `dropFutureDated` (a "2037 Convention" fake-date led Most Popular), `dropJunk`
  (capcut/iptv/keygen non-films flooding the downloads-ranked rows).
- *Route:* not three filters - inputs to one "is this a real, alive piece of the hunt" fitness
  signal. Spam scores low against what a surface wants; it is not separately blocked.
- **[INTENT].**

**C2. Most Popular ranking bugs (P3).**
- *What:* two bugs - sync rotated a fixed-sort row through 'year desc' (ranking 2037 spam first),
  and the wall builder shuffled fixed-sort rows (so 7-download spam led "most watched").
- *Route:* a surface's declared intent ("the most watched, ranked by downloads") is honored
  end-to-end; ranking is a property of the surface's intent, not a post-hoc reshuffle. Drop
  future-dated at ingestion as a data-quality step (a GATE on data sanity), separate from
  ranking.
- **[INTENT]** (ranking-as-intent) + **[GATE]** (ingestion data-sanity).

**C3. Generational era-lean (v2).**
- *What:* rows lean by generation; the lean is heavier and wall-wide; the client reshuffle must
  be BANDED. Full-shuffle scrambles the lean; skipping freezes it. ONE shared payload reordered
  in memory - do NOT fetch per-generation (that caused a 40-min outage).
- *Route:* lean is an INTENT expressed on one shared payload, reordered client-side in bands.
  Never per-gen fetch. Trap to remember: a localhost wall with the backend down looks like a lean
  regression but is stale cache.
- **[INTENT]** + **[HAZARD]** (per-gen fetch = outage).

**C4. Social-mirror junk.**
- *What:* youtube/twitch/soop mirrors inject copyrighted, "!"-titled junk into related rails and
  browse.
- *Route:* filter the CURATED surfaces (related, browse) by intent; search stays RAW (the hunt
  must see everything). Curate the surface, never the stream.
- **[INTENT]** (on curated surfaces) .

**C5. Mature corral, kids fail-closed, hard excludes.**
- *What:* mature content is corralled behind an 18+ members-only gate (findable, not censored);
  kids mode is fail-closed; Bryan's hard-exclude rulings remove items entirely.
- *Route:* these are GATES, not intent. Few, explicit, fail-closed, tested. They stay defensive
  on purpose and must never be folded into the soft fitness model.
- **[GATE].**

**C6. Void-TV cards.**
- *What:* void-TV cards are ~10% of cards, staggered (~10s), standing and hardwired.
- *Route:* keep as a fixed identity parameter of the wall, not a tunable that drifts.
- **[BRIDGE]** (identity invariant).

### D. State and data durability

**D1. File-based per-instance state blocks failover.**
- *What:* `views.json`, kids-picks, `wiki-cache`, the L1 cache live as per-instance local files.
  Two instances drift immediately (different kids walls, different verdicts), so no mirror or
  failover is possible.
- *Route:* durable shared state (Supabase/Upstash) from line 1 for anything that must be
  consistent. L1 in-memory cache is fine as a per-instance accelerator over a shared L2.
  (Principle 6.)
- **[HAZARD]** (the current blocker) + **[BRIDGE]** (shared-state model as road).

**D2. Supabase RLS is unaudited.**
- *What:* if row-level security is not enabled on hearts/views/playlists/comments/profiles, the
  public anon key can write anyone's rows. Highest-priority unverified assumption.
- *Route:* RLS on by default, audited, before any social surface grows. A GATE.
- **[GATE].**

**D3. Backups.**
- *What:* free-tier backup retention is short; hearts/contributions/comments are the community's
  labor.
- *Route:* verify retention, schedule an export; the spine DB snapshot is part of the same
  answer.
- **[BRIDGE].**

### E. The quality engine (process as infrastructure)

**E1. No CI, no tests (the meta-cause of the phantom bugs).**
- *What:* stale-bundle phantom bugs and the unverifiable deploys all trace here.
- *Route:* one GitHub Action - web bundle compile + fixture tests on every push, before deploy.
  Fixtures are born with the first module. (Principle 7.)
- **[BRIDGE].**

**E2. Service-worker / API version handshake.**
- *What:* old bundles hitting new APIs generate phantom bug reports identical to the ones that
  burned this build.
- *Route:* API version header + a "new version, tap to refresh" toast. Pairs with A4's
  version-stamp.
- **[BRIDGE].**

**E3. The BASELINE lock discipline.**
- *What:* `docs/BASELINE.md5` (md5 of all source, runtime/secrets/media excluded); declare an
  UNLOCKED set per slice, edit, re-lock. It kept a large surface honest across many sessions.
- *Route:* keep the discipline; in a tested codebase, CI + a clean module structure share the
  load, but the lock stays as the change-control spine.
- **[BRIDGE].**

**E4. No uptime alerting.**
- *What:* `/health` reports `{spine,degraded}` but nothing ALERTS; a 3am spine death is found by
  manual check.
- *Route:* an UptimeRobot keyword monitor on `/health` (keyword `"degraded":false`, alert when
  NOT found) catches both spine-degraded and total-down in one. Zero-code. Do NOT probe IA.
- **[BRIDGE].**

**E5. No analytics.**
- *What:* only raw view counts; we cannot see what works.
- *Route:* a privacy-respecting counter (self-hosted Plausible or equivalent) that fits the ethos.
- **[BRIDGE]** (deferred, but on the map).

### F. Legal and relationship terrain (pointers; counsel/accountant own these)

**F1. TMDB terms likely class us COMMERCIAL.** Donations + LLM (the Archivist) + destination site
trip their examples; AI training on TMDB content is a hard breach. Route: free nonprofit key if
granted, else DROP TMDB for Wikidata (CC0, no agreement). **[GATE]** (do not ship without a
permitting key).

**F2. Terms of Service + Privacy Policy do not exist.** Accounts, comments, watch history, and
minors can reach it. Cheap to stand up, load-bearing the first time anything goes wrong. **[GATE].**

**F3. UGC moderation path.** Comments + usernames exist; a report/remove affordance + a written
practice barely do. CDA 230 favors us; hygiene keeps it that way. **[GATE]** (light).

**F4. Charitable solicitation registration.** Online donation buttons reach donors in states that
require nonprofit solicitation registration. Accountant/counsel item before any growth push.
**[HAZARD]** (regulatory; not a code item).

**F5. The IA partnership.** A 501(c)(3) making the Archive usable for humans is exactly IA's
story. A partner contact can mean rate-limit relief and blessed status that the breaker cannot
buy. The Spine makes us a polite consumer first - the right order. A letter Bryan can send; Opus
can draft. **[BRIDGE]** (relationship as resilience).

---

## SECTION 3 - THE KEEP LIST (bridges to re-lay as permanent road)

Re-build these on purpose; keep the engineering, drop the improvised packaging:
- Circuit breaker, fed by every external path, living in the one HTTP gate. (B2)
- Seed-from-disk, emptiness-by-row-count. (B3)
- Self-healing sync with content-measured backoff. (B4)
- Degrade-to-empty-never-500 as a surface contract. (B5)
- Decoupled process supervision (public process independent of data process). (A5)
- Strip-at-spawn for config that must be off. (A6)
- Version-stamping + path-named logs. (A4)
- Edge-cached thumbnails. (B9)
- CI (bundle compile + fixtures), SW/API version handshake, BASELINE lock. (E1, E2, E3)
- UptimeRobot keyword monitor. (E4)
- Void-TV-card identity invariant. (C6)

## SECTION 4 - THE DISCARD LIST (detours the road bypasses)

Do not preserve these; the road makes them unnecessary:
- The env-reroute shapeshift of a single shared `archive.js`. (A1, A2)
- Any raw `fetch` carrying node-fetch-isms (`{timeout}`). (A3)
- Scattered defensive content regexes as standalone filters - their knowledge moves to the intent
  model. (C0, C1, C4)
- Post-hoc reshuffles that fight a surface's declared sort. (C2)
- The dashboard as a source of deploy truth. (A4, A7)

## SECTION 5 - THE HAZARD LIST (terrain that does not move; design around it)

- Hosted platforms inject env into child processes. (A1)
- Node's built-in fetch is not node-fetch; `{timeout}` is ignored. (A3)
- Render auto-deploy does not reliably cut over. (A7)
- IA tarpits a throttled IP rather than rejecting; never probe it. (B1)
- IA media has no permissive CORS; in-browser processing only on self-hosted content. (B7)
- Per-instance file state cannot fail over. (D1)
- Per-generation wall fetches cause outages; lean is one payload, banded. (C3)
- Free-tier cliffs (Render/Vercel/Supabase/Upstash) convert spikes into outage or bill. (B8, E)

## SECTION 6 - HOW LINE 1 USES THIS MAP

1. **This doc is the map** (done in draft; Bryan rules on it).
2. **Architecture spec** - draw the boundaries the map implies: the two roles + typed transport,
   the one HTTP gate, the state model, the intent-model + gate split, the test/fixture +
   observability strategy.
3. **Scaffold the clean core** so line 1 is purposeful, then **port the earned knowledge**
   (classification rulings, seed data, the bridges) behind tests.
4. **Strangle the old prod** capability-by-capability: stand the new road beside the old trail,
   move travelers across as each segment reaches parity, retire the trail. Old prod stays the
   safety net until then.

The map is drawn. The next decision is Bryan's: confirm the labels, then move to the architecture
spec (Section 6 step 2).
