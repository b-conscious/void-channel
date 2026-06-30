/**
 * SectionScreen — a tiered browse destination: renders the category rows for ONE tier
 * (the drawer routes here with { tier, title }). Reused by HINDI CINEMA (tier:'hindi')
 * and THE STACKS (tier:'vault', the rows cut off the tight main wall). Deliberately thin:
 * it fetches /api/categories?tier=X and reuses CategoryRow, so it inherits the wall's look,
 * the 10% void-TVs, and the per-gen lean for free. Search/browse elsewhere is untouched.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CategoryRow from '../components/CategoryRow';
import { useGeneration } from '../context/GenerationContext';
import { HEADER_H } from '../context/SidebarContext';
import api from '../api/client';
import { colors, fonts, spacing } from '../theme';

export default function SectionScreen({ route, navigation }) {
  const { tier, title, adult } = route.params || {};
  const { gen, generationId } = useGeneration();
  const accent = gen?.accentColor || colors.amber;
  const insets = useSafeAreaInsets();

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getCategories({ tier, gen: generationId, adult })
      .then((data) => {
        if (cancelled) return;
        setCats(Array.isArray(data) ? data.filter((c) => c && (c.items || []).length > 0) : []);
      })
      .catch(() => { if (!cancelled) setCats([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tier, generationId, adult]);

  const onItemPress = useCallback((item) => {
    if (item && item.id) navigation.navigate('Player', { item, id: item.id });
  }, [navigation]);

  const renderRow = useCallback(({ item }) => (
    <CategoryRow category={item} onItemPress={onItemPress} />
  ), [onItemPress]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + HEADER_H + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: accent }]}>{String(title || 'SECTION').toUpperCase()}</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={accent} size="large" /></View>
      ) : cats.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>Nothing here yet.</Text></View>
      ) : (
        <FlatList
          data={cats}
          keyExtractor={(c) => c.id}
          renderItem={renderRow}
          initialNumToRender={30}
          maxToRenderPerBatch={12}
          windowSize={31}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.screenPadding, paddingBottom: 10 },
  title: { fontFamily: fonts.monoBold, fontSize: 16, letterSpacing: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },
});
