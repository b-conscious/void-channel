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

## 3. ⚠️ Biggest pending USER action: re-export the void stream
`backend/public/static/void-stream.mp4` is **67 MB and NOT fast-start** (moov atom at the END).
This blocks: random-start seeking, fast loading, and smooth play. **Fix = re-export via HandBrake**
(handbrake.fr): check **"Web Optimized"** (fast-start), 480p (854px wide), H.264 RF≈30, keep audio →
~5–15 MB. Drop into `backend/public/static/void-stream.mp4` (same name). Then commit+push it.
Verify fast-start by reading top atoms — `ftyp … moov …` (good) vs `ftyp … mdat …` (bad). This unblocks
the loaders, the audio intro, and the Now Playing channels.

---

## 4. The 3 queued features (user said "yes" to all)
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

## 8. Recent commit trail (this session, newest first)
`b2b8010` VoidIntro · `f19dbb1` loader opacity ramp · `81081a7` loader no-seek (8s cuts) ·
`9f1b0d5` loader seek/fill · `68b3636` shrink hero · `587922e` CORS+rubberband ·
`fd8cc92` mobile playsinline + desktop player resize · `cec8fba` remove LIVE channels ·
`a752f0e` thumbnail proxy · `6d40083` void-stream video · `5ef4a8f` admin-unlimited Archivist ·
`7aaf294` big batch (mobile content fix, autoplay, Archivist, layout, auth, title cap).
