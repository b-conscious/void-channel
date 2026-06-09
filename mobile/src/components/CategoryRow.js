import React from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Dimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MediaCard from './MediaCard';
import SkeletonCard from './SkeletonCard';
import { useGeneration } from '../context/GenerationContext';
import { colors, fonts, spacing, cardSize, radius } from '../theme';

const SCREEN_W = Dimensions.get('window').width;
const IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 768;

const CAT_GLYPHS = {
  // Type categories — obscure first
  ephemeral: '◎',   prelinger: '▶',  oddities: '✦',
  religious: '✝',    medical: '✚',   amateur: '◈',
  psa: '⚠',         commercials: '$', travelogues: '◇',
  computers: '◉',   cartoons: '★',   horror: '☠',
  scifi: '◈',       noir: '◆',       newsreels: '▣',
  educational_tv: '▷', mature: '⚠',
  // Decades
  d1930s: '◷',    d1940s: '◷', d1950s: '◷',
  d1960s: '◷',    d1970s: '◷', d1980s: '◷',
  // Shows
  show_betty_boop: '◈', show_popeye: '◈', show_looney: '◈',
  show_woody: '◈', show_mickey: '◈', show_felix: '◈',
  show_threestooges: '◈', show_twilightzone: '◈',
  community_hearts: '♥',
  trending: '🔥', for_you: '◈', sub_feed: '▸',
  // New type categories
  anime: '◈', saturday_morning: '★', afterschool: '▷', education: '▣',
  howto: '◉', foreign: '◇', art_film: '◆', theatre: '▷',
  abstract: '✦', conspiracy: '◎', public_access: '▶', shopping: '$',
  violence: '☠', music_video: '♫', sports: '●', nature_wildlife: '◇',
  comedy: '★', western: '◆', romance: '♡', documentary: '▣',
  game_shows: '▸', silent_film: '◷', war_footage: '⚑', blaxploitation: '◈',
  // New decades
  d1990s: '◷', d2000s: '◷', d2010s: '◷', d2020s: '◷',
  // Deep cuts
  deep_driver_ed: '⚠', deep_mental_hygiene: '◎', deep_dating: '♡',
  deep_hygiene: '◎', deep_propaganda: '⚑', deep_atomic: '☢',
  deep_telephone: '◉', deep_farming: '◇',
  deep_cigarette_ads: '◎', deep_food_ads: '◉', deep_toy_ads: '◈',
  deep_creature: '☠', deep_camp: '★', deep_space: '◆',
  deep_cartoon_silly: '✦', deep_vampire: '🦇',
};

/**
 * CategoryRow now supports pagination.
 * Props:
 *   page         - current page number (1-based), default 1
 *   totalPages   - total pages available (0 = unknown, hides controls)
 *   loadingMore  - true while fetching next/prev page
 *   onPageChange - (categoryId, newPage) callback
 */
