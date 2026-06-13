# VOIDtv — TV Apps Direction (Roku / Fire TV / Apple TV / Android TV / Smart TVs)

Discussion notes, not a commitment. VOIDtv is genuinely MADE for the living room — it is
literally TV (a wall of channels, lean-back, the void-TV aesthetic). The product fits a
10-foot screen better than most apps.

## THE PLATFORMS SPLIT INTO THREE CAMPS (by how much code you reuse)
1. WEB-BASED TVs — cheapest reach, reuses the existing Expo WEB build:
   - Fire TV (web-app mode), Samsung Tizen, LG webOS all run HTML/JS apps.
   - Add remote/D-pad focus navigation + a 10-foot layout to the web build. ONE codebase
     covers all three.
2. REACT NATIVE TVs — reuses the RN app:
   - Apple TV (tvOS) and Android TV / Google TV via the `react-native-tvos` fork. Existing
     screens largely carry over; add tvOS/Android-TV focus handling + big-screen layout.
3. ROKU — its OWN world, a separate build:
   - BrightScript + SceneGraph, not web or RN. No direct port. LARGEST US streaming base, but
     the MOST effort (essentially a from-scratch channel). Usually done last or via a
     third-party feed/converter service.

## THE TWO REAL COSTS, ON EVERY PLATFORM
- REMOTE / D-PAD NAVIGATION (the big one). The whole app is touch/click today; TV means
  FOCUS MANAGEMENT — every card and button needs spatial up/down/left/right navigation and a
  focus ring. This is the main rework, not a styling pass. Prototype it on ONE platform first.
- STORE CERTIFICATION + MAINTENANCE. Each store (Roku, Amazon, Google, Apple, Samsung, LG) has
  its own review, content policy, and yearly upkeep. RIGHTS POSTURE MATTERS here: VOIDtv points
  at IA-served public-domain/CC media (defensible); the kids fail-closed gate is a plus for
  ratings; the mature corral + any branded/ripped content (the social-mirror junk) will draw
  scrutiny; the 501(c)(3) church framing helps but stores will look.

## RECOMMENDED SEQUENCE (most reach per effort)
1. FIRE TV first — Amazon's Appstore is the friendliest, takes an Android build OR a web app.
   Biggest bang for least friction, large install base.
2. ANDROID TV / GOOGLE TV — same RN codebase as Fire's Android path; expands reach.
3. APPLE TV — `react-native-tvos`, premium audience, but Apple dev account + stricter review.
4. SAMSUNG / LG (web) — reuse the web + focus work from Fire.
5. ROKU last — separate BrightScript build; tackle once the others prove the audience, or
   evaluate a conversion service.

## THREE STEERS NEEDED FROM B (to turn this into a concrete first-platform plan)
1. Which platform matters most — REACH (Roku / Fire) or YOUR OWN devices (Apple TV)?
2. Timeline / ambition — a focused single-platform PROOF first, or a broad multi-platform plan
   on paper?
3. Roku BUILD vs BUY — willing to do a separate BrightScript build, or prefer a third-party
   feed/converter?

## THE PROCESS, END TO END (Fire TV as the worked example)
The reusable backend / Spine / IA streaming is platform-agnostic and DONE — a huge head start.
The TV work is almost entirely CLIENT: focus nav + 10-foot UI + per-store packaging.

PHASE 0 - pick the shell. Fire TV accepts (a) an Android APK (native via react-native-tvos or
a WebView wrapper) or (b) a "Web App" (your hosted Vercel URL wrapped, runs in Amazon's
WebView). FASTEST PROOF: web app pointing at a TV-optimized web build. Graduate to native later
if performance/store features demand.

PHASE 1 - the 10-foot UI. TV viewing distance ~10ft: bigger text (>=~24px equiv), bigger cards,
fewer per row, generous spacing, high contrast, and SAFE-AREA margins (TVs overscan - keep
content ~5% inside the edges). No hover, no tiny tap targets, no dense columns. VOIDtv's
void-TV wall already looks TV-shaped, so this translates well.

PHASE 2 - FOCUS NAVIGATION (the hard core, the bulk of the effort). No cursor/touch on a TV -
just a D-pad (up/down/left/right + select + back). You build a FOCUS ENGINE: exactly one
element focused at a time (highlighted ring/scale), arrows move focus to the spatially-nearest
neighbor, select activates, back pops the stack, and the focused card scrolls itself into view.
  - Web path: a spatial-navigation library (norigin-spatial-navigation / react-tv-space-
    navigation / LRUD) maps arrow keys -> focus movement; you wrap focusables + define order.
  - react-native-tvos path: native focus engine + TVFocusGuideView + hasTVPreferredFocus /
    onFocus/onBlur props.
  EVERY interactive surface is reworked: wall rows (arrow through cards + row-to-row), player
  controls (focusable play/seek), SEARCH (D-pad on-screen keyboard - typing on a remote is
  painful, so a grid keyboard + voice + lean on browse/channels/the Archivist), drawer/menu,
  and the kids PIN gate (D-pad entry). This touches a LOT of components.

PHASE 3 - remote/input. Map the platform remote: D-pad, OK, back, and MEDIA keys
(play/pause/ffwd/rewind) - the player needs these. Back is critical on TV (no universal
on-screen back). Each platform delivers key events differently.

PHASE 4 - playback on real hardware. TVs hardware-decode; IA h.264 mp4 plays on most, but codec
support VARIES (Roku picky). The playability vet pre-filters; the fast-pick-by-size fix matters
(a cheap stick chokes on 4K originals). TEST ON A REAL DEVICE (Fire stick), not just an
emulator - TV video is where surprises live. The void-TV channel/auto-advance model is
TV-native and a strength here.

PHASE 5 - packaging + store. Build the APK (or register the web app), Amazon Developer account,
store listing (icon, screenshots, description, PRIVACY POLICY, content-rating questionnaire).
Amazon reviews functionality + content policy. Declare maturity HONESTLY (the mature corral
means not "all ages" globally; kids mode is a separate gated experience - stores test this).
The 501(c)(3) + IA-sourced framing goes in the listing. Review = days to ~2 weeks; rejections
happen (remote-nav bugs, playback failures, rights questions) - iterate.

PHASE 6 - maintenance, forever. Each platform = ongoing (OS updates break things, policy
changes, some yearly re-cert). This is WHY you prove ONE platform first, not spread thin.

EFFORT HONESTY: a focused Fire TV web-app proof (TV-optimized web + focus nav + real-device
playback test + store submission) is weeks not days, mostly the focus-nav rework - but it is a
contained, provable first step. Build focus-nav ONCE on the web build (covers Fire/Samsung/LG),
prove on a real Fire stick, then decide native/Apple/Roku.

## NEXT STEP (once B steers)
Lay out a concrete first-platform plan. The focus-navigation architecture is the crux, so
prototype it on ONE platform (recommend Fire TV web) before spreading. The backend/Spine and
IA streaming are platform-agnostic and already work; the TV work is the client + focus + the
10-foot UI + per-store certification.
