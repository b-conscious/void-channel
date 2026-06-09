/**
 * DesktopSidebar — YouTube-style persistent left navigation for desktop web.
 *
 * Rendered via Tab.Navigator's `tabBar` prop on desktop (SCREEN_W > 900).
 * Receives { state, navigation, descriptors } from React Navigation.
 * Uses position:fixed on web so it stays visible while scrolling.
 *
 * Mapping to YouTube sidebar:
 *   Browse   → Home
 *   Search   → Search
 *   Signal   → Subscriptions / Explore
 *   You >    → History, Playlists, Saved, Hearted, Downloads
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../theme';
import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';

var SIDEBAR_NAV_W = 220;
var BRAND_BLUE = '#5cb8ff';
var DONATE_URL = 'https://square.link/u/IteDL7XI';

var TAB_COLORS = {
  Browse:    '#5cb8ff',
  Search:    '#b566ff',
  Signal:    '#4ade80',
  'My Void': '#f5a623',
};

var NAV_ITEMS = [
  { name: 'Browse', icon: 'tv-outline', iconFocused: 'tv', label: 'Browse' },
  { name: 'Search', icon: 'search-outline', iconFocused: 'search', label: 'Search' },
  { name: 'Signal', icon: 'compass-outline', iconFocused: 'compass', label: 'Signal' },
];

var YOU_ITEMS = [
  { icon: 'time-outline', label: 'History', tab: 'My Void' },
  { icon: 'albums-outline', label: 'Playlists', screen: 'Playlists' },
  { icon: 'bookmark-outline', label: 'Saved', tab: 'My Void' },
  { icon: 'heart-outline', label: 'Hearted', tab: 'My Void' },
  { icon: 'download-outline', label: 'Downloads', tab: 'My Void' },
];

export { SIDEBAR_NAV_W };

export default function DesktopSidebar({ state, navigation }) {
  var activeIndex = state?.index ?? 0;
  var activeRoute = state?.routes?.[activeIndex]?.name || 'Browse';
  var { gen } = useGeneration();
  var { user, isAuthenticated } = useAuth();
  var { rank, xp } = useGame();
  var accent = gen?.accentColor || colors.amber;

  function handleTabPress(name) {
    navigation.navigate(name);
  }

  function handleStackPress(screen) {
    // Navigate to a Stack screen above the tab navigator
    var parent = navigation.getParent?.();
    if (parent) {
      parent.navigate(screen);
    } else {
      navigation.navigate(screen);
    }
  }

  return (
    <View style={styles.sidebar}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo ── */}
        <View style={styles.logoSection}>
          <View style={styles.logoRow}>
            <Text style={[styles.logoVoid, { color: accent }]}>VOID</Text>
            <Text style={styles.logoCh}> CHANNEL</Text>
          </View>
          <Text style={[styles.tagline, { color: BRAND_BLUE }]}>GENERATING SINCE 1895</Text>
        </View>

        {/* ── Main nav tabs ── */}
        {NAV_ITEMS.map(function (item) {
          var isActive = activeRoute === item.name;
          var color = TAB_COLORS[item.name] || colors.textSecondary;
          return (
            <TouchableOpacity
              key={item.name}
              onPress={function () { handleTabPress(item.name); }}
              style={[styles.navItem, isActive && { backgroundColor: color + '15' }]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? item.iconFocused : item.icon}
                size={20}
                color={isActive ? color : colors.textSecondary}
              />
              <Text style={[
                styles.navLabel,
                isActive && { color: colors.textPrimary, fontFamily: fonts.sansSemiBold },
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        <View style={styles.separator} />

        {/* ── You section (YouTube pattern) ── */}
        <TouchableOpacity
          onPress={function () { handleTabPress('My Void'); }}
          style={styles.sectionHeaderRow}
          activeOpacity={0.7}
        >
          <Text style={[styles.sectionHeader, activeRoute === 'My Void' && { color: TAB_COLORS['My Void'] }]}>
            You
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>

        {YOU_ITEMS.map(function (item) {
          return (
            <TouchableOpacity
              key={item.label}
              onPress={function () {
                if (item.screen) { handleStackPress(item.screen); }
                else { handleTabPress(item.tab); }
              }}
              style={styles.quickLink}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}

        <View style={styles.separator} />

        {/* ── Explore section ── */}
        <Text style={styles.sectionHeader}>Explore</Text>
        <TouchableOpacity
          onPress={function () { handleTabPress('Browse'); }}
          style={styles.quickLink}
          activeOpacity={0.7}
        >
          <Ionicons name="flame-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.quickLabel}>Trending</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={function () { handleTabPress('Signal'); }}
          style={styles.quickLink}
          activeOpacity={0.7}
        >
          <Ionicons name="radio-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.quickLabel}>Discovery</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* ── User section ── */}
        {isAuthenticated && user ? (
          <View style={styles.userSection}>
            <View style={[styles.userAvatar, { backgroundColor: accent + '30' }]}>
              <Text style={[styles.userAvatarText, { color: accent }]}>
                {(user.username || user.display_name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userName} numberOfLines={1}>
              {user.username || user.display_name || 'void dweller'}
            </Text>
            <View style={styles.rankRow}>
              <Text style={[styles.rankText, { color: accent }]}>
                {(rank && rank.label) ? rank.label.toUpperCase() : 'WANDERER'}
              </Text>
              <Text style={styles.xpText}>
                {(xp || 0).toLocaleString()} XP
              </Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={function () { handleStackPress('Auth'); }}
            style={styles.signInRow}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={18} color={accent} />
            <Text style={[styles.signInText, { color: accent }]}>Sign in</Text>
          </TouchableOpacity>
        )}

        {/* ── Support ── */}
        <TouchableOpacity
          onPress={function () { Linking.openURL(DONATE_URL); }}
          style={styles.supportRow}
          activeOpacity={0.7}
        >
          <Ionicons name="gift" size={18} color={BRAND_BLUE} />
          <View style={{ flex: 1 }}>
            <Text style={styles.supportText}>Support Human Creations</Text>
            <Text style={styles.supportSub}>fight the AI slop</Text>
          </View>
        </TouchableOpacity>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>VOID CHANNEL v0.3</Text>
          <Text style={styles.footerText}>source: archive.org</Text>
        </View>
      </ScrollView>
    </View>
  );
}

var styles = StyleSheet.create({
  sidebar: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_NAV_W,
    backgroundColor: colors.bg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.surface,
    zIndex: 50,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Logo
  logoSection: { paddingHorizontal: 18, marginBottom: 22 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoVoid: { fontFamily: fonts.monoBold, fontSize: 16, letterSpacing: 3 },
  logoCh: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
  tagline: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.5, marginTop: 4 },

  // Nav items (tabs)
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: radius.lg, marginHorizontal: 8, marginBottom: 2,
  },
  navLabel: {
    fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, lineHeight: 20,
  },

  separator: {
    height: StyleSheet.hairlineWidth, backgroundColor: colors.surface,
    marginVertical: 14, marginHorizontal: 18,
  },

  // Section headers (You, Explore)
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 18, paddingVertical: 4, marginBottom: 4,
  },
  sectionHeader: {
    fontFamily: fonts.sansMedium, fontSize: 16, color: colors.textPrimary, lineHeight: 22,
    paddingHorizontal: 18, marginBottom: 6,
  },

  // Quick links (You items, Explore items)
  quickLink: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 8, paddingHorizontal: 18,
    borderRadius: radius.lg, marginHorizontal: 8, marginBottom: 1,
  },
  quickLabel: {
    fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, lineHeight: 20,
  },

  // User
  userSection: { paddingHorizontal: 18, marginBottom: 14 },
  userAvatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  userAvatarText: { fontFamily: fonts.monoBold, fontSize: 14 },
  userName: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5 },
  xpText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost },

  signInRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 8, marginBottom: 12,
  },
  signInText: { fontFamily: fonts.sansMedium, fontSize: 14 },

  // Support
  supportRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 8, marginBottom: 8,
  },
  supportText: { fontFamily: fonts.sansMedium, fontSize: 12, color: '#f5a623' },
  supportSub: { fontFamily: fonts.sans, fontSize: 10, color: '#39ff14', marginTop: 1 },

  // Footer
  footer: { marginTop: 12, paddingHorizontal: 18 },
  footerText: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost,
    letterSpacing: 0.5, textAlign: 'center', marginTop: 3,
  },
});
