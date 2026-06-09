import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  XP:                  '@void_xp',
  TOTAL_WATCHED:       '@void_total_watched',
  DAYS_SET:            '@void_days_set',
  TOTAL_CONTRIBUTIONS: '@void_total_contributions',
  CONTRIBUTIONS_BY_TYPE: '@void_contributions_by_type',
  RECENT_CONTRIBUTIONS: '@void_recent_contributions',
};

function safeParse(str, fallback) {
  try { return JSON.parse(str || JSON.stringify(fallback)); } catch { return fallback; }
}

export async function loadGameState() {
  try {
    const pairs = await AsyncStorage.multiGet([
      KEYS.XP, KEYS.TOTAL_WATCHED, KEYS.DAYS_SET,
      KEYS.TOTAL_CONTRIBUTIONS, KEYS.CONTRIBUTIONS_BY_TYPE,
      KEYS.RECENT_CONTRIBUTIONS,
    ]);
    const map = Object.fromEntries(pairs);

    return {
      xp:                  parseInt(map[KEYS.XP] || '0', 10),
      totalWatched:        parseInt(map[KEYS.TOTAL_WATCHED] || '0', 10),
      daysExploring:       safeParse(map[KEYS.DAYS_SET], []).length,
      totalContributions:  parseInt(map[KEYS.TOTAL_CONTRIBUTIONS] || '0', 10),
      contributionsByType: safeParse(map[KEYS.CONTRIBUTIONS_BY_TYPE], {}),
      recentContributions: safeParse(map[KEYS.RECENT_CONTRIBUTIONS], []),
    };
  } catch {
    return {
      xp: 0, totalWatched: 0, daysExploring: 0,
      totalContributions: 0, contributionsByType: {}, recentContributions: [],
    };
  }
}

export async function saveXP(xp) {
  await AsyncStorage.setItem(KEYS.XP, String(xp));
}

export async function incrementWatched() {
  const raw = await AsyncStorage.getItem(KEYS.TOTAL_WATCHED);
  const n = parseInt(raw || '0', 10) + 1;
  await AsyncStorage.setItem(KEYS.TOTAL_WATCHED, String(n));

  // Unique days the user has been active
  const today = new Date().toISOString().slice(0, 10);
  const daysRaw = await AsyncStorage.getItem(KEYS.DAYS_SET);
  const days = safeParse(daysRaw, []);
  if (!days.includes(today)) {
    await AsyncStorage.setItem(KEYS.DAYS_SET, JSON.stringify([...days, today]));
  }
  return n;
}

/**
 * Track a new contribution locally.
 * Returns updated stats { total, byType, recent }.
 */
export async function addContribution(fieldType, itemId, itemTitle) {
  // Increment total
  const totalRaw = await AsyncStorage.getItem(KEYS.TOTAL_CONTRIBUTIONS);
  const total = parseInt(totalRaw || '0', 10) + 1;

  // Update by-type counts
  const byTypeRaw = await AsyncStorage.getItem(KEYS.CONTRIBUTIONS_BY_TYPE);
  const byType = safeParse(byTypeRaw, {});
  byType[fieldType] = (byType[fieldType] || 0) + 1;

  // Add to recent list (keep last 50)
  const recentRaw = await AsyncStorage.getItem(KEYS.RECENT_CONTRIBUTIONS);
  const recent = safeParse(recentRaw, []);
  const entry = {
    fieldType,
    itemId,
    itemTitle: itemTitle || 'Unknown',
    date: new Date().toISOString(),
  };
  const updatedRecent = [entry, ...recent].slice(0, 50);

  // Track activity day
  const today = new Date().toISOString().slice(0, 10);
  const daysRaw = await AsyncStorage.getItem(KEYS.DAYS_SET);
  const days = safeParse(daysRaw, []);
  if (!days.includes(today)) {
    await AsyncStorage.setItem(KEYS.DAYS_SET, JSON.stringify([...days, today]));
  }

  await AsyncStorage.multiSet([
    [KEYS.TOTAL_CONTRIBUTIONS, String(total)],
    [KEYS.CONTRIBUTIONS_BY_TYPE, JSON.stringify(byType)],
    [KEYS.RECENT_CONTRIBUTIONS, JSON.stringify(updatedRecent)],
  ]);

  return { total, byType, recent: updatedRecent };
}
