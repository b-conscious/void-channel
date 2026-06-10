# VOIDtv — Build Plan / Session Handoff

> Self-contained handoff for a fresh session. The app is **live in production** and all work
> below is **pushed to `master`** (which auto-deploys). Last commit at handoff: **`b2b8010`**.

---

## 0. What VOIDtv is
A discovery-first front-end for the **Internet Archive's** public-domain video, styled as
channel-surfing weird old TV. Tagline: *"before AI slop, there was human creativity."* Operated
by **Church of American Strength & Hope** (501c3), donation-supported. React Native / Expo SDK 54
(web + mobile). The vibe is **analog static / "the void"** — content materializes out of TV static.

---

## 1. Where things live / how to deploy
- **Project root:** `C:\Users\bryan\Downloads\void-channel-extracted\void-channel`
- **Backend** (`backend/`, Express): deploys to **Render** → `https://api.voidtv.net`
- **Frontend** (`mobile/`, Expo web): deploys to **Vercel** → `voidtv.net` (308-redirects to `www.voidtv.net`)
- **GitHub:** `github.com/b-conscious/void-channel`, branch **`master`**. **Push to master = auto-deploy** (Vercel + Render).
- **Dev:** backend `cd backend && node server.js` (port 3001); web `cd mobile && npx expo start --web` (port 8081).
- **Verify a build compiles** before pushing: `curl -s "http://localhost:8081/index.bundle?platform=web&dev=true" | head -c 40` → should start `var __BUNDLE_START_TIME__`. (The **Claude Preview tool is unreliable** with this RN-Web app — DPR quirk renders ~577px logical regardless of viewport, can't show desktop layout >900px, and hangs on external navigation. Verify via Metro bundle + curl + the live site instead.)

## 2. Config / accounts / secrets (all set unless noted)
- **Supabase project:** `sawuxdquewomjrgtmgtb`. ⚠️ **PENDING USER ACTION:** *Anonymous Sign-Ins* must be enabled (Authentication → Providers / Settings). It's currently **off**, which (a) blocks anonymous users from the Archivist (it requires a session) and (b) caused the recurring `/api/auth/refresh 401` nag.
- **`backend/.env`** (gitignored): `ANTHROPIC_API_KEY` ✅, `SUPABASE_URL/SERVICE_KEY/ANON_KEY` ✅, `UPSTASH_REDIS_REST_URL/TOKEN` ✅ (durable cache active). Also set the same on **Render → Environment**.
- **Archivist model:** `claude-haiku-4-5-20251001` (default in `archivist.js`; `claude-3-5-haiku-latest` is retired).
- **Admin emails** (`backend/admin.js` ADMIN_EMAILS): `bryankorth31@gmail.com`, `preacherb@cashvalues.org` → unlimited Archivist via `isAdmin()`. **Must be signed in with that email** for it to apply.
- **DONATE_URL:** `https://square.link/u/dJioBmlW`
- **SQL already run** in Supabase (`backend/schema-archivist.sql`): `archivist_usage`, `profiles.supporter_until`, `profiles.archivist_credits`.

## 3. The void stream — RE-EXPORTED + WIRED (was the biggest pending action)
✅ **DONE by user:** the void stream is re-encoded and split into two renditions, both in
`backend/public/static/`:
- **`void-stream.mp4`** = the **lo** rendition (now **14 MB**, down from the 67 MB HEVC) — used by the loaders.
- **`void-stream-hi.mp4`** = the **hi** rendition (**35 MB**) — used by the intro on desktop.
  *(Was uploaded as `void-stream-hi..mp4` — double-dot typo — now renamed.)*
- The 4 random AI dissolve clips are retired to `public/static/_disabled/` — loaders no longer use them.

✅ **DONE (wiring, this session):**
- `VoidLoader.js` → `getRandomClip()` now returns the single `/static/void-stream.mp4` (the lo) for
  ALL loaders. No random pick, no seek (respects the ~8-second scene cuts); per-instance brightness
  keeps the "wall of TVs" look; 404 → graceful fallback to the pulsing VOID.
- `VoidIntro.js` → plays `void-stream-hi.mp4` when `window.innerWidth > 900` (desktop showcase),
  else `void-stream.mp4` (mobile). First tap unmutes — this is where the audio edit comes alive.

**⚠️ STILL VERIFY:** that the re-encodes are actually **H.264 + fast-start** (the old file was H.265/HEVC,
which Chrome/Firefox can't play → would fall back to the pulse). Check top atoms `ftyp … moov …` (good)
vs `ftyp … mdat …` (bad). And these assets must be **committed** so Render serves them in prod.

**Still TODO:** the **Now Playing channels** (§2) can reuse the same stream once built.

---

## 4. Queued features (user said "yes")
1. ✅ **Audio intro** — `mobile/src/components/VoidIntro.js`, mounted in `App.js` after `<Navigation/>`.
   Once-per-session full-screen "▶ TAP TO ENTER THE VOID"; first tap unmutes the stream (audio gesture)
   and fades into the app. **DONE & deployed.** (Toggle to first-visit-only via localStorage if it feels heavy.)
2. ⬜ **"Now Playing" channels** — the *honest* Prime-style "Live TV picks / ON NOW + progress" row.
   Each channel card shows the item currently "on" + a progress bar; tap = tune in to that channel's queue.
   NOT a fake "LIVE" badge — make it a real synchronized/continuous channel (position derived from time so
   everyone's in sync, OR just "tune in" with progress becoming real once watching). Reuse the existing
   `channelDefs` + `handleChannelPress` (still in `HomeScreen.js` as now-dead code after the LIVE row was removed).
3. ⬜ **Founding-member tier** — **voluntary** $5/yr membership (NOT a hard paywall — decided; cleaner for a
   501c3 + better reach). 7-day trial via a new `profiles.trial_ends_at`; `supporter_until` already = membership.
   Soft "become a founding member" nudge after trial (not a wall). Perks: bigger Archivist allowance + Hall of Fame +
   flair. **Hard part = donation→`supporter_until` attribution** (Square webhook + a reference carrying the user id,
   or a redeem-code flow). Run the final donation-vs-fee shape past the church's accountant.
4. ⬜ **Rating / quality-weighting system** — explicit ratings to weight videos *correctly* (today we only have
   passive views + binary hearts). Theme it as **"SIGNAL STRENGTH" (1–5 bars)** to fit the analog/void aesthetic.
   - **Backend:** `ratings(user_id, item_id, value SMALLINT 1-5, created_at)` table (one row per user/item, upsert).
     Aggregate avg + count per item. Endpoints: `POST /api/ratings/:id` (set/update), `GET /api/ratings/:id` (avg+count+mine).
   - **Weight it correctly (the key):** use a **Bayesian average** = `(C*m + sum) / (C + count)` where `m` = global
     mean rating, `C` ≈ 10 (confidence). Stops a single 5★ from outranking a well-reviewed 4★. This is THE thing
     that makes weighting honest.
   - **Composite rank score:** blend the Bayesian rating (quality) + views (popularity) + hearts (love) + recency →
     one score that powers a **"Top Rated"** row, recommendations, search ranking, and demoting junk. This is the
     "better system" foundation — once ratings exist, recs/ranking get dramatically better.
   - **Frontend:** a signal-bars rate control on `PlayerScreen`; show the score on cards (`MediaCard`) + player.
     +XP for rating (ties into `GameContext`).

---

## 5. The "void" aesthetic redesign (current creative direction)
Reference: **Amazon Prime Video** layout, but **smaller hero** (our archive thumbs are low-res) and
re-skinned as **"the void"** — content **materializes out of dark TV static**, not clean cards.

**Already built (the foundation):**
- `MediaCard` is already the Prime card: **16:9 (300px desktop / 198px mobile)**, thumbnail-cover + gradient +
  title overlay + **hover-to-expand** (desc/meta/play).
- `FastImage` already **dissolves each thumbnail in from TV static** (SVG feTurbulence noise → resolve).
- **Hero shrunk** (`HomeScreen.js`): `IS_DESKTOP ? min(contentW*0.30, 380) : contentW*0.52` (was 0.62 → ~895px).
- **Loader video** (`VoidLoader.js` StaticVideo): plays the void stream (no random seek — respects the user's
  8-second scene cuts), CRT power-on/off blink, **opacity ramps 60→75→85→100% over 40s** (voidOpacityRamp), object-fit cover.

**NEXT (in-progress idea, NOT yet built):** make the whole background a **living static void** so everything
feels suspended in it. Plan: in `App.js` `injectRetroCss()`, add a faint fixed `body::after` static film:
```js
// define near top of injectRetroCss:
var noiseUri = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='vn'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23vn)'/%3E%3C/svg%3E";
// add to the CSS array (before ].join):
'@keyframes voidGrain{0%{background-position:0 0}25%{background-position:-30px 18px}50%{background-position:22px -28px}75%{background-position:-14px 26px}100%{background-position:18px -12px}}',
'body::after{content:"";position:fixed;inset:0;z-index:100;pointer-events:none;background-image:url("' + noiseUri + '");background-repeat:repeat;opacity:0.05;mix-blend-mode:screen;animation:voidGrain 0.45s steps(4) infinite;}',
```
Then refine: **static at card edges** + **scroll-focus** (content blurs at viewport edges, sharpens center, so
videos "come in and out of focus from the void"). Keep it lightweight — user said sprites/low-detail are fine.
Also TBD: the colorful **vibe tags** (CURSED/WEIRD) on cards — keep / tone-down / hover-only for a cleaner look.

---

## 6. Recurring gotchas
- **Mobile cache:** the user repeatedly sees stale bundles. After every deploy, test in an **incognito/private tab**
  or clear site data. Expo web registers a service worker that clings to the old version.
- **Thumbnails** proxy through `GET /api/thumb/:id` (`server.js`) → fetches archive.org, in-memory cache (6h) +
  30d immutable headers (Cloudflare/browser cache). `FastImage` rewrites `archive.org/services/img/*` → the proxy.
  Fixes ORB cross-origin blocks + speeds mobile. (Optional: add a Cloudflare Cache Rule for `/api/thumb/*` → edge cache.)
- **Categories:** never call `/api/categories?refresh=true` from the client — it does ~47 live Archive fetches, can
  exceed Cloudflare's 100s timeout → 524 with no CORS header → browser reports "CORS error." Use the cached endpoint;
  backend self-warms + keeps a **last-known-good** payload (never caches/serves empty). Client reshuffles for variety.
- **iOS:** videos need `playsinline`/`webkit-playsinline` (set on the player's `<video>` in `VideoPlayer.js`) or iOS
  forces fullscreen. Web autoplay must start **muted**; sound restores on first trusted gesture (sticky activation).
- **Player layout (desktop):** explicit widths from `useWindowDimensions` (the Player Stack scene doesn't stretch on
  web, so `flex:1` collapses). Currently video column ~40%, channel sidebar ~58% (2-col grid). Tunable in `PlayerScreen.js`.

## 7. Monetization model (decided)
**Free app.** Voluntary **$5/yr "Member/Patron"** (not a wall). Archivist **top-ups** ~$1/wk / pay-what-you-want.
Keep perks insubstantial (cosmetic/recognition) so donations stay tax-deductible for the 501c3 — confirm with accountant.

## 9. Content treatment — "generational variety" (STANDING SPEC, in progress)
The default texture should feel **generational**, not antique: every broad row should span the
**decades + recognizable series** (X-Men '90s, Transformers '80s, 2000s cartoons … *and* a Betty
Boop), never a single-era/single-show dump. Applies **throughout EXCEPT category specifics**
(decade rows, The Silent Era, the dedicated show rows, mature) which stay narrow on purpose.

**Philosophy — the junk is a FEATURE, not a bug.** Keep the "stream of noise" (amateur fan
uploads, etc.) **searchable** — the recognizable-bias + junk-filtering applies ONLY to curated
BROWSE rows. **Search stays raw.** That noise is the raw material people earn XP curating
(add metadata = points), and the long game is humans making the Archive useful "to humanity, not
just LM" training fodder. Do **not** filter global search. **NSFW is already handled** (NSFW_EXCLUDE
+ isolated mature categories) — do not re-architect it.

**Mechanism (in `backend/archive.js`):**
- `diversify(items, maxPerKey=2)` — caps how many items share a series/creator (key = creator,
  else normalized title root) so one show can't flood a row. Opt-in via **`diversify: true`** on
  a category (over-fetches 2× then trims) so it never starves a single-source row.
- **Per-category blend bias** — `searchBlended(query, rows, opts)`. Default = 30% popular / 70%
  deep-obscure (gold for weird-film rows). **`recognizable: true`** on a category → `RECOGNIZABLE_BLEND`
  (65% popular, shallow pages, non-anchor portion ALSO from quality sorts) so known series surface
  instead of fan junk. The "60% obscure" ethos is **not** one-size-fits-all.
- **`cartoons` ("The Animation Vault")** is the proven first application: retargeted off the
  Betty-Boop-heavy `classic_cartoons` to `animationandcartoons` + recognizable cross-decade series,
  excluding the dedicated shows, `map`/`pmv` fan-junk filtered, `diversify:true` + `recognizable:true`.
  Verified: consistent 1910s→2010s spread (X-Men/Gargoyles/DuckTales/He-Man/Transformers/Fleischer), no junk.

**⚠️ CLAUSE BUDGET GOTCHA:** `getCategoryItems`/`getAllCategories` auto-append `NSFW_EXCLUDE` +
`NEWS_POLITICS_EXCLUDE` to ENTERTAINMENT_IDS categories. If the combined query gets too long,
Archive returns **ZERO** (silent). Keep category queries lean (the broad cartoon query had to be
trimmed). Also: apostrophes in `title:("dexter's …")` break the Lucene parser → 0. Avoid them.

**TODO — rollout:** add `recognizable: true` (+ usually `diversify: true`) to the other nostalgia
`type` rows (e.g. Saturday Morning, Most Popular, Comedy Gold, Horror, Sci-Fi, Western); leave the
weird/deep rows (Lost Reels, The Weird Shelf, deep cuts) on the default deep-obscure blend.

**⚠️ "SNACKS"/SHORTS BUG (found, NOT fixed):** `/api/shorts` filters `runtime:[1 TO 120]`, but
Archive's `runtime` is a **display string** ("11:03") so the range is a broken lexical compare —
it returns ~10-min films and drops real <2-min clips. True duration filtering isn't possible via
Archive search. **Fix = query short-BY-NATURE collections** (commercials / trailers / cartoon
shorts / newsreels), then client-filter by parsed `runtime`. (Confirm whether "snacks" == shorts.)

## 10. Session bug-fix batch (DONE + web bundle compiles clean — NOT yet pushed)
Frontend (`mobile/src`): (1) search grid right-column clip → `MediaCard` responsive `width` +
`SearchScreen` computes exact `CARD_W`; (2) unified year/duration badge styling; (5) clip-drag was
finicky (effect re-bound listeners every move via 300ms debounce) → bind once, read live via ref;
(6) clip PREVIEW now polls + pauses at clipEnd (added `play`/`pause` to VideoPlayer ref handle);
(7) FB/X share hijacked by mobile apps → `shareTo()` uses `navigator.share` on mobile web, web
composer in new tab on desktop; (9) tapping a video then it SWITCHING → `handleVideoError` no longer
skips to a related video while metadata is still loading (waits for confirmed URL).
Backend: (8) rabbit hole "first 3 identical" → `getRelated` dedupes by BASE id (strips `:N` segments)
+ drops current item. Audio (3,4) = asset/browser-constrained (HEVC void-stream re-encode + genuinely
silent sources), flagged not code-fixed.

## 8. Recent commit trail (this session, newest first)
`b2b8010` VoidIntro · `f19dbb1` loader opacity ramp · `81081a7` loader no-seek (8s cuts) ·
`9f1b0d5` loader seek/fill · `68b3636` shrink hero · `587922e` CORS+rubberband ·
`fd8cc92` mobile playsinline + desktop player resize · `cec8fba` remove LIVE channels ·
`a752f0e` thumbnail proxy · `6d40083` void-stream video · `5ef4a8f` admin-unlimited Archivist ·
`7aaf294` big batch (mobile content fix, autoplay, Archivist, layout, auth, title cap).

## 11. Mobile testing backlog — Bryan's on-device notes (PENDING)
Done in this note-batch: **ffmpeg installed** (User PATH → `C:\Users\bryan\ffmpeg\ffmpeg-…-full_build\bin`);
both void-stream renditions **fast-started losslessly** (`-c copy -movflags +faststart`, moov→front, AAC
audio kept). Audio tracks CONFIRMED present in both `void-stream.mp4` (lo) + `void-stream-hi.mp4` (hi).

Still TODO:
1. **Banned category** — new "Banned" channel: banned/censored films across eras (archive.js category). On-vibe.
2. **Channel options ABOVE their content** — filter/channel chips must sit above the area they populate
   (currently below). Confirm screen (Player channel sidebar vs Search filter row).
3. **More card options (Amazon ref)** — MediaCard hover-expand needs the fuller Prime action row
   (play, +My Void, more info, mute) AND cards must visibly emerge from the void (FastImage resolve is in;
   the §5 scroll-focus "in/out of the void" — the "out" — still TODO).
4. **Opening video audio** — intro must carry sound. Track present; browser needs the tap gesture (VoidIntro
   has it). Re-verify after the H.264 deploy + hard cache clear.
5. **Audio-on-show / mute-on-hover** — videos play audio WHEN SHOWN, mute when hovered elsewhere (void's
   ambient sound; hovering a card quiets it). Needs gesture unlock first. CLARIFY exact scope/contexts.
6. **TV category — medical junk on main** — surgical/inappropriate medical content leaking into TV main →
   add medical/NSFW fencing to the TV query.
7. **TV category — real episodes across eras** — tighten to ACTUAL tv episodes spanning decades (not just PD
   oldies); apply the generational `recognizable`+`diversify` treatment (same as cartoons).
8. **Mobile fullscreen bug** — fullscreen + rotate phone → WHITE SCREEN; "still seeing old options" = partly
   stale service-worker cache. Investigate VideoPlayer native fullscreen + orientation on mobile web.
