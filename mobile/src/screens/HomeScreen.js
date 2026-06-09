import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, Animated, TouchableOpacity, Pressable, Modal, Linking,
  ScrollView, StyleSheet, Dimensions, Platform, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from '../components/FastImage';
import CategoryRow from '../components/CategoryRow';
import SkeletonCard from '../components/SkeletonCard';
import AvatarPickerModal from '../components/AvatarPickerModal';
import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import { GENERATIONS } from '../data/generations';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, radius } from '../theme';

import { SIDEBAR_NAV_W } from '../components/DesktopSidebar';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 900;
const CONTENT_W = IS_DESKTOP ? SCREEN_W - SIDEBAR_NAV_W : SCREEN_W;
const HERO_H = Math.round(CONTENT_W * 0.62);
const DONATE_URL = 'https://square.link/u/IteDL7XI';
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
  { id: 'mature', label: '18+' },
];

// Shorts card dimensions — tall portrait like YouTube Shorts
const SHORTS_CARD_W = IS_DESKTOP ? 180 : 150;
const SHORTS_CARD_H = Math.round(SHORTS_CARD_W * 1.7); // ~9:16 portrait
const SHORTS_GAP = IS_DESKTOP ? 14 : 10;

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen, generationId, chooseGeneration } = useGeneration();
  const { user, isAuthenticated, updateProfile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [allCategories, setAllCategories] = useState([]);
  const [catPage, setCatPage] = useState(0);
  const CATS_PER_PAGE = 5;
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

  // Paginate: show CATS_PER_PAGE "type" categories at a time
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
  const deepCats = useMemo(() => allCategories.filter((c) => c.group === 'deep'), [allCategories]);
  const showCats = useMemo(() => allCategories.filter((c) => c.group === 'show'), [allCategories]);
  const decadeCats = useMemo(() => {
    const raw = allCategories.filter((c) => c.group === 'decade');
    const priority = gen.categoryPriority || [];
    if (priority.length === 0) return raw;
    return [...raw].sort((a, b) => {
      const ai = priority.indexOf(a.id);
      const bi = priority.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [allCategories, gen.categoryPriority]);
  const visibleTypeCats = useMemo(() => {
    // When a filter chip is active (not "all"), only show matching category
    if (activeChip !== 'all') {
      const match = typeCats.filter((c) => c.id === activeChip);
      return match.length > 0 ? match : typeCats.slice(0, CATS_PER_PAGE);
    }
    const start = catPage * CATS_PER_PAGE;
    return typeCats.slice(start, start + CATS_PER_PAGE);
  }, [typeCats, catPage, activeChip]);
  const totalTypePages = Math.max(1, Math.ceil(typeCats.length / CATS_PER_PAGE));

  // Per-category pagination — tracks which page each category is on + loading state
  const [catPages, setCatPages] = useState({});       // { [catId]: pageNumber }
  const [catLoading, setCatLoading] = useState({});   // { [catId]: true/false }

  const handlePageChange = useCallback(async (categoryId, newPage) => {
    if (newPage < 1 || catLoading[categoryId]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCatLoading((prev) => ({ ...prev, [categoryId]: true }));
    try {
      const result = await api.getCategoryItems(categoryId, newPage, 20);
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
  }, [catLoading]);

  // Reset category page when generation changes so user sees the new ordering
  useEffect(() => { setCatPage(0); }, [generationId]);

  // ── Pixel font crispness — disable anti-aliasing for monospace fonts on web ──
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'voidtv-pixel-crisp-css';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = [
      '/* VOIDtv — crisp pixel/monospace fonts */',
      '[data-testid], [class*="mono"], [style*="SpaceMono"] {',
      '  -webkit-font-smoothing: none;',
      '  -moz-osx-font-smoothing: unset;',
      '  font-smooth: never;',
      '}',
      '/* Global: all mono-spaced text gets sharp rendering */',
      '@font-face { font-family: SpaceMono_400Regular; font-display: swap; }',
      '@font-face { font-family: SpaceMono_700Bold; font-display: swap; }',
    ].join('\n');
    document.head.appendChild(s);
  }, []);

  const handleRetune = useCallback((direction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCatPage((prev) => {
      if (direction === 'up') return prev > 0 ? prev - 1 : totalTypePages - 1;
      return prev < totalTypePages - 1 ? prev + 1 : 0;
    });
  }, [totalTypePages]);

  const headerAnim = scrollY.interpolate({
    inputRange: [0, 80], outputRange: [1, 0], extrapolate: 'clamp',
  });
  // Floating menu button — inverse of header: fades IN as you scroll down
  const fabAnim = scrollY.interpolate({
    inputRange: [60, 140], outputRange: [0, 1], extrapolate: 'clamp',
  });
  const scrollRef = useRef(null);

  const loadCategories = useCallback(async (mode = "open") => {
    // mode: "open" → fetch shuffled but show cache first if present (fast)
    //       "repopulate" → bust cache + fetch a totally fresh shuffled batch
    const forceFresh = mode === "repopulate";
    try {
      if (!forceFresh) {
        // Show cache instantly — only background-refresh if cache is older than 10 min
        const cached = await store.getCachedCategories();
        if (cached) {
          setAllCategories(cached);
          setLoading(false);
          pickHero(cached);
          // Check if cache is recent enough to skip the background fetch
          const ts = await store.getCategoriesTimestamp?.() || 0;
          const ageMs = Date.now() - ts;
          if (ageMs > 10 * 60 * 1000) { // older than 10 min → refresh in background
            api.getCategories({ shuffle: true }).then((fresh) => {
              setAllCategories(fresh);
              store.setCachedCategories(fresh);
              pickHero(fresh);
            }).catch(() => {});
          }
          return;
        }
      }
      // First load, or repopulate — wait for fresh data with shuffle
      const data = await api.getCategories({ shuffle: true, refresh: forceFresh });
      setAllCategories(data);
      setServerSleeping(false);
      store.setCachedCategories(data);
      pickHero(data);
    } catch (err) {
      console.error('[HomeScreen]', err);
      if (err.message?.includes('timed out') || err.message?.includes('fetch')) {
        setServerSleeping(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
    setRefreshing(true);
    await loadCategories("repopulate");
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
      api.getShorts(15)
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

  // Launch a category as a continuously-playing channel
  const handleChannelPress = useCallback((cat, label) => {
    if (!cat?.items?.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Player', {
      item: cat.items[0],
      id: cat.items[0].id,
      queue: cat.items,
      queueIndex: 0,
      categoryId: cat.id,
      channelLabel: label,
    });
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

  return (
    <View style={styles.container}>
      {/* Sticky header — always visible, solid background */}
      <View
        style={[styles.stickyHeader, { paddingTop: insets.top + 4 }]}
      >
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
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
          {/* ── Desktop: centered search bar like YouTube ── */}
          {IS_DESKTOP && (
            <Pressable
              onPress={() => navigation.navigate('Search')}
              style={styles.desktopSearchBar}
            >
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <Text style={styles.desktopSearchPlaceholder}>Search VOIDtv</Text>
            </Pressable>
          )}
          <View style={styles.headerRight}>
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
        {/* Support banner */}
        <TouchableOpacity
          onPress={() => Linking.openURL(DONATE_URL)}
          style={styles.supportBanner}
          activeOpacity={0.7}
        >
          <Text style={styles.supportBannerText}>SUPPORT HUMAN CREATIONS</Text>
          <Ionicons name="gift" size={20} color={BRAND_BLUE} style={{ marginHorizontal: 2 }} />
          <Text style={styles.supportBannerSlogan}>FIGHT THE AI SLOP</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTagline, { color: BRAND_BLUE }]}>GENERATING SINCE 1895</Text>
        <Text style={styles.headerTaglineSub}>public domain cinema — before AI slop, there was human creativity</Text>
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

      {/* ── YouTube-style filter chip bar — text-only genre channels ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipBar}
        style={styles.chipBarWrap}
      >
        {FILTER_CHIPS.map((chip) => {
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

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
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
        />

        {/* Wake Up Server */}
        {serverSleeping && (
          <View style={styles.wakeBlock}>
            <Text style={styles.wakeEmoji}>📡</Text>
            <Text style={styles.wakeTitle}>SERVER IS SLEEPING</Text>
            <Text style={styles.wakeSub}>
              Free tier backend hibernates after 15 min of inactivity.{'\n'}
              One tap wakes it up — takes about 30 seconds.
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

        {/* Shorts — short-form content (YouTube Shorts style) */}
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

        {/* Channels — auto-playing queues for a couple of standout categories */}
        {!loading && allCategories.length > 0 && (
          <ChannelsRow
            categories={allCategories}
            accent={accent}
            onChannelPress={handleChannelPress}
          />
        )}

        {/* Browse — 5 categories at a time with retune */}
        {loading && allCategories.length === 0 ? (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>THE COLLECTION</Text>
              <View style={styles.dividerLine} />
            </View>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
          </>
        ) : (
          <>
            {/* ── Browse toolbar — compact tuner strip ── */}
            <View style={[styles.browseToolbar, { borderColor: accent + '25' }]}>
              {/* Left: label + page dial */}
              <View style={styles.browseToolbarLeft}>
                <Text style={[styles.browseLabel, { color: accent }]}>THE VAULT</Text>
                <Text style={styles.browseSub}>BY GENRE</Text>
              </View>

              {/* Center: retune dial */}
              <View style={styles.tuneDial}>
                <TouchableOpacity
                  onPress={() => handleRetune('up')}
                  style={[styles.tuneArrow, { borderColor: accent + '40' }]}
                  activeOpacity={0.7}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-back" size={16} color={accent} />
                </TouchableOpacity>
                <View style={styles.tuneDisplay}>
                  <Text style={[styles.tuneChannel, { color: accent }]}>{catPage + 1}</Text>
                  <Text style={styles.tuneTotalText}>/ {totalTypePages}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRetune('down')}
                  style={[styles.tuneArrow, { borderColor: accent + '40' }]}
                  activeOpacity={0.7}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-forward" size={16} color={accent} />
                </TouchableOpacity>
              </View>

              {/* Right: repopulate */}
              <TouchableOpacity
                onPress={handleRepopulate}
                style={[styles.reshuffleBtn, { borderColor: accent + '50', backgroundColor: accent + '0a' }]}
                activeOpacity={0.7}
                disabled={refreshing}
              >
                <Ionicons
                  name={refreshing ? "sync" : "shuffle"}
                  size={14}
                  color={accent}
                />
                <Text style={[styles.reshuffleText, { color: accent }]}>
                  {refreshing ? "TUNING..." : "NEW STUFF"}
                </Text>
              </TouchableOpacity>
            </View>

            {visibleTypeCats.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                onItemPress={handleItemPress}
                page={catPages[cat.id] || 1}
                loadingMore={!!catLoading[cat.id]}
                onPageChange={handlePageChange}
                subscribed={subscribedIds.has(cat.id)}
                onSubscribe={handleSubscribe}
                onSeeMore={handleSeeMore}
              />
            ))}

            {/* Deep cuts — granular sub-categories (lazy: renders 2.5s after above-fold) */}
            {deepCats.length > 0 && (
              <LazySection delayMs={2500} estimatedHeight={deepCats.length * 180}>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>DEEP CUTS — THE WEIRD STUFF</Text>
                  <View style={styles.dividerLine} />
                </View>
                {deepCats.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onItemPress={handleItemPress}
                    page={catPages[cat.id] || 1}
                    loadingMore={!!catLoading[cat.id]}
                    onPageChange={handlePageChange}
                    subscribed={subscribedIds.has(cat.id)}
                    onSubscribe={handleSubscribe}
                onSeeMore={handleSeeMore}
                  />
                ))}
              </LazySection>
            )}

            {/* By show / series (lazy: renders 5s after above-fold) */}
            {showCats.length > 0 && (
              <LazySection delayMs={5000} estimatedHeight={showCats.length * 180}>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>BY SERIES — THE CLASSICS</Text>
                  <View style={styles.dividerLine} />
                </View>
                {showCats.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onItemPress={handleItemPress}
                    page={catPages[cat.id] || 1}
                    loadingMore={!!catLoading[cat.id]}
                    onPageChange={handlePageChange}
                    subscribed={subscribedIds.has(cat.id)}
                    onSubscribe={handleSubscribe}
                onSeeMore={handleSeeMore}
                  />
                ))}
              </LazySection>
            )}

            {/* By decade (lazy: renders 8s after above-fold) */}
            {decadeCats.length > 0 && (
              <LazySection delayMs={8000} estimatedHeight={decadeCats.length * 180}>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>BY DECADE — TIME MACHINE</Text>
                  <View style={styles.dividerLine} />
                </View>
                {decadeCats.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onItemPress={handleItemPress}
                    page={catPages[cat.id] || 1}
                    loadingMore={!!catLoading[cat.id]}
                    onPageChange={handlePageChange}
                    subscribed={subscribedIds.has(cat.id)}
                    onSubscribe={handleSubscribe}
                onSeeMore={handleSeeMore}
                  />
                ))}
              </LazySection>
            )}
          </>
        )}

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 90 }]}>
          <Text style={[styles.footerLine, { color: BRAND_BLUE, fontFamily: fonts.monoBold, letterSpacing: 2 }]}>◈ GENERATING SINCE 1895 ◈</Text>
          <Text style={styles.footerLine}>before AI slop, there was human creativity</Text>
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
    </View>
  );
}

