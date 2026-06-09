import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Dimensions, ActivityIndicator, Pressable,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import MediaCard from './MediaCard';
import SkeletonCard from './SkeletonCard';
import { useGeneration } from '../context/GenerationContext';
import { colors, fonts, spacing, cardSize, radius } from '../theme';

const SCREEN_W = Dimensions.get('window').width;
const IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 768;
const SCROLL_AMOUNT = cardSize.width * 2 + cardSize.gap * 2; // scroll 2 cards at a time

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
  sex_ed: '♡', violence: '☠', music_video: '♫', sports: '●', nature_wildlife: '◇',
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
 * CategoryRow — Amazon Video style:
 *   - Horizontal scroll with hover-reveal arrow buttons on left/right
 *   - "See More ›" link next to category name
 *   - Pagination support for loading more content
 */
export default function CategoryRow({
  category, onItemPress, loading,
  page = 1, totalPages = 0, loadingMore = false, onPageChange,
  subscribed = false, onSubscribe, onSeeMore,
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
  const canNext = totalPages === 0 || page < totalPages;

  // Scroll refs and hover state for arrows
  const listRef = useRef(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(SCREEN_W);
  const [rowHovered, setRowHovered] = useState(false);

  const canScrollLeft = scrollOffset > 10;
  const canScrollRight = contentWidth > containerWidth + scrollOffset + 10;

  // Arrow opacity animations
  const leftArrowOpacity = useSharedValue(0);
  const rightArrowOpacity = useSharedValue(0);

  const onRowHoverIn = useCallback(() => {
    if (Platform.OS !== 'web') return;
    setRowHovered(true);
    leftArrowOpacity.value = withTiming(1, { duration: 200 });
    rightArrowOpacity.value = withTiming(1, { duration: 200 });
  }, []);

  const onRowHoverOut = useCallback(() => {
    setRowHovered(false);
    leftArrowOpacity.value = withTiming(0, { duration: 150 });
    rightArrowOpacity.value = withTiming(0, { duration: 150 });
  }, []);

  const leftArrowStyle = useAnimatedStyle(() => ({
    opacity: leftArrowOpacity.value,
  }));
  const rightArrowStyle = useAnimatedStyle(() => ({
    opacity: rightArrowOpacity.value,
  }));

  const scrollLeft = useCallback(() => {
    const next = Math.max(0, scrollOffset - SCROLL_AMOUNT);
    listRef.current?.scrollToOffset({ offset: next, animated: true });
  }, [scrollOffset]);

  const scrollRight = useCallback(() => {
    const next = scrollOffset + SCROLL_AMOUNT;
    listRef.current?.scrollToOffset({ offset: next, animated: true });
    // If near the end and we can page, load more
    if (next + containerWidth >= contentWidth - 50 && hasPagination && canNext && !loadingMore) {
      onPageChange(category.id, page + 1);
    }
  }, [scrollOffset, containerWidth, contentWidth, hasPagination, canNext, loadingMore, page, category.id, onPageChange]);

  const handleScroll = useCallback((e) => {
    setScrollOffset(e.nativeEvent.contentOffset.x);
    setContentWidth(e.nativeEvent.contentSize.width);
    setContainerWidth(e.nativeEvent.layoutMeasurement.width);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.nameRow}>
            <Text style={[styles.glyph, { color: accent }]}>{glyph}</Text>
            <Text style={styles.name}>{name}</Text>
            {hasPagination && (
              <Text style={styles.pageIndicator}>pg {page}</Text>
            )}
            {/* See More link */}
            {onSeeMore && items.length > 0 && (
              <TouchableOpacity
                onPress={() => onSeeMore(category)}
                style={styles.seeMoreBtn}
                activeOpacity={0.7}
                hitSlop={6}
              >
                <Text style={[styles.seeMoreText, { color: accent }]}>See More</Text>
                <Ionicons name="chevron-forward" size={11} color={accent} />
              </TouchableOpacity>
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
        <Pressable
          onHoverIn={onRowHoverIn}
          onHoverOut={onRowHoverOut}
          style={styles.rowWrap}
        >
          {/* Left arrow */}
          {canScrollLeft && (
            <Animated.View style={[styles.arrowOverlay, styles.arrowLeft, leftArrowStyle]}>
              <TouchableOpacity
                onPress={scrollLeft}
                style={styles.arrowBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          )}

          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <MediaCard item={item} onPress={(it) => onItemPress(it, category.id)} />
            )}
            ListFooterComponent={hasPagination && canNext ? (
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
            ) : null}
            initialNumToRender={5}
            maxToRenderPerBatch={4}
            windowSize={5}
          />

          {/* Right arrow */}
          {canScrollRight && (
            <Animated.View style={[styles.arrowOverlay, styles.arrowRight, rightArrowStyle]}>
              <TouchableOpacity
                onPress={scrollRight}
                style={styles.arrowBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          )}
        </Pressable>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <MediaCard item={item} onPress={(it) => onItemPress(it, category.id)} />
            )}
            ListFooterComponent={hasPagination && canNext ? (
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
            ) : null}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={3}
            removeClippedSubviews={Platform.OS !== 'web'}
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
  container: { marginBottom: 30 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 10,
  },
  headerLeft: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  glyph: { fontFamily: fonts.mono, fontSize: 10 },
  name: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5, color: colors.textPrimary, flexShrink: 1 },
  pageIndicator: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 3, marginLeft: 17, fontStyle: 'italic' },

  // See More link
  seeMoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginLeft: 8, paddingVertical: 2, paddingHorizontal: 4,
  },
  seeMoreText: {
    fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5,
  },

  // Subscribe button
  subBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  subBtnText: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1, color: colors.textSecondary },

  // Row wrapper for hover detection
  rowWrap: { position: 'relative' },

  // Arrow overlays — Amazon Video style
  arrowOverlay: {
    position: 'absolute', top: 0, bottom: 0,
    width: 44, zIndex: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  arrowLeft: {
    left: 0,
    // Gradient fade from dark to transparent
    ...(Platform.OS === 'web' ? {
      backgroundImage: 'linear-gradient(to right, rgba(12,12,15,0.85), transparent)',
    } : {
      backgroundColor: 'rgba(12,12,15,0.6)',
    }),
  },
  arrowRight: {
    right: 0,
    ...(Platform.OS === 'web' ? {
      backgroundImage: 'linear-gradient(to left, rgba(12,12,15,0.85), transparent)',
    } : {
      backgroundColor: 'rgba(12,12,15,0.6)',
    }),
  },
  arrowBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

  // List content
  listContent: { paddingHorizontal: spacing.screenPadding, paddingVertical: 2 },
  emptyWrap: { paddingHorizontal: spacing.screenPadding, paddingVertical: 20 },
  emptyText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textGhost, letterSpacing: 1 },

  // Load more card (end of horizontal list)
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
