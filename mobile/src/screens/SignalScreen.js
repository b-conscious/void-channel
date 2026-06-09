import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import WaveAvatar from '../components/WaveAvatar';
import { useGeneration } from '../context/GenerationContext';
import { useGame } from '../context/GameContext';
import { useSidebar, CONTENT_GAP } from '../context/SidebarContext';
import { GENERATIONS } from '../data/generations';
import { colors, fonts, spacing, radius } from '../theme';

const IS_DESKTOP = Platform.OS === 'web' && Dimensions.get('window').width > 900;

const GEN_OPTIONS = [
  { id: 'boomer',     label: 'Boomer',     range: '1946–1964' },
  { id: 'millennial', label: 'Millennial', range: '1981–1996' },
  { id: 'genz',       label: 'Gen Z',      range: '1997–2012' },
];

// Labels + icons for contribution types
const CONTRIB_TYPES = {
  cast:     { label: 'Cast',     icon: 'people-outline' },
  director: { label: 'Directors', icon: 'film-outline' },
  writer:   { label: 'Writers',  icon: 'create-outline' },
  producer: { label: 'Producers', icon: 'person-outline' },
  trivia:   { label: 'Trivia',   icon: 'bulb-outline' },
  context:  { label: 'Context',  icon: 'book-outline' },
  tag:      { label: 'Tags',     icon: 'pricetag-outline' },
  warning:  { label: 'Warnings', icon: 'warning-outline' },
  year:     { label: 'Years',    icon: 'calendar-outline' },
};

export default function SignalScreen() {
  const insets = useSafeAreaInsets();
  const { generationId, gen, chooseGeneration } = useGeneration();
  const {
    xp, rank, nextRank, rankProgress, xpInRank, xpToNext,
    totalWatched, daysExploring,
    totalContributions, contributionsByType, recentContributions,
  } = useGame();
  const { sidebarWidth } = useSidebar();
  const desktopMargin = IS_DESKTOP ? sidebarWidth + CONTENT_GAP : 0;

  const accent = gen.accentColor;

  return (
    <ScrollView
      style={[styles.container, { marginLeft: desktopMargin }]}
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
          {totalContributions > 0 && (
            <View style={styles.contribBadge}>
              <Ionicons name="scan-outline" size={11} color={accent} />
              <Text style={[styles.contribBadgeText, { color: accent }]}>
                {totalContributions} X-RAY{totalContributions !== 1 ? 'S' : ''}
              </Text>
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

      {/* ── Contributions Breakdown ─────────────────────────── */}
      <SectionHeader label="YOUR X-RAY CONTRIBUTIONS" accent={accent} icon="scan-outline" />
      <View style={styles.sectionBody}>
        {totalContributions === 0 ? (
          <View style={styles.emptyContrib}>
            <Ionicons name="add-circle-outline" size={28} color={colors.textGhost} />
            <Text style={styles.emptyContribText}>
              No contributions yet. Open any video and tap "ADD TO X-RAY" to start earning XP by adding cast, trivia, context, and more.
            </Text>
          </View>
        ) : (
          <View style={styles.contribGrid}>
            {Object.entries(contributionsByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const meta = CONTRIB_TYPES[type] || { label: type, icon: 'ellipse-outline' };
                return (
                  <View key={type} style={styles.contribTile}>
                    <Ionicons name={meta.icon} size={16} color={accent} style={{ marginBottom: 4 }} />
                    <Text style={[styles.contribValue, { color: accent }]}>{count}</Text>
                    <Text style={styles.contribLabel}>{meta.label.toUpperCase()}</Text>
                  </View>
                );
              })}
          </View>
        )}
      </View>

      {/* ── Recent Activity ──────────────────────────────────── */}
      {recentContributions.length > 0 && (
        <>
          <SectionHeader label="RECENT ACTIVITY" accent={accent} icon="time-outline" />
          <View style={styles.sectionBody}>
            {recentContributions.slice(0, 8).map((c, i) => {
              const meta = CONTRIB_TYPES[c.fieldType] || { label: c.fieldType, icon: 'ellipse-outline' };
              return (
                <View key={`${c.date}-${i}`} style={styles.activityRow}>
                  <Ionicons name={meta.icon} size={13} color={accent} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityText} numberOfLines={1}>
                      Added {meta.label.toLowerCase()} to "{c.itemTitle}"
                    </Text>
                    <Text style={styles.activityDate}>
                      {new Date(c.date).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

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
        <StatTile label="X-RAY ENTRIES" value={totalContributions} accent={accent} />
        <StatTile label="DAYS EXPLORING" value={daysExploring} accent={accent} />
        <StatTile label="TOTAL XP" value={xp} accent={accent} />
      </View>

      {/* ── How XP Works ─────────────────────────────────────── */}
      <SectionHeader label="HOW XP WORKS" accent={accent} icon="help-circle-outline" />
      <View style={styles.sectionBody}>
        <Text style={styles.xpExplainer}>
          Earn XP by contributing to the X-Ray layer — add cast members, trivia, historical context, tags, and more to any video. The community benefits, and you rank up.
        </Text>
        <View style={styles.xpTable}>
          {[
            { label: 'Cast/Crew member', xp: '+10' },
            { label: 'Trivia / Fun fact', xp: '+15' },
            { label: 'Historical context', xp: '+20' },
            { label: 'Tag', xp: '+5' },
            { label: 'Content warning', xp: '+5' },
            { label: 'Year correction', xp: '+10' },
            { label: 'Watching a video', xp: '+2' },
          ].map((row) => (
            <View key={row.label} style={styles.xpTableRow}>
              <Text style={styles.xpTableLabel}>{row.label}</Text>
              <Text style={[styles.xpTableXP, { color: accent }]}>{row.xp}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Footer ───────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>VOIDtv v0.3 · ARCHIVE.ORG</Text>
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
      <Text style={[styles.statValue, { color: accent }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
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
  contribBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  contribBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
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

  // Contributions
  emptyContrib: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  emptyContribText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: '90%',
  },
  contribGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contribTile: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: '30%',
    flex: 1,
  },
  contribValue: {
    fontFamily: fonts.monoBold,
    fontSize: 22,
    letterSpacing: 0.5,
  },
  contribLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textGhost,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 2,
  },

  // Recent activity
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
  },
  activityText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textPrimary,
  },
  activityDate: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textGhost,
    marginTop: 2,
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

  // XP explainer
  xpExplainer: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 14,
  },
  xpTable: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  xpTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
  },
  xpTableLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textSecondary,
  },
  xpTableXP: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 0.5,
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
