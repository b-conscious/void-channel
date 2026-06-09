/**
 * AdminScreen — control panel for site owner.
 * Only accessible when logged in with an admin email.
 *
 * Controls: view stats, wipe views/hearts/cache, manage users,
 * moderate contributions, set site banner.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert,
  StyleSheet, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useGeneration } from '../context/GenerationContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { colors, fonts, spacing, radius } from '../theme';

const ADMIN_EMAILS = [
  "bryankorth31@gmail.com",
  "preacherb@cashvalues.org",
];

export default function AdminScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const { user } = useAuth();
  const accent = gen.accentColor;

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [bannerText, setBannerText] = useState('');
  const [bannerType, setBannerType] = useState('info');
  const [pendingContribs, setPendingContribs] = useState([]);
  const [users, setUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);
  const [showContribs, setShowContribs] = useState(false);

  // Check admin access
  const isAdmin = user && ADMIN_EMAILS.includes((user.email || '').toLowerCase());

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await api.adminDashboard();
      setDashboard(data);
      if (data.banner?.message) {
        setBannerText(data.banner.message);
        setBannerType(data.banner.type || 'info');
      }
    } catch (err) {
      console.warn('[admin] dashboard fetch failed:', err.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const doAction = useCallback(async (actionKey, apiCall, confirmMsg) => {
    if (confirmMsg) {
      if (Platform.OS === 'web') {
        if (!window.confirm(confirmMsg)) return;
      } else {
        return new Promise((resolve) => {
          Alert.alert('Confirm', confirmMsg, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
            { text: 'Do It', style: 'destructive', onPress: async () => {
              setActionLoading(actionKey);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              try {
                const result = await apiCall();
                Alert.alert('Done', result.message || 'Action completed');
                fetchDashboard();
              } catch (err) {
                Alert.alert('Error', err.message);
              }
              setActionLoading(null);
              resolve();
            }},
          ]);
        });
      }
    }
    setActionLoading(actionKey);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      const result = await apiCall();
      if (Platform.OS === 'web') alert(result.message || 'Done');
      else Alert.alert('Done', result.message || 'Action completed');
      fetchDashboard();
    } catch (err) {
      if (Platform.OS === 'web') alert('Error: ' + err.message);
      else Alert.alert('Error', err.message);
    }
    setActionLoading(null);
  }, [fetchDashboard]);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.adminUsers();
      setUsers(data.users || []);
    } catch {}
  }, []);

  const fetchContribs = useCallback(async () => {
    try {
      const data = await api.adminContributions();
      setPendingContribs(data.contributions || []);
    } catch {}
  }, []);

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={48} color={colors.textGhost} />
          <Text style={styles.accessDeniedText}>ADMIN ACCESS REQUIRED</Text>
          <Text style={styles.accessDeniedSub}>This screen is only available to site administrators.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.btn, { borderColor: accent }]}>
            <Text style={[styles.btnText, { color: accent }]}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDashboard(); }} tintColor={accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.headerTitle, { color: accent }]}>ADMIN PANEL</Text>
            <Text style={styles.headerSub}>{user.email}</Text>
          </View>
          <TouchableOpacity onPress={() => { setRefreshing(true); fetchDashboard(); }} hitSlop={12}>
            <Ionicons name="refresh" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={accent} size="large" style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* ── Server Stats ── */}
            <Section title="SERVER" icon="server-outline" accent={accent}>
              <StatRow label="Uptime" value={dashboard?.uptimeHuman || '—'} />
              <StatRow label="Memory (heap)" value={dashboard?.memory ? `${dashboard.memory.heapUsed}/${dashboard.memory.heapTotal} MB` : '—'} />
              <StatRow label="RSS" value={dashboard?.memory ? `${dashboard.memory.rss} MB` : '—'} />
              <StatRow label="Cache entries" value={String(dashboard?.cache?.entries ?? '—')} />
              <StatRow label="Users" value={String(dashboard?.users?.total ?? '—')} />
            </Section>

            {/* ── Views & Trending ── */}
            <Section title="VIEWS & TRENDING" icon="trending-up-outline" accent={accent}>
              <StatRow label="Total views" value={String(dashboard?.views?.totalViews ?? 0)} />
              <StatRow label="Tracked items" value={String(dashboard?.views?.totalItems ?? 0)} />
              {(dashboard?.views?.top5 || []).map((v, i) => (
                <StatRow key={v.id} label={`#${i + 1}`} value={`${v.title?.slice(0, 30)} (${v.views})`} small />
              ))}
              <ActionButton
                label="WIPE ALL VIEWS & TRENDING"
                icon="trash-outline"
                color="#ff3b5c"
                loading={actionLoading === 'views'}
                onPress={() => doAction('views', api.adminWipeViews, 'Wipe ALL view counts and trending data? This cannot be undone.')}
              />
            </Section>

            {/* ── Hearts ── */}
            <Section title="HEARTS" icon="heart-outline" accent={accent}>
              {(dashboard?.hearts?.top5 || []).map((h, i) => (
                <StatRow key={h.id} label={`#${i + 1}`} value={`${h.title?.slice(0, 30)} (${h.hearts})`} small />
              ))}
              <ActionButton
                label="WIPE ALL HEARTS"
                icon="trash-outline"
                color="#ff3b5c"
                loading={actionLoading === 'hearts'}
                onPress={() => doAction('hearts', api.adminWipeHearts, 'Wipe ALL heart counts? This cannot be undone.')}
              />
            </Section>

            {/* ── Cache ── */}
            <Section title="CACHE" icon="layers-outline" accent={accent}>
              <StatRow label="Entries" value={String(dashboard?.cache?.entries ?? 0)} />
              {(dashboard?.cache?.sampleKeys || []).slice(0, 5).map((k, i) => (
                <StatRow key={i} label="" value={k} small />
              ))}
              <ActionButton
                label="FLUSH ENTIRE CACHE"
                icon="refresh-outline"
                color={accent}
                loading={actionLoading === 'cache'}
                onPress={() => doAction('cache', api.adminFlushCache, 'Flush all cached data? Next requests will be slower while cache rebuilds.')}
              />
            </Section>

            {/* ── Contributions ── */}
            <Section title="X-RAY CONTRIBUTIONS" icon="create-outline" accent={accent}>
              <StatRow label="Approved" value={String(dashboard?.contributions?.approved ?? '—')} />
              <StatRow label="Pending" value={String(dashboard?.contributions?.pending ?? '—')} />
              <ActionButton
                label={showContribs ? "HIDE PENDING" : "SHOW PENDING"}
                icon={showContribs ? "chevron-up" : "chevron-down"}
                color={accent}
                onPress={() => { setShowContribs(!showContribs); if (!showContribs) fetchContribs(); }}
              />
              {showContribs && pendingContribs.map((c) => (
                <View key={c.id} style={styles.contribCard}>
                  <Text style={styles.contribItem}>{c.item_id}</Text>
                  <Text style={styles.contribType}>{c.contribution_type}: {c.value}</Text>
                  <View style={styles.contribActions}>
                    <TouchableOpacity
                      onPress={() => doAction(`approve_${c.id}`, () => api.adminApproveContribution(c.id))}
                      style={[styles.contribBtn, { backgroundColor: '#2ecc4020', borderColor: '#2ecc40' }]}
                    >
                      <Text style={[styles.contribBtnText, { color: '#2ecc40' }]}>APPROVE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => doAction(`reject_${c.id}`, () => api.adminRejectContribution(c.id))}
                      style={[styles.contribBtn, { backgroundColor: '#ff3b5c20', borderColor: '#ff3b5c' }]}
                    >
                      <Text style={[styles.contribBtnText, { color: '#ff3b5c' }]}>REJECT</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {showContribs && pendingContribs.length === 0 && (
                <Text style={styles.emptyText}>No pending contributions</Text>
              )}
            </Section>

            {/* ── Users ── */}
            <Section title="USERS" icon="people-outline" accent={accent}>
              <ActionButton
                label={showUsers ? "HIDE USERS" : "SHOW REGISTERED USERS"}
                icon={showUsers ? "chevron-up" : "chevron-down"}
                color={accent}
                onPress={() => { setShowUsers(!showUsers); if (!showUsers) fetchUsers(); }}
              />
              {showUsers && users.map((u) => (
                <View key={u.id} style={styles.userCard}>
                  <Text style={styles.userName}>{u.username || u.display_name || '(no name)'}</Text>
                  <Text style={styles.userEmail}>{u.email || '—'}</Text>
                  <Text style={styles.userMeta}>
                    {u.xp || 0} XP · {u.rank || 'wanderer'} · {u.generation || 'millennial'} · {new Date(u.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))}
              {showUsers && users.length === 0 && (
                <Text style={styles.emptyText}>No registered users</Text>
              )}
            </Section>

            {/* ── Site Banner ── */}
            <Section title="SITE BANNER" icon="megaphone-outline" accent={accent}>
              <TextInput
                style={styles.bannerInput}
                value={bannerText}
                onChangeText={setBannerText}
                placeholder="Banner message shown to all users..."
                placeholderTextColor={colors.textGhost}
                multiline
              />
              <View style={styles.bannerTypeRow}>
                {['info', 'warning', 'success'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setBannerType(t)}
                    style={[styles.bannerTypePill, bannerType === t && { borderColor: accent, backgroundColor: accent + '15' }]}
                  >
                    <Text style={[styles.bannerTypeText, bannerType === t && { color: accent }]}>{t.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.bannerBtns}>
                <ActionButton
                  label="SET BANNER"
                  icon="megaphone-outline"
                  color={accent}
                  loading={actionLoading === 'banner_set'}
                  onPress={() => {
                    if (!bannerText.trim()) return;
                    doAction('banner_set', () => api.adminSetBanner(bannerText.trim(), bannerType));
                  }}
                />
                <ActionButton
                  label="CLEAR BANNER"
                  icon="close-circle-outline"
                  color={colors.textMuted}
                  loading={actionLoading === 'banner_clear'}
                  onPress={() => doAction('banner_clear', api.adminClearBanner)}
                />
              </View>
              {dashboard?.banner && (
                <View style={styles.bannerPreview}>
                  <Text style={styles.bannerPreviewLabel}>CURRENT:</Text>
                  <Text style={styles.bannerPreviewText}>{dashboard.banner.message}</Text>
                </View>
              )}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ──

function Section({ title, icon, accent, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={14} color={accent} />
        <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatRow({ label, value, small }) {
  return (
    <View style={styles.statRow}>
      {label ? <Text style={[styles.statLabel, small && { fontSize: 10 }]}>{label}</Text> : null}
      <Text style={[styles.statValue, small && { fontSize: 10 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, icon, color, loading, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={[styles.actionBtn, { borderColor: color + '40', backgroundColor: color + '08' }]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Ionicons name={icon} size={14} color={color} />
      )}
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenPadding, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface,
  },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 16, letterSpacing: 3 },
  headerSub: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5, marginTop: 1 },

  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  accessDeniedText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textPrimary, letterSpacing: 2, marginTop: 16 },
  accessDeniedSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 8 },

  section: {
    marginHorizontal: spacing.screenPadding, marginTop: 20,
    padding: 14, borderRadius: radius.md,
    backgroundColor: colors.surface + '40',
    borderWidth: 1, borderColor: colors.surface,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  sectionTitle: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 2 },

  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4,
  },
  statLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5 },
  statValue: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textPrimary, flex: 1, textAlign: 'right' },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.sm, borderWidth: 1, marginTop: 10,
  },
  actionBtnText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.5 },

  btn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm,
    borderWidth: 1, marginTop: 20,
  },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5, textAlign: 'center' },

  contribCard: {
    padding: 10, marginTop: 8, borderRadius: radius.sm,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.surface,
  },
  contribItem: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted },
  contribType: { fontFamily: fonts.sans, fontSize: 12, color: colors.textPrimary, marginTop: 2 },
  contribActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  contribBtn: {
    flex: 1, paddingVertical: 6, borderRadius: radius.sm,
    borderWidth: 1, alignItems: 'center',
  },
  contribBtnText: { fontFamily: fonts.monoBold, fontSize: 9, letterSpacing: 1 },

  userCard: {
    padding: 8, marginTop: 6, borderRadius: radius.sm,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.surface,
  },
  userName: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textPrimary },
  userEmail: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  userMeta: { fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost, marginTop: 2 },

  emptyText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textGhost, textAlign: 'center', paddingVertical: 12 },

  bannerInput: {
    fontFamily: fonts.sans, fontSize: 13, color: colors.textPrimary,
    backgroundColor: colors.bg, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.surface,
    padding: 10, minHeight: 50, textAlignVertical: 'top',
  },
  bannerTypeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  bannerTypePill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface,
  },
  bannerTypeText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 1 },
  bannerBtns: { flexDirection: 'row', gap: 8 },
  bannerPreview: {
    marginTop: 10, padding: 8, borderRadius: radius.sm,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.surface,
  },
  bannerPreviewLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.textGhost, letterSpacing: 1 },
  bannerPreviewText: { fontFamily: fonts.sans, fontSize: 12, color: colors.textPrimary, marginTop: 2 },
});
