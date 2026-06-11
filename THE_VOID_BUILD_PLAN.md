# THE VOID — Build Plan v1.1
**The Internet Archive, made usable and curated by a church.**
Four modes of one app over one backend on one cultural commons:
- **WATCH** (Void Channel, built)
- **LISTEN** (Void Radio)
- **PLAY** (Void Arcade)
- **READ** (Void Press)
One account, one crate voice, one funding circuit, one Archivist. Built and operated by C.A.S.H. (Church of American Strength & Hope), 501(c)(3), Ladson, SC.
---
## HOW TO USE THIS DOCUMENT
This is the single source of truth for strategy and build order. It supersedes all prior plans (VOID_RADIO_BUILD_PLAN, THE_VOID_UNIFIED_BUILD_PLAN, deckvisuals). BUILD_PLAN.md in this repo remains the Void Channel operational log (deploy gotchas, content treatment rules, session history) and stays authoritative for shipped behavior. Hand this plan to Opus 4.8 in Claude Code. Build one JOB per session. Each JOB ends with `JOB_N_HANDOFF.md` in `/docs/handoffs/`. When starting a new session, Opus reads this plan, BUILD_PLAN.md, plus all existing handoffs before writing code.

**AUTHORITY NOTE (v1.1):** Work already shipped in this codebase is not secondary to this plan. The plan author did not have full visibility into shipped details. Where this plan conflicts with shipped behavior or with lessons recorded in BUILD_PLAN.md, the shipped work and the recorded lessons win, and this plan is amended. Section 10 carries the binding reconciliations.

