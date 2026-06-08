import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SearchBar from '../components/SearchBar';
import MediaCard from '../components/MediaCard';
import { useGeneration } from '../context/GenerationContext';
import api from '../api/client';
import { colors, fonts, spacing, cardSize, radius } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');
const COLS = Math.max(2, Math.floor(
  (SCREEN_W - spacing.screenPadding * 2 + cardSize.gap) / (cardSize.width + cardSize.gap)
));

// Filter chips map to backend category IDs (or null for everything).
// Labels are per-generation; everything else is shared.
const FILTERS = [
  { categoryId: null,         label_boomer: 'EVERYTHING',  label_millennial: 'EVERYTHING',       label_genz: 'everything' },
  { categoryId: 'prelinger',  label_boomer: 'GOVERNMENT',  label_millennial: 'GOVERNMENT STUFF', label_genz: 'gov stuff' },
  { categoryId: 'horror',     label_boomer: 'MONSTERS',    label_millennial: 'MONSTERS',         label_genz: 'monsters' },
  { categoryId: 'cartoons',   label_boomer: 'ANIMATION',   label_millennial: 'OLD CARTOONS',     label_genz: 'old cartoons' },
  { categoryId: 'computers',  label_boomer: 'TECHNOLOGY',  label_millennial: 'COMPUTER THINGS',  label_genz: 'tech stuff' },
  { categoryId: 'noir',       label_boomer: 'MYSTERY',     label_millennial: 'CRIME',            label_genz: 'crime ig' },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen, generationId } = useGeneration();
  const accent = gen.accentColor;

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(0);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Hint re-rolls when generation changes
  const hint = useMemo(() => pickRandom(gen.searchHints), [gen.id]);
  const debounceRef = useRef(null);

  function getFilterLabel(f) {
    const key = `label_${generationId}`;
    return (f[key] || f.label_millennial || '').toUpperCase();
  }

  const doSearch = useCallback(async (q, filterIdx) => {
    const idx = filterIdx ?? activeFilter;
    const filter = FILTERS[idx];
    const hasQ = q && q.trim().length >= 2;

    // No query and no filter — clear
    if (!hasQ && !filter.categoryId) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchItems(hasQ ? q.trim() : '', {
        page: 1,
        rows: 30,
        category: filter.categoryId || undefined,
      });
      setResults(data.items || []);
    } catch (err) {
      console.warn('[search]', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  const handleChange = useCallback((text) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 420);
  }, [doSearch]);

  const handleFilterPress = useCallback((idx) => {
    setActiveFilter(idx);
    doSearch(query, idx);
  }, [query, doSearch]);

  const handleItemPress = useCallback((item) => {
    // If a filter is active, attribute the watch to that category for streak tracking
    const categoryId = FILTERS[activeFilter]?.categoryId || null;
    navigation.navigate('Player', { item, categoryId });
  }, [navigation, activeFilter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: accent }]}>{gen.searchTitle}</Text>
        <SearchBar value={query} onChangeText={handleChange} onSubmit={() => doSearch(query)} placeholder={hint} accentColor={accent} />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.filterRow} contentContainerStyle={styles.filterContent}
        >
          {FILTERS.map((f, i) => (
            <TouchableOpacity
              key={i} onPress={() => handleFilterPress(i)}
              style={[styles.chip, activeFilter === i && { borderColor: accent, backgroundColor: accent + '18' }]}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, activeFilter === i && { color: accent }]}>
                {getFilterLabel(f)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator color={accent} size="small" />
          <Text style={[styles.statusText, { color: accent }]}>SCANNING ARCHIVE...</Text>
        </View>
      ) : searched && results.length === 0 ? (
        <View style={styles.status}>
          <Text style={styles.deadAir}>{gen.noSignal}</Text>
          <Text style={styles.deadAirSub}>{gen.emptySearch}</Text>
          <Text style={styles.deadAirSub}>{hint}</Text>
        </View>
      ) : !searched ? (
        <View style={styles.status}>
          <Text style={styles.promptLine}>THE INTERNET ARCHIVE HAS</Text>
          <Text style={[styles.promptBig, { color: accent }]}>40 MILLION ITEMS</Text>
          <Text style={styles.promptLine}>the weird ones are in here</Text>
          <View style={[styles.hintPill, { borderColor: accent + '55' }]}>
            <Text style={[styles.hintText, { color: accent + 'aa' }]}>{hint}</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={COLS}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 90 }]}
          columnWrapperStyle={COLS > 1 ? styles.gridRow : undefined}
          renderItem={({ item }) => <MediaCard item={item} onPress={handleItemPress} style={{ marginRight: 0 }} />}
          ListHeaderComponent={
            <Text style={styles.resultCount}>{results.length} TRANSMISSION{results.length !== 1 ? 'S' : ''} FOUND</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.screenPadding, paddingTop: 16, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  title: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 2.5, marginBottom: 12 },
  filterRow: { marginTop: 12, marginBottom: 4, marginHorizontal: -spacing.screenPadding },
  filterContent: { paddingHorizontal: spacing.screenPadding, gap: 7, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 0.8 },
  status: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 80, paddingHorizontal: spacing.screenPadding },
  statusText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5 },
  deadAir: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textGhost, letterSpacing: 2 },
  deadAirSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textGhost, fontStyle: 'italic', textAlign: 'center' },
  promptLine: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 1.5, textAlign: 'center' },
  promptBig: { fontFamily: fonts.monoBold, fontSize: 28, letterSpacing: 2, textAlign: 'center', marginVertical: 4 },
  hintPill: { marginTop: 8, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  hintText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5, fontStyle: 'italic' },
  grid: { paddingHorizontal: spacing.screenPadding, paddingTop: 16 },
  gridRow: { gap: cardSize.gap, marginBottom: cardSize.gap, justifyContent: 'flex-start' },
  resultCount: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 1, marginBottom: 14 },
});
