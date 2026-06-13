# Subtitles pipeline (captured 2026-06-11, B-supplied design)

Status: SPEC. Build blocked on B's OpenSubtitles API key (free tier, 100 downloads/day,
plenty because subtitles cache per CATALOG ITEM, never per session). Pairs with the
standing watchlist captions item (Whisper on the stemworks hardware).

## The three-source waterfall, cheapest first
1. INTERNET ARCHIVE FILES: many items ship .srt or .vtt in their own file list. The spine
   item mapper checks the files array first; zero external calls.
2. OPENSUBTITLES: api.opensubtitles.com/api/v1/subtitles, search by TMDB id (once slice B
   lands), IMDB id, or title+year from the catalog. Headers: Api-Key + User-Agent
   ("VOIDtv v1.0"). Download SRT once at INGEST time, store server-side, link in the
   catalog db. Never fetch at playback.
3. WHISPER (high-priority curated picks only): self-hosted speech-to-text for the items
   nobody ever subtitled (the 1946 race film case). Accessibility win and a genuine
   differentiator; output feeds search and the Archivist too.

## Playback wiring, the honest platform split
- B's snippet (react-native-video textTracks) is the NATIVE lane, which is PARKED by the
  platform ruling. Recorded for when that lane reopens.
- WEB (the product): expo-video's web implementation does not expose textTracks; the
  underlying video element supports WebVTT track elements. Two options, in order:
  a. Inject a track element onto the player's video node (SRT converted to VTT at ingest,
     conversion is trivial), browser renders cues natively.
  b. Own cue overlay: parse the VTT, render cues in our controls layer (full styling
     control, matches the void aesthetic, slightly more work).
- Either way the player gains a subtitle toggle in the controls.

## Storage
- SRT/VTT files live next to the catalog: backend/public/subs/<item_id>.vtt (Render-served,
  faststart irrelevant, tiny files) or the spine db as text. Decide at build.
- Catalog rows gain subtitle_url (additive).

## Determinations for B
- OpenSubs key (registration is free and instant).
- Whether Whisper runs on the stemworks box or cloud-burst for the curated tier.
- Subtitle toggle default: off, remember per user.
