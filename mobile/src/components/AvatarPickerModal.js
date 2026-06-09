/**
 * AvatarPickerModal — grid of curated Internet Archive thumbnails.
 * User taps one to set as their profile picture.
 * Glyph-only avatars render a big character on a dark background.
 */

import React, { useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FastImage from './FastImage';
import AVATARS from '../data/avatars';
import { colors, fonts, radius, spacing } from '../theme';

export default function AvatarPickerModal({ visible, onClose, onSelect, currentAvatar, accent }) {
  const [saving, setSaving] = useState(null); // avatar id being saved

  const handlePick = async (avatar) => {
    setSaving(avatar.id);
    try {
      await onSelect(avatar);
    } catch {}
    setSaving(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: accent }]}>CHOOSE YOUR AVATAR</Text>
              <Text style={styles.subtitle}>curated from the Internet Archive's weirdest corners</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {AVATARS.map((av) => {
              const isSelected = currentAvatar === av.id || currentAvatar === av.url;
              const isSaving = saving === av.id;

              return (
                <Pressable
                  key={av.id}
                  onPress={() => handlePick(av)}
                  style={[
                    styles.avatarCell,
                    isSelected && { borderColor: accent, borderWidth: 2 },
                  ]}
                >
                  {av.url ? (
                    <FastImage
                      uri={av.url}
                      itemId={av.id}
                      style={styles.avatarImg}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.avatarGlyph, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.glyphText, { color: accent }]}>{av.glyph}</Text>
                    </View>
                  )}
                  {isSaving && (
                    <View style={styles.savingOverlay}>
                      <ActivityIndicator color={accent} size="small" />
                    </View>
                  )}
                  <Text style={styles.avatarLabel} numberOfLines={1}>{av.label}</Text>
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: accent }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const CELL_SIZE = 80;

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: spacing.screenPadding, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  title: { fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 2 },
  subtitle: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: spacing.screenPadding, gap: 10,
    justifyContent: 'flex-start',
  },
  avatarCell: {
    width: CELL_SIZE, alignItems: 'center',
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.surface,
    backgroundColor: colors.card,
  },
  avatarImg: {
    width: CELL_SIZE, height: CELL_SIZE,
    borderTopLeftRadius: radius.md - 1, borderTopRightRadius: radius.md - 1,
  },
  avatarGlyph: {
    width: CELL_SIZE, height: CELL_SIZE,
    justifyContent: 'center', alignItems: 'center',
  },
  glyphText: { fontSize: 32, fontFamily: fonts.monoBold },
  avatarLabel: {
    fontFamily: fonts.mono, fontSize: 8, color: colors.textMuted,
    paddingVertical: 4, paddingHorizontal: 4, textAlign: 'center',
    letterSpacing: 0.3,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  checkBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
});
