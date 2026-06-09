/**
 * PlaylistsListScreen — all user playlists.
 *
 * Can be accessed from the "My Void" tab or drawer menu.
 * Shows a grid of playlist cards with cover art, title, item count.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Dimensions, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from '../components/FastImage';
import { useGeneration } from '../context/GenerationContext';
import api from '../api/client';
import { colors, fonts, spacing, radius } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - spacing.screenPadding * 2 - 12) / 2;

export default function PlaylistsListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const accent = gen.accentColor;

  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.getPlaylists();
      setPlaylists(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[playlists]', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when navigating back (in case items were added/removed)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load(true));
    return unsub;
  }, [navigation, load]);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCreating(true);
    try {
      const pl = await api.createPlaylist(newTitle.trim());
      setPlaylists((prev) => [pl, ...prev]);
      setNewTitle('');
    } catch (err) {
      console.warn('[create playlist]', err.message);
    } finally {
      setCreating(false);
    }
  }, [newTitle]);

  const renderPlaylist = ({ item: pl }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('Playlist', { playlistId: pl.id })}
      activeOpacity={0.8}
    >
      {pl.cover_thumbnail ? (
        <FastImage
          source={{ uri: pl.cover_thumbnail }}
          style={styles.cardCover}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardCover, styles.cardCoverEmpty]}>
          <Ionicons name="albums" size={32} color={colors.textGhost} />
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{pl.title}</Text>
        <Text style={styles.cardMeta}>
          {pl.item_count || 0} item{(pl.item_count || 0) !== 1 ? 's' : ''}
          {pl.is_public ? ' · public' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MY PLAYLISTS</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Create new */}
      <View style={styles.createRow}>
        <TextInput
          style={styles.createInput}
          placeholder="New playlist name..."
          placeholderTextColor={colors.textGhost}
          value={newTitle}
          onChangeText={setNewTitle}
          maxLength={100}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: accent }, !newTitle.trim() && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={!newTitle.trim() || creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Ionicons name="add" size={20} color="#000" />
          )}
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={playlists}
          renderItem={renderPlaylist}
          keyExtractor={(pl) => pl.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingHorizontal: spacing.screenPadding, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={accent} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="albums-outline" size={48} color={colors.textGhost} />
              <Text style={styles.emptyText}>No playlists yet</Text>
              <Text style={styles.emptyHint}>Create one to start collecting your favorites</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 14,
  },
  headerTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.text,
    letterSpacing: 2,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 16,
    gap: 10,
  },
  createInput: {
    flex: 1,
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    width: CARD_W,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardCover: {
    width: '100%',
    height: CARD_W * 0.56,
    backgroundColor: colors.bg,
  },
  cardCoverEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    padding: 10,
  },
  cardTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.text,
    letterSpacing: 0.5,
  },
  cardMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 3,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 80,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textGhost,
  },
});