export default function CategoryRow({
  category, onItemPress, loading,
  page = 1, totalPages = 0, loadingMore = false, onPageChange,
  subscribed = false, onSubscribe,
}) {
  const { gen } = useGeneration();
  const items = category?.items || [];
  const glyph = CAT_GLYPHS[category.id] || '▸';
  const accent = gen?.accentColor || colors.amber;

  const catCopy = gen?.categories?.[category.id];
  const name = catCopy?.name || category.name || '';
  const subtitle = catCopy?.subtitle || category.subtitle || '';

  const hasPagination = onPageChange && items.length > 0;
  const canPrev = page > 1;
  const canNext = totalPages === 0 || page < totalPages; // if totalPages unknown, always allow next

  // "Load more" card shown at end of horizontal FlatList
  const LoadMoreCard = () => {
    if (!hasPagination || !canNext) return null;
    return (
      <TouchableOpacity
        style={[styles.loadMoreCard, { borderColor: accent + '55' }]}
        onPress={() => onPageChange(category.id, page + 1)}
        activeOpacity={0.7}
        disabled={loadingMore}
      >
        {loadingMore ? (
          <ActivityIndicator color={accent} size="small" />
        ) : (
          <>
            <Ionicons name="arrow-forward-circle-outline" size={28} color={accent} />
            <Text style={[styles.loadMoreText, { color: accent }]}>NEXT{'\n'}PAGE</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.nameRow}>
            <Text style={[styles.glyph, { color: accent }]}>{glyph}</Text>
            <Text style={styles.name}>{name}</Text>
            {hasPagination && (
              <Text style={styles.pageIndicator}>pg {page}</Text>
            )}
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {onSubscribe && (
          <TouchableOpacity
            onPress={() => onSubscribe(category.id, !subscribed)}
            style={[styles.subBtn, subscribed && { borderColor: accent, backgroundColor: accent + '15' }]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={subscribed ? "notifications" : "notifications-outline"}
              size={12}
              color={subscribed ? accent : colors.textSecondary}
            />
            <Text style={[styles.subBtnText, subscribed && { color: accent }]}>
              {subscribed ? 'FOLLOWING' : 'FOLLOW'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
        >
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </ScrollView>
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>— {gen?.noSignal || 'DEAD AIR'} —</Text>
        </View>
      ) : IS_DESKTOP ? (
        <>
          <View style={styles.grid}>
            {items.map((item) => (
              <MediaCard key={item.id} item={item} onPress={(it) => onItemPress(it, category.id)} />
            ))}
          </View>
          {/* Desktop pagination controls */}
          {hasPagination && (
            <View style={styles.paginationRow}>
              <TouchableOpacity
                onPress={() => onPageChange(category.id, page - 1)}
                style={[styles.pageBtn, { borderColor: accent + '55' }, !canPrev && styles.pageBtnDisabled]}
                activeOpacity={0.7}
                disabled={!canPrev || loadingMore}
              >
                <Ionicons name="chevron-back" size={14} color={canPrev ? accent : colors.textGhost} />
                <Text style={[styles.pageBtnText, { color: canPrev ? accent : colors.textGhost }]}>PREV</Text>
              </TouchableOpacity>

              {loadingMore ? (
                <ActivityIndicator color={accent} size="small" />
              ) : (
                <Text style={styles.pageText}>PAGE {page}</Text>
              )}

              <TouchableOpacity
                onPress={() => onPageChange(category.id, page + 1)}
                style={[styles.pageBtn, { borderColor: accent + '55' }, !canNext && styles.pageBtnDisabled]}
                activeOpacity={0.7}
                disabled={!canNext || loadingMore}
              >
                <Text style={[styles.pageBtnText, { color: canNext ? accent : colors.textGhost }]}>NEXT</Text>
                <Ionicons name="chevron-forward" size={14} color={canNext ? accent : colors.textGhost} />
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <MediaCard item={item} onPress={(it) => onItemPress(it, category.id)} />
            )}
            ListFooterComponent={LoadMoreCard}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={3}
            removeClippedSubviews={Platform.OS !== 'web'}
            getItemLayout={null}
          />
          {/* Prev page button for mobile — shown below the row when on page 2+ */}
          {hasPagination && canPrev && (
            <TouchableOpacity
              onPress={() => onPageChange(category.id, page - 1)}
              style={[styles.mobilePrevBtn, { borderColor: accent + '55' }]}
              activeOpacity={0.7}
              disabled={loadingMore}
            >
              <Ionicons name="chevron-back" size={12} color={accent} />
              <Text style={[styles.mobilePrevText, { color: accent }]}>BACK TO PAGE {page - 1}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 34 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 11,
  },
  headerLeft: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  glyph: { fontFamily: fonts.mono, fontSize: 10 },
  name: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5, color: colors.textPrimary, flexShrink: 1 },
  pageIndicator: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 3, marginLeft: 17, fontStyle: 'italic' },
  subBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  subBtnText: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1, color: colors.textSecondary },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.screenPadding, gap: cardSize.gap,
  },
  listContent: { paddingHorizontal: spacing.screenPadding, paddingVertical: 2 },
  emptyWrap: { paddingHorizontal: spacing.screenPadding, paddingVertical: 20 },
  emptyText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textGhost, letterSpacing: 1 },

  // Load more card (end of horizontal list on mobile)
  loadMoreCard: {
    width: 90,
    height: cardSize.height,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: cardSize.gap,
    gap: 6,
  },
  loadMoreText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  // Desktop pagination row
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
    paddingHorizontal: spacing.screenPadding,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 4,
  },
  pageBtnDisabled: {
    opacity: 0.35,
  },
  pageBtnText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  pageText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
  },

  // Mobile prev button (below the row)
  mobilePrevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: spacing.screenPadding,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 4,
  },
  mobilePrevText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
});
