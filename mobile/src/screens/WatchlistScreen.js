import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useGeneration } from '../context/GenerationContext';
import MediaCard from '../components/MediaCard';
import store from '../store/cache';
import { colors, fonts, spacing, cardSize, radius } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');
const COLS = Math.max(2, Math.floor(
  (SCREEN_W - spacing.screenPadding * 2 + cardSize.gap) / (cardSize.width + cardSize.gap)
));

export default function WatchlistScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const accent = gen.accentColor;
  const [tab, setTab] = useState('saved');
  const [watchlist, setWatchlist] = useState([]);
  const [history, setHistory] = useState([]);

  useFocusEffect(
    useCallback(() => {
      store.getWatchlist().then(setWatchlist);
      store.getHistory().then(setHistory);
    }, [])
  );

  const items = tab === 'saved' ? watchlist : history;

  const handleItemPress = useCallback((item) => {
    // Watchlist/history items don't carry their origin category — pass null so streak resets cleanly
    navigation.navigate('Player', { item, categoryId: null });
  }, [navigation]);

  const tabs = [
    { key: 'saved', label: 'SAVED', icon: 'bookmark' },
    { key: 'history', label: 'HISTORY', icon: 'time' },
    { key: 'playlists', label: 'PLAYLISTS', icon: 'albums' },
  ];

  const emptyConfig = {
    saved:   { icon: 'bookmark-outline', title: 'NOTHING SAVED YET', sub: 'tap the bookmark on anything worth revisiting' },
    history: { icon: 'time-outline',     title: 'CLEAN SLATE',       sub: 'your watch history will appear here' },
  };
  const empty = emptyConfig[tab];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: accent }]}>YOUR VOID</Text>
        <Text style={styles.subtitle}>things you've found worth keeping</Text>
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => {
                if (t.key === 'playlists') { navigation.navigate('Playlists'); return; }
                setTab(t.key);
              }}
              style={[styles.tab, tab === t.key && { borderColor: accent, backgroundColor: accent + '18' }]}
              activeOpacity={0.75}
            >
              <Ionicons name={tab === t.key ? t.icon : `${t.icon}-outline`} size={13}
                color={tab === t.key ? accent : colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={[styles.tabText, tab === t.key && { color: accent }]}>{t.label}</Text>
              {tab === t.key && items.length > 0 && (
                <View style={[styles.badge, { backgroundColor: accent }]}>
                  <Text style={[styles.badgeText, { color: gen.accentOnDark }]}>{items.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name={empty.icon} size={52} color={colors.textGhost} />
          <Text style={styles.emptyTitle}>{empty.title}</Text>
          <Text style={styles.emptySub}>{empty.sub}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => `${item.id}-${i}`}
          numColumns={COLS}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 90 }]}
          columnWrapperStyle={COLS > 1 ? styles.gridRow : undefined}
          renderItem={({ item }) => <MediaCard item={item} onPress={handleItemPress} style={{ marginRight: 0 }} />}
          ListHeaderComponent={
            <Text style={styles.countLine}>{items.length} {tab === 'saved' ? 'saved' : 'watched'}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.screenPadding, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  title: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 3, marginBottom: 3 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, fontStyle: 'italic', marginBottom: 14 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  tabText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
  badge: { marginLeft: 6, borderRadius: radius.full, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { fontFamily: fonts.monoBold, fontSize: 9 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 100, paddingHorizontal: spacing.screenPadding },
  emptyTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textGhost, letterSpacing: 2, marginTop: 6 },
  emptySub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textGhost, textAlign: 'center', fontStyle: 'italic', lineHeight: 20 },
  grid: { paddingHorizontal: spacing.screenPadding, paddingTop: 16 },
  gridRow: { gap: cardSize.gap, marginBottom: cardSize.gap, justifyContent: 'flex-start' },
  countLine: { fontFamily: fonts.sans, fontSize: 11, color: colors.textGhost, fontStyle: 'italic', marginBottom: 14 },
});
