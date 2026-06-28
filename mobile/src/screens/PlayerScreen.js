import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator, Linking, Alert, Animated, Dimensions, LayoutAnimation,
  Platform, UIManager, Share, TextInput, useWindowDimensions,
} from 'react-native';
// (SidebarContext not needed here — the persistent top bar is hidden on the Player.)
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';
const IS_DESKTOP = IS_WEB && SCREEN_W > 900;
// Share/clip links point at the APP host (www.voidtv.net), NOT api.voidtv.net (whose /watch page is
// an OG-embed that bounces to the Archive, so shared links would not play - tester report). On web
// that is the live origin; native falls back to the production site.
const APP_ORIGIN = (IS_WEB && typeof window !== 'undefined' && window.location && window.location.origin)
  ? window.location.origin
  : 'https://www.voidtv.net';
// YouTube-style layout constants — NAV_W is dynamic via SidebarContext (see component body)
const SIDEBAR_W = IS_DESKTOP ? 360 : 0;

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from '../components/FastImage';
import VideoPlayer from '../components/VideoPlayer';
import { VoidLoader } from '../components';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import { useGeneration } from '../context/GenerationContext';
import { useKids } from '../context/KidsContext';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, radius } from '../theme';

// ── Relative time (e.g. "2 min ago", "3h ago", "yesterday") ──
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ── X-Ray field config ──
const XRAY_FIELDS = [
  { type: 'cast',     label: 'Cast',      icon: 'people-outline',   placeholder: 'Actor name' },
  { type: 'director', label: 'Director',   icon: 'film-outline',     placeholder: 'Director name' },
  { type: 'writer',   label: 'Writer',     icon: 'create-outline',   placeholder: 'Writer name' },
  { type: 'trivia',   label: 'Trivia',     icon: 'bulb-outline',     placeholder: 'Fun fact about this film...' },
  { type: 'context',  label: 'Context',    icon: 'book-outline',     placeholder: 'Historical context...' },
  { type: 'tag',      label: 'Tag',        icon: 'pricetag-outline', placeholder: 'e.g. noir, educational, propaganda' },
  { type: 'warning',  label: 'Warning',    icon: 'warning-outline',  placeholder: 'Content warning...' },
  { type: 'year',     label: 'Year',       icon: 'calendar-outline', placeholder: 'Corrected year, e.g. 1954' },
];

// ── Clean broadcast titles for sidebar display ──
// "DW News : DW : June 9, 2026 4:00am-4:02am CEST" → "DW News : DW"
// "PRESSTV : June 9, 2026 5:30am-6:00am IRST" → "PRESSTV"
const DATE_RE = /\s*:?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\s+\d{1,2}:\d{2}.*/i;
const MAX_TITLE_LEN = 90; // hard cap so runaway Archive titles can't blow out layout
function cleanTitle(title) {
  if (!title) return '';
  // Archive titles are usually strings but can come back as a multi-valued array — take the first.
  const raw = Array.isArray(title) ? (title[0] || '') : String(title);
  let cleaned = raw.replace(DATE_RE, '').replace(/\s*:\s*$/, '').trim();
  cleaned = cleaned || raw;
  // Never render a contentless title (e.g. social-mirror items literally titled "!"). Require at
  // least one letter/number in ANY script so real non-Latin titles survive; punctuation-only drops.
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return '';
  if (cleaned.length > MAX_TITLE_LEN) cleaned = cleaned.slice(0, MAX_TITLE_LEN - 1).trimEnd() + '…';
  return cleaned;
}

// Series guess from a raw title — the client twin of the spine's grouping parseTitle.
// "Celebrity DeathMatch Season 1-6" -> "Celebrity DeathMatch". Lets the MORE OF THIS SHOW
// rail work the FIRST time anyone opens a show from raw search, before the spine has
// grouped (the ingest catches it up for everyone after).
function seriesGuessFromTitle(title) {
  const t = Array.isArray(title) ? (title[0] || '') : String(title || '');
  const PATTERNS = [
    /^(.*?)[\s._-]*s(?:eason)?[\s._-]*\d{1,2}[\s._-]*e(?:p(?:isode)?)?[\s._-]*\d{1,3}\b/i,
    /^(.*?)[\s._-]*\b\d{1,2}x\d{1,3}\b/i,
    /^(.*?)[\s._-]*\bseason[\s._-]*\d/i,
    /^(.*?)[\s._-]*\b(?:episode|ep)[\s._-]*\d/i,
    /^(.*?)\s*[-–—:]\s*(?:the\s+)?complete\b/i,
  ];
  for (const re of PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const name = m[1].replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').replace(/[\s:;,]+$/, '').trim();
    if (name.replace(/[^a-z0-9]/gi, '').length >= 3) return name;
  }
  return null;
}

// A candidate only counts as a show-mate if its title actually carries the show's name
// (same token-overlap guard as the kids resolver — no "Bill Nye" grabbing Ghostbusters).
function titleHasTokens(name, title) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const n = norm(name);
  if (!n.length) return false;
  const t = new Set(norm(Array.isArray(title) ? title[0] : title));
  return n.filter((w) => t.has(w)).length / n.length >= 0.6;
}

// Open a share target reliably across platforms.
// On MOBILE WEB the FB/X "sharer" universal links get intercepted by the installed app, which
// opens its home feed and drops the link — so we hand off to the native share sheet
// (navigator.share), which always carries the URL. DESKTOP web opens the web composer in a new
// tab (never handing off to an app). Native builds use the OS Linking handler.
function shareTo({ platform, url, text }) {
  const intent =
    platform === 'twitter'
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text || '')}&url=${encodeURIComponent(url)}`
      : platform === 'reddit'
      ? `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text || '')}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const isMobileWeb = !!nav && /Mobi|Android|iPhone|iPad|iPod/i.test(nav.userAgent || '');
    const canNativeShare = !!nav && typeof nav.share === 'function' &&
      (typeof nav.canShare !== 'function' || nav.canShare({ url }));
    if (isMobileWeb && canNativeShare) {
      nav.share({ title: 'VOIDtv', text, url }).catch(() => {});
      return;
    }
    const w = window.open(intent, '_blank', 'noopener,noreferrer');
    if (!w) { try { window.location.href = intent; } catch (e) {} }
    return;
  }
  Linking.openURL(intent).catch(() => {});
}

