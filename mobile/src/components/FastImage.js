/**
 * FastImage — "Out of the Void" loading effect.
 *
 * Web:    Animated TV static noise covers each thumbnail. When the real image
 *         loads, the noise dissolves away — the image materializes from static
 *         like a signal locking onto a channel. Uses CSS @keyframes + SVG
 *         feTurbulence via injected <style>, targeted through dataSet props.
 *
 * Native: Pulsing shimmer placeholder with per-card tint, crossfading to the
 *         real image on load. (CSS tricks aren't available on native.)
 *
 * NOTE: Uses RN built-in Animated (NOT Reanimated) to avoid TDZ crash in
 *       production bundles. All module-level vars use `var` for the same reason.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Platform, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";

// Use var (not let/const) at module scope to avoid TDZ in production bundles
var IS_WEB = Platform.OS === "web";

var TINT_PALETTE = [
  "rgba(245,166,35,0.08)",
  "rgba(255,45,120,0.08)",
  "rgba(0,229,255,0.06)",
  "rgba(181,102,255,0.08)",
  "rgba(178,255,62,0.06)",
  "rgba(255,87,34,0.08)",
];

function hashStr(s) {
  var h = 0;
  for (var i = 0; i < (s || "x").length; i++) {
    h = (h * 31 + (s || "x").charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h);
}

export default function FastImage(props) {
  var uri = props.uri;
  var itemId = props.itemId;
  var style = props.style;
  var priority = props.priority || "normal";
  var contentFit = props.contentFit || "cover";
  var children = props.children;

  var _loaded = useState(false);
  var loaded = _loaded[0];
  var setLoaded = _loaded[1];

  var _resolving = useState(false);
  var resolving = _resolving[0];
  var setResolving = _resolving[1];

  var shimmerOpacity = useRef(new Animated.Value(0.35)).current;
  var imgOpacity = useRef(new Animated.Value(0)).current;

  var tint = useMemo(
    function () { return TINT_PALETTE[hashStr(itemId) % TINT_PALETTE.length]; },
    [itemId]
  );

  // ── Web: inject TV-static CSS once globally ──
  useEffect(function () {
    if (!IS_WEB || typeof document === "undefined") return;
    var id = "void-static-css";
    if (document.getElementById(id)) return;

    var noise =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E" +
      "%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' " +
      "numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E" +
      "%3Crect width='200' height='200' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E";

    var s = document.createElement("style");
    s.id = id;
    s.textContent =
      "@keyframes voidStatic {" +
      "  0%   { background-position: 0 0; }" +
      "  20%  { background-position: -40px -25px; }" +
      "  40%  { background-position: 25px -45px; }" +
      "  60%  { background-position: -35px 30px; }" +
      "  80%  { background-position: 45px 15px; }" +
      "  100% { background-position: -15px -35px; }" +
      "}" +
      "@keyframes voidResolve {" +
      "  0%   { opacity: 1; }" +
      "  30%  { opacity: 0.45; }" +
      "  100% { opacity: 0; }" +
      "}" +
      '[data-void-noise="static"] {' +
      '  background-image: url("' + noise + '");' +
      "  background-repeat: repeat;" +
      "  animation: voidStatic 0.2s steps(4) infinite;" +
      "  will-change: background-position;" +
      "}" +
      '[data-void-noise="resolve"] {' +
      '  background-image: url("' + noise + '");' +
      "  animation: voidResolve 0.7s ease-out forwards;" +
      "}";
    document.head.appendChild(s);
  }, []);

  // ── Native: pulsing shimmer animation ──
  useEffect(function () {
    if (IS_WEB || loaded) return;
    var anim = Animated.loop(
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
    return function () { anim.stop(); };
  }, [loaded]);

  var onImageLoad = function () {
    if (IS_WEB) {
      setResolving(true);
      setTimeout(function () { setLoaded(true); }, 750);
    } else {
      setLoaded(true);
    }
    Animated.timing(imgOpacity, {
      toValue: 1,
      duration: IS_WEB ? 600 : 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: !IS_WEB,
    }).start();
  };

  return React.createElement(View, { style: [styles.container, style] },
    // Real image — fades in underneath the noise/shimmer
    React.createElement(Animated.View, { style: [StyleSheet.absoluteFill, { opacity: imgOpacity }] },
      React.createElement(Image, {
        source: { uri: uri },
        style: StyleSheet.absoluteFill,
        contentFit: contentFit,
        cachePolicy: "memory-disk",
        recyclingKey: itemId,
        priority: priority,
        onLoad: onImageLoad,
      })
    ),

    // Web: TV static noise overlay — dissolves to reveal image
    !loaded && IS_WEB
      ? React.createElement(View, {
          dataSet: { voidNoise: resolving ? "resolve" : "static" },
          style: [StyleSheet.absoluteFill, { backgroundColor: colors.card }],
        })
      : null,

    // Native: shimmer placeholder
    !loaded && !IS_WEB
      ? React.createElement(Animated.View, {
          style: [StyleSheet.absoluteFill, styles.shimmer, { opacity: shimmerOpacity }],
        },
          React.createElement(View, {
            style: [StyleSheet.absoluteFill, { backgroundColor: tint }],
          }),
          React.createElement(View, { style: styles.shimmerStripe })
        )
      : null,

    // Children (overlays like gradients, text) render on top
    children
  );
}

var styles = StyleSheet.create({
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
