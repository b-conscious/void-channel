/**
 * VoidLoader — Branded loading placeholder for VOIDtv.
 *
 * Drop-in replacement for empty space while content loads.
 * Supports four modes:
 *   1. TV Static video — plays a random AI-generated TV static transition clip
 *   2. Custom animation (GIF/image) — pass `source` prop
 *   3. Default: pulsing VOID text with breathing glow
 *   4. Inline: small spinner with optional label text
 *
 * Usage:
 *   <VoidLoader />                          — default pulsing VOID logo
 *   <VoidLoader mode="static" />            — random TV static video
 *   <VoidLoader source={require('./anim.gif')} />  — custom animation
 *   <VoidLoader size="small" label="tuning in..." />  — inline with text
 *   <VoidLoader size="card" />              — card-sized placeholder
 *   <VoidLoader size="row" />               — full-width row placeholder
 *   <VoidLoader size="channel" mode="static" /> — channel-sized static video
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, Image, Animated, Easing, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { colors, fonts, radius, cardSize } from '../theme';

var BRAND_BLUE = '#5cb8ff';

// ── TV Static video clips (hosted on backend CDN) ──────────
// These are AI-generated 3-5s clips of old TV static dissolving into content.
// Served from /static/ on the API server with 30-day immutable cache headers.
var STATIC_BASE = __DEV__
  ? (typeof window !== 'undefined' &&
     window.location &&
     window.location.hostname !== 'localhost' &&
     window.location.hostname !== '127.0.0.1'
      ? 'http://' + window.location.hostname + ':3001'
      : 'http://localhost:3001')
  : 'https://api.voidtv.net';

// Default clips — used immediately on first paint and as a fallback if the manifest
// fetch fails. The live list is replaced by /api/loaders (auto-discovers the folder),
// so dropping more clips into backend/public/static makes them available automatically.
var STATIC_CLIPS = [
  '/static/static-dissolve-1.mp4',
  '/static/static-dissolve-2.mp4',
  '/static/static-retro.mp4',
  '/static/static-anime.mp4',
];

// Track which clips have been preloaded in the browser
var preloadedClips = {};

// Monotonic per-instance index for StaticVideo. Each mounted "TV" grabs the next number so we can
// stagger their playback 10 seconds apart by mount order — a desynchronised wall where every screen
// started at a different time, instead of one clip looping in lockstep across all of them.
var _staticVideoSeq = 0;

// Fetch the full clip list once (memoized). Replaces STATIC_CLIPS when it resolves.
var _manifestFetched = false;
function fetchClipManifest() {
  if (_manifestFetched || typeof fetch === 'undefined') return;
  _manifestFetched = true;
  fetch(STATIC_BASE + '/api/loaders')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && Array.isArray(data.clips) && data.clips.length > 0) {
        STATIC_CLIPS = data.clips;
      }
    })
    .catch(function () { /* keep defaults */ });
}

// Loaders now play YOUR single hand-cut void-stream edit (the lo rendition) — not random AI
// dissolve clips (those are retired to public/static/_disabled/). No random pick, no seek: the
// stream is already cut into ~8-second scenes, so we just let it play through + loop. Per-instance
// brightness still gives the "wall of TVs" look, and StaticVideo falls back to the pulsing VOID if
// the file 404s. (Name kept as getRandomClip so its callers — clipUrl + preload — are untouched.)
function getRandomClip() {
  return STATIC_BASE + '/static/void-stream.mp4';
}

// Preload one clip in the background (call once after app loads)
function preloadRandomClip() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  var url = getRandomClip();
  if (preloadedClips[url]) return;
  var link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'video';
  link.href = url;
  document.head.appendChild(link);
  preloadedClips[url] = true;
}

// On web: fetch the manifest, then warm a single clip (don't compete with initial content load)
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  fetchClipManifest();
  setTimeout(preloadRandomClip, 3000);
}

export default function VoidLoader({ source, size, label, accent, style, mode, persist }) {
  var color = accent || BRAND_BLUE;

  // ── TV Static video mode ──
  if (mode === 'static' && Platform.OS === 'web') {
    return <StaticVideo size={size} label={label} color={color} style={style} persist={persist} />;
  }

  // ── Custom animation source (GIF, image) ──
  if (source) {
    var dims = SIZE_MAP[size] || SIZE_MAP.default;
    return (
      <View style={[styles.center, dims, style]}>
        <Image source={source} style={[styles.customAnim, dims]} resizeMode="contain" />
        {label ? <Text style={[styles.label, { color: color }]}>{label}</Text> : null}
      </View>
    );
  }

  // ── Inline / small: just a spinner + label ──
  if (size === 'small' || size === 'inline') {
    return (
      <View style={[styles.inlineRow, style]}>
        <ActivityIndicator size="small" color={color} />
        {label ? <Text style={[styles.inlineLabel, { color: color }]}>{label}</Text> : null}
      </View>
    );
  }

  // ── Default: breathing VOID text with animated glow ──
  return <PulsingVoid size={size} label={label} color={color} style={style} />;
}