export default function PlayerScreen({ route, navigation }) {
  const params = route.params || {};
  // Deep-link support: /watch/:id only provides params.id, no full item object.
  // Normal navigation passes a full item object. Handle both.
  const stub = params.item || { id: params.id, title: '', thumbnail: null };
  const { categoryId, queue, queueIndex, channelLabel, channelCatIds, channelPage, startAtSeconds, liveSync } = params;
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const NAV_MARGIN = 0; // top bar is hidden on the Player — full-bleed, no left offset
  const sceneW = windowW - NAV_MARGIN;                            // actual scene width
  // Desktop: shrink the video player, give the freed space to the channel/related videos.
  // Channel list takes ~58% of the width; the player column is the remainder (~40%).
  // Video is the DOMINANT column (~62%); the related sidebar is the narrower rail (~36%). This was
  // backwards (video 40% / related 58%), which made the player open looking like the related grid.
  const SIDE_W = IS_DESKTOP ? Math.max(300, Math.round(sceneW * 0.36)) : 0;
  const AVAILABLE_W = IS_DESKTOP ? Math.max(360, sceneW - SIDE_W - 6) : windowW; // the video column
  const VIDEO_H = IS_WEB
    ? Math.min(Math.round(AVAILABLE_W * 9 / 16), Math.round(SCREEN_H * 0.75))
    : Math.round(SCREEN_H * 0.42);
  const { gen } = useGeneration();
  const { kidsMode } = useKids();
  const { onWatchItem, onContribute, XP_REWARDS } = useGame();
  const { user, isAuthenticated } = useAuth();
  const accent = gen.accentColor;
  const inChannel = Array.isArray(queue) && queue.length > 0;
  // THE DIAL: real channel surfing shows static between channels. The overlay covers the
  // player from tune-in until the mid-scene seek lands, then cuts to picture like a TV.
  const [tuningStatic, setTuningStatic] = useState((!!startAtSeconds && startAtSeconds >= 5) || !!liveSync);

  // ── Infinite channel pagination: pre-fetch next batch before the queue runs out ──
  // Like doom-scrolling — the user never sees a loading state, content is always ready.
  // Each PlayerScreen mount checks the remaining buffer and fetches ahead if low.
  const liveQueueRef = useRef(queue || []);
  const livePageRef = useRef(channelPage || 1);
  const fetchingMoreRef = useRef(false);

  useEffect(() => {
    if (!inChannel || !channelCatIds?.length) return;
    // Reset refs from route params (in case they grew from a previous mount)
    liveQueueRef.current = queue || [];
    livePageRef.current = channelPage || 1;

    var currentIdx = queueIndex ?? 0;
    var remaining = liveQueueRef.current.length - currentIdx - 1;

    // Keep a buffer of ~10 items ahead — start fetching when under 10 remaining
    if (remaining < 10 && !fetchingMoreRef.current) {
      fetchingMoreRef.current = true;
      var nextPage = livePageRef.current + 1;
      api.getChannelQueue(channelCatIds, 25, nextPage)
        .then(function (result) {
          var newItems = (result && result.items) || [];
          if (newItems.length > 0) {
            // Dedupe against existing queue
            var existing = new Set(liveQueueRef.current.map(function (i) { return i.id; }));
            var unique = newItems.filter(function (i) { return !existing.has(i.id); });
            if (unique.length > 0) {
              liveQueueRef.current = liveQueueRef.current.concat(unique);
              livePageRef.current = nextPage;
            }
          }
        })
        .catch(function () {})
        .finally(function () { fetchingMoreRef.current = false; });
    }
  }, []); // Run once on mount

  // ── THE DIAL: tune-in lands mid-scene. One-shot seek to the clock-derived offset as soon
  // as the player can seek. Never re-seeks (a retry or recovery resuming at the live position
  // would jump the viewer); polls because VideoPlayer exposes imperatives, not an onReady.
  // liveSync (kids time-travel TV): the seek target is derived from the video's ACTUAL
  // duration once known, so a 3-hour tape with no runtime metadata still positions correctly
  // to the clock. Everyone tuning in at the same minute lands on the same frame.
  const dialSeekDoneRef = useRef(false);
  useEffect(() => {
    const wantsSeek = liveSync || (startAtSeconds && startAtSeconds >= 5);
    if (!wantsSeek || dialSeekDoneRef.current) return;
    var tries = 0;
    // Static safety cap: never block the picture longer than 8s even if readiness never fires
    var cap = setTimeout(function () { setTuningStatic(false); }, 8000);
    var t = setInterval(function () {
      var v = videoRef.current;
      if (++tries > 66) { clearInterval(t); setTuningStatic(false); return; } // give up after ~20s
      if (!v || !v.seekTo) return;
      var d = (v.getDuration && v.getDuration()) || 0;
      var ct = (v.getCurrentTime && v.getCurrentTime()) || 0;
      if (!(d > 0) && !(ct > 0)) return; // stream not ready yet
      // liveSync needs the real duration to mod the clock into it; plain dial uses the fixed offset
      var target = liveSync ? (d > 0 ? Math.floor((Date.now() / 1000) % d) : -1) : startAtSeconds;
      if (liveSync && target < 0) return; // wait for duration
      // Near-end guard: when the real runtime is shorter than the scheduled slot, start over
      // instead of seeking into the last seconds (auto-advance would instantly hop).
      if (!(d > 0) || target < d - 10) v.seekTo(target);
      dialSeekDoneRef.current = true;
      clearInterval(t);
      // One beat for the seeked frame to land, then hard-cut from static to picture
      setTimeout(function () { setTuningStatic(false); }, 350);
    }, 300);
    return function () { clearInterval(t); clearTimeout(cap); };
  }, [startAtSeconds, liveSync]);

  // Guard: if no item ID (bad deep link like /watch/ with no id), go home
  useEffect(() => {
    if (!stub.id) {
      navigation.replace('Main');
    }
  }, [stub.id, navigation]);

  // Safe goBack — if deep-linked directly to /watch/:id there's no history,
  // so fall back to home screen instead of crashing.
  const safeGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  }, [navigation]);

  // The top-left VOIDtv logo ENDS viewing: stop the video (so no audio keeps playing) and return
  // straight to the main Browse wall — NOT goBack, which in a rabbit hole lands on the previous video.
  const endViewing = useCallback(() => {
    try { videoRef.current?.pause?.(); } catch {}
    navigation.navigate('Main', { screen: 'Browse' });
  }, [navigation]);

  // Stop playback whenever the player loses focus or unmounts — clicking Browse / a tab / back left the
  // audio playing because expo-video doesn't reliably release the <video> on web. This catches EVERY
  // exit path, not just the logo.
  useEffect(() => {
    const stop = () => { try { videoRef.current?.pause?.(); } catch {} };
    const unsub = navigation.addListener('blur', stop);
    return () => { unsub(); stop(); };
  }, [navigation]);

  // No more optimistic <id>_512kb.mp4 guessing: modern uploads have no such derivative, so
  // the guess spammed NotSupportedError and read as a broken episode (B's DBZ report). The
  // Spine's cached item resolution is sub-second warm; the tuning static covers the wait.
  const [item, setItem] = useState(stub);
  const [videoUrl, setVideoUrl] = useState(stub.videoUrl || null);
  const [videoReady, setVideoReady] = useState(!!stub.videoUrl); // true if we have a confirmed URL
  const [loading, setLoading] = useState(false); // no longer blocks the whole screen
  const [error, setError] = useState(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [hearted, setHearted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localUri, setLocalUri] = useState(null);
  const [xpToast, setXpToast] = useState(null);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  // MORE OF THIS SHOW (slice 32): the verified series this item belongs to, episodes in
  // order. Ref mirrors state so the (deps-frozen) sidebar filter handler reads it live.
  const [seriesInfo, setSeriesInfo] = useState(null);
  const seriesRef = useRef(null);
  const [xrayData, setXrayData] = useState({});
  const [xrayTotal, setXrayTotal] = useState(0);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [contributeType, setContributeType] = useState('cast');
  const [contributeValue, setContributeValue] = useState('');
  const [contributeExtra, setContributeExtra] = useState('');
  const [contributing, setContributing] = useState(false);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [rabbitExpanded, setRabbitExpanded] = useState(false);
  // Sidebar filter: 'all' | 'col:collectionName' | 'creator:name'
  const [sidebarFilter, setSidebarFilter] = useState('all');
  const [filteredItems, setFilteredItems] = useState([]);
  const [filteredLoading, setFilteredLoading] = useState(false);
  const watchStartSent = useRef(false);
  const xpOpacity = useRef(new Animated.Value(0)).current;
  const xpFired = useRef(false);
  const videoRef = useRef(null);

  // When the current video ends, advance to next item (channel queue or autoplay related).
  // Uses the live queue ref which may have grown via pre-fetch — infinite channel pagination.
  // Advance to the next item (channel queue or autoplay → related). Returns true if it moved.
  const advanceToNext = useCallback(() => {
    if (inChannel) {
      // Use the live queue (may be extended by pre-fetch) instead of the original route param queue
      var currentQueue = liveQueueRef.current.length > 0 ? liveQueueRef.current : (queue || []);
      var nextIndex = (queueIndex ?? 0) + 1;
      // If we've reached the end and have no more items, wrap around
      if (nextIndex >= currentQueue.length) nextIndex = 0;
      var nextItem = currentQueue[nextIndex];
      if (nextItem) {
        navigation.replace("Player", {
          item: nextItem, id: nextItem.id,
          queue: currentQueue,
          queueIndex: nextIndex,
          categoryId, channelLabel,
          channelCatIds: channelCatIds,    // pass through for next mount's pre-fetch
          channelPage: livePageRef.current, // pass the latest page so next mount knows where we are
        });
        return true;
      }
      return false;
    }
    if (autoplay && relatedItems.length > 0) {
      navigation.replace("Player", { item: relatedItems[0], id: relatedItems[0].id });
      return true;
    }
    return false;
  }, [inChannel, queue, queueIndex, categoryId, channelLabel, channelCatIds, navigation, autoplay, relatedItems]);

  const handleVideoEnded = useCallback(() => {
    // Fire "complete" watch event
    api.sendWatchEvent({
      item_id: stub.id, item_title: stub.title,
      category_id: categoryId || null,
      event_type: 'complete', watch_percent: 100,
    }).catch(() => {});
    advanceToNext();
  }, [stub, categoryId, advanceToNext]);

  // Inject skeleton pulse keyframes on web
  useEffect(() => {
    if (!IS_WEB || typeof document === 'undefined') return;
    const id = 'skeleton-pulse-css';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes skeletonPulse { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
      [data-skeleton] { animation: skeletonPulse 1.2s ease-in-out infinite; }
    `;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!stub.id) return; // Guard: no ID = nothing to load
    let cancelled = false;
    const cleanupTimers = []; // track all setTimeout IDs for cleanup

    // Phase 1: local checks (instant) — run in parallel with network
    Promise.all([
      store.getLocalVideo(stub.id),
      store.isInWatchlist(stub.id),
      store.isHearted(stub.id),
    ]).then(([local, saved, isFav]) => {
      if (cancelled) return;
      if (local) { setLocalUri(local); setVideoUrl(local); }
      setInWatchlist(saved);
      setHearted(isFav);
    });

    // Phase 2: full metadata (network) — video plays optimistically while this loads
    (async () => {
      try {
        const full = await api.getItem(stub.id);
        if (cancelled) return;

        const merged = {
          ...full,
          downloads: typeof full.downloads === 'number' ? full.downloads : stub.downloads,
        };
        setItem(merged);

        // Use the fast (low-quality) URL immediately
        if (full.videoUrl) {
          setVideoUrl((prev) => prev === full.videoUrl ? prev : full.videoUrl);
          setVideoReady(true);
        } else if (!videoUrl) {
          setError('No video stream available.');
        }

        // NOTE: We intentionally do NOT auto-upgrade to videoUrlHQ. Swapping the source
        // mid-playback forces expo-video to reload + re-buffer the bigger file, and on web
        // the re-play() is blocked by autoplay policy (no fresh gesture) → the video stalls
        // and appears to "need a click". Staying on the fast low-bitrate stream gives instant,
        // uninterrupted playback. (videoUrlHQ remains available for a future manual quality toggle.)

        await store.addToHistory(merged);

        // Fire XP event once per mount
        if (!xpFired.current) {
          xpFired.current = true;
          const result = await onWatchItem(merged, categoryId || null);
          if (result?.xpGained > 0) showXpToast(result.xpGained);
        }

        // Record view + watch event + fetch rabbit hole + X-Ray data in background
        api.recordView(stub.id, {
          title: merged.title, thumbnail: merged.thumbnail,
          creator: typeof merged.creator === 'string' ? merged.creator : merged.creator?.[0],
          year: merged.year,
        }).then((v) => { if (v?.views) setViewCount(v.views); }).catch(() => {});
        if (!watchStartSent.current) {
          watchStartSent.current = true;
          api.sendWatchEvent({
            item_id: stub.id, item_title: merged.title,
            item_thumbnail: merged.thumbnail, item_creator: merged.creator?.[0] || merged.creator,
            item_year: merged.year, category_id: categoryId || null,
            event_type: 'start', watch_percent: 0,
          }).catch(() => {});
        }
        // ── Progressive loading: prioritize video, defer everything else ──
        // Tier 2 (~4s): sidebar / rabbit hole — below the fold on desktop
        const relatedTimer = setTimeout(() => {
          if (cancelled) return;
          if (!kidsMode) {
            api.getRelated(stub.id, 20).then(setRelatedItems).catch(() => {}).finally(() => setRelatedLoading(false));
            // MORE OF THIS SHOW: series membership rail. Verified grouping when the spine
            // knows the item; otherwise a live TITLE GUESS + search, so the rail works the
            // first time anyone digs a show out of raw search (B's Celebrity DeathMatch flow).
            api.getItemSeries(stub.id).then((d) => {
              if (cancelled) return;
              const info = d && d.series ? { key: d.series.key, name: d.series.name, items: d.items || [] } : null;
              // A verified group always wins; never null-overwrite a live guess already shown.
              if (info || !seriesRef.current) { seriesRef.current = info; setSeriesInfo(info); }
            }).catch(() => {});
          }
          else setRelatedLoading(false);
        }, 4000);
        cleanupTimers.push(relatedTimer);

        // Tier 3 (~10s): comments + x-ray — far below fold, lowest priority
        const deferTimer = setTimeout(() => {
          if (cancelled) return;
          setCommentsLoading(true);
          if (!kidsMode) api.getComments(stub.id).then((c) => {
            if (!cancelled) setComments(c.comments || []);
          }).catch(() => {}).finally(() => {
            if (!cancelled) setCommentsLoading(false);
          });
          api.getXRay(stub.id).then((xray) => {
            if (xray && !cancelled) {
              setXrayData(xray.contributions || {});
              setXrayTotal(xray.total || 0);
            }
          }).catch(() => {});
        }, 10000);
        cleanupTimers.push(deferTimer);
      } catch (err) {
        if (cancelled) return;
        console.error('[PlayerScreen]', err);
        // Only show error if we don't have an optimistic URL playing
        if (!videoUrl) setError('Could not load video details.');
      }
    })();

    return () => {
      cancelled = true;
      cleanupTimers.forEach(clearTimeout);
    };
  }, [stub.id]);

  function showXpToast(amount) {
    setXpToast(`+${amount} XP`);
    Animated.sequence([
      Animated.timing(xpOpacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(1800),
      Animated.timing(xpOpacity, { toValue: 0, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }

  const videoSource = localUri || videoUrl;

  // CAPTIONS (layer 1): if the resolved item advertised a sidecar subtitle file, pick one
  // (prefer English) and hand the player a same-origin VTT URL. null = no CC button shown.
  const captionTrack = (() => {
    const caps = item.captions;
    if (!Array.isArray(caps) || caps.length === 0) return null;
    const pick = caps.find((c) => c.lang === 'en') || caps[0];
    if (!pick || !pick.file) return null;
    return { url: api.getCaptionUrl(item.id, pick.file), lang: pick.lang || 'en' };
  })();

  // If the optimistic URL fails, fall back to the confirmed URL from metadata
  const triedHQRef = useRef(false);
  const skippedRef = useRef(false);
  // LIVE SERIES GUESS: when no verified grouping exists, derive the show name from the
  // RESOLVED item title (route stubs from deep links carry no title) and search for
  // show-mates. Runs once per item; a verified group arriving later always overrides.
  const guessTriedRef = useRef(null);
  useEffect(() => {
    if (kidsMode || seriesInfo || !item?.title || guessTriedRef.current === item.id) return;
    guessTriedRef.current = item.id;
    const guess = seriesGuessFromTitle(item.title);
    if (!guess) return;
    api.searchItems(`"${guess}"`, { rows: 16 }).then((res) => {
      const hits = (res?.items || res || [])
        .filter((h) => h && h.id && h.id !== item.id && titleHasTokens(guess, h.title))
        .slice(0, 10);
      if (hits.length && !seriesRef.current) {
        const ginfo = { key: null, name: guess, items: hits, guessed: true };
        seriesRef.current = ginfo;
        setSeriesInfo(ginfo);
      }
    }).catch(() => {});
  }, [item, seriesInfo, kidsMode]);

  // Kept for the error handler's pre-ready branch (a stub-provided URL can still fail early).
  const preReadyErrorRef = useRef(false);
  // Adopt the confirmed URL the moment metadata lands. With no optimistic guess the player
  // starts with videoUrl null, so this effect — not an error recovery — is the normal path
  // from tuning static to picture.
  useEffect(() => {
    if (!videoReady && item.videoUrl && item.videoUrl !== videoUrl) {
      preReadyErrorRef.current = false;
      setVideoUrl(item.videoUrl);
      setVideoReady(true);
    }
  }, [item.videoUrl, videoReady, videoUrl]);
  const handleVideoError = useCallback(() => {
    // Mid-play errors must NEVER hop to a different video (Bryan: "a selected video starts
    // playing and then it jumps to another, unprompted"). A stream that already played real
    // seconds is having a transient Archive hiccup — leave the player's "tap to retry" overlay
    // instead of swapping sources or auto-advancing. (The old hop also unmounted the player
    // mid-fullscreen → force-exited fullscreen with ghost audio.) Channels keep auto-advance —
    // doom-scroll must never get stuck on a dead stream.
    const playedSec = videoRef.current?.getCurrentTime?.() || 0;
    if (playedSec > 1.5 && !inChannel) return;

    // Recovery 1: the optimistic guessed URL failed → use the confirmed URL from metadata.
    if (!videoReady && item.videoUrl && item.videoUrl !== videoUrl) {
      console.log('[PlayerScreen] Optimistic URL failed, falling back to confirmed URL');
      setVideoUrl(item.videoUrl);
      setVideoReady(true);
      return;
    }
    // Metadata hasn't resolved yet: the optimistic `_512kb.mp4` guess commonly 404s before
    // getItem() returns. Do NOT skip/advance here — that's what made the player jump to a
    // *different* video the instant you tapped one. Wait; Recovery 1 retries the confirmed URL.
    if (!videoReady && !item.videoUrl) {
      preReadyErrorRef.current = true; // metadata not here yet — the effect above resumes us
      return;
    }
    // Recovery 2: confirmed URL failed → try the HQ derivative once (different encode/codec).
    if (!triedHQRef.current && item.videoUrlHQ && item.videoUrlHQ !== videoUrl) {
      triedHQRef.current = true;
      console.log('[PlayerScreen] Confirmed URL failed, trying HQ derivative');
      setVideoUrl(item.videoUrlHQ);
      return;
    }
    // Unrecoverable: this item has no browser-playable source (e.g. non-H.264 MP4 / .ogv).
    // Skip exactly once so a channel/doom-scroll never gets stuck on a dead video.
    if (skippedRef.current) return;
    skippedRef.current = true;
    // Dead source: drop the tuning static IMMEDIATELY (don't make the user stare at 8s of
    // snow on a tape that will never play) — B kept hitting this hang on dead DVD-rip tapes.
    setTuningStatic(false);
    api.sendWatchEvent({
      item_id: stub.id, item_title: stub.title,
      category_id: categoryId || null, event_type: 'skip', watch_percent: 0,
    }).catch(() => {});

    if (inChannel) {
      advanceToNext();
      return;
    }
    if (autoplay) {
      if (!advanceToNext()) {
        // Related not loaded yet — fetch now and jump to the first suggestion.
        // KIDS: never hop into raw related content; stop playback cleanly instead.
        if (!kidsMode) api.getRelated(stub.id, 10)
          .then((items) => { if (items && items.length) navigation.replace('Player', { item: items[0], id: items[0].id }); })
          .catch(() => {});
      }
      return;
    }
    // Solo (incl. kids tapes): show a clean message instead of a frozen black screen.
    setError("This recording won't play in the browser. Tap back and pick another.");
  }, [videoReady, item.videoUrl, item.videoUrlHQ, videoUrl, inChannel, autoplay, stub, categoryId, advanceToNext, navigation]);

  const toggleWatchlist = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (inWatchlist) {
      await store.removeFromWatchlist(item.id);
      setInWatchlist(false);
    } else {
      await store.addToWatchlist(item);
      setInWatchlist(true);
    }
  }, [inWatchlist, item]);

  const toggleHeart = useCallback(async () => {
    const next = !hearted;
    setHearted(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await store.setHearted(item.id, next);
    try {
      if (next) await api.heartItem(item);
      else await api.unheartItem(item.id);
    } catch (e) { console.warn('[heart sync]', e?.message); }
  }, [hearted, item]);

  const [copied, setCopied] = useState(false);
  const [shareExpanded, setShareExpanded] = useState(false);

  // ── Clip mode state ──
  const [clipMode, setClipMode] = useState(false);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(30);
  const [clipCopied, setClipCopied] = useState(false);

  const openClipEditor = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Default: clip starts at current playback position
    const pos = videoRef.current?.getCurrentTime?.() || 0;
    const dur = videoRef.current?.getDuration?.() || 60;
    const start = Math.max(0, Math.floor(pos));
    const end = Math.min(dur, start + 15); // 15-sec default
    setClipStart(start);
    setClipEnd(Math.max(end, start + 10)); // minimum 10s
    setClipMode(true);
    setClipCopied(false);
  }, []);

  const getClipUrl = useCallback(() => {
    return `${APP_ORIGIN}/watch/${item.id}?start=${clipStart}&end=${clipEnd}`;
  }, [item, clipStart, clipEnd]);

  const getClipText = useCallback(() => {
    const formatSec = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    return `${item.title} [${formatSec(clipStart)}–${formatSec(clipEnd)}] · generating since 1895 // VOIDtv`;
  }, [item, clipStart, clipEnd]);

  const handleClipCopyLink = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const url = getClipUrl();
    if (Platform.OS === 'web' && navigator?.clipboard) {
      await navigator.clipboard.writeText(url);
    } else {
      try {
        const Clipboard = require('expo-clipboard');
        if (Clipboard?.setStringAsync) await Clipboard.setStringAsync(url);
      } catch {}
    }
    setClipCopied(true);
    setTimeout(() => setClipCopied(false), 2000);
  }, [getClipUrl]);

  const handleClipShareTwitter = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareTo({ platform: 'twitter', url: getClipUrl(), text: getClipText() });
  }, [getClipText, getClipUrl]);

  const handleClipShareFacebook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareTo({ platform: 'facebook', url: getClipUrl(), text: getClipText() });
  }, [getClipText, getClipUrl]);

  const previewTimerRef = useRef(null);
  const stopClipPreview = useCallback(() => {
    if (previewTimerRef.current) { clearInterval(previewTimerRef.current); previewTimerRef.current = null; }
  }, []);

  const handleClipPreview = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const v = videoRef.current;
    if (!v?.seekTo) return;
    stopClipPreview();
    // Seek to clip start, play, then poll position and pause at clipEnd so PREVIEW shows
    // exactly the selected range instead of running past it.
    v.seekTo(clipStart);
    v.play?.();
    previewTimerRef.current = setInterval(() => {
      const t = v.getCurrentTime?.() ?? 0;
      if (t >= clipEnd) {
        v.pause?.();
        stopClipPreview();
      }
    }, 120);
  }, [clipStart, clipEnd, stopClipPreview]);

  // Stop any running clip preview when the component unmounts.
  useEffect(() => stopClipPreview, [stopClipPreview]);

  const getShareUrl = useCallback(() => {
    return `${APP_ORIGIN}/watch/${item.id}`;
  }, [item]);

  const getShareText = useCallback(() => {
    return `${item.title} · generating since 1895 // VOIDtv`;
  }, [item]);

  const handleCopyLink = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const url = getShareUrl();
    if (Platform.OS === 'web' && navigator?.clipboard) {
      await navigator.clipboard.writeText(url);
    } else {
      // React Native Clipboard — use dynamic require wrapped in try/catch
      try {
        const Clipboard = require('expo-clipboard');
        if (Clipboard?.setStringAsync) await Clipboard.setStringAsync(url);
        else if (Clipboard?.setString) Clipboard.setString(url);
      } catch { /* expo-clipboard not installed — web uses navigator.clipboard above */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getShareUrl]);

  const handleShareFacebook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareTo({ platform: 'facebook', url: getShareUrl(), text: getShareText() });
  }, [getShareText, getShareUrl]);

  const handleShareTwitter = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareTo({ platform: 'twitter', url: getShareUrl(), text: getShareText() });
  }, [getShareText, getShareUrl]);

  const handleShareReddit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareTo({ platform: 'reddit', url: getShareUrl(), text: getShareText() });
  }, [getShareText, getShareUrl]);

  const handleShareNative = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = getShareUrl();
    try {
      await Share.share({
        message: Platform.OS === 'ios'
          ? getShareText()
          : `${getShareText()}\n${url}`,
        url: Platform.OS === 'ios' ? url : undefined,
        title: item.title,
      });
    } catch {}
  }, [item, getShareText, getShareUrl]);

  const handleDownload = useCallback(async () => {
    if (!item.videoUrl) return;
    Alert.alert('Download for offline?', `Save "${item.title}" to your device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Download',
        onPress: async () => {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setDownloading(true);
            const uri = await store.downloadVideo(item.id, item.videoUrl, setDownloadProgress);
            setLocalUri(uri);
          } catch {
            Alert.alert('Download failed', 'Please try again.');
          } finally { setDownloading(false); }
        },
      },
    ]);
  }, [item]);

  const creator = typeof item.creator === 'string' ? item.creator
    : Array.isArray(item.creator) ? item.creator[0] : '';

  const toggleInfo = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInfoExpanded((v) => !v);
  }, []);

  // Video area inner content — shared between desktop (full-width) and mobile (column) layouts
  var videoInner = (
    <>
      {!videoSource ? (
        <View style={styles.loadingWrap}>
          {IS_WEB && (
            <View dataSet={{voidNoise: 'static'}} style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, opacity: 0.6 }]} />
          )}
          {stub.thumbnail && (
            <FastImage uri={stub.thumbnail} itemId={stub.id} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} contentFit="cover" />
          )}
          {error ? (
            <>
              <Ionicons name="warning-outline" size={40} color={colors.textMuted} />
              <Text style={styles.errorText}>{error}</Text>
            </>
          ) : (
            <>
              <ActivityIndicator color={accent} size="large" />
              <Text style={[styles.loadingText, { color: accent }]}>TUNING SIGNAL...</Text>
            </>
          )}
        </View>
      ) : (
        <VideoPlayer
          ref={videoRef}
          videoUrl={videoSource}
          title={item.title}
          onBack={safeGoBack}
          onEnded={(inChannel || autoplay) ? handleVideoEnded : undefined}
          onVideoError={handleVideoError}
          channelLabel={inChannel ? channelLabel || "CHANNEL" : undefined}
          captionUrl={captionTrack?.url}
          captionLang={captionTrack?.lang}
        />
      )}
      {/* THE DIAL: between-channels static. Covers the player until the tune-in seek lands. */}
      {tuningStatic && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 30, backgroundColor: '#000', pointerEvents: 'none' }]}>
          <VoidLoader mode="static" size="row" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
          <View style={{ position: 'absolute', bottom: 28, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: 3, color: '#ffffff' }}>
              ▸ TUNING {String(channelLabel || '').toUpperCase()}
            </Text>
          </View>
        </View>
      )}
      {/* VOIDtv exit logo — CENTERED at the top of the video (interim until the persistent header,
          was colliding with the title top-left). Tap = return to wall + end viewing. box-none so
          only the pill is tappable, not the whole strip. */}
      <View style={[styles.exitLogoWrap, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.exitLogo} onPress={endViewing} hitSlop={10} activeOpacity={0.8}>
          <Text style={styles.exitLogoText}>VOID<Text style={styles.exitLogoTv}>tv</Text></Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // ── Sidebar filter chip handler ──
  const handleSidebarFilter = useCallback((filter) => {
    if (kidsMode) return; // KIDS: the rail's collection/creator fetches reach raw content
    setSidebarFilter(filter);
    if (filter === 'all') { setFilteredItems([]); return; }
    setFilteredLoading(true);
    const colonIdx = filter.indexOf(':');
    const type = filter.slice(0, colonIdx);
    const value = filter.slice(colonIdx + 1);
    // Series chip: episodes already arrived with the membership lookup — no fetch.
    if (type === 'series') {
      setFilteredItems((seriesRef.current && seriesRef.current.items) || []);
      setFilteredLoading(false);
      return;
    }
    const fetcher = type === 'col'
      ? api.searchCollection(value, '', { rows: 20 })
      : api.searchCreator(value, { rows: 20 });
    fetcher.then((res) => setFilteredItems(res?.items || res || []))
      .catch(() => setFilteredItems([]))
      .finally(() => setFilteredLoading(false));
  }, []);

  // Items displayed in sidebar — filtered or all
  const sidebarItems = sidebarFilter === 'all' ? relatedItems : filteredItems;
  const sidebarIsLoading = sidebarFilter === 'all' ? relatedLoading : filteredLoading;

  // Build filter chip options from item metadata
  const filterChips = [];
  filterChips.push({ key: 'all', label: 'All' });
  // MORE OF THIS SHOW — leads the chips when the item belongs to a verified series
  // Verified groups include self in items (need >1); guessed mates already exclude self.
  if (seriesInfo && seriesInfo.items.length > (seriesInfo.guessed ? 0 : 1)) {
    filterChips.push({ key: `series:${seriesInfo.key}`, label: `▸ ${seriesInfo.name}` });
  }
  if (item.collections?.length > 0) {
    item.collections.slice(0, 2).forEach((col) => {
      filterChips.push({ key: `col:${col}`, label: col.replace(/_/g, ' ') });
    });
  }
  if (item.creator) {
    const creatorName = Array.isArray(item.creator) ? item.creator[0] : item.creator;
    if (creatorName) filterChips.push({ key: `creator:${creatorName}`, label: creatorName });
  }

  // Desktop sidebar — YouTube-style with filter chips
  const SidebarContent = IS_DESKTOP ? (
    <ScrollView style={[styles.sidebar, { width: SIDE_W }]} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* ── Filter chips — like YouTube's "All / From DoctorRamani / ..." ── */}
      {filterChips.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sidebarChipScroll} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
          {filterChips.map((chip) => {
            const active = sidebarFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => handleSidebarFilter(chip.key)}
                style={[
                  styles.sidebarChip,
                  active ? { backgroundColor: colors.textPrimary } : { backgroundColor: colors.surface },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sidebarChipText,
                    active ? { color: colors.bg } : { color: colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Autoplay row */}
      <View style={styles.sidebarAutoplay}>
        <Text style={styles.sidebarAutoplayLabel}>AUTOPLAY</Text>
        <TouchableOpacity
          onPress={() => setAutoplay((v) => !v)}
          style={[styles.autoplayToggle, autoplay && { backgroundColor: accent }]}
          activeOpacity={0.7}
        >
          <View style={[styles.autoplayKnob, autoplay && styles.autoplayKnobOn]} />
        </TouchableOpacity>
      </View>

      {/* Skeleton loading state — first card gets TV static, rest are shimmer */}
      {sidebarIsLoading && sidebarItems.length === 0 && (
        <>
          {Platform.OS === 'web' && (
            <View style={{ marginBottom: 10, borderRadius: 8, overflow: 'hidden' }}>
              <VoidLoader mode="static" size="row" label="scanning the archive..." style={{ height: 100, borderRadius: 8 }} />
            </View>
          )}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={styles.sidebarRelCard}>
              <View dataSet={{voidNoise: 'static'}} style={[styles.sidebarRelThumb, { backgroundColor: colors.card }]} />
              <View style={styles.sidebarRelInfo}>
                <View dataSet={{skeleton: '1'}} style={[styles.skeletonLine, { width: `${65 + (i * 7) % 30}%` }]} />
                <View dataSet={{skeleton: '1'}} style={[styles.skeletonLine, { width: '50%', marginTop: 4 }]} />
                <View dataSet={{skeleton: '1'}} style={[styles.skeletonLine, { width: '35%', marginTop: 4 }]} />
              </View>
            </View>
          ))}
        </>
      )}

      {/* MORE OF THIS SHOW — show-mates lead the sidebar (B: "already be searching for
          like... display some on the right side bar"). Tap hands the mate list over as the
          queue so auto-advance walks the show. The chip above is the see-more tab. */}
      {sidebarFilter === 'all' && seriesInfo && seriesInfo.items.length > 0 && (
        <View style={{ marginBottom: 6 }}>
          <Text style={{ fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 2, color: accent, marginBottom: 6 }}>
            ▸ MORE OF {String(seriesInfo.name).toUpperCase().slice(0, 28)}
          </Text>
          {seriesInfo.items.filter((m) => m.id !== item.id).slice(0, 4).map((m, mi, arr) => (
            <Pressable
              key={`mate-${m.id}`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.replace('Player', {
                  item: m, id: m.id,
                  queue: arr, queueIndex: mi, channelLabel: `▸ ${seriesInfo.name}`,
                });
              }}
              style={styles.sidebarRelCard}
            >
              <View style={styles.sidebarThumbWrap}>
                <FastImage uri={m.thumbnail} itemId={m.id} style={styles.sidebarRelThumb} contentFit="cover" priority="low" />
              </View>
              <View style={styles.sidebarRelInfo}>
                <Text style={styles.sidebarRelTitle} numberOfLines={2}>{cleanTitle(m.title)}</Text>
                <Text style={styles.sidebarRelMeta}>{m.year || ''}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Related list — SINGLE column (full sidebar width) so titles/descriptions read fully
          instead of being crushed into a 2-column grid ("!", "198 O"…). */}
      <View>
      {sidebarItems.map((rel, idx) => (
        <Pressable
          key={rel.id}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            // Series chip active: hand the EPISODE LIST over as the player queue, so
            // auto-advance walks the show in broadcast order from the tapped episode.
            if (sidebarFilter.startsWith('series:') && seriesInfo) {
              navigation.replace('Player', {
                item: rel, id: rel.id,
                queue: sidebarItems, queueIndex: idx, channelLabel: `▸ ${seriesInfo.name}`,
              });
              return;
            }
            navigation.replace('Player', { item: rel, id: rel.id });
          }}
          style={styles.sidebarRelCard}
        >
          <View style={styles.sidebarThumbWrap}>
            <FastImage uri={rel.thumbnail} itemId={rel.id} style={styles.sidebarRelThumb} contentFit="cover" priority="low" />
            {idx === 0 && sidebarFilter === 'all' && (
              <View style={[styles.sidebarUpNextBadge, { backgroundColor: accent }]}>
                <Text style={styles.sidebarUpNextBadgeText}>UP NEXT</Text>
              </View>
            )}
          </View>
          <View style={styles.sidebarRelInfo}>
            <Text style={styles.sidebarRelTitle} numberOfLines={2}>{cleanTitle(rel.title)}</Text>
            {rel.creator ? (
              <Text style={styles.sidebarRelCreator} numberOfLines={1}>
                {Array.isArray(rel.creator) ? rel.creator[0] : rel.creator}
              </Text>
            ) : null}
            <Text style={styles.sidebarRelMeta}>
              {rel.year || ''}{rel.year && rel.downloads ? ' · ' : ''}{rel.downloads ? `${rel.downloads.toLocaleString()} views` : ''}
            </Text>
          </View>
        </Pressable>
      ))}
      </View>

      {/* Shuffle */}
      {sidebarFilter === 'all' && sidebarItems.length > 0 && (
        <Pressable
          onPress={() => {
            if (kidsMode) return;
            setRelatedLoading(true);
            setRelatedItems([]);
            api.getRelated(item.id, 20).then(setRelatedItems).catch(() => {}).finally(() => setRelatedLoading(false));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.sidebarShuffleBtn, { borderColor: accent + '30' }]}
        >
          <Ionicons name="shuffle" size={10} color={accent} />
          <Text style={[styles.sidebarShuffleText, { color: accent }]}>SHUFFLE</Text>
        </Pressable>
      )}
    </ScrollView>
  ) : null;

  // ── Info panel content — shared between desktop and mobile layouts ──
  var infoPanelContent = (
      <>
        {/* ── Title block — Netflix-style dense header ── */}
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          </View>
          <View style={styles.metaChips}>
            {item.year ? (
              <View style={[styles.metaChip, { borderColor: accent + '55' }]}>
                <Text style={[styles.metaChipText, { color: accent }]}>{item.year}</Text>
              </View>
            ) : null}
            {creator ? (
              <Text style={styles.creatorText} numberOfLines={1}>{creator}</Text>
            ) : null}
            {item.duration ? (
              <Text style={styles.durationText}>{item.duration}</Text>
            ) : null}
            {viewCount > 0 ? (
              <View style={styles.viewCountWrap}>
                <Ionicons name="eye-outline" size={11} color={colors.textMuted} />
                <Text style={styles.viewCountText}>{viewCount.toLocaleString()} {viewCount === 1 ? 'view' : 'views'}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Browse series / creator — always visible ── */}
        {(item.collections?.length > 0 || item.creator) && (
          <View style={styles.seriesChipsRow}>
            {item.collections?.slice(0, 3).map((col) => (
              <TouchableOpacity
                key={col}
                style={[styles.seriesChip, { borderColor: accent + '50' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate('Search', {
                    collection: col,
                    collectionName: col.replace(/_/g, ' '),
                    _ts: Date.now(),
                  });
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="albums-outline" size={13} color={accent} />
                <Text style={[styles.seriesChipText, { color: accent }]} numberOfLines={1}>
                  {col.replace(/_/g, ' ')}
                </Text>
                <Ionicons name="chevron-forward" size={12} color={accent + '80'} />
              </TouchableOpacity>
            ))}
            {item.creator && (
              <TouchableOpacity
                style={[styles.seriesChip, { borderColor: colors.textMuted + '40' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate('Search', {
                    creator: Array.isArray(item.creator) ? item.creator[0] : item.creator,
                    creatorName: Array.isArray(item.creator) ? item.creator[0] : item.creator,
                    _ts: Date.now(),
                  });
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                <Text style={[styles.seriesChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {Array.isArray(item.creator) ? item.creator[0] : item.creator}
                </Text>
                <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Quick actions — icon strip like Netflix ── */}
        <View style={styles.actionStrip}>
          <ActionIcon
            icon={hearted ? 'heart' : 'heart-outline'}
            label={hearted ? 'Loved' : 'Love'}
            color={hearted ? '#ff3b5c' : colors.textPrimary}
            onPress={toggleHeart}
          />
          <ActionIcon
            icon={inWatchlist ? 'bookmark' : 'bookmark-outline'}
            label={inWatchlist ? 'Saved' : 'Save'}
            color={inWatchlist ? accent : colors.textPrimary}
            onPress={toggleWatchlist}
          />
          <ActionIcon
            icon="add-circle-outline"
            label={IS_DESKTOP ? 'Add to Playlist' : 'Playlist'}
            color={colors.textPrimary}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPlaylistModalOpen(true); }}
          />
          <ActionIcon
            icon="cut-outline"
            label="Clip"
            color={clipMode ? accent : colors.textPrimary}
            onPress={openClipEditor}
          />
          <ActionIcon
            icon={shareExpanded ? 'close-circle' : 'share-social-outline'}
            label="Share"
            color={shareExpanded ? accent : colors.textPrimary}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShareExpanded((v) => !v); }}
          />
          {localUri ? (
            <ActionIcon icon="checkmark-circle" label="Saved" color={accent} />
          ) : item.videoUrl ? (
            <ActionIcon
              icon={downloading ? undefined : 'download-outline'}
              label={downloading ? `${Math.round(downloadProgress * 100)}%` : 'Download'}
              color={colors.textPrimary}
              onPress={downloading ? undefined : handleDownload}
              loading={downloading}
            />
          ) : null}
        </View>

        {/* ── Share drawer ── */}
        {shareExpanded && (
          <View style={styles.shareDrawer}>
            <TouchableOpacity style={[styles.shareChip, copied && { borderColor: accent, backgroundColor: accent + '15' }]} onPress={handleCopyLink} activeOpacity={0.7}>
              <Ionicons name={copied ? "checkmark-circle" : "link-outline"} size={16} color={copied ? accent : colors.textPrimary} />
              <Text style={[styles.shareChipText, copied && { color: accent }]}>{copied ? 'COPIED!' : 'COPY LINK'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareChip} onPress={() => Linking.openURL(getShareUrl())} activeOpacity={0.7}>
              <Ionicons name="globe-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.shareChipText}>VOID PAGE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareChip} onPress={handleShareTwitter} activeOpacity={0.7}>
              <Ionicons name="logo-twitter" size={16} color="#1DA1F2" />
              <Text style={styles.shareChipText}>X</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareChip} onPress={handleShareFacebook} activeOpacity={0.7}>
              <Ionicons name="logo-facebook" size={16} color="#1877F2" />
              <Text style={styles.shareChipText}>FACEBOOK</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareChip} onPress={handleShareReddit} activeOpacity={0.7}>
              <Ionicons name="logo-reddit" size={16} color="#FF4500" />
              <Text style={styles.shareChipText}>REDDIT</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity style={styles.shareChip} onPress={handleShareNative} activeOpacity={0.7}>
                <Ionicons name="ellipsis-horizontal" size={16} color={colors.textPrimary} />
                <Text style={styles.shareChipText}>MORE</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Clip Editor ── */}
        {clipMode && (
          <ClipEditor
            clipStart={clipStart}
            clipEnd={clipEnd}
            duration={videoRef.current?.getDuration?.() || item.runtime || 60}
            onChangeStart={setClipStart}
            onChangeEnd={setClipEnd}
            onPreview={handleClipPreview}
            onCopyLink={handleClipCopyLink}
            onShareTwitter={handleClipShareTwitter}
            onShareFacebook={handleClipShareFacebook}
            onClose={() => { stopClipPreview(); setClipMode(false); }}
            copied={clipCopied}
            accent={accent}
            itemTitle={item.title}
            itemYear={item.year}
            itemThumbnail={item.thumbnail}
          />
        )}

        {/* ── Expandable Info Tab ── */}
        <TouchableOpacity
          onPress={toggleInfo}
          activeOpacity={0.8}
          style={[styles.infoTab, infoExpanded && styles.infoTabExpanded]}
        >
          <View style={styles.infoTabHeader}>
            <Ionicons name="information-circle-outline" size={16} color={accent} />
            <Text style={[styles.infoTabLabel, { color: accent }]}>
              {infoExpanded ? 'ABOUT THIS VIDEO' : 'INFO'}
            </Text>
            <View style={{ flex: 1 }} />
            <Ionicons
              name={infoExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textSecondary}
            />
          </View>

          {/* Collapsed: 3-line preview */}
          {!infoExpanded && item.description ? (
            <Text style={styles.descText} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {/* Expanded: full info */}
          {infoExpanded && (
            <View style={styles.infoTabBody}>
              {item.description ? (
                <Text style={[styles.descText, { marginBottom: 12 }]}>
                  {item.description}
                </Text>
              ) : null}

              {/* Metadata chips */}
              <View style={styles.infoMetaGrid}>
                {creator ? (
                  <View style={styles.infoMetaRow}>
                    <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.infoMetaLabel}>Creator</Text>
                    <Text style={styles.infoMetaValue}>{creator}</Text>
                  </View>
                ) : null}
                {item.year ? (
                  <View style={styles.infoMetaRow}>
                    <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.infoMetaLabel}>Year</Text>
                    <Text style={styles.infoMetaValue}>{item.year}</Text>
                  </View>
                ) : null}
                {item.runtime ? (
                  <View style={styles.infoMetaRow}>
                    <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.infoMetaLabel}>Duration</Text>
                    <Text style={styles.infoMetaValue}>
                      {item.runtime >= 3600
                        ? `${Math.floor(item.runtime / 3600)}h ${Math.floor((item.runtime % 3600) / 60)}m`
                        : `${Math.floor(item.runtime / 60)}m ${Math.round(item.runtime % 60)}s`}
                    </Text>
                  </View>
                ) : null}
                {viewCount > 0 ? (
                  <View style={styles.infoMetaRow}>
                    <Ionicons name="eye-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.infoMetaLabel}>Views</Text>
                    <Text style={styles.infoMetaValue}>{viewCount.toLocaleString()}</Text>
                  </View>
                ) : null}
              </View>

              {/* Subjects / tags */}
              {item.subjects?.length > 0 && (
                <View style={styles.infoTagsWrap}>
                  {item.subjects.slice(0, 8).map((s, i) => (
                    <View key={i} style={styles.infoTagChip}>
                      <Text style={styles.infoTagText}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Browse collection / creator chips — "more from this show" */}
              {(item.collections?.length > 0 || item.creator) && (
                <View style={styles.browseChipsWrap}>
                  {item.collections?.slice(0, 4).map((col) => (
                    <TouchableOpacity
                      key={col}
                      style={[styles.browseChip, { borderColor: accent + '40' }]}
                      onPress={() => navigation.navigate('Search', {
                        collection: col,
                        collectionName: col.replace(/_/g, ' '),
                        _ts: Date.now(),
                      })}
                    >
                      <Ionicons name="folder-open-outline" size={12} color={accent} />
                      <Text style={[styles.browseChipText, { color: accent }]} numberOfLines={1}>
                        {col.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {item.creator && (
                    <TouchableOpacity
                      style={[styles.browseChip, { borderColor: accent + '40' }]}
                      onPress={() => navigation.navigate('Search', {
                        creator: Array.isArray(item.creator) ? item.creator[0] : item.creator,
                        creatorName: Array.isArray(item.creator) ? item.creator[0] : item.creator,
                        _ts: Date.now(),
                      })}
                    >
                      <Ionicons name="person-outline" size={12} color={accent} />
                      <Text style={[styles.browseChipText, { color: accent }]} numberOfLines={1}>
                        {Array.isArray(item.creator) ? item.creator[0] : item.creator}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Archive link */}
              {item.archiveUrl && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(item.archiveUrl)}
                  style={styles.archiveLink}
                >
                  <Ionicons name="open-outline" size={12} color={accent} />
                  <Text style={[styles.archiveLinkText, { color: accent }]}>
                    View on Internet Archive
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </TouchableOpacity>

        {/* ── X-Ray — community-contributed metadata ── */}
        {xrayTotal > 0 && (
          <View style={xrayStyles.section}>
            <View style={styles.sectionLine}>
              <View style={[styles.sectionLineBorder, { backgroundColor: accent + '30' }]} />
              <Ionicons name="scan-outline" size={13} color={accent} />
              <Text style={[styles.sectionLabel, { color: accent }]}>X-RAY</Text>
              <Text style={styles.sectionSub}>community intel</Text>
              <View style={[styles.sectionLineBorder, { backgroundColor: accent + '30' }]} />
            </View>

            {/* Cast & Crew */}
            {(xrayData.cast || xrayData.director || xrayData.writer || xrayData.producer) && (
              <View style={xrayStyles.group}>
                {xrayData.director?.map((c) => (
                  <View key={c.id} style={xrayStyles.chip}>
                    <Ionicons name="film-outline" size={11} color={accent} />
                    <Text style={xrayStyles.chipLabel}>DIR</Text>
                    <Text style={xrayStyles.chipValue}>{c.value}</Text>
                  </View>
                ))}
                {xrayData.cast?.map((c) => (
                  <View key={c.id} style={xrayStyles.chip}>
                    <Ionicons name="people-outline" size={11} color={colors.textSecondary} />
                    <Text style={xrayStyles.chipValue}>{c.value}</Text>
                    {c.extra ? <Text style={xrayStyles.chipExtra}>as {c.extra}</Text> : null}
                  </View>
                ))}
                {xrayData.writer?.map((c) => (
                  <View key={c.id} style={xrayStyles.chip}>
                    <Ionicons name="create-outline" size={11} color={colors.textMuted} />
                    <Text style={xrayStyles.chipLabel}>WRITER</Text>
                    <Text style={xrayStyles.chipValue}>{c.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Tags */}
            {xrayData.tag && (
              <View style={xrayStyles.tagRow}>
                {xrayData.tag.map((c) => (
                  <View key={c.id} style={[xrayStyles.tag, { borderColor: accent + '40' }]}>
                    <Text style={[xrayStyles.tagText, { color: accent }]}>{c.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Trivia & Context */}
            {(xrayData.trivia || xrayData.context) && (
              <View style={xrayStyles.factsWrap}>
                {xrayData.trivia?.map((c) => (
                  <View key={c.id} style={xrayStyles.factCard}>
                    <Ionicons name="bulb-outline" size={13} color={accent} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={xrayStyles.factLabel}>TRIVIA</Text>
                      <Text style={xrayStyles.factText}>{c.value}</Text>
                      <Text style={xrayStyles.factAuthor}>— {c.contributor}</Text>
                    </View>
                  </View>
                ))}
                {xrayData.context?.map((c) => (
                  <View key={c.id} style={xrayStyles.factCard}>
                    <Ionicons name="book-outline" size={13} color={accent} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={xrayStyles.factLabel}>CONTEXT</Text>
                      <Text style={xrayStyles.factText}>{c.value}</Text>
                      <Text style={xrayStyles.factAuthor}>— {c.contributor}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Warnings */}
            {xrayData.warning && (
              <View style={xrayStyles.warningRow}>
                {xrayData.warning.map((c) => (
                  <View key={c.id} style={xrayStyles.warningChip}>
                    <Ionicons name="warning-outline" size={11} color="#ff6b6b" />
                    <Text style={xrayStyles.warningText}>{c.value}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Contribute button ── */}
        <TouchableOpacity
          style={[xrayStyles.contributeBtn, { borderColor: accent + '40' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setContributeOpen((v) => !v);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name={contributeOpen ? 'close' : 'add-circle-outline'} size={16} color={accent} />
          <Text style={[xrayStyles.contributeBtnText, { color: accent }]}>
            {contributeOpen ? 'CLOSE' : 'ADD TO X-RAY'}
          </Text>
          <Text style={xrayStyles.contributeBtnXP}>earn XP</Text>
        </TouchableOpacity>

        {/* ── Contribute panel ── */}
        {contributeOpen && (
          <View style={xrayStyles.contributePanel}>
            {/* Type selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={xrayStyles.typeScroll}>
              {XRAY_FIELDS.map((f) => (
                <TouchableOpacity
                  key={f.type}
                  onPress={() => { setContributeType(f.type); setContributeValue(''); setContributeExtra(''); }}
                  style={[
                    xrayStyles.typeChip,
                    contributeType === f.type && { borderColor: accent, backgroundColor: accent + '18' },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name={f.icon} size={12} color={contributeType === f.type ? accent : colors.textMuted} />
                  <Text style={[
                    xrayStyles.typeChipText,
                    contributeType === f.type && { color: accent },
                  ]}>
                    {f.label}
                  </Text>
                  <Text style={[xrayStyles.typeChipXP, contributeType === f.type && { color: accent + 'aa' }]}>
                    +{XP_REWARDS[f.type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Input */}
            <View style={xrayStyles.inputRow}>
              <TextInput
                style={[xrayStyles.input, { borderColor: accent + '40' }]}
                value={contributeValue}
                onChangeText={setContributeValue}
                placeholder={XRAY_FIELDS.find((f) => f.type === contributeType)?.placeholder || 'Enter value...'}
                placeholderTextColor={colors.textGhost}
                maxLength={500}
                multiline={contributeType === 'trivia' || contributeType === 'context'}
              />
              {(contributeType === 'cast') && (
                <TextInput
                  style={[xrayStyles.inputSmall, { borderColor: accent + '40' }]}
                  value={contributeExtra}
                  onChangeText={setContributeExtra}
                  placeholder="Role (optional)"
                  placeholderTextColor={colors.textGhost}
                  maxLength={100}
                />
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[
                xrayStyles.submitBtn,
                { backgroundColor: contributeValue.trim() ? accent : colors.surface },
              ]}
              disabled={!contributeValue.trim() || contributing}
              onPress={async () => {
                if (!contributeValue.trim()) return;
                setContributing(true);
                try {
                  const result = await api.contribute(item.id, {
                    field_type: contributeType,
                    field_value: contributeValue.trim(),
                    field_extra: contributeExtra.trim() || undefined,
                  });
                  // Award XP locally
                  const xpResult = await onContribute(contributeType, item.id, item.title);
                  showXpToast(xpResult.xpGained);

                  // Update local X-Ray display
                  setXrayData((prev) => {
                    const updated = { ...prev };
                    const list = updated[contributeType] || [];
                    updated[contributeType] = [...list, {
                      id: result.contribution?.id || Date.now(),
                      value: contributeValue.trim(),
                      extra: contributeExtra.trim() || null,
                      contributor: 'You',
                      rank: 'wanderer',
                      date: new Date().toISOString(),
                    }];
                    return updated;
                  });
                  setXrayTotal((t) => t + 1);

                  // Reset form
                  setContributeValue('');
                  setContributeExtra('');
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch (err) {
                  Alert.alert('Contribution failed', err.message || 'Please try again.');
                } finally {
                  setContributing(false);
                }
              }}
              activeOpacity={0.7}
            >
              {contributing ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color={contributeValue.trim() ? colors.bg : colors.textGhost} />
                  <Text style={[xrayStyles.submitText, { color: contributeValue.trim() ? colors.bg : colors.textGhost }]}>
                    SUBMIT (+{XP_REWARDS[contributeType]} XP)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Comments Section (hidden entirely in KIDS mode) ── */}
        {!kidsMode && <View style={styles.commentsSection}>
          <TouchableOpacity
            onPress={() => setCommentsExpanded((v) => !v)}
            style={styles.commentsSectionHeader}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={13} color={accent} />
            <Text style={[styles.sectionLabel, { color: accent }]}>COMMENTS</Text>
            <Text style={styles.sectionSub}>
              {commentsLoading ? '...' : comments.length > 0 ? `${comments.length}` : 'be first'}
            </Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={commentsExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Preview — skeleton while loading, first 2 when collapsed */}
          {!commentsExpanded && commentsLoading && (
            <View style={styles.commentsPreview}>
              {[1, 2].map((i) => (
                <View key={i} style={styles.commentRow}>
                  <View dataSet={{skeleton: '1'}} style={[styles.skeletonLine, { width: 50, marginRight: 6 }]} />
                  <View dataSet={{skeleton: '1'}} style={[styles.skeletonLine, { flex: 1 }]} />
                </View>
              ))}
            </View>
          )}
          {!commentsExpanded && !commentsLoading && comments.length > 0 && (
            <View style={styles.commentsPreview}>
              {comments.slice(0, 2).map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <Text style={[styles.commentAuthor, { color: accent }]}>{c.username || 'anon'}</Text>
                  <Text style={styles.commentBody} numberOfLines={1}>{c.body}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Expanded: full list + compose */}
          {commentsExpanded && (
            <View style={styles.commentsExpanded}>
              {/* Compose */}
              {isAuthenticated ? (
                <View style={styles.composeRow}>
                  <TextInput
                    style={[styles.composeInput, { borderColor: accent + '40' }]}
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Add a comment..."
                    placeholderTextColor={colors.textGhost}
                    maxLength={2000}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.composeBtn, { backgroundColor: commentText.trim() ? accent : colors.surface }]}
                    disabled={!commentText.trim() || commentPosting}
                    onPress={async () => {
                      if (!commentText.trim()) return;
                      setCommentPosting(true);
                      try {
                        const result = await api.postComment(item.id, commentText.trim());
                        setComments((prev) => [{
                          id: result.comment?.id || Date.now(),
                          body: commentText.trim(),
                          username: result.comment?.username || user?.username || ('void_' + (user?.id || '').replace(/-/g, '').slice(0, 8)),
                          user_id: user?.id,
                          created_at: new Date().toISOString(),
                          upvote_count: 0,
                        }, ...prev]);
                        setCommentText('');
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch (err) {
                        Alert.alert('Error', err.message || 'Could not post comment');
                      }
                      setCommentPosting(false);
                    }}
                    activeOpacity={0.7}
                  >
                    {commentPosting ? (
                      <ActivityIndicator size="small" color={colors.bg} />
                    ) : (
                      <Ionicons name="send" size={14} color={commentText.trim() ? colors.bg : colors.textGhost} />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Auth')}
                  style={styles.commentSignIn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="log-in-outline" size={14} color={accent} />
                  <Text style={[styles.commentSignInText, { color: accent }]}>SIGN IN TO COMMENT</Text>
                </TouchableOpacity>
              )}

              {/* Loading */}
              {commentsLoading && (
                <ActivityIndicator size="small" color={accent} style={{ paddingVertical: 12 }} />
              )}

              {/* Comment list */}
              {!commentsLoading && comments.map((c) => (
                <View key={c.id} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: accent }]}>{c.username || 'anon'}</Text>
                    {c.rank && c.rank !== 'wanderer' && (
                      <Text style={[styles.commentRank, { color: accent + '80' }]}>{c.rank}</Text>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                  </View>
                  <Text style={styles.commentBody}>{c.body}</Text>
                </View>
              ))}
              {!commentsLoading && comments.length === 0 && (
                <Text style={styles.commentsEmpty}>No comments yet — start the conversation.</Text>
              )}
            </View>
          )}
        </View>}

        {/* ── Rabbit Hole — skeleton while loading on mobile ── */}
        {!IS_DESKTOP && relatedLoading && relatedItems.length === 0 && (
          <View style={styles.rabbitSection}>
            <View style={styles.rabbitToggle}>
              <Text style={styles.rabbitIcon}>🐇</Text>
              <Text style={[styles.rabbitToggleText, { color: accent }]}>RABBIT HOLE</Text>
              <ActivityIndicator size="small" color={accent} style={{ marginLeft: 6 }} />
            </View>
          </View>
        )}
        {/* ── Rabbit Hole — collapsible on mobile, hidden on desktop (shown in sidebar) ── */}
        {!IS_DESKTOP && relatedItems.length > 0 && (
          <View style={styles.rabbitSection}>
            <TouchableOpacity
              onPress={() => { setRabbitExpanded((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={styles.rabbitToggle}
              activeOpacity={0.7}
            >
              <Text style={styles.rabbitIcon}>🐇</Text>
              <Text style={[styles.rabbitToggleText, { color: accent }]}>
                RABBIT HOLE
              </Text>
              <Text style={styles.rabbitToggleCount}>{relatedItems.length}</Text>
              <Ionicons
                name={rabbitExpanded ? "chevron-up" : "chevron-down"}
                size={14} color={colors.textSecondary}
              />
            </TouchableOpacity>
            {rabbitExpanded && (
              <FlatList
                data={relatedItems}
                keyExtractor={(r) => r.id}
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rabbitList}
                renderItem={({ item: rel }) => (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.replace('Player', { item: rel, id: rel.id });
                    }}
                    style={styles.rabbitCard}
                  >
                    <FastImage uri={rel.thumbnail} itemId={rel.id} style={styles.rabbitThumb} contentFit="cover" priority="low" />
                    <View style={styles.rabbitCardInfo}>
                      <Text style={styles.rabbitCardTitle} numberOfLines={1}>{cleanTitle(rel.title)}</Text>
                      {rel.year ? <Text style={[styles.rabbitCardYear, { color: accent }]}>{rel.year}</Text> : null}
                    </View>
                  </Pressable>
                )}
              />
            )}
          </View>
        )}

        {/* ── Episodes (a bundled series, fanned into per-episode entries) ── */}
        {item.episodes?.length > 0 && (
          <View style={styles.formatsSection}>
            <View style={styles.sectionLine}>
              <View style={styles.sectionLineBorderDim} />
              <Text style={styles.sectionLabelDim}>EPISODES · {item.episodes.length}</Text>
              <View style={styles.sectionLineBorderDim} />
            </View>
            {item.episodes.map((ep, i) => {
              const active = videoUrl === ep.videoUrl;
              const showSeason = ep.contentType === 'episode' && ep.season != null &&
                (i === 0 || item.episodes[i - 1].season !== ep.season);
              const tag = ep.episode != null
                ? `S${String(ep.season ?? 0).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`
                : String(ep.contentType || 'extra').toUpperCase();
              const label = ep.episodeTitle || ep.title || ep.file;
              return (
                <React.Fragment key={ep.file || i}>
                  {showSeason && <Text style={styles.episodeSeason}>SEASON {ep.season}</Text>}
                  <TouchableOpacity style={styles.formatRow} activeOpacity={0.7} onPress={() => setVideoUrl(ep.videoUrl)}>
                    <Text style={[styles.formatName, active && { color: accent }]} numberOfLines={1}>
                      {active ? '▸ ' : ''}{tag}  {label}
                    </Text>
                    <Text style={styles.formatSize}>{ep.size ? `${(ep.size / 1024 / 1024).toFixed(0)} MB` : ''}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </View>
        )}

        {/* ── Expandable formats ── */}
        {infoExpanded && item.availableFormats?.length > 1 && (
          <View style={styles.formatsSection}>
            <View style={styles.sectionLine}>
              <View style={styles.sectionLineBorderDim} />
              <Text style={styles.sectionLabelDim}>AVAILABLE FORMATS</Text>
              <View style={styles.sectionLineBorderDim} />
            </View>
            {item.availableFormats.map((f, i) => (
              <View key={i} style={styles.formatRow}>
                <Text style={styles.formatName}>{f.format}</Text>
                <Text style={styles.formatSize}>{f.size ? `${(f.size / 1024 / 1024).toFixed(0)} MB` : '—'}</Text>
              </View>
            ))}
          </View>
        )}
      </>
  );

  return (
    <View style={[styles.container, IS_DESKTOP ? { width: sceneW, marginLeft: NAV_MARGIN } : null]}>
      {/* XP toast */}
      {xpToast && (
        <Animated.View style={[styles.xpToast, { opacity: xpOpacity, borderColor: accent }]}>
          <Text style={[styles.xpToastText, { color: accent }]}>{xpToast}</Text>
        </Animated.View>
      )}

      {IS_DESKTOP ? (
        /* ── DESKTOP: YouTube layout — video+info left, sidebar right, side-by-side ── */
        <View style={styles.desktopRow}>
          {/* ONE scroll for video + info (B: the pinned video forced a sliver view of
              comments). The video scrolls away with the page; info gets full height. */}
          <ScrollView
            style={[styles.desktopMain, { width: AVAILABLE_W, flexGrow: 0, flexShrink: 0 }]}
            contentContainerStyle={{ paddingBottom: 40 }}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.playerArea, { height: VIDEO_H }]}>
              {videoInner}
            </View>
            <View style={styles.infoPanel}>
              {infoPanelContent}
            </View>
          </ScrollView>
          {SidebarContent}
        </View>
      ) : (
        /* ── MOBILE: stacked layout with inner scroll ── */
        <View style={{ flex: 1 }}>
          <View style={[styles.playerArea, { height: infoExpanded ? VIDEO_H * 0.7 : VIDEO_H }]}>
            {videoInner}
          </View>
          <View style={styles.mobileAutoplayRow}>
            <Text style={styles.mobileAutoplayLabel}>Autoplay</Text>
            <TouchableOpacity
              onPress={() => setAutoplay((v) => !v)}
              style={[styles.autoplayToggle, autoplay && { backgroundColor: accent }]}
              activeOpacity={0.7}
            >
              <View style={[styles.autoplayKnob, autoplay && styles.autoplayKnobOn]} />
            </TouchableOpacity>
            {autoplay && relatedItems.length > 0 && (
              <Text style={styles.mobileUpNextHint} numberOfLines={1}>Up next: {relatedItems[0]?.title}</Text>
            )}
          </View>
          <ScrollView
            style={styles.infoPanel}
            contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {infoPanelContent}
          </ScrollView>
        </View>
      )}

      {/* Add to Playlist modal */}
      <AddToPlaylistModal
        visible={playlistModalOpen}
        item={item}
        onClose={() => setPlaylistModalOpen(false)}
        onAdded={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
      />
    </View>
  );
}

/* ── Clip Editor — range selector + share ── */
function ClipEditor({
  clipStart, clipEnd, duration,
  onChangeStart, onChangeEnd, onPreview,
  onCopyLink, onShareTwitter, onShareFacebook,
  onClose, copied, accent, itemTitle, itemYear, itemThumbnail,
}) {
  const MIN_CLIP = 10;
  const MAX_CLIP = 30;
  const barRef = React.useRef(null);
  const barWidth = React.useRef(300);
  const [dragging, setDragging] = React.useState(null); // 'start' | 'end' | null

  const formatSec = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const clipDuration = Math.max(0, clipEnd - clipStart);
  const isValid = clipDuration >= MIN_CLIP && clipDuration <= MAX_CLIP;

  const startPct = duration > 0 ? (clipStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (clipEnd / duration) * 100 : 100;

  // Web pointer events for dragging handles.
  const barId = React.useRef(`clip-bar-${Math.random().toString(36).slice(2, 8)}`).current;

  // The drag handlers read live values/callbacks through this ref so the pointer listeners can
  // be attached exactly ONCE (deps: [barId]). Previously the effect depended on clipStart/clipEnd,
  // so every move tore down + re-bound the listeners through a 300ms debounce — which is why a
  // single swipe only nudged a handle a few seconds before dying and forced repeated swiping.
  const liveRef = React.useRef(null);
  liveRef.current = { clipStart, clipEnd, duration, onChangeStart, onChangeEnd };

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-clipbar="${barId}"]`);
      if (!el) return;

      let activeDrag = null;

      const pctToTime = (e) => {
        const rect = el.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        return Math.round(pct * (liveRef.current.duration || 0));
      };

      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { clipStart, clipEnd } = liveRef.current;
        const t = pctToTime(e);
        activeDrag = Math.abs(t - clipStart) <= Math.abs(t - clipEnd) ? 'start' : 'end';
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        setDragging(activeDrag);
      };

      const onMove = (e) => {
        if (!activeDrag) return;
        e.preventDefault();
        const { clipStart, clipEnd, duration, onChangeStart, onChangeEnd } = liveRef.current;
        const t = pctToTime(e);
        if (activeDrag === 'start') {
          const clamped = Math.max(0, Math.min(t, clipEnd - MIN_CLIP));
          onChangeStart(Math.max(clamped, clipEnd - MAX_CLIP));
        } else {
          const clamped = Math.min(duration, Math.max(t, clipStart + MIN_CLIP));
          onChangeEnd(Math.min(clamped, clipStart + MAX_CLIP));
        }
      };

      const onUp = () => {
        activeDrag = null;
        setDragging(null);
      };

      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);

      barRef.current = {
        _cleanup: () => {
          el.removeEventListener('pointerdown', onDown);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onUp);
        },
      };
    }, 300);

    return () => {
      clearTimeout(timer);
      if (barRef.current?._cleanup) barRef.current._cleanup();
    };
  }, [barId]);

  return (
    <View style={clipStyles.container}>
      {/* Header */}
      <View style={clipStyles.header}>
        <View style={clipStyles.headerLeft}>
          <Ionicons name="cut" size={16} color={accent} />
          <Text style={[clipStyles.headerTitle, { color: accent }]}>CLIP & SHARE</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={8} style={clipStyles.closeBtn}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Range selector */}
      <View style={clipStyles.rangeSection}>
        <Text style={clipStyles.rangeLabel}>DRAG HANDLES TO SELECT 10–30 SEC</Text>
        <View
          ref={barRef}
          dataSet={{ clipbar: barId }}
          style={clipStyles.rangeBar}
          onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width; }}
        >
          {/* Full track */}
          <View style={clipStyles.rangeBg} />
          {/* Selected range highlight */}
          <View style={[
            clipStyles.rangeHighlight,
            { left: `${startPct}%`, width: `${endPct - startPct}%`, backgroundColor: accent + '35' },
          ]} />
          {/* Start handle */}
          <View style={[
            clipStyles.handle,
            { left: `${startPct}%`, backgroundColor: accent },
            dragging === 'start' && clipStyles.handleActive,
          ]}>
            <View style={clipStyles.handleLine} />
          </View>
          {/* End handle */}
          <View style={[
            clipStyles.handle,
            { left: `${endPct}%`, backgroundColor: accent },
            dragging === 'end' && clipStyles.handleActive,
          ]}>
            <View style={clipStyles.handleLine} />
          </View>
        </View>

        {/* Time readout */}
        <View style={clipStyles.timeRow}>
          <Text style={[clipStyles.timeLabel, { color: accent }]}>{formatSec(clipStart)}</Text>
          <View style={clipStyles.durationBadge}>
            <Text style={[
              clipStyles.durationText,
              { color: isValid ? accent : colors.error },
            ]}>
              {clipDuration}s {!isValid ? (clipDuration < MIN_CLIP ? '(too short)' : '(too long)') : ''}
            </Text>
          </View>
          <Text style={[clipStyles.timeLabel, { color: accent }]}>{formatSec(clipEnd)}</Text>
        </View>
      </View>

      {/* Branded preview card — shows what the shared link looks like */}
      <View style={clipStyles.previewCard}>
        <View style={clipStyles.previewThumbWrap}>
          {itemThumbnail ? (
            <FastImage uri={itemThumbnail} itemId="clip-preview" style={clipStyles.previewThumb} contentFit="cover" />
          ) : (
            <View style={[clipStyles.previewThumb, { backgroundColor: '#1a1a1a' }]} />
          )}
          <View style={[clipStyles.previewBadge, { backgroundColor: accent }]}>
            <Text style={clipStyles.previewBadgeText}>{clipDuration}s CLIP</Text>
          </View>
        </View>
        <View style={clipStyles.previewInfo}>
          <Text style={clipStyles.previewBrand}>VOIDtv</Text>
          <Text style={clipStyles.previewTitle} numberOfLines={2}>{itemTitle || 'Untitled'}</Text>
          <Text style={[clipStyles.previewMeta, { color: accent }]}>
            {formatSec(clipStart)}–{formatSec(clipEnd)}{itemYear ? ` · ${itemYear}` : ''}
          </Text>
          <Text style={clipStyles.previewTagline}>generating since 1895</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={clipStyles.actions}>
        <TouchableOpacity
          onPress={onPreview}
          style={[clipStyles.actionBtn, { borderColor: accent + '55' }]}
          activeOpacity={0.7}
        >
          <Ionicons name="play" size={14} color={accent} />
          <Text style={[clipStyles.actionBtnText, { color: accent }]}>PREVIEW</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCopyLink}
          style={[clipStyles.actionBtn, copied && { borderColor: accent, backgroundColor: accent + '15' }]}
          activeOpacity={0.7}
        >
          <Ionicons name={copied ? "checkmark-circle" : "link-outline"} size={14} color={copied ? accent : colors.textPrimary} />
          <Text style={[clipStyles.actionBtnText, copied && { color: accent }]}>{copied ? 'COPIED!' : 'COPY LINK'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onShareTwitter}
          style={clipStyles.actionBtn}
          activeOpacity={0.7}
          disabled={!isValid}
        >
          <Ionicons name="logo-twitter" size={14} color="#1DA1F2" />
          <Text style={clipStyles.actionBtnText}>X</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onShareFacebook}
          style={clipStyles.actionBtn}
          activeOpacity={0.7}
          disabled={!isValid}
        >
          <Ionicons name="logo-facebook" size={14} color="#1877F2" />
          <Text style={clipStyles.actionBtnText}>FB</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const clipStyles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.screenPadding,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5 },
  closeBtn: { padding: 4 },
  rangeSection: { marginBottom: 14 },
  rangeLabel: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted,
    letterSpacing: 0.8, marginBottom: 10, textAlign: 'center',
  },
  rangeBar: {
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    cursor: Platform.OS === 'web' ? 'pointer' : undefined,
  },
  rangeBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
  },
  rangeHighlight: {
    position: 'absolute',
    top: 19,
    height: 6,
    borderRadius: 3,
  },
  handle: {
    position: 'absolute',
    top: 8,
    width: 20,
    height: 28,
    marginLeft: -10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleActive: {
    width: 24,
    height: 32,
    marginLeft: -12,
    top: 6,
  },
  handleLine: {
    width: 2,
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 1,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  timeLabel: { fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 0.5 },
  durationBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  durationText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.5 },
  // Branded preview card
  previewCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewThumbWrap: {
    width: 100,
    height: 80,
    position: 'relative',
  },
  previewThumb: {
    width: 100,
    height: 80,
  },
  previewBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  previewBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 8,
    color: '#000',
    letterSpacing: 0.5,
  },
  previewInfo: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  previewBrand: {
    fontFamily: fonts.monoBold,
    fontSize: 8,
    letterSpacing: 2,
    color: '#f5a623',
    marginBottom: 3,
  },
  previewTitle: {
    fontFamily: fonts.sansMedium || fonts.sans,
    fontSize: 12,
    color: '#e8e0d4',
    lineHeight: 15,
    marginBottom: 2,
  },
  previewMeta: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  previewTagline: {
    fontFamily: fonts.monoBold,
    fontSize: 8,
    color: '#5cb8ff',
    letterSpacing: 1,
    marginTop: 2,
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontFamily: fonts.monoBold, fontSize: 9, color: colors.textPrimary, letterSpacing: 0.5,
  },
});