/** Lazy renderer — delays mounting children until `delayMs` after first render.
 *  Keeps initial paint fast by only rendering above-fold content immediately. */
function LazySection({ children, delayMs = 100, estimatedHeight = 200 }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  if (!ready) return <View style={{ minHeight: estimatedHeight }} />;
  return <>{children}</>;
}

function HeroCard({ item, loading, insetTop, loadingMsg, tagline, gen, accent, onPress, onRandom }) {
  const totalH = HERO_H + 20; // header is now outside scroll, no inset padding needed

  if (loading && !item) {
    return (
      <View style={{ height: totalH, backgroundColor: colors.card }}>
        <View style={[styles.heroLoadingBlock, { paddingTop: 20 }]}>
          <Text style={[styles.heroLoadingMsg, { color: accent }]}>{loadingMsg}</Text>
          <Text style={styles.heroLoadingTagline}>{tagline}</Text>
        </View>
        <LinearGradient colors={['transparent', colors.bg]} locations={[0.7, 1]} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
      </View>
    );
  }
  if (!item) return null;

  const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;

  return (
    <Pressable onPress={onPress} style={{ height: totalH, width: CONTENT_W }}>
      <FastImage
        uri={item.thumbnail}
        itemId={item.id}
        style={{ width: CONTENT_W, height: totalH }}
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

// Shorts row — tall portrait cards, YouTube Shorts style
function ShortsRow({ items, accent, onItemPress }) {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.shortsBlock}>
      <View style={styles.shortsHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.shortsBadge, { backgroundColor: accent }]}>
            <Ionicons name="flash" size={12} color={colors.bg} />
          </View>
          <Text style={[styles.shortsTitle, { color: accent }]}>Shorts</Text>
        </View>
        <Text style={styles.shortsSubtitle}>quick clips under 2 minutes</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shortsRow}
      >
        {items.slice(0, IS_DESKTOP ? 8 : 10).map(function (item) {
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
    </View>
  );
}

// Channels row — TV channel tiles with multi-source mixing for variety
function ChannelsRow({ categories, accent, onChannelPress }) {
  // Each channel mixes items from multiple related categories
  const channelDefs = [
    {
      label: "CARTOONS", icon: "★",
      catIds: ["cartoons", "show_betty_boop", "show_popeye", "show_looney", "show_woody", "show_mickey", "show_felix", "saturday_morning"],
    },
    {
      label: "SCI-FI", icon: "◈",
      catIds: ["scifi", "deep_space", "deep_atomic"],
    },
    {
      label: "NIGHTMARE FUEL", icon: "☠",
      catIds: ["horror", "deep_creature", "deep_vampire", "deep_camp"],
    },
    {
      label: "NOIR", icon: "◆",
      catIds: ["noir", "deep_mental_hygiene"],
    },
    {
      label: "COMEDY", icon: "★",
      catIds: ["comedy", "show_threestooges", "oddities"],
    },
    {
      label: "DOCS", icon: "▣",
      catIds: ["documentary", "newsreels", "nature_wildlife"],
    },
    {
      label: "WESTERNS", icon: "◆",
      catIds: ["western", "war_footage"],
    },
    {
      label: "ANIME", icon: "◈",
      catIds: ["anime", "foreign"],
    },
    {
      label: "PROJECTION ROOM", icon: "▶",
      catIds: ["prelinger", "psa", "deep_driver_ed", "deep_propaganda"],
    },
    {
      label: "MUSIC", icon: "♫",
      catIds: ["music_video", "commercials"],
    },
    {
      label: "PUBLIC ACCESS", icon: "▶",
      catIds: ["public_access", "shopping", "game_shows"],
    },
    {
      label: "THE WEIRD SHELF", icon: "✦",
      catIds: ["oddities", "abstract", "conspiracy", "amateur"],
    },
  ];

  const channels = channelDefs
    .map((def) => {
      const mixed = mixCategoryItems(categories, def.catIds);
      // Use first category that has items for the thumbnail stack
      const primaryCat = def.catIds.map((id) => categories.find((c) => c.id === id)).find((c) => c?.items?.length > 0);
      return {
        ...def,
        category: primaryCat ? { ...primaryCat, id: def.catIds[0], items: mixed } : null,
      };
    })
    .filter((ch) => ch.category?.items?.length > 2);

  if (channels.length === 0) return null;

  return (
    <View style={styles.channelsBlock}>
      <View style={styles.channelsHeader}>
        <Text style={[styles.channelsTitle, { color: accent }]}>◉ CHANNELS</Text>
        <Text style={styles.channelsSubtitle}>tap to tune in — auto-plays through</Text>
      </View>
      <View style={styles.channelsRow}>
        {channels.map((ch) => (
          <Pressable
            key={ch.label}
            onPress={() => onChannelPress(ch.category, ch.label)}
            style={styles.channelTile}
          >
            {/* Thumbnail collage preview */}
            <View style={styles.thumbStack}>
              {ch.category.items.slice(0, 3).map((it, i) => (
                <FastImage
                  key={it.id}
                  uri={it.thumbnail}
                  itemId={it.id}
                  style={[
                    styles.thumbStackImg,
                    { left: i * 22, zIndex: 3 - i, opacity: 1 - i * 0.18 },
                  ]}
                  contentFit="cover"
                />
              ))}
            </View>
            <LinearGradient
              colors={["rgba(12,12,15,0)", "rgba(12,12,15,0.85)", "rgba(12,12,15,1)"]}
              locations={[0.2, 0.7, 1]}
              style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
            />
            <View style={styles.channelTileContent}>
              <View style={[styles.liveBadge, { backgroundColor: accent }]}>
                <View style={styles.liveBadgeDot} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
              <Text style={styles.channelTileLabel} numberOfLines={1}>{ch.label}</Text>
              <Text style={styles.channelTileSub}>
                {ch.category.items.length} mixed · auto-advance
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

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
          <Text style={drawerStyles.footerText}>VOIDtv v0.3</Text>
          <Text style={drawerStyles.footerText}>ARCHIVE.ORG · PUBLIC DOMAIN</Text>
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
  headerTagline: {
    fontFamily: fonts.monoBold, fontSize: 14, letterSpacing: 3,
    textAlign: 'center', marginTop: 6,
    textTransform: 'uppercase',
  },
  headerTaglineSub: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted,
    textAlign: 'center', marginTop: 2,
    fontStyle: 'italic',
  },
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
  // Support banner — one row: SUPPORT HUMAN CREATIONS [gift] FIGHT THE AI SLOP
  supportBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 8, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: '#39ff1425',
    backgroundColor: '#39ff1406',
  },
  supportBannerText: {
    fontFamily: fonts.monoBold, fontSize: 9, color: '#f5a623', letterSpacing: 1.2,
  },
  supportBannerSlogan: {
    fontFamily: fonts.monoBold, fontSize: 10, color: '#39ff14', letterSpacing: 1.5,
    textShadow: '0px 0px 6px #39ff1460',
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
  channelsRow: { flexDirection: "row", paddingHorizontal: spacing.screenPadding, gap: 10 },
  channelTile: { flex: 1, height: 130, borderRadius: 10, overflow: "hidden", backgroundColor: colors.card },
  thumbStack: { ...StyleSheet.absoluteFillObject },
  thumbStackImg: { position: "absolute", top: 0, width: "100%", height: "100%" },
  channelTileContent: { ...StyleSheet.absoluteFillObject, padding: 12, justifyContent: "flex-end" },
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
});