// Inject the CRT power-on / power-off keyframes once (web). The power-on makes each
// loader "blink on" like an old set warming up; power-off collapses it to a bright line.
var _crtKeyframesInjected = false;
function injectCrtKeyframes() {
  if (_crtKeyframesInjected || typeof document === 'undefined') return;
  _crtKeyframesInjected = true;
  var s = document.createElement('style');
  s.id = 'void-crt-keyframes';
  s.textContent =
    // Power-on flash: transform + brightness only (opacity is owned by the ramp below).
    '@keyframes voidPowerOn{0%{transform:scaleY(0.04);filter:brightness(4) saturate(0)}' +
    '30%{transform:scaleY(1.06);filter:brightness(2.2)}60%{transform:scaleY(0.98)}' +
    '100%{transform:scaleY(1)}}' +
    '@keyframes voidPowerOff{0%{opacity:1;transform:scaleY(1)}55%{opacity:1;transform:scaleY(0.03);filter:brightness(3)}' +
    '100%{opacity:0;transform:scaleY(0.03);filter:brightness(0)}}' +
    // Opacity ramps up in 4 quarters over the 40s stream: 60% -> 75% -> 85% -> 100% ("tuning in").
    '@keyframes voidOpacityRamp{0%,24.9%{opacity:0.6}25%,49.9%{opacity:0.75}' +
    '50%,74.9%{opacity:0.85}75%,100%{opacity:1}}';
  document.head.appendChild(s);
}

// ── TV Static Video Component (Web only) ──────────────────
// One shared "void stream," every instance shows a DIFFERENT moment — staggered 10s apart by mount
// order — at a DIFFERENT brightness, blinks on like a CRT, and blinks out after 20-40s.
function StaticVideo({ size, label, color, style, persist }) {
  var clipUrl = useMemo(getRandomClip, []);
  // Per-instance brightness — some dim (TV in a dark room), some bright. The "wall of TVs" look.
  var brightness = useMemo(function () { return (0.45 + Math.random() * 0.85).toFixed(2); }, []);
  // Per-instance index — staggers this TV's playback 10s × index (see staggerStart below).
  var seq = useMemo(function () { return _staticVideoSeq++; }, []);
  var dims = SIZE_MAP[size] || SIZE_MAP.default;
  var [failed, setFailed] = useState(false);
  var [blinkedOut, setBlinkedOut] = useState(false);
  // persist mode (the wall TVs): blink CYCLES — dark for a beat, then power back on at a
  // new offset. Without it every TV died permanently within 20-40s of load and the wall
  // field went dark for the rest of the session (B's report).
  var [dark, setDark] = useState(false);
  var [cycle, setCycle] = useState(0);
  var containerRef = useRef(null);
  // LAZY LOAD: with TVs as in-row card tiles, a fresh wall mounted 20 videos of the same
  // stream at once and Chrome stalled them ALL at readyState 0. Each TV now waits until it
  // is near the viewport before mounting its <video>; on-screen count stays small.
  var uid = useMemo(function () { return 'sv' + Math.random().toString(36).slice(2, 9); }, []);
  var [visible, setVisible] = useState(false);
  useEffect(function () {
    if (typeof document === 'undefined') return;
    var el = document.querySelector('[data-svio="' + uid + '"]');
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { setVisible(true); io.disconnect(); return; }
      }
    }, { rootMargin: '250px' });
    io.observe(el);
    // Belt: IO never fires in hidden tabs (and flakes in embedded webviews) — poll the rect
    // as a fallback so a TV in view always lights once the tab is actually looked at.
    var poll = setInterval(function () {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.top < window.innerHeight + 250 && r.bottom > -250) {
        setVisible(true);
        clearInterval(poll);
        io.disconnect();
      }
    }, 2000);
    return function () { io.disconnect(); clearInterval(poll); };
  }, [uid]);

  useEffect(function () {
    if (typeof document === 'undefined' || dark || !visible) return;
    injectCrtKeyframes();
    var video = containerRef.current && containerRef.current.querySelector && containerRef.current.querySelector('video');
    if (!video) return;

    var onError = function () { setFailed(true); };
    video.addEventListener('error', onError);

    // Stagger each TV's playback by 10s × its mount index, so the wall is DESYNCHRONISED — every
    // screen starts at a different time, 10 seconds apart — instead of looping in lockstep. The
    // stream is fast-start so seeking is instant; the ~116s clip gives ~11 distinct phases before
    // the offset wraps. Each blink cycle advances the phase so a TV never resumes where it left.
    function staggerStart() {
      try {
        var d = video.duration;
        if (d && isFinite(d) && d > 1) {
          // +0-6s jitter: mount order can collide phases (remounts skew the seq sequence)
          video.currentTime = ((((seq + cycle) * 10) + Math.random() * 6) % d);
        }
      } catch (e) {}
    }
    if (video.readyState >= 1) staggerStart();
    else video.addEventListener('loadedmetadata', staggerStart, { once: true });

    // Blink out after a random 20-40s. persist: go dark (the separate effect below brings
    // it back — the timer must NOT live here, because this effect re-runs when dark flips
    // and its cleanup would kill the recovery). Otherwise settle to the quiet VOID pulse.
    var lifespan = 20000 + Math.random() * 20000;
    var offTimer = null;
    var blinkTimer = setTimeout(function () {
      try { video.style.animation = 'voidPowerOff 420ms ease-in forwards'; } catch (e) {}
      offTimer = setTimeout(function () {
        if (persist) setDark(true);
        else setBlinkedOut(true);
      }, 430);
    }, lifespan);

    return function () {
      clearTimeout(blinkTimer);
      clearTimeout(offTimer);
      video.removeEventListener('error', onError);
    };
  }, [cycle, dark, persist, visible]);

  // The relight: while dark (persist only), wait a beat then power back on at the next
  // phase. Lives in its own effect so the video effect's cleanup can't cancel it.
  useEffect(function () {
    if (!dark || !persist) return;
    var t = setTimeout(function () {
      setDark(false);
      setCycle(function (c) { return c + 1; });
    }, 700 + Math.random() * 1800);
    return function () { clearTimeout(t); };
  }, [dark, persist]);

  if (failed || blinkedOut || dark) {
    return <PulsingVoid size={size} label={label} color={color} style={style} />;
  }

  return (
    <View style={[styles.center, dims, { overflow: 'hidden', position: 'relative' }, style]} dataSet={{ svio: uid }}>
      {visible && (
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, overflow: 'hidden', borderRadius: 8 }}
          dangerouslySetInnerHTML={{
            __html: '<video src="' + clipUrl + '" autoplay muted loop playsinline '
              + 'style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;'
              + 'filter:saturate(0.7) contrast(1.15) brightness(' + brightness + ');'
              + 'animation:voidPowerOn 360ms ease-out, voidOpacityRamp 40s linear forwards;" />'
          }}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.staticOverlay]} />
      {label ? <Text style={[styles.staticLabel, { color: color }]}>{label}</Text> : null}
    </View>
  );
}

