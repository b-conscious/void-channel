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

function getRandomClip() {
  var idx = Math.floor(Math.random() * STATIC_CLIPS.length);
  return STATIC_BASE + STATIC_CLIPS[idx];
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

export default function VoidLoader({ source, size, label, accent, style, mode }) {
  var color = accent || BRAND_BLUE;

  // ── TV Static video mode ──
  if (mode === 'static' && Platform.OS === 'web') {
    return <StaticVideo size={size} label={label} color={color} style={style} />;
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
    '@keyframes voidPowerOn{0%{opacity:0;transform:scaleY(0.04);filter:brightness(4) saturate(0)}' +
    '30%{opacity:1;transform:scaleY(1.06);filter:brightness(2.2)}60%{transform:scaleY(0.98)}' +
    '100%{opacity:1;transform:scaleY(1)}}' +
    '@keyframes voidPowerOff{0%{opacity:1;transform:scaleY(1)}55%{opacity:1;transform:scaleY(0.03);filter:brightness(3)}' +
    '100%{opacity:0;transform:scaleY(0.03);filter:brightness(0)}}';
  document.head.appendChild(s);
}

// ── TV Static Video Component (Web only) ──────────────────
// One shared "void stream," every instance shows a DIFFERENT moment (random start time)
// at a DIFFERENT brightness, blinks on like a CRT, and blinks out after 20-40s.
function StaticVideo({ size, label, color, style }) {
  var clipUrl = useMemo(getRandomClip, []);
  // Per-instance brightness — some dim (TV in a dark room), some bright. The "wall of TVs" look.
  var brightness = useMemo(function () { return (0.45 + Math.random() * 0.85).toFixed(2); }, []);
  var dims = SIZE_MAP[size] || SIZE_MAP.default;
  var [failed, setFailed] = useState(false);
  var [blinkedOut, setBlinkedOut] = useState(false);
  var containerRef = useRef(null);

  useEffect(function () {
    if (typeof document === 'undefined') return;
    injectCrtKeyframes();
    var video = containerRef.current && containerRef.current.querySelector && containerRef.current.querySelector('video');
    if (!video) return;

    var onError = function () { setFailed(true); };
    video.addEventListener('error', onError);

    // No seeking — the stream is already cut into 8-second scenes by you, so we just let it
    // play through them and loop. (Seeking would jump into the middle of a scene, and a
    // non-faststart file can't seek anyway.)

    // Blink out after a random 20-40s, then settle to the quiet VOID pulse (so a long
    // load never shows a video forever, and the field keeps flickering).
    var lifespan = 20000 + Math.random() * 20000;
    var blinkTimer = setTimeout(function () {
      try { video.style.animation = 'voidPowerOff 420ms ease-in forwards'; } catch (e) {}
      setTimeout(function () { setBlinkedOut(true); }, 430);
    }, lifespan);

    return function () {
      clearTimeout(blinkTimer);
      video.removeEventListener('error', onError);
    };
  }, []);

  if (failed || blinkedOut) {
    return <PulsingVoid size={size} label={label} color={color} style={style} />;
  }

  return (
    <View style={[styles.center, dims, { overflow: 'hidden', position: 'relative' }, style]}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, overflow: 'hidden', borderRadius: 8 }}
        dangerouslySetInnerHTML={{
          __html: '<video src="' + clipUrl + '" autoplay muted loop playsinline '
            + 'style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.88;'
            + 'filter:saturate(0.7) contrast(1.15) brightness(' + brightness + ');'
            + 'animation:voidPowerOn 360ms ease-out;" />'
        }}
      />
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
