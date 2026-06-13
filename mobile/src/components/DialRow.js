// THE DIAL (JOB_14 / Move 2): channel surfing like old TV. Every channel is an ordered queue
// with a deterministic schedule; the playback position derives from the CLOCK, so everyone
// tuning in sees the same moment and flipping channels lands mid-scene like real broadcast.
// ZERO server state: the queue comes from the existing /api/channel/queue (spine-backed,
// edge-cached), the math happens here, and the same offset is handed to the player.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import FastImage from './FastImage';
import api from '../api/client';
import { colors, fonts, spacing } from '../theme';

// Channel mixes, HEAVILY gated toward actual shows and movies (B's ruling 2026-06-11).
// Derived from the wall's channelDefs but re-cut: PSA/footage/oddity crates dropped
// (deep_atomic, deep_mental_hygiene, oddities, newsreels, war_footage), a MOVIE HOUSE
// channel added off the Feature Vault. minRuntime is the per-channel floor in seconds
// (cartoon shorts are real shows at 5 minutes; a western under 15 is not a western).
const DEFS = [
  { label: 'MOVIE HOUSE', icon: '◆', catIds: ['ia_features', 'scifi_horror_ia'], minRuntime: 2700 },
  { label: 'CARTOONS', icon: '★', catIds: ['cartoons', 'show_betty_boop', 'show_popeye', 'show_looney', 'saturday_morning'], minRuntime: 300 },
  { label: 'SCI-FI', icon: '◈', catIds: ['scifi', 'deep_space'], minRuntime: 900 },
  { label: 'NIGHTMARE FUEL', icon: '☠', catIds: ['horror', 'deep_creature', 'deep_vampire', 'deep_camp'], minRuntime: 900 },
  { label: 'NOIR', icon: '◆', catIds: ['noir'], minRuntime: 900 },
  { label: 'COMEDY', icon: '★', catIds: ['comedy', 'show_threestooges'], minRuntime: 600 },
  { label: 'DOCS', icon: '▣', catIds: ['documentary', 'nature_wildlife'], minRuntime: 900 },
  { label: 'WESTERNS', icon: '◆', catIds: ['western'], minRuntime: 900 },
  { label: 'ANIME', icon: '◈', catIds: ['anime', 'foreign'], minRuntime: 600 },
];

// Junk that is never a show or a movie, whatever crate it rode in on. Title-heuristic
// gating is the proven pattern here (the snacks rebuild carried the same load).
const JUNK_RE = /\b(vj|loops?|visuals?|meeting|council|zoning|school board|board of|city of|commission|commercial|trailer|teaser|promo|spot|advert|aircheck|podcast|news|nyheter|newsreel|compilation|sample|test pattern|station id)\b/i;

function isShowOrMovie(it, minRuntime) {
  const title = String(it.title || '');
  if (title.replace(/[^a-z0-9]/gi, '').length < 4) return false; // social-mirror "!" junk
  if (JUNK_RE.test(title)) return false;
  if (it.runtime != null) return it.runtime >= minRuntime;
  return true; // unknown runtime passes only the title gate (typically full features)
}

// The broadcast epoch. Fixed forever: the schedule is (now - epoch) walked into the queue.
const DIAL_EPOCH_S = Date.UTC(2026, 0, 1) / 1000;
// Items without runtime metadata count as 15 minutes. The rule must stay identical for every
// client or viewers desync; change it only with a version bump on the row.
const DEFAULT_DUR_S = 900;
const dur = (it) => (it && it.runtime && it.runtime > 30 ? it.runtime : DEFAULT_DUR_S);

// Clock walk: which item is "on" right now and how far in. Exported: the Dial row is parked
// (B pulled it off the wall, slice 17) but this math now drives the kids time-travel channel.
export function dialPosition(items, nowS) {
  let total = 0;
  for (const it of items) total += dur(it);
  if (!total) return null;
  let t = Math.floor((nowS - DIAL_EPOCH_S) % total);
  if (t < 0) t += total;
  for (let i = 0; i < items.length; i++) {
    const d = dur(items[i]);
    if (t < d) return { index: i, offset: t, duration: d };
    t -= d;
  }
  return { index: 0, offset: 0, duration: dur(items[0]) };
}

const IS_DESKTOP = Platform.OS === 'web';
const CARD_W = IS_DESKTOP ? 256 : 200;
const CARD_H = Math.round(CARD_W * 9 / 16);

export default function DialRow({ accent, onTune }) {
  const [queues, setQueues] = useState({}); // label -> items
  const [nowS, setNowS] = useState(() => Date.now() / 1000);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // One cached call per channel (50 deep). Failures just hide that channel this visit.
    // Heavy gate: per-channel runtime floor + junk-title kill list. A channel that cannot
    // field 3 real shows after gating does not air at all.
    DEFS.forEach((def) => {
      api.getChannelQueue(def.catIds, 50, 1)
        .then((r) => {
          const all = (r && r.items) || [];
          const items = all.filter((it) => isShowOrMovie(it, def.minRuntime || 900));
          if (mountedRef.current && items.length > 2) {
            setQueues((q) => ({ ...q, [def.label]: items }));
          }
        })
        .catch(() => {});
    });
    const tick = setInterval(() => setNowS(Date.now() / 1000), 10000);
    return () => { mountedRef.current = false; clearInterval(tick); };
  }, []);

  const handleTune = useCallback((def, items, pos) => {
    if (onTune) onTune(def, items, pos.index, pos.offset);
  }, [onTune]);

  const live = DEFS.filter((d) => queues[d.label]);
  if (!live.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: accent }]}>THE DIAL</Text>
        <Text style={styles.hint}>already in progress · tap to tune in</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {live.map((def) => {
          const items = queues[def.label];
          const pos = dialPosition(items, nowS);
          if (!pos) return null;
          const onNow = items[pos.index];
          const pct = Math.min(100, Math.round((pos.offset / pos.duration) * 100));
          return (
            <TouchableOpacity key={def.label} style={styles.card} activeOpacity={0.8} onPress={() => handleTune(def, items, pos)}>
              <View style={styles.thumbWrap}>
                <FastImage source={{ uri: onNow.thumbnail }} style={styles.thumb} resizeMode="cover" />
                <View style={styles.badge}><Text style={[styles.badgeText, { color: accent }]}>ON NOW</Text></View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: accent }]} />
                </View>
              </View>
              <Text style={styles.channelLabel} numberOfLines={1}>{def.icon} {def.label}</Text>
              <Text style={styles.onNowTitle} numberOfLines={1}>{onNow.title}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: spacing.screenPadding, marginBottom: 8, gap: 10 },
  title: { fontFamily: fonts.mono, fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  hint: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted },
  scroll: { paddingHorizontal: spacing.screenPadding, gap: 10 },
  card: { width: CARD_W },
  thumbWrap: { width: CARD_W, height: CARD_H, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface },
  thumb: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontFamily: fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  progressFill: { height: 3 },
  channelLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textPrimary, marginTop: 6 },
  onNowTitle: { fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary, marginTop: 1 },
});
