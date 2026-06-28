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
import { View, Text, TouchableOpacity, Pressable, Modal, Linking, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import FastImage from './FastImage';
import AvatarPickerModal from './AvatarPickerModal';
import { useGeneration } from '../context/GenerationContext';
import { useKids } from '../context/KidsContext';
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
  const { user, isAuthenticated, isAnonymous, signOut, updateProfile } = useAuth();
  const { kidsMode, kidsAccent, enterKids, exitKids } = useKids();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const accent = kidsMode ? kidsAccent : (gen?.accentColor || colors.amber);

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

  // VOIDtv KIDS: the drawer is the gate's front door. In kids mode it holds exactly two
  // things: the safe shelf and the parent-gated exit. Nothing else exists.
  if (kidsMode) {
    return (
      <Modal transparent visible={drawerOpen} animationType="fade" onRequestClose={closeDrawer}>
        <Pressable style={drawerStyles.overlay} onPress={closeDrawer}>
          <Pressable style={drawerStyles.drawer} onPress={(e) => e.stopPropagation()}>
            <View style={drawerStyles.drawerHeader}>
              <View style={drawerStyles.drawerLogoRow}>
                <Text style={[drawerStyles.drawerLogo, { color: kidsAccent }]}>VOID</Text>
                <Text style={drawerStyles.drawerLogoSub}>tv KIDS</Text>
              </View>
              <Text style={[drawerStyles.drawerTagline, { color: kidsAccent }]}>the safe shelf</Text>
            </View>
            <View style={drawerStyles.divider} />
            <TouchableOpacity style={drawerStyles.menuItem} onPress={() => { closeDrawer(); nav.navigate('Browse', { chip: 'all' }); }} activeOpacity={0.7}>
              <Ionicons name="tv" size={18} color={kidsAccent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>THE VAULT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={drawerStyles.menuItem} onPress={() => { if (exitKids()) closeDrawer(); }} activeOpacity={0.7}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>EXIT KIDS MODE  (PARENTS)</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <Text style={drawerStyles.footerText}>VOIDtv KIDS · curated shelf only</Text>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <>
      <Modal transparent visible={drawerOpen} animationType="fade" onRequestClose={closeDrawer}>
        <Pressable style={drawerStyles.overlay} onPress={closeDrawer}>
          <Pressable style={drawerStyles.drawer} onPress={(e) => e.stopPropagation()}>
            {/* Scrollable: on short screens the lower half (18+, account, support) was
                clipped and unreachable — B could not find items below the fold. */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
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
            {/* CATALOG FRONT DOOR (B's pick: both drawer items and wall cards) — SHOWS and
                MOVIES route straight into the verified catalog, no query needed. */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { closeDrawer(); nav.navigate('Search', { catalog: 'series', _ts: Date.now() }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="albums-outline" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>SHOWS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { closeDrawer(); nav.navigate('Search', { catalog: 'movies', _ts: Date.now() }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="film-outline" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>MOVIES</Text>
            </TouchableOpacity>
            {/* HINDI CINEMA — the unfiltered Hindi section (tier:'hindi'), a deliverable for
                Hindi-speaking partners. Its own door so it feels intentional and the main wall
                stays tight. */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { closeDrawer(); nav.navigate('Section', { tier: 'hindi', title: 'Hindi Cinema' }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="globe-outline" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>HINDI CINEMA</Text>
            </TouchableOpacity>
            {/* THE STACKS — the archival / weird / deep-cut rows pulled off the tight main wall
                (tier:'vault'). Demoted, not deleted: still here, still searchable. */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { closeDrawer(); nav.navigate('Section', { tier: 'vault', title: 'The Stacks' }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="layers-outline" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>THE STACKS</Text>
            </TouchableOpacity>
            {/* HISTORY (B 2026-06-11): straight to the watch history, expanded */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { closeDrawer(); nav.navigate('My Void', { section: 'history', _ts: Date.now() }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>HISTORY</Text>
            </TouchableOpacity>
            {/* VOIDtv KIDS — one tap in; getting OUT requires the parent gate. Lives up here
                with the nav so it is never below the fold (B could not find it). */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={() => { enterKids(); closeDrawer(); nav.navigate('Browse', { chip: 'all' }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="happy-outline" size={18} color={'#ffd34d'} style={{ width: 28 }} />
              <Text style={[drawerStyles.menuLabel, { color: '#ffd34d' }]}>VOIDTV KIDS</Text>
            </TouchableOpacity>

            <View style={drawerStyles.divider} />

            {/* Generation switcher removed 2026-06-28 (signal mechanics gone) — one VOID identity now. */}

            <View style={drawerStyles.divider} />

            {/* Surprise Me */}
            <TouchableOpacity style={drawerStyles.menuItem} onPress={handleRandom} activeOpacity={0.7}>
              <Ionicons name="shuffle" size={18} color={accent} style={{ width: 28 }} />
              <Text style={drawerStyles.menuLabel}>SURPRISE ME</Text>
            </TouchableOpacity>

            {/* 18+ — sequestered, reachable on purpose (not censored), and PIN-GATED
                (slice 16): members only, then the account holder's PIN. The server withholds
                mature payloads without the verified gate token, so this is enforcement. */}
            <TouchableOpacity
              style={drawerStyles.menuItem}
              onPress={async () => {
                if (!isAuthenticated || isAnonymous) { closeDrawer(); nav.navigate('Auth'); return; }
                try {
                  if (!api.hasMatureGate()) {
                    const probe = await api.verifyMaturePin('');
                    if (probe && probe.needsSetup) {
                      const p1 = Platform.OS === 'web' && window.prompt ? window.prompt('Create your 18+ PIN (4-8 digits).\nYou will need it every session.') : null;
                      if (!p1 || !/^\d{4,8}$/.test(p1.trim())) return;
                      const r = await api.setMaturePin(p1.trim());
                      if (r && r.gate) api.setMatureGate(r.gate);
                    }
                  }
                } catch (e) {
                  // wrong/empty PIN probe path: ask for the PIN properly
                  const pin = Platform.OS === 'web' && window.prompt ? window.prompt('Enter your 18+ PIN') : null;
                  if (!pin) return;
                  try {
                    const r = await api.verifyMaturePin(pin.trim());
                    if (r && r.gate) api.setMatureGate(r.gate);
                    else return;
                  } catch (e2) { return; }
                }
                if (!api.hasMatureGate()) return;
                closeDrawer();
                nav.navigate('Browse', { chip: 'mature', _gate: Date.now() });
              }}
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

            {/* Give straight to the source — every item here exists because the Archive kept it */}
            <TouchableOpacity
              style={drawerStyles.supportBtn}
              onPress={() => Linking.openURL('https://archive.org/donate')}
              activeOpacity={0.7}
            >
              <Ionicons name="library" size={22} color={BRAND_BLUE} style={{ width: 30 }} />
              <View>
                <Text style={[drawerStyles.menuLabel, { color: BRAND_BLUE }]}>GIVE TO THE INTERNET ARCHIVE</Text>
                <Text style={drawerStyles.supportSub}>they keep the vault — donate to them directly</Text>
              </View>
            </TouchableOpacity>

            {/* Footer */}
            <View style={{ flex: 1 }} />
            <Text style={[drawerStyles.footerText, { color: '#f5a623', fontSize: 9 }]}>A project of Church of American Strength & Hope</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://cashvalues.org')} activeOpacity={0.7}>
              <Text style={[drawerStyles.footerText, { color: BRAND_BLUE, textDecorationLine: 'underline' }]}>CASHvalues.org</Text>
            </TouchableOpacity>
            <Text style={drawerStyles.footerText}>VOIDtv v0.3 · ARCHIVE.ORG · PUBLIC DOMAIN</Text>
            </ScrollView>
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