/* ── X-Ray Styles ── */
const xrayStyles = StyleSheet.create({
  section: {
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface + '80',
  },
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  chipValue: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipExtra: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 8,
  },
  tag: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  factsWrap: {
    paddingHorizontal: spacing.screenPadding,
    gap: 8,
    marginBottom: 8,
  },
  factCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
  },
  factLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 3,
  },
  factText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  factAuthor: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textGhost,
    marginTop: 4,
  },
  warningRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: spacing.screenPadding,
  },
  warningChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  warningText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: '#ff6b6b',
    letterSpacing: 0.3,
  },

  // Contribute button
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: spacing.screenPadding,
    marginVertical: 10,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  contributeBtnText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  contributeBtnXP: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textGhost,
    letterSpacing: 0.5,
  },

  // Contribute panel
  contributePanel: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 12,
  },
  typeScroll: {
    marginBottom: 10,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
  },
  typeChipText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  typeChipXP: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textGhost,
  },
  inputRow: {
    gap: 8,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    minHeight: 42,
  },
  inputSmall: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  submitText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1,
  },
});

/* Compact action button — icon + label inline */
function ActionIcon({ icon, label, color, onPress, loading }) {
  // Mobile: icon-above-tiny-label, flex:1 — six labeled row-buttons overflowed a 390px viewport
  // (the strip measured 491px; Share was clipped, Download fully off-screen with overflow-x hidden).
  return (
    <TouchableOpacity
      onPress={onPress}
      style={IS_DESKTOP ? styles.actionIcon : styles.actionIconCompact}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      {loading ? <ActivityIndicator color={color || colors.textPrimary} size="small" style={{ height: 16 }} />
        : icon ? <Ionicons name={icon} size={IS_DESKTOP ? 16 : 18} color={color || colors.textPrimary} />
        : null}
      <Text style={[IS_DESKTOP ? styles.actionIconLabel : styles.actionIconLabelCompact, color ? { color } : null]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  xpToast: {
    position: 'absolute', top: 60, right: 16, zIndex: 99,
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  xpToastText: { fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 1 },
  playerArea: { backgroundColor: '#000', width: '100%', position: 'relative' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5 },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  errorText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  // Overlay buttons on video area
  overlayBack: {
    position: 'absolute', left: 12,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
  },
  // VOIDtv logo / exit — a pill CENTERED at the top of the video (reads over any frame).
  exitLogoWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  exitLogo: {
    paddingVertical: 5, paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row', alignItems: 'center',
  },
  exitLogoText: {
    fontFamily: fonts.monoBold, fontSize: 16, letterSpacing: 1.5, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  exitLogoTv: { color: '#5cb8ff', fontSize: 11, letterSpacing: 1 },
  overlayFs: {
    position: 'absolute', right: 12,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
  },

  // ── Redesigned info panel ──
  infoPanel: { flex: 1, backgroundColor: colors.bg },

  titleBlock: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: {
    fontFamily: fonts.sansSemiBold, fontSize: 20, color: colors.textPrimary,
    lineHeight: 26, flex: 1,
  },
  metaChips: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 4, flexWrap: 'wrap',
  },
  metaChip: {
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  metaChipText: { fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 0.8 },
  creatorText: {
    fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary,
    maxWidth: '60%',
  },
  durationText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },
  viewCountWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewCountText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },

  // ── Browse series / creator chips — always visible under title ──
  seriesChipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 6, paddingBottom: 2,
  },
  seriesChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    maxWidth: '90%',
  },
  seriesChipText: {
    fontFamily: fonts.sansMedium, fontSize: 13,
    flexShrink: 1,
  },

  // Compact horizontal action strip
  actionStrip: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 6, paddingHorizontal: spacing.screenPadding,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface + '80',
  },
  actionIcon: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 8,
  },
  actionIconLabel: {
    fontFamily: fonts.sans, fontSize: 12, color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  // Mobile: compact column buttons that share the row evenly — never overflow the viewport
  actionIconCompact: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingVertical: 6, paddingHorizontal: 2,
  },
  actionIconLabelCompact: {
    fontFamily: fonts.sans, fontSize: 9.5, color: colors.textSecondary,
    letterSpacing: 0.2,
  },

  // Share drawer
  shareDrawer: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface + '80',
  },
  shareChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  shareChipText: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.textPrimary, letterSpacing: 0.5 },

  // Expandable Info Tab
  infoTab: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTabExpanded: {
    paddingBottom: 12,
  },
  infoTabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  infoTabLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  descText: {
    fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary,
    lineHeight: 22, letterSpacing: 0.1,
  },
  infoTabBody: {},
  infoMetaGrid: {
    gap: 8,
    marginBottom: 10,
  },
  infoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoMetaLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textGhost,
    letterSpacing: 0.5,
    width: 70,
  },
  infoMetaValue: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  infoTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 10,
  },
  infoTagChip: {
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTagText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  browseChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  browseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 180,
  },
  browseChipText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  archiveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  archiveLinkText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  descMore: { fontFamily: fonts.monoBold, fontSize: 11, marginTop: 4 },

  // Rabbit hole
  rabbitSection: { marginTop: 6, paddingBottom: 8 },
  rabbitToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.screenPadding, paddingVertical: 10,
  },
  rabbitIcon: { fontSize: 18 },
  rabbitToggleText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 },
  rabbitToggleCount: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, flex: 1 },
  sectionLine: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 12,
  },
  sectionLineBorder: { flex: 1, height: 1 },
  sectionLineBorderDim: { flex: 1, height: 1, backgroundColor: colors.surface },
  rabbitEmoji: { fontSize: 13 },
  sectionLabel: { fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 1.5 },
  sectionLabelDim: { fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 1.5, color: colors.textGhost },
  sectionSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  rabbitList: { paddingHorizontal: spacing.screenPadding },
  rabbitCard: { width: 130, marginRight: 10 },
  rabbitThumb: { width: 130, height: 78, borderRadius: 6, backgroundColor: colors.card },
  rabbitCardInfo: { paddingTop: 5 },
  rabbitCardTitle: { fontFamily: fonts.sans, fontSize: 11, color: colors.textPrimary, lineHeight: 14 },
  rabbitCardYear: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },

  // Formats
  formatsSection: { paddingHorizontal: spacing.screenPadding, marginBottom: 32, marginTop: 10 },
  formatRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  formatName: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, flex: 1, marginRight: 10 },
  formatSize: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  episodeSeason: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textMuted, letterSpacing: 1, marginTop: 14, marginBottom: 4 },

  // ── Desktop two-column layout ──
  desktopRow: { flex: 1, flexDirection: 'row', paddingRight: 6 },
  // flex:1 + minWidth:0 so the video column fills ALL space the sidebar doesn't take
  // (without minWidth:0 a flex child won't shrink below its content's intrinsic width).
  // NO `flex: 1` here — its flex-basis:0% beats the explicit `width: AVAILABLE_W` set in the
  // render (flexGrow:0), collapsing the video column to ~0 and rendering the player tiny.
  desktopMain: { minWidth: 0 },

  // ── Mobile autoplay row ──
  mobileAutoplayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.screenPadding, paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface + '60',
  },
  mobileAutoplayLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5 },
  mobileUpNextHint: {
    flex: 1, fontFamily: fonts.sans, fontSize: 10, color: colors.textGhost,
    marginLeft: 4,
  },

  // ── Autoplay toggle (shared) ──
  autoplayToggle: {
    width: 34, height: 18, borderRadius: 9,
    backgroundColor: colors.surface,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  autoplayKnob: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.textMuted,
  },
  autoplayKnobOn: {
    backgroundColor: '#fff', alignSelf: 'flex-end',
  },

  // ── Desktop sidebar — YouTube-style with filter chips ──
  sidebar: {
    width: SIDEBAR_W || 360,
    flexGrow: 0, flexShrink: 0,   // pin to 360 — don't let the ScrollView grow into the video column
    backgroundColor: colors.bg,
    borderLeftWidth: 1, borderLeftColor: colors.surface,
    paddingLeft: 12, paddingRight: 8, paddingTop: 8,
  },
  // Filter chips — YouTube "All / From Creator / Collection" style
  sidebarChipScroll: { marginBottom: 10 },
  sidebarChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full,
  },
  sidebarChipText: {
    fontFamily: fonts.sansMedium, fontSize: 13,
  },
  sidebarAutoplay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  sidebarAutoplayLabel: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
  // Sidebar video cards — match YouTube's thumbnail + title + creator + meta
  sidebarRelCard: {
    flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start',
  },
  sidebarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  sidebarRelCardGrid: { width: '48.5%' }, // 2-up grid in the wide desktop channel sidebar
  sidebarThumbWrap: { position: 'relative' },
  sidebarRelThumb: { width: 168, height: 94, borderRadius: 8, backgroundColor: colors.card },
  sidebarUpNextBadge: {
    position: 'absolute', top: 4, left: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3,
  },
  sidebarUpNextBadgeText: { fontFamily: fonts.monoBold, fontSize: 8, color: colors.bg, letterSpacing: 0.5 },
  sidebarRelInfo: { flex: 1, paddingTop: 2 },
  sidebarRelTitle: {
    fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textPrimary,
    lineHeight: 20, marginBottom: 3,
  },
  sidebarRelCreator: {
    fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted,
    lineHeight: 16,
  },
  sidebarRelMeta: {
    fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted,
    lineHeight: 16, marginTop: 1,
  },
  sidebarRelYear: { fontFamily: fonts.mono, fontSize: 11, marginTop: 2 },
  sidebarShuffleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, marginTop: 6, borderRadius: radius.sm,
    borderWidth: 1, opacity: 0.7,
  },
  sidebarShuffleText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.2 },

  // ── Skeleton loading ──
  // Animation applied via CSS `[data-skeleton]` selector (injected in useEffect above)
  skeletonPulse: {
    opacity: 0.4,
  },
  skeletonLine: {
    height: 10, borderRadius: 3, backgroundColor: colors.surface,
    opacity: 0.4,
  },

  // ── Comments ──
  commentsSection: {
    marginTop: 10, paddingHorizontal: spacing.screenPadding,
  },
  commentsSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8,
  },
  commentsPreview: { paddingBottom: 4 },
  commentRow: {
    flexDirection: 'row', gap: 6, paddingVertical: 3, alignItems: 'baseline',
  },
  commentAuthor: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textSecondary, letterSpacing: 0.3 },
  commentBody: { fontFamily: fonts.sans, fontSize: 14, color: colors.textPrimary, lineHeight: 20, flex: 1 },
  commentTime: { fontFamily: fonts.mono, fontSize: 8, color: colors.textGhost },
  commentsExpanded: { paddingTop: 4, paddingBottom: 10 },
  composeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'flex-end',
  },
  composeInput: {
    flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.textPrimary,
    backgroundColor: colors.surface + '40', borderRadius: radius.sm,
    borderWidth: 1, padding: 10, minHeight: 38, maxHeight: 80,
    textAlignVertical: 'top',
  },
  composeBtn: {
    width: 38, height: 38, borderRadius: radius.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  commentRank: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  commentSignIn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  commentSignInText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.2 },
  commentCard: {
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface + '60',
  },
  commentHeader: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 3,
  },
  commentsEmpty: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.textGhost,
    textAlign: 'center', paddingVertical: 16,
  },
});
