/**
 * DrawerMenu — the hamburger nav drawer, shared across every screen.
 *
 * Was a local component inside HomeScreen; lifted out so the persistent TopBar's
 * hamburger can open it everywhere. Visibility is driven by the chrome context
 * (useSidebar → drawerOpen / closeDrawer); user/generation come from context;
 * navigation is the synthesized `nav` object passed from the Navigation level.
 *
 * Decoupled from Home's category chips: "18+" and the Browse reset navigate to
 * Browse with a `chip` param, which HomeScreen reads to set its active chip.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from './FastImage';
import AvatarPickerModal from './AvatarPickerModal';
import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import { GENERATIONS } from '../data/generations';
import api from '../api/client';
import { colors, fonts, radius } from '../theme';

const DONATE_URL = 'https://square.link/u/dJioBmlW';
const BRAND_BLUE = '#5cb8ff';
const ADMIN_EMAILS = ['bryankorth31@gmail.com', 'preacherb@cashvalues.org'];

export default function DrawerMenu({ nav }) {
  const { drawerOpen, closeDrawer } = useSidebar();
  const { gen, generationId, chooseGeneration } = useGeneration();
  const { user, isAuthenticated, signOut, updateProfile } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const accent = gen?.accentColor || colors.amber;

  const GEN_OPTS = [
    { id: 'boomer', label: 'BOOMER', color: GENERATIONS.boomer.accentColor },
    { id: 'millennial', label: 'MILLENNIAL', color: GENERATIONS.millennial.accentColor },
    { id: 'genz', label: 'GEN Z', color: GENERATIONS.genz.accentColor },
  ];

  // (SEARCH removed — search lives in the TopBar's input on every screen.)
  const menuItems = [
    { icon: 'tv', label: 'THE VAULT', tab: 'Browse' },
    { icon: 'compass', label: 'SIGNAL', tab: 'Signal' },
    { icon: 'bookmark', label: 'MY VOID', tab: 'My Void' },
  ];

  async function handleRandom() {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    closeDrawer();
    try { const ri = await api.getRandomItem(); nav.navigate('Player', { item: ri, id: ri.id }); } catch {}
  }

  return (
    <>
      <Modal transparent visible={drawerOpen} animationType="fade" onRequestClose={closeDrawer}>
        <Pressable style={drawerStyles.overlay} onPress={closeDrawer}>
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
                <TouchableOpacity onPress={() => { closeDrawer(); setAvatarOpen(true); }} style={drawerStyles.userRow} activeOpacity={0.7}>
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
                <TouchableOpacity onPress={() => { closeDrawer(); signOut?.(); }} style={drawerStyles.signOutBtn} activeOpacity={0.7}>
                  <Ionicons name="log-out-outline" size={14} color={colors.textMuted} />
                  <Text style={drawerStyles.signOutText}>SIGN OUT</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => { closeDrawer(); nav.navigate('Auth'); }}
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
                onPress={() => { closeDrawer(); nav.navigate(item.tab, item.tab === 'Browse' ? { chip: 'all' } : undefined); }}
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
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
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
            <TouchableOpacity style={drawerStyles.menuItem} onPress={handleRandom} activeOpacity={0.7}>
              <Ionicons name="shuffle" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>SURPRISE ME</Text>
            </TouchableOpacity>

            {/* 18+ — mature rows are sequestered off the default wall; reachable here on purpose (not censored) */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { closeDrawer(); nav.navigate('Browse', { chip: 'mature' }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="warning-outline" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>18+  BEHIND CLOSED DOORS</Text>
            </TouchableOpacity>

            <View style={drawerStyles.divider} />

            {/* Account */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { closeDrawer(); nav.navigate('Auth'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="person-circle-outline" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>ACCOUNT</Text>
            </TouchableOpacity>

            {/* Admin — only visible to admin emails */}
            {isAuthenticated && user && ADMIN_EMAILS.includes((user.email || '').toLowerCase()) && (
              <TouchableOpacity
                style={drawerStyles.menuItem}
                onPress={() => { closeDrawer(); nav.navigate('Admin'); }}
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

      {/* Avatar picker — lifted in with the drawer so "tap to change avatar" works app-wide */}
      <AvatarPickerModal
        visible={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        accent={accent}
        currentAvatar={user?.avatar_url}
        onSelect={async (avatar) => {
          const url = avatar.url || `glyph:${avatar.glyph}`;
          await updateProfile({ avatar_url: url });
        }}
      />
    </>
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
