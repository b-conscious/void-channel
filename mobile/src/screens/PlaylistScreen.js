/**
 * PlaylistScreen — view & manage a single playlist.
 *
 * Features:
 *   - View items in order
 *   - Play as channel (auto-advance through all items)
 *   - Remove items
 *   - Edit title/description
 *   - Toggle public/private
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from '../components/FastImage';
import { useGeneration } from '../context/GenerationContext';
import api from '../api/client';
import { colors, fonts, spacing, radius } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

export default function PlaylistScreen({ route, navigation }) {
  const { playlistId } = route.params;
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const accent = gen.accentColor;

  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPlaylist(playlistId);
      setPlaylist(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => { load(); }, [load]);

  const handlePlayAll = useCallback(() => {
    if (!playlist?.items?.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Player', {
      item: playlist.items[0],
      queue: playlist.items.map((pi) => ({
        id: pi.item_id,
        title: pi.item_title,
        thumbnail: pi.item_thumbnail,
        year: pi.item_year,
        creator: pi.item_creator,
      })),
      queueIndex: 0,
      channelLabel: playlist.title,
    });
  }, [playlist, navigation]);

  const handleItemPress = useCallback((playlistItem, index) => {
    const items = playlist?.items || [];
    const queue = items.map((pi) => ({
      id: pi.item_id,
      title: pi.item_title,
      thumbnail: pi.item_thumbnail,
      year: pi.item_year,
      creator: pi.item_creator,
    }));
    navigation.navigate('Player', {
      item: queue[index],
      queue,
      queueIndex: index,
      channelLabel: playlist.title,
    });
  }, [playlist, navigation]);

  const handleRemoveItem = useCallback(async (itemId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.removeFromPlaylist(playlistId, itemId);
      setPlaylist((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.item_id !== itemId),
        item_count: Math.max(0, (prev.item_count || 0) - 1),
      }));
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }, [playlistId]);

  const handleTogglePublic = useCallback(async () => {
    if (!playlist) return;
    try {
      const updated = await api.updatePlaylist(playlistId, { is_public: !playlist.is_public });
      setPlaylist((prev) => ({ ...prev, ...updated }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }, [playlist, playlistId]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Playlist',
      `Delete "${playlist?.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.deletePlaylist(playlistId);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  }, [playlist, playlistId, navigation]);

  const renderItem = ({ item: pi, index }) => (
    <TouchableOpacity
      style={styles.itemRow}
      onPress={() => handleItemPress(pi, index)}
      activeOpacity={0.7}
    >
      <Text style={styles.itemIndex}>{index + 1}</Text>
      <FastImage
        source={{ uri: pi.item_thumbnail }}
        style={styles.itemThumb}
        resizeMode="cover"
      />
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>{pi.item_title || pi.item_id}</Text>
        {pi.item_year && <Text style={styles.itemYear}>{pi.item_year}</Text>}
      </View>
      <TouchableOpacity
        onPress={() => handleRemoveItem(pi.item_id)}
        hitSlop={10}
        style={styles.removeBtn}
      >
        <Ionicons name="close-circle" size={20} color={colors.textGhost} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  if (error || !playlist) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={40} color={colors.textGhost} />
        <Text style={styles.errorText}>{error || 'Playlist not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: accent }]}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{playlist.title}</Text>
          <Text style={styles.headerSub}>
            {playlist.item_count || 0} item{(playlist.item_count || 0) !== 1 ? 's' : ''}
            {playlist.is_public ? ' · public' : ' · private'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleDelete} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.playAllBtn, { backgroundColor: accent }]}
          onPress={handlePlayAll}
          disabled={!playlist.items?.length}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={18} color="#000" />
          <Text style={styles.playAllText}>PLAY ALL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={handleTogglePublic}
          activeOpacity={0.7}
        >
          <Ionicons
            name={playlist.is_public ? "globe-outline" : "lock-closed-outline"}
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.toggleText}>
            {playlist.is_public ? 'PUBLIC' : 'PRIVATE'}
          </Text>
        </TouchableOpacity>
      </View>

      {playlist.description ? (
        <Text style={styles.description}>{playlist.description}</Text>
      ) : null}

      {/* Items */}
      <FlatList
        data={playlist.items || []}
        renderItem={renderItem}
        keyExtractor={(pi) => pi.item_id || pi.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="albums-outline" size={48} color={colors.textGhost} />
            <Text style={styles.emptyText}>This playlist is empty</Text>
            <Text style={styles.emptyHint}>Add videos from the player screen</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 14,
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    color: colors.text,
    letterSpacing: 1,
  },
  headerSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 12,
    gap: 12,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
    gap: 8,
  },
  playAllText: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: '#000',
    letterSpacing: 1,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  toggleText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 12,
    fontStyle: 'italic',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 10,
    gap: 10,
  },
  itemIndex: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textGhost,
    width: 22,
    textAlign: 'center',
  },
  itemThumb: {
    width: 80,
    height: 50,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  itemInfo: { flex: 1 },
  itemTitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
  },
  itemYear: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeBtn: { padding: 4 },
  emptyWrap: {
    paddingVertical: 60,
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
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  backBtn: { marginTop: 8 },
  backBtnText: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 1,
  },
});
