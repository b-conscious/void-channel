/**
 * DesktopSidebar — YouTube-style persistent left navigation for desktop web.
 *
 * Collapsible: expanded (150px) shows icons + labels + sections,
 * collapsed (56px) shows just icon rail. Toggle via hamburger button.
 *
 * Search removed from sidebar — search bar lives in the header permanently.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../theme';
import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { useSidebar, EXPANDED_W, COLLAPSED_W } from '../context/SidebarContext';

var BRAND_BLUE = '#5cb8ff';
var DONATE_URL = 'https://square.link/u/dJioBmlW';

var TAB_COLORS = {
  Browse:    '#5cb8ff',
  Search:    '#b566ff',
  Signal:    '#4ade80',
  'My Void': '#f5a623',
};

// Main nav — Search removed (search bar is always in header)
var NAV_ITEMS = [
  { name: 'Browse', icon: 'tv-outline', iconFocused: 'tv', label: 'Browse' },
  { name: 'Signal', icon: 'compass-outline', iconFocused: 'compass', label: 'Signal' },
];

var YOU_ITEMS = [
  { icon: 'time-outline', label: 'History', tab: 'My Void' },
  { icon: 'albums-outline', label: 'Playlists', screen: 'Playlists' },
  { icon: 'bookmark-outline', label: 'Saved', tab: 'My Void' },
  { icon: 'heart-outline', label: 'Hearted', tab: 'My Void' },
  { icon: 'download-outline', label: 'Downloads', tab: 'My Void' },
];

// Collapsed icon rail items — includes My Void
var RAIL_ITEMS = [
  { name: 'Browse', icon: 'tv-outline', iconFocused: 'tv' },
  { name: 'Signal', icon: 'compass-outline', iconFocused: 'compass' },
  { name: 'My Void', icon: 'bookmark-outline', iconFocused: 'bookmark' },
];

export default function DesktopSidebar({ state, navigation }) {
  var { collapsed, sidebarWidth, toggleSidebar } = useSidebar();
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
    var parent = navigation.getParent?.();
    if (parent) {
      parent.navigate(screen);
    } else {
      navigation.navigate(screen);
    }
  }

  // ── Collapsed: just a small expand arrow at the left edge ──
  if (collapsed) {
    return (
      <View style={[styles.sidebar, { width: COLLAPSED_W, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 12 }]}>
        <TouchableOpacity onPress={toggleSidebar} style={styles.collapseArrow} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Expanded: full sidebar ──
  return (
    <View style={[styles.sidebar, { width: EXPANDED_W }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Toggle — collapse to arrow */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={toggleSidebar} style={styles.toggleBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Logo — clickable, navigates to Browse ── */}
        <TouchableOpacity onPress={function () { handleTabPress('Browse'); }} style={styles.logoSection} activeOpacity={0.7}>
          <View style={styles.logoRow}>
            <Text style={[styles.logoVoid, { color: accent }]}>VOID</Text>
            <Text style={styles.logoTv}>tv</Text>
          </View>
        </TouchableOpacity>

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

        {/* ── You section ── */}
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
          <Text style={[styles.footerText, { color: '#f5a623', marginBottom: 1 }]}>A project of</Text>
          <Text style={[styles.footerText, { color: '#f5a623', fontFamily: fonts.monoBold, fontSize: 7.5, letterSpacing: 0.3 }]}>Church of American</Text>
          <Text style={[styles.footerText, { color: '#f5a623', fontFamily: fonts.monoBold, fontSize: 7.5, letterSpacing: 0.3 }]}>Strength & Hope</Text>
          <TouchableOpacity onPress={function () { Linking.openURL('https://cashvalues.org'); }} activeOpacity={0.7}>
            <Text style={[styles.footerText, { color: BRAND_BLUE, textDecorationLine: 'underline', marginTop: 2 }]}>CASHvalues.org</Text>
          </TouchableOpacity>
          <Text style={[styles.footerText, { marginTop: 4 }]}>VOIDtv v0.3</Text>
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
    backgroundColor: colors.bg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.surface,
    zIndex: 50,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 40,
  },

  // Toggle button
  topRow: { paddingHorizontal: 12, marginBottom: 4 },
  toggleBtn: {
    width: 36, height: 36, borderRadius: radius.lg,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 8, marginBottom: 4,
  },

  // Logo
  logoSection: { paddingHorizontal: 12, marginBottom: 14 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoVoid: { fontFamily: fonts.monoBold, fontSize: 16, letterSpacing: 2.5 },
  logoTv: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5 },

  // Nav items (tabs)
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, paddingHorizontal: 12,
    borderRadius: radius.lg, marginHorizontal: 4, marginBottom: 2,
  },
  navLabel: {
    fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, lineHeight: 18,
  },

  separator: {
    height: StyleSheet.hairlineWidth, backgroundColor: colors.surface,
    marginVertical: 12, marginHorizontal: 12,
  },

  // Section headers
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 4, marginBottom: 4,
  },
  sectionHeader: {
    fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary, lineHeight: 20,
    paddingHorizontal: 12, marginBottom: 6,
  },

  // Quick links
  quickLink: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: radius.lg, marginHorizontal: 4, marginBottom: 1,
  },
  quickLabel: {
    fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, lineHeight: 18,
  },

  // User
  userSection: { paddingHorizontal: 12, marginBottom: 14 },
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
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
  },
  signInText: { fontFamily: fonts.sansMedium, fontSize: 13 },

  // Support — wraps at narrow width
  supportRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
  },
  supportText: { fontFamily: fonts.sansMedium, fontSize: 11, color: '#f5a623', lineHeight: 15 },
  supportSub: { fontFamily: fonts.sans, fontSize: 10, color: '#39ff14', marginTop: 2 },

  // Footer
  footer: { marginTop: 12, paddingHorizontal: 12 },
  footerText: {
    fontFamily: fonts.mono, fontSize: 8, color: colors.textGhost,
    letterSpacing: 0.5, textAlign: 'center', marginTop: 3,
  },

  // Collapsed: minimal expand arrow
  collapseArrow: {
    width: 24, height: 24,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
});
