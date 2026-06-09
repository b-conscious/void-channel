import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  Dimensions, Platform, Alert, Linking, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import FastImage from '../components/FastImage';
import MediaCard from '../components/MediaCard';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, cardSize, radius } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 768;
const COLS = Math.max(2, Math.floor(
  (SCREEN_W - spacing.screenPadding * 2 + cardSize.gap) / (cardSize.width + cardSize.gap)
));

// ── Time formatting ──────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Stat tile ────────────────────────────────────────────
function StatTile({ label, value, accent }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color: accent }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function WatchlistScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const { isAuthenticated } = useAuth();
  const { xp, rank, totalWatched } = useGame();
  const accent = gen.accentColor;

  const [watchlist, setWatchlist] = useState([]);
  const [history, setHistory] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [expandedSection, setExpandedSection] = useState(null); // 'saved' | 'history'

  useFocusEffect(
    useCallback(() => {
      store.getWatchlist().then(setWatchlist);
      store.getHistory().then(setHistory);
      if (isAuthenticated) {
        api.getPlaylists().then(data => setPlaylists(data || [])).catch(() => {});
      }
    }, [isAuthenticated])
  );

  const recentHistory = useMemo(() => history.slice(0, 15), [history]);
  const hasAnything = watchlist.length > 0 || history.length > 0 || playlists.length > 0;

  const handleItemPress = useCallback((item) => {
    navigation.navigate('Player', { item, id: item.id, categoryId: null });
  }, [navigation]);

  const toggleSection = useCallback((section) => {
    setExpandedSection(prev => prev === section ? null : section);
  }, []);

  // ── Remove individual history item ────────────────────
  const removeHistoryItem = useCallback(async (itemId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await store.removeFromHistory(itemId);
    setHistory(updated);
  }, []);

  const clearAllHistory = useCallback(() => {
    Alert.alert(
      'Clear History',
      'Remove all watch history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const updated = await store.clearHistory();
            setHistory(updated);
          },
        },
      ]
    );
  }, []);

  // ── Share playlist ────────────────────────────────────
  const sharePlaylist = useCallback(async (pl) => {
    const url = `https://void-channel.onrender.com/playlist/${pl.id}`;
    const text = `${pl.title} — curated on VOIDtv`;
    try {
      if (Platform.OS === 'web') {
        if (navigator?.clipboard) await navigator.clipboard.writeText(url);
      } else {
        await Share.share({ message: `${text}\n${url}`, url });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, []);

  // ── Section header ─────────────────────────────────────
  function SectionHead({ icon, label, count, actionLabel, onAction }) {
    return (
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadLeft}>
          <Ionicons name={icon} size={13} color={accent} />
          <Text style={[styles.sectionLabel, { color: accent }]}>{label}</Text>
          {count > 0 && (
            <View style={[styles.countBadge, { backgroundColor: accent + '20' }]}>
              <Text style={[styles.countBadgeText, { color: accent }]}>{count}</Text>
            </View>
          )}
        </View>
        {actionLabel && onAction && (
          <TouchableOpacity onPress={onAction} activeOpacity={0.7} hitSlop={8}>
            <Text style={[styles.sectionAction, { color: accent }]}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Empty section placeholder ──────────────────────────
  function SectionEmpty({ icon, text }) {
    return (
      <View style={styles.sectionEmpty}>
        <Ionicons name={icon} size={18} color={colors.textGhost} />
        <Text style={styles.sectionEmptyText}>{text}</Text>
      </View>
    );
  }

  // ── History list item (compact row with thumbnail + timestamp + delete) ──
  function HistoryItem({ item }) {
    return (
      <View style={styles.historyRow}>
        <TouchableOpacity
          style={styles.historyRowTap}
          onPress={() => handleItemPress(item)}
          activeOpacity={0.7}
        >
          <FastImage
            uri={item.thumbnail}
            itemId={item.id}
            style={styles.historyThumb}
            contentFit="cover"
          />
          <View style={styles.historyInfo}>
            <Text style={styles.historyTitle} numberOfLines={2}>
              {item.title || 'Untitled'}
            </Text>
            <View style={styles.historyMetaRow}>
              {item.creator ? (
                <Text style={styles.historyCreator} numberOfLines={1}>{item.creator}</Text>
              ) : null}
              <Text style={styles.historyTime}>{timeAgo(item.watchedAt)}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => removeHistoryItem(item.id)}
          style={styles.historyDeleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Ionicons name="close" size={14} color={colors.textGhost} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.title, { color: accent }]}>YOUR VOID</Text>
            <Text style={styles.subtitle}>everything you've found worth keeping</Text>
          </View>
          <View style={[styles.rankPill, { borderColor: accent + '44' }]}>
            <Text style={[styles.rankLabel, { color: accent }]}>{rank.label.toUpperCase()}</Text>
            <Text style={styles.rankXP}>{xp.toLocaleString()} XP</Text>
          </View>
        </View>
      </View>

      {/* ── Continue Watching (recent history) ─────────── */}
      {recentHistory.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadLeft}>
              <Ionicons name="time-outline" size={13} color={accent} />
              <Text style={[styles.sectionLabel, { color: accent }]}>CONTINUE WATCHING</Text>
              {history.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: accent + '20' }]}>
                  <Text style={[styles.countBadgeText, { color: accent }]}>{history.length}</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {expandedSection === 'history' && history.length > 0 && (
                <TouchableOpacity onPress={clearAllHistory} activeOpacity={0.7} hitSlop={8}>
                  <Text style={[styles.sectionAction, { color: colors.textGhost }]}>CLEAR ALL</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => toggleSection('history')} activeOpacity={0.7} hitSlop={8}>
                <Text style={[styles.sectionAction, { color: accent }]}>
                  {expandedSection === 'history' ? 'COLLAPSE' : 'SEE ALL'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {expandedSection === 'history' ? (
            <View style={styles.historyList}>
              {history.slice(0, 50).map((item, i) => (
                <HistoryItem key={`${item.id}-${i}`} item={item} />
              ))}
            </View>
          ) : (
            <FlatList
              data={recentHistory}
              keyExtractor={(item, i) => `h-${item.id}-${i}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <View style={styles.historyCard}>
                  <MediaCard item={item} onPress={handleItemPress} />
                  <Text style={[styles.historyCardTime, { color: accent + 'aa' }]}>
                    {timeAgo(item.watchedAt)}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* ── Saved ──────────────────────────────────────── */}
      <View style={styles.section}>
        <SectionHead
          icon="bookmark-outline"
          label="SAVED"
          count={watchlist.length}
          actionLabel={watchlist.length > 0 ? (expandedSection === 'saved' ? 'COLLAPSE' : 'SEE ALL') : undefined}
          onAction={watchlist.length > 0 ? () => toggleSection('saved') : undefined}
        />
        {watchlist.length === 0 ? (
          <SectionEmpty
            icon="bookmark-outline"
            text="tap the bookmark on anything worth revisiting"
          />
        ) : expandedSection === 'saved' ? (
          <View style={styles.expandedGrid}>
            {watchlist.map((item, i) => (
              <View key={`s-${item.id}-${i}`} style={styles.gridCell}>
                <MediaCard item={item} onPress={handleItemPress} style={{ marginRight: 0 }} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={watchlist.slice(0, 20)}
            keyExtractor={(item, i) => `s-${item.id}-${i}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hRow}
            renderItem={({ item }) => (
              <MediaCard item={item} onPress={handleItemPress} />
            )}
          />
        )}
      </View>

      {/* ── Playlists — your curated corner of the Archive ── */}
      <View style={styles.section}>
        <SectionHead
          icon="albums-outline"
          label="PLAYLISTS"
          count={playlists.length}
          actionLabel="ALL PLAYLISTS"
          onAction={() => navigation.navigate('Playlists')}
        />
        {playlists.length === 0 ? (
          <SectionEmpty
            icon="albums-outline"
            text={isAuthenticated
              ? 'create a playlist to curate your corner of the archive'
              : 'sign in to create and share playlists'}
          />
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hRow}
            renderItem={({ item: pl }) => (
              <View style={styles.playlistCard}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Playlist', { playlistId: pl.id })}
                  activeOpacity={0.7}
                >
                  {pl.cover_thumbnail ? (
                    <FastImage
                      uri={pl.cover_thumbnail}
                      itemId={pl.id}
                      style={styles.playlistThumb}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.playlistThumb, styles.playlistThumbEmpty]}>
                      <Ionicons name="albums" size={20} color={colors.textGhost} />
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.playlistBottom}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => navigation.navigate('Playlist', { playlistId: pl.id })}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.playlistTitle} numberOfLines={1}>{pl.title}</Text>
                    <View style={styles.playlistMetaRow}>
                      <Text style={styles.playlistMeta}>
                        {pl.item_count || 0} item{(pl.item_count || 0) !== 1 ? 's' : ''}
                      </Text>
                      {pl.is_public && (
                        <View style={[styles.publicBadge, { backgroundColor: accent + '20' }]}>
                          <Text style={[styles.publicBadgeText, { color: accent }]}>PUBLIC</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => sharePlaylist(pl)}
                    style={styles.shareBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="share-social-outline" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* ── Stats ──────────────────────────────────────── */}
      <View style={styles.section}>
        <SectionHead icon="stats-chart-outline" label="YOUR STATS" />
        <View style={styles.statsRow}>
          <StatTile label="WATCHED" value={totalWatched} accent={accent} />
          <StatTile label="SAVED" value={watchlist.length} accent={accent} />
          <StatTile label="PLAYLISTS" value={playlists.length} accent={accent} />
          <StatTile label="XP" value={xp} accent={accent} />
        </View>
      </View>

      {/* ── Big empty state (nothing anywhere) ─────────── */}
      {!hasAnything && (
        <View style={styles.bigEmpty}>
          <Ionicons name="telescope-outline" size={44} color={colors.textGhost} />
          <Text style={styles.bigEmptyTitle}>YOUR VOID IS EMPTY</Text>
          <Text style={styles.bigEmptySub}>
            start watching, saving, and building playlists{'\n'}
            everything you find lives here
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { borderColor: accent }]}
            onPress={() => navigation.navigate('Browse')}
            activeOpacity={0.7}
          >
            <Ionicons name="tv-outline" size={14} color={accent} />
            <Text style={[styles.browseBtnText, { color: accent }]}>START BROWSING</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 3,
    marginBottom: 3,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  rankPill: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  rankLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  rankXP: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textGhost,
    marginTop: 1,
  },

  // Sections
  section: { marginTop: 24 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 12,
  },
  sectionHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  countBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
  },
  sectionAction: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
  },

  // Section empty
  sectionEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 16,
  },
  sectionEmptyText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textGhost,
    fontStyle: 'italic',
    flex: 1,
  },

  // Horizontal row
  hRow: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 2,
  },

  // History horizontal card (MediaCard + time label)
  historyCard: { marginRight: 2 },
  historyCardTime: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 4,
    marginLeft: 2,
  },

  // History expanded list
  historyList: {
    paddingHorizontal: spacing.screenPadding,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
  },
  historyRowTap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  historyDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  historyThumb: {
    width: 100,
    height: 58,
    borderRadius: 4,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  historyInfo: {
    flex: 1,
    marginLeft: 10,
  },
  historyTitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  historyCreator: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },
  historyTime: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textGhost,
    letterSpacing: 0.3,
  },

  // Expanded grid (Saved SEE ALL)
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.screenPadding,
    gap: cardSize.gap,
  },
  gridCell: {
    width: cardSize.width,
  },

  // Playlist cards
  playlistCard: {
    width: 130,
    marginRight: 12,
  },
  playlistThumb: {
    width: 130,
    height: 76,
    borderRadius: 6,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  playlistThumbEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  playlistBottom: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 5,
  },
  playlistTitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textPrimary,
  },
  playlistMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  playlistMeta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textGhost,
  },
  publicBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  publicBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  shareBtn: {
    padding: 4,
    marginLeft: 2,
    marginTop: 1,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 12,
    backgroundColor: colors.surface + '40',
    borderRadius: radius.sm,
    marginHorizontal: spacing.screenPadding,
  },
  statTile: { alignItems: 'center', gap: 2 },
  statValue: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textGhost,
    letterSpacing: 1,
  },

  // Big empty state
  bigEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.screenPadding,
    gap: 10,
  },
  bigEmptyTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.textGhost,
    letterSpacing: 2,
    marginTop: 6,
  },
  bigEmptySub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textGhost,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  browseBtnText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.5,
  },
});
