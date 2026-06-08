import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator, Linking, Alert, Animated, Dimensions, LayoutAnimation,
  Platform, UIManager, Share,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');
const VIDEO_H = Math.round(SCREEN_H * 0.42);

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import VideoPlayer from '../components/VideoPlayer';
import { useGeneration } from '../context/GenerationContext';
import { useGame } from '../context/GameContext';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, radius } from '../theme';

export default function PlayerScreen({ route, navigation }) {
  const { item: stub, categoryId, queue, queueIndex, channelLabel } = route.params;
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const { onWatchItem } = useGame();
  const accent = gen.accentColor;
  const inChannel = Array.isArray(queue) && queue.length > 0;

  // When the current video ends, advance to the next item in the channel queue.
  // Loops back to the start when we reach the end.
  const handleVideoEnded = useCallback(() => {
    if (!inChannel) return;
    const nextIndex = ((queueIndex ?? 0) + 1) % queue.length;
    const nextItem = queue[nextIndex];
    navigation.replace("Player", {
      item: nextItem, queue, queueIndex: nextIndex, categoryId, channelLabel,
    });
  }, [inChannel, queue, queueIndex, categoryId, channelLabel, navigation]);

  const [item, setItem] = useState(stub);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [hearted, setHearted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localUri, setLocalUri] = useState(null);
  const [xpToast, setXpToast] = useState(null);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const xpOpacity = useRef(new Animated.Value(0)).current;
  const xpFired = useRef(false);
  const videoRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [local, saved, isFav, full] = await Promise.all([
          store.getLocalVideo(stub.id),
          store.isInWatchlist(stub.id),
          store.isHearted(stub.id),
          api.getItem(stub.id),
        ]);
        if (local) setLocalUri(local);
        setInWatchlist(saved);
        setHearted(isFav);

        // archive.org's metadata endpoint doesn't return `downloads`, but the search/category
        // endpoint does. Preserve it from the stub so the "rare item" XP bonus + bounty checks work.
        const merged = {
          ...full,
          downloads: typeof full.downloads === 'number' ? full.downloads : stub.downloads,
        };
        setItem(merged);
        await store.addToHistory(merged);

        // Fire XP event once per mount
        if (!xpFired.current) {
          xpFired.current = true;
          const result = await onWatchItem(merged, categoryId || null);
          if (result?.xpGained > 0) showXpToast(result.xpGained);
        }

        // Fetch rabbit hole (related) items in background
        api.getRelated(stub.id, 12).then(setRelatedItems).catch(() => {});
      } catch (err) {
        console.error('[PlayerScreen]', err);
        setError('Could not load video details.');
      } finally {
        setLoading(false);
      }
    })();
  }, [stub.id]);

  function showXpToast(amount) {
    setXpToast(`+${amount} XP`);
    Animated.sequence([
      Animated.timing(xpOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(xpOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }

  const videoSource = localUri || item.videoUrl;

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

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = item.archiveUrl || `https://void-channel.vercel.app`;
    try {
      await Share.share({
        message: Platform.OS === 'ios'
          ? `${item.title} — found on Void Channel`
          : `${item.title} — found on Void Channel\n${url}`,
        url: Platform.OS === 'ios' ? url : undefined,
        title: item.title,
      });
    } catch {}
  }, [item]);

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

  return (
    <View style={styles.container}>
      {/* XP toast */}
      {xpToast && (
        <Animated.View style={[styles.xpToast, { opacity: xpOpacity, borderColor: accent }]}>
          <Text style={[styles.xpToastText, { color: accent }]}>{xpToast}</Text>
        </Animated.View>
      )}

      {/* Video area — taller default */}
      <View style={[styles.playerArea, { height: infoExpanded ? VIDEO_H * 0.7 : VIDEO_H }]}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={accent} size="large" />
            <Text style={[styles.loadingText, { color: accent }]}>{gen.loadingMessages[0]}</Text>
          </View>
        ) : error || !videoSource ? (
          <View style={styles.errorWrap}>
            <Ionicons name="warning-outline" size={40} color={colors.textMuted} />
            <Text style={styles.errorText}>{error || 'No video stream available.'}</Text>
          </View>
        ) : (
          <VideoPlayer
            ref={videoRef}
            videoUrl={videoSource}
            title={item.title}
            onBack={() => navigation.goBack()}
            onEnded={inChannel ? handleVideoEnded : undefined}
            channelLabel={inChannel ? channelLabel || "CHANNEL" : undefined}
          />
        )}

        {/* Overlay: back button — always visible */}
        <TouchableOpacity
          style={[styles.overlayBack, { top: insets.top + 8 }]}
          onPress={() => navigation.goBack()}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>

        {/* Overlay: fullscreen button */}
        {!loading && !error && videoSource && (
          <TouchableOpacity
            style={[styles.overlayFs, { top: insets.top + 8 }]}
            onPress={() => videoRef.current?.enterFullscreen?.()}
            hitSlop={10}
          >
            <Ionicons name="expand-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Info section — collapsible */}
      <View style={[styles.infoSection, { paddingBottom: insets.bottom + 16 }]}>
        {/* Drag handle / expand toggle */}
        <TouchableOpacity onPress={toggleInfo} style={styles.infoToggle} activeOpacity={0.8}>
          <View style={styles.infoHandle} />
          <View style={styles.infoToggleRow}>
            <Text style={styles.title} numberOfLines={infoExpanded ? undefined : 1}>{item.title}</Text>
            <Ionicons name={infoExpanded ? "chevron-down" : "chevron-up"} size={20} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        <ScrollView
          style={styles.details}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.metaRow}>
            {item.year ? <Text style={[styles.year, { color: accent }]}>{item.year}</Text> : null}
            {creator ? <Text style={styles.creator}>{creator}</Text> : null}
            {item.duration ? <Text style={styles.duration}>{item.duration}</Text> : null}
          </View>

          <View style={styles.actions}>
            <ActionBtn
              icon={hearted ? 'heart' : 'heart-outline'}
              label={hearted ? 'LOVED' : 'LOVE'}
              active={hearted}
              accent="#ff3b5c"
              onPress={toggleHeart}
            />
            <ActionBtn icon="share-outline" label="SHARE" accent={accent} onPress={handleShare} />
            <ActionBtn icon={inWatchlist ? 'bookmark' : 'bookmark-outline'} label={inWatchlist ? 'SAVED' : 'SAVE'} active={inWatchlist} accent={accent} onPress={toggleWatchlist} />
            {localUri ? (
              <ActionBtn icon="checkmark-circle" label="DOWNLOADED" active accent={accent} />
            ) : item.videoUrl ? (
              <ActionBtn
                icon={downloading ? undefined : 'arrow-down-circle-outline'}
                label={downloading ? `${Math.round(downloadProgress * 100)}%` : 'OFFLINE'}
                accent={accent}
                onPress={downloading ? undefined : handleDownload}
                loading={downloading}
              />
            ) : null}
            {item.archiveUrl ? (
              <ActionBtn icon="open-outline" label="ARCHIVE" accent={accent} onPress={() => Linking.openURL(item.archiveUrl)} />
            ) : null}
          </View>

          {/* Rabbit Hole — always visible when we have related items */}
          {relatedItems.length > 0 && (
            <View style={styles.rabbitSection}>
              <View style={styles.rabbitHeader}>
                <Text style={styles.rabbitEmoji}>🐇</Text>
                <Text style={[styles.rabbitTitle, { color: accent }]}>RABBIT HOLE</Text>
                <Text style={styles.rabbitSub}>similar but different</Text>
              </View>
              <FlatList
                data={relatedItems}
                keyExtractor={(r) => r.id}
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
                renderItem={({ item: rel }) => (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.push('Player', { item: rel });
                    }}
                    style={styles.rabbitCard}
                  >
                    <Image source={{ uri: rel.thumbnail }} style={styles.rabbitThumb} resizeMode="cover" />
                    <Text style={styles.rabbitCardTitle} numberOfLines={2}>{rel.title}</Text>
                    {rel.year ? <Text style={[styles.rabbitCardYear, { color: accent }]}>{rel.year}</Text> : null}
                  </Pressable>
                )}
              />
            </View>
          )}

          {/* Expandable: description + formats */}
          {infoExpanded && (
            <>
              {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

              {item.availableFormats?.length > 1 && (
                <View style={styles.formatsSection}>
                  <Text style={styles.formatsTitle}>AVAILABLE FORMATS</Text>
                  {item.availableFormats.map((f, i) => (
                    <View key={i} style={styles.formatRow}>
                      <Text style={styles.formatName}>{f.format}</Text>
                      <Text style={styles.formatSize}>{f.size ? `${(f.size / 1024 / 1024).toFixed(0)}MB` : '—'}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, active, accent, onPress, loading }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionBtn, active && { borderColor: accent, backgroundColor: accent + '18' }]}
      disabled={!onPress}
      activeOpacity={0.75}
    >
      {loading ? <ActivityIndicator color={accent} size="small" />
        : icon ? <Ionicons name={icon} size={20} color={active ? accent : colors.textPrimary} />
        : null}
      <Text style={[styles.actionLabel, active && { color: accent }]}>{label}</Text>
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
  playerArea: { backgroundColor: '#000', width: '100%' },
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

  // Collapsible info section
  infoSection: { flex: 1, backgroundColor: colors.bg },
  infoToggle: { paddingTop: 8, paddingHorizontal: spacing.screenPadding },
  infoHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.surface, alignSelf: 'center', marginBottom: 10,
  },
  infoToggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },

  details: { flex: 1, paddingHorizontal: spacing.screenPadding },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 18, color: colors.textPrimary, lineHeight: 24, flex: 1, marginRight: 8 },
  metaRow: { flexDirection: 'row', gap: 14, marginBottom: 12, flexWrap: 'wrap' },
  year: { fontFamily: fonts.mono, fontSize: 12 },
  creator: { fontFamily: fonts.sans, fontSize: 12, color: colors.textSecondary },
  duration: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface, flexWrap: 'wrap' },
  actionBtn: { alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minWidth: 66 },
  actionLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 0.8 },
  // Rabbit hole
  rabbitSection: { marginTop: 8, marginBottom: 16 },
  rabbitHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  rabbitEmoji: { fontSize: 14 },
  rabbitTitle: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5 },
  rabbitSub: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  rabbitCard: { width: 120, marginRight: 10 },
  rabbitThumb: { width: 120, height: 72, borderRadius: 6, backgroundColor: colors.card, marginBottom: 5 },
  rabbitCardTitle: { fontFamily: fonts.sans, fontSize: 11, color: colors.textPrimary, lineHeight: 14 },
  rabbitCardYear: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },

  description: { fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginBottom: 24, marginTop: 12 },
  formatsSection: { marginBottom: 32 },
  formatsTitle: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textGhost, letterSpacing: 1.5, marginBottom: 10 },
  formatRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface },
  formatName: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary },
  formatSize: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
});
