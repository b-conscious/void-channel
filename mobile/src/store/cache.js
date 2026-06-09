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
  // v2 — added decade categories. Bumping the key invalidates the previous cache so users
  // immediately see the new sections without waiting for the TTL.
  CATEGORIES_CACHE: "@void_categories_v4",
  CATEGORIES_TIMESTAMP: "@void_categories_ts_v4",
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

// ── Categories Cache ───────────────────────────────────────

export async function getCachedCategories() {
  try {
    const ts = await AsyncStorage.getItem(KEYS.CATEGORIES_TIMESTAMP);
    if (!ts || Date.now() - parseInt(ts) > CACHE_TTL) {
      return null; // expired or missing
    }
    const raw = await AsyncStorage.getItem(KEYS.CATEGORIES_CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedCategories(data) {
  try {
    await AsyncStorage.setItem(KEYS.CATEGORIES_CACHE, JSON.stringify(data));
    await AsyncStorage.setItem(KEYS.CATEGORIES_TIMESTAMP, Date.now().toString());
  } catch (err) {
    console.warn("[cache] failed to write categories:", err);
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
  getCachedCategories,
  setCachedCategories,
  downloadVideo,
  getLocalVideo,
  deleteLocalVideo,
  getDownloadsDiskUsage,
};
