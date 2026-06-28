import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Dimensions, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MediaCard from '../components/MediaCard';
import { VoidLoader } from '../components';
import { useGeneration } from '../context/GenerationContext';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { useKids } from '../context/KidsContext';
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

// Genre chips (B's spec 2026-06-11): each maps to a Lucene clause ANDed with the text query;
// with no text the clause searches alone, so chips work as genre browsing too. Search stays
// raw when ALL is active. 18+ is the mature corral: opt-in by tap AND member-gated like the
// wall (the chip routes non-members to sign-in, never silently).
// Each genre carries BOTH shapes: `q` (Lucene, the live raw path when text is typed) and
// `terms`/`crates` (THE LIBRARY: instant filtered browse over Spine pools when no text).
const GENRES = [
  { label: 'ALL', q: null },
  { label: 'COMEDY', q: 'subject:(comedy)', terms: ['comedy'], crates: ['comedy', 'show_threestooges'] },
  { label: 'FUNNY', q: '(subject:(funny OR humor) OR title:(funny))', terms: ['funny', 'humor'] },
  { label: 'SKITS', q: '(title:(skit OR sketch) OR subject:(sketch OR parody))', terms: ['skit', 'sketch', 'parody'] },
  { label: 'SCI-FI', q: 'subject:("science fiction" OR scifi)', terms: ['science fiction', 'sci-fi', 'scifi'], crates: ['scifi', 'deep_space'] },
  { label: 'HORROR', q: 'subject:(horror)', terms: ['horror'], crates: ['horror', 'deep_creature', 'deep_vampire'] },
  { label: 'THRILLER', q: 'subject:(thriller OR suspense)', terms: ['thriller', 'suspense'] },
  { label: 'MYSTERY', q: 'subject:(mystery)', terms: ['mystery'] },
  { label: 'DRAMA', q: 'subject:(drama)', terms: ['drama'] },
  { label: 'CULT', q: 'subject:(cult OR exploitation OR "b movie")', terms: ['cult', 'exploitation', 'b movie'], crates: ['deep_camp'] },
  { label: 'CRIME', q: '(subject:(crime OR "crime drama" OR "true crime") OR title:(crime))', terms: ['crime'], crates: ['noir'] },
  { label: 'GANGSTER', q: 'subject:(gangster OR gangsters OR mobster OR mafia)', terms: ['gangster', 'mobster', 'mafia'] },
  { label: 'HOOD', q: 'subject:(blaxploitation OR "urban drama" OR "street gang" OR "inner city")', terms: ['blaxploitation', 'urban drama'], crates: ['blaxploitation'] },
  { label: 'URBAN', q: 'subject:("hip hop" OR rap OR graffiti OR breakdancing OR funk OR soul)', terms: ['hip hop', 'rap', 'graffiti', 'funk'] },
  { label: 'TV', q: '(subject:(television) OR collection:(television))', terms: ['television'], crates: ['tv', 'tv_static'], catalog: 'series' },
  { label: 'SERIES', q: '(subject:(series) OR title:(episode))', terms: ['series', 'episode'] },
  { label: 'MOVIES', q: '(subject:("feature film" OR feature) OR collection:(feature_films))', terms: ['feature'], crates: ['feature_length', 'ia_features'], catalog: 'movies' },
  { label: 'CARTOONS', q: 'subject:(animation OR cartoon OR cartoons)', terms: ['animation', 'cartoon'], crates: ['cartoons', 'saturday_morning'] },
  { label: 'ANIME', q: '(subject:(anime) OR title:(anime))', terms: ['anime'], crates: ['anime'] },
  { label: 'ACTION', q: 'subject:(action)', terms: ['action'] },
  { label: 'ROMANCE', q: 'subject:(romance OR "love story")', terms: ['romance', 'love story'] },
  { label: 'FANTASY', q: 'subject:(fantasy)', terms: ['fantasy'] },
  { label: 'WESTERN', q: 'subject:(western OR westerns)', terms: ['western'], crates: ['western'] },
  { label: 'WAR', q: 'subject:(war OR wwii OR "world war")', terms: ['war', 'wwii'], crates: ['war_footage'] },
  { label: 'NOIR', q: 'subject:("film noir" OR noir)', terms: ['noir'], crates: ['noir'] },
  { label: 'MUSICAL', q: 'subject:(musical OR musicals)', terms: ['musical'] },
  { label: 'MUSIC', q: 'subject:("music video" OR concert)', terms: ['music video', 'concert'] },
  { label: 'DOCUMENTARY', q: 'subject:(documentary)', terms: ['documentary'], crates: ['documentary'] },
  { label: 'NATURE', q: 'subject:(nature OR wildlife)', terms: ['nature', 'wildlife'], crates: ['nature_wildlife'] },
  { label: 'SPORTS', q: 'subject:(sports OR boxing OR baseball)', terms: ['sports', 'boxing', 'baseball'] },
  { label: 'KIDS', q: 'subject:(children OR kids)', terms: ['children', 'kids'], crates: ['saturday_morning'] },
  { label: 'EDUCATIONAL', q: 'subject:(educational)', terms: ['educational'], crates: ['education'] },
  { label: 'HOW-TO', q: 'subject:(instructional OR "how to")', terms: ['instructional', 'how to'], crates: ['howto'] },
  { label: 'COMMERCIALS', q: '(subject:(commercials) OR title:(commercial))', terms: ['commercial'] },
  { label: 'ART', q: 'subject:(art OR experimental OR "art house")', terms: ['experimental', 'art house', 'abstract'] },
  { label: '18+', q: null, mature: true },
];

