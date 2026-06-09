/**
 * AddToPlaylistModal — bottom sheet for adding an item to a playlist.
 *
 * Shows user's existing playlists with a "New Playlist" option.
 * Fires api.addToPlaylist() on selection.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Pressable, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import api from '../api/client';
import { colors, fonts, spacing, radius } from '../theme';

const { height: SCREEN_H } = Dimensions.get('window');

export default function AddToPlaylistModal({ visible, item, onClose, onAdded }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // playlist id being added to
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState(null);

  // Fetch playlists when modal opens
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    api.getPlaylists()
      .then((data) => setPlaylists(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [visible]);

  const handleAddToPlaylist = useCallback(async (playlistId) => {
    if (!item || adding) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAdding(playlistId);
    setError(null);
    try {
      await api.addToPlaylist(playlistId, item);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded?.(playlistId);
      onClose();
    } catch (err) {
      if (err.message?.includes('duplicate') || err.message?.includes('already')) {
        setError('Already in this playlist');
      } else {
        setError(err.message);
      }
    } finally {
      setAdding(null);
    }
  }, [item, adding, onAdded, onClose]);

  const handleCreateAndAdd = useCallback(async () => {
    if (!newTitle.trim() || !item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCreating(true);
    setError(null);
    try {
      const playlist = await api.createPlaylist(newTitle.trim());
      await api.addToPlaylist(playlist.id, item);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded?.(playlist.id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
      setNewTitle('');
    }
  }, [newTitle, item, onAdded, onClose]);

  const renderPlaylist = ({ item: playlist }) => {
    const isAdding = adding === playlist.id;
    return (
      <TouchableOpacity
        style={styles.playlistRow}
        onPress={() => handleAddToPlaylist(playlist.id)}
        activeOpacity={0.7}
        disabled={!!adding}
      >
        <View style={styles.playlistIcon}>
          {isAdding ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="list" size={20} color={colors.textSecondary} />
          )}
        </View>
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistTitle} numberOfLines={1}>{playlist.title}</Text>
          <Text style={styles.playlistMeta}>
            {playlist.item_count || 0} item{(playlist.item_count || 0) !== 1 ? 's' : ''}
            {playlist.is_public ? ' · public' : ''}
          </Text>
        </View>
        <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.headerTitle}>Add to Playlist</Text>
            {item && (
              <Text style={styles.headerSub} numberOfLines={1}>
                {item.title || item.id}
              </Text>
            )}
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorBar}>
              <Ionicons name="alert-circle" size={14} color="#ff6b6b" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

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
              onSubmitEditing={handleCreateAndAdd}
            />
            <TouchableOpacity
              style={[styles.createBtn, !newTitle.trim() && styles.createBtnDisabled]}
              onPress={handleCreateAndAdd}
              disabled={!newTitle.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.createBtnText}>CREATE</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Playlist list */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : playlists.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="albums-outline" size={40} color={colors.textGhost} />
              <Text style={styles.emptyText}>No playlists yet</Text>
              <Text style={styles.emptyHint}>Create one above to start collecting</Text>
            </View>
          ) : (
            <FlatList
              data={playlists}
              renderItem={renderPlaylist}
              keyExtractor={(p) => p.id}
              style={styles.list}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_H * 0.65,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textGhost,
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.text,
    letterSpacing: 1,
  },
  headerSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    paddingHorizontal: 40,
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,107,107,0.1)',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: '#ff6b6b',
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  createInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  createBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createBtnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: '#000',
    letterSpacing: 1,
  },
  list: {
    flex: 1,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  playlistIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistTitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
  },
  playlistMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 40,
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
