import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, Dimensions,
  ActivityIndicator, Platform, Animated, Easing as RNEasing,
} from "react-native";
// NOTE: Removed react-native-reanimated — useAnimatedStyle causes TDZ crash in prod bundles.
// Using RN built-in Animated API for controls fade.
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme";


const { width: SCREEN_W } = Dimensions.get("window");
const FADE_DURATION = 220;
const HIDE_DELAY = 4000;

// ── Web autoplay gesture tracking ──────────────────────────
// Browsers block autoplay-WITH-AUDIO until the user has interacted with the page.
// We start the first video muted (so it autoplays instantly), then restore sound on
// the first interaction. Once any gesture happens, subsequent videos can start unmuted.
let _webHasGesture = false;
if (Platform.OS === "web" && typeof window !== "undefined") {
  const mark = (e) => { if (e && e.isTrusted) _webHasGesture = true; };
  ["pointerdown", "keydown", "touchend"].forEach((t) =>
    window.addEventListener(t, mark, { passive: true })
  );
}

/** Format seconds → "3:07" or "1:02:15" */
function formatTime(sec) {
  const total = Math.floor(sec || 0);
  if (total >= 3600) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Scrubable progress bar — supports tap-to-seek AND drag-to-scrub.
 * Uses native DOM pointer events on web (PanResponder is unreliable there).
 */
function ProgressBar({ progress, position, duration, onSeek, isFs, toggleFullscreen, showControls, formatTime }) {
  const barRef = useRef(null);
  const barWidth = useRef(200);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState(0);

  const onBarLayout = useCallback((e) => {
    barWidth.current = e.nativeEvent.layout.width;
  }, []);

  // --- Web: attach real DOM pointer events for reliable scrub ---
  // Uses data attribute + document.querySelector because RN Web refs don't expose DOM nodes directly
  const barId = useRef(`vp-bar-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    // Wait for DOM to mount
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-barid="${barId}"]`);
      if (!el) return;

      let dragging = false;

      const pctFromEvent = (e) => {
        const rect = el.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      };

      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        el.setPointerCapture(e.pointerId);
        setScrubbing(true);
        setScrubProgress(pctFromEvent(e));
        showControls();
      };

      const onMove = (e) => {
        if (!dragging) return;
        e.preventDefault();
        setScrubProgress(pctFromEvent(e));
      };

      const onUp = (e) => {
        if (!dragging) return;
        dragging = false;
        onSeek(pctFromEvent(e));
        setScrubbing(false);
      };

      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", () => { dragging = false; setScrubbing(false); });

      barRef.current = { _cleanup: () => {
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
      }};
    }, 500);

    return () => {
      clearTimeout(timer);
      if (barRef.current?._cleanup) barRef.current._cleanup();
    };
  }, [onSeek, showControls, barId]);

  const displayProgress = scrubbing ? scrubProgress : progress;
  const displayTime = scrubbing ? scrubProgress * duration : position;

  return (
    <View style={styles.bottomBar}>
      <Text style={styles.timeText}>{formatTime(displayTime)}</Text>
      <View
        ref={barRef}
        dataSet={{barid: barId}}
        style={styles.progressWrap}
        onLayout={onBarLayout}
      >
        {/* Expanded hit area — the visible bar is inside */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${displayProgress * 100}%` }]} />
        </View>
        {/* Thumb — bigger when scrubbing */}
        <View style={[
          styles.progressThumb,
          { left: `${displayProgress * 100}%` },
          scrubbing && styles.progressThumbActive,
        ]} />
      </View>
      <Text style={[styles.timeText, styles.timeRight]}>{formatTime(duration)}</Text>
      <TouchableOpacity onPress={toggleFullscreen} style={styles.fsBtnBottom} hitSlop={6}>
        <Ionicons name={isFs ? "contract" : "scan-outline"} size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default forwardRef(function VideoPlayer({ videoUrl, title, onBack, onEnded, onVideoError, channelLabel }, ref) {
  const [error, setError] = useState(null);
  const [isFs, setIsFs] = useState(false);
  const [volume, setVolume] = useState(1);        // 0–1
  // On web, start muted IF the user hasn't interacted yet — lets the video autoplay
  // immediately instead of sitting paused. We auto-restore sound on first interaction.
  const [muted, setMuted] = useState(Platform.OS === "web" && !_webHasGesture);
  const userMutedRef = useRef(false); // true only if the user explicitly muted
  const [showVolSlider, setShowVolSlider] = useState(false);
  const hideTimer = useRef(null);
  const volHideTimer = useRef(null);
  const videoViewRef = useRef(null);
  const containerRef = useRef(null);
  const controlsVisible = useRef(new Animated.Value(1)).current;
  // Mounted/visible state for the controls layer. The opacity animation alone left the layer
  // mounted at opacity 0 OVER the <video> — which (a) re-rendered with every progress tick and
  // (b) kept the video off the browser's fast compositing path → visible stutter in fullscreen.
  // When hidden, the layer now unmounts entirely and progress ticks stop re-rendering.
  const [controlsShown, setControlsShown] = useState(true);
  const controlsShownRef = useRef(true);
  controlsShownRef.current = controlsShown;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    // Muted autoplay is always allowed; play with sound only if a gesture already happened.
    if (Platform.OS === "web") p.muted = !_webHasGesture;
    p.play();
  });

  // Belt + braces: expo-video doesn't reliably release the <video> on web, so a swapped/unmounted
  // player could keep playing AUDIO with no picture (the "ghost audio" after fullscreen glitches).
  // Explicitly pause the outgoing player whenever it changes or the component unmounts.
  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    return () => { try { player.pause(); } catch (e) {} };
  }, [player]);

  // ── Web: restore sound on the first user interaction after a muted autoplay ──
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!muted) return;            // already has sound
    let done = false;
    const unmute = (e) => {
      if (done || (e && !e.isTrusted)) return; // only real user gestures restore sound
      done = true;
      _webHasGesture = true;
      if (!userMutedRef.current) {
        setMuted(false);
        try { player.muted = false; } catch {}
        try { player.play(); } catch {}
      }
    };
    window.addEventListener("pointerdown", unmute, { once: true });
    window.addEventListener("keydown", unmute, { once: true });
    window.addEventListener("touchend", unmute, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unmute);
      window.removeEventListener("keydown", unmute);
      window.removeEventListener("touchend", unmute);
    };
  }, [muted, player]);

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

  // Hide native browser <video> controls via CSS injection.
  // This is global + idempotent — no DOM node resolution needed (getDOMNode is unreliable on RN Web).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const styleId = "vp-hide-native-controls";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      "video::-webkit-media-controls { display: none !important; }",
      "video::-webkit-media-controls-enclosure { display: none !important; }",
      "video::-webkit-media-controls-panel { display: none !important; }",
      "video::-webkit-media-controls-overlay-play-button { display: none !important; }",
      "video::-moz-range-track { display: none !important; }",
      "video { pointer-events: none !important; }",
    ].join("\n");
    document.head.appendChild(style);
  }, []);

  // Web backstop: catch native <video> load failures (e.g. NotSupportedError for non-H.264
  // sources). expo-video sometimes surfaces these only as an uncaught promise rejection, not a
  // statusChange — so we attach directly to the player's <video> element and report the error.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let videoEl = null;
    const onMediaError = () => { setError("Failed to load video."); onVideoError && onVideoError(); };
    // The <video> mounts asynchronously; poll briefly until it's there, then attach once.
    const iv = setInterval(() => {
      const el = document.querySelector('[data-vpcontainer="1"] video');
      if (el && el !== videoEl) {
        videoEl = el;
        // Force INLINE playback on mobile web — without playsinline, iOS Safari forces
        // every video into fullscreen. These attributes keep it playing in the page.
        try {
          el.setAttribute("playsinline", "true");
          el.setAttribute("webkit-playsinline", "true");
          el.playsInline = true;
        } catch (e) {}
        el.addEventListener("error", onMediaError);
        clearInterval(iv);
      }
    }, 250);
    const stop = setTimeout(() => clearInterval(iv), 5000);
    return () => {
      clearInterval(iv);
      clearTimeout(stop);
      if (videoEl) videoEl.removeEventListener("error", onMediaError);
    };
  }, [onVideoError, videoUrl]);

  const toggleFullscreen = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
          // Fullscreen the whole VideoPlayer container so our React controls remain visible
          const node = document.querySelector('[data-vpcontainer="1"]');
          if (node?.requestFullscreen) await node.requestFullscreen();
          else if (node?.webkitRequestFullscreen) node.webkitRequestFullscreen();
          else {
            // iOS Safari has NO element-fullscreen API — fall back to the video element's
            // native fullscreen (native controls take over; rotation handled by iOS).
            const v = node ? node.querySelector('video') : null;
            if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
          }
        }
      } catch (e) { console.warn("fullscreen failed", e); }
      return;
    }
    // Native mobile fullscreen
    videoViewRef.current?.enterFullscreen?.();
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    enterFullscreen: () => {
      if (Platform.OS === "web") {
        toggleFullscreen();
      } else {
        videoViewRef.current?.enterFullscreen?.();
      }
    },
    getCurrentTime: () => player.currentTime || 0,
    getDuration: () => player.duration || 0,
    seekTo: (sec) => {
      userJustSeekedRef.current = true;
      player.currentTime = sec;
      lastGoodTimeRef.current = sec;
    },
    play: () => { try { player.play(); } catch {} },
    pause: () => { try { player.pause(); } catch {} },
  }), [toggleFullscreen, player]);

  // Subscribe to player events via expo's useEvent hook
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  // Status changes — capture errors
  useEffect(() => {
    if (status === "error") {
      setError("Failed to load video. Tap to retry.");
      onVideoError?.();
    } else {
      setError(null);
    }
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
      // Re-render for the progress bar only while the controls are on screen — when they're
      // hidden nothing consumes `position`, and a 4Hz re-render over the video causes stutter.
      if (controlsShownRef.current) setTick((t) => t + 1);
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

  const controlsStyle = { opacity: controlsVisible };

  const resetHideTimer = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (isPlaying) {
      hideTimer.current = setTimeout(() => {
        Animated.timing(controlsVisible, { toValue: 0, duration: FADE_DURATION, easing: RNEasing.out(RNEasing.ease), useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
          // Fade complete → unmount the layer so the bare <video> gets the fast path.
          if (finished) setControlsShown(false);
        });
      }, HIDE_DELAY);
    }
  }, [isPlaying]);

  const showControls = useCallback(() => {
    // Already visible (the common case — e.g. EVERY mousemove lands here): just push the hide
    // timer back. Spawning a new JS-driven Animated.timing per mousemove was animation churn.
    if (controlsShownRef.current) { resetHideTimer(); return; }
    setControlsShown(true);
    setTick((t) => t + 1); // refresh position immediately so the bar doesn't show a stale time
    Animated.timing(controlsVisible, { toValue: 1, duration: FADE_DURATION, useNativeDriver: Platform.OS !== 'web' }).start();
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

  // ── Volume controls ──
  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !muted;
    userMutedRef.current = next; // remember explicit intent so auto-unmute won't override
    setMuted(next);
    try { player.muted = next; } catch {}
    showControls();
  }, [muted, player, showControls]);

  const changeVolume = useCallback((delta) => {
    setVolume((prev) => {
      const next = Math.max(0, Math.min(1, prev + delta));
      try { player.volume = next; } catch {}
      if (next > 0 && muted) { setMuted(false); try { player.muted = false; } catch {} }
      return next;
    });
    setShowVolSlider(true);
    clearTimeout(volHideTimer.current);
    volHideTimer.current = setTimeout(() => setShowVolSlider(false), 2000);
    showControls();
  }, [player, muted, showControls]);

  const handleVolSliderPress = useCallback((e) => {
    // Tap on volume bar to set volume directly
    const nativeX = e.nativeEvent.locationX;
    const barW = 80; // matches style width
    const pct = Math.max(0, Math.min(1, nativeX / barW));
    setVolume(pct);
    try { player.volume = pct; } catch {}
    if (pct > 0 && muted) { setMuted(false); try { player.muted = false; } catch {} }
    showControls();
  }, [player, muted, showControls]);

  useEffect(() => () => clearTimeout(volHideTimer.current), []);

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
      } else if (e.key?.toLowerCase() === "m") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        changeVolume(0.1);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        changeVolume(-0.1);
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [showControls, togglePlay, skipForward, skipBack, toggleFullscreen, toggleMute, changeVolume]);

  const retry = useCallback(() => {
    setError(null);
    try { player.replace(videoUrl); player.play(); } catch {}
  }, [player, videoUrl]);

  return (
    <View ref={containerRef} dataSet={{vpcontainer: "1"}} style={styles.container}>
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
      <View style={[StyleSheet.absoluteFill, styles.zones, { pointerEvents: 'box-none' }]}>
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
          { pointerEvents: 'none' },
        ]}>
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
        <View style={[styles.overlay, { pointerEvents: 'none' }]}>
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

      {/* Controls — fully unmounted when hidden (not just opacity 0) so the video composites alone */}
      {isLoaded && !error && controlsShown && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.controlsLayer, controlsStyle, { pointerEvents: 'box-none' }]}>
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
            {/* Volume control */}
            <View style={styles.volumeWrap}>
              <TouchableOpacity
                onPress={toggleMute}
                onLongPress={() => { setShowVolSlider((v) => !v); showControls(); }}
                style={styles.volBtn}
                hitSlop={8}
                delayLongPress={300}
              >
                <Ionicons
                  name={muted || volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-low" : "volume-high"}
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>
              {showVolSlider && (
                <Pressable onPress={handleVolSliderPress} style={styles.volSlider}>
                  <View style={styles.volSliderBg}>
                    <View style={[styles.volSliderFill, { width: `${(muted ? 0 : volume) * 100}%` }]} />
                  </View>
                </Pressable>
              )}
            </View>

            {/* Fullscreen button is in the bottom progress bar — removed duplicate here */}
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

          <ProgressBar
            progress={progress}
            position={position}
            duration={duration}
            onSeek={seek}
            isFs={isFs}
            toggleFullscreen={toggleFullscreen}
            showControls={showControls}
            formatTime={formatTime}
          />
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
  // Volume
  volumeWrap: { flexDirection: "row", alignItems: "center" },
  volBtn: { padding: 4, marginLeft: 4 },
  volSlider: {
    width: 80, height: 28, justifyContent: "center",
    marginLeft: 4,
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  },
  volSliderBg: {
    height: 4, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden",
  },
  volSliderFill: { height: "100%", backgroundColor: colors.amber, borderRadius: 2 },
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
  progressWrap: {
    flex: 1,
    height: 36,                       // tall touch target
    justifyContent: "center",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
    zIndex: 20,                       // above video element
    position: "relative",
  },
  progressBg: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.amber, borderRadius: 2 },
  progressThumb: {
    position: "absolute",
    top: 36 / 2 - 7,                 // vertically center in the 36px touch area
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.amber,
    marginLeft: -7,
    // Subtle shadow for visibility
    boxShadow: '0px 1px 2px rgba(0,0,0,0.5)',
    elevation: 3,
  },
  progressThumbActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    top: 36 / 2 - 10,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: colors.amber,
  },
});
