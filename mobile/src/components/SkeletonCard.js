import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors, radius, cardSize } from "../theme";

export default function SkeletonCard({ width, height }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const w = width || cardSize.width;
  const h = height || cardSize.height;

  return (
    <View style={[styles.container, { width: w, marginRight: cardSize.gap }]}>
      <Animated.View style={[styles.card, { width: w, height: h }, animStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
});
