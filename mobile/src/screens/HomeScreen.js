import React, { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import {
  View, Text, Animated, TouchableOpacity, Pressable, Modal, Linking,
  ScrollView, StyleSheet, Dimensions, Platform, TextInput, useWindowDimensions,
  ActivityIndicator, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VoidIcon, { hasVoidIcon } from '../components/VoidIcon';
import * as Haptics from 'expo-haptics';

import FastImage from '../components/FastImage';
import CategoryRow from '../components/CategoryRow';
import SkeletonCard from '../components/SkeletonCard';
import { VoidLoader } from '../components';
import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import { GENERATIONS } from '../data/generations';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, radius } from '../theme';

import { useSidebar } from '../context/SidebarContext';
import { useKids } from '../context/KidsContext';
import { useModernMode } from '../context/ModernModeContext';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 900;
const DONATE_URL = 'https://square.link/u/dJioBmlW';
const BRAND_BLUE = '#5cb8ff'; // vivid blue — donate icon + tagline

// YouTube-style filter chips — text-only genre aggregates, no thumbnails = fast
// (The desktop filter chip bar is GONE per Bryan — the wall is always the full "All" sea on every
// platform. The chip MECHANISM survives only for the drawer's 18+ / Browse routes: activeChip is
// 'all' or 'mature', nothing else sets it.)

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

// Client-side variety: BANDED shuffle — rows and items shuffle only within small local bands.
// Free, instant, zero Archive load. The backend era-lean orders BOTH the rows and each row's
// items for the generation; a full shuffle un-did that, and the old fix (skip recognizable rows
// entirely) froze them between visits. Banded is the middle: every visit looks different, but an
// era-leaned spine survives — a recent-first row stays recent-first, old rows stay sunk.
function bandShuffle(arr, band) {
  if (!Array.isArray(arr) || arr.length < 3) return arr || [];
  const out = [];
  for (let i = 0; i < arr.length; i += band) out.push(...shuffled(arr.slice(i, i + band)));
  return out;
}
function reshuffleCats(cats) {
  if (!Array.isArray(cats) || cats.length === 0) return cats;
  return bandShuffle(cats.map((c) => (c ? { ...c, items: bandShuffle(c.items, 4) } : c)), 4);
}

// Guard: only swap in a fresh payload if it actually has substantial content.
// A throttled Archive.org response can return all 47 categories but with empty items;
// swapping that in would blank the page (and poison the cache). Require >=50% populated.
function hasRealContent(cats) {
  if (!Array.isArray(cats) || cats.length === 0) return false;
  const populated = cats.filter((c) => c && c.items && c.items.length > 0).length;
  return populated >= Math.ceil(cats.length * 0.5);
}
// A "full" wall has at least this many populated rows (an ABSOLUTE floor, not a ratio). A deploy /
// warm-window payload can come back thin (2-4 rows); we still SHOW it (better than blank) but never
// CACHE it, so a thin wall can't poison the client cache and persist (B's recurring "only N rows" -
// the origin was always full; a thin payload had stuck in the client cache).
const WALL_MIN_ROWS = 6;
function isFullWall(cats) {
  if (!Array.isArray(cats)) return false;
  return cats.filter((c) => c && c.items && c.items.length > 0).length >= WALL_MIN_ROWS;
}

export default function HomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const { headerH, openDrawer, closeDrawer, drawerOpen } = useSidebar();
  // Content is full-width now — the desktop left sidebar is gone (nav lives in the top bar).
  const sceneW = windowW;
  const contentW = windowW;
  // Hero: smaller than Prime's (our archive thumbnails are low-res and shouldn't be blown
  // up huge). Capped on desktop so it doesn't dominate a wide screen; proportional on mobile.
  const heroH = IS_DESKTOP ? Math.min(Math.round(contentW * 0.30), 380) : Math.round(contentW * 0.52);
  const { gen, generationId, chooseGeneration } = useGeneration();
  const { kidsMode, kidsAccent } = useKids();
  const { modernMode } = useModernMode();
  const { user, isAuthenticated, isAnonymous, updateProfile, signOut } = useAuth();
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
  const [history, setHistory] = useState([]);   // Continue Watching — recent watch history
  const [shorts, setShorts] = useState([]);
  const [theme, setTheme] = useState(null); // JOB_14: active editorial theme window or null
  const [activeChip, setActiveChip] = useState('all');
  // Re-pick when generation changes so taglines/loading msgs match the active gen
  const tagline = useMemo(() => pickRandom(gen.taglines), [gen.id]);
  const loadingMsg = useMemo(() => pickRandom(gen.loadingMessages), [gen.id]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const accent = kidsMode ? kidsAccent : gen.accentColor;

  // Sort by generation's categoryPriority — categories listed first appear at the top
  const typeCats = useMemo(() => {
    // Mature rows are SEQUESTERED off the default wall (not censored) — reachable only on purpose via
    // the 18+ chip (desktop) / the 18+ drawer toggle (mobile). See visibleTypeCats.
    // VOIDtv KIDS belt-and-braces: the allowlist is ALSO enforced at render, so a stale
    // bundle, cached payload, or any race can never draw a non-kid row. KEEP IN SYNC with
    // KIDS_ALLOWLIST in backend/server.js.
    const KIDS_CLIENT_ALLOW = new Set(['pbs_kids', 'saturday_morning', 'kids_picks', 'kids_channel']);
    // vouched lanes (hand picks, the channel, and B's source-folder pages) skip the year floor
    const kidsVouched = (id) => id === 'kids_picks' || id.startsWith('kids_channel') || id.startsWith('kidsrc_');
    const kidsAllowed = (id) => KIDS_CLIENT_ALLOW.has(id) || id.startsWith('kids_channel') || id.startsWith('kidsrc_');
    if (kidsMode) {
      // Filter dead/unplayable tapes at the DATA level so the hero, the queue, AND the rows
      // all use clean items (the row-only filter let dead tapes through as the hero/queue).
      // Uploader re-encodes + YouTube-ripper prefixes + DVD menus = no playable derivative.
      const BAD_ID = /(h-?264|x-?26[45]|hevc|pdtv|hdtv|web-?dl|bd-?rip|dvd-?rip|dvddisc|dvd\d|disc\d|\b\d{3,4}p\b|\b\d+fps\b|\d+kbit|aac-sx|videoplayback|y-?2-?mate|youtube|ssyoutube|savefrom|2conv|\b2mate)/i;
      const BAD_TITLE = /\b(dvd|disc|title menu|main menu)\b/i;
      const clean = (arr) => (arr || []).filter((it) => it && it.id && !BAD_ID.test(it.id) && !BAD_TITLE.test(String(it.title || '')));
      return allCategories
        .filter((c) => c && kidsAllowed(c.id) && !c.mature)
        .map((c) => kidsVouched(c.id)
          ? ({ ...c, items: clean(c.items) })
          : ({ ...c, items: clean((c.items || []).filter((it) => it && it.year && it.year >= 1980)) }))
        .filter((c) => (c.items || []).length > 0);
    }
    const raw = allCategories.filter((c) => (!c.group || c.group === 'type') && !c.mature);
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
  }, [allCategories, gen.categoryPriority, kidsMode]);

  // VOIDtv KIDS: the hero must come from the kid-filtered set, never the raw payload pick
  const safeHeroItem = useMemo(() => {
    if (!kidsMode) return heroItem;
    for (const c of typeCats) if (c.items && c.items.length) return c.items[0];
    return null;
  }, [kidsMode, heroItem, typeCats]);
  // "The wall": "All" (the default — and mobile has no chips, so it stays on "All") renders EVERY
  // non-empty type category as a vertical scroll of horizontal rows — an overwhelming sea of
  // variety, on every platform. A desktop chip simply narrows the wall down to that one genre.
  const visibleTypeCats = useMemo(() => {
    // 18+ → ALL mature rows (sequestered, but reachable on purpose). "All" excludes mature (typeCats
    // already drops it). A specific chip narrows to that one genre.
    if (activeChip === 'mature') return allCategories.filter((c) => c.mature && (c.items || []).length > 0);
    if (activeChip === 'all') return typeCats.filter((c) => (c.items || []).length > 0);
    return allCategories.filter((c) => c.id === activeChip);
  }, [typeCats, allCategories, activeChip]);

  // 18+ is MEMBERS-ONLY: the mature wall is corralled + reachable, but only for REAL members.
  // Anonymous sessions don't count (anon sign-in is ON), so an anon/non-member gets the sign-in /
  // create-account screen instead.
  const selectChip = useCallback((id) => {
    if (id === 'mature' && (!isAuthenticated || isAnonymous)) { closeDrawer(); navigation.navigate('Auth'); return; }
    setActiveChip(id);
  }, [isAuthenticated, isAnonymous, navigation, closeDrawer]);

  // The hamburger drawer routes "18+" / "Browse" here via a `chip` param.
  useEffect(() => {
    const chip = route?.params?.chip;
    if (chip) {
      selectChip(chip);
      navigation.setParams?.({ chip: undefined });
      // Slice 16: mature rides the payload only with the PIN gate; the in-memory payload
      // predates verification, so entering 18+ refetches with the gate header attached.
      if (chip === 'mature' && api.hasMatureGate()) loadCategoriesRef.current?.('repopulate');
    }
  }, [route?.params?.chip, route?.params?._gate]);
  const loadCategoriesRef = useRef(null);

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

  // ── Smooth signal switch (B's ruling 2026-06-11): the wall swap commits BEHIND the drawer.
  // The fetch starts the moment a generation is selected; the heavy commit (90 rows of cards)
  // is what froze the screen. While the drawer is open the prepared payload is STASHED; when
  // the drawer closes it applies after the close animation as a non-urgent transition, so the
  // user steps out onto a finished wall. Payloads arriving with the drawer already closed
  // apply immediately, still inside a transition.
  const pendingWallRef = useRef(null);
  const drawerOpenRef = useRef(false);
  useEffect(() => { drawerOpenRef.current = drawerOpen; }, [drawerOpen]);

  const applyWallPayload = useCallback((varied, hero = true) => {
    if (drawerOpenRef.current) { pendingWallRef.current = { varied, hero }; return; }
    startTransition(() => {
      setAllCategories(varied);
      if (hero) pickHero(varied);
    });
  }, []);

  useEffect(() => {
    if (drawerOpen || !pendingWallRef.current) return;
    const { varied, hero } = pendingWallRef.current;
    pendingWallRef.current = null;
    const task = InteractionManager.runAfterInteractions(() => {
      startTransition(() => {
        setAllCategories(varied);
        if (hero) pickHero(varied);
      });
    });
    return () => task.cancel && task.cancel();
  }, [drawerOpen]);

  const loadCategories = useCallback(async (mode = "open") => {
    // mode: "open" → show cache first (reshuffled for variety), refresh if stale
    //       "repopulate" → pull genuinely fresh content via the fast blended path
    // The active generation drives the backend era-lean; it's threaded into every fetch + the
    // client cache is scoped per-gen, so switching generation re-runs this with the right lean.
    const forceFresh = mode === "repopulate";
    const g = generationId;
    // Modern Mode is a content lens: fetch tier=modern and namespace the client cache per mode so the
    // void wall and the modern wall never overwrite each other. gen still drives the newest lean.
    const mtier = modernMode ? 'modern' : undefined;
    const ckey = modernMode ? g + ':modern' : g;
    try {
      // VOIDtv KIDS: never serve or write the client cache in kids mode. The cache holds the
      // ADULT wall; fail closed means kids payloads come from the server-side allowlist only.
      if (!forceFresh && !kidsMode) {
        // Show cache instantly, reshuffled client-side for per-visit variety (zero Archive load)
        const cached = await store.getCachedCategories(ckey);
        if (cached) {
          applyWallPayload(reshuffleCats(cached));
          setLoading(false);
          // If cache is stale (>10 min) OR THIN, pull fresh content in the background — from the
          // FAST cached endpoint (the backend self-warms it). NOT refresh=true: that forces a
          // slow ~47-collection fetch that can exceed Cloudflare's 100s timeout → 524 → "CORS"
          // error. The cached endpoint is instant and always has CORS headers.
          // THIN cache = a 2-4 row wall that stuck from a past deploy/warm window (B's recurring
          // "only N rows"). The origin is always full, so don't wait out the 10-min staleness
          // window: refetch NOW and swap in the full wall the moment it lands. isFullWall on the
          // fresh payload still guards against re-poisoning if the server itself is mid-warm.
          const ts = await store.getCategoriesTimestamp?.(ckey) || 0;
          const cacheThin = !isFullWall(cached);
          if (cacheThin || Date.now() - ts > 10 * 60 * 1000) {
            api.getCategories({ gen: g, tier: mtier }).then((fresh) => {
              if (isFullWall(fresh)) {
                applyWallPayload(reshuffleCats(fresh), false);
                store.setCachedCategories(fresh, ckey);
              }
            }).catch(() => {});
          }
          return;
        }

        // ── FIRST VISIT (no client cache) ──
        // CRITICAL: paint from the pre-warmed server cache (blended, ~instant). Do NOT block
        // on the live shuffle path — it fires ~47 uncached Archive.org requests (80–200s) and
        // returns empty when throttled. Variety comes from the client-side reshuffle instead.
        const fast = await api.getCategories({ shuffle: false, gen: g, kids: kidsMode, tier: mtier });
        applyWallPayload(reshuffleCats(fast));
        setServerSleeping(false);
        setLoading(false);
        // never persist kids or GATED payloads (a cached mature payload would leak past
        // the PIN on the next session)
        if (!kidsMode && !api.hasMatureGate()) store.setCachedCategories(fast, ckey);
        return;
      }
      // Repopulate — pull from the FAST cached endpoint (reliable, instant, has CORS).
      // Never refresh=true (slow, can 524/CORS-fail). Variety comes from the client reshuffle.
      const data = await api.getCategories({ gen: g, kids: kidsMode, tier: mtier });
      if (hasRealContent(data)) {
        applyWallPayload(reshuffleCats(data));
        setServerSleeping(false);
        if (!kidsMode && !api.hasMatureGate()) store.setCachedCategories(data, ckey);
      } else if (allCategoriesRef.current.length) {
        // Throttled/empty — keep what we have, just reshuffle for a fresh feel
        applyWallPayload(reshuffleCats(allCategoriesRef.current));
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
  }, [generationId, applyWallPayload, kidsMode, modernMode]);

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

  // The hero is the storefront window (B 2026-06-28): it has to GRAB, or nobody scrolls. So instead
  // of a random pick (which kept landing on conspiracy docs / obscure uploads), SCORE candidates and
  // choose from the strongest few — marquee genre + has artwork + proven popularity + a real title —
  // with enough spread that it still rotates each launch.
  const HERO_MARQUEE = new Set([
    'feature_length', 'premium_past', 'most_popular', 'movies',
    'anime', 'horror', 'scifi', 'comedy', 'tv_movies', 'violence', 'action', 'cartoons',
  ]);
  function pickHero(cats) {
    const eligible = (cats || []).filter((c) => c && c.items && c.items.length > 0);
    if (eligible.length === 0) return;
    const pool = [];
    for (const c of eligible) {
      const marquee = HERO_MARQUEE.has(c.id);
      for (const it of c.items.slice(0, 8)) {
        if (it && it.id) pool.push({ it, cat: c, marquee });
      }
    }
    if (pool.length === 0) return;
    const score = (e) => {
      const it = e.it;
      let s = e.marquee ? 50 : 0;
      if (it.thumbnail) s += 30;                              // a hero with no image is dead
      s += Math.min(40, Math.log10((Number(it.downloads) || 0) + 1) * 8); // popular = proven draw, capped
      const t = String(Array.isArray(it.title) ? it.title[0] : (it.title || ''));
      if (t.length >= 8 && t.length <= 80) s += 10;           // a real, readable title
      return s;
    };
    const ranked = pool.map((e) => ({ e, s: score(e) })).sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, 8);                            // rotate among the strongest few
    const pick = top[Math.floor(Math.random() * top.length)].e;
    heroCategoryIdRef.current = pick.cat.id;
    setHeroItem(pick.it);
  }

  useEffect(() => { loadCategories(); loadCategoriesRef.current = loadCategories; }, [loadCategories]);

  // Continue Watching — load recent history on mount + every time we return to the wall (so a video
  // you just stopped shows up immediately).
  useEffect(() => {
    const load = () => store.getHistory?.().then((h) => setHistory(Array.isArray(h) ? h.slice(0, 12) : [])).catch(() => {});
    load();
    const unsub = navigation.addListener?.('focus', load);
    return unsub;
  }, [navigation]);

  // Clear Continue Watching — wipes local watch history and hides the row immediately.
  const handleClearContinue = useCallback(async () => {
    try { await store.clearHistory?.(); } catch {}
    setHistory([]);
  }, []);

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
      // KIDS: community surfaces do not exist; never even fetch them (fail closed)
      if (kidsMode) { setTopHearts([]); setTrending([]); return; }
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
      if (!kidsMode) {
        api.getShorts(50) // big pool — the wall drops a Void Snacks row every 3 rows, rotated for variety
          .then((data) => setShorts(Array.isArray(data) ? data : data?.items || []))
          .catch(() => setShorts([]));
        api.getTheme() // JOB_14: pinned editorial crate; null outside every window
          .then((d) => setTheme(d && d.theme ? d.theme : null))
          .catch(() => {});
      }
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

  // (FOLLOW tags removed from rows per Bryan — the "From Your Subscriptions" feed row still
  // renders for accounts with existing follows; there's just no follow/unfollow UI anymore.)

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
    if (!safeHeroItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Player', { item: safeHeroItem, id: safeHeroItem?.id, categoryId: heroCategoryIdRef.current });
  }, [safeHeroItem, navigation]);

  const handleRandom = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { const ri = await api.getRandomItem(); navigation.navigate('Player', { item: ri, id: ri.id }); } catch {}
  }, [navigation]);

  // KIDS TIME-TRAVEL TV (slice 17): tune into the Saturday Morning channel AS IF live. The
  // clock decides which vouched block is "on" and how far in, so tapping drops you mid-stream
  // exactly like the old broadcast. Period ads ride along on purpose (B: the texture IS the
  // time machine). Finite channel (no catIds), so playback just rides the vouched queue.
  // Tap a kids tape -> tune in AS IF live, AND hand the player the whole channel as a QUEUE
  // (B: "there isnt any autoplay or right side videos in kids to go to"). The queue makes a
  // dead/menu tape auto-skip to the next, and autoplay walk the channel — all vouched, no
  // catIds so it never fetches raw related into kids.
  const handleKidsLivePress = useCallback((item, label, channelItems) => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const q = Array.isArray(channelItems) && channelItems.length ? channelItems : [item];
    const idx = Math.max(0, q.findIndex((x) => x.id === item.id));
    navigation.navigate('Player', { item, id: item.id, queue: q, queueIndex: idx, channelLabel: label || 'KIDS', liveSync: true });
  }, [navigation]);

  const handleChannelTune = useCallback((items, label) => {
    if (!items || !items.length) return;
    // The blocks have no runtime metadata, so position is computed from the REAL video
    // duration in the player (liveSync). Pick today's block when several are vouched, so the
    // channel changes day to day but stays the same for everyone tuning in together.
    const dayIdx = Math.floor(Date.now() / 86400000) % items.length;
    const item = items[dayIdx];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Player', {
      item, id: item.id, queue: items, queueIndex: dayIdx,
      channelLabel: label || 'SATURDAY MORNING', channelPage: 1, liveSync: true,
    });
  }, [navigation]);

  // ── Virtualized wall (§12/§15.6): the vertical list is a windowed FlatList so a generation
  // switch (or any payload swap) re-renders a screenful (~5 rows), not all ~80 — the full-wall
  // synchronous commit froze desktop for seconds (measured 2.0s + 1.7s + 0.8s long tasks).
  // Rows materialize as they scroll near; void TVs CRT-blink back in on re-entry (on-vibe, §12).
  const wallData = useMemo(() => {
    const out = [];
    const len = visibleTypeCats.length;
    // JOB_14: the active theme pins its crate into the wall at theme.slot (after that many
    // category rows) and out of its normal position. B's ruling 2026-06-11: gems never LEAD
    // the wall; recency-first is the face, the pin is a discovery a few rows in (default 5).
    // The crate comes from the loaded payload: zero extra fetches, absent crate = no pin.
    const themedCat = (theme && !kidsMode) ? visibleTypeCats.find((c) => c.id === theme.crateId) : null;
    const themeSlot = Math.max(1, parseInt(theme && theme.slot, 10) || 5);
    let catCount = 0;
    visibleTypeCats.forEach((cat, idx) => {
      if (themedCat && cat.id === themedCat.id) return;
      out.push({ k: 'cat_' + cat.id, type: 'cat', cat, idx });
      catCount++;
      if (themedCat && catCount === themeSlot) out.push({ k: 'theme_' + themedCat.id, type: 'theme', cat: themedCat });
      // Void Snacks REMOVED 2026-06-28 (B: vestigial, ate wall space + added confusion). No snack row
      // is injected anymore; the getShorts fetch + ShortsRow component remain dead-but-harmless.
      // Continue Watching — sits under the first Void Snacks row. NEVER in kids: local
      // history can hold adult items watched before the toggle.
      if (!kidsMode && idx === 0 && history.length > 0) out.push({ k: 'continue', type: 'continue' });
      // (The Dial row was pulled off the wall, slice 17. Its clock mechanic now drives the
      // kids time-travel channel, which renders as the kids_channel cat below.)
      // Scattered void-stream TVs — ~1-in-6 rows, hash-scattered (web only)
      if (Platform.OS === 'web' && idx < len - 1 && ((((idx + 1) * 2654435761) >>> 0) % 6 === 0)) {
        out.push({ k: 'tv_' + idx, type: 'tv' });
      }
    });
    // Fewer rows than the slot: the pin still lands, at the end
    if (themedCat && catCount < themeSlot) out.push({ k: 'theme_' + themedCat.id, type: 'theme', cat: themedCat });
    return out;
  }, [visibleTypeCats, shorts, history.length, theme, kidsMode]);

  const wallKeyExtractor = useCallback((entry) => entry.k, []);

  const renderWallItem = useCallback(({ item: entry }) => {
    if (entry.type === 'theme') {
      return (
        <View style={{ marginBottom: 10 }}>
          <View style={{ paddingHorizontal: spacing.screenPadding, marginBottom: 6 }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: accent }}>
              {String(theme?.title || 'THIS WEEK').toUpperCase()}
            </Text>
            {!!theme?.copy && (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {theme.copy}
              </Text>
            )}
          </View>
          <CategoryRow
            category={entry.cat}
            onItemPress={handleItemPress}
            page={catPages[entry.cat.id] || 1}
            loadingMore={!!catLoading[entry.cat.id]}
            onPageChange={handlePageChange}
            onSeeMore={handleSeeMore}
          />
        </View>
      );
    }
    if (entry.type === 'cat') {
      return (
        <CategoryRow
          category={entry.cat}
          onItemPress={handleItemPress}
          page={catPages[entry.cat.id] || 1}
          loadingMore={!!catLoading[entry.cat.id]}
          onPageChange={handlePageChange}
          onSeeMore={handleSeeMore}
        />
      );
    }
    if (entry.type === 'snack') {
      return (
        <ShortsRow
          items={rotateArray(shorts, Math.floor(entry.idx / 3) * 11)}
          accent={accent}
          onItemPress={handleItemPress}
        />
      );
    }
    if (entry.type === 'continue') {
      return <ContinueRow items={history} accent={accent} onItemPress={handleItemPress} onClear={handleClearContinue} />;
    }
    // KIDS network channel: a full browse ROW of the vouched tapes (B: "load the rest into
    // the rows"). Tapping any tape tunes in AS IF live. The row header is the network name.
    if (entry.type === 'cat' && entry.cat.id.startsWith('kids_channel')) {
      const chName = entry.cat.name || 'SATURDAY MORNING';
      // Client belt: dedupe + hide uploader RE-ENCODES (ids tagged h-264/480p/pdtv/128kbit/etc.)
      // that IA has no browser-playable derivative for and that throw NotSupportedError. The
      // real broadcast tapes carry no codec tags. Immediate relief; the proper resolve-time
      // playability check is the tomorrow fix.
      const BAD_ENCODE = /(h-?264|x-?26[45]|hevc|pdtv|hdtv|web-?dl|bd-?rip|dvd-?rip|dvddisc|dvd\d|disc\d|\b\d{3,4}p\b|\b\d+fps\b|\d+kbit|aac-sx|videoplayback)/i;
      const BAD_TITLE = /\b(dvd|disc|title menu|main menu)\b/i; // DVD-rip menus (Preston's-style) that show a navigable menu, not a broadcast
      const seen = new Set();
      const items = (entry.cat.items || []).filter((it) => it && it.id && !seen.has(it.id) && (seen.add(it.id), true) && !BAD_ENCODE.test(it.id) && !BAD_TITLE.test(String(it.title || '')));
      return (
        <CategoryRow
          category={{ ...entry.cat, items, name: '▸ ' + chName, subtitle: 'time travel TV · tap to tune in live' }}
          onItemPress={(it) => handleKidsLivePress(it, chName, items)}
        />
      );
    }
    if (entry.type === 'tv') {
      return (
        <View style={{ marginHorizontal: spacing.screenPadding, marginBottom: 16 }}>
          {/* persist: wall TVs blink-cycle forever instead of dying after one 20-40s life */}
          <VoidLoader mode="static" size="row" persist style={{ width: '100%', height: 150, borderRadius: 8 }} />
        </View>
      );
    }
    return null;
  }, [handleItemPress, catPages, catLoading, handlePageChange, handleSeeMore, shorts, history, accent, theme, handleChannelTune, handleKidsLivePress, handleClearContinue]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + headerH }]}>
      <Animated.FlatList
        ref={scrollRef}
        style={styles.scroll}
        data={wallData}
        keyExtractor={wallKeyExtractor}
        renderItem={renderWallItem}
        initialNumToRender={30}
        maxToRenderPerBatch={12}
        windowSize={31}
        removeClippedSubviews={false}
        updateCellsBatchingPeriod={50}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: Platform.OS !== 'web' })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
        {/* Hero */}
        <HeroCard
          item={safeHeroItem}
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

        {/* CATALOG FRONT DOOR — SHOWS + MOVIES atop the wall (B's pick: cards AND drawer
            items). Destinations, not searches: straight into the verified catalog grid. */}
        {!kidsMode && (
          <CatalogDoorRow
            accent={accent}
            contentW={contentW}
            onShows={() => navigation.navigate('Search', { catalog: 'series', _ts: Date.now() })}
            onMovies={() => navigation.navigate('Search', { catalog: 'movies', _ts: Date.now() })}
          />
        )}

        {/* Community Hearts — items the most users have loved. NEVER in kids. */}
        {!kidsMode && topHearts.length > 0 && (
          <CategoryRow
            category={{
              id: "community_hearts",
              name: "♥ Community Loves",
              subtitle: `What other users are hearting · ${topHearts.length} items`,
              items: topHearts,
            }}
            onItemPress={handleItemPress}
          />
        )}

        {/* Trending Now + For You removed (per Bryan) — the genre category rows begin here. The
            first Void Snacks row now comes AFTER the first category row, via the interleave below. */}

        {/* Subscription Feed — items from followed categories. NEVER in kids. */}
        {!kidsMode && subFeed.length > 0 && (
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

        {/* SpotlightRow (TELEVISION / FULL LENGTH FILMS) REMOVED 2026-06-13 (B: "pick a
            lane"): it duplicated the SHOWS/MOVIES catalog doors above and routed to the same
            catalog, AND it rendered nothing whenever the catalog was empty (IA-blocked). The
            doors are the canonical, always-visible front door (slice 24). One lane. */}

          </>
        }
        ListFooterComponent={
          <>
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
              <Text style={{ color: '#39ff14' }}> · FIGHT THE AI SLOP</Text>
            </Text>
          </TouchableOpacity>
        </View>
          </>
        }
      />

      {/* Floating menu FAB removed (B 2026-06-13): on mobile it stacked bottom-left right
          behind the Archivist console. The TopBar hamburger is the menu affordance. */}

      {/* The Archivist removed 2026-06-28 (B: no value). Component + backend left dead-but-harmless. */}
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

// Continue Watching — recent watch history as a compact small-card row (lives under the first snacks
// row). Tap to jump back into a video you stopped.
function ContinueRow({ items, accent, onItemPress, onClear }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.continueBlock}>
      <View style={styles.continueHeader}>
        <Ionicons name="play-circle-outline" size={15} color={accent} style={{ marginRight: 6 }} />
        <Text style={[styles.continueTitle, { color: accent }]}>Continue Watching</Text>
        <View style={{ flex: 1 }} />
        {onClear ? (
          <TouchableOpacity onPress={onClear} hitSlop={8} style={styles.continueClearBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
            <Text style={styles.continueClearText}>CLEAR</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.continueRowContent}>
        {items.map((item) => (
          <TouchableOpacity key={item.id} onPress={() => onItemPress(item, null)} style={styles.continueCard} activeOpacity={0.8}>
            <FastImage uri={item.thumbnail} itemId={item.id} style={styles.continueThumb} contentFit="cover" />
            <Text style={styles.continueCardTitle} numberOfLines={1}>{item.title || 'Untitled'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
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
        <Text style={styles.shortsSubtitle}>quick bites — ads, trailers & reels under 3 minutes</Text>
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

// ── Catalog front door: SHOWS + MOVIES as compact direct destinations atop the wall.
// Routes into THE CATALOG (series cards → episodes in order / verified film grid) with
// no query — before this the catalog only existed behind the Search genre chips.
function CatalogDoorRow({ accent, contentW, onShows, onMovies }) {
  var cardW = Math.floor((contentW - spacing.screenPadding * 2 - 10) / 2);
  var doors = [
    { key: 'series', icon: 'albums-outline', voidIcon: 'type_tv_show', title: 'SHOWS', sub: 'series · episodes in order', onPress: onShows },
    { key: 'movies', icon: 'film-outline', voidIcon: 'type_movie', title: 'MOVIES', sub: 'the verified film catalog', onPress: onMovies },
  ];
  return (
    <View style={doorStyles.row}>
      {doors.map(function (d) {
        return (
          <Pressable
            key={d.key}
            onPress={d.onPress}
            style={[doorStyles.card, { width: cardW, borderColor: accent + '55' }]}
          >
            {hasVoidIcon(d.voidIcon)
              ? <VoidIcon name={d.voidIcon} size={26} />
              : <Ionicons name={d.icon} size={18} color={accent} />}
            <View style={{ flex: 1 }}>
              <Text style={[doorStyles.title, { color: accent }]}>{d.title}</Text>
              <Text style={doorStyles.sub}>{d.sub}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color={accent + '99'} />
          </Pressable>
        );
      })}
    </View>
  );
}

var doorStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.screenPadding, marginTop: 14, marginBottom: 4 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  title: { fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 2 },
  sub: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 0.8, marginTop: 2 },
});

// ── Spotlight Row: TV & Features — big visual entry points, always visible ──
// CURATED DOORS ONLY (B's ruling: "they still contain junk and that's not where that
// goes — we have areas to search that"). These cards used to feed from the raw machine
// crates (tv_movies / feature_length); now both the thumbnails AND the destinations are
// the VERIFIED catalog. Raw crates stay on the wall rows and in search — the hunt is
// untouched, the doors are clean.
function SpotlightRow({ accent, onItemPress, onShows, onMovies, contentW }) {
  var [doorSeries, setDoorSeries] = useState([]);
  var [doorMovies, setDoorMovies] = useState([]);
  useEffect(function () {
    var live = true;
    api.getCatalogSeries({ rows: 10 }).then(function (d) { if (live) setDoorSeries((d && d.items) || []); }).catch(function () {});
    api.getCatalogMovies({ rows: 10 }).then(function (d) { if (live) setDoorMovies((d && d.items) || []); }).catch(function () {});
    return function () { live = false; };
  }, []);

  var spots = [
    // Series previews aren't playable items (they're show cards) — every tap goes to the grid.
    { key: 'series', icon: 'tv-outline', title: 'TELEVISION', sub: 'Verified shows · episodes in order', items: doorSeries, go: onShows, playable: false },
    { key: 'movies', icon: 'film-outline', title: 'FULL LENGTH FILMS', sub: 'The verified film catalog', items: doorMovies, go: onMovies, playable: true },
  ].filter(function (s) { return s.items.length > 0; });

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
          // Pick 4 random thumbnails from the verified catalog for a mini preview strip
          var shuffled = spot.items.slice().sort(function () { return Math.random() - 0.5; });
          var hero = shuffled[0];
          var previews = shuffled.slice(1, 5);

          return (
            <Pressable
              key={spot.key}
              onPress={spot.go}
              style={[spotStyles.card, { width: cardW, height: cardH }]}
            >
              {/* Background thumbnail */}
              <FastImage
                uri={hero ? hero.thumbnail : ''}
                itemId={hero ? (hero.id || hero.key) : spot.key}
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
                            key={p.id || p.key}
                            onPress={spot.playable ? function () { onItemPress(p, 'catalog_movies'); } : spot.go}
                            activeOpacity={0.8}
                            style={spotStyles.previewThumb}
                          >
                            <FastImage
                              uri={p.thumbnail}
                              itemId={p.id || p.key}
                              style={spotStyles.previewImg}
                              contentFit="cover"
                            />
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={spot.go}
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

// DrawerMenu + its styles now live in components/DrawerMenu.js (shared, opened from the TopBar).

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
  // (chip bar styles removed — the desktop chip bar is gone)
  scrollArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  donateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND_BLUE, paddingHorizontal: 13, paddingVertical: 6, borderRadius: radius.full },
  donateText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.2, color: '#08080b' },
  // Continue Watching — compact small-card row
  continueBlock: { marginBottom: 10, paddingTop: 4 },
  continueHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginBottom: 8 },
  continueTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, letterSpacing: 0.3 },
  continueRowContent: { flexDirection: 'row', paddingHorizontal: spacing.screenPadding, gap: 10 },
  continueCard: { width: IS_DESKTOP ? 150 : 124 },
  continueThumb: { width: IS_DESKTOP ? 150 : 124, height: IS_DESKTOP ? 84 : 70, borderRadius: 6, backgroundColor: colors.card },
  continueCardTitle: { fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  continueClearBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2, paddingHorizontal: 4 },
  continueClearText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 1 },
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
