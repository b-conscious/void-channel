import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, Animated, TouchableOpacity, Pressable, Modal, Linking,
  StyleSheet, Dimensions, Image, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import CategoryRow from '../components/CategoryRow';
import SkeletonCard from '../components/SkeletonCard';
import { useGeneration } from '../context/GenerationContext';
import { GENERATIONS } from '../data/generations';
import api from '../api/client';
import store from '../store/cache';
import { colors, fonts, spacing, radius } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = Math.round(SCREEN_W * 0.62);

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen, generationId, chooseGeneration } = useGeneration();
  const [menuOpen, setMenuOpen] = useState(false);
  const [allCategories, setAllCategories] = useState([]);
  const [catPage, setCatPage] = useState(0);
  const CATS_PER_PAGE = 5;
  const [loading, setLoading] = useState(true);
  const [serverSleeping, setServerSleeping] = useState(false);
  const [waking, setWaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [heroItem, setHeroItem] = useState(null);
  const [topHearts, setTopHearts] = useState([]);
  // Re-pick when generation changes so taglines/loading msgs match the active gen
  const tagline = useMemo(() => pickRandom(gen.taglines), [gen.id]);
  const loadingMsg = useMemo(() => pickRandom(gen.loadingMessages), [gen.id]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const accent = gen.accentColor;

  // Paginate: show CATS_PER_PAGE "type" categories at a time
  const typeCats = useMemo(() => allCategories.filter((c) => !c.group || c.group === 'type'), [allCategories]);
  const deepCats = useMemo(() => allCategories.filter((c) => c.group === 'deep'), [allCategories]);
  const showCats = useMemo(() => allCategories.filter((c) => c.group === 'show'), [allCategories]);
  const decadeCats = useMemo(() => allCategories.filter((c) => c.group === 'decade'), [allCategories]);
  const visibleTypeCats = useMemo(() => {
    const start = catPage * CATS_PER_PAGE;
    return typeCats.slice(start, start + CATS_PER_PAGE);
  }, [typeCats, catPage]);
  const totalTypePages = Math.max(1, Math.ceil(typeCats.length / CATS_PER_PAGE));

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

  const loadCategories = useCallback(async (mode = "open") => {
    // mode: "open" → fetch shuffled but show cache first if present (fast)
    //       "repopulate" → bust cache + fetch a totally fresh shuffled batch
    const forceFresh = mode === "repopulate";
    try {
      if (!forceFresh) {
        // Show cache instantly while we fetch a fresh shuffled batch in background
        const cached = await store.getCachedCategories();
        if (cached) {
          setAllCategories(cached);
          setLoading(false);
          pickHero(cached);
          api.getCategories({ shuffle: true }).then((fresh) => {
            setAllCategories(fresh);
            store.setCachedCategories(fresh);
            pickHero(fresh);
          }).catch(() => {});
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
    console.log('[WakeUp] Pinging /health...');
    try {
      const health = await api.wakeUp();
      console.log('[WakeUp] Server responded:', health);
    } catch (err) {
      console.warn('[WakeUp] Health ping failed:', err.message);
      // Don't bail — server might still be partially awake
    }
    // Server should be warm now — try loading categories
    console.log('[WakeUp] Loading categories...');
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

  // Load the global community hearts library (top-hearted items across all users)
  useEffect(() => {
    api.getTopHearts(20)
      .then(setTopHearts)
      .catch(() => setTopHearts([]));
  }, [refreshing]); // re-fetch on repopulate too

  const handleItemPress = useCallback((item, categoryId) => {
    navigation.navigate('Player', { item, categoryId });
  }, [navigation]);

  // Launch a category as a continuously-playing channel
  const handleChannelPress = useCallback((cat, label) => {
    if (!cat?.items?.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Player', {
      item: cat.items[0],
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
    navigation.navigate('Player', { item: heroItem, categoryId: heroCategoryIdRef.current });
  }, [heroItem, navigation]);

  const handleRandom = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { navigation.navigate('Player', { item: await api.getRandomItem() }); } catch {}
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Floating header (fades as you scroll) */}
      <Animated.View
        style={[styles.floatingHeader, { paddingTop: insets.top + 8, opacity: headerAnim }]}
        pointerEvents="box-none"
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.hamburger} hitSlop={8}>
            <Ionicons name="menu" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.logoWrap}>
            <Text style={[styles.logoVoid, { color: accent }]}>VOID</Text>
            <Text style={styles.logoCh}> CH.</Text>
            <View style={[styles.liveIndicator, { backgroundColor: '#ff2d78' }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleRandom} style={[styles.randomBtn, { backgroundColor: accent }]} hitSlop={8}>
          <Ionicons name="shuffle" size={12} color={gen.accentOnDark} style={{ marginRight: 4 }} />
          <Text style={[styles.randomText, { color: gen.accentOnDark }]}>SURPRISE ME</Text>
        </TouchableOpacity>
      </Animated.View>

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
      />

      <Animated.ScrollView
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
              <Text style={styles.dividerText}>BROWSE</Text>
              <View style={styles.dividerLine} />
            </View>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
          </>
        ) : (
          <>
            {/* By type — paginated, 5 at a time */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>BROWSE BY TYPE</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Retune controls */}
            <View style={styles.retuneRow}>
              <TouchableOpacity
                onPress={() => handleRetune('up')}
                style={[styles.retuneBtn, { borderColor: accent }]}
                activeOpacity={0.75}
              >
                <Ionicons name="chevron-up" size={14} color={accent} style={{ marginRight: 5 }} />
                <Text style={[styles.retuneText, { color: accent }]}>RETUNE UP</Text>
              </TouchableOpacity>

              <Text style={styles.retunePageText}>
                {catPage + 1} / {totalTypePages}
              </Text>

              <TouchableOpacity
                onPress={() => handleRetune('down')}
                style={[styles.retuneBtn, { borderColor: accent }]}
                activeOpacity={0.75}
              >
                <Text style={[styles.retuneText, { color: accent }]}>RETUNE DOWN</Text>
                <Ionicons name="chevron-down" size={14} color={accent} style={{ marginLeft: 5 }} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleRepopulate}
              style={[styles.repopulateBtn, { borderColor: accent }]}
              activeOpacity={0.75}
              disabled={refreshing}
            >
              <Ionicons
                name={refreshing ? "sync" : "shuffle"}
                size={14}
                color={accent}
                style={{ marginRight: 7 }}
              />
              <Text style={[styles.repopulateText, { color: accent }]}>
                {refreshing ? "TUNING IN NEW SIGNAL..." : "REPOPULATE — GIVE ME NEW STUFF"}
              </Text>
            </TouchableOpacity>

            {visibleTypeCats.map((cat) => (
              <CategoryRow key={cat.id} category={cat} onItemPress={handleItemPress} />
            ))}

            {/* Deep cuts — granular sub-categories */}
            {deepCats.length > 0 && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>DEEP CUTS</Text>
                  <View style={styles.dividerLine} />
                </View>
                {deepCats.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} onItemPress={handleItemPress} />
                ))}
              </>
            )}

            {/* By show / series */}
            {showCats.length > 0 && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>BROWSE BY SHOW</Text>
                  <View style={styles.dividerLine} />
                </View>
                {showCats.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} onItemPress={handleItemPress} />
                ))}
              </>
            )}

            {/* By decade */}
            {decadeCats.length > 0 && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>BROWSE BY DECADE</Text>
                  <View style={styles.dividerLine} />
                </View>
                {decadeCats.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} onItemPress={handleItemPress} />
                ))}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 90 }]}>
          <Text style={styles.footerLine}>◈ SOURCE: ARCHIVE.ORG — PUBLIC DOMAIN & CC ◈</Text>
          <Text style={styles.footerLine}>all these films were made by real people</Text>
          <Text style={styles.footerLine}>for reasons we can only guess at</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://square.link/u/IteDL7XI')}
            style={styles.footerDonate}
            activeOpacity={0.7}
          >
            <Text style={[styles.footerLine, { color: '#ff2d78', fontStyle: 'normal' }]}>
              ♥ Support Void Channel
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function HeroCard({ item, loading, insetTop, loadingMsg, tagline, gen, accent, onPress, onRandom }) {
  const totalH = HERO_H + insetTop + 70;

  if (loading && !item) {
    return (
      <View style={{ height: totalH, backgroundColor: colors.card }}>
        <View style={[styles.heroLoadingBlock, { paddingTop: insetTop + 20 }]}>
          <Text style={[styles.heroLoadingMsg, { color: accent }]}>{loadingMsg}</Text>
          <Text style={styles.heroLoadingTagline}>{tagline}</Text>
        </View>
        <LinearGradient colors={['transparent', colors.bg]} locations={[0.7, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      </View>
    );
  }
  if (!item) return null;

  const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;

  return (
    <Pressable onPress={onPress} style={{ height: totalH }}>
      <Image source={{ uri: item.thumbnail }} style={{ width: SCREEN_W, height: totalH }} resizeMode="cover" />
      <ScanlineOverlay height={totalH} />
      <LinearGradient
        colors={['rgba(12,12,15,0.2)', 'transparent', 'rgba(12,12,15,0.55)', 'rgba(12,12,15,0.97)', colors.bg]}
        locations={[0, 0.25, 0.55, 0.85, 1]}
        style={[StyleSheet.absoluteFill, { height: totalH }]}
        pointerEvents="none"
      />
      <View style={[styles.heroContent, { paddingTop: insetTop + 60 }]}>
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

// Channels row — looks like TV channel preview tiles
function ChannelsRow({ categories, accent, onChannelPress }) {
  const channelDefs = [
    { catId: "cartoons",  label: "CARTOON CHANNEL", icon: "★" },
    { catId: "scifi",     label: "SCI-FI CHANNEL",  icon: "◈" },
  ];

  const channels = channelDefs
    .map((def) => ({
      ...def,
      category: categories.find((c) => c.id === def.catId),
    }))
    .filter((ch) => ch.category?.items?.length > 0);

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
            key={ch.catId}
            onPress={() => onChannelPress(ch.category, ch.label)}
            style={styles.channelTile}
          >
            {/* Thumbnail collage preview */}
            <View style={styles.thumbStack}>
              {ch.category.items.slice(0, 3).map((it, i) => (
                <Image
                  key={it.id}
                  source={{ uri: it.thumbnail }}
                  style={[
                    styles.thumbStackImg,
                    { left: i * 22, zIndex: 3 - i, opacity: 1 - i * 0.18 },
                  ]}
                  resizeMode="cover"
                />
              ))}
            </View>
            <LinearGradient
              colors={["rgba(12,12,15,0)", "rgba(12,12,15,0.85)", "rgba(12,12,15,1)"]}
              locations={[0.2, 0.7, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.channelTileContent}>
              <View style={[styles.liveBadge, { backgroundColor: accent }]}>
                <View style={styles.liveBadgeDot} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
              <Text style={styles.channelTileLabel} numberOfLines={1}>{ch.label}</Text>
              <Text style={styles.channelTileSub}>
                {ch.category.items.length} items · auto-advance
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
    <View style={[StyleSheet.absoluteFill, { height, overflow: 'hidden' }]} pointerEvents="none">
      {Array.from({ length: Math.ceil(height / 4) }).map((_, i) =>
        i % 2 === 0
          ? <View key={i} style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.16)' }} />
          : <View key={i} style={{ height: 3 }} />
      )}
    </View>
  );
}

function DrawerMenu({ visible, onClose, accent, gen, generationId, chooseGeneration, navigation, onRandom }) {
  if (!visible) return null;

  const GEN_OPTS = [
    { id: 'boomer', label: 'BOOMER', color: GENERATIONS.boomer.accentColor },
    { id: 'millennial', label: 'MILLENNIAL', color: GENERATIONS.millennial.accentColor },
    { id: 'genz', label: 'GEN Z', color: GENERATIONS.genz.accentColor },
  ];

  const menuItems = [
    { icon: 'tv', label: 'BROWSE', tab: 'Browse' },
    { icon: 'search', label: 'SEARCH', tab: 'Search' },
    { icon: 'compass', label: 'SIGNAL', tab: 'Signal' },
    { icon: 'bookmark', label: 'MY VOID', tab: 'My Void' },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={drawerStyles.overlay} onPress={onClose}>
        <Pressable style={drawerStyles.drawer} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={drawerStyles.drawerHeader}>
            <Text style={[drawerStyles.drawerLogo, { color: accent }]}>VOID</Text>
            <Text style={drawerStyles.drawerLogoSub}> CHANNEL</Text>
          </View>

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

          {/* Support */}
          <TouchableOpacity
            style={drawerStyles.supportBtn}
            onPress={() => Linking.openURL('https://square.link/u/IteDL7XI')}
            activeOpacity={0.7}
          >
            <Ionicons name="heart" size={16} color="#ff2d78" style={{ width: 28 }} />
            <Text style={[drawerStyles.menuLabel, { color: '#ff2d78' }]}>SUPPORT VOID CH.</Text>
          </TouchableOpacity>
          <Text style={drawerStyles.supportSub}>
            Help keep the signal alive — donations go toward hosting & curation.
          </Text>

          {/* Footer */}
          <View style={{ flex: 1 }} />
          <Text style={drawerStyles.footerText}>VOID CHANNEL v0.3</Text>
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
    flexDirection: 'row', alignItems: 'baseline',
    marginBottom: 28, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  drawerLogo: { fontFamily: fonts.monoBold, fontSize: 20, letterSpacing: 4 },
  drawerLogoSub: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted, letterSpacing: 1 },
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
  supportSub: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, marginLeft: 32, marginTop: -6, lineHeight: 16 },
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
  floatingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.screenPadding, paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hamburger: { padding: 4 },
  scroll: { flex: 1 },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoVoid: { fontFamily: fonts.monoBold, fontSize: 18, letterSpacing: 4 },
  logoCh: { fontFamily: fonts.mono, fontSize: 14, color: colors.textSecondary, letterSpacing: 1 },
  liveIndicator: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontFamily: fonts.monoBold, fontSize: 9, color: '#ff2d78', letterSpacing: 1.5 },
  randomBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  randomText: { fontFamily: fonts.monoBold, fontSize: 9, letterSpacing: 1.2 },
  heroContent: { ...StyleSheet.absoluteFillObject, paddingHorizontal: spacing.screenPadding, paddingBottom: 20, justifyContent: 'space-between' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroEyebrow: { fontFamily: fonts.monoBold, fontSize: 8, letterSpacing: 2, marginBottom: 8 },
  heroTitle: { fontFamily: fonts.sansSemiBold, fontSize: 26, color: '#fff', lineHeight: 31, marginBottom: 6 },
  heroCreator: { fontFamily: fonts.sans, fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
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

  divider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPadding, marginVertical: 20, gap: 10 },
  retuneRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, marginTop: -4, marginBottom: 10,
  },
  retuneBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1,
  },
  retuneText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 },
  retunePageText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
  repopulateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: -8,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  repopulateText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.surface },
  dividerText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, letterSpacing: 2 },
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

  footer: { paddingHorizontal: spacing.screenPadding, paddingTop: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface, marginTop: 12, gap: 3 },
  footerLine: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },
  footerDonate: { marginTop: 14, paddingVertical: 8 },
});
