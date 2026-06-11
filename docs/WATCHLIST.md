# THE VOID — Standing Watchlist

Things B is counting on Opus to track that sit outside the day-to-day build. Reviewed every
session. Items move to a JOB or to a professional (counsel, accountant) when they ripen. Flat
register. Dated entries. Nothing here is panic; everything here is named so it stays cheap.

B's priority ruling (2026-06-11): technical make-or-break items lead this file. Legal, cost,
and relationship items stay tracked at lower volume.

## Technical make-or-break (the lead section)
- **JOB_1 parity is verified by payload diffs, not eyeballs.** The migration's real risk is the
  quiet one: the wall still renders but loses the living texture (era lean, variety rotation,
  snacks heuristics) and goes stale within a week. Acceptance diffs actual before/after payloads
  per generation. (2026-06-11)
- **Spine fallback is designed in, not bolted on.** Backend treats Spine with last-known-good +
  stale-while-revalidate, never blank. Paired win if persistence lands: backend cold starts stop
  mattering at all. Paired loss if it does not: failure surface doubles. (2026-06-11)
- **Playability rate per crate** is the invisible number that decides shipped vs cut. Spine
  health samples N items per crate and reports % with working derivatives. Triple weight for
  audio and games. (2026-06-11)
- **The dev loop is the velocity engine.** Web Metro stays the daily driver after the dev-client
  door opens; native builds (10 to 20 min each, no local iOS on Windows) run as a batched side
  lane. If native ever becomes the primary loop, project speed dies by 10x. (2026-06-11)
- **CI does not exist yet.** One GitHub Action: web bundle compile + fixture tests on every push,
  before auto-deploy. Lands with JOB_0 (fixtures are born there). The stale-bundle phantom bugs
  this session were all catchable by it. (2026-06-11)
- **Local FTS5 search at JOB_0 time** is nearly free; retrofitted later it is a migration. Instant
  search over curated pools, live passthrough kept for raw depth. (2026-06-11)
- **Service-worker version handshake.** Old bundles hitting new APIs will generate phantom bug
  reports from users exactly like the ones that burned this session. API version header + "new
  version, tap to refresh" toast kills the class. Small job, schedule it near JOB_1. (2026-06-11)
- **Thumbnail proxy bandwidth rides Render.** A Cloudflare edge-cache rule in front of
  /api/thumb/* is ten minutes of config and removes a cost cliff + a latency tax. Already noted
  as optional in the ops log; upgrade to do-soon. (2026-06-11)

## Legal and rights (the ones that can hurt a 501c3)
- **"Before They Vanish" (§14 of the ops log) is the riskiest standing spec.** It deliberately
  surfaces branded and recent material BECAUSE it is the most likely to be infringing. Archive.org
  carries host liability; a curator that promotes known-likely-infringing items invites a
  contributory argument. Needs counsel framing BEFORE it ships, same as stem tier two. The
  PD-spine browse experience carries no such weight. (2026-06-11)
- **Stem rights resolver: encode both layers.** The MMA wall clears the RECORDING. The underlying
  COMPOSITION is a separate copyright. For pre-1926 material both layers are clear today, and the
  rolling wall keeps them roughly in step, but the resolver should check both so a CC recording of
  an in-copyright song never slips through. (2026-06-11)
- **Charitable solicitation registration.** Online donation buttons reach donors in states that
  require nonprofit solicitation registration. Accountant/counsel item before any growth push,
  not a code item. (2026-06-11)
- **Terms of service and privacy policy do not exist.** The app has accounts, comments, watch
  history, and minors can reach it. Both documents are cheap to stand up and load-bearing the
  first time anything goes wrong. The 18+ mature gate (members-only) is a good posture; write it
  down in the terms. (2026-06-11)
- **UGC moderation path.** Comments and usernames exist; a report/remove affordance and a written
  moderation practice barely do. CDA 230 favors us; hygiene keeps it that way. (2026-06-11)

## Security and data
- **Supabase RLS audit is unperformed.** If row-level security is not enabled on hearts, views,
  playlists, comments, profiles, then anyone holding the public anon key can write anything to
  anyone's rows. Highest-priority unverified assumption in the stack. Audit before the social
  layer grows. (2026-06-11)
- **Our own API has no rate limiting.** Archive's limits are circuit-breakered, but api.voidtv.net
  itself can be hammered: scraped, or used to relay-hammer Archive through us. A modest
  per-IP limiter on Render protects both the bill and the Archive relationship. (2026-06-11)
- **Admin surface.** ADMIN_EMAILS gating exists; the Spine adds /sync endpoints with a shared
  secret. Fine for v1, named so it does not silently become v3's hole. (2026-06-11)
- **Anonymous sign-ins create a row per visitor.** Growth means table bloat and a cleanup policy
  question (retention window for anon accounts with no activity). (2026-06-11)
- **Backups.** Supabase free-tier backup retention is short. Hearts, contributions, comments are
  the community's labor; losing them breaks faith. Verify retention, schedule an export. The
  Spine db snapshot (JOB_0 determination) is part of the same answer. (2026-06-11)

## Money and operational cliffs
- **Free-tier cliffs are real liabilities:** Render (sleep + bandwidth), Vercel (bandwidth),
  Supabase (rows + storage), Upstash (commands). A traffic spike converts directly into outage or
  surprise bill. The funding circuit (JOB_9 mechanics) should be live BEFORE any deliberate
  growth push, not after. (2026-06-11)
- **Donation attribution is still the unsolved hard part** (§4.3 of the ops log): Square webhook
  → supporter_until. Everything in the FUEL design depends on it. (2026-06-11)
- **No analytics.** Only raw view counts exist. We cannot see what is working. A privacy-
  respecting counter (self-hosted Plausible or equivalent) fits the ethos and answers real
  questions. (2026-06-11)

## Useful to ALL (B's stated goal, taken literally)
- **Accessibility is currently decorative.** The custom player has no screen-reader semantics,
  focus order is untested, contrast unaudited. Keyboard nav is partial (player yes, wall mostly
  no). If the goal is everyone, this is a JOB, not a polish item. (2026-06-11)
- **Captions.** JOB_2 lists subtitle support; Archive items rarely carry caption files. A
  transcription pass (Whisper on the stemworks hardware) would caption the void AND feed search
  and the Archivist. Big lever, fits existing hardware plans. (2026-06-11)
- **Cheap devices.** The wall is heavy. "All" mostly holds a low-end Android phone. Performance
  budget on real low-end hardware once per milestone. (2026-06-11)

## Relationships
- **The 1/3-to-IA pledge needs two signatures before it is public copy:** a CASH board
  resolution authorizing the recurring grant, and the accountant's pass on the disclosure
  wording. The direct archive.org/donate link is already live in the drawer and needs neither.
  (2026-06-11)
- **Talk to the Internet Archive.** A 501(c)(3) church making the Archive usable for humans is
  exactly the story IA likes. A partner contact can mean rate-limit relief, blessed status, and
  resilience the circuit breaker cannot buy. This is a letter B can send; Opus can draft it.
  The Spine (JOB_0) makes us a polite consumer first, which is the right order. (2026-06-11)

## Practice
- Opus reviews this file at session start alongside the two plans and raises anything that has
  ripened. New risks get dated entries the moment they are noticed, mid-session, without being
  asked. B prunes what he has decided to accept.
