import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  XP:                 '@void_xp',
  RARE_UNEARTHED:     '@void_rare_unearthed',    // ids of rare items (< 5k downloads) the user has discovered
  TOTAL_WATCHED:      '@void_total_watched',
  DAYS_SET:           '@void_days_set',
  LAST_BOUNTY_DATE:   '@void_last_bounty_date',
  COMPLETED_BOUNTIES: '@void_completed_bounties',
  LAST_CAT:           '@void_last_cat',
  STREAK_COUNT:       '@void_streak_count',
  STREAK_BEST:        '@void_streak_best',
};

export async function loadGameState() {
  try {
    const pairs = await AsyncStorage.multiGet([
      KEYS.XP, KEYS.RARE_UNEARTHED, KEYS.TOTAL_WATCHED, KEYS.DAYS_SET,
      KEYS.LAST_BOUNTY_DATE, KEYS.COMPLETED_BOUNTIES,
      KEYS.LAST_CAT, KEYS.STREAK_COUNT, KEYS.STREAK_BEST,
    ]);
    const map = Object.fromEntries(pairs);

    const today = new Date().toISOString().slice(0, 10);
    const lastDate = map[KEYS.LAST_BOUNTY_DATE] || '';
    const completedToday = lastDate === today
      ? safeParse(map[KEYS.COMPLETED_BOUNTIES], [])
      : [];

    return {
      xp:                parseInt(map[KEYS.XP] || '0', 10),
      rareUnearthed:     safeParse(map[KEYS.RARE_UNEARTHED], []),
      totalWatched:      parseInt(map[KEYS.TOTAL_WATCHED] || '0', 10),
      daysExploring:     safeParse(map[KEYS.DAYS_SET], []).length,
      lastBountyDate:    lastDate,
      completedBounties: completedToday,
      lastCategory:      map[KEYS.LAST_CAT] || null,
      streakCount:       parseInt(map[KEYS.STREAK_COUNT] || '0', 10),
      streakBest:        parseInt(map[KEYS.STREAK_BEST] || '0', 10),
    };
  } catch {
    return {
      xp: 0, rareUnearthed: [], totalWatched: 0, daysExploring: 0,
      lastBountyDate: '', completedBounties: [],
      lastCategory: null, streakCount: 0, streakBest: 0,
    };
  }
}

function safeParse(str, fallback) {
  try { return JSON.parse(str || JSON.stringify(fallback)); } catch { return fallback; }
}

export async function saveXP(xp) {
  await AsyncStorage.setItem(KEYS.XP, String(xp));
}

/**
 * Add an item ID to the rare-unearthed list. Returns true if newly added.
 * Caller must verify the item actually qualifies as rare (< 5k downloads)
 * before calling — this function does not check.
 */
export async function addRareUnearthed(itemId) {
  const raw = await AsyncStorage.getItem(KEYS.RARE_UNEARTHED);
  const list = safeParse(raw, []);
  if (list.includes(itemId)) return { isNew: false, list };
  const updated = [itemId, ...list].slice(0, 500);
  await AsyncStorage.setItem(KEYS.RARE_UNEARTHED, JSON.stringify(updated));
  return { isNew: true, list: updated };
}

export async function incrementWatched() {
  const raw = await AsyncStorage.getItem(KEYS.TOTAL_WATCHED);
  const n = parseInt(raw || '0', 10) + 1;
  await AsyncStorage.setItem(KEYS.TOTAL_WATCHED, String(n));

  // Unique days the user has watched anything
  const today = new Date().toISOString().slice(0, 10);
  const daysRaw = await AsyncStorage.getItem(KEYS.DAYS_SET);
  const days = safeParse(daysRaw, []);
  if (!days.includes(today)) {
    await AsyncStorage.setItem(KEYS.DAYS_SET, JSON.stringify([...days, today]));
  }
  return n;
}

export async function saveCompletedBounty(bountyId) {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = await AsyncStorage.getItem(KEYS.LAST_BOUNTY_DATE);
  const existing = lastDate === today
    ? safeParse(await AsyncStorage.getItem(KEYS.COMPLETED_BOUNTIES), [])
    : [];
  if (existing.includes(bountyId)) return existing;
  const updated = [...existing, bountyId];
  await AsyncStorage.multiSet([
    [KEYS.LAST_BOUNTY_DATE, today],
    [KEYS.COMPLETED_BOUNTIES, JSON.stringify(updated)],
  ]);
  return updated;
}

/**
 * Update streak count. Returns the new count.
 * Same category as last watch → increment. Different → reset to 1.
 * Null categoryId → reset to 1 (we can't tie the watch to a category).
 */
export async function updateStreak(categoryId) {
  const lastCat = await AsyncStorage.getItem(KEYS.LAST_CAT);
  const countRaw = await AsyncStorage.getItem(KEYS.STREAK_COUNT);
  const bestRaw = await AsyncStorage.getItem(KEYS.STREAK_BEST);
  let count = parseInt(countRaw || '0', 10);
  const best = parseInt(bestRaw || '0', 10);

  if (categoryId && lastCat === categoryId) {
    count += 1;
  } else {
    count = 1;
  }

  const newBest = Math.max(best, count);
  await AsyncStorage.multiSet([
    [KEYS.LAST_CAT, categoryId || ''],
    [KEYS.STREAK_COUNT, String(count)],
    [KEYS.STREAK_BEST, String(newBest)],
  ]);
  return { count, best: newBest };
}
