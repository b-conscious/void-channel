/**
 * FastImage — shimmer placeholder + crossfade for instant visual feedback.
 *
 * Shows a pulsing tinted placeholder the instant the card mounts,
 * then crossfades to the real thumbnail when it finishes loading.
 * No dead space, no blank rectangles — every card has visible content immediately.
 *
 * Works on web AND native (no blurhash dependency).
 * NOTE: Uses RN built-in Animated instead of Reanimated to avoid TDZ crash in prod bundles.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Platform, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";

// Derive a subtle tint color from the item id so each card shimmer is unique
const TINT_PALETTE = [
  "rgba(245,166,35,0.08)",   // amber
  "rgba(255,45,120,0.08)",   // pink
  "rgba(0,229,255,0.06)",    // cyan
  "rgba(181,102,255,0.08)",  // purple
  "rgba(178,255,62,0.06)",   // green
  "rgba(255,87,34,0.08)",    // orange
];

function hashStr(s) {
  let h = 0;
  for (const c of s || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return Math.abs(h);
}

export default function FastImage({
  uri,
  itemId,
  style,
  priority = "normal",
  contentFit = "cover",
  children,
}) {
  const [loaded, setLoaded] = useState(false);
  const shimmerOpacity = useRef(new Animated.Value(0.35)).current;
  const imgOpacity = useRef(new Animated.Value(0)).current;
  const tint = useMemo(
    () => TINT_PALETTE[hashStr(itemId) % TINT_PALETTE.length],
    [itemId]
  );

  // Pulsing shimmer animation
  useEffect(() => {
    if (loaded) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerOpacity, {
          toValue: 0.7,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerOpacity, {
          toValue: 0.35,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [loaded]);

  const onImageLoad = () => {
    setLoaded(true);
    Animated.timing(imgOpacity, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.container, style]}>
      {/* Shimmer placeholder — always behind the image */}
      {!loaded && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.shimmer, { opacity: shimmerOpacity }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
          {/* Gradient stripe that pulses across */}
          <View style={styles.shimmerStripe} />
        </Animated.View>
      )}

      {/* Real image — fades in when loaded */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: imgOpacity }]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={itemId}
          priority={priority}
          onLoad={onImageLoad}
        />
      </Animated.View>

      {/* Children (overlays like gradients, text) render on top */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  shimmer: {
    backgroundColor: colors.card,
  },
  shimmerStripe: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "30%",
    width: "40%",
    backgroundColor: "rgba(255,255,255,0.03)",
    transform: [{ skewX: "-12deg" }],
  },
});
