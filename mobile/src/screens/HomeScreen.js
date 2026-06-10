import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, Animated, TouchableOpacity, Pressable, Modal, Linking,
  ScrollView, StyleSheet, Dimensions, Platform, TextInput, useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from '../components/FastImage';
import CategoryRow from '../components/CategoryRow';
import SkeletonCard from '../components/SkeletonCard';
import { VoidLoader, TheArchivist } from '../components';
import AvatarPickerModal from '../components/AvatarPickerModal';
import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import { GENERATIONS } from '../data/generations';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, radius } from '../theme';

import { useSidebar, CONTENT_GAP } from '../context/SidebarContext';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 900;
const DONATE_URL = 'https://square.link/u/dJioBmlW';
const BRAND_BLUE = '#5cb8ff'; // vivid blue — donate icon + tagline

// YouTube-style filter chips — text-only genre aggregates, no thumbnails = fast
const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'horror', label: 'Horror' },
  { id: 'scifi', label: 'Sci-Fi' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'noir', label: 'Noir' },
  { id: 'cartoons', label: 'Cartoons' },
  { id: 'documentary', label: 'Docs' },
  { id: 'western', label: 'Westerns' },
  { id: 'anime', label: 'Anime' },
  { id: 'music_video', label: 'Music' },
  { id: 'educational_tv', label: 'Educational' },
  { id: 'newsreels', label: 'Newsreels' },
  { id: 'feature_length', label: 'Features' },
  { id: 'public_access', label: 'Public Access' },
  { id: 'prelinger', label: 'Prelinger' },
  { id: 'sports', label: 'Sports' },
  { id: 'romance', label: 'Romance' },
  { id: 'nature_wildlife', label: 'Nature' },
  { id: 'cringe', label: 'Cringe' },
  { id: 'tv_movies', label: 'TV' },
  { id: 'mature', label: '18+' },
];

// ── Chip sort order per generation — what each gen finds most interesting first ──
// "All" always stays first, 18+ always last. Middle chips reorder by preference.
const CHIP_ORDER = {
  boomer: [
    'noir', 'western', 'newsreels', 'documentary', 'feature_length', 'educational_tv',
    'cartoons', 'comedy', 'sports', 'nature_wildlife', 'prelinger', 'music_video',
    'public_access', 'scifi', 'horror', 'romance', 'tv_movies', 'anime', 'cringe',
  ],
  millennial: [
    'horror', 'scifi', 'noir', 'cartoons', 'comedy', 'anime', 'documentary',
    'music_video', 'cringe', 'prelinger', 'public_access', 'tv_movies', 'feature_length',
    'western', 'educational_tv', 'newsreels', 'sports', 'nature_wildlife', 'romance',
  ],
  genz: [
    'anime', 'cringe', 'horror', 'comedy', 'music_video', 'tv_movies', 'scifi',
    'cartoons', 'feature_length', 'public_access', 'documentary', 'nature_wildlife',
    'romance', 'sports', 'prelinger', 'noir', 'western', 'educational_tv', 'newsreels',
  ],
};

// ── Channel sort order per generation ──
const CHANNEL_ORDER = {
  boomer: ['NOIR', 'WESTERNS', 'DOCS', 'COMEDY', 'CARTOONS', 'PROJECTION ROOM', 'MUSIC', 'SCI-FI', 'NIGHTMARE FUEL', 'PUBLIC ACCESS', 'ANIME', 'THE WEIRD SHELF'],
  millennial: ['NIGHTMARE FUEL', 'SCI-FI', 'NOIR', 'CARTOONS', 'COMEDY', 'ANIME', 'DOCS', 'MUSIC', 'PROJECTION ROOM', 'THE WEIRD SHELF', 'PUBLIC ACCESS', 'WESTERNS'],
  genz: ['ANIME', 'NIGHTMARE FUEL', 'COMEDY', 'MUSIC', 'THE WEIRD SHELF', 'SCI-FI', 'CARTOONS', 'PUBLIC ACCESS', 'DOCS', 'NOIR', 'PROJECTION ROOM', 'WESTERNS'],
};

// Shorts card dimensions — tall portrait like YouTube Shorts
const SHORTS_CARD_W = IS_DESKTOP ? 180 : 150;
const SHORTS_CARD_H = Math.round(SHORTS_CARD_W * 1.7); // ~9:16 portrait
const SHORTS_GAP = IS_DESKTOP ? 14 : 10;

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Fisher–Yates shuffle (returns a new array)
function shuffled(arr) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Client-side variety: reshuffle category order + items within each category.
// Free, instant, and zero load on Archive.org — replaces the slow live "shuffle" fetch.
// EXCEPTION: recognizable rows are era-ordered by the backend generational lean ("starts older →
// works up" / "recent → back", with variety already woven in), so we must NOT shuffle their items —
// that would scramble the ordering. Only non-leaned rows get item-shuffled for per-visit variety.
function reshuffleCats(cats) {
  if (!Array.isArray(cats) || cats.length === 0) return cats;
  return shuffled(cats.map((c) => (
    c && c.recognizable ? { ...c } : { ...c, items: shuffled(c.items) }
  )));
}

