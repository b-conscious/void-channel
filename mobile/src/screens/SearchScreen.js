import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  ScrollView, TouchableOpacity, Dimensions, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../components/SearchBar';
import MediaCard from '../components/MediaCard';
import { VoidLoader } from '../components';
import { useGeneration } from '../context/GenerationContext';
import { useSidebar, CONTENT_GAP } from '../context/SidebarContext';
import api from '../api/client';
import { colors, fonts, spacing, cardSize, radius } from '../theme';

const IS_DESKTOP = Platform.OS === 'web' && Dimensions.get('window').width > 900;

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

// Duration filter presets (in seconds)
const DURATION_FILTERS = [
  { label: 'ANY LENGTH',   min: 0,    max: 0    },
  { label: 'UNDER 5 MIN',  min: 0,    max: 300  },
  { label: '5–15 MIN',     min: 300,  max: 900  },
  { label: '15–30 MIN',    min: 900,  max: 1800 },
  { label: '30+ MIN',      min: 1800, max: 0    },
  { label: '1 HR+',        min: 3600, max: 0    },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function SearchScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { gen, generationId } = useGeneration();
  const accent = gen.accentColor;
  const { width: windowW } = useWindowDimensions();
  const { sidebarWidth } = useSidebar();

  // Reactive content width — scene = window minus sidebar+gap (applied via paddingLeft in nav)
  const sceneW = IS_DESKTOP ? windowW - sidebarWidth - CONTENT_GAP : windowW;
  const contentW = IS_DESKTOP ? sceneW - CONTENT_GAP : windowW;  // minus right padding too
  const COLS = Math.max(2, Math.floor(
    (contentW - spacing.screenPadding * 2 + cardSize.gap) / (cardSize.width + cardSize.gap)
  ));

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(0);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeDuration, setActiveDuration] = useState(0); // index into DURATION_FILTERS
  // Hint re-rolls when generation changes
  const hint = useMemo(() => pickRandom(gen.searchHints), [gen.id]);
  const debounceRef = useRef(null);

  // ── "See More" — incoming category from HomeScreen ──
  const [seeMoreCategory, setSeeMoreCategory] = useState(null);

  // ── "More from collection / creator" — incoming from PlayerScreen ──
  const [browseCollection, setBrowseCollection] = useState(null); // { id, name }
  const [browseCreator, setBrowseCreator] = useState(null); // string

  // Combine base filters with any incoming "See More" category
  const filters = useMemo(() => {
    if (!seeMoreCategory) return FILTERS;
    // Don't duplicate if already in base filters
    if (FILTERS.some(f => f.categoryId === seeMoreCategory.id)) return FILTERS;
    const label = (seeMoreCategory.name || seeMoreCategory.id).toUpperCase();
    return [
      FILTERS[0], // EVERYTHING stays first
      {
        categoryId: seeMoreCategory.id,
        label_boomer: label,
        label_millennial: label,
        label_genz: (seeMoreCategory.name || seeMoreCategory.id).toLowerCase(),
      },
      ...FILTERS.slice(1),
    ];
  }, [seeMoreCategory]);

  // Ref so doSearch always reads the latest filters list
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  function getFilterLabel(f) {
    const key = `label_${generationId}`;
    return (f[key] || f.label_millennial || '').toUpperCase();
  }

  // Handle "See More" navigation from HomeScreen
  useEffect(() => {
    const categoryId = route?.params?.categoryId;
    const categoryName = route?.params?.categoryName;
    const collectionId = route?.params?.collection;
    const collectionName = route?.params?.collectionName;
    const creatorName = route?.params?.creator;

    // Collection browse — "more from this show/series"
    if (collectionId) {
      setBrowseCollection({ id: collectionId, name: collectionName || collectionId });
      setBrowseCreator(null);
      setSeeMoreCategory(null);
      setActiveFilter(0);
      setQuery('');
      setLoading(true);
      setSearched(true);
      api.searchCollection(collectionId, '', { page: 1, rows: 30 })
        .then(data => { setResults(data.items || []); setSearchPage(1); })
        .catch(err => { console.warn('[search:collection]', err); setResults([]); })
        .finally(() => setLoading(false));
      return;
    }

    // Creator browse — "more by this director/studio"
    if (creatorName) {
      setBrowseCreator(creatorName);
      setBrowseCollection(null);
      setSeeMoreCategory(null);
      setActiveFilter(0);
      setQuery('');
      setLoading(true);
      setSearched(true);
      api.searchCreator(creatorName, { page: 1, rows: 30 })
        .then(data => { setResults(data.items || []); setSearchPage(1); })
        .catch(err => { console.warn('[search:creator]', err); setResults([]); })
        .finally(() => setLoading(false));
      return;
    }

    if (!categoryId) return;

    // Regular "See More" category browse
    setBrowseCollection(null);
    setBrowseCreator(null);
    setSeeMoreCategory({ id: categoryId, name: categoryName || categoryId });

    // Find index: if in base FILTERS use that, otherwise it'll be at index 1 (dynamic slot)
    const baseIdx = FILTERS.findIndex(f => f.categoryId === categoryId);
    const targetIdx = baseIdx >= 0 ? baseIdx : 1;

    setActiveFilter(targetIdx);
    setQuery('');

    // Direct API call — avoids timing issues with state/memo updates
    setLoading(true);
    setSearched(true);
    api.searchItems('', { page: 1, rows: 30, category: categoryId })
      .then(data => {
        setResults(data.items || []);
        setSearchPage(1);
      })
      .catch(err => {
        console.warn('[search:seeMore]', err);
        setResults([]);
      })
      .finally(() => setLoading(false));
  }, [route?.params?._ts]); // _ts changes on each "See More" or collection/creator tap

  const doSearch = useCallback(async (q, filterIdx, page = 1, durIdx) => {
    const idx = filterIdx ?? activeFilter;
    const dIdx = durIdx ?? activeDuration;
    const filter = filtersRef.current[idx] || filtersRef.current[0];
    const dur = DURATION_FILTERS[dIdx];
    const hasQ = q && q.trim().length >= 2;

    // If browsing a collection or creator, search within it
    if (browseCollection) {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setSearched(true);
      try {
        const data = await api.searchCollection(browseCollection.id, hasQ ? q.trim() : '', { page, rows: 30 });
        setResults(data.items || []);
        setSearchPage(page);
      } catch (err) { console.warn('[search:collection]', err); if (page === 1) setResults([]); }
      finally { setLoading(false); setLoadingMore(false); }
      return;
    }
    if (browseCreator) {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setSearched(true);
      try {
        const data = await api.searchCreator(browseCreator, { page, rows: 30 });
        setResults(data.items || []);
        setSearchPage(page);
      } catch (err) { console.warn('[search:creator]', err); if (page === 1) setResults([]); }
      finally { setLoading(false); setLoadingMore(false); }
      return;
    }

    // No query and no filter — clear
    if (!hasQ && !filter.categoryId) {
      setResults([]);
      setSearched(false);
      setSearchPage(1);
      return;
    }

    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setSearched(true);
    try {
      const data = await api.searchItems(hasQ ? q.trim() : '', {
        page,
        rows: 30,
        category: filter.categoryId || undefined,
        minDuration: dur.min || undefined,
        maxDuration: dur.max || undefined,
      });
      const items = data.items || [];
      setResults(items);
      setSearchPage(page);
    } catch (err) {
      console.warn('[search]', err);
      if (page === 1) setResults([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeFilter, activeDuration, browseCollection, browseCreator]);

  const handleChange = useCallback((text) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 420);
  }, [doSearch]);

  const handleFilterPress = useCallback((idx) => {
    setActiveFilter(idx);
    doSearch(query, idx, 1, activeDuration);
  }, [query, doSearch, activeDuration]);

  const handleDurationPress = useCallback((idx) => {
    setActiveDuration(idx);
    doSearch(query, activeFilter, 1, idx);
  }, [query, activeFilter, doSearch]);

  const handleItemPress = useCallback((item) => {
    // If a filter is active, attribute the watch to that category for streak tracking
    const categoryId = filtersRef.current[activeFilter]?.categoryId || null;
    navigation.navigate('Player', { item, id: item.id, categoryId });
  }, [navigation, activeFilter]);

  // On desktop the fixed-position sidebar sits on top of content;
  // each screen must push its own content right to avoid overlapping.
  const desktopMargin = IS_DESKTOP ? sidebarWidth + CONTENT_GAP : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top, marginLeft: desktopMargin }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: accent }]}>{gen.searchTitle}</Text>

        {/* Collection / Creator context banner */}
        {(browseCollection || browseCreator) && (
          <View style={[styles.browseBanner, { borderColor: accent + '40' }]}>
            <Ionicons
              name={browseCollection ? 'folder-open-outline' : 'person-outline'}
              size={14} color={accent}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.browseBannerLabel}>
                {browseCollection ? 'COLLECTION' : 'CREATOR'}
              </Text>
              <Text style={[styles.browseBannerName, { color: accent }]} numberOfLines={1}>
                {browseCollection ? browseCollection.name : browseCreator}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { setBrowseCollection(null); setBrowseCreator(null); setResults([]); setSearched(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textGhost} />
            </TouchableOpacity>
          </View>
        )}

        <SearchBar
          value={query} onChangeText={handleChange} onSubmit={() => doSearch(query)}
          placeholder={browseCollection ? `Search in ${browseCollection.name}...` : browseCreator ? `Search by ${browseCreator}...` : hint}
          accentColor={accent}
        />

        {/* Category filter chips — hidden when browsing a collection/creator */}
        {!browseCollection && !browseCreator && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={styles.filterRow} contentContainerStyle={styles.filterContent}
          >
            {filters.map((f, i) => (
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
        )}

        {/* Duration filter row */}
        {!browseCollection && !browseCreator && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={styles.durationRow} contentContainerStyle={styles.filterContent}
          >
            <Ionicons name="time-outline" size={13} color={colors.textGhost} style={{ marginRight: 2, alignSelf: 'center' }} />
            {DURATION_FILTERS.map((d, i) => (
              <TouchableOpacity
                key={i} onPress={() => handleDurationPress(i)}
                style={[styles.durChip, activeDuration === i && { borderColor: accent, backgroundColor: accent + '18' }]}
                activeOpacity={0.75}
              >
                <Text style={[styles.durChipText, activeDuration === i && { color: accent }]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={styles.status}>
          {Platform.OS === 'web' ? (
            <VoidLoader mode="static" size="channel" label="scanning archive..." style={{ width: 200, height: 120, marginBottom: 12, borderRadius: 8 }} />
          ) : (
            <ActivityIndicator color={accent} size="small" />
          )}
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
          <Text style={[styles.promptLine, { color: '#5cb8ff', fontFamily: fonts.monoBold }]}>GENERATING SINCE 1895</Text>
          <Text style={[styles.promptBig, { color: accent }]}>40 MILLION ITEMS</Text>
          <Text style={styles.promptLine}>before AI slop, there was human creativity</Text>
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
            <Text style={styles.resultCount}>
              {results.length} TRANSMISSION{results.length !== 1 ? 'S' : ''} FOUND · PAGE {searchPage}
            </Text>
          }
          ListFooterComponent={
            <View style={styles.paginationRow}>
              <TouchableOpacity
                onPress={() => doSearch(query, activeFilter, searchPage - 1)}
                style={[styles.pageBtn, { borderColor: accent + '55' }, searchPage <= 1 && styles.pageBtnDisabled]}
                activeOpacity={0.7}
                disabled={searchPage <= 1 || loadingMore}
              >
                <Ionicons name="chevron-back" size={14} color={searchPage > 1 ? accent : colors.textGhost} />
                <Text style={[styles.pageBtnText, { color: searchPage > 1 ? accent : colors.textGhost }]}>PREV</Text>
              </TouchableOpacity>

              {loadingMore ? (
                <ActivityIndicator color={accent} size="small" />
              ) : (
                <Text style={styles.pageText}>PAGE {searchPage}</Text>
              )}

              <TouchableOpacity
                onPress={() => doSearch(query, activeFilter, searchPage + 1)}
                style={[styles.pageBtn, { borderColor: accent + '55' }, results.length < 30 && styles.pageBtnDisabled]}
                activeOpacity={0.7}
                disabled={results.length < 30 || loadingMore}
              >
                <Text style={[styles.pageBtnText, { color: results.length >= 30 ? accent : colors.textGhost }]}>NEXT</Text>
                <Ionicons name="chevron-forward" size={14} color={results.length >= 30 ? accent : colors.textGhost} />
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, ...(IS_DESKTOP ? { paddingRight: CONTENT_GAP } : {}) },
  header: {
    paddingHorizontal: spacing.screenPadding, paddingTop: 16, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  title: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 2.5, marginBottom: 12 },
  browseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  browseBannerLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textGhost,
    letterSpacing: 1.5,
  },
  browseBannerName: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  filterRow: { marginTop: 12, marginBottom: 4, marginHorizontal: -spacing.screenPadding },
  filterContent: { paddingHorizontal: spacing.screenPadding, gap: 7, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 0.8 },
  durationRow: { marginTop: 4, marginBottom: 4, marginHorizontal: -spacing.screenPadding },
  durChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  durChipText: { fontFamily: fonts.mono, fontSize: 8, color: colors.textGhost, letterSpacing: 0.6 },
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
  // Pagination
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
    marginBottom: 10,
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
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 },
  pageText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
});
