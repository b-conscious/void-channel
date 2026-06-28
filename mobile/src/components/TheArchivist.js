/**
 * The Archivist — AI rabbit-hole guide (frontend console).
 *
 * Self-contained: renders a floating "Ask the Archivist" button that opens a
 * console modal. You ask in natural language; the Archivist replies with a
 * thread of context + real, tappable item cards (grounded server-side — it can't
 * invent items). Shows remaining weekly consults and an "insert coin" upgrade
 * prompt (donation) when the quota runs out.
 *
 * Drop in once per screen:  <TheArchivist navigation={navigation} contextItem={item} />
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, TouchableOpacity, Modal,
  ScrollView, StyleSheet, Platform, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import FastImage from './FastImage';
import VoidLoader from './VoidLoader';
import { colors, fonts, radius, spacing } from '../theme';

const BRAND_BLUE = '#5cb8ff';
const DONATE_URL = 'https://square.link/u/dJioBmlW';

const IS_DESKTOP_WEB = Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 900;

export default function TheArchivist({ navigation, contextItem, accent }) {
  const tint = accent || BRAND_BLUE;
  // Desktop has a left sidebar → place bottom-right. Mobile has a right-side menu FAB
  // + bottom tabs → place bottom-left, raised above the tab bar.
  const fabPos = IS_DESKTOP_WEB ? { right: 16, bottom: 24 } : { left: 16, bottom: 92 };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState([]);     // { q, reply, items, refused, quota }
  const [status, setStatus] = useState(null); // { usesLeft, limit, enabled, supporter }
  const [authNeeded, setAuthNeeded] = useState(false);
  const scrollRef = useRef(null);

  const refreshStatus = useCallback(() => {
    const api = require('../api/client').default;
    api.archivistStatus()
      .then(setStatus)
      .catch((e) => {
        if (String(e?.message || '').includes('401') || /auth/i.test(String(e?.message || ''))) {
          setAuthNeeded(true);
        }
      });
  }, []);

  useEffect(() => { if (open) refreshStatus(); }, [open, refreshStatus]);

  const ask = useCallback(async () => {
    const q = query.trim();
    if (!q || loading) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setLoading(true);
    setQuery('');
    const api = require('../api/client').default;
    try {
      const ctx = contextItem
        ? { currentItemId: contextItem.id, currentItemTitle: contextItem.title }
        : {};
      const res = await api.askArchivist(q, ctx);
      setTurns((t) => [...t, { q, reply: res.reply, items: res.items || [], refused: !!res.refused }]);
      if (typeof res.usesLeft === 'number') setStatus((s) => ({ ...(s || {}), usesLeft: res.usesLeft, limit: res.limit }));
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('429') || /quota/i.test(msg)) {
        setTurns((t) => [...t, { q, reply: "The Archivist needs to rest — you've used your consults this week.", items: [], quota: true }]);
        setStatus((s) => ({ ...(s || {}), usesLeft: 0 }));
      } else if (msg.includes('401') || /auth/i.test(msg)) {
        setAuthNeeded(true);
      } else if (msg.includes('503')) {
        setTurns((t) => [...t, { q, reply: 'The Archivist is offline right now. Check back soon.', items: [] }]);
      } else {
        setTurns((t) => [...t, { q, reply: 'The signal dropped. Try again.', items: [] }]);
      }
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 60);
    }
  }, [query, loading, contextItem]);

  const openItem = useCallback((item) => {
    setOpen(false);
    navigation?.navigate?.('Player', { item, id: item.id });
  }, [navigation]);

  return (
    <>
      {/* Floating trigger */}
      <Pressable
        onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}; setOpen(true); }}
        style={[styles.fab, fabPos, { borderColor: tint + '66', shadowColor: tint }]}
      >
        <Ionicons name="sparkles" size={16} color={tint} />
        <Text style={[styles.fabText, { color: tint }]}>ARCHIVIST</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.panel}>
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={16} color={tint} />
                <Text style={[styles.title, { color: tint }]}>THE ARCHIVIST</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {status && typeof status.usesLeft === 'number' && (
                  <Text style={styles.meter}>
                    {status.usesLeft}/{status.limit} consults left
                  </Text>
                )}
                <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Conversation */}
            <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
              {turns.length === 0 && !loading && (
                <View style={styles.intro}>
                  <Text style={styles.introText}>
                    I'm the Archivist. Tell me a vibe, a year, a rabbit hole — "creepy 1950s educational films,"
                    "lost home movies," "cartoons that feel like fever dreams" — and I'll pull the thread.
                  </Text>
                  {contextItem ? (
                    <Pressable onPress={() => { setQuery(`more like "${contextItem.title}"`); }} style={[styles.suggestChip, { borderColor: tint + '55' }]}>
                      <Text style={[styles.suggestText, { color: tint }]}>more like what I'm watching</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}

              {turns.map((t, i) => (
                <View key={i} style={{ marginBottom: 18 }}>
                  <Text style={styles.userQ}>{t.q}</Text>
                  <Text style={[styles.reply, t.refused && { color: colors.textMuted, fontStyle: 'italic' }]}>{t.reply}</Text>

                  {t.items && t.items.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={Platform.OS === 'web'} // web/desktop has no touch-swipe; the visible bar is the affordance + signals there's more
                      style={{ marginTop: 10 }}
                      contentContainerStyle={{ gap: 10, paddingRight: 8, paddingBottom: 2 }} // trailing room so the last card isn't clipped flush
                    >
                      {t.items.map((it) => (
                        <TouchableOpacity key={it.id} onPress={() => openItem(it)} activeOpacity={0.8} style={styles.card}>
                          <FastImage uri={it.thumbnail} itemId={it.id} style={styles.cardImg} contentFit="cover" />
                          <Text style={styles.cardTitle} numberOfLines={2}>{it.title}</Text>
                          {it.year ? <Text style={styles.cardYear}>{it.year}</Text> : null}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {t.quota && (
                    <Pressable onPress={() => Linking.openURL(DONATE_URL)} style={[styles.coin, { borderColor: tint }]}>
                      <Ionicons name="gift" size={16} color={tint} />
                      <Text style={[styles.coinText, { color: tint }]}>INSERT COIN — supporters get 4× the rabbit-holes</Text>
                    </Pressable>
                  )}
                </View>
              ))}

              {loading && (
                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <VoidLoader mode="static" size="channel" label="consulting the void..." style={{ width: 200, height: 110, borderRadius: 8 }} />
                </View>
              )}

              {authNeeded && (
                <View style={styles.intro}>
                  <Text style={styles.introText}>The Archivist needs a (free) session to keep your consults straight.</Text>
                  <Pressable onPress={() => { setOpen(false); navigation?.navigate?.('Auth'); }} style={[styles.suggestChip, { borderColor: tint + '55' }]}>
                    <Text style={[styles.suggestText, { color: tint }]}>start a session</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={ask}
                placeholder="ask the archivist..."
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                returnKeyType="send"
                editable={!loading}
              />
              <TouchableOpacity onPress={ask} disabled={loading || !query.trim()} style={[styles.send, { backgroundColor: query.trim() && !loading ? tint : colors.surface }]}>
                {loading ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Ionicons name="arrow-up" size={18} color={query.trim() ? colors.bg : colors.textMuted} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderWidth: 1, borderRadius: 22,
    shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 50,
  },
  fabText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    maxHeight: '88%', minHeight: '55%',
    borderTopWidth: 1, borderColor: colors.surface,
    ...(Platform.OS === 'web' ? { maxWidth: 640, width: '100%', alignSelf: 'center' } : {}),
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  title: { fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 2 },
  meter: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5 },
  body: { flex: 1 },
  intro: { paddingVertical: 12, gap: 12 },
  introText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  suggestChip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13 },
  suggestText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5 },
  userQ: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, marginBottom: 6 },
  reply: { fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  card: { width: 130 },
  cardImg: { width: 130, height: 82, borderRadius: radius.sm, backgroundColor: colors.card },
  cardTitle: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.textPrimary, marginTop: 5 },
  cardYear: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, marginTop: 1 },
  coin: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, marginTop: 12,
  },
  coinText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.5, flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'web' ? 12 : 10,
    fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  send: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});
