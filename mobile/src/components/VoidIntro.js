/**
 * VoidIntro — the "tap to enter the void" title moment.
 *
 * On app open (once per session), a full-screen title plays the void stream muted
 * behind the brand. The first tap UNMUTES it (browsers require a gesture for audio),
 * letting the edit's sound play as the screen fades into the app. This is where the
 * author's audio edit gets to shine instead of being silent loader wallpaper.
 *
 * Web only — it relies on an HTML <video> + the user gesture to unlock audio.
 */

import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, fonts } from '../theme';

var BRAND_BLUE = '#5cb8ff';

var STATIC_BASE = __DEV__
  ? (typeof window !== 'undefined' && window.location &&
     window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      ? 'http://' + window.location.hostname + ':3001'
      : 'http://localhost:3001')
  : 'https://api.voidtv.net';

// Desktop gets the hi rendition (the showcase); mobile gets the lighter lo (void-stream.mp4).
// Web-only component, so window is available at eval; the intro plays once at load.
var STREAM_URL = STATIC_BASE + '/static/void-stream'
  + ((typeof window !== 'undefined' && window.innerWidth > 900) ? '-hi' : '') + '.mp4';

export default function VoidIntro() {
  if (Platform.OS !== 'web') return null;

  var seen = useState(function () {
    try { return !!sessionStorage.getItem('void_intro_seen'); } catch (e) { return false; }
  });
  var [show, setShow] = useState(!seen[0]);
  var [entering, setEntering] = useState(false);
  var containerRef = useRef(null);

  if (!show) return null;

  var enter = function () {
    if (entering) return;
    setEntering(true);
    // Unlock + play the audio on this user gesture — the moment the edit's sound comes alive.
    try {
      var v = containerRef.current && containerRef.current.querySelector && containerRef.current.querySelector('video');
      if (v) { v.muted = false; v.volume = 1; var p = v.play && v.play(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) {}
    try { sessionStorage.setItem('void_intro_seen', '1'); } catch (e) {}
    // Fade out into the app; the audio plays through the fade as a "taste" of the stream.
    setTimeout(function () { setShow(false); }, 2400);
  };

  return (
    <Pressable
      onPress={enter}
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        Platform.OS === 'web' ? { transition: 'opacity 2.2s ease', cursor: 'pointer' } : null,
        entering ? { opacity: 0 } : { opacity: 1 },
      ]}
    >
      {/* The void stream, muted until tap */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{
          __html: '<video src="' + STREAM_URL + '" autoplay muted loop playsinline '
            + 'style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;'
            + 'opacity:0.55;filter:saturate(0.7) contrast(1.1) brightness(0.85);" />',
        }}
      />
      <View style={styles.scrim} />

      <View style={styles.center}>
        <Text style={styles.logo}>VOID<Text style={styles.logoTv}>tv</Text></Text>
        <Text style={styles.tagline}>before AI slop, there was human creativity</Text>
        <View style={[styles.enterBtn, { borderColor: BRAND_BLUE }]}>
          <Text style={[styles.enterText, { color: BRAND_BLUE }]}>
            {entering ? 'ENTERING…' : '▶  TAP TO ENTER THE VOID'}
          </Text>
        </View>
        {!entering ? <Text style={styles.sound}>♪ sound on</Text> : null}
      </View>
    </Pressable>
  );
}

var styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,12,15,0.45)' },
  center: { alignItems: 'center', paddingHorizontal: 24, zIndex: 2 },
  logo: { fontFamily: fonts.monoBold, fontSize: 56, letterSpacing: 8, color: colors.textPrimary },
  logoTv: { color: BRAND_BLUE, fontSize: 28, letterSpacing: 2 },
  tagline: {
    fontFamily: fonts.sans, fontSize: 13, color: 'rgba(228,226,220,0.7)',
    marginTop: 8, fontStyle: 'italic', textAlign: 'center',
  },
  enterBtn: {
    marginTop: 34, borderWidth: 1, borderRadius: 30,
    paddingVertical: 13, paddingHorizontal: 26,
    backgroundColor: 'rgba(12,12,15,0.5)',
  },
  enterText: { fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 2 },
  sound: { fontFamily: fonts.mono, fontSize: 10, color: 'rgba(228,226,220,0.45)', letterSpacing: 1.5, marginTop: 14 },
});