// Guard: only swap in a fresh payload if it actually has substantial content.
// A throttled Archive.org response can return all 47 categories but with empty items;
// swapping that in would blank the page (and poison the cache). Require >=50% populated.
function hasRealContent(cats) {
  if (!Array.isArray(cats) || cats.length === 0) return false;
  const populated = cats.filter((c) => c && c.items && c.items.length > 0).length;
  return populated >= Math.ceil(cats.length * 0.5);
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const { sidebarWidth } = useSidebar();
  // Navigation marginLeft = sidebarWidth + CONTENT_GAP. Scene width = windowW - that.
  // Right padding = CONTENT_GAP for symmetry. Hero fills scene minus right pad.
  const sceneW = IS_DESKTOP ? windowW - sidebarWidth - CONTENT_GAP : windowW;
  const contentW = IS_DESKTOP ? sceneW - CONTENT_GAP : windowW;
  // Hero: smaller than Prime's (our archive thumbnails are low-res and shouldn't be blown
  // up huge). Capped on desktop so it doesn't dominate a wide screen; proportional on mobile.
  const heroH = IS_DESKTOP ? Math.min(Math.round(contentW * 0.30), 380) : Math.round(contentW * 0.52);
  const { gen, generationId, chooseGeneration } = useGeneration();
  const { user, isAuthenticated, updateProfile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [allCategories, setAllCategories] = useState([]);
  const allCategoriesRef = useRef([]); // mirrors allCategories for stable reads inside callbacks
  const [loading, setLoading] = useState(true);
  const [serverSleeping, setServerSleeping] = useState(false);
  const [waking, setWaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [heroItem, setHeroItem] = useState(null);
  const [topHearts, setTopHearts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [subFeed, setSubFeed] = useState([]);
  const [forYou, setForYou] = useState([]);
  const [shorts, setShorts] = useState([]);
  const [activeChip, setActiveChip] = useState('all');
  // Re-pick when generation changes so taglines/loading msgs match the active gen
  const tagline = useMemo(() => pickRandom(gen.taglines), [gen.id]);
  const loadingMsg = useMemo(() => pickRandom(gen.loadingMessages), [gen.id]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const accent = gen.accentColor;

  // Sort filter chips by generation preference — "All" first, 18+ last
  const sortedChips = useMemo(() => {
    const order = CHIP_ORDER[generationId] || CHIP_ORDER.millennial;
    const allChip = FILTER_CHIPS.find(c => c.id === 'all');
    const matureChip = FILTER_CHIPS.find(c => c.id === 'mature');
    const rest = FILTER_CHIPS.filter(c => c.id !== 'all' && c.id !== 'mature');
    const sorted = [...rest].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return [allChip, ...sorted, matureChip];
  }, [generationId]);

  // Chip bar horizontal scroll — arrow navigation on desktop
  const chipScrollRef = useRef(null);
  const chipXRef = useRef(0);
  const scrollChipBar = useCallback((dir) => {
    var step = 280;
    var newX = dir === 'left' ? Math.max(0, chipXRef.current - step) : chipXRef.current + step;
    chipScrollRef.current?.scrollTo?.({ x: newX, animated: true });
  }, []);

  // Sort by generation's categoryPriority — categories listed first appear at the top
  const typeCats = useMemo(() => {
    const raw = allCategories.filter((c) => !c.group || c.group === 'type');
    const priority = gen.categoryPriority || [];
    if (priority.length === 0) return raw;
    return [...raw].sort((a, b) => {
      const ai = priority.indexOf(a.id);
      const bi = priority.indexOf(b.id);
      // Items in priority list come first, in listed order; unlisted items keep original order at the end
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [allCategories, gen.categoryPriority]);
  // "The wall": "All" (the default — and mobile has no chips, so it stays on "All") renders EVERY
  // non-empty type category as a vertical scroll of horizontal rows — an overwhelming sea of
  // variety, on every platform. A desktop chip simply narrows the wall down to that one genre.
  const visibleTypeCats = useMemo(() => {
    if (activeChip === 'all') return typeCats.filter((c) => (c.items || []).length > 0);
    return allCategories.filter((c) => c.id === activeChip);
  }, [typeCats, allCategories, activeChip]);

  // Per-category pagination — tracks which page each category is on + loading state
  const [catPages, setCatPages] = useState({});       // { [catId]: pageNumber }
  const [catLoading, setCatLoading] = useState({});   // { [catId]: true/false }

  const handlePageChange = useCallback(async (categoryId, newPage) => {
    if (newPage < 1 || catLoading[categoryId]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCatLoading((prev) => ({ ...prev, [categoryId]: true }));
    try {
      const result = await api.getCategoryItems(categoryId, newPage, 20, generationId);
      const items = result?.items || [];
      if (items.length === 0 && newPage > 1) {
        // No more pages — stay on current page
        setCatLoading((prev) => ({ ...prev, [categoryId]: false }));
        return;
      }
      setCatPages((prev) => ({ ...prev, [categoryId]: newPage }));
      // Replace the items in allCategories for this category
      setAllCategories((prev) =>
        prev.map((cat) =>
          cat.id === categoryId ? { ...cat, items } : cat
        )
      );
    } catch (err) {
      console.warn('[pageChange]', categoryId, err?.message);
    } finally {
      setCatLoading((prev) => ({ ...prev, [categoryId]: false }));
    }
  }, [catLoading, generationId]);

  // Reset per-category pages when generation changes so user sees the new ordering
  useEffect(() => { setCatPages({}); }, [generationId]);

  // Retro CSS (font-smoothing, scrollbars, etc.) is now injected globally in App.js


  const headerAnim = scrollY.interpolate({
    inputRange: [0, 80], outputRange: [1, 0], extrapolate: 'clamp',
  });
  // Floating menu button — inverse of header: fades IN as you scroll down
  const fabAnim = scrollY.interpolate({
    inputRange: [60, 140], outputRange: [0, 1], extrapolate: 'clamp',
  });
  const scrollRef = useRef(null);

  const loadCategories = useCallback(async (mode = "open") => {
    // mode: "open" → show cache first (reshuffled for variety), refresh if stale
    //       "repopulate" → pull genuinely fresh content via the fast blended path
    // The active generation drives the backend era-lean; it's threaded into every fetch + the
    // client cache is scoped per-gen, so switching generation re-runs this with the right lean.
    const forceFresh = mode === "repopulate";
    const g = generationId;
    try {
      if (!forceFresh) {
        // Show cache instantly, reshuffled client-side for per-visit variety (zero Archive load)
        const cached = await store.getCachedCategories(g);
        if (cached) {
          const varied = reshuffleCats(cached);
          setAllCategories(varied);
          setLoading(false);
          pickHero(varied);
          // If cache is stale (>10 min), pull fresh content in the background — from the
          // FAST cached endpoint (the backend self-warms it). NOT refresh=true: that forces a
          // slow ~47-collection fetch that can exceed Cloudflare's 100s timeout → 524 → "CORS"
          // error. The cached endpoint is instant and always has CORS headers.
          const ts = await store.getCategoriesTimestamp?.(g) || 0;
          if (Date.now() - ts > 10 * 60 * 1000) {
            api.getCategories({ gen: g }).then((fresh) => {
              if (hasRealContent(fresh)) {
                const v = reshuffleCats(fresh);
                setAllCategories(v);
                store.setCachedCategories(fresh, g);
              }
            }).catch(() => {});
          }
          return;
        }

        // ── FIRST VISIT (no client cache) ──
        // CRITICAL: paint from the pre-warmed server cache (blended, ~instant). Do NOT block
        // on the live shuffle path — it fires ~47 uncached Archive.org requests (80–200s) and
        // returns empty when throttled. Variety comes from the client-side reshuffle instead.
        const fast = await api.getCategories({ shuffle: false, gen: g });
        const varied = reshuffleCats(fast);
        setAllCategories(varied);
        setServerSleeping(false);
        setLoading(false);
        store.setCachedCategories(fast, g);
        pickHero(varied);
        return;
      }
      // Repopulate — pull from the FAST cached endpoint (reliable, instant, has CORS).
      // Never refresh=true (slow, can 524/CORS-fail). Variety comes from the client reshuffle.
      const data = await api.getCategories({ gen: g });
      if (hasRealContent(data)) {
        const varied = reshuffleCats(data);
        setAllCategories(varied);
        setServerSleeping(false);
        store.setCachedCategories(data, g);
        pickHero(varied);
      } else if (allCategoriesRef.current.length) {
        // Throttled/empty — keep what we have, just reshuffle for a fresh feel
        const varied = reshuffleCats(allCategoriesRef.current);
        setAllCategories(varied);
        pickHero(varied);
      }
    } catch (err) {
      console.error('[HomeScreen]', err);
      if (err.message?.includes('timed out') || err.message?.includes('fetch')) {
        setServerSleeping(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [generationId]);

  // Keep the ref in sync so callbacks can read current categories without re-creating
  useEffect(() => { allCategoriesRef.current = allCategories; }, [allCategories]);

  const handleWakeUp = useCallback(async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setWaking(true);
    try {
      await api.wakeUp();
    } catch (err) {
      // Don't bail — server might still be partially awake
    }
    setServerSleeping(false);
    setWaking(false);
    setLoading(true);
    loadCategories();
  }, [loadCategories]);

  const handleRepopulate = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Instant feedback: reshuffle what's already loaded so the page visibly refreshes now
    if (allCategoriesRef.current.length) {
      const varied = reshuffleCats(allCategoriesRef.current);
      setAllCategories(varied);
      pickHero(varied);
    }
    setRefreshing(true);
    await loadCategories("repopulate"); // pulls genuinely fresh content via the fast path
  }, [loadCategories]);

  function pickHero(cats) {
    // Pick from a random non-empty category so the hero rotates each launch
    const eligible = cats.filter((c) => c.items?.length > 0);
    if (eligible.length === 0) return;
    const cat = eligible[Math.floor(Math.random() * eligible.length)];
    const item = cat.items[Math.floor(Math.random() * Math.min(cat.items.length, 6))];
    heroCategoryIdRef.current = cat.id;
    setHeroItem(item);
  }

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // ── PROGRESSIVE LOADING WATERFALL ──
  // Tier 1 (0s): Categories + hero (handled by loadCategories above)
  // Tier 2 (1.5s): Community hearts + trending (first visible rows)
  // Tier 3 (3.5s): Shorts, For You, Sub Feed (below fold)
  const tier2Loaded = useRef(false);
  const tier3Loaded = useRef(false);

  useEffect(() => {
    if (refreshing) { tier2Loaded.current = false; tier3Loaded.current = false; }
  }, [refreshing]);

  // Tier 2 — fires after hero + categories are loaded (or 1.5s, whichever is first)
  useEffect(() => {
    if (loading && !refreshing) return; // wait for tier 1
    if (tier2Loaded.current && !refreshing) return;
    const t = setTimeout(() => {
      tier2Loaded.current = true;
      api.getTopHearts(20).then(setTopHearts).catch(() => setTopHearts([]));
      api.getTrending(15)
        .then((data) => setTrending(Array.isArray(data) ? data : data?.items || []))
        .catch(() => setTrending([]));
    }, refreshing ? 0 : 1500);
    return () => clearTimeout(t);
  }, [loading, refreshing]);

  // Tier 3 — fires 3.5s after page load (below fold content)
  useEffect(() => {
    if (loading && !refreshing) return;
    if (tier3Loaded.current && !refreshing) return;
    const t = setTimeout(() => {
      tier3Loaded.current = true;
      api.getShorts(50) // big pool — the wall drops a Void Snacks row every 3 rows, rotated for variety
        .then((data) => setShorts(Array.isArray(data) ? data : data?.items || []))
        .catch(() => setShorts([]));
      if (isAuthenticated) {
        api.getSubscriptionFeed(1, 15)
          .then((data) => setSubFeed(data?.items || []))
          .catch(() => setSubFeed([]));
        api.getRecommendations(15)
          .then((data) => setForYou(data?.items || []))
          .catch(() => setForYou([]));
      }
    }, refreshing ? 0 : 3500);
    return () => clearTimeout(t);
  }, [loading, refreshing, isAuthenticated]);

  const handleItemPress = useCallback((item, categoryId) => {
    navigation.navigate('Player', { item, id: item.id, categoryId });
  }, [navigation]);

  // See More — navigate to search filtered by this category
  const handleSeeMore = useCallback((category) => {
    navigation.navigate('Search', { categoryId: category.id, categoryName: category.name, _ts: Date.now() });
  }, [navigation]);

  // Subscribe / unsubscribe to a category
  const [subscribedIds, setSubscribedIds] = useState(new Set());
  useEffect(() => {
    // Only fetch subscriptions if signed in — avoids a 401 for anonymous users
    if (!isAuthenticated) return;
    api.getSubscriptions()
      .then((subs) => {
        if (Array.isArray(subs)) {
          setSubscribedIds(new Set(subs.map((s) => s.category_id)));
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const handleSubscribe = useCallback(async (categoryId, shouldSubscribe) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (shouldSubscribe) {
        await api.subscribe(categoryId);
        setSubscribedIds((prev) => new Set([...prev, categoryId]));
      } else {
        await api.unsubscribe(categoryId);
        setSubscribedIds((prev) => {
          const next = new Set(prev);
          next.delete(categoryId);
          return next;
        });
      }
    } catch (err) {
      console.warn('[subscribe]', err.message);
    }
  }, []);

  // ── Deep channel queue with infinite pagination ──
  // Load a small first batch (25 items) for instant playback, then Player
  // pre-fetches the next page in the background — doom-scroll for video.
  const [loadingChannel, setLoadingChannel] = useState(null); // label of channel being loaded
  const handleChannelPress = useCallback(async (cat, label, catIds) => {
    if (!catIds?.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingChannel(label);
    try {
      // Fetch first page — just 25 items for fast start
      const result = await api.getChannelQueue(catIds, 25, 1);
      const deepItems = result?.items || [];
      // Fall back to shallow pre-cached items if deep fetch fails
      const queue = deepItems.length > 0 ? deepItems : (cat?.items || []);
      if (queue.length === 0) { setLoadingChannel(null); return; }
      navigation.navigate('Player', {
        item: queue[0],
        id: queue[0].id,
        queue: queue,
        queueIndex: 0,
        categoryId: catIds[0],
        channelLabel: label,
        channelCatIds: catIds,   // Player uses this to fetch more pages
        channelPage: 1,          // current page — Player increments as it fetches
      });
    } catch (err) {
      console.warn('[channel queue]', err.message);
      // Fallback: use shallow pre-cached items
      if (cat?.items?.length) {
        navigation.navigate('Player', {
          item: cat.items[0],
          id: cat.items[0].id,
          queue: cat.items,
          queueIndex: 0,
          categoryId: cat.id,
          channelLabel: label,
          channelCatIds: catIds,
          channelPage: 0,
        });
      }
    } finally {
      setLoadingChannel(null);
    }
  }, [navigation]);

  // Track which category the hero came from so streak works for hero taps too
  const heroCategoryIdRef = useRef(null);
  const handleHeroPress = useCallback(() => {
    if (!heroItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Player', { item: heroItem, id: heroItem?.id, categoryId: heroCategoryIdRef.current });
  }, [heroItem, navigation]);

  const handleRandom = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { const ri = await api.getRandomItem(); navigation.navigate('Player', { item: ri, id: ri.id }); } catch {}
  }, [navigation]);

  // On desktop the fixed-position sidebar sits on top of content;
  // each screen must push its own content right to avoid overlapping.
  const desktopMargin = IS_DESKTOP ? sidebarWidth + CONTENT_GAP : 0;

  return (
    <View style={[styles.container, { marginLeft: desktopMargin }]}>
      {/* Sticky header — always visible, solid background */}
      <View
        style={[styles.stickyHeader, { paddingTop: insets.top + 4 }]}
      >
        <View style={styles.headerTop}>
          <View style={IS_DESKTOP ? styles.headerCol : styles.headerLeft}>
            {!IS_DESKTOP && (
              <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.hamburger} hitSlop={8}>
                <Ionicons name="menu" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
            {!IS_DESKTOP && (
              <TouchableOpacity onPress={() => navigation.navigate('Browse')} activeOpacity={0.7}>
                <View style={styles.logoWrap}>
                  <Text style={[styles.logoVoid, { color: accent }]}>VOID</Text>
                  <Text style={styles.logoTv}>tv</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          {/* ── Desktop: logo + centered search bar ── */}
          {IS_DESKTOP && (
            <TouchableOpacity onPress={() => navigation.navigate('Browse')} activeOpacity={0.7} style={{ marginRight: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ fontFamily: fonts.monoBold, fontSize: 16, letterSpacing: 2.5, color: accent }}>VOID</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5 }}>tv</Text>
              </View>
            </TouchableOpacity>
          )}
          {IS_DESKTOP && (
            <Pressable
              onPress={() => navigation.navigate('Search')}
              style={styles.desktopSearchBar}
            >
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <Text style={styles.desktopSearchPlaceholder}>Search VOIDtv</Text>
            </Pressable>
          )}
          <View style={IS_DESKTOP ? [styles.headerRight, styles.headerCol, { justifyContent: 'flex-end' }] : styles.headerRight}>
            {/* User avatar + name when logged in */}
            {isAuthenticated && user ? (
              <TouchableOpacity
                onPress={() => setAvatarPickerOpen(true)}
                style={styles.userChip}
                activeOpacity={0.7}
              >
                {user.avatar_url ? (
                  <FastImage uri={user.avatar_url} itemId={`av_${user.id}`} style={styles.userAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.userAvatarGlyph, { backgroundColor: accent + '30' }]}>
                    <Text style={[styles.userAvatarGlyphText, { color: accent }]}>
                      {(user.username || user.display_name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.userChipName} numberOfLines={1}>
                  {user.username || user.display_name || 'void dweller'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => navigation.navigate('Auth')}
                style={styles.signInChip}
                activeOpacity={0.7}
                hitSlop={6}
              >
                <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                <Text style={styles.signInChipText}>SIGN IN</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleRandom} style={[styles.randomBtn, { backgroundColor: accent }]} hitSlop={8}>
              <Ionicons name="shuffle" size={12} color={gen.accentOnDark} style={{ marginRight: 4 }} />
              <Text style={[styles.randomText, { color: gen.accentOnDark }]}>SURPRISE ME</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Tagline removed — vertical space reclaimed for content like YouTube */}
      </View>

      {/* Avatar picker modal */}
      <AvatarPickerModal
        visible={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        accent={accent}
        currentAvatar={user?.avatar_url}
        onSelect={async (avatar) => {
          const url = avatar.url || `glyph:${avatar.glyph}`;
          await updateProfile({ avatar_url: url });
        }}
      />

      {/* ── Hamburger drawer ── */}
      <DrawerMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        accent={accent}
        gen={gen}
        generationId={generationId}
        chooseGeneration={chooseGeneration}
        navigation={navigation}
        onRandom={() => { setMenuOpen(false); handleRandom(); }}
        user={user}
        isAuthenticated={isAuthenticated}
        onAvatarPress={() => setAvatarPickerOpen(true)}
        onSignOut={signOut}
      />

      {/* ── Filter chip bar — DESKTOP only. Mobile is the full category wall (no chips). ── */}
      {IS_DESKTOP && (
      <View style={[styles.chipBarWrap, styles.chipBarRow]}>
        {IS_DESKTOP && (
          <TouchableOpacity onPress={() => scrollChipBar('left')} style={styles.chipArrow} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <ScrollView
          ref={chipScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBar}
          style={{ flex: 1 }}
          onScroll={(e) => { chipXRef.current = e.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={32}
        >
          {sortedChips.map((chip) => {
            const isActive = activeChip === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                onPress={() => { setActiveChip(chip.id); try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }}
                style={[
                  styles.chip,
                  isActive && { backgroundColor: colors.textPrimary },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.chipText,
                  isActive && { color: colors.bg },
                ]}>{chip.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {IS_DESKTOP && (
          <TouchableOpacity onPress={() => scrollChipBar('right')} style={styles.chipArrow} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      )}

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={IS_DESKTOP ? { paddingRight: CONTENT_GAP } : undefined}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: Platform.OS !== 'web' })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <HeroCard
          item={heroItem}
          loading={loading}
          insetTop={insets.top}
          loadingMsg={loadingMsg}
          tagline={tagline}
          gen={gen}
          accent={accent}
          onPress={handleHeroPress}
          onRandom={handleRandom}
          contentW={contentW}
          heroH={heroH}
        />

        {/* Wake Up Server */}
        {serverSleeping && (
          <View style={styles.wakeBlock}>
            <Text style={styles.wakeEmoji}>📡</Text>
            <Text style={styles.wakeTitle}>SERVER IS SLEEPING</Text>
            <Text style={styles.wakeSub}>
              Backend may need a moment to warm up after downtime.{'\n'}
              One tap wakes it up — usually takes a few seconds.
            </Text>
            <TouchableOpacity
              onPress={handleWakeUp}
              style={[styles.wakeBtn, { borderColor: accent, backgroundColor: waking ? accent + '20' : 'transparent' }]}
              activeOpacity={0.75}
              disabled={waking}
            >
              <Ionicons name={waking ? "pulse" : "power"} size={16} color={accent} style={{ marginRight: 8 }} />
              <Text style={[styles.wakeBtnText, { color: accent }]}>
                {waking ? "WAKING UP..." : "WAKE UP SERVER"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Community Hearts — items the most users have loved */}
        {topHearts.length > 0 && (
          <CategoryRow
            category={{
              id: "community_hearts",
              name: "♥ Community Loves",
              subtitle: `What other users are hearting — ${topHearts.length} items`,
              items: topHearts,
            }}
            onItemPress={handleItemPress}
          />
        )}

        {/* Trending — most-watched in the last 48h */}
        {trending.length > 0 && (
          <CategoryRow
            category={{
              id: "trending",
              name: "Trending Now",
              subtitle: "Most-watched on VOIDtv right now",
              items: trending,
            }}
            onItemPress={handleItemPress}
          />
        )}

        {/* For You — personalized recommendations (authed users only) */}
        {forYou.length > 0 && (
          <CategoryRow
            category={{
              id: "for_you",
              name: "For You",
              subtitle: "Based on what you've been watching",
              items: forYou,
            }}
            onItemPress={handleItemPress}
          />
        )}

        {/* Void Snacks — short-form content under 2 min */}
        {shorts.length > 0 && (
          <ShortsRow
            items={shorts}
            accent={accent}
            onItemPress={handleItemPress}
          />
        )}

        {/* Subscription Feed — items from followed categories */}
        {subFeed.length > 0 && (
          <CategoryRow
            category={{
              id: "sub_feed",
              name: "From Your Subscriptions",
              subtitle: "New from categories you follow",
              items: subFeed,
            }}
            onItemPress={handleItemPress}
          />
        )}

        {/* TV Static loading strip — fills space while categories load */}
        {loading && Platform.OS === 'web' && (
          <View style={{ marginTop: 16, marginBottom: 8, paddingHorizontal: spacing.screenPadding, gap: 12 }}>
            {[0, 1, 2].map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                <VoidLoader mode="static" size="channel" label={r === 0 ? 'tuning in...' : undefined} style={{ flex: 1, height: 100, borderRadius: 8 }} />
                <VoidLoader mode="static" size="channel" style={{ flex: 1, height: 100, borderRadius: 8 }} />
                {IS_DESKTOP && <VoidLoader mode="static" size="channel" style={{ flex: 1, height: 100, borderRadius: 8 }} />}
              </View>
            ))}
          </View>
        )}

        {/* Channels row removed — it duplicated the genre content below and the "LIVE"
            badge was misleading (it's auto-advancing archive video, not a live stream). */}

        {/* ── Spotlight: TV & Features — big visual cards, always visible ── */}
        {!loading && allCategories.length > 0 && (
          <SpotlightRow
            categories={allCategories}
            accent={accent}
            onItemPress={handleItemPress}
            onSeeMore={handleSeeMore}
            contentW={contentW}
          />
        )}

        {/* The wall — every category as a side-scrolling row, with void-stream TVs scattered
            through it (each channel-surfed to a different scene): the "wall of screens" you surf
            past on the way down. Web only (static-video mode); ~1-in-6 rows, hash-scattered. */}
        {visibleTypeCats.map((cat, idx) => (
          <React.Fragment key={cat.id}>
            <CategoryRow
              category={cat}
              onItemPress={handleItemPress}
              page={catPages[cat.id] || 1}
              loadingMore={!!catLoading[cat.id]}
              onPageChange={handlePageChange}
              subscribed={subscribedIds.has(cat.id)}
              onSubscribe={handleSubscribe}
              onSeeMore={handleSeeMore}
            />
            {/* Void Snacks every 3 rows — one horizontal row of diverse short clips; scroll
                sideways for variety. Each insertion is rotated to a different slice of the pool. */}
            {shorts.length > 0 && ((idx + 1) % 3 === 0) && idx < visibleTypeCats.length - 1 && (
              <ShortsRow
                items={rotateArray(shorts, Math.floor((idx + 1) / 3) * 11)}
                accent={accent}
                onItemPress={handleItemPress}
              />
            )}
            {Platform.OS === 'web' && idx < visibleTypeCats.length - 1
              && ((((idx + 1) * 2654435761) >>> 0) % 6 === 0) && (
              <View style={{ marginHorizontal: spacing.screenPadding, marginBottom: 16 }}>
                <VoidLoader mode="static" size="row" style={{ width: '100%', height: 150, borderRadius: 8 }} />
              </View>
            )}
          </React.Fragment>
        ))}

        {/* Donate CTA — visible between content and footer */}
        <TouchableOpacity
          onPress={() => Linking.openURL(DONATE_URL)}
          style={styles.donateCta}
          activeOpacity={0.8}
        >
          <Ionicons name="gift" size={20} color={BRAND_BLUE} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.donateCtaTitle}>KEEP THIS WEIRDNESS RUNNING</Text>
            <Text style={styles.donateCtaSub}>a project of the Church of American Strength & Hope</Text>
            <Text style={styles.donateCtaSub}>501(c)(3) non-profit · CASHvalues.org</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={BRAND_BLUE + '80'} />
        </TouchableOpacity>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 90 }]}>
          <Text style={[styles.footerLine, { fontStyle: 'italic' }]}>when you stare into the void, humanity stares back</Text>
          <View style={{ marginTop: 10, gap: 2 }}>
            <Text style={[styles.footerLine, { color: BRAND_BLUE, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 }]}>A PROJECT OF</Text>
            <Text style={[styles.footerLine, { color: '#f5a623', fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1 }]}>CHURCH OF AMERICAN STRENGTH & HOPE</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://cashvalues.org')} activeOpacity={0.7}>
              <Text style={[styles.footerLine, { color: BRAND_BLUE, textDecorationLine: 'underline', fontSize: 10 }]}>CASHvalues.org</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.footerLine, { marginTop: 8, fontSize: 9, letterSpacing: 1 }]}>SOURCE: ARCHIVE.ORG — PUBLIC DOMAIN & CC</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(DONATE_URL)}
            style={styles.footerDonate}
            activeOpacity={0.7}
          >
            <Ionicons name="gift" size={16} color={BRAND_BLUE} />
            <Text style={styles.footerLine}>
              <Text style={{ color: '#f5a623' }}>SUPPORT HUMAN CREATIONS</Text>
              <Text style={{ color: '#39ff14' }}> — FIGHT THE AI SLOP</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>

      {/* ── Floating menu FAB — appears when header scrolls out of view (mobile only) ── */}
      {!IS_DESKTOP && <Animated.View
        style={[styles.fab, { bottom: insets.bottom + 74, opacity: fabAnim, pointerEvents: 'auto' }]}
      >
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={[styles.fabBtn, { backgroundColor: colors.surface, borderColor: accent + '40' }]}
          activeOpacity={0.8}
          hitSlop={6}
        >
          <Ionicons name="menu" size={20} color={accent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            scrollRef.current?.scrollTo?.({ y: 0, animated: true });
            // Animated.ScrollView wraps getNode in some versions
            scrollRef.current?.getNode?.()?.scrollTo?.({ y: 0, animated: true });
          }}
          style={[styles.fabBtn, styles.fabBtnSmall, { backgroundColor: colors.surface, borderColor: accent + '25' }]}
          activeOpacity={0.8}
          hitSlop={6}
        >
          <Ionicons name="chevron-up" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>}

      {/* The Archivist — AI rabbit-hole guide (floating console) */}
      <TheArchivist navigation={navigation} accent={accent} />
    </View>
  );
}

function HeroCard({ item, loading, insetTop, loadingMsg, tagline, gen, accent, onPress, onRandom, contentW, heroH }) {
  const totalH = heroH + 20; // header is now outside scroll, no inset padding needed

  if (loading && !item) {
    return (
      <View style={{ height: totalH, backgroundColor: colors.card, overflow: 'hidden' }}>
        {/* TV static video behind loading text — creates energy while we fetch */}
        {Platform.OS === 'web' && (
          <View style={[StyleSheet.absoluteFill, { opacity: 0.5 }]}>
            <VoidLoader mode="static" size="hero" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
          </View>
        )}
        <View style={[styles.heroLoadingBlock, { paddingTop: 20, zIndex: 2 }]}>
          <Text style={[styles.heroLoadingMsg, { color: accent }]}>{loadingMsg}</Text>
          <Text style={styles.heroLoadingTagline}>{tagline}</Text>
        </View>
        <LinearGradient colors={['transparent', colors.bg]} locations={[0.7, 1]} style={[StyleSheet.absoluteFill, { pointerEvents: 'none', zIndex: 1 }]} />
      </View>
    );
  }
  if (!item) return null;

  const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;

  return (
    <Pressable onPress={onPress} style={{ height: totalH, width: contentW }}>
      <FastImage
        uri={item.thumbnail}
        itemId={item.id}
        style={{ width: contentW, height: totalH }}
        contentFit="cover"
        priority="high"
      />
      <ScanlineOverlay height={totalH} />
      <LinearGradient
        colors={['rgba(12,12,15,0.2)', 'transparent', 'rgba(12,12,15,0.55)', 'rgba(12,12,15,0.97)', colors.bg]}
        locations={[0, 0.25, 0.55, 0.85, 1]}
        style={[StyleSheet.absoluteFill, { height: totalH, pointerEvents: 'none' }]}
      />
      <View style={[styles.heroContent, { paddingTop: 20 }]}>
        {/* Spacer — floating header sits above this */}
        <View style={{ flex: 1 }} />

        {/* Item info */}
        <View>
          <Text style={[styles.heroEyebrow, { color: accent }]}>{gen.heroEyebrow}</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
          {creator ? <Text style={styles.heroCreator}>{creator}</Text> : null}
          {item.year ? <Text style={[styles.heroYear, { color: accent }]}>{item.year}</Text> : null}
          <Text style={styles.heroTagline}>{tagline}</Text>
          <TouchableOpacity onPress={onPress} style={[styles.watchBtn, { backgroundColor: accent }]} activeOpacity={0.8}>
            <Ionicons name="play" size={14} color={gen.accentOnDark} style={{ marginRight: 6 }} />
            <Text style={[styles.watchBtnText, { color: gen.accentOnDark }]}>{gen.watchBtnText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Pressable>
  );
}

// Interleave items from multiple categories, deduped by id
function mixCategoryItems(categories, catIds, maxItems = 100) {
  const cats = catIds.map((id) => categories.find((c) => c.id === id)).filter(Boolean);
  if (cats.length === 0) return [];
  const seen = new Set();
  const mixed = [];
  const maxRounds = 50;
  for (let round = 0; round < maxRounds && mixed.length < maxItems; round++) {
    for (const cat of cats) {
      const item = cat.items?.[round];
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        mixed.push(item);
        if (mixed.length >= maxItems) break;
      }
    }
  }
  return mixed;
}

// Void Snacks row — tall portrait cards, quick bites under 2 min
// Rotate an array by n so each interleaved Void Snacks row leads with different clips.
function rotateArray(arr, n) {
  if (!arr || arr.length < 2) return arr || [];
  var k = ((n % arr.length) + arr.length) % arr.length;
  return arr.slice(k).concat(arr.slice(0, k));
}

function ShortsRow({ items, accent, onItemPress }) {
  // Horizontal scroll refs/state — mirror CategoryRow so Void Snacks gets the SAME left/right
  // overlay arrows as the genre rows it's interleaved with (desktop). Mobile keeps swipe-only.
  // Hooks must run before the empty-items early return below (rules of hooks).
  var scrollRef = useRef(null);
  var offsetRef = useRef(0);
  var contentWRef = useRef(0);
  var containerWRef = useRef(SCREEN_W);
  var [canLeft, setCanLeft] = useState(false);
  var [canRight, setCanRight] = useState(false);
  var [hovered, setHovered] = useState(false);

  var onScroll = useCallback(function (e) {
    var ox = e.nativeEvent.contentOffset.x;
    var cw = e.nativeEvent.contentSize.width;
    var vw = e.nativeEvent.layoutMeasurement.width;
    offsetRef.current = ox; contentWRef.current = cw; containerWRef.current = vw;
    var nl = ox > 10, nr = cw > vw + ox + 10;
    setCanLeft(function (p) { return p !== nl ? nl : p; });
    setCanRight(function (p) { return p !== nr ? nr : p; });
  }, []);
  var onContentSize = useCallback(function (w) {
    contentWRef.current = w;
    if (containerWRef.current > 0) setCanRight(w > containerWRef.current + 10);
  }, []);
  var onRowLayout = useCallback(function (e) {
    var vw = e.nativeEvent.layout.width; containerWRef.current = vw;
    if (contentWRef.current > 0) setCanRight(contentWRef.current > vw + 10);
  }, []);
  var scrollBy = useCallback(function (dir) {
    var step = SHORTS_CARD_W * 2 + SHORTS_GAP * 2; // ~2 cards, like CategoryRow
    var next = dir === 'left' ? Math.max(0, offsetRef.current - step) : offsetRef.current + step;
    scrollRef.current && scrollRef.current.scrollTo && scrollRef.current.scrollTo({ x: next, animated: true });
  }, []);

  if (!items || items.length === 0) return null;

  var arrowStyle = { opacity: hovered ? 1 : 0.7, ...(Platform.OS === 'web' ? { transition: 'opacity 0.2s ease' } : {}) };

  var scroller = (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.shortsRow}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onContentSizeChange={onContentSize}
      onLayout={onRowLayout}
    >
      {items.slice(0, IS_DESKTOP ? 20 : 16).map(function (item) {
        var creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;
        var dl = item.downloads ? (item.downloads >= 1000 ? Math.round(item.downloads / 1000) + 'K' : item.downloads) : '';
        return (
          <TouchableOpacity
            key={item.id}
            onPress={function () { onItemPress(item, null); }}
            style={styles.shortsCard}
            activeOpacity={0.8}
          >
            <FastImage
              uri={item.thumbnail}
              itemId={item.id}
              style={styles.shortsThumb}
              contentFit="cover"
            />
            {/* Bottom gradient */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.92)']}
              locations={[0.4, 0.75, 1]}
              style={[StyleSheet.absoluteFill, { borderRadius: 12, pointerEvents: 'none' }]}
            />
            <View style={styles.shortsCardContent}>
              <Text style={styles.shortsCardTitle} numberOfLines={2}>{item.title || 'Untitled'}</Text>
              {dl ? <Text style={styles.shortsCardMeta}>{dl} views</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.shortsBlock}>
      <View style={styles.shortsHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.shortsBadge, { backgroundColor: accent }]}>
            <Ionicons name="flash" size={12} color={colors.bg} />
          </View>
          <Text style={[styles.shortsTitle, { color: accent }]}>Void Snacks</Text>
        </View>
        <Text style={styles.shortsSubtitle}>quick bites under 2 minutes</Text>
      </View>
      {IS_DESKTOP ? (
        <Pressable
          onHoverIn={function () { setHovered(true); }}
          onHoverOut={function () { setHovered(false); }}
          style={styles.shortsRowWrap}
        >
          {/* Left arrow — same look as the genre rows; dims at the scroll start */}
          <View style={[styles.shortsArrowOverlay, styles.shortsArrowLeft, arrowStyle, !canLeft && { opacity: 0.25, pointerEvents: 'none' }]}>
            <TouchableOpacity onPress={function () { scrollBy('left'); }} style={styles.shortsArrowBtn} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          {scroller}
          {/* Right arrow — dims at the scroll end */}
          <View style={[styles.shortsArrowOverlay, styles.shortsArrowRight, arrowStyle, !canRight && { opacity: 0.25, pointerEvents: 'none' }]}>
            <TouchableOpacity onPress={function () { scrollBy('right'); }} style={styles.shortsArrowBtn} activeOpacity={0.8}>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </Pressable>
      ) : scroller}
    </View>
  );
}

// Channels row — TV channel tiles with multi-source mixing, sorted by generation
// Channels now fetch deep queues (200+ items) from Archive.org on tap,
// not just the shallow 15-per-category home cache.
function ChannelsRow({ categories, accent, onChannelPress, generationId, loadingChannel }) {
  var channelScrollRef = useRef(null);
  var channelXRef = useRef(0);
  var scrollChannels = useCallback(function (dir) {
    var step = 320;
    var newX = dir === 'left' ? Math.max(0, channelXRef.current - step) : channelXRef.current + step;
    channelScrollRef.current?.scrollTo?.({ x: newX, animated: true });
  }, []);

  // Each channel mixes items from multiple related categories
  const channelDefs = [
    { label: "CARTOONS", icon: "★", catIds: ["cartoons", "show_betty_boop", "show_popeye", "show_looney", "show_woody", "show_mickey", "show_felix", "saturday_morning"] },
    { label: "SCI-FI", icon: "◈", catIds: ["scifi", "deep_space", "deep_atomic"] },
    { label: "NIGHTMARE FUEL", icon: "☠", catIds: ["horror", "deep_creature", "deep_vampire", "deep_camp"] },
    { label: "NOIR", icon: "◆", catIds: ["noir", "deep_mental_hygiene"] },
    { label: "COMEDY", icon: "★", catIds: ["comedy", "show_threestooges", "oddities"] },
    { label: "DOCS", icon: "▣", catIds: ["documentary", "newsreels", "nature_wildlife"] },
    { label: "WESTERNS", icon: "◆", catIds: ["western", "war_footage"] },
    { label: "ANIME", icon: "◈", catIds: ["anime", "foreign"] },
    { label: "PROJECTION ROOM", icon: "▶", catIds: ["prelinger", "psa", "deep_driver_ed", "deep_propaganda"] },
    { label: "MUSIC", icon: "♫", catIds: ["music_video", "commercials"] },
    { label: "PUBLIC ACCESS", icon: "▶", catIds: ["public_access", "shopping", "game_shows"] },
    { label: "THE WEIRD SHELF", icon: "✦", catIds: ["oddities", "abstract", "conspiracy", "amateur"] },
  ];

  // Still compute shallow mix for filtering (only show channels that have SOME content loaded)
  const channels = channelDefs
    .map((def) => {
      const mixed = mixCategoryItems(categories, def.catIds);
      const primaryCat = def.catIds.map((id) => categories.find((c) => c.id === id)).find((c) => c?.items?.length > 0);
      return { ...def, category: primaryCat ? { ...primaryCat, id: def.catIds[0], items: mixed } : null };
    })
    .filter((ch) => ch.category?.items?.length > 2);

  // Sort channels by generation preference
  const order = CHANNEL_ORDER[generationId] || CHANNEL_ORDER.millennial;
  channels.sort((a, b) => {
    const ai = order.indexOf(a.label);
    const bi = order.indexOf(b.label);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  if (channels.length === 0) return null;

  return (
    <View style={styles.channelsBlock}>
      <View style={styles.channelsHeader}>
        <Text style={[styles.channelsTitle, { color: accent }]}>◉ CHANNELS</Text>
        <Text style={styles.channelsSubtitle}>tap to tune in — deep queue from the archive</Text>
      </View>
      <View style={IS_DESKTOP ? styles.scrollArrowRow : undefined}>
        {IS_DESKTOP && (
          <TouchableOpacity onPress={() => scrollChannels('left')} style={styles.chipArrow} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <ScrollView
          ref={channelScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.channelsRow}
          style={IS_DESKTOP ? { flex: 1 } : undefined}
          onScroll={(e) => { channelXRef.current = e.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={32}
        >
          {channels.map((ch) => {
            var isLoading = loadingChannel === ch.label;
            return (
              <Pressable
                key={ch.label}
                onPress={() => !isLoading && onChannelPress(ch.category, ch.label, ch.catIds)}
                style={[styles.channelTile, { borderColor: isLoading ? accent + '60' : accent + '30' }]}
              >
                {isLoading ? (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: 8 }}>
                    <VoidLoader mode="static" size="channel" style={{ width: '100%', height: '100%', borderRadius: 8, position: 'absolute', opacity: 0.4 }} />
                  </View>
                ) : null}
                {isLoading ? (
                  <ActivityIndicator size="small" color={accent} style={{ marginBottom: 4 }} />
                ) : (
                  <View style={[styles.liveBadge, { backgroundColor: accent }]}>
                    <View style={styles.liveBadgeDot} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                )}
                <Text style={[styles.channelTileLabel, { color: '#fff' }]} numberOfLines={1}>{ch.label}</Text>
                <Text style={styles.channelTileSub}>
                  {isLoading ? 'tuning in...' : `${ch.catIds.length} sources · auto-advance`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {IS_DESKTOP && (
          <TouchableOpacity onPress={() => scrollChannels('right')} style={styles.chipArrow} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Spotlight Row: TV & Features — big visual entry points, always visible ──
// Two hero-sized cards with rotating thumbnails. These are the "I want to watch
// something real" entry points — the most popular categories on the whole site.
function SpotlightRow({ categories, accent, onItemPress, onSeeMore, contentW }) {
  var tvCat = categories.find(function (c) { return c.id === 'tv_movies'; });
  var featuresCat = categories.find(function (c) { return c.id === 'feature_length'; });
  if (!tvCat && !featuresCat) return null;

  var spots = [
    { cat: tvCat, icon: 'tv-outline', title: 'TELEVISION', sub: 'Classic shows, serials & broadcasts' },
    { cat: featuresCat, icon: 'film-outline', title: 'FULL LENGTH FILMS', sub: 'Feature-length movies you can watch right now' },
  ].filter(function (s) { return s.cat && s.cat.items && s.cat.items.length > 0; });

  if (spots.length === 0) return null;

  // Desktop: side by side. Mobile: stacked.
  var cardW = IS_DESKTOP ? Math.floor((contentW - spacing.screenPadding * 2 - 12) / 2) : contentW - spacing.screenPadding * 2;
  var cardH = IS_DESKTOP ? 220 : 170;

  return (
    <View style={spotStyles.block}>
      <View style={spotStyles.headerRow}>
        <Text style={[spotStyles.sectionTitle, { color: accent }]}>NOW PLAYING</Text>
      </View>
      <View style={[spotStyles.row, IS_DESKTOP && spotStyles.rowDesktop]}>
        {spots.map(function (spot) {
          // Pick 4 random thumbnails from the category for a mini preview strip
          var shuffled = (spot.cat.items || []).slice().sort(function () { return Math.random() - 0.5; });
          var hero = shuffled[0];
          var previews = shuffled.slice(1, 5);

          return (
            <Pressable
              key={spot.cat.id}
              onPress={function () { onSeeMore(spot.cat); }}
              style={[spotStyles.card, { width: cardW, height: cardH }]}
            >
              {/* Background thumbnail */}
              <FastImage
                uri={hero ? hero.thumbnail : ''}
                itemId={hero ? hero.id : spot.cat.id}
                style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
                contentFit="cover"
              />
              {/* Dark gradient overlay */}
              <LinearGradient
                colors={['rgba(12,12,15,0.15)', 'rgba(12,12,15,0.5)', 'rgba(12,12,15,0.92)']}
                locations={[0, 0.45, 1]}
                style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
              />
              {/* Content overlay */}
              <View style={spotStyles.cardContent}>
                <View style={spotStyles.cardTop}>
                  <View style={[spotStyles.iconBadge, { backgroundColor: accent }]}>
                    <Ionicons name={spot.icon} size={14} color={colors.bg} />
                  </View>
                </View>
                <View style={spotStyles.cardBottom}>
                  <Text style={spotStyles.cardTitle}>{spot.title}</Text>
                  <Text style={spotStyles.cardSub}>{spot.sub}</Text>
                  {/* Mini preview strip — 4 tiny thumbnails */}
                  {previews.length > 0 && (
                    <View style={spotStyles.previewStrip}>
                      {previews.map(function (p) {
                        return (
                          <TouchableOpacity
                            key={p.id}
                            onPress={function () { onItemPress(p, spot.cat.id); }}
                            activeOpacity={0.8}
                            style={spotStyles.previewThumb}
                          >
                            <FastImage
                              uri={p.thumbnail}
                              itemId={p.id}
                              style={spotStyles.previewImg}
                              contentFit="cover"
                            />
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={function () { onSeeMore(spot.cat); }}
                        style={spotStyles.previewMore}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="arrow-forward" size={12} color={accent} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

var spotStyles = StyleSheet.create({
  block: { marginTop: 12, marginBottom: 8 },
  headerRow: { paddingHorizontal: spacing.screenPadding, marginBottom: 10 },
  sectionTitle: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 2 },
  row: { paddingHorizontal: spacing.screenPadding, gap: 12 },
  rowDesktop: { flexDirection: 'row' },
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
    marginBottom: IS_DESKTOP ? 0 : 12,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 14,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'flex-start' },
  iconBadge: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  cardBottom: {},
  cardTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: '#fff',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardSub: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  previewStrip: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
    alignItems: 'center',
  },
  previewThumb: {
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  previewImg: {
    width: IS_DESKTOP ? 64 : 52,
    height: IS_DESKTOP ? 36 : 30,
    borderRadius: 4,
  },
  previewMore: {
    width: IS_DESKTOP ? 36 : 30,
    height: IS_DESKTOP ? 36 : 30,
    borderRadius: IS_DESKTOP ? 18 : 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
});

function ScanlineOverlay({ height }) {
  return (
    <View style={[StyleSheet.absoluteFill, { height, overflow: 'hidden', pointerEvents: 'none' }]}>
      {Array.from({ length: Math.ceil(height / 4) }).map((_, i) =>
        i % 2 === 0
          ? <View key={i} style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.16)' }} />
          : <View key={i} style={{ height: 3 }} />
      )}
    </View>
  );
}

function DrawerMenu({ visible, onClose, accent, gen, generationId, chooseGeneration, navigation, onRandom, user, isAuthenticated, onAvatarPress, onSignOut }) {
  if (!visible) return null;

  const GEN_OPTS = [
    { id: 'boomer', label: 'BOOMER', color: GENERATIONS.boomer.accentColor },
    { id: 'millennial', label: 'MILLENNIAL', color: GENERATIONS.millennial.accentColor },
    { id: 'genz', label: 'GEN Z', color: GENERATIONS.genz.accentColor },
  ];

  const menuItems = [
    { icon: 'tv', label: 'THE VAULT', tab: 'Browse' },
    { icon: 'search', label: 'SEARCH', tab: 'Search' },
    { icon: 'compass', label: 'SIGNAL', tab: 'Signal' },
    { icon: 'bookmark', label: 'MY VOID', tab: 'My Void' },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={drawerStyles.overlay} onPress={onClose}>
        <Pressable style={drawerStyles.drawer} onPress={(e) => e.stopPropagation()}>
          {/* Header with user info */}
          <View style={drawerStyles.drawerHeader}>
            <View style={drawerStyles.drawerLogoRow}>
              <Text style={[drawerStyles.drawerLogo, { color: accent }]}>VOID</Text>
              <Text style={drawerStyles.drawerLogoSub}> CHANNEL</Text>
            </View>
            <Text style={[drawerStyles.drawerTagline, { color: BRAND_BLUE }]}>generating since 1895</Text>
          </View>

          {/* User account section */}
          {isAuthenticated && user ? (
            <View style={drawerStyles.userSection}>
              <TouchableOpacity onPress={() => { onClose(); onAvatarPress?.(); }} style={drawerStyles.userRow} activeOpacity={0.7}>
                {user.avatar_url ? (
                  <FastImage uri={user.avatar_url} itemId={`dav_${user.id}`} style={drawerStyles.drawerAvatar} contentFit="cover" />
                ) : (
                  <View style={[drawerStyles.drawerAvatarFallback, { backgroundColor: accent + '30' }]}>
                    <Text style={[drawerStyles.drawerAvatarGlyph, { color: accent }]}>
                      {(user.username || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={drawerStyles.drawerUsername}>{user.username || user.display_name || 'void dweller'}</Text>
                  <Text style={drawerStyles.drawerUserSub}>tap to change avatar</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { onClose(); onSignOut?.(); }} style={drawerStyles.signOutBtn} activeOpacity={0.7}>
                <Ionicons name="log-out-outline" size={14} color={colors.textMuted} />
                <Text style={drawerStyles.signOutText}>SIGN OUT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { onClose(); navigation.navigate('Auth'); }}
              style={drawerStyles.drawerSignIn}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={16} color={accent} style={{ width: 28 }} />
              <Text style={[drawerStyles.menuLabel, { color: accent }]}>SIGN IN / CREATE ACCOUNT</Text>
            </TouchableOpacity>
          )}

          <View style={drawerStyles.divider} />

          {/* Nav items */}
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.tab}
              style={drawerStyles.menuItem}
              onPress={() => { onClose(); navigation.navigate(item.tab); }}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}

          <View style={drawerStyles.divider} />

          {/* Generation switcher */}
          <Text style={drawerStyles.sectionLabel}>GENERATION</Text>
          <View style={drawerStyles.genRow}>
            {GEN_OPTS.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  chooseGeneration(g.id);
                }}
                style={[
                  drawerStyles.genPill,
                  generationId === g.id && { borderColor: g.color, backgroundColor: g.color + '20' },
                ]}
              >
                <Text style={[
                  drawerStyles.genPillText,
                  generationId === g.id && { color: g.color },
                ]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={drawerStyles.divider} />

          {/* Surprise Me */}
          <TouchableOpacity style={drawerStyles.menuItem} onPress={onRandom} activeOpacity={0.7}>
            <Ionicons name="shuffle" size={18} color={accent} style={{ width: 28 }} />
            <Text style={drawerStyles.menuLabel}>SURPRISE ME</Text>
          </TouchableOpacity>

          <View style={drawerStyles.divider} />

          {/* Account */}
          <TouchableOpacity
            style={drawerStyles.menuItem}
            onPress={() => { onClose(); navigation.navigate('Auth'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={18} color={accent} style={{ width: 28 }} />
            <Text style={drawerStyles.menuLabel}>ACCOUNT</Text>
          </TouchableOpacity>

          {/* Admin — only visible to admin emails */}
          {isAuthenticated && user && ['bryankorth31@gmail.com', 'preacherb@cashvalues.org'].includes((user.email || '').toLowerCase()) && (
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { onClose(); navigation.navigate('Admin'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="shield-checkmark" size={18} color="#ff3b5c" style={{ width: 28 }} />
              <Text style={[drawerStyles.menuLabel, { color: '#ff3b5c' }]}>ADMIN PANEL</Text>
            </TouchableOpacity>
          )}

          <View style={drawerStyles.divider} />

          {/* Support */}
          <TouchableOpacity
            style={drawerStyles.supportBtn}
            onPress={() => Linking.openURL(DONATE_URL)}
            activeOpacity={0.7}
          >
            <Ionicons name="gift" size={22} color={BRAND_BLUE} style={{ width: 30 }} />
            <View>
              <Text style={[drawerStyles.menuLabel, { color: '#f5a623' }]}>SUPPORT HUMAN CREATIONS</Text>
              <Text style={[drawerStyles.supportSub, { color: '#39ff14' }]}>FIGHT THE AI SLOP — donate to keep real cinema alive</Text>
            </View>
          </TouchableOpacity>

          {/* Footer */}
          <View style={{ flex: 1 }} />
          <Text style={[drawerStyles.footerText, { color: '#f5a623', fontSize: 9 }]}>A project of Church of American Strength & Hope</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://cashvalues.org')} activeOpacity={0.7}>
            <Text style={[drawerStyles.footerText, { color: BRAND_BLUE, textDecorationLine: 'underline' }]}>CASHvalues.org</Text>
          </TouchableOpacity>
          <Text style={drawerStyles.footerText}>VOIDtv v0.3 · ARCHIVE.ORG · PUBLIC DOMAIN</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const drawerStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
  },
  drawer: {
    width: 260, backgroundColor: colors.bg,
    borderRightWidth: 1, borderRightColor: colors.surface,
    paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20,
  },
  drawerHeader: {
    marginBottom: 28, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  drawerLogoRow: { flexDirection: 'row', alignItems: 'baseline' },
  drawerLogo: { fontFamily: fonts.monoBold, fontSize: 20, letterSpacing: 4 },
  drawerLogoSub: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted, letterSpacing: 1 },
  drawerTagline: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 1.5, marginTop: 4 },
  // User section in drawer
  userSection: {
    paddingVertical: 12, paddingHorizontal: 4,
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
  },
  drawerAvatar: { width: 36, height: 36, borderRadius: 18 },
  drawerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  drawerAvatarGlyph: { fontFamily: fonts.monoBold, fontSize: 16 },
  drawerUsername: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 0.5 },
  drawerUserSub: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 0.5, marginTop: 1 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 4, marginTop: 4,
  },
  signOutText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 1 },
  drawerSignIn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 4,
  },
  menuLabel: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 1.5 },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: colors.surface,
    marginVertical: 16,
  },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 2, marginBottom: 10 },
  genRow: { flexDirection: 'row', gap: 8 },
  genPill: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  genPillText: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.textMuted, letterSpacing: 1 },
  supportBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 4,
  },
  supportSub: { fontFamily: fonts.monoBold, fontSize: 8, color: '#ff2d7880', letterSpacing: 1.2, marginTop: 2 },
  footerText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 1, textAlign: 'center', marginTop: 4 },
});

function SkeletonRow() {
  return (
    <View style={{ marginBottom: 34 }}>
      <View style={{ height: 12, width: 200, backgroundColor: colors.card, borderRadius: 3, marginHorizontal: spacing.screenPadding, marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.screenPadding }}>
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  stickyHeader: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.screenPadding, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerCol: { flex: 1, flexDirection: 'row', alignItems: 'center' },  // equal-width columns for centering search bar
  hamburger: { padding: 4 },
  scroll: { flex: 1 },
  logoWrap: { flexDirection: 'row', alignItems: 'baseline' },
  logoVoid: { fontFamily: fonts.monoBold, fontSize: 18, letterSpacing: 4 },
  logoTv: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, letterSpacing: 0.5 },
  // Desktop centered search bar (YouTube style)
  desktopSearchBar: {
    flex: 1,
    maxWidth: 540,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 24,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  desktopSearchPlaceholder: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    flex: 1,
  },
  // ── YouTube-style filter chip bar ──
  chipBarWrap: {
    maxHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
    backgroundColor: colors.bg,
    zIndex: 9,
  },
  chipBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipArrow: {
    width: 28,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  // headerTagline/Sub removed — vertical space reclaimed
  // User chip — avatar + name in header
  userChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingRight: 8, paddingLeft: 2, paddingVertical: 2,
    borderRadius: radius.full, backgroundColor: colors.surface,
  },
  userAvatar: {
    width: 24, height: 24, borderRadius: 12,
  },
  userAvatarGlyph: {
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  userAvatarGlyphText: {
    fontFamily: fonts.monoBold, fontSize: 11,
  },
  userChipName: {
    fontFamily: fonts.monoBold, fontSize: 9, color: colors.textPrimary,
    letterSpacing: 0.5, maxWidth: 80,
  },
  signInChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface,
  },
  signInChipText: {
    fontFamily: fonts.mono, fontSize: 8, color: colors.textMuted, letterSpacing: 0.8,
  },
  randomBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  randomText: { fontFamily: fonts.monoBold, fontSize: 9, letterSpacing: 1.2 },
  heroContent: { ...StyleSheet.absoluteFillObject, paddingHorizontal: spacing.screenPadding, paddingBottom: 20, justifyContent: 'space-between' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroEyebrow: { fontFamily: fonts.monoBold, fontSize: 8, letterSpacing: 2, marginBottom: 8 },
  heroTitle: { fontFamily: fonts.sansSemiBold, fontSize: 28, color: '#fff', lineHeight: 34, marginBottom: 6 },
  heroCreator: { fontFamily: fonts.sans, fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 2 },
  heroYear: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5, marginBottom: 10 },
  heroTagline: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, fontStyle: 'italic', marginBottom: 16 },
  watchBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 11, borderRadius: radius.sm },
  watchBtnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 2 },
  heroLoadingBlock: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: spacing.screenPadding, paddingBottom: 28 },
  heroLoadingMsg: { fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  heroLoadingTagline: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  // Channels
  channelsBlock: { marginBottom: 4, paddingTop: 4 },
  channelsHeader: { paddingHorizontal: spacing.screenPadding, marginBottom: 12 },
  channelsTitle: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 2 },
  channelsSubtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, fontStyle: "italic", marginTop: 2 },
  channelsRow: { flexDirection: "row", paddingHorizontal: spacing.screenPadding, gap: 10, paddingBottom: 4 },
  channelTile: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, minWidth: 130 },
  // thumbStack/thumbStackImg removed — channels are text-only now
  liveBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, marginBottom: 8, gap: 4 },
  liveBadgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.bg },
  liveBadgeText: { fontFamily: fonts.monoBold, fontSize: 8, letterSpacing: 1, color: colors.bg },
  channelTileLabel: { fontFamily: fonts.monoBold, fontSize: 13, color: "#fff", letterSpacing: 1 },
  channelTileSub: { fontFamily: fonts.mono, fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, marginTop: 2 },

  // Shorts
  shortsBlock: { marginBottom: 8, paddingTop: 6 },
  shortsHeader: { paddingHorizontal: spacing.screenPadding, marginBottom: 14 },
  shortsTitle: { fontFamily: fonts.sansSemiBold, fontSize: 20, letterSpacing: 0.5 },
  shortsSubtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  shortsBadge: {
    width: 24, height: 24, borderRadius: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  shortsRow: {
    flexDirection: 'row', paddingHorizontal: spacing.screenPadding, gap: SHORTS_GAP,
    paddingRight: spacing.screenPadding + 20,
  },
  shortsCard: {
    width: SHORTS_CARD_W, height: SHORTS_CARD_H,
    borderRadius: 12, overflow: 'hidden',
    backgroundColor: colors.card, position: 'relative',
  },
  shortsThumb: {
    width: SHORTS_CARD_W, height: SHORTS_CARD_H,
    borderRadius: 12,
  },
  shortsCardContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 10, paddingTop: 16,
  },
  shortsCardTitle: {
    fontFamily: fonts.sansMedium, fontSize: 14, color: '#fff',
    lineHeight: 19, marginBottom: 3,
  },
  shortsCardMeta: {
    fontFamily: fonts.sans, fontSize: 12, color: 'rgba(255,255,255,0.65)',
  },
  // Void Snacks horizontal-scroll arrows — same Amazon-style overlay as CategoryRow (desktop)
  shortsRowWrap: { position: 'relative' },
  shortsArrowOverlay: {
    position: 'absolute', top: 0, bottom: 0, width: 44, zIndex: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  shortsArrowLeft: {
    left: 0,
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(to right, rgba(12,12,15,0.85), transparent)' }
      : { backgroundColor: 'rgba(12,12,15,0.6)' }),
  },
  shortsArrowRight: {
    right: 0,
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(to left, rgba(12,12,15,0.85), transparent)' }
      : { backgroundColor: 'rgba(12,12,15,0.6)' }),
  },
  shortsArrowBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

  divider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.surface },
  dividerText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 2 },

  // ── Browse toolbar — compact tuner strip ──
  browseToolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: spacing.screenPadding,
    marginTop: 16, marginBottom: 14,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderRadius: radius.md,
    backgroundColor: colors.surface + '30',
  },
  browseToolbarLeft: { flexDirection: 'column' },
  browseLabel: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 2 },
  browseSub: { fontFamily: fonts.mono, fontSize: 8, color: colors.textGhost, letterSpacing: 1.5, marginTop: 1 },
  tuneDial: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  tuneArrow: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  tuneDisplay: { flexDirection: 'row', alignItems: 'baseline', gap: 3, minWidth: 36, justifyContent: 'center' },
  tuneChannel: { fontFamily: fonts.monoBold, fontSize: 20, letterSpacing: 1 },
  tuneTotalText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textGhost },
  reshuffleBtn: {
    flexDirection: 'column', alignItems: 'center', gap: 3,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md, borderWidth: 1,
  },
  reshuffleText: { fontFamily: fonts.monoBold, fontSize: 7, letterSpacing: 1 },
  // Wake up server
  wakeBlock: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: spacing.screenPadding,
  },
  wakeEmoji: { fontSize: 36, marginBottom: 12 },
  wakeTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 2, marginBottom: 8 },
  wakeSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  wakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: radius.full, borderWidth: 1,
  },
  wakeBtnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5 },

  // Floating action button (menu + scroll-to-top)
  fab: {
    position: 'absolute', left: 14, zIndex: 20,
    alignItems: 'center', gap: 8,
  },
  fabBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
    ...Platform.select({
      web: { boxShadow: '0 2px 12px rgba(0,0,0,0.5)' },
      default: { elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6 },
    }),
  },
  fabBtnSmall: {
    width: 34, height: 34, borderRadius: 17,
  },

  footer: { paddingHorizontal: spacing.screenPadding, paddingTop: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface, marginTop: 12, gap: 3 },
  footerLine: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },
  footerDonate: { marginTop: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  donateCta: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.screenPadding, marginTop: 24, marginBottom: 8,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: BRAND_BLUE + '30',
    backgroundColor: BRAND_BLUE + '0A',
  },
  donateCtaTitle: {
    fontFamily: fonts.monoBold, fontSize: 11, color: '#f5a623',
    letterSpacing: 1.2,
  },
  donateCtaSub: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted,
    letterSpacing: 0.4, marginTop: 2,
  },
});
