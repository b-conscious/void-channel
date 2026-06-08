import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const BAR_COUNT = 20;
const MAX_BAR_H = 56;
const MIN_BAR_H = 4;
const BAR_W = 4;
const BAR_GAP = 3;

// Sine-wave phase offsets for each bar
const PHASES = Array.from({ length: BAR_COUNT }, (_, i) => (i / BAR_COUNT) * Math.PI * 2);

export default function WaveAvatar({ xpRatio = 0, accentColor = '#f5a623', size = 'default' }) {
  const anims = useRef(PHASES.map(() => new Animated.Value(0))).current;
  const amplitude = 0.25 + xpRatio * 0.75; // grows with XP
  const barCount = size === 'small' ? 12 : BAR_COUNT;
  const maxH = size === 'small' ? 32 : MAX_BAR_H;

  useEffect(() => {
    const animations = anims.map((anim, i) => {
      const duration = 900 + i * 30; // each bar slightly different speed
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: false }),
          Animated.timing(anim, { toValue: 0, duration, useNativeDriver: false }),
        ])
      );
    });
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, []);

  const totalW = barCount * (BAR_W + BAR_GAP) - BAR_GAP;

  return (
    <View style={[styles.container, { width: totalW }]}>
      {Array.from({ length: barCount }).map((_, i) => {
        const phase = PHASES[i % PHASES.length];
        // Natural amplitude varies across bars like a sine wave
        const naturalAmp = 0.4 + Math.sin(phase) * 0.6;
        const heightAnim = anims[i % anims.length].interpolate({
          inputRange: [0, 1],
          outputRange: [
            MIN_BAR_H,
            Math.max(MIN_BAR_H + 2, maxH * amplitude * naturalAmp),
          ],
        });
        const opacity = 0.4 + naturalAmp * amplitude * 0.6;

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                width: BAR_W,
                height: heightAnim,
                backgroundColor: accentColor,
                opacity,
                marginRight: i < barCount - 1 ? BAR_GAP : 0,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: MAX_BAR_H + 8,
  },
  bar: {
    borderRadius: 2,
  },
});
