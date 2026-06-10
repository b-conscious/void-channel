import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Dimensions, ActivityIndicator, Pressable,
} from 'react-native';
// NOTE: Removed react-native-reanimated — useAnimatedStyle causes TDZ crash in prod bundles.
// Arrow overlays use CSS opacity transition + React state instead.
import { Ionicons } from '@expo/vector-icons';
import MediaCard from './MediaCard';
import SkeletonCard from './SkeletonCard';
import VoidLoader from './VoidLoader';
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
  computers: '◉',   cartoons: '★',   feature_length: '🎬', horror: '☠',
  scifi: '◈',       noir: '◆',       newsreels: '▣',
  educational_tv: '▷', mature: '⚠',
  // Decades
  d1930s: '◷',    d1940s: '◷', d1950s: '◷',
  d1960s: '◷',    d1970s: '◷', d1980s: '◷',
  // Shows
  show_betty_boop: '◈', show_popeye: '◈', show_looney: '◈',
  show_woody: '◈', show_mickey: '◈', show_felix: '◈',
  show_threestooges: '◈', show_twilightzone: '◈',
  most_popular: '🏆',
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

// Subtle per-row tint so the wall's rows delineate from one another — very faint, category-derived
// (each category gets a consistent hue), so scrolling the sea reads as distinct bands, not a blur.
var ROW_TINTS = [
  'rgba(92,184,255,0.045)', 'rgba(245,166,35,0.045)', 'rgba(178,255,62,0.04)',
  'rgba(181,102,255,0.045)', 'rgba(255,45,120,0.04)', 'rgba(0,229,255,0.04)',
];
function rowTint(id) {
  var s = id || 'x', h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return ROW_TINTS[Math.abs(h) % ROW_TINTS.length];
}

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

  // Scroll refs — track positions in refs to avoid re-rendering on every scroll frame.
  // Only the derived arrow visibility state triggers re-renders.
  const listRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const contentWidthRef = useRef(0);
  const containerWidthRef = useRef(SCREEN_W);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [rowHovered, setRowHovered] = useState(false);

  // Arrow opacity — always visible on desktop so users know they can scroll.
  // Brightens slightly on row hover for polish.
  const onRowHoverIn = useCallback(() => {
    if (Platform.OS !== 'web') return;
    setRowHovered(true);
  }, []);

  const onRowHoverOut = useCallback(() => {
    setRowHovered(false);
  }, []);

  const arrowOpacityStyle = {
    opacity: rowHovered ? 1 : 0.7,
    ...(Platform.OS === 'web' ? { transition: 'opacity 0.2s ease' } : {}),
  };

  const scrollLeft = useCallback(() => {
    const next = Math.max(0, scrollOffsetRef.current - SCROLL_AMOUNT);
    listRef.current?.scrollToOffset({ offset: next, animated: true });
  }, []);

  const scrollRight = useCallback(() => {
    const next = scrollOffsetRef.current + SCROLL_AMOUNT;
    listRef.current?.scrollToOffset({ offset: next, animated: true });
    // If near the end and we can page, load more
    if (next + containerWidthRef.current >= contentWidthRef.current - 50 && hasPagination && canNext && !loadingMore) {
      onPageChange(category.id, page + 1);
    }
  }, [hasPagination, canNext, loadingMore, page, category.id, onPageChange]);

  const handleScroll = useCallback((e) => {
    const ox = e.nativeEvent.contentOffset.x;
    const cw = e.nativeEvent.contentSize.width;
    const vw = e.nativeEvent.layoutMeasurement.width;
    scrollOffsetRef.current = ox;
    contentWidthRef.current = cw;
    containerWidthRef.current = vw;
    // Only re-render if arrow visibility actually changed
    const newLeft = ox > 10;
    const newRight = cw > vw + ox + 10;
    setCanScrollLeft((prev) => prev !== newLeft ? newLeft : prev);
    setCanScrollRight((prev) => prev !== newRight ? newRight : prev);
  }, []);

  // Detect overflow on initial render — show right arrow immediately if content is wider than viewport
  const handleContentSizeChange = useCallback((contentW) => {
    contentWidthRef.current = contentW;
    if (containerWidthRef.current > 0) {
      setCanScrollRight(contentW > containerWidthRef.current + 10);
    }
  }, []);

  const handleListLayout = useCallback((e) => {
    const vw = e.nativeEvent.layout.width;
    containerWidthRef.current = vw;
    if (contentWidthRef.current > 0) {
      setCanScrollRight(contentWidthRef.current > vw + 10);
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: rowTint(category.id) }]}>
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
        // Fill the loading row with the void-stream itself — each TV channel-surfed to a different
        // scene — so content materializes out of the void instead of dead skeleton cards.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
        >
          {Array.from({ length: IS_DESKTOP ? 5 : 4 }).map((_, i) => (
            <View key={i} style={{ marginRight: cardSize.gap }}>
              <VoidLoader mode="static" size="card" label={i === 0 ? 'tuning in...' : undefined} />
            </View>
          ))}
        </ScrollView>
      ) : items.length === 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
        >
          {Array.from({ length: IS_DESKTOP ? 4 : 3 }).map((_, i) => (
            <View key={i} style={{ marginRight: cardSize.gap }}>
              <VoidLoader mode="static" size="card" label={i === 0 ? (gen?.noSignal || 'DEAD AIR') : undefined} />
            </View>
          ))}
        </ScrollView>
      ) : IS_DESKTOP ? (
        <Pressable
          onHoverIn={onRowHoverIn}
          onHoverOut={onRowHoverOut}
          style={styles.rowWrap}
        >
          {/* Left arrow — always visible on desktop, dimmed when at scroll start */}
          <View style={[
            styles.arrowOverlay,
            styles.arrowLeft,
            arrowOpacityStyle,
            !canScrollLeft && { opacity: 0.25, pointerEvents: 'none' },
          ]}>
            <TouchableOpacity
              onPress={scrollLeft}
              style={styles.arrowBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={handleContentSizeChange}
            onLayout={handleListLayout}
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

          {/* Right arrow — always visible on desktop, dimmed when at scroll end */}
          <View style={[
            styles.arrowOverlay,
            styles.arrowRight,
            arrowOpacityStyle,
            !canScrollRight && { opacity: 0.25, pointerEvents: 'none' },
          ]}>
            <TouchableOpacity
              onPress={scrollRight}
              style={styles.arrowBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
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
            onContentSizeChange={handleContentSizeChange}
            onLayout={handleListLayout}
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
  container: { marginBottom: 14, paddingTop: 10, paddingBottom: 14, borderRadius: 6 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 10,
  },
  headerLeft: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  glyph: { fontFamily: fonts.mono, fontSize: 11 },
  name: { fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 1.5, color: colors.textPrimary, flexShrink: 1 },
  pageIndicator: { fontFamily: fonts.mono, fontSize: 10, color: colors.textGhost, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 3, marginLeft: 17, fontStyle: 'italic' },

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