// ── Pulsing VOID Text ─────────────────────────────────────
function PulsingVoid({ size, label, color, style }) {
  var opacity = useRef(new Animated.Value(0.3)).current;
  var scale = useRef(new Animated.Value(0.97)).current;

  useEffect(function () {
    var anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.03,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(scale, {
            toValue: 0.97,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      ])
    );
    anim.start();
    return function () { anim.stop(); };
  }, []);

  var dims = SIZE_MAP[size] || SIZE_MAP.default;
  var fontSize = size === 'card' ? 16 : size === 'row' ? 14 : 22;

  return (
    <View style={[styles.center, dims, style]}>
      <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
        <Text style={[styles.voidText, {
          color: color,
          fontSize: fontSize,
          textShadowColor: color,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: Platform.OS === 'web' ? 20 : 10,
        }]}>VOID</Text>
        {label ? (
          <Text style={[styles.label, { color: color + '99' }]}>{label}</Text>
        ) : (
          <Text style={[styles.label, { color: colors.textGhost }]}>loading...</Text>
        )}
      </Animated.View>
    </View>
  );
}

var SIZE_MAP = {
  small: { width: 40, height: 40 },
  card: { width: cardSize.width, height: cardSize.height },
  row: { width: '100%', height: 140 },
  channel: { width: 140, height: 90 },
  hero: { width: '100%', height: 220 },
  spotlight: { width: '100%', height: 280 },
  default: { width: 160, height: 120 },
};

var styles = StyleSheet.create({
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  voidText: {
    fontFamily: fonts.monoBold,
    letterSpacing: 4,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 6,
    textAlign: 'center',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  inlineLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  customAnim: {
    borderRadius: radius.md,
  },
  staticOverlay: {
    backgroundColor: 'rgba(12, 12, 15, 0.15)',
    borderRadius: radius.md,
  },
  staticLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    position: 'absolute',
    bottom: 8,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
