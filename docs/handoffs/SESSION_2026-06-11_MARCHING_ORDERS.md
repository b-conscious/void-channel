# Marching orders for the next session (prepared for a fresh Fable 5, 1M context)

Read order, no exceptions: THE_VOID_BUILD_PLAN.md (v1.3, the strategy and the rulings),
BUILD_PLAN.md (Void Channel ops log and gotchas), docs/handoffs/JOB_0 and JOB_1 (what the
Spine is and how the migration works), docs/WATCHLIST.md (risk ledger), then this file last.
This file sequences; the plan specifies.

## How to work with B (hard rules, learned this week)
1. TALK BEFORE DECIDING. When B brings material or an idea: assess honestly, STOP, discuss.
   Encode and commit only on his explicit go. Premature deciding drives him nuts.
2. NO SUNK-COST DEFENSE. Shipped work is not an argument. Forward merits only. He notices
   defensiveness.
3. VOICE PRIMACY. B's voice leads everything editorial. Imports supply mechanics, never the
   author. When B picks an imported aesthetic, that IS his voice.
4. Failures are expected output. Report what broke and how it resolved.
5. Repo register: no em dashes anywhere, flat declarative, sentence case.
6. Token aware: batch calls, read selectively, reuse the Spine instead of refetching, terse
   replies while building.
7. Parallel agent lanes are APPROVED (worktree isolation, background). Integration stays
   serial through one session. One JOB per lane, handoff file per JOB.
8. Push only on B's word. Verify before reporting: web = bundle curl
   (http://localhost:8081/index.bundle?platform=web&dev=true starts with var
   __BUNDLE_START_TIME__), backend = API probes, never claim untested things work.

## Local dev reality
- Spine :3002 (`cd spine && SPINE_ADMIN_KEY=void-spine-dev node spine.js`), pool survives
  restarts, 109 crates total (92 seeded + 17 IA-collection additions), db file gitignored.
- Backend :3001 (`cd backend && node server.js`), SPINE_URL in backend/.env routes ALL
  Archive traffic through the Spine (unset = direct, which is how the Spine itself uses
  archive.js without recursion).
- Web :8081 (Metro). Preview tool: desktop layout NEEDS explicit resize 2200x1100; fullscreen
  and audible autoplay are DENIED in the preview context; clicks on small targets are flaky,
  prefer dispatched events or API probes.
- Kill-restart of servers shows as red "failed exit 127" task chips. Intentional, not errors.

## The sequence (B's ruling: web is the product; build with intention)
**MOVE 1, MAKE IT REAL (do first, it unblocks belief):**
- Spine production home (the JOB_0 determination): pick with B (Render persistent disk, a
  real box, or Supabase Storage snapshot restore). Ephemeral disk = full resync per deploy =
  defeat.
- Render: set SPINE_URL, manual deploy (auto-deploy often does not cut over; verify /health
  uptime RESETS, else Suspend/Resume). This finally ships era-lean v2, snacks, the player
  fixes, and the Spine transport to prod.
- B runs backend/schema-item-type.sql in Supabase (additive, zero downtime).
- Verify live: wall speed, gen lean distinct, snacks texture, search, a played video.
- Vercel auto-deploys the frontend on push; hard refresh or incognito when checking (service
  worker clings until JOB_19 ships the handshake).
**MOVE 2, THE VOICE LOOP (identity + retention as one story):**
- JOB_14 cheap v1: one pinned theme crate at wall top with B's copy. Then the Dial
  (clock-derived synchronized channels, zero server state). Then JOB_19 (PWA install, web
  push, version handshake, installed-users-open-with-sound).
**MOVE 3, THE COMMONS MVP:**
- Prerequisites FIRST: Supabase RLS audit, per-IP API rate limiting (now blockers, not
  chores). Then JOB_18 Edit Layer, fields description+tags, trust tiers, materialize served
  values on write.
**STANDING PARALLEL LANE (runs alongside the moves, worktree agent shape, B approved
parallel):** JOB_13 source adapters. Pure Spine-side, zero file collision with the Voice
Loop. First slice: Wikidata enrichment (wikibase-sdk, gems list, cross-source map) + the
NASA template adapter (namespaced ids). Multi-source is the existential hedge against IA
concentration, not just content breadth. Needs from B at lane start: NASA key (instant,
free at api.nasa.gov) and the AAPB key application (submit early, approval is slow).
**SECOND PARALLEL OPTION when B wants another thread:** JOB_3 audio mapper (Listen mode
begins; georgeblood variants, etree sets, the hard one by design).

## Standing rulings ledger (2026-06-11, all B's)
- Web is the product (PWA). Native lane parked, media-console parked with it. Section 0-C.
- Recency-first content everywhere; pre-1975 only as curated gems/cult lists (Wikidata pass
  is the gems engine). Hentai and nearly all NSFW admitted UNDER the mature corral
  (members-only 18+); hard excludes everywhere: hate/extremist, politics/government/news.
- Rights posture: discovery UI over IA-hosted media, church-funded curation mission; rights
  metadata informs, never gates; counsel advisory on JOB_17 only. Square: ruled non-issue.
- Curation commons is a THROUGHLINE (section 0): every JOB feeds signed, XP-earning,
  upstream-exportable human curation. B's voice is the record (`voice:b`).
- One third of donations granted to IA (board resolution + accountant sign-off before the
  pledge is public); direct archive.org/donate link already live in the drawer.
- Toolkit verdicts in JOB_13; Fallout CRT aesthetic ruled IN for UI chrome only (never over
  video, never blend modes, static scanlines default, flicker only transient, measured by
  frame-gap gate on throttled CPU before/after).
- Audio on arrival: impossible first-visit by browser law; the TAP TO ENTER gate is the
  unlock; installed PWA opens with sound on Chrome; iOS taps forever.

## Open determinations for B (carry, do not decide for him)
- Spine production home (Move 1 forces it).
- Founding member: ops log says $5/YEAR, JOB_9 says $5-8/MONTHLY. One wins before tier copy.
- Fixture picks (10 PENDING_B slots in fixtures/fixtures.json).
- Theme cadence and first theme week copy (JOB_14). Install prompt copy (JOB_19).
- Throughput floor values (JOB_13 gate).

## Known broken / dirty
- blaxploitation crate query is malformed Lucene, returns zero everywhere. Fix or rewrite.
- tapers/dead use mediatype:(etree), the audio clause bug is FIXED but other etree-family
  crates added later must remember it.
- Backend warm log line still says "fetching from Archive.org" (cosmetic, it is Spine-fed).
- CI fixture job is continue-on-error (Archive flakiness); the web-bundle job is the hard gate.
- JOB_2 web remainders (next-up overlay, metadata-only preload) folded into Moves 2/3 lanes.
