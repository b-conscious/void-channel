import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Dimensions, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MediaCard from '../components/MediaCard';
import { VoidLoader } from '../components';
import { useGeneration } from '../context/GenerationContext';
import { useSidebar } from '../context/SidebarContext';
import api from '../api/client';
import { colors, fonts, spacing, cardSize, radius } from '../theme';

const IS_DESKTOP = Platform.OS === 'web' && Dimensions.get('window').width > 900;

// Page size — the backend caps a single search at 50 (was requesting 30). "Load more" appends the
// next page on top, so the visible count grows past 50 instead of being stuck at one page.
const SEARCH_ROWS = 50;
// "Re-roll" cycles the sort so the SAME query returns a genuinely different result set each tap.
const REROLL_SORTS = ['downloads desc', 'downloads asc', 'addeddate desc', 'year desc', 'year asc', 'avg_rating desc', 'week desc'];

// Static assets live on the API origin (Render). The dedicated search-loading clip is served there.
const STATIC_BASE = __DEV__
  ? (typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      ? 'http://' + window.location.hostname + ':3001'
      : 'http://localhost:3001')
  : 'https://api.voidtv.net';
const SEARCH_LOADING_SRC = STATIC_BASE + '/static/search-loading.mp4';

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
  const { gen } = useGeneration();
  const accent = gen.accentColor;
  const { width: windowW } = useWindowDimensions();
  const { headerH } = useSidebar();

  // Full-width content under the persistent top bar (the desktop sidebar is gone).
  const sceneW = windowW;
  const contentW = windowW;
  const COLS = Math.max(2, Math.floor(
    (contentW - spacing.screenPadding * 2 + cardSize.gap) / (cardSize.width + cardSize.gap)
  ));
  // Cards flex to fill the row exactly so the last column is never clipped off-screen.
  const gridInnerW = contentW - spacing.screenPadding * 2;
  const CARD_W = Math.floor((gridInnerW - cardSize.gap * (COLS - 1)) / COLS);

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(0);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);       // last page returned a full batch → more to load
  const [activeDuration, setActiveDuration] = useState(0); // index into DURATION_FILTERS
  // Hint re-rolls when generation changes
  const hint = useMemo(() => pickRandom(gen.searchHints), [gen.id]);
  const sortRef = useRef(null);                          // current re-roll sort (null = default ranking)

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

  // Handle "See More" navigation from HomeScreen
  useEffect(() => {
    const categoryId = route?.params?.categoryId;
    const categoryName = route?.params?.categoryName;
    const collectionId = route?.params?.collection;
    const collectionName = route?.params?.collectionName;
    const creatorName = route?.params?.creator;

    // Direct query from the persistent TopBar — the single search input lives there now;
    // this screen is purely the results surface (no input, no filter chips).
    const q = route?.params?.q;
    if (q != null && String(q).trim().length >= 2) {
      const qq = String(q).trim();
      setBrowseCollection(null);
      setBrowseCreator(null);
      setSeeMoreCategory(null);
      setActiveFilter(0);
      setQuery(qq);
      setLoading(true);
      setSearched(true);
      sortRef.current = null;
      api.searchItems(qq, { page: 1, rows: SEARCH_ROWS })
        .then(data => { const it = data.items || []; setResults(it); setSearchPage(1); setHasMore(it.length >= SEARCH_ROWS); })
        .catch(err => { console.warn('[search:q]', err); setResults([]); })
        .finally(() => setLoading(false));
      return;
    }

    // Collection browse — "more from this show/series"
    if (collectionId) {
      setBrowseCollection({ id: collectionId, name: collectionName || collectionId });
      setBrowseCreator(null);
      setSeeMoreCategory(null);
      setActiveFilter(0);
      setQuery('');
      setLoading(true);
      setSearched(true);
      sortRef.current = null;
      api.searchCollection(collectionId, '', { page: 1, rows: SEARCH_ROWS })
        .then(data => { const it = data.items || []; setResults(it); setSearchPage(1); setHasMore(it.length >= SEARCH_ROWS); })
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
      sortRef.current = null;
      api.searchCreator(creatorName, { page: 1, rows: SEARCH_ROWS })
        .then(data => { const it = data.items || []; setResults(it); setSearchPage(1); setHasMore(it.length >= SEARCH_ROWS); })
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
    sortRef.current = null;
    api.searchItems('', { page: 1, rows: SEARCH_ROWS, category: categoryId })
      .then(data => {
        const it = data.items || [];
        setResults(it);
        setSearchPage(1);
        setHasMore(it.length >= SEARCH_ROWS);
      })
      .catch(err => {
        console.warn('[search:seeMore]', err);
        setResults([]);
      })
      .finally(() => setLoading(false));
  }, [route?.params?._ts]); // _ts changes on each "See More" or collection/creator tap

  // Apply a page of results: REPLACE on page 1, APPEND (deduped by id) on later pages — so "load
  // more" accumulates instead of swapping. hasMore = the last page came back full (likely more).
  const applyResults = useCallback((items, page) => {
    setResults((prev) => {
      if (page <= 1) return items;
      const seen = new Set(prev.map((i) => i.id));
      return prev.concat(items.filter((i) => i && !seen.has(i.id)));
    });
    setSearchPage(page);
    setHasMore(items.length >= SEARCH_ROWS);
  }, []);

  const doSearch = useCallback(async (q, filterIdx, page = 1, durIdx) => {
    const idx = filterIdx ?? activeFilter;
    const dIdx = durIdx ?? activeDuration;
    const filter = filtersRef.current[idx] || filtersRef.current[0];
    const dur = DURATION_FILTERS[dIdx];
    const hasQ = q && q.trim().length >= 2;
    const sort = sortRef.current || undefined;   // re-roll sort (null on a fresh search)

    // If browsing a collection or creator, search within it
    if (browseCollection) {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setSearched(true);
      try {
        const data = await api.searchCollection(browseCollection.id, hasQ ? q.trim() : '', { page, rows: SEARCH_ROWS, sort });
        applyResults(data.items || [], page);
      } catch (err) { console.warn('[search:collection]', err); if (page === 1) setResults([]); }
      finally { setLoading(false); setLoadingMore(false); }
      return;
    }
    if (browseCreator) {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setSearched(true);
      try {
        const data = await api.searchCreator(browseCreator, { page, rows: SEARCH_ROWS, sort });
        applyResults(data.items || [], page);
      } catch (err) { console.warn('[search:creator]', err); if (page === 1) setResults([]); }
      finally { setLoading(false); setLoadingMore(false); }
      return;
    }

    // No query and no filter — clear
    if (!hasQ && !filter.categoryId) {
      setResults([]);
      setSearched(false);
      setSearchPage(1);
      setHasMore(false);
      return;
    }

    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setSearched(true);
    try {
      const data = await api.searchItems(hasQ ? q.trim() : '', {
        page,
        rows: SEARCH_ROWS,
        category: filter.categoryId || undefined,
        minDuration: dur.min || undefined,
        maxDuration: dur.max || undefined,
        sort,
      });
      applyResults(data.items || [], page);
    } catch (err) {
      console.warn('[search]', err);
      if (page === 1) setResults([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeFilter, activeDuration, browseCollection, browseCreator, applyResults]);

  // Load more — append the next page (the LOAD MORE button + infinite scroll both call this)
  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    doSearch(query, activeFilter, searchPage + 1, activeDuration);
  }, [loading, loadingMore, hasMore, query, activeFilter, searchPage, activeDuration, doSearch]);

  // Re-roll — re-run the current search from page 1 with a fresh sort = a genuinely different set
  const handleReroll = useCallback(() => {
    const pool = REROLL_SORTS.filter((s) => s !== sortRef.current);
    sortRef.current = pool[Math.floor(Math.random() * pool.length)];
    doSearch(query, activeFilter, 1, activeDuration);
  }, [query, activeFilter, activeDuration, doSearch]);

  const handleItemPress = useCallback((item) => {
    // If a filter is active, attribute the watch to that category for streak tracking
    const categoryId = filtersRef.current[activeFilter]?.categoryId || null;
    navigation.navigate('Player', { item, id: item.id, categoryId });
  }, [navigation, activeFilter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + headerH }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: accent }]}>{gen.searchTitle}</Text>

        {/* Context banner — what scoped these results (collection / creator / See-More category).
            The search input + filter chips are gone: the TopBar is the single search affordance. */}
        {(browseCollection || browseCreator || seeMoreCategory) && (
          <View style={[styles.browseBanner, { borderColor: accent + '40' }]}>
            <Ionicons
              name={browseCollection ? 'folder-open-outline' : browseCreator ? 'person-outline' : 'albums-outline'}
              size={14} color={accent}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.browseBannerLabel}>
                {browseCollection ? 'COLLECTION' : browseCreator ? 'CREATOR' : 'CATEGORY'}
              </Text>
              <Text style={[styles.browseBannerName, { color: accent }]} numberOfLines={1}>
                {browseCollection ? browseCollection.name : browseCreator || seeMoreCategory.name}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { setBrowseCollection(null); setBrowseCreator(null); setSeeMoreCategory(null); setActiveFilter(0); setResults([]); setSearched(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textGhost} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.status}>
          {Platform.OS === 'web' ? (
            // The dedicated "searching the void" TV-screen clip — big, fills the scan area.
            <View style={styles.scanVideoWrap}>
              <div
                style={{ width: '100%' }}
                dangerouslySetInnerHTML={{ __html:
                  '<video src="' + SEARCH_LOADING_SRC + '" autoplay muted loop playsinline '
                  + 'style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;display:block;" />' }}
              />
            </View>
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
            <Text style={[styles.hintText, { color: accent + 'aa' }]}>↑ search from the bar above — try “{hint}”</Text>
          </View>
        </View>
      ) : (
        <FlatList
          // Remount when the column count changes — RN forbids changing numColumns on the fly.
          key={'grid-' + COLS}
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={COLS}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 90 }]}
          columnWrapperStyle={COLS > 1 ? styles.gridRow : undefined}
          renderItem={({ item }) => <MediaCard item={item} onPress={handleItemPress} width={CARD_W} style={{ marginRight: 0 }} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            <Text style={styles.resultCount}>
              {results.length} TRANSMISSION{results.length !== 1 ? 'S' : ''} FOUND
            </Text>
          }
          ListFooterComponent={
            <View style={styles.footerRow}>
              {hasMore && (
                <TouchableOpacity
                  onPress={handleLoadMore}
                  style={[styles.footerBtn, { borderColor: accent + '55' }]}
                  activeOpacity={0.7}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={accent} size="small" />
                  ) : (
                    <>
                      <Ionicons name="add-circle-outline" size={15} color={accent} />
                      <Text style={[styles.footerBtnText, { color: accent }]}>LOAD MORE</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleReroll}
                style={[styles.footerBtn, { borderColor: accent + '55' }]}
                activeOpacity={0.7}
                disabled={loading || loadingMore}
              >
                <Ionicons name="shuffle" size={15} color={accent} />
                <Text style={[styles.footerBtnText, { color: accent }]}>RE-ROLL</Text>
              </TouchableOpacity>
            </View>
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
  scanVideoWrap: { width: '100%', maxWidth: 860, marginBottom: 14, alignItems: 'center' },
  deadAir: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textGhost, letterSpacing: 2 },
  deadAirSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textGhost, fontStyle: 'italic', textAlign: 'center' },
  promptLine: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 1.5, textAlign: 'center' },
  promptBig: { fontFamily: fonts.monoBold, fontSize: 28, letterSpacing: 2, textAlign: 'center', marginVertical: 4 },
  hintPill: { marginTop: 8, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  hintText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5, fontStyle: 'italic' },
  grid: { paddingHorizontal: spacing.screenPadding, paddingTop: 16 },
  gridRow: { gap: cardSize.gap, marginBottom: cardSize.gap, justifyContent: 'flex-start' },
  resultCount: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 1, marginBottom: 14 },
  // Load-more + re-roll footer
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 5,
  },
  footerBtnText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 },
});
