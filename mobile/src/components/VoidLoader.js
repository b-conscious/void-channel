/**
 * VoidLoader — Branded loading placeholder for VOIDtv.
 *
 * Drop-in replacement for empty space while content loads.
 * Supports three modes:
 *   1. Custom animation (GIF/image) — pass `source` prop
 *   2. Default: pulsing VOID text with breathing glow
 *   3. Inline: small spinner with optional label text
 *
 * Usage:
 *   <VoidLoader />                          — default pulsing VOID logo
 *   <VoidLoader source={require('./anim.gif')} />  — custom animation
 *   <VoidLoader size="small" label="tuning in..." />  — inline with text
 *   <VoidLoader size="card" />              — card-sized placeholder
 *   <VoidLoader size="row" />               — full-width row placeholder
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, Easing, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { colors, fonts, radius, cardSize } from '../theme';

var BRAND_BLUE = '#5cb8ff';

export default function VoidLoader({ source, size, label, accent, style }) {
  var color = accent || BRAND_BLUE;

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
});