// Era lens speaks the app's own generation language (B's ruling 2026-06-11): three signals,
// clean partition, no decade math. Same identity vocabulary as the wall's signal switch.
const ERAS = [
  { label: 'ANY ERA', q: null },
  { label: 'BOOMER', q: 'year:[1900 TO 1979]', yearFrom: 1900, yearTo: 1979 },
  { label: 'MILLENNIAL', q: 'year:[1980 TO 2004]', yearFrom: 1980, yearTo: 2004 },
  { label: 'GEN Z', q: 'year:[2005 TO 9999]', yearFrom: 2005 },
];

// Duration filter presets in seconds (under-20 re-added on B's second look)
const DURATION_FILTERS = [
  { label: 'ANY LENGTH',   min: 0,    max: 0    },
  { label: 'UNDER 20 MIN', min: 0,    max: 1200 },
  { label: 'OVER 20 MIN',  min: 1200, max: 0    },
  { label: 'OVER 60 MIN',  min: 3600, max: 0    },
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
  const { isAuthenticated, isAnonymous } = useAuth(); // the 18+ chip is member-gated like the wall corral
  const { kidsMode, kidsAccent } = useKids();

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
  const [activeGenre, setActiveGenre] = useState(0);       // index into GENRES
  const [activeEra, setActiveEra] = useState(0);           // index into ERAS
  const [openLens, setOpenLens] = useState(null);          // 'genre' | 'length' | 'era' | null
  // THE CATALOG: TV chip = shows grid; tapping a show lists its episodes in order
  const [seriesList, setSeriesList] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  // Refs so the TopBar route-q effect (deps: _ts only) reads the LIVE chip state
  const genreRef = useRef(0);
  useEffect(() => { genreRef.current = activeGenre; }, [activeGenre]);
  const durRef = useRef(0);
  useEffect(() => { durRef.current = activeDuration; }, [activeDuration]);
  const eraRef = useRef(0);
  useEffect(() => { eraRef.current = activeEra; }, [activeEra]);
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

    // CATALOG FRONT DOOR — SHOWS / MOVIES are destinations, not searches (B's ruling).
    // Drawer items + wall cards land here with `catalog` and no query; mirror the chip
    // destinations with direct api calls (same pattern as the branches below) and set the
    // matching genre chip so load-more / lens taps page through doSearch normally.
    const catalogDest = route?.params?.catalog;
    if (catalogDest === 'movies' || catalogDest === 'series') {
      const gi = GENRES.findIndex(g => g.catalog === catalogDest);
      setBrowseCollection(null);
      setBrowseCreator(null);
      setSeeMoreCategory(null);
      setActiveFilter(0);
      setQuery('');
      if (gi >= 0) setActiveGenre(gi);
      setSelectedSeries(null);
      setLoading(true);
      setSearched(true);
      sortRef.current = null;
      const liveFallback = () => {
        // Spine not wired — fall through to the live composed search so nothing breaks.
        const g = gi >= 0 ? GENRES[gi] : null;
        if (!g || !g.q) { setResults([]); return Promise.resolve(); }
        return api.searchItems(g.q, { page: 1, rows: SEARCH_ROWS })
          .then(d => { const it = d.items || []; setResults(it); setSearchPage(1); setHasMore(it.length >= SEARCH_ROWS); });
      };
      if (catalogDest === 'movies') {
        setSeriesList(null);
        api.getCatalogMovies({ rows: SEARCH_ROWS, page: 1 })
          .then(cat => {
            if (cat.fallback) return liveFallback();
            const it = cat.items || [];
            setResults(it); setSearchPage(1); setHasMore(it.length >= SEARCH_ROWS);
          })
          .catch(err => { console.warn('[catalog:movies]', err); setResults([]); })
          .finally(() => setLoading(false));
      } else {
        api.getCatalogSeries({ rows: 120, page: 1 })
          .then(cat => {
            if (cat.fallback) { setSeriesList(null); return liveFallback(); }
            setSeriesList(cat.items || []);
            setResults([]); setSearchPage(1); setHasMore(false);
          })
          .catch(err => { console.warn('[catalog:series]', err); setSeriesList([]); setResults([]); })
          .finally(() => setLoading(false));
      }
      return;
    }

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
      // A new text search keeps the active genre/length/era lens (sticky chips)
      const g = GENRES[genreRef.current] || GENRES[0];
      const dl = DURATION_FILTERS[durRef.current] || DURATION_FILTERS[0];
      const er = ERAS[eraRef.current] || ERAS[0];
      const lensed = [`(${qq})`, g.q, er.q].filter(Boolean).join(' AND ');
      api.searchItems(lensed === `(${qq})` ? qq : lensed, {
        page: 1, rows: SEARCH_ROWS,
        minDuration: dl.min || undefined, maxDuration: dl.max || undefined,
        mature: g.mature || undefined,
      })
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

  const doSearch = useCallback(async (q, filterIdx, page = 1, durIdx, genreIdx, eraIdx) => {
    const idx = filterIdx ?? activeFilter;
    const dIdx = durIdx ?? activeDuration;
    const gIdx = genreIdx ?? activeGenre;
    const eIdx = eraIdx ?? activeEra;
    const filter = filtersRef.current[idx] || filtersRef.current[0];
    const dur = DURATION_FILTERS[dIdx];
    const genre = GENRES[gIdx] || GENRES[0];
    const era = ERAS[eIdx] || ERAS[0];
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

    // No query, no filter, no lens at all — clear
    if (!hasQ && !filter.categoryId && !genre.q && !genre.mature && !era.q) {
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
      // THE CATALOG: MOVIES/TV with no text are DESTINATIONS (B's ruling). Movies = the
      // Wikidata-verified films grid; TV = the shows grid (series cards, then episodes).
      // Fallback flag = spine not wired, fall through to library/live below.
      if (!hasQ && genre.catalog && !filter.categoryId) {
        if (genre.catalog === 'movies') {
          const cat = await api.getCatalogMovies({
            rows: SEARCH_ROWS, page,
            yearFrom: era.yearFrom || undefined, yearTo: era.yearTo || undefined,
          });
          if (!cat.fallback) { applyResults(cat.items || [], page); return; }
        } else if (genre.catalog === 'series') {
          const cat = await api.getCatalogSeries({ rows: 120, page: 1 });
          if (!cat.fallback) {
            setSeriesList(cat.items || []);
            setResults([]);
            setSearchPage(1);
            setHasMore(false);
            return;
          }
        }
      }
      // THE LIBRARY: no text + any lens = instant filtered browse over the Spine pools
      // (B: chips re-searching the Archive each tap was clunky). Typed text keeps the raw
      // live path below; 18+ stays live and gated. Fallback flag = spine not wired, fall
      // through to the live composed search so nothing ever breaks.
      const wantLibrary = !hasQ && !filter.categoryId && !genre.mature
        && (genre.q || era.q || dur.min || dur.max);
      if (wantLibrary) {
        const lib = await api.getLibrary({
          terms: (genre.terms || []).join(','),
          crates: (genre.crates || []).join(','),
          yearFrom: era.yearFrom || undefined,
          yearTo: era.yearTo || undefined,
          minRuntime: dur.min || undefined,
          maxRuntime: dur.max || undefined,
          rows: SEARCH_ROWS,
          page,
        });
        if (!lib.fallback) {
          applyResults(lib.items || [], page);
          return;
        }
      }
      // Genre + era clauses compose with the text query; alone they act as lens browsing.
      const baseQ = hasQ ? `(${q.trim()})` : '';
      const composedQ = [baseQ, genre.q, era.q].filter(Boolean).join(' AND ');
      const data = await api.searchItems(composedQ, {
        page,
        rows: SEARCH_ROWS,
        category: filter.categoryId || undefined,
        minDuration: dur.min || undefined,
        maxDuration: dur.max || undefined,
        sort,
        mature: genre.mature || undefined,
      });
      applyResults(data.items || [], page);
    } catch (err) {
      console.warn('[search]', err);
      if (page === 1) setResults([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeFilter, activeDuration, activeGenre, activeEra, browseCollection, browseCreator, applyResults]);

  // Load more — append the next page (the LOAD MORE button + infinite scroll both call this)
  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    doSearch(query, activeFilter, searchPage + 1, activeDuration, activeGenre, activeEra);
  }, [loading, loadingMore, hasMore, query, activeFilter, searchPage, activeDuration, activeGenre, activeEra, doSearch]);

  // Re-roll — re-run the current search from page 1 with a fresh sort = a genuinely different set
  const handleReroll = useCallback(() => {
    const pool = REROLL_SORTS.filter((s) => s !== sortRef.current);
    sortRef.current = pool[Math.floor(Math.random() * pool.length)];
    doSearch(query, activeFilter, 1, activeDuration, activeGenre, activeEra);
  }, [query, activeFilter, activeDuration, activeGenre, activeEra, doSearch]);

  // Chip handlers — a chip tap re-runs the current search through the new lens from page 1
  // and collapses the picker (one decision per open).
  const handleGenrePress = useCallback((i) => {
    const g = GENRES[i];
    if (g.mature && !(isAuthenticated && !isAnonymous)) { navigation.navigate('Auth'); return; }
    setActiveGenre(i);
    setOpenLens(null);
    setSeriesList(null);
    setSelectedSeries(null);
    sortRef.current = null;
    doSearch(query, activeFilter, 1, activeDuration, i, activeEra);
  }, [isAuthenticated, isAnonymous, navigation, query, activeFilter, activeDuration, activeEra, doSearch]);

  // Tap a show: load its episodes in broadcast order into the normal results grid
  const handleSeriesPress = useCallback(async (s) => {
    setSelectedSeries(s);
    setLoading(true);
    try {
      const data = await api.getSeriesEpisodes(s.key, { rows: 300 });
      applyResults(data.items || [], 1);
      setHasMore(false);
    } catch (err) { console.warn('[catalog:series]', err); setResults([]); }
    finally { setLoading(false); }
  }, [applyResults]);

  const handleSeriesBack = useCallback(() => {
    setSelectedSeries(null);
    setResults([]);
    setSearched(true);
  }, []);

  const handleDurationPress = useCallback((i) => {
    setActiveDuration(i);
    setOpenLens(null);
    setSelectedSeries(null);
    sortRef.current = null;
    doSearch(query, activeFilter, 1, i, activeGenre, activeEra);
  }, [query, activeFilter, activeGenre, activeEra, doSearch]);

  const handleEraPress = useCallback((i) => {
    setActiveEra(i);
    setOpenLens(null);
    setSelectedSeries(null);
    sortRef.current = null;
    doSearch(query, activeFilter, 1, activeDuration, activeGenre, i);
  }, [query, activeFilter, activeDuration, activeGenre, doSearch]);

  const toggleLens = useCallback((which) => {
    setOpenLens((cur) => (cur === which ? null : which));
  }, []);

  const handleItemPress = useCallback((item) => {
    // If a filter is active, attribute the watch to that category for streak tracking
    const categoryId = filtersRef.current[activeFilter]?.categoryId || null;
    navigation.navigate('Player', { item, id: item.id, categoryId });
  }, [navigation, activeFilter]);

  // VOIDtv KIDS: raw search does not exist here. The TopBar removes the entry point; this
  // guard covers the /search deep link so the gate holds fail-closed.
  if (kidsMode) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + headerH }]}>
        <View style={styles.status}>
          <Text style={[styles.promptBig, { color: kidsAccent }]}>VOIDtv KIDS</Text>
          <Text style={styles.promptLine}>search is off in kids mode — everything safe is on the wall</Text>
        </View>
      </View>
    );
  }

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

        {/* Inside a show: name + back to the shows grid */}
        {selectedSeries && (
          <View style={[styles.browseBanner, { borderColor: accent + '40' }]}>
            <Ionicons name="tv-outline" size={14} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.browseBannerLabel}>SERIES</Text>
              <Text style={[styles.browseBannerName, { color: accent }]} numberOfLines={1}>{selectedSeries.name}</Text>
            </View>
            <TouchableOpacity onPress={handleSeriesBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textGhost} />
            </TouchableOpacity>
          </View>
        )}

        {/* The lens bar (B: "cleanest way"): three compact pickers showing their current
            selection; tap to expand one group's chips, pick, it collapses. Hidden during
            collection/creator browse where those paths ignore them. */}
        {!browseCollection && !browseCreator && (
          <>
            <View style={styles.lensBar}>
              <TouchableOpacity onPress={() => toggleLens('genre')} activeOpacity={0.7}
                style={[styles.lensPill, (activeGenre !== 0 || openLens === 'genre') && { borderColor: accent }]}>
                <Text style={[styles.lensPillText, activeGenre !== 0 && { color: accent }]}>
                  {activeGenre === 0 ? 'GENRE' : GENRES[activeGenre].label} {openLens === 'genre' ? '▴' : '▾'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleLens('length')} activeOpacity={0.7}
                style={[styles.lensPill, (activeDuration !== 0 || openLens === 'length') && { borderColor: accent }]}>
                <Text style={[styles.lensPillText, activeDuration !== 0 && { color: accent }]}>
                  {activeDuration === 0 ? 'LENGTH' : DURATION_FILTERS[activeDuration].label} {openLens === 'length' ? '▴' : '▾'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleLens('era')} activeOpacity={0.7}
                style={[styles.lensPill, (activeEra !== 0 || openLens === 'era') && { borderColor: accent }]}>
                <Text style={[styles.lensPillText, activeEra !== 0 && { color: accent }]}>
                  {activeEra === 0 ? 'ERA' : ERAS[activeEra].label} {openLens === 'era' ? '▴' : '▾'}
                </Text>
              </TouchableOpacity>
            </View>
            {openLens === 'genre' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
                {GENRES.map((g, i) => {
                  const active = i === activeGenre;
                  return (
                    <TouchableOpacity key={g.label} onPress={() => handleGenrePress(i)} activeOpacity={0.7}
                      style={[styles.chip, active && { borderColor: accent, backgroundColor: accent + '18' }]}>
                      <Text style={[styles.chipText, active && { color: accent }]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {openLens === 'length' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationRow} contentContainerStyle={styles.filterContent}>
                {DURATION_FILTERS.map((d, i) => {
                  const active = i === activeDuration;
                  return (
                    <TouchableOpacity key={d.label} onPress={() => handleDurationPress(i)} activeOpacity={0.7}
                      style={[styles.durChip, active && { borderColor: accent, backgroundColor: accent + '18' }]}>
                      <Text style={[styles.durChipText, active && { color: accent }]}>{d.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {openLens === 'era' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationRow} contentContainerStyle={styles.filterContent}>
                {ERAS.map((er, i) => {
                  const active = i === activeEra;
                  return (
                    <TouchableOpacity key={er.label} onPress={() => handleEraPress(i)} activeOpacity={0.7}
                      style={[styles.durChip, active && { borderColor: accent, backgroundColor: accent + '18' }]}>
                      <Text style={[styles.durChipText, active && { color: accent }]}>{er.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </>
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
      ) : seriesList && !selectedSeries ? (
        <FlatList
          key={'series-' + COLS}
          data={seriesList}
          keyExtractor={(s) => s.key}
          numColumns={COLS}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 90 }]}
          columnWrapperStyle={COLS > 1 ? styles.gridRow : undefined}
          renderItem={({ item: s }) => (
            <MediaCard
              item={{ id: s.key, title: s.name, year: s.year, creator: `${s.episodes} EPISODES`, thumbnail: s.thumbnail }}
              onPress={() => handleSeriesPress(s)}
              width={CARD_W}
              style={{ marginRight: 0 }}
            />
          )}
          ListHeaderComponent={
            <Text style={styles.resultCount}>{seriesList.length} SHOWS IN THE LIBRARY</Text>
          }
        />
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
            <Text style={[styles.hintText, { color: accent + 'aa' }]}>↑ search from the bar above, try “{hint}”</Text>
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
  chipText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textSecondary, letterSpacing: 0.8 },
  durationRow: { marginTop: 4, marginBottom: 4, marginHorizontal: -spacing.screenPadding },
  durChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  durChipText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textSecondary, letterSpacing: 0.6 },
  lensBar: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4, flexWrap: 'wrap' },
  lensPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  lensPillText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textSecondary, letterSpacing: 1 },
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
