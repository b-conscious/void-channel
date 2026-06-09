import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, Platform, Dimensions } from 'react-native';
import MediaCard from './MediaCard';
import SkeletonCard from './SkeletonCard';
import { useGeneration } from '../context/GenerationContext';
import { colors, fonts, spacing, cardSize } from '../theme';

const SCREEN_W = Dimensions.get('window').width;
const IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 768;

const CAT_GLYPHS = {
  prelinger: '▶', horror: '☠', computers: '◉',
  cartoons: '★',  psa: '⚠',   noir: '◆',
  scifi: '◈',     ephemeral: '◎', commercials: '$',
  d1930s: '◷',    d1940s: '◷', d1950s: '◷',
  d1960s: '◷',    d1970s: '◷', d1980s: '◷',
  show_betty_boop: '◈', show_popeye: '◈', show_looney: '◈',
  show_woody: '◈', show_mickey: '◈', show_felix: '◈',
  show_threestooges: '◈', show_twilightzone: '◈',
  community_hearts: '♥',
  mature: '⚠',
  // Deep cuts
  deep_cartoon_silly: '✦', deep_creature: '☠', deep_vampire: '🦇',
  deep_camp: '★', deep_cigarette_ads: '◎', deep_toy_ads: '◈',
  deep_food_ads: '◉', deep_atomic: '☢', deep_space: '◆',
  deep_hygiene: '◎', deep_dating: '♡', deep_propaganda: '⚑',
};

export default function CategoryRow({ category, onItemPress, loading, onSeeAll }) {
  const { gen } = useGeneration();
  const items = category?.items || [];
  const glyph = CAT_GLYPHS[category.id] || '▸';
  const accent = gen?.accentColor || colors.amber;

  // Use gen-aware name/subtitle if available, otherwise fall back to category defaults
  const catCopy = gen?.categories?.[category.id];
  const name = catCopy?.name || category.name || '';
  const subtitle = catCopy?.subtitle || category.subtitle || '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.nameRow}>
            <Text style={[styles.glyph, { color: accent }]}>{glyph}</Text>
            <Text style={styles.name}>{name}</Text>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {!loading && items.length > 0 && onSeeAll && (
          <TouchableOpacity onPress={() => onSeeAll(category)} style={styles.seeAll}>
            <Text style={styles.seeAllText}>ALL →</Text>
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
      ) : (
        {IS_DESKTOP ? (
          <View style={styles.grid}>
            {items.map((item) => (
              <MediaCard key={item.id} item={item} onPress={(it) => onItemPress(it, category.id)} />
            ))}
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <MediaCard item={item} onPress={(it) => onItemPress(it, category.id)} />
            )}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            getItemLayout={(_, index) => ({
              length: cardSize.width + cardSize.gap,
              offset: (cardSize.width + cardSize.gap) * index,
              index,
            })}
          />
        )}
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
  subtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 3, marginLeft: 17, fontStyle: 'italic' },
  seeAll: { paddingLeft: 12, paddingBottom: 2 },
  seeAllText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 1 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.screenPadding, gap: cardSize.gap,
  },
  listContent: { paddingHorizontal: spacing.screenPadding, paddingVertical: 2 },
  emptyWrap: { paddingHorizontal: spacing.screenPadding, paddingVertical: 20 },
  emptyText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textGhost, letterSpacing: 1 },
});
