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

## NEXT STEP (once B steers)
Lay out a concrete first-platform plan. The focus-navigation architecture is the crux, so
prototype it on ONE platform (recommend Fire TV web) before spreading. The backend/Spine and
IA streaming are platform-agnostic and already work; the TV work is the client + focus + the
10-foot UI + per-store certification.