**LOCKFILE PROTOCOL applies.** "Lock this down" generates MD5 checksums. Everything starts LOCKED. Only UNLOCKED files get modified. New files marked NEW. Verify after work.
**Rules for Opus:**
- No em dashes anywhere. Flat declarative register.
- Failures are expected output. A handoff reporting three failures and how they were resolved is better than one reporting clean.
- Uncovered decisions: pick the simpler option, mark DETERMINATION PENDING in the handoff, keep moving.
- The crate voice is B's. Opus drafts, B rewrites.
- Schemas are contracts. Extend additively only. Validate at every boundary.
- All LLM prompts live as versioned files, never inline strings.
- Void Channel must keep working at every commit. This includes the WEB deployment (voidtv.net), which is the live product.
**Every JOB carries three sections:**
- **Build:** what gets made.
- **Determinations:** choices reserved for B, made during the sprint by ear or judgment.
- **Failure surfaces:** where this job will break first, named so the break is expected and cheap.
---
## 1. ARCHITECTURE
```
                    THE ARCHIVE SPINE
                  (standalone service)
                  Normalizes the Archive
                  once, for everything
                         |
          +--------------+--------------+
          |              |              |
      /video         /audio        /games      /texts
          |              |              |          |
          +--------------+--------------+----------+
                         |
                   VOID BACKEND
                (Express + Supabase)
              Social, auth, donations,
              Archivist, stems, playlists
                         |
                      THE VOID
                   (unified app)
              Watch | Listen | Play | Read
```
**The Archive Spine** is a standalone Express service that owns all communication with archive.org. It pre-populates every category across all media types on a schedule, normalizes the metadata mess into clean contracts, caches locally, and serves through a simple REST API. Nothing downstream ever thinks about archive.org again.
**The Void Backend** is the existing Void Channel backend, extended. It consumes the Spine instead of calling the Archive directly. It owns everything social: auth, hearts, views, playlists, comments, trending, contributions, subscriptions, the Archivist, the stem engine, and the donation circuit. It also owns all request-time content shaping (see 10.7). One Supabase project, one set of tables with `item_type` columns (video, audio, game, text).
**The Void App** is one React Native app with four modes. Shared: account, library, settings, the Archivist, donation checkout. Each mode has its own home screen, crates, search scope, and appropriate renderer (video player, audio player, emulator WebView, book reader). The app ships to web (first class, the live product) and to native (dev client door, opened in JOB_2).
---
## 2. THE ARCHIVE SPINE
### 2.1 What it does
- Runs as its own Express process (`pm2 start spine.js`)
- Holds a config array of category definitions across all media types
- On a cron schedule (configurable, default every 8 hours), walks every category, queries archive.org's Advanced Search API, normalizes each result through a per-type mapper, and writes the results to a local SQLite database
- ACCUMULATES a deep pool per category (target 150 to 300 items, union across syncs, deduped by id) rather than holding a static 50. Each sync rotates sort and page so the pool deepens with genuinely new items. The pool is what preserves per-visit variety, the era lean material, and the standing "never throw away, only add" rule (see 10.3)
- Serves normalized, pre-populated data through a REST API with pagination over the stored pool
- Individual item detail (`/item/:identifier`) hits the Archive live (through a local cache with TTL) for derivative resolution, since file URLs can change
- Handles all Archive pain internally: rate limiting, retries on 5xx, metadata inconsistency, derivative format detection, NSFW/news exclusion filters (carried from existing `archive.js`)
### 2.2 Stack
- Node.js, Express, better-sqlite3 (single file, no external DB dependency)
- node-cron for scheduling
- node-fetch for Archive API calls
- Deployed alongside the main backend or on any box; only needs outbound HTTPS to archive.org
- PERSISTENCE WARNING: Render instance disks are ephemeral. `spine.db` on a plain Render service is wiped on every deploy and restart, forcing a full re-sync, which is the exact behavior the Spine exists to prevent. Deployment determination must pick one: Render persistent disk (paid), a real box (the stemworks hardware candidate can host both), or db snapshot to Supabase Storage restored on boot (see 10.4)
### 2.3 API
```
GET  /categories                        all categories, all types
GET  /categories?type=video             filtered by media type
GET  /category/:id                      pre-populated items for a category (paginated)
GET  /category/:id?page=2               deeper pages over the stored pool
GET  /category/:id?refresh=true         force re-fetch from Archive (admin)
GET  /item/:identifier                  full item detail with resolved URLs
GET  /item/:identifier?type=audio       audio-specific item mapping (tracklist)
GET  /search?q=...&type=video           live search pass-through (cached short TTL, NO curation filters, search stays raw)
GET  /random?type=audio                 random item from any category of that type
GET  /health                            last sync time, category count, pool depths, error count
POST /sync                              trigger full sync (admin, auth-gated)
POST /sync/:id                          trigger single category sync (admin)
```
### 2.4 Category definition shape
```json
{
  "id": "shellac",
  "type": "audio",
  "name": "The Shellac Stack",
  "subtitle": "Crackle, hiss, and songs that outlived the people who sang them",
  "group": "era",
  "query": "collection:(georgeblood) AND mediatype:(audio)",
  "exclude_nsfw": true,
  "exclude_news": false,
  "sort": "downloads desc",
  "active": true
}
```
Categories may also carry the flags the existing backend already uses for shaping and policy (`recognizable`, `diversify`, `mature`, plus optional title-filter hooks like the Void Snacks heuristics). The Spine stores and serves these flags; the Void Backend acts on them (see 10.7).
### 2.5 Normalized item shape (universal across types)
```json
{
  "id": "",
  "type": "video | audio | game | text",
  "title": "",
  "creator": "",
  "year": null,
  "description": "",
  "thumbnail": "",
  "duration_s": null,
  "categories": ["shellac"],
  "collections": [],
  "subjects": [],
  "archiveUrl": "",
  "last_synced": ""
}
```
Field name is `id`, not `identifier`. The entire existing frontend keys on `item.id` (MediaCard, player, hearts, history) and schemas extend additively from the consumer base that already exists (see 10.6).
Full item detail adds type-specific fields:
- **video:** `videoUrl`, `videoUrlHQ`, codec, resolution
- **audio:** `tracks[]` (ordered playable files with streamUrl/hqUrl/duration), `artwork`, `downloadable`, `variant_note` for georgeblood
- **game:** `emulator`, `emulator_start`, `playUrl` (embed or self-hosted), `platform`, `screenshot`
- **text:** `pageCount`, `formats[]` (PDF/EPUB/plaintext URLs), `readerUrl` (BookReader embed), `hasOcr`, `coverImage`
### 2.6 Mappers
Four mapper modules inside the Spine, one per type. Each implements `normalize(archiveDoc) -> item` and `getFullItem(identifier) -> detailedItem`.
**Video mapper:** carries over the logic from the existing `archive.js` (normalizeItem, video URL resolution with HQ preference, codec detection, `parseRuntimeSeconds` for display-string runtimes). The existing file's query/filter/normalize logic migrates here; the existing backend stops doing this work. Request-time shaping does NOT migrate (see 10.7).
**Audio mapper:** item-to-tracklist normalization. Filters files to playable audio (MP3/OGG derivatives, FLAC as hqUrl only). Orders tracks (track metadata field, else filename sort). Parses durations (Archive gives `length` as seconds or mm:ss). Resolves artwork (embedded JPG, else `__ia_thumb`). Reads download/stream restriction flags. The georgeblood variant resolver: collapses stylus-width takes to one track per song, records the pick in `variant_note`.
**Game mapper:** resolves emulator type from item metadata (`emulator`, `emulator_ext`), `emulator_start` file, screenshot URL, platform tag. `playUrl` as Archive embed: `https://archive.org/embed/:identifier`.
**Text mapper:** page count, format list from files (PDF, EPUB, plain text, DjVu), `readerUrl` as BookReader embed: `https://archive.org/details/:identifier?ui=embed`, OCR availability flag, cover image (first page or `__ia_thumb`).
---
## 3. DATA CONTRACTS (shared across all modes)
JSON Schemas live in a shared `schemas/` directory at the repo root. Every module boundary validates against them. Additive changes only.
### 3.1 Category (Spine output)
As defined in 2.4.
### 3.2 Item (Spine output, list level)
As defined in 2.5.
### 3.3 DetailedItem (Spine output, per-item level)
As defined in 2.5 plus type-specific extensions.
### 3.4 AudioTrack (within detailed audio item)
```json
{
  "n": 1,
  "title": "",
  "duration_s": 0.0,
  "streamUrl": "VBR MP3 or OGG url",
  "hqUrl": "FLAC url or null",
  "source_file": "original filename"
}
```
### 3.5 StemSet (stem engine output)
```json
{
  "track_ref": {"item": "", "n": 1},
  "status": "queued | processing | ready | refused | failed",
  "rights_basis": "PD pre-1926 | CC-BY 4.0 | artist opt-in",
  "tier": "platform | personal",
  "model": "htdemucs",
  "model_version": "",
  "denoise_pre": false,
  "stems": {"vocals": "url", "drums": "url", "bass": "url", "other": "url"},
  "variants": {"instrumental": "url", "acapella": "url", "drumless": "url", "rhythm_bed": "url"},
  "requested_by": "",
  "processed_at": ""
}
```
### 3.6 Profile (learning loop, MIXWEAVE only)
Plain markdown. Sections: `## Gesture rules`, `## Selection rules`, `## Wave rules`, `## Never`. Each rule is one sentence with date and source session id.
---
## 4. CRATE REGISTRY
All crate definitions live in the Spine's config. B rewrites names and subtitles. Queries are starting points tuned by results. Every new crate query gets its collection names validated against live Archive counts BEFORE wiring (the Void Snacks rebuild found three of four suggested collection ids did not exist).
### Video (migrated from existing archive.js, 80+ categories)
Existing CATEGORIES array transfers verbatim. The voice is already B's. The Void Snacks pool definitions and title heuristics (singular Commercial rule, compilation and W/O/C excludes, post-1975 lean with capped vintage garnish) transfer with it.
### Audio
| id | name | subtitle | query sketch |
|---|---|---|---|
| shellac | The Shellac Stack | Crackle, hiss, and songs that outlived the singers | `collection:(georgeblood) AND mediatype:(audio)` |
| tapers | The Taper's Section | Every show someone loved enough to record | `collection:(etree) AND mediatype:(audio)` |
| dead | 2,000 Nights of the Dead | The longest setlist in history | `collection:(GratefulDead)` |
| theater_of_mind | Theater of the Mind | Stories told to a room full of ears | `collection:(oldtimeradio)` |
| netlabel | Net Label Underground | Music released free on purpose | `collection:(netlabels)` |
| unlocked | The Unlocked Vault | Songs freed from their masters | `collection:(unlockedrecordings)` |
| gospel | The Amen Corner | Sacred music, public domain, yours to sing | `subject:(gospel OR spiritual) AND mediatype:(audio)` |
| field | Wire Recorder Diaries | Someone pressed record and the world leaked in | `subject:("field recording" OR ethnographic) AND mediatype:(audio)` |
| radio_air | Dead Air Resurrected | Broadcasts nobody saved except someone did | `collection:(radioprograms)` |
### Games
| id | name | subtitle | query sketch |
|---|---|---|---|
| quarter_eaters | Quarter Eaters | The machines that ate your allowance | `collection:(internetarcade)` |
| dos_box | Before Windows | When you typed to start a game | `collection:(softwarelibrary_msdos_games)` |
| console_atari | The 2600 Vault | 128 bytes of RAM and infinite imagination | `collection:(atari_2600_library)` |
| console_genesis | Genesis Block | Blast processing was a lie but the games were real | `collection:(sega_genesis_library)` |
| console_snes | The Mode 7 Room | Every pixel placed by hand | `collection:(nintendo_snes_library)` |
| point_and_click | The Pointing Finger | Click everything, trust nothing | adventure games, Sierra/LucasArts era |
| weird_shelf | The Weird Shelf | Software nobody asked for that someone preserved anyway | obscure, broken, fascinating |
| edu_games | Your Tax Dollars At Play | You have died of dysentery | educational games |
### Text
| id | name | subtitle | query sketch |
|---|---|---|---|
| pulp | The Pulp Rack | Lurid covers, disposable stories, somehow immortal | `collection:(pulpmagazinearchive)` |
| golden_age | Capes Before Lawyers | Superheroes before trademarks found them | pre-1928 public domain comics |
| how_to | How They Built It | Repair manuals for things that lasted | technical manuals, ham radio, woodworking |
| sheet_music | The Music Stand | Notes on paper before streaming | `collection:(sheetmusic)` |
| hymnal | The Hymnal Shelf | Public domain hymnals, free to sing | gospel songbooks, devotionals |
| space | Mission Briefing | NASA wrote it down, all of it | NASA technical reports |
| patents | The Patent Wall | Inventions that never happened, drawn beautifully | patent illustrations |
| pamphlets | The Pamphlet Drawer | Paper ephemera from a world that printed everything | Prelinger, WPA guides |
| maps | The Map Table | Before GPS, someone drew it | historical maps, atlases |
| weird_text | The Mimeograph | Self-published, hand-stapled, probably important | zines, outsider lit, religious tracts |
| cookbooks | The Recipe Box | What people ate when they had to cook | historical cookbooks |
---
## 5. SEED FIXTURES
A permanent test set of 20 hand-picked Archive identifiers spanning all four types. B picks half, Opus picks half. Committed to the repo at `/fixtures/`. Every mapper change reruns the fixture test. Every new crate contributes at least one fixture.
Requirements: at least one item per type, at least one georgeblood 78 with multiple stylus variants, one etree show with multiple sets, one item with no derivatives, one game per emulator type (MAME, em-dosbox, JSMESS), one book with EPUB, one without, one comic, one sheet music item. These are the regression surface.
---
## 6. JOBS
### JOB_0: The Archive Spine
**Build:** Standalone Express service in `/spine/`. SQLite database (`spine.db`), category config (seed with all video categories from existing `archive.js`, plus 5 audio, 3 game, 3 text categories for testing). Video mapper ported from existing `normalizeItem` and video URL resolution logic. Audio, game, and text mappers as stubs returning the universal item shape with type-specific fields populated where metadata exists, errors logged and skipped where not. Pool accumulation per category (union across syncs, dedupe, target depth 150 to 300). Cron sync on startup and every 8 hours with per-sync sort/page rotation. Health endpoint reporting pool depths. Manual sync endpoint. README with setup and pm2 instructions.
**Determinations:** Where to deploy, WITH the ephemeral-disk trap priced in (Render persistent disk, real box, or Supabase Storage snapshot restore). Auth scheme for admin endpoints (shared secret in env var is fine for v1).
**Failure surfaces:** Archive API rate limiting during full sync of 100+ categories. Mitigation: stagger requests with a delay between categories (default 2 seconds), retry with backoff on 429/5xx, partial sync success is acceptable (categories that failed stay at their last good state, health endpoint reports which ones). Archive throttles by IP and has taken the prod backend down before; the circuit breaker pattern from the existing backend carries over.
**Acceptance:** Spine starts, syncs all seeded categories, `/categories` returns the full list, `/category/ephemeral` returns normalized video items with `?page=2` working, `/category/shellac` returns audio items with tracklists, `/item/:id` resolves video URLs for a known item. Health endpoint reports last sync time, pool depths, and zero errors on a clean run. Spine restart does not require a full re-sync.
---
### JOB_1: Void Channel Migration
**Build:** Point the existing Void Channel backend at the Spine instead of calling archive.org directly. Replace the live-proxy paths in `server.js` (`/api/categories`, `/api/category/:id`, `/api/search`, `/api/item/:identifier`, `/api/random`, `/api/channel/queue`, `/api/shorts`) with fetch calls to the Spine. The Spine's base URL comes from env var `SPINE_URL`. `archive.js` shrinks to a thin adapter PLUS the request-time shaping that stays (see 10.7): `applyEraLean`, `eraFor`, GENERATION_ERAS, `diversify` at serve time, the banded reorder, mature/graphic gating. All existing social features (hearts, views, playlists, comments, trending, contributions, subscriptions, Archivist, DailyBounty) are untouched. Cache layer (`cache.js`) stays for Spine responses with shorter TTL.
Simultaneously: add `item_type` column to hearts, views, playlists tables (default `video`, backfilled) via additive Supabase migration (additive with default is zero-downtime and safe to run live; Supabase branching is a paid feature and is not assumed).
**Determinations:** Whether to keep the existing NSFW/news exclusion filters in the main backend as a second pass or trust the Spine's filtering entirely. RULED in 10.7: Spine owns query-time excludes (NSFW, news, restricted); the Void Backend owns request-time POLICY (era lean, mature members-only gate, recognizable bias, diversify, snacks heuristics).
**Failure surfaces:** The migration itself. Acceptance includes every existing Void Channel feature working identically: browse categories WITH per-generation era lean intact, play a video, heart it, see it in trending, search (raw, unfiltered), channel queue with deep pagination, shorts with the post-1975 snack texture intact, Archivist picks.
**Acceptance:** Void Channel works exactly as before on the WEB deployment. The era lean, the variety reshuffle, and the snacks texture survive the migration byte-for-byte in spirit. The Spine is the only process talking to archive.org.
---
### JOB_2: Player Upgrade (NATIVE TARGET)
**Build:** Open the dev client door (EAS build profile, exit from Expo Go) and integrate react-native-video (v6 stable or v7 beta, Opus evaluates at sprint start) for the NATIVE app only. The player module platform-splits: `VideoPlayer.native.js` gets react-native-video; `VideoPlayer.web.js` KEEPS the existing expo-video implementation, which already shipped the v2 gesture layer. The web bundle must never import react-native-video.
ALREADY SHIPPED on web (2026-06-11, do not rebuild): double-tap zones (touch: left -10s / right +30s; fine pointer: double-click fullscreen), hold-for-2x with user-rate restore, playback-rate cycle button, PiP button where the browser supports it, chrome reduction (center skip buttons removed), lean-back keyboard set (space, arrows, f, m, volume).
REMAINING in this job: the native engine swap itself, native PiP, preloading, subtitle support, and queue awareness ("next up" overlay in the last 15 seconds with preload start). Queue awareness ships to BOTH platforms; on web the preload is metadata and thumbnail only, never media bytes (Archive bandwidth doubles per view otherwise and Archive rate-limits by IP).
**Determinations:** react-native-video v6 (stable) vs v7 (beta, better architecture, preloading). Gesture sensitivity tuning (by hand on the Tab S8 Ultra).
**Failure surfaces:** The dev client build itself, first time. Budget half the sprint for the build pipeline. Audio in PiP mode. Fullscreen behavior differences between tablet mode and DeX. The platform split leaking native imports into the web bundle (bundle-check the web build at every commit).
**Acceptance:** NATIVE: play a video on the Tab S8 Ultra with screen off (PiP), double-tap to skip, long-press for 2x, keyboard controls work in DeX, "next up" appears and auto-advances in a channel queue. WEB: existing player works unchanged, bundle compiles, "next up" overlay appears with metadata-only preload.
---
### JOB_3: Audio Mapper (the hard one)
**Build:** Complete the audio mapper in the Spine. Full `getAudioItem` implementation: filter files to playable audio (MP3/OGG derivatives; FLAC as hqUrl only), order tracks (track metadata, else filename sort), parse durations (`length` as seconds or mm:ss, both occur), resolve artwork (largest embedded JPG, else `__ia_thumb`), read download/stream restriction flags into `downloadable`. The georgeblood variant resolver: collapse stylus-width takes to one playable track per song, record the pick in `variant_note` (default: prefer restored, else most common width). Multi-set ordering for etree shows (set markers in filenames). Add all audio categories to the Spine config (collection ids validated against live counts first). Fixture test covers all audio edge cases.
**Determinations:** The stylus pick rule. Opus implements a default, surfaces five sample georgeblood items in the handoff with their variants listed, and B listens and rules. Multi-set ordering gets the same treatment.
**Failure surfaces:** This job IS a failure surface. Archive audio metadata is messier than video: items with zero derivatives, lengths as strings, track numbers missing, artwork absent, creator as arrays of junk. The fixture set is the defense. `node spine/test-fixtures.js` runs all fixtures and prints a one-line health report per item.
**Acceptance:** All audio fixtures map to valid detailed items. An etree show has ordered sets. A georgeblood item has one track with a variant note. A restricted item shows `downloadable: false` with working stream URLs. Spine serves all audio categories with full pools.
---
### JOB_4: Audio Playback
**Build:** react-native-track-player integrated for NATIVE (same dev client door as JOB_2). WEB gets an HTML5 audio queue implementation behind the same queue-store interface (Listen mode is not native-only; the web deployment is first class). Background playback, lock screen / notification controls, persistent queue, scrubbing, skip, play-from-position. Queue store (Zustand, match the existing state pattern) holding current track, parent item, upcoming list, history; the store is platform-agnostic, the playback engine binds per platform. Mini-player component persistent above the tab bar. Full player screen with artwork, scrub bar, queue sheet. Audio routes in the main backend: `/api/audio/categories`, `/api/audio/category/:id`, `/api/audio/item/:identifier`, `/api/audio/search`, `/api/audio/queue` (track-level round-robin from the Spine's categories).
**Determinations:** Gapless playback ambition: true gapless is hard in RN; default is tight sequential with preload. B decides after hearing an etree set play through.
**Failure surfaces:** Android audio focus (interruptions), streaming stalls on Archive's slower derivatives (preload + buffer config), the RNTP integration with the existing navigation stack, and web/native behavior drift in the shared queue store.
**Acceptance:** NATIVE: an etree set plays through on the Tab S8 Ultra with screen off, lock screen controls work. WEB: the same set plays through in a browser tab, mini-player survives navigating the app. Browse audio crates, open a show, play it, search a song, both platforms.
---
### JOB_5: Audio Library + Radio
**Build:** Hearts with `item_type=audio` (track-level and item-level), playlists holding audio tracks, listening history, continue-listening with resume position, recently played. Radio: `/api/audio/queue` flattened to track level; "start radio" from any track/item/crate seeds from related items, mixes crates round-robin, dedupes against session history. Crate radio buttons ("tune in" per crate). Offline: track downloads via expo-file-system (carried from existing video download pattern), respect `downloadable: false` absolutely, offline playback through the same queue. Offline is native-first; web offline is out of scope for v1.
**Determinations:** Whether playlists may mix video and audio entries (the migration permits it; the UI question is coherence). Radio blend tuning by ear.
**Failure surfaces:** Resume-position write frequency (debounce, write on pause/skip/30s ticks). Repetition in small crates (dedupe window must persist per session). Partial downloads surviving app kills.
**Acceptance:** Heart a 78, build a playlist, kill the app mid-track, reopen, resume within 5 seconds. Crate radio on The Shellac Stack runs 60 minutes without repeating. Download a show on wifi, airplane mode, play it through (native).
---
### JOB_6: Game Mapper + Play Surface
**Build:** Complete the game mapper in the Spine: emulator type detection, `emulator_start`, screenshot, platform tag. Add all game categories (ids validated first). In the app: game detail screen (screenshot, metadata, play button, heart), play screen as full-screen WebView pointed at `playUrl` (Archive embed); on web this is an iframe, which is the simpler case. Touch overlay controls for simple games (d-pad + buttons, transparent). Bluetooth controller support via Gamepad API in WebView. "Best with keyboard" indicator for DOS text-input games. Back gesture exits cleanly. Game routes in main backend same pattern as audio.
**Determinations:** Archive-hosted embed vs self-hosted emulators (recommend Archive embed for v1). Touch overlay layout. Whether to attempt save states (skip in v1). Portrait vs landscape lock.
**Failure surfaces:** Audio in WebView (Android WebView audio context issues, test on the Tab early). Emulator metadata inconsistency across collections (items without `emulator` field get flagged but still surface with a "may not load" note). Fullscreen in DeX vs tablet mode.
**Acceptance:** Three games play on the Tab S8 Ultra: one arcade (MAME.js, touch), one DOS (em-dosbox, DeX + mouse), one console (JSMESS, Bluetooth controller or touch). Sound works. Found through crates. The same three load in a desktop browser via iframe.
---
### JOB_7: Text Mapper + Reading Surface
**Build:** Complete the text mapper in the Spine: page count, format list, reader URL, OCR flag, cover image. Add all text categories (ids validated first). In the app: item detail screen (cover, metadata, format list, read button, heart). Two reading modes: BookReader (WebView/iframe, Archive embed, handles scanned pages/zoom/search) and EPUB (epub.js in WebView, font control, night mode, position persistence). Comics variant: full-bleed page images, tap to advance. Text routes in main backend. Reading progress stored per item (page or CFI), "continue reading" row.
**Determinations:** Night mode for EPUB (recommend yes for the deck). Whether comics get a dedicated reader or reuse BookReader. EPUB reader library choice.
**Failure surfaces:** BookReader embed performance in WebView on large PDFs (test with a 600-page book on the tab). Cover image quality variance.
**Acceptance:** Read a Gutenberg novel (EPUB, position saved, resume), browse a pulp magazine (BookReader, pages turn), read a comic (full-bleed, tap to advance), view a map (zoom). All found through crates. Web and tab both.
---
### JOB_8: The C.A.S.H. Shelf + Cross-Links
**Build:** Curated section for ministry use: public domain hymnals, sheet music, devotional texts, sermon collections. Cross-links between text and audio: a hymn in VOID RADIO links to its sheet music in VOID PRESS and vice versa. Link key: title + fuzzy matching, with a flag system for bad matches (B or community can correct). The gospel audio crate and the hymnal text crate are the anchor pair.
**Determinations:** How deep to curate at launch. Whether cross-links are automatic fuzzy match or manually confirmed per pair (ship automatic with correction affordance).
**Failure surfaces:** Fuzzy title matching false positives. Manual confirmation is safer; automatic is more generative.
**Acceptance:** Open a hymnal, view sheet music, tap through to a gospel recording, play it. Open a gospel track, see the printed hymn link, tap through and read it.
---
### JOB_9: Stem Engine
**Build:** Two tiers, by design. The capability belongs to the person; the gate exists only where the platform becomes a distributor.
**Tier one (platform-hosted, gated):** Rights resolver on every AudioItem. US sound recordings published through 1925 are PD under the Music Modernization Act (rolling wall, encode the rule, not the year). CC-licensed items qualify only where the license permits derivatives (exclude ND). Stream-only etree artists default to excluded, with the exclusion treated as an unsent invitation (see artist opt-in below). Basis string recorded on every StemSet.
**Artist opt-in registry:** table mapping artist/collection to opt-in flag, contact state (uninvited, invited, declined, opted-in), and revenue split. Opted-in artists' material becomes tier-one stemmable with basis "artist opt-in." Stem-related fuel routes their share through contributions.js. Declined is final.
**Worker service** `stemworks/` (Python, separate process): polls `stem_jobs` table in Supabase, fetches best source derivative, optional spectral denoise for shellac, runs demucs htdemucs, per-stem loudness pass, uploads stems to Supabase Storage, writes StemSet record. Idempotent, resumable. Pre-renders variants: instrumental, acapella, drumless, rhythm bed, as ordinary playable tracks. Candidate hardware: Jetson Orin Nano, any GPU desktop, or cloud burst.
**Tier two (on-device, ungated):** local separation path, user picks any playable track, processing runs on their hardware, results land in local storage only. No upload path to shared infrastructure by construction.
**Donation mechanics (the funding circuit):**
- *Small supports:* $1 = 1 unlock credit, $2 = 3 to 5 credits. A credit buys one NEW tier-one separation. Ready stems are free for everyone, permanently.
- *Recurring medium:* $5 to 8 monthly. Monthly credit allowance, priority queue, supporter flair, early Archivist picks.
- *Daily Bounty:* one free credit per day through the existing DailyBountyCard.
- *Routing:* RULED BY B: web checkout on Vercel, not in-app purchase. Two streams on one page: OFFERINGS (pure gifts, deductible, the plate) and FUEL (supports that unlock, honestly labeled, not deductible).
- *Language:* unlock paths say "support" or "fuel," never "donate." Accountant reviews tier copy before launch.
- *Cost transparency:* every job shows its approximate compute cost next to the queue button. People fund what they can see.
**Determinations:** Worker hardware and storage budget. Denoise default for shellac (switchable, B rules by ear on five samples). How visibly the tier-two path is presented (quiet capability vs loud feature; worth real counsel for a public C.A.S.H. app).
**Failure surfaces:** Separation quality on pre-war mono (UI states the source era plainly). Rights edge cases (resolver defaults to no). Worker crash recovery (idempotent, resumable by design).
**Acceptance:** Request stems on a 1924 georgeblood side and a CC-BY netlabel track: both process, variants play in the normal player, basis string displays. Request on a stream-only etree item: refused with reason. Worker survives kill and resumes.
---
### JOB_10: Stem Surfaces
**Build:** Track page stems panel: when a StemSet is ready, show variants as playable rows and per-stem download buttons. When absent and `derivatives_ok`, "separate this" button queues with position shown. Bed mode export: one-tap export of instrumental/rhythm bed for reuse (C.A.S.H. media beds). Quality feedback tap ("good separation / rough") so quality becomes data. Live stem mixer (web-audio surface on the tab in DeX or Expo web, not native RN): four faders, trim, loop, gain, export to local storage for tier-two material.
**Determinations:** Mixer surface (web audio vs native vs skip). Whether stem downloads require an account (recommend yes, feeds demand signal).
**Failure surfaces:** Expectation management on old source material. The era note and feedback tap are the defense.
**Acceptance:** From a 78 on the track page: tap separate, watch queue, play instrumental, download acapella, rights basis visible.
---
### JOB_11: Unification
**Build:** Mode switcher (Watch/Listen/Play/Read) as top-level navigation. The persistent TopBar shipped in the header refactor is the natural mount point. Universal search querying all four Spine types, results grouped, fed from the TopBar input that already exists. Mixed collections: a playlist holding items across types, playback walks the list switching renderers. Cross-links: bidirectional references between items across types (stored as a link table, some auto-discovered, some manual). Unified history ("recently experienced" mixing all types). The Archivist's daily pick can be any type. Profile page: all activity in one view. "Surprise me" button: random item of any type.
**Determinations:** Mode switcher UX (tab bar, drawer, top segmented, or four-door home screen; the DrawerMenu and TopBar shipped this week are candidates). Brand name for the unified app. Bundle ID migration from `org.cash.voidchannel` to `org.cash.thevoid` or staying put (store migration has friction). Web domain story (voidtv.net vs a thevoid domain) is the nearer-term naming question since web is the live product.
**Failure surfaces:** App size (mitigate: lazy-load mode screens, emulator assets served remotely). Universal search latency (parallel calls, partial results UX).
**Acceptance:** From one app: watch a film, listen to a 78, play an arcade game, read a pulp magazine, all in one history feed. Archivist references three modes in one daily pick. A playlist holds video and audio and plays both.
---
### JOB_12: Social Layer (games + text)
**Build:** Game leaderboards: honor-system score claims after play sessions, per-game leaderboard in Supabase. "Who's playing" activity feed. Crate shuffle ("shuffle this crate" for games). Play history. Text: reading lists (playlists for books), public bookshelves (opt-in), highlights and marginalia where OCR text layer exists (stored in Supabase with privacy flag), "most highlighted" communal layer. The Archivist can reference highlights.
**Determinations:** Leaderboard scope (global vs friend). Score claim privacy default. Whether communal highlights ship in v1.
**Failure surfaces:** OCR quality on old scans (disable highlight where no text layer). Honor-system scores being gamed (social defense: small community, names visible).
**Acceptance:** Play a game, claim a score, see the leaderboard. Highlight a passage in a novel, see it on re-read. Public bookshelf visible to others.
---
## 7. MIXWEAVE BRIDGE (runs independently, after JOB_5 + JOB_9)
`mixweave ingest --voidradio <crate|playlist>` pulls public domain audio AND ready-made StemSets from the Spine + Void Backend into MIXWEAVE's library. The Shellac Stack and the gospel crate arrive as rights-clean, pre-stemmed mix material. MIXWEAVE's own stem step becomes a cache hit for anything VOID RADIO already separated.
See MIXWEAVE_BUILD_PLAN.md for the full DJ engine spec (JOB_0 through JOB_7 of that plan). The bridge is MIXWEAVE JOB_9.
---
## 8. BUILD ORDER
```
JOB_0   Archive Spine                    THE FOUNDATION
  |
JOB_1   Void Channel migration           EXISTING APP STAYS ALIVE (WEB FIRST CLASS)
  |
JOB_2   Player upgrade                   DEV CLIENT DOOR (opens once, native lane)
  |
JOB_3   Audio mapper (the hard one)      SPINE LEARNS AUDIO
  |
JOB_4   Audio playback                   FIRST SOUND (web + native)
  |
JOB_5   Audio library + radio            LISTEN MODE COMPLETE
  |
  +---- JOB_6   Game mapper + play       FIRST PLAY (parallel OK after JOB_2)
  |
  +---- JOB_7   Text mapper + reading    FIRST READ (parallel OK after JOB_2)
  |
JOB_8   C.A.S.H. shelf + cross-links    MINISTRY ASSET
  |
JOB_9   Stem engine                      NEW USABILITY (parallel OK after JOB_3)
  |
JOB_10  Stem surfaces                    PEOPLE USE STEMS
  |
JOB_11  Unification                      FOUR BECOME ONE
  |
JOB_12  Social (games + text)            COMMUNITY LAYER
  |
MIXWEAVE BRIDGE                          DJ ENGINE CONNECTED
```
Parallel tracks: JOB_6 and JOB_7 can run any time after JOB_2 (they need the dev client and the Spine, both exist by then; their web surfaces only need the Spine). JOB_9 can run any time after JOB_3 (needs the audio mapper, not the player). This means three build lanes can move simultaneously once the Spine and dev client exist.
Audible, playable, or readable output from every stage. B's senses are the acceptance instrument throughout.
---
## 9. DEPENDENCY MAP
```
THE ARCHIVE SPINE (standalone)
  |
  +-- VOID BACKEND (Express + Supabase)
  |     |
  |     +-- Watch (Void Channel, migrated)
  |     +-- Listen (Void Radio)
  |     |     +-- Stem Engine
  |     |     |     +-- MIXWEAVE bridge
  |     |     +-- C.A.S.H. gospel crate
  |     |           +-- Void Press hymnal cross-links
  |     +-- Play (Void Arcade)
  |     +-- Read (Void Press)
  |           +-- C.A.S.H. Shelf
  |
  +-- DONATION CIRCUIT (web checkout, offerings + fuel)
  +-- THE ARCHIVIST (shared agent, narrates all modes)
  +-- DECK MODE (tab + projector, lean-back, owner: JOB_2 carries the lean-back
      player half; the deckvisuals ambient half is DETERMINATION PENDING)
```
---
## 10. RECONCILIATION v1.1 (binding amendments, 2026-06-11)
Source: the working session that shipped the header refactor, era-lean v2, wall virtualization, search-in-TopBar, the player gesture layer, the Void Snacks rebuild, and the no-hop player fix. The plan author did not have these in view. Each amendment is already folded into the sections above; this section is the record of what changed and why.
1. **Web is first class. RULED BY B (deferred to Opus recommendation).** The live product is React Native Web on Vercel plus mobile browsers. react-native-video and react-native-track-player are native-only and must never enter the web bundle. Player and audio engines platform-split behind shared interfaces. Native acceptance happens on the Tab S8 Ultra; web acceptance happens in the browser; both gate every JOB that touches a renderer.
2. **Shipped work outranks the plan.** The v2 gesture layer, era-lean v2, banded reshuffle, mature sequester, snacks heuristics, search-in-TopBar, and the no-hop error policy are live behavior. JOBs that touch these areas inherit them as constraints, not suggestions.
3. **The Spine accumulates pools, it does not snapshot 50.** Static 50-item categories would kill the variety machinery and starve the genz era lean. Pool depth 150 to 300 per category, union across syncs, sort/page rotation per sync. This also absorbs the standing "never throw away, only add" directive at the right layer.
4. **Spine persistence is a named trap.** Render disks are ephemeral. The deployment determination must solve db survival across restarts or the Spine recreates the problem it exists to fix.
5. **Pagination is part of the Spine contract.** Channel queues and See More fetch deep pages today. `/category/:id?page=N` over the stored pool, live passthrough as fallback.
6. **The item key is `id`, not `identifier`.** The consumer base already exists and keys on `item.id` everywhere. Schemas extend additively from shipped reality.
7. **Filtering split.** The Spine owns query-time exclusion (NSFW, news, restricted collections, clause-budget management). The Void Backend owns request-time policy: era lean per generation, mature members-only gating, recognizable bias, diversify at serve time, snacks title heuristics and garnish weave. Policy is per-request and per-user; it cannot live in a nightly sync.
8. **Supabase migrations are additive-with-default, run live.** Branching is a paid feature and is not assumed.
9. **Search stays raw end to end.** The Spine search passthrough applies no curation filters. This is a standing content-treatment rule, not a default.
10. **Collection ids get validated against live Archive counts before any crate ships.** Three of four collection names suggested for the snacks rebuild did not exist. One count query per candidate is cheap insurance.
11. **Media preloading is metadata-only on web.** Preloading media bytes doubles Archive bandwidth per view and Archive rate-limits by IP; this took prod down once already.
12. **Operational docs.** BUILD_PLAN.md remains the Void Channel operational log and the home of deploy gotchas (Render manual-deploy cutover, service worker cache, ffmpeg paths, preview-tool quirks). Handoffs land in /docs/handoffs/JOB_N_HANDOFF.md. New sessions read this plan, then BUILD_PLAN.md, then handoffs.

END THE VOID BUILD PLAN v1.1
