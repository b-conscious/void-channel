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
const HIDE_DELAY = 1000; // B 2026-06-11: controls clear in 1s, lean-back wins

// Touch devices get the YouTube-mobile gesture vocabulary (double-tap halves = skip ±);
// fine-pointer devices keep desktop muscle memory (double-click = fullscreen, arrows = seek).
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(pointer: coarse)').matches
  : Platform.OS !== 'web';

// ── Web autoplay gesture tracking ──────────────────────────
// Browsers block autoplay-WITH-AUDIO until the user has interacted with the page.
// We start the first video muted (so it autoplays instantly), then restore sound on
// the first interaction. Once any gesture happens, subsequent videos can start unmuted.
let _webHasGesture = false;
// JOB_19: an INSTALLED PWA (standalone display) is granted audible autoplay by Chrome,
// so it counts as the gesture from the first frame — installed users open INTO sound.
if (Platform.OS === "web" && typeof window !== "undefined"
    && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
  _webHasGesture = true;
}
if (Platform.OS === "web" && typeof window !== "undefined") {
  const mark = (e) => { if (e && e.isTrusted) _webHasGesture = true; };
  ["pointerdown", "keydown", "touchend"].forEach((t) =>
    window.addEventListener(t, mark, { passive: true })
  );
}

// VHS CLEAN (the viable half of B's cleaner): composite-level CSS filter on the video
// subtree only — no canvas, no CORS taint, so it works on Archive-served media app-wide.
// LOW = tone only; MED/HIGH add an SVG sharpen kernel. The audio half stays parked
// (cross-origin audio is silenced by Web Audio; see the watchlist).
const CLEAN_LEVELS = ['OFF', 'LOW', 'MED', 'HIGH'];
function injectCleanDefs() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('void-vhs-clean-defs')) return;
  const host = document.createElement('div');
  host.id = 'void-vhs-clean-defs';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  host.innerHTML = `
<svg width="0" height="0">
  <filter id="void-sharpen-soft"><feConvolveMatrix order="3" kernelMatrix="0 -0.25 0 -0.25 2 -0.25 0 -0.25 0" preserveAlpha="true"/></filter>
  <filter id="void-sharpen"><feConvolveMatrix order="3" kernelMatrix="0 -0.5 0 -0.5 3 -0.5 0 -0.5 0" preserveAlpha="true"/></filter>
</svg>
<style>
[data-vhsclean="1"]{filter:contrast(1.05) saturate(1.07) brightness(1.01)}
[data-vhsclean="2"]{filter:url(#void-sharpen-soft) contrast(1.08) saturate(1.1) brightness(1.02)}
[data-vhsclean="3"]{filter:url(#void-sharpen) contrast(1.12) saturate(1.13) brightness(1.03)}
</style>`;
  document.body.appendChild(host);
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
function ProgressBar({ progress, position, duration, onSeek, isFs, toggleFullscreen, showControls, formatTime, rate, onCycleRate, cleanLevel, onCycleClean, hasCaptions, ccOn, onToggleCC }) {
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
      {/* Captions toggle — only when this item actually has a sidecar track */}
      {hasCaptions && (
        <TouchableOpacity onPress={onToggleCC} style={styles.rateBtn} hitSlop={6}>
          <Text style={[styles.rateText, ccOn && { color: colors.amber }]}>CC</Text>
        </TouchableOpacity>
      )}
      {/* VHS CLEAN cycle: OFF → LOW → MED → HIGH (composite CSS filter, web only) */}
      <TouchableOpacity onPress={onCycleClean} style={styles.rateBtn} hitSlop={6}>
        <Text style={[styles.rateText, cleanLevel > 0 && { color: colors.amber }]}>
          {cleanLevel > 0 ? `CLN ${CLEAN_LEVELS[cleanLevel]}` : 'CLN'}
        </Text>
      </TouchableOpacity>
      {/* Playback-speed cycle: 1 → 1.25 → 1.5 → 2 → 0.5 */}
      <TouchableOpacity onPress={onCycleRate} style={styles.rateBtn} hitSlop={6}>
        <Text style={[styles.rateText, rate !== 1 && { color: colors.amber }]}>
          {rate % 1 === 0 ? `${rate}×` : `${rate}×`.replace('0.', '.')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={toggleFullscreen} style={styles.fsBtnBottom} hitSlop={6}>
        <Ionicons name={isFs ? "contract" : "scan-outline"} size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default forwardRef(function VideoPlayer({ videoUrl, title, onBack, onEnded, onVideoError, channelLabel, captionUrl, captionLang }, ref) {
  const [error, setError] = useState(null);
  const [isFs, setIsFs] = useState(false);
  // VHS CLEAN level (0-3), persisted per device. Filter defs inject once below.
  const [cleanLevel, setCleanLevel] = useState(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return 0;
    const v = parseInt(localStorage.getItem('@void_vhs_clean'), 10);
    return v >= 1 && v <= 3 ? v : 0;
  });
  useEffect(() => { injectCleanDefs(); }, []);
  const cycleClean = useCallback(() => {
    setCleanLevel((l) => {
      const n = (l + 1) % CLEAN_LEVELS.length;
      try { localStorage.setItem('@void_vhs_clean', String(n)); } catch {}
      return n;
    });
  }, []);
  // CAPTIONS (layer 1): CC on/off, persisted. ccOnRef lets the track-attach callback read the
  // latest toggle without re-running the (expensive) fetch+attach effect.
  const [ccOn, setCcOn] = useState(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return false;
    return localStorage.getItem('@void_cc') === '1';
  });
  const ccOnRef = useRef(ccOn);
  ccOnRef.current = ccOn;
  const toggleCC = useCallback(() => {
    setCcOn((v) => {
      const n = !v;
      try { localStorage.setItem('@void_cc', n ? '1' : '0'); } catch {}
      return n;
    });
  }, []);
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
    const onMediaError = () => {
      if (attemptSilentRetry()) return;
      setError("Failed to load video.");
      onVideoError && onVideoError();
    };
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
          // Buffer from the moment the page opens, not from the first tap — browsers default
          // to preload=metadata, which leaves the stream cold until play() is pressed.
          el.preload = "auto";
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

  // CAPTIONS (layer 1) — attach a sidecar subtitle track. We fetch the same-origin VTT from our
  // backend (ACAO:* lets the web app read it cross-origin), wrap it in a blob: URL, and feed THAT
  // to <track>. A blob: URL is same-origin to the document, so the browser renders cues natively
  // WITHOUT needing `crossorigin` on the <video> (which would risk tainting IA playback).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !captionUrl) return;
    let cancelled = false, blobUrl = null, videoEl = null, iv = null, stop = null;
    const clearTracks = (el) => el && el.querySelectorAll('track[data-voidcc="1"]').forEach((t) => t.remove());
    fetch(captionUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("cc " + r.status))))
      .then((vtt) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
        const attach = (el) => {
          clearTracks(el);
          const tr = document.createElement("track");
          tr.kind = "subtitles";
          tr.label = (captionLang || "en").toUpperCase();
          tr.srclang = captionLang || "en";
          tr.default = true;
          tr.src = blobUrl;
          tr.setAttribute("data-voidcc", "1");
          el.appendChild(tr);
          // The TextTrack registers a beat after the element mounts — apply the current toggle then.
          const apply = () => {
            const tt = el.textTracks && el.textTracks[el.textTracks.length - 1];
            if (tt) tt.mode = ccOnRef.current ? "showing" : "hidden";
          };
          tr.addEventListener("load", apply);
          setTimeout(apply, 50);
        };
        iv = setInterval(() => {
          const el = document.querySelector('[data-vpcontainer="1"] video');
          if (el && el !== videoEl) { videoEl = el; attach(el); clearInterval(iv); }
        }, 250);
        stop = setTimeout(() => clearInterval(iv), 5000);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
      if (stop) clearTimeout(stop);
      clearTracks(videoEl);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [captionUrl, captionLang]);

  // Flip the attached track on/off when the CC toggle changes (no re-fetch).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const el = document.querySelector('[data-vpcontainer="1"] video');
    if (!el || !el.textTracks) return;
    for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = ccOn ? "showing" : "hidden";
  }, [ccOn]);

  const toggleFullscreen = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
          // Fullscreen THIS instance's container via its own ref. The global
          // [data-vpcontainer] selector could grab a dead prior player's node (expo-video
          // does not release <video> on web), making engage a silent no-op.
          const node = (containerRef.current && containerRef.current.requestFullscreen !== undefined)
            ? containerRef.current
            : document.querySelector('[data-vpcontainer="1"]');
          if (!node) { console.warn('fullscreen: container node not found'); return; }
          if (node.requestFullscreen) await node.requestFullscreen();
          else if (node.webkitRequestFullscreen) node.webkitRequestFullscreen();
          else {
            // iOS Safari has NO element-fullscreen API — fall back to the video element's
            // native fullscreen (native controls take over; rotation handled by iOS).
            const v = node.querySelector ? node.querySelector('video') : null;
            if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
            else console.warn('fullscreen: no API available on this browser');
          }
        }
      } catch (e) { console.warn("fullscreen failed", e); }
      return;
    }
    // Native mobile fullscreen
    videoViewRef.current?.enterFullscreen?.();
  }, []);

  // ── Picture-in-Picture (web) ──────────────────────────────────────────
  const pipSupported = Platform.OS === 'web' && typeof document !== 'undefined' &&
    (document.pictureInPictureEnabled ||
     (typeof HTMLVideoElement !== 'undefined' && HTMLVideoElement.prototype.webkitSetPresentationMode));
  const togglePiP = useCallback(async () => {
    try {
      const scope = (containerRef.current && containerRef.current.querySelector) ? containerRef.current : document;
      const v = scope.querySelector('video') || document.querySelector('[data-vpcontainer="1"] video');
      if (!v) return;
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
      else if (v.webkitSetPresentationMode) {
        v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      }
    } catch (e) {}
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

  // Silent retry ladder: IA first-bytes can take 3-10s and transient errors are common.
  // Before showing ANY error or bubbling onVideoError, retry the SAME source up to twice
  // (2s, then 4s). Pre-play only — mid-play errors keep the no-hop overlay behavior.
  const silentRetryRef = useRef(0);
  const retryTimerRef = useRef(null);
  const attemptSilentRetry = useCallback(() => {
    const everPlayed = lastGoodTimeRef.current > 1.5;
    if (everPlayed || silentRetryRef.current >= 2) return false;
    silentRetryRef.current += 1;
    const delay = silentRetryRef.current * 2000;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      try { player.replace(videoUrl); player.play(); } catch (e) {}
    }, delay);
    return true;
  }, [player, videoUrl]);

  // New source = clean slate for errors and the ladder; also kill any pending retry.
  useEffect(() => {
    setError(null);
    silentRetryRef.current = 0;
    return () => clearTimeout(retryTimerRef.current);
  }, [videoUrl]);

  // Status changes — capture errors (after the silent ladder is exhausted)
  useEffect(() => {
    if (status === "error") {
      if (attemptSilentRetry()) return;
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

  // ── Playback speed ─────────────────────────────────────────────────────
  // Hold-to-fast-forward (the TikTok/Shorts pattern): long-press = 2× while held, release
  // restores the user's chosen rate. The cycle button in the progress bar sets that base rate.
  const [holdSpeed, setHoldSpeed] = useState(false);
  const [rate, setRate] = useState(1);
  const userRateRef = useRef(1);

  const applyRate = useCallback((r) => {
    try { player.playbackRate = r; } catch (e) {}
  }, [player]);

  const startHoldSpeed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHoldSpeed(true);
    applyRate(2);
  }, [applyRate]);

  const endHoldSpeed = useCallback(() => {
    setHoldSpeed(false);
    applyRate(userRateRef.current);
  }, [applyRate]);

  const cycleRate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const RATES = [1, 1.25, 1.5, 2, 0.5];
    const idx = RATES.indexOf(userRateRef.current);
    const next = RATES[(idx + 1) % RATES.length];
    userRateRef.current = next;
    setRate(next);
    applyRate(next);
    showControls();
  }, [applyRate, showControls]);

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
    // Tap/click on the bar sets volume. RN-web press events carry NO locationX (it was NaN,
    // which made the slider a dead placeholder, B 2026-06-11): on web derive X from pageX
    // against the bar's live rect, and use the real width instead of the styled constant.
    const ne = e.nativeEvent || {};
    let x = ne.locationX;
    let barW = 80;
    if (Platform.OS === 'web' && e.currentTarget && e.currentTarget.getBoundingClientRect) {
      const rect = e.currentTarget.getBoundingClientRect();
      barW = rect.width || barW;
      const pageX = ne.pageX != null ? ne.pageX
        : (ne.changedTouches && ne.changedTouches[0] && ne.changedTouches[0].pageX);
      if (pageX != null) x = pageX - rect.left;
    }
    if (x == null || isNaN(x)) return;
    const pct = Math.max(0, Math.min(1, x / barW));
    setVolume(pct);
    try { player.volume = pct; } catch {}
    if (pct > 0 && muted) { setMuted(false); try { player.muted = false; } catch {} }
    if (pct === 0 && !muted) { setMuted(true); try { player.muted = true; } catch {} }
    showControls();
  }, [player, muted, showControls]);

  useEffect(() => () => clearTimeout(volHideTimer.current), []);

  // Single tap = play/pause. Double tap is PER ZONE: on touch, left = −10s / right = +30s
  // (YouTube-mobile vocabulary); on fine pointers, double-click = fullscreen (desktop muscle memory).
  // 280ms window — tight enough to feel snappy, loose enough to catch double taps.
  const tapTimerRef = useRef(null);
  const lastTapRef = useRef(0);
  const lastTapSideRef = useRef(null);
  const handleZoneTap = useCallback((side) => {
    const now = Date.now();
    const isDouble = now - lastTapRef.current < 280 && lastTapSideRef.current === side && tapTimerRef.current;
    lastTapRef.current = now;
    lastTapSideRef.current = side;
    if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }

    if (isDouble) {
      if (IS_TOUCH) (side === 'left' ? skipBack() : skipForward());
      else toggleFullscreen();
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      togglePlay();
    }, 280);
  }, [togglePlay, toggleFullscreen, skipBack, skipForward]);

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
      {/* VHS CLEAN wraps ONLY the video subtree — controls/overlays stay unfiltered */}
      <View
        style={StyleSheet.absoluteFill}
        dataSet={Platform.OS === 'web' ? { vhsclean: String(cleanLevel) } : undefined}
      >
        <VideoView
          ref={videoViewRef}
          player={player}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
          contentFit="contain"
          nativeControls={Platform.OS !== "web"}
          allowsPictureInPicture
          allowsFullscreen
        />
      </View>

      {/* Custom touch zones + controls only on web. On mobile, the native iOS/Android
          player (nativeControls=true above) handles play/pause, skip, fullscreen, exit. */}
      {Platform.OS === "web" && (<>
      <View style={[StyleSheet.absoluteFill, styles.zones, { pointerEvents: 'box-none' }]}>
        <Pressable
          style={styles.zoneHalf}
          onPress={() => handleZoneTap('left')}
          onLongPress={startHoldSpeed}
          onPressOut={endHoldSpeed}
          delayLongPress={350}
        />
        <Pressable
          style={styles.zoneHalf}
          onPress={() => handleZoneTap('right')}
          onLongPress={startHoldSpeed}
          onPressOut={endHoldSpeed}
          delayLongPress={350}
        />
      </View>

      {/* 2× indicator while holding (TikTok-style hold-to-speed) */}
      {holdSpeed && (
        <View style={[styles.seekBadge, styles.seekBadgeRight, { pointerEvents: 'none' }]}>
          <Ionicons name="play-forward" size={26} color={colors.amber} />
          <Text style={styles.seekBadgeText}>2× SPEED</Text>
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
            {/* Picture-in-Picture (where the browser supports it) */}
            {pipSupported ? (
              <TouchableOpacity onPress={togglePiP} style={styles.volBtn} hitSlop={8}>
                <Ionicons name="browsers-outline" size={18} color="#fff" />
              </TouchableOpacity>
            ) : null}
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
              {/* B 2026-06-11 "fill this out": the slider was a 2s flash after keyboard
                  nudges; on web it now lives permanently beside mute. Tap/click sets level. */}
              {(Platform.OS === 'web' || showVolSlider) && (
                <Pressable onPress={handleVolSliderPress} style={styles.volSlider}>
                  <View style={styles.volSliderBg}>
                    <View style={[styles.volSliderFill, { width: `${(muted ? 0 : volume) * 100}%` }]} />
                  </View>
                </Pressable>
              )}
            </View>

            {/* Fullscreen button is in the bottom progress bar — removed duplicate here */}
          </View>

          {/* Chrome reduction: the 10/30 skip buttons are gone — double-tap zones (touch),
              arrow keys (desktop), and hold-for-2× cover seeking with twice the video real estate. */}
          <View style={styles.centerRow}>
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
            rate={rate}
            onCycleRate={cycleRate}
            cleanLevel={cleanLevel}
            onCycleClean={cycleClean}
            hasCaptions={!!captionUrl}
            ccOn={ccOn}
            onToggleCC={toggleCC}
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
  rateBtn: { paddingHorizontal: 6, paddingVertical: 4, minWidth: 38, alignItems: 'center' },
  rateText: { fontFamily: fonts.monoBold, fontSize: 12, color: '#fff', letterSpacing: 0.5 },
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
