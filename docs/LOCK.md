# VOID LOCK — MD5 drift protection

Purpose: as we plug holes and fix plugs, nothing gets silently changed or lost. Every source
file has a recorded MD5. Before and after a work session we compare disk against the record, so
any unexpected edit, deletion, or stray file shows up immediately instead of weeks later.

Tool: `scripts/lock.js` (pure Node, no external deps — works in PowerShell and bash on Windows).
Record: `docs/BASELINE.md5` (one `<md5> *./<path>` line per file, sorted, diff-friendly).

## Commands

```
node scripts/lock.js verify    # compare disk to the lock; exits 1 if ANYTHING differs
node scripts/lock.js status     # same report, never fails (just informs; exit 0)
node scripts/lock.js relock     # rewrite the lock from disk; prints exactly what changed vs prev
node scripts/lock.js list       # print the file set the lock covers + count
```

`verify` exit code is 1 on drift, 0 when clean — so it doubles as a CI / pre-commit gate.

## The loop (run every session)

1. `verify` at the START. Should print `CLEAN`. If it shows drift you did not expect, investigate
   BEFORE touching anything — something changed out from under you.
2. Do the work (fix a plug, plug a hole).
3. `verify` again. The `~ CHANGED / + ADDED / - REMOVED` lists are your honest changelog. Read
   them. Every entry should be a change you meant to make.
4. When the diff matches your intent, `relock` to bless it. The new baseline is the new truth.
5. Commit `docs/BASELINE.md5` alongside the code in the same commit, so the lock and the tree
   always travel together.

Rule of thumb: **relock is a deliberate act, not a reflex.** If `verify` shows something you did
not do, that is the system working — stop and look.

## What is locked vs ignored

LOCKED: all source + committed assets — `.js`, `.json`, `.md`, `.sql`, `.py`, `.png`, `.mp4`,
config, AND `spine/seed-spine.db` (the 39 MB offline seed — our most loss-sensitive artifact;
it is the reason the wall works without IA, so we want drift on it caught loudly).

IGNORED (mutates every request or is rebuildable — never source):
- Dirs at any depth: `.git`, `node_modules`, `.expo`, `dist`, `web-build`, `_raw`, `_disabled`, `.claude`
- Dir by exact path: `backend/data` (runtime state; note `mobile/src/data` IS source and stays locked)
- Files: `*.log`, `*.env` / `.env`, `.DS_Store`, `hearts.json`, `codec-cache.json`,
  `wiki-cache.json`, the live `spine.db` / `spine.db-shm` / `spine.db-wal`, and `BASELINE.md5` itself.

These mirror `.gitignore`'s runtime section. If you add a new runtime cache, add it to BOTH
`.gitignore` and the exclude lists in `scripts/lock.js`.

## History

- 2026-06-17: Tooling built. Old hand-maintained `BASELINE.md5` (222 entries) was stale and
  polluted — it had captured 49 `mobile/.expo/` build-cache files that are gitignored junk.
  Rebuilt as a clean 176-file canonical baseline. Real source drift since 06-12 at that point:
  7 changed (archive.js, server.js, sw.js, client.js, TheArchivist.js, VideoPlayer.js,
  PlayerScreen.js), seed-spine.db newly locked.
