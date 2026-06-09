import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import FastImage from './FastImage';
import { useGeneration } from '../context/GenerationContext';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, radius, cardSize } from '../theme';

// Vibe tag bg colors — same palette across all generations, labels change
const VIBE_BG = [
  '#ff2d78', '#b2ff3e', '#00e5ff', '#b566ff',
  '#f5a623', '#ff5722', '#ffb830', '#b2ff3e',
  '#00e5ff', '#ff2d78', '#b2ff3e', '#b566ff',
  '#ff2d78', '#00e5ff', '#b566ff',
];
const VIBE_TEXT = [
  '#fff',    '#000',    '#000',    '#fff',
  '#000',    '#fff',    '#000',    '#000',
  '#000',    '#fff',    '#000',    '#fff',
  '#fff',    '#000',    '#fff',
];

function getVibeIndex(id) {
  let h = 0;
  for (const ch of (id || 'x')) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return Math.abs(h);
}

const SPRING = { damping: 18, stiffness: 320, mass: 0.7 };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MediaCard({ item, onPress, size = 'default', style }) {
  const [hearted, setHearted] = useState(false);
  const scale = useSharedValue(1);
  const heartScale = useSharedValue(1);
  const { gen } = useGeneration();

  // Load heart state from local storage on mount
  useEffect(() => {
    store.isHearted(item.id).then(setHearted);
  }, [item.id]);

  const toggleHeart = useCallback(async () => {
    const next = !hearted;
    setHearted(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Pop animation
    heartScale.value = withSequence(
      withTiming(1.4, { duration: 110 }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    // Persist locally
    await store.setHearted(item.id, next);
    // Sync to server (fire-and-forget; UI doesn't wait)
    try {
      if (next) await api.heartItem(item);
      else await api.unheartItem(item.id);
    } catch (e) {
      // Silently fail — local state stays. We could implement retry/reconciliation later.
      console.warn('[heart sync]', e?.message);
    }
  }, [hearted, item]);

  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const vibes = gen?.vibes || [];
  const vibeIdx = getVibeIndex(item.id);
  const vibeLabel = vibes.length > 0 ? vibes[vibeIdx % vibes.length].label : 'WEIRD';
  const vibeBg   = VIBE_BG[vibeIdx % VIBE_BG.length];
  const vibeTextColor = VIBE_TEXT[vibeIdx % VIBE_TEXT.length];

  const W = Dimensions.get('window').width;
  const w = size === 'hero' ? W - 36 : size === 'large' ? 240 : cardSize.width;
  const h = size === 'hero' ? Math.round((W - 36) * 0.58) : size === 'large' ? 152 : cardSize.height;

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;

  // Format runtime seconds → "1:23" or "1:02:15"
  const durationLabel = React.useMemo(() => {
    const sec = item.runtime;
    if (!sec || sec <= 0) return null;
    const s = Math.round(sec);
    if (s >= 3600) {
      const hh = Math.floor(s / 3600);
      const mm = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  }, [item.runtime]);

  return (
    <AnimatedPressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(item); }}
      onPressIn={() => { scale.value = withSpring(0.94, SPRING); }}
      onPressOut={() => { scale.value = withSpring(1, SPRING); }}
      style={[{ width: w, marginRight: cardSize.gap }, animStyle, style]}
    >
      <FastImage
        uri={item.thumbnail}
        itemId={item.id}
        style={[styles.card, { width: w, height: h }]}
        priority={size === 'hero' ? 'high' : 'normal'}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(12,12,15,0.88)']}
          locations={[0.25, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Vibe tag */}
        <View style={[styles.vibeTag, { backgroundColor: vibeBg }]}>
          <Text style={[styles.vibeText, { color: vibeTextColor }]}>{vibeLabel}</Text>
        </View>

        {/* Duration + Year — top right */}
        <View style={styles.topRight}>
          {durationLabel ? (
            <View style={styles.durationChip}>
              <Text style={styles.durationText}>{durationLabel}</Text>
            </View>
          ) : null}
          {item.year ? (
            <View style={styles.yearChip}>
              <Text style={styles.yearText}>{item.year}</Text>
            </View>
          ) : null}
        </View>

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          {creator ? <Text style={styles.creator} numberOfLines={1}>{creator}</Text> : null}
        </View>

        {/* Heart — separate touch target so it doesn't trigger card navigation */}
        <TouchableOpacity
          onPress={toggleHeart}
          style={styles.heartBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Animated.View style={heartAnimStyle}>
            <Ionicons
              name={hearted ? "heart" : "heart-outline"}
              size={20}
              color={hearted ? "#ff3b5c" : "#fff"}
              style={styles.heartIcon}
            />
          </Animated.View>
        </TouchableOpacity>
      </FastImage>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  vibeTag: {
    position: 'absolute', top: 7, left: 7,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 2,
  },
  vibeText: { fontFamily: fonts.monoBold, fontSize: 8, letterSpacing: 0.4 },
  topRight: {
    position: 'absolute', top: 7, right: 7,
    flexDirection: 'row', gap: 4, alignItems: 'center',
  },
  durationChip: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2,
  },
  durationText: { fontFamily: fonts.mono, fontSize: 9, color: '#fff', letterSpacing: 0.3 },
  yearChip: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2,
  },
  yearText: { fontFamily: fonts.mono, fontSize: 9, color: colors.amber, letterSpacing: 0.3 },
  titleBlock: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 9 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: '#fff', lineHeight: 14 },
  creator: { fontFamily: fonts.sans, fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  heartBtn: {
    position: 'absolute',
    bottom: 6, right: 6,
    width: 30, height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartIcon: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
