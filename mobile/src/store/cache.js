/**
 * Local Device Cache — Step 6 from the architecture plan.
 *
 * Uses AsyncStorage for:
 *   - Watchlist (saved items the user wants to revisit)
 *   - Watch history (what they've already seen)
 *   - Cached category data (so the home screen loads instantly)
 *
 * For offline file downloads, we use expo-file-system
 * to store actual MP4s on the device.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
// expo-file-system v19+ moved the classic API to /legacy. New File/Directory API
// is available but is not a drop-in replacement; keep using legacy here.
import * as FileSystem from "expo-file-system/legacy";

const KEYS = {
  WATCHLIST: "@void_watchlist",
  HISTORY: "@void_history",
  HEARTS: "@void_hearts", // local set of item IDs the user has hearted
  // v7 — smaller thumbnails (100px), new categories. Bumping the key invalidates
  // the previous cache so users get the faster-loading thumbnails immediately.
  CATEGORIES_CACHE: "@void_categories_v7",
  CATEGORIES_TIMESTAMP: "@void_categories_ts_v7",
};

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

// ── Watchlist ──────────────────────────────────────────────

export async function getWatchlist() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.WATCHLIST);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addToWatchlist(item) {
  const list = await getWatchlist();
  // Don't duplicate
  if (list.find((i) => i.id === item.id)) return list;
  const updated = [item, ...list];
  await AsyncStorage.setItem(KEYS.WATCHLIST, JSON.stringify(updated));
  return updated;
}

export async function removeFromWatchlist(itemId) {
  const list = await getWatchlist();
  const updated = list.filter((i) => i.id !== itemId);
  await AsyncStorage.setItem(KEYS.WATCHLIST, JSON.stringify(updated));
  return updated;
}

export async function isInWatchlist(itemId) {
  const list = await getWatchlist();
  return list.some((i) => i.id === itemId);
}

// ── Hearts (local — which items this user has hearted) ─────

export async function getHearts() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HEARTS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function isHearted(itemId) {
  const list = await getHearts();
  return list.includes(itemId);
}

export async function setHearted(itemId, hearted) {
  const list = await getHearts();
  let updated;
  if (hearted) {
    if (list.includes(itemId)) return list;
    updated = [itemId, ...list];
  } else {
    updated = list.filter((id) => id !== itemId);
  }
  await AsyncStorage.setItem(KEYS.HEARTS, JSON.stringify(updated));
  return updated;
}

// ── Watch History ──────────────────────────────────────────

export async function getHistory() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addToHistory(item) {
  const list = await getHistory();
  // Remove existing entry, add to front
  const filtered = list.filter((i) => i.id !== item.id);
  const entry = {
    ...item,
    watchedAt: Date.now(),
  };
  const updated = [entry, ...filtered].slice(0, 100); // cap at 100
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  return updated;
}

export async function removeFromHistory(itemId) {
  const list = await getHistory();
  const updated = list.filter((i) => i.id !== itemId);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  return updated;
}

export async function clearHistory() {
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify([]));
  return [];
}

// ── Categories Cache ───────────────────────────────────────

// The cache is scoped per generation — each era-lean ('boomer'/'millennial'/'genz') caches its own
// payload, so switching generation never shows another gen's leaning from a stale client cache.
function catKey(gen) { return `${KEYS.CATEGORIES_CACHE}:${gen || 'none'}`; }
function tsKey(gen) { return `${KEYS.CATEGORIES_TIMESTAMP}:${gen || 'none'}`; }

export async function getCachedCategories(gen = null) {
  try {
    const ts = await AsyncStorage.getItem(tsKey(gen));
    if (!ts || Date.now() - parseInt(ts) > CACHE_TTL) {
      return null; // expired or missing
    }
    const raw = await AsyncStorage.getItem(catKey(gen));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getCategoriesTimestamp(gen = null) {
  try {
    const ts = await AsyncStorage.getItem(tsKey(gen));
    return ts ? parseInt(ts) : 0;
  } catch { return 0; }
}

// The wall payload outgrew the web localStorage quota (90+ crates x items x 3 gen keys), and
// a failed write silently leaves a STALE cache serving old walls forever. So: the cached copy
// is a slim first-paint version (12 items per crate, clipped descriptions), only the ACTIVE
// gen stays cached (other gen keys evicted), and a quota error clears our keys and retries
// once. The fresh network payload in memory is always the full one; this only shapes what
// survives to the next visit.
const GENS = ['boomer', 'millennial', 'genz', 'none'];

function slimCategories(data) {
  const cats = Array.isArray(data) ? data : (data && data.categories);
  if (!Array.isArray(cats)) return data;
  const slim = cats.map((c) => ({
    ...c,
    items: (c.items || []).slice(0, 12).map((it) => ({
      ...it,
      description: typeof it.description === 'string' ? it.description.slice(0, 140) : it.description,
    })),
  }));
  return Array.isArray(data) ? slim : { ...data, categories: slim };
}

async function evictOtherGens(activeGen) {
  for (const g of GENS) {
    if (g === (activeGen || 'none')) continue;
    try { await AsyncStorage.removeItem(catKey(g)); await AsyncStorage.removeItem(tsKey(g)); } catch {}
  }
}

export async function setCachedCategories(data, gen = null) {
  const payload = JSON.stringify(slimCategories(data));
  try {
    await evictOtherGens(gen);
    await AsyncStorage.setItem(catKey(gen), payload);
    await AsyncStorage.setItem(tsKey(gen), Date.now().toString());
  } catch (err) {
    // Quota: clear every category key we own and retry once. Still failing stays non-fatal,
    // but the stale entry is GONE, so the next visit refetches instead of serving old walls.
    try {
      for (const g of GENS) {
        await AsyncStorage.removeItem(catKey(g));
        await AsyncStorage.removeItem(tsKey(g));
      }
      await AsyncStorage.setItem(catKey(gen), payload);
      await AsyncStorage.setItem(tsKey(gen), Date.now().toString());
    } catch (err2) {
      console.warn("[cache] categories cache disabled this visit (quota):", err2 && err2.name);
    }
  }
}

// ── Offline Downloads (native only — no-op on web) ────────

import { Platform } from "react-native";

const IS_WEB = Platform.OS === "web";
const DOWNLOAD_DIR = IS_WEB ? "" : `${FileSystem.documentDirectory}void-channel/`;

async function ensureDownloadDir() {
  if (IS_WEB) return;
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

export async function downloadVideo(identifier, videoUrl, onProgress) {
  // Web: fetch blob and trigger browser download
  if (IS_WEB) {
    try {
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      const reader = res.body?.getReader();
      if (!reader) {
        // Fallback: just open in new tab for direct download
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = `${identifier}.mp4`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return videoUrl;
      }
      // Stream with progress
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (onProgress && contentLength > 0) onProgress(received / contentLength);
      }
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${identifier}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return videoUrl;
    } catch (err) {
      // Last-resort fallback: open direct URL
      window.open(videoUrl, '_blank');
      return videoUrl;
    }
  }

  // Native: use expo-file-system
  await ensureDownloadDir();
  const localUri = `${DOWNLOAD_DIR}${identifier}.mp4`;
  const info = await FileSystem.getInfoAsync(localUri);
  if (info.exists) return localUri;

  const download = FileSystem.createDownloadResumable(
    videoUrl, localUri, {},
    (progress) => {
      if (onProgress) {
        const pct = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
        onProgress(pct);
      }
    }
  );
  const result = await download.downloadAsync();
  return result?.uri || localUri;
}

export async function getLocalVideo(identifier) {
  if (IS_WEB) return null;
  const localUri = `${DOWNLOAD_DIR}${identifier}.mp4`;
  const info = await FileSystem.getInfoAsync(localUri);
  return info.exists ? localUri : null;
}

export async function deleteLocalVideo(identifier) {
  if (IS_WEB) return;
  const localUri = `${DOWNLOAD_DIR}${identifier}.mp4`;
  const info = await FileSystem.getInfoAsync(localUri);
  if (info.exists) await FileSystem.deleteAsync(localUri);
}

export async function getDownloadsDiskUsage() {
  if (IS_WEB) return 0;
  await ensureDownloadDir();
  const files = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
  let total = 0;
  for (const file of files) {
    const info = await FileSystem.getInfoAsync(`${DOWNLOAD_DIR}${file}`);
    if (info.exists && info.size) total += info.size;
  }
  return total;
}

export default {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isInWatchlist,
  getHearts,
  isHearted,
  setHearted,
  getHistory,
  addToHistory,
  removeFromHistory,
  clearHistory,
  getCachedCategories,
  getCategoriesTimestamp,
  setCachedCategories,
  downloadVideo,
  getLocalVideo,
  deleteLocalVideo,
  getDownloadsDiskUsage,
};
