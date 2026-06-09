import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { colors, radius, cardSize } from "../theme";

export default function SkeletonCard({ width, height }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const w = width || cardSize.width;
  const h = height || cardSize.height;

  return (
    <View style={[styles.container, { width: w, marginRight: cardSize.gap }]}>
      <Animated.View style={[styles.card, { width: w, height: h, opacity }]} />
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
