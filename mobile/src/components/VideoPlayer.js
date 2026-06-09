import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, Dimensions,
  ActivityIndicator, Platform,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme";

const { width: SCREEN_W } = Dimensions.get("window");
const FADE_DURATION = 220;
const HIDE_DELAY = 4000;

export default forwardRef(function VideoPlayer({ videoUrl, title, onBack, onEnded, channelLabel }, ref) {
  const [error, setError] = useState(null);
  const [isFs, setIsFs] = useState(false);
  const hideTimer = useRef(null);
  const videoViewRef = useRef(null);
  const containerRef = useRef(null);
  const controlsVisible = useSharedValue(1);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.play();
  });

  // Track web fullscreen state so we can update the button + listen for Esc
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
          // Fullscreen the whole VideoPlayer container so our React controls remain visible
          const node = containerRef.current;
          if (node?.requestFullscreen) await node.requestFullscreen();
          else if (node?.webkitRequestFullscreen) node.webkitRequestFullscreen();
        }
      } catch (e) { console.warn("fullscreen failed", e); }
      return;
    }
    // Native mobile fullscreen
    videoViewRef.current?.enterFullscreen?.();
  }, []);

  // Expose enterFullscreen to parent via ref
  useImperativeHandle(ref, () => ({
    enterFullscreen: () => {
      if (Platform.OS === "web") {
        toggleFullscreen();
      } else {
        videoViewRef.current?.enterFullscreen?.();
      }
    },
  }), [toggleFullscreen]);

  // Subscribe to player events via expo's useEvent hook
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  // Status changes — capture errors
  useEffect(() => {
    if (status === "error") setError("Failed to load video. Tap to retry.");
    else setError(null);
  }, [status]);

  // Periodic time updates for the progress bar.
  // Also: position-restore guard. Some browsers reset HTML5 video currentTime to 0
  // on buffer underrun, which restarts the video. We track the last known good time
  // and restore it if we see an unexpected drop.
  const [tick, setTick] = useState(0);
  const lastGoodTimeRef = useRef(0);
  const userJustSeekedRef = useRef(false);
  const seekIntervalRef = useRef(null);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const cur = player.currentTime || 0;
      const last = lastGoodTimeRef.current;
      const dur = player.duration || 0;
      const nearEnd = dur > 0 && last > dur - 2; // video legitimately ended
      const isSeeking = userJustSeekedRef.current || !!seekIntervalRef.current;

      if (cur < 1 && last > 3 && !isSeeking && !nearEnd) {
        // Unexpected reset — restore
        try { player.currentTime = last; } catch {}
      } else if (cur > 1) {
        lastGoodTimeRef.current = cur;
      }
      if (userJustSeekedRef.current) userJustSeekedRef.current = false;
    }, 250);
    return () => clearInterval(id);
  }, [player]);

  // Listen for video end → notify parent (used for channel auto-advance)
  useEffect(() => {
    if (!onEnded) return;
    const sub = player.addListener("playToEnd", () => onEnded());
    return () => sub?.remove?.();
  }, [player, onEnded]);

  const position = player.currentTime || 0;
  const duration = player.duration || 1;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const isBuffering = status === "loading";
  const isLoaded = status === "readyToPlay";

  const controlsStyle = useAnimatedStyle(() => ({ opacity: controlsVisible.value }));

  const resetHideTimer = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (isPlaying) {
      hideTimer.current = setTimeout(() => {
        controlsVisible.value = withTiming(0, { duration: FADE_DURATION, easing: Easing.out(Easing.ease) });
      }, HIDE_DELAY);
    }
  }, [isPlaying]);

  const showControls = useCallback(() => {
    controlsVisible.value = withTiming(1, { duration: FADE_DURATION });
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [isPlaying, resetHideTimer]);


  const togglePlay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (player.playing) player.pause();
    else player.play();
    showControls();
  }, [player, showControls]);

  const seek = useCallback((pct) => {
    if (!isLoaded || !duration) return;
    userJustSeekedRef.current = true;
    const target = pct * duration;
    player.currentTime = target;
    lastGoodTimeRef.current = target;
  }, [player, isLoaded, duration]);

  const skipBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    userJustSeekedRef.current = true;
    const target = Math.max(0, (player.currentTime || 0) - 10);
    player.currentTime = target;
    lastGoodTimeRef.current = target;
    showControls();
  }, [player, showControls]);

  const skipForward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    userJustSeekedRef.current = true;
    const target = Math.min(duration, (player.currentTime || 0) + 30);
    player.currentTime = target;
    lastGoodTimeRef.current = target;
    showControls();
  }, [player, duration, showControls]);

  // Long-press continuous seek (left = rewind, right = fast-forward) — uses seekIntervalRef declared above
  const [seekDirection, setSeekDirection] = useState(0); // -1, 0, +1 — for the visual indicator

  const startSeek = useCallback((delta) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSeekDirection(delta > 0 ? 1 : -1);
    showControls();
    if (seekIntervalRef.current) clearInterval(seekIntervalRef.current);
    seekIntervalRef.current = setInterval(() => {
      const cur = player.currentTime || 0;
      const next = Math.max(0, Math.min(duration || cur + 100, cur + delta));
      player.currentTime = next;
    }, 100); // 100ms × delta seconds = ~20s of playback per real second
  }, [player, duration, showControls]);

  const stopSeek = useCallback(() => {
    if (seekIntervalRef.current) {
      clearInterval(seekIntervalRef.current);
      seekIntervalRef.current = null;
    }
    setSeekDirection(0);
  }, []);

  useEffect(() => () => stopSeek(), [stopSeek]);

  // Single tap = play/pause; double tap = toggle fullscreen.
  // 280ms window — tight enough to feel snappy, loose enough to catch double taps.
  const tapTimerRef = useRef(null);
  const lastTapRef = useRef(0);
  const handleVideoPress = useCallback(() => {
    const now = Date.now();
    const sinceLast = now - lastTapRef.current;
    lastTapRef.current = now;

    if (sinceLast < 280 && tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      toggleFullscreen();
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      togglePlay();
    }, 280);
  }, [togglePlay, toggleFullscreen]);

  useEffect(() => () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current); }, []);

  // ── Web-only: mouse-move shows controls, keyboard shortcuts ────────────
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onMouseMove = () => showControls();
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        skipForward();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        skipBack();
      } else if (e.key?.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [showControls, togglePlay, skipForward, skipBack, toggleFullscreen]);

  const retry = useCallback(() => {
    setError(null);
    try { player.replace(videoUrl); player.play(); } catch {}
  }, [player, videoUrl]);

  const formatTime = (sec) => {
    const total = Math.floor(sec || 0);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <View ref={containerRef} style={styles.container}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
        contentFit="contain"
        nativeControls={Platform.OS !== "web"}
        allowsPictureInPicture
        allowsFullscreen
      />

      {/* Custom touch zones + controls only on web. On mobile, the native iOS/Android
          player (nativeControls=true above) handles play/pause, skip, fullscreen, exit. */}
      {Platform.OS === "web" && (<>
      <View style={[StyleSheet.absoluteFill, styles.zones]} pointerEvents="box-none">
        <Pressable
          style={styles.zoneHalf}
          onPress={handleVideoPress}
          onLongPress={() => startSeek(-2)}
          onPressOut={stopSeek}
          delayLongPress={350}
        />
        <Pressable
          style={styles.zoneHalf}
          onPress={handleVideoPress}
          onLongPress={() => startSeek(2)}
          onPressOut={stopSeek}
          delayLongPress={350}
        />
      </View>

      {/* Seek indicator badge while long-pressing */}
      {seekDirection !== 0 && (
        <View style={[
          styles.seekBadge,
          seekDirection > 0 ? styles.seekBadgeRight : styles.seekBadgeLeft,
        ]} pointerEvents="none">
          <Ionicons
            name={seekDirection > 0 ? "play-forward" : "play-back"}
            size={26}
            color={colors.amber}
          />
          <Text style={styles.seekBadgeText}>
            {seekDirection > 0 ? "FAST FORWARD" : "REWIND"}
          </Text>
        </View>
      )}

      {/* Buffering */}
      {isBuffering && !error && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.amber} size="large" />
          <Text style={styles.bufferText}>BUFFERING...</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <TouchableOpacity style={styles.overlay} onPress={retry}>
          <Ionicons name="warning-outline" size={36} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
        </TouchableOpacity>
      )}

      {/* Controls */}
      {isLoaded && !error && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.controlsLayer, controlsStyle]} pointerEvents="box-none">
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="chevron-down" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleBlock}>
              {channelLabel ? (
                <View style={styles.channelTag}>
                  <View style={styles.channelDot} />
                  <Text style={styles.channelText}>{channelLabel}</Text>
                </View>
              ) : null}
              <Text style={styles.playerTitle} numberOfLines={1}>{title}</Text>
            </View>
            <TouchableOpacity onPress={toggleFullscreen} style={styles.fsBtn} hitSlop={8}>
              <Ionicons name={isFs ? "contract-outline" : "expand-outline"} size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.centerRow}>
            <TouchableOpacity onPress={skipBack} style={styles.skipBtn} activeOpacity={0.7} hitSlop={6}>
              <Ionicons name="play-back" size={22} color="#fff" />
              <Text style={styles.skipText}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={togglePlay} style={styles.centerPlay} activeOpacity={0.8}>
              <View style={styles.playCircle}>
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={26}
                  color={colors.bg}
                  style={isPlaying ? undefined : { marginLeft: 2 }}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={skipForward} style={styles.skipBtn} activeOpacity={0.7} hitSlop={6}>
              <Ionicons name="play-forward" size={22} color="#fff" />
              <Text style={styles.skipText}>30</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomBar}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <TouchableOpacity
              style={styles.progressWrap}
              activeOpacity={1}
              onPress={(e) => {
                const barWidth = SCREEN_W - 112;
                seek(Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth)));
              }}
            >
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
              </View>
            </TouchableOpacity>
            <Text style={[styles.timeText, styles.timeRight]}>{formatTime(duration)}</Text>
            <TouchableOpacity onPress={toggleFullscreen} style={styles.fsBtnBottom} hitSlop={6}>
              <Ionicons name={isFs ? "contract" : "scan-outline"} size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
      </>)}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
  zones: { flexDirection: "row" },
  zoneHalf: { flex: 1 },
  seekBadge: {
    position: "absolute",
    top: "50%",
    marginTop: -32,
    width: 130,
    paddingVertical: 16,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    alignItems: "center",
    gap: 6,
  },
  seekBadgeLeft: { left: 20 },
  seekBadgeRight: { right: 20 },
  seekBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.amber,
    letterSpacing: 1.5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)", gap: 12,
  },
  bufferText: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber, letterSpacing: 1.5 },
  errorText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, textAlign: "center", letterSpacing: 0.5, marginTop: 8 },
  controlsLayer: { justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.3)" },
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16, paddingBottom: 8, gap: 12,
  },
  backBtn: { padding: 4 },
  fsBtn: { padding: 4, marginLeft: 8 },
  fsBtnBottom: { padding: 4, marginLeft: 4 },
  titleBlock: { flex: 1, marginHorizontal: 8 },
  playerTitle: { fontFamily: fonts.sansMedium, fontSize: 14, color: "#fff" },
  channelTag: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  channelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ff2d78" },
  channelText: { fontFamily: fonts.monoBold, fontSize: 9, color: "#ff2d78", letterSpacing: 1.5 },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 36,
  },
  centerPlay: { alignSelf: "center" },
  playCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(245,166,35,0.9)",
    justifyContent: "center", alignItems: "center",
  },
  skipBtn: {
    width: 50, height: 50,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 25,
  },
  skipText: {
    position: "absolute",
    fontFamily: fonts.monoBold,
    fontSize: 9,
    color: "#fff",
    marginTop: 1,
  },
  bottomBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 40 : 20, gap: 8,
  },
  timeText: { fontFamily: fonts.mono, fontSize: 11, color: "rgba(255,255,255,0.75)", width: 40 },
  timeRight: { textAlign: "right" },
  progressWrap: { flex: 1, paddingVertical: 14 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, position: "relative" },
  progressFill: { height: "100%", backgroundColor: colors.amber, borderRadius: 2 },
  progressThumb: {
    position: "absolute", top: -5, width: 13, height: 13, borderRadius: 7,
    backgroundColor: colors.amber, marginLeft: -6,
  },
});
