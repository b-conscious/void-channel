import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator, Linking, Alert, Animated, Dimensions, LayoutAnimation,
  Platform, UIManager, Share, TextInput,
} from 'react-native';
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';
const IS_DESKTOP = IS_WEB && SCREEN_W > 900;
const VIDEO_H = IS_WEB ? Math.round(SCREEN_H * 0.52) : Math.round(SCREEN_H * 0.42);
const SIDEBAR_W = IS_DESKTOP ? 340 : 0;

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from '../components/FastImage';
import VideoPlayer from '../components/VideoPlayer';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import { useGeneration } from '../context/GenerationContext';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, radius } from '../theme';

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

export default function PlayerScreen({ route, navigation }) {
  const { item: stub, categoryId, queue, queueIndex, channelLabel } = route.params;
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const { onWatchItem, onContribute, XP_REWARDS } = useGame();
  const { user, isAuthenticated } = useAuth();
  const accent = gen.accentColor;
  const inChannel = Array.isArray(queue) && queue.length > 0;

  // When the current video ends, advance to next item (channel queue or autoplay related).
  const handleVideoEnded = useCallback(() => {
    // Fire "complete" watch event
    api.sendWatchEvent({
      item_id: stub.id, item_title: stub.title,
      category_id: categoryId || null,
      event_type: 'complete', watch_percent: 100,
    }).catch(() => {});

    if (inChannel) {
      const nextIndex = ((queueIndex ?? 0) + 1) % queue.length;
      const nextItem = queue[nextIndex];
      navigation.replace("Player", {
        item: nextItem, queue, queueIndex: nextIndex, categoryId, channelLabel,
      });
    } else if (autoplay && relatedItems.length > 0) {
      navigation.replace("Player", { item: relatedItems[0] });
    }
  }, [stub, inChannel, queue, queueIndex, categoryId, channelLabel, navigation, autoplay, relatedItems]);

  // Build an optimistic video URL — Archive.org commonly has a 512Kb MPEG4 at a predictable path.
  // This lets us start playback almost instantly while the real metadata loads in the background.
  const guessVideoUrl = useCallback((id) => {
    if (!id) return null;
    return `https://archive.org/download/${id}/${id}_512kb.mp4`;
  }, []);

  const [item, setItem] = useState(stub);
  const [videoUrl, setVideoUrl] = useState(stub.videoUrl || guessVideoUrl(stub.id));
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
  const watchStartSent = useRef(false);
  const xpOpacity = useRef(new Animated.Value(0)).current;
  const xpFired = useRef(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

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

        // If a higher-quality version exists, upgrade after 5 seconds of playback
        if (full.videoUrlHQ && full.videoUrlHQ !== full.videoUrl) {
          setTimeout(() => {
            if (!cancelled) {
              setVideoUrl(full.videoUrlHQ);
            }
          }, 5000);
        }

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
        api.getRelated(stub.id, 20).then(setRelatedItems).catch(() => {});
        api.getComments(stub.id).then((c) => { if (!cancelled) setComments(c.comments || []); }).catch(() => {});
        api.getXRay(stub.id).then((xray) => {
          if (xray && !cancelled) {
            setXrayData(xray.contributions || {});
            setXrayTotal(xray.total || 0);
          }
        }).catch(() => {});
      } catch (err) {
        if (cancelled) return;
        console.error('[PlayerScreen]', err);
        // Only show error if we don't have an optimistic URL playing
        if (!videoUrl) setError('Could not load video details.');
      }
    })();

    return () => { cancelled = true; };
  }, [stub.id]);

  function showXpToast(amount) {
    setXpToast(`+${amount} XP`);
    Animated.sequence([
      Animated.timing(xpOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(xpOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }

  const videoSource = localUri || videoUrl;

  // If the optimistic URL fails, fall back to the confirmed URL from metadata
  const handleVideoError = useCallback(() => {
    if (!videoReady && item.videoUrl && item.videoUrl !== videoUrl) {
      console.log('[PlayerScreen] Optimistic URL failed, falling back to confirmed URL');
      setVideoUrl(item.videoUrl);
      setVideoReady(true);
    }
  }, [videoReady, item.videoUrl, videoUrl]);

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
    return `https://void-channel.onrender.com/watch/${item.id}?start=${clipStart}&end=${clipEnd}`;
  }, [item, clipStart, clipEnd]);

  const getClipText = useCallback(() => {
    const formatSec = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    return `${item.title} [${formatSec(clipStart)}–${formatSec(clipEnd)}] — generating since 1895 // Void Channel`;
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
    const text = encodeURIComponent(getClipText());
    const url = encodeURIComponent(getClipUrl());
    Linking.openURL(`https://twitter.com/intent/tweet?text=${text}&url=${url}`);
  }, [getClipText, getClipUrl]);

  const handleClipShareFacebook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = encodeURIComponent(getClipUrl());
    Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
  }, [getClipUrl]);

  const handleClipPreview = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Seek to clip start and play
    if (videoRef.current?.seekTo) {
      videoRef.current.seekTo(clipStart);
    }
  }, [clipStart]);

  const getShareUrl = useCallback(() => {
    return `https://void-channel.onrender.com/watch/${item.id}`;
  }, [item]);

  const getShareText = useCallback(() => {
    return `${item.title} — generating since 1895 // Void Channel`;
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
    const url = encodeURIComponent(getShareUrl());
    Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
  }, [getShareUrl]);

  const handleShareTwitter = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = encodeURIComponent(getShareText());
    const url = encodeURIComponent(getShareUrl());
    Linking.openURL(`https://twitter.com/intent/tweet?text=${text}&url=${url}`);
  }, [getShareText, getShareUrl]);

  const handleShareReddit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const title = encodeURIComponent(getShareText());
    const url = encodeURIComponent(getShareUrl());
    Linking.openURL(`https://www.reddit.com/submit?url=${url}&title=${title}`);
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

  // Desktop sidebar — related videos shown vertically like YouTube
  const SidebarContent = IS_DESKTOP ? (
    <ScrollView style={styles.sidebar} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Autoplay toggle */}
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

      {/* Up Next */}
      {relatedItems.length > 0 && (
        <>
          <View style={styles.sidebarUpNext}>
            <Text style={[styles.sidebarUpNextLabel, { color: accent }]}>UP NEXT</Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.replace('Player', { item: relatedItems[0] });
            }}
            style={styles.sidebarUpNextCard}
          >
            <FastImage uri={relatedItems[0].thumbnail} itemId={relatedItems[0].id} style={styles.sidebarUpNextThumb} contentFit="cover" />
            <View style={styles.sidebarUpNextInfo}>
              <Text style={styles.sidebarUpNextTitle} numberOfLines={2}>{relatedItems[0].title}</Text>
              {relatedItems[0].year ? <Text style={[styles.sidebarUpNextYear, { color: accent }]}>{relatedItems[0].year}</Text> : null}
              {relatedItems[0].creator ? <Text style={styles.sidebarUpNextCreator} numberOfLines={1}>
                {Array.isArray(relatedItems[0].creator) ? relatedItems[0].creator[0] : relatedItems[0].creator}
              </Text> : null}
            </View>
          </Pressable>

          {/* Separator */}
          <View style={styles.sidebarDivider} />

          {/* More related */}
          <Text style={styles.sidebarSectionLabel}>RABBIT HOLE</Text>
          {relatedItems.slice(1).map((rel) => (
            <Pressable
              key={rel.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.replace('Player', { item: rel });
              }}
              style={styles.sidebarRelCard}
            >
              <FastImage uri={rel.thumbnail} itemId={rel.id} style={styles.sidebarRelThumb} contentFit="cover" />
              <View style={styles.sidebarRelInfo}>
                <Text style={styles.sidebarRelTitle} numberOfLines={2}>{rel.title}</Text>
                {rel.year ? <Text style={[styles.sidebarRelYear, { color: accent }]}>{rel.year}</Text> : null}
                {rel.creator ? <Text style={styles.sidebarRelCreator} numberOfLines={1}>
                  {Array.isArray(rel.creator) ? rel.creator[0] : rel.creator}
                </Text> : null}
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  ) : null;

  return (
    <View style={styles.container}>
      {/* XP toast */}
      {xpToast && (
        <Animated.View style={[styles.xpToast, { opacity: xpOpacity, borderColor: accent }]}>
          <Text style={[styles.xpToastText, { color: accent }]}>{xpToast}</Text>
        </Animated.View>
      )}

      {/* Desktop: two-column row. Mobile: stacked. */}
      <View style={IS_DESKTOP ? styles.desktopRow : { flex: 1 }}>
        {/* Left column: video + info */}
        <View style={IS_DESKTOP ? styles.desktopMain : { flex: 1 }}>

      {/* Video area — taller default */}
      <View style={[styles.playerArea, { height: infoExpanded ? VIDEO_H * 0.7 : VIDEO_H }]}>
        {!videoSource ? (
          <View style={styles.loadingWrap}>
            {error ? (
              <>
                <Ionicons name="warning-outline" size={40} color={colors.textMuted} />
                <Text style={styles.errorText}>{error}</Text>
              </>
            ) : (
              <>
                <ActivityIndicator color={accent} size="large" />
                <Text style={[styles.loadingText, { color: accent }]}>LOADING VIDEO...</Text>
              </>
            )}
          </View>
        ) : (
          <VideoPlayer
            ref={videoRef}
            videoUrl={videoSource}
            title={item.title}
            onBack={() => navigation.goBack()}
            onEnded={(inChannel || autoplay) ? handleVideoEnded : undefined}
            onVideoError={handleVideoError}
            channelLabel={inChannel ? channelLabel || "CHANNEL" : undefined}
          />
        )}

        {/* Back/fullscreen overlay only when video player is NOT shown */}
        {!videoSource && (
          <TouchableOpacity
            style={[styles.overlayBack, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Mobile autoplay toggle — below video */}
      {!IS_DESKTOP && (
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
      )}

      {/* ── Info panel below video ── */}
      <ScrollView
        style={styles.infoPanel}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
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
            icon="list-outline"
            label="Playlist"
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
          <ActionIcon
            icon="globe-outline"
            label="Void Page"
            color={colors.textPrimary}
            onPress={() => Linking.openURL(`https://void-channel.onrender.com/watch/${item.id}`)}
          />
        </View>

        {/* ── Share drawer ── */}
        {shareExpanded && (
          <View style={styles.shareDrawer}>
            <TouchableOpacity style={[styles.shareChip, copied && { borderColor: accent, backgroundColor: accent + '15' }]} onPress={handleCopyLink} activeOpacity={0.7}>
              <Ionicons name={copied ? "checkmark-circle" : "link-outline"} size={16} color={copied ? accent : colors.textPrimary} />
              <Text style={[styles.shareChipText, copied && { color: accent }]}>{copied ? 'COPIED!' : 'COPY LINK'}</Text>
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
            onClose={() => setClipMode(false)}
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

        {/* ── Comments Section ── */}
        <View style={styles.commentsSection}>
          <TouchableOpacity
            onPress={() => setCommentsExpanded((v) => !v)}
            style={styles.commentsSectionHeader}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={13} color={accent} />
            <Text style={[styles.sectionLabel, { color: accent }]}>COMMENTS</Text>
            <Text style={styles.sectionSub}>{comments.length > 0 ? `${comments.length}` : 'be first'}</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={commentsExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Preview — show first 2 when collapsed */}
          {!commentsExpanded && comments.length > 0 && (
            <View style={styles.commentsPreview}>
              {comments.slice(0, 2).map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>{c.username || 'anon'}</Text>
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
                          username: user?.username || user?.display_name || 'you',
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
                >
                  <Text style={[styles.commentSignInText, { color: accent }]}>SIGN IN TO COMMENT</Text>
                </TouchableOpacity>
              )}

              {/* Comment list */}
              {comments.map((c) => (
                <View key={c.id} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: accent }]}>{c.username || 'anon'}</Text>
                    <Text style={styles.commentTime}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}
                    </Text>
                  </View>
                  <Text style={styles.commentBody}>{c.body}</Text>
                </View>
              ))}
              {comments.length === 0 && (
                <Text style={styles.commentsEmpty}>No comments yet — start the conversation.</Text>
              )}
            </View>
          )}
        </View>

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
                      navigation.replace('Player', { item: rel });
                    }}
                    style={styles.rabbitCard}
                  >
                    <FastImage uri={rel.thumbnail} itemId={rel.id} style={styles.rabbitThumb} contentFit="cover" />
                    <View style={styles.rabbitCardInfo}>
                      <Text style={styles.rabbitCardTitle} numberOfLines={2}>{rel.title}</Text>
                      {rel.year ? <Text style={[styles.rabbitCardYear, { color: accent }]}>{rel.year}</Text> : null}
                    </View>
                  </Pressable>
                )}
              />
            )}
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
      </ScrollView>

        </View>{/* end desktopMain or flex:1 */}

        {/* Desktop sidebar */}
        {SidebarContent}
      </View>{/* end desktopRow or flex:1 */}

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

  // Web pointer events for dragging handles
  const barId = React.useRef(`clip-bar-${Math.random().toString(36).slice(2, 8)}`).current;

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-clipbar="${barId}"]`);
      if (!el) return;

      let activeDrag = null;

      const pctToTime = (e) => {
        const rect = el.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        return Math.round(pct * duration);
      };

      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = pctToTime(e);
        const distStart = Math.abs(t - clipStart);
        const distEnd = Math.abs(t - clipEnd);
        activeDrag = distStart <= distEnd ? 'start' : 'end';
        el.setPointerCapture(e.pointerId);
        setDragging(activeDrag);
      };

      const onMove = (e) => {
        if (!activeDrag) return;
        e.preventDefault();
        const t = pctToTime(e);
        if (activeDrag === 'start') {
          const clamped = Math.max(0, Math.min(t, clipEnd - MIN_CLIP));
          const limited = Math.max(clamped, clipEnd - MAX_CLIP);
          onChangeStart(limited);
        } else {
          const clamped = Math.min(duration, Math.max(t, clipStart + MIN_CLIP));
          const limited = Math.min(clamped, clipStart + MAX_CLIP);
          onChangeEnd(limited);
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
  }, [barId, duration, clipStart, clipEnd, onChangeStart, onChangeEnd]);

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
          <Text style={clipStyles.previewBrand}>VOID CHANNEL</Text>
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
    fontFamily: fonts.mono,
    fontSize: 8,
    color: '#555',
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
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  chipValue: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textPrimary,
  },
  chipExtra: {
    fontFamily: fonts.sans,
    fontSize: 11,
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
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.actionIcon}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      {loading ? <ActivityIndicator color={color || colors.textPrimary} size="small" style={{ height: 16 }} />
        : icon ? <Ionicons name={icon} size={16} color={color || colors.textPrimary} />
        : null}
      <Text style={[styles.actionIconLabel, color ? { color } : null]}>{label}</Text>
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
    fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.textPrimary,
    lineHeight: 20, flex: 1,
  },
  metaChips: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 3, flexWrap: 'wrap',
  },
  metaChip: {
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  metaChipText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1 },
  creatorText: {
    fontFamily: fonts.sans, fontSize: 12, color: colors.textSecondary,
    maxWidth: '60%',
  },
  durationText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  viewCountWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewCountText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted },

  // Compact horizontal action strip
  actionStrip: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 6, paddingHorizontal: spacing.screenPadding,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface + '80',
  },
  actionIcon: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 6,
  },
  actionIconLabel: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted,
    letterSpacing: 0.5,
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
    fontSize: 10,
    letterSpacing: 1.5,
  },
  descText: {
    fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary,
    lineHeight: 20,
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
    fontSize: 10,
    color: colors.textGhost,
    letterSpacing: 0.5,
    width: 60,
  },
  infoMetaValue: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.text,
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
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  archiveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  archiveLinkText: {
    fontFamily: fonts.mono,
    fontSize: 10,
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
  sectionLabel: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 },
  sectionLabelDim: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5, color: colors.textGhost },
  sectionSub: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
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
  formatName: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary },
  formatSize: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },

  // ── Desktop two-column layout ──
  desktopRow: { flex: 1, flexDirection: 'row' },
  desktopMain: { flex: 1 },

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

  // ── Desktop sidebar ──
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: colors.bg,
    borderLeftWidth: 1, borderLeftColor: colors.surface,
    paddingHorizontal: 14, paddingTop: 12,
  },
  sidebarAutoplay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  sidebarAutoplayLabel: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
  sidebarUpNext: { marginBottom: 8 },
  sidebarUpNextLabel: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 2 },
  sidebarUpNextCard: {
    flexDirection: 'row', gap: 10, padding: 8,
    borderRadius: radius.md, backgroundColor: colors.surface + '40',
    borderWidth: 1, borderColor: colors.surface,
  },
  sidebarUpNextThumb: { width: 120, height: 72, borderRadius: 6, backgroundColor: colors.card },
  sidebarUpNextInfo: { flex: 1, justifyContent: 'center' },
  sidebarUpNextTitle: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textPrimary, lineHeight: 17 },
  sidebarUpNextYear: { fontFamily: fonts.mono, fontSize: 10, marginTop: 3 },
  sidebarUpNextCreator: { fontFamily: fonts.sans, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  sidebarDivider: {
    height: 1, backgroundColor: colors.surface, marginVertical: 12,
  },
  sidebarSectionLabel: {
    fontFamily: fonts.monoBold, fontSize: 9, color: colors.textMuted,
    letterSpacing: 1.5, marginBottom: 10,
  },
  sidebarRelCard: {
    flexDirection: 'row', gap: 8, marginBottom: 10,
  },
  sidebarRelThumb: { width: 100, height: 60, borderRadius: 4, backgroundColor: colors.card },
  sidebarRelInfo: { flex: 1, justifyContent: 'center' },
  sidebarRelTitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textPrimary, lineHeight: 15 },
  sidebarRelYear: { fontFamily: fonts.mono, fontSize: 9, marginTop: 2 },
  sidebarRelCreator: { fontFamily: fonts.sans, fontSize: 10, color: colors.textMuted, marginTop: 1 },

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
  commentBody: { fontFamily: fonts.sans, fontSize: 12, color: colors.textPrimary, lineHeight: 16, flex: 1 },
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
  commentSignIn: { paddingVertical: 10 },
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
