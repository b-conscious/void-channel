import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme';

export default function DailyBountyCard({ bounty, completed, accentColor }) {
  const accent = accentColor || colors.amber;

  return (
    <View style={[styles.card, completed && styles.cardDone]}>
      <View style={styles.left}>
        <View style={[styles.iconWrap, completed && { backgroundColor: accent + '22' }]}>
          <Ionicons
            name={completed ? 'checkmark' : getBountyIcon(bounty.type)}
            size={16}
            color={completed ? accent : colors.textMuted}
          />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.label, completed && { color: colors.textMuted }]} numberOfLines={2}>
            {bounty.label}
          </Text>
          <Text style={styles.xp}>+{bounty.xp} XP</Text>
        </View>
      </View>
      {completed && (
        <View style={[styles.donePill, { borderColor: accent }]}>
          <Text style={[styles.doneText, { color: accent }]}>DONE</Text>
        </View>
      )}
    </View>
  );
}

function getBountyIcon(type) {
  switch (type) {
    case 'decade':   return 'calendar-outline';
    case 'topic':    return 'search-outline';
    case 'rare':     return 'diamond-outline';
    case 'category': return 'layers-outline';
    default:         return 'play-outline';
  }
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  cardDone: {
    opacity: 0.6,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBlock: {
    flex: 1,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: 2,
  },
  xp: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textGhost,
    letterSpacing: 0.5,
  },
  donePill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  doneText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1,
  },
});
