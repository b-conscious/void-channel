/**
 * TopBar — the persistent full-width header, shown on every screen (hidden on
 * the Player). Replaces the old desktop left sidebar.
 *
 * Layout: ☰ hamburger · VOIDtv logo (→Browse) · centered search (→Search,
 * desktop pill / mobile icon) · user (→drawer) or SIGN IN · ♥ DONATE.
 *
 * Rendered once at the Navigation level; `nav` is the synthesized navigation
 * object, `openDrawer` comes from the chrome context. Fixed-position on web,
 * absolute on native — content screens reserve `insets.top + headerH` of top
 * padding so nothing hides behind it.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Linking, StyleSheet, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import FastImage from './FastImage';
import { useGeneration } from '../context/GenerationContext';
import { useKids } from '../context/KidsContext';
import { useAuth } from '../context/AuthContext';
import { useSidebar, HEADER_H } from '../context/SidebarContext';
import { colors, fonts, radius, spacing } from '../theme';

const IS_DESKTOP = Platform.OS === 'web' && Dimensions.get('window').width > 900;
const DONATE_URL = 'https://square.link/u/dJioBmlW';
const BRAND_BLUE = '#5cb8ff';

export default function TopBar({ nav }) {
  const insets = useSafeAreaInsets();
  const { openDrawer } = useSidebar();
  const { gen } = useGeneration();
  const { user, isAuthenticated } = useAuth();
  const { kidsMode, kidsAccent } = useKids();
  const accent = kidsMode ? kidsAccent : (gen?.accentColor || colors.amber);

  // Search lives HERE now (Bryan) — a real input, not a navigate-then-type pill. Submitting
  // routes straight to the results screen with the query; that screen has no input of its own.
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false); // mobile: icon expands into an input
  const submitSearch = () => {
    const s = q.trim();
    if (s.length < 2) return;
    nav.navigate('Search', { q: s, _ts: Date.now() });
    if (!IS_DESKTOP) setSearchOpen(false);
  };

  // ── Mobile, search expanded: back · input · go ──
  if (!IS_DESKTOP && searchOpen) {
    return (
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <View style={styles.row}>
          <TouchableOpacity onPress={() => setSearchOpen(false)} style={styles.iconBtn} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={[styles.searchPill, { flex: 1, marginHorizontal: 8 }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={submitSearch}
              placeholder="Search VOIDtv"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              selectionColor={accent}
            />
            {q ? (
              <TouchableOpacity onPress={() => setQ('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity onPress={submitSearch} style={styles.iconBtn} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="arrow-forward-circle" size={24} color={accent} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {/* ── Left: hamburger + logo ── */}
        <View style={[styles.side, IS_DESKTOP && styles.sideFlex]}>
          <TouchableOpacity onPress={openDrawer} style={styles.hamburger} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="menu" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => nav.navigate('Browse')} activeOpacity={0.7}>
            <View style={styles.logoWrap}>
              <Text style={[styles.logoVoid, { color: accent }]}>VOID</Text>
              <Text style={styles.logoTv}>tv</Text>
              {kidsMode && <Text style={[styles.logoKids, { color: kidsAccent }]}> KIDS</Text>}
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Center: search input (desktop). KIDS: no raw search, the pill is gone ── */}
        {IS_DESKTOP && !kidsMode ? (
          <View style={[styles.searchPill, styles.desktopSearchBar]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={submitSearch}
              placeholder="Search VOIDtv"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              selectionColor={accent}
            />
            {q ? (
              <TouchableOpacity onPress={() => setQ('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* ── Right: search icon (mobile) + user + donate ── */}
        <View style={[styles.side, styles.sideRight, IS_DESKTOP && styles.sideFlex]}>
          {!IS_DESKTOP && !kidsMode && (
            <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.iconBtn} hitSlop={6} activeOpacity={0.7}>
              <Ionicons name="search" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          {isAuthenticated && user ? (
            <TouchableOpacity onPress={openDrawer} style={styles.userChip} activeOpacity={0.7}>
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
            <TouchableOpacity onPress={() => nav.navigate('Auth')} style={styles.signInChip} activeOpacity={0.7} hitSlop={6}>
              <Ionicons name="person-outline" size={12} color={colors.textMuted} />
              <Text style={styles.signInChipText}>SIGN IN</Text>
            </TouchableOpacity>
          )}
          {!kidsMode && (
            <TouchableOpacity onPress={() => Linking.openURL(DONATE_URL)} style={styles.donateBtn} hitSlop={8} activeOpacity={0.85}>
              <Ionicons name="heart" size={12} color="#08080b" style={{ marginRight: 5 }} />
              <Text style={styles.donateText}>DONATE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
    zIndex: 9999,
    paddingHorizontal: spacing.screenPadding,
  },
  row: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideFlex: { flex: 1 },                       // desktop: equal-width side cols center the search pill
  sideRight: { justifyContent: 'flex-end', gap: 8 },
  hamburger: { padding: 4 },
  iconBtn: { padding: 4 },
  logoWrap: { flexDirection: 'row', alignItems: 'baseline' },
  logoKids: { fontFamily: fonts.monoBold, fontSize: 15, letterSpacing: 1.5 },
  logoVoid: { fontFamily: fonts.monoBold, fontSize: 18, letterSpacing: 4 },
  logoTv: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, letterSpacing: 0.5 },

  // Search pill (YouTube style) — holds a real TextInput on both platforms
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  desktopSearchBar: { flex: 1, maxWidth: 540, marginHorizontal: 24 },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },

  // User chip — avatar + name
  userChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingRight: 8, paddingLeft: 2, paddingVertical: 2,
    borderRadius: radius.full, backgroundColor: colors.surface,
  },
  userAvatar: { width: 24, height: 24, borderRadius: 12 },
  userAvatarGlyph: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  userAvatarGlyphText: { fontFamily: fonts.monoBold, fontSize: 11 },
  userChipName: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.textPrimary, letterSpacing: 0.5, maxWidth: 80 },
  signInChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface,
  },
  signInChipText: { fontFamily: fonts.mono, fontSize: 8, color: colors.textMuted, letterSpacing: 0.8 },
  donateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND_BLUE, paddingHorizontal: 13, paddingVertical: 6, borderRadius: radius.full },
  donateText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.2, color: '#08080b' },
});
