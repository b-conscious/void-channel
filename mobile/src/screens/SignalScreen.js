import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import WaveAvatar from '../components/WaveAvatar';
import DailyBountyCard from '../components/DailyBountyCard';
import { useGeneration } from '../context/GenerationContext';
import { useGame } from '../context/GameContext';
import { GENERATIONS } from '../data/generations';
import { colors, fonts, spacing, radius } from '../theme';

const GEN_OPTIONS = [
  { id: 'boomer',     label: 'Boomer',     range: '1946–1964' },
  { id: 'millennial', label: 'Millennial', range: '1981–1996' },
  { id: 'genz',       label: 'Gen Z',      range: '1997–2012' },
];

export default function SignalScreen() {
  const insets = useSafeAreaInsets();
  const { generationId, gen, chooseGeneration } = useGeneration();
  const {
    xp, rank, nextRank, rankProgress, xpInRank, xpToNext,
    rareUnearthed, totalWatched, daysExploring,
    streakCount, streakBest, bounties, completedBounties,
  } = useGame();

  const accent = gen.accentColor;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Wave Avatar ──────────────────────────────────────── */}
      <View style={styles.avatarSection}>
        <WaveAvatar xpRatio={rankProgress} accentColor={accent} />
        <Text style={[styles.avatarLabel, { color: accent }]}>YOUR SIGNAL</Text>
      </View>

      {/* ── Rank + XP ────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.rankRow}>
          <View style={[styles.rankBadge, { borderColor: accent }]}>
            <Text style={[styles.rankText, { color: accent }]}>{rank.label.toUpperCase()}</Text>
          </View>
          {streakCount >= 3 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakIcon}>🐇</Text>
              <Text style={styles.streakText}>x{streakCount} RABBIT HOLE</Text>
            </View>
          )}
        </View>

        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>{xp.toLocaleString()} XP</Text>
          {nextRank && (
            <Text style={styles.xpNext}>{nextRank.label} in {xpToNext - xpInRank} XP</Text>
          )}
        </View>

        {/* XP bar */}
        <View style={styles.xpBarBg}>
          <View
            style={[styles.xpBarFill, { width: `${rankProgress * 100}%`, backgroundColor: accent }]}
          />
        </View>
      </View>

      {/* ── Daily Bounties ───────────────────────────────────── */}
      <SectionHeader label="TODAY'S BOUNTIES" accent={accent} icon="compass-outline" />
      <View style={styles.sectionBody}>
        {bounties.map((b) => (
          <DailyBountyCard
            key={b.id}
            bounty={b}
            completed={completedBounties.includes(b.id)}
            accentColor={accent}
          />
        ))}
        <Text style={styles.bountyNote}>
          Complete bounties by watching matching content. Resets daily.
        </Text>
      </View>

      {/* ── Generation ───────────────────────────────────────── */}
      <SectionHeader label="YOUR GENERATION" accent={accent} icon="people-outline" />
      <View style={styles.sectionBody}>
        <Text style={styles.genIntro}>
          Changes how the app talks to you — category names, search hints, vibe tags, and accent color.
        </Text>
        <View style={styles.genPills}>
          {GEN_OPTIONS.map((opt) => {
            const isActive = generationId === opt.id;
            const optAccent = GENERATIONS[opt.id].accentColor;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  chooseGeneration(opt.id);
                }}
                style={[
                  styles.genPill,
                  isActive && { borderColor: optAccent, backgroundColor: optAccent + '18' },
                ]}
                activeOpacity={0.75}
              >
                <Text style={[styles.genPillLabel, isActive && { color: optAccent }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.genPillRange, isActive && { color: optAccent + 'aa' }]}>
                  {opt.range}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Stats ────────────────────────────────────────────── */}
      <SectionHeader label="YOUR STATS" accent={accent} icon="stats-chart-outline" />
      <View style={styles.statsGrid}>
        <StatTile label="WATCHED" value={totalWatched} accent={accent} />
        <StatTile label="UNEARTHED" value={rareUnearthed.length} accent={accent} />
        <StatTile label="DAYS EXPLORING" value={daysExploring} accent={accent} />
        <StatTile label="RABBIT HOLE BEST" value={streakBest} accent={accent} />
      </View>

      {/* ── Footer ───────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>VOID CHANNEL v0.2 · ARCHIVE.ORG</Text>
      </View>
    </ScrollView>
  );
}

function SectionHeader({ label, icon, accent }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={13} color={accent || colors.amber} style={{ marginRight: 7 }} />
      <Text style={[styles.sectionTitle, { color: accent || colors.amber }]}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: spacing.screenPadding,
  },
  avatarLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 3,
    marginTop: 10,
  },

  // Rank + XP
  section: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 28,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  rankBadge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rankText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 2,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  streakIcon: { fontSize: 12 },
  streakText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  xpLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  xpNext: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textGhost,
  },
  xpBarBg: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 2,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    marginLeft: 10,
  },
  sectionBody: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 28,
  },
  bountyNote: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textGhost,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },

  // Generation picker
  genIntro: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 14,
    lineHeight: 19,
  },
  genPills: {
    flexDirection: 'row',
    gap: 8,
  },
  genPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  genPillLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  genPillRange: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textGhost,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.screenPadding,
    gap: 10,
    marginBottom: 28,
  },
  statTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontFamily: fonts.monoBold,
    fontSize: 26,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textGhost,
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textGhost,
    letterSpacing: 1,
  },
});
