/**
 * API Client — talks to the Void Channel proxy.
 * The app never hits archive.org directly.
 */

// Point this at your computer's LAN IP so a real phone can reach the proxy.
// `localhost` from a phone means the phone itself — won't work.
const BASE_URL = __DEV__
  ? "http://localhost:3001"
  : "https://void-channel.onrender.com";

const TIMEOUT = 30000;       // 30s — Archive.org can be slow
const LONG_TIMEOUT = 90000;  // 90s — Render cold start wake-up

// ── Auth token injection ──────────────────────────────────
let _authToken = null;

export function setAuthToken(token) {
  _authToken = token;
}

async function request(path, options = {}) {
  const timeout = options._timeout || TIMEOUT;
  delete options._timeout;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  }
}

/**
 * Fetch all categories.
 *   shuffle: if true, every call returns a different random selection of items
 *            from a bigger pool (varied sorts + pages). Bypasses cache.
 *   refresh: if true, force a fresh fetch from Archive.org and update the cache.
 */
export async function getCategories({ shuffle = false, refresh = false } = {}) {
  const params = new URLSearchParams();
  if (shuffle) params.set("shuffle", "true");
  if (refresh) params.set("refresh", "true");
  const qs = params.toString();
  return request(`/api/categories${qs ? "?" + qs : ""}`);
}

export async function getCategoryItems(categoryId, page = 1, rows = 25) {
  return request(`/api/category/${categoryId}?page=${page}&rows=${rows}`);
}

/**
 * Search. Optional category filter narrows to that collection.
 * Either query (>=2 chars) or category is required.
 */
export async function searchItems(query, opts = {}) {
  const { page = 1, rows = 25, category, minDuration, maxDuration } = opts;
  const params = new URLSearchParams({ page: String(page), rows: String(rows) });
  if (query && query.length >= 2) params.set("q", query);
  if (category) params.set("category", category);
  if (minDuration) params.set("minDuration", String(minDuration));
  if (maxDuration) params.set("maxDuration", String(maxDuration));
  return request(`/api/search?${params.toString()}`);
}

export async function getItem(identifier) {
  return request(`/api/item/${identifier}`);
}

export async function getRandomItem() {
  return request("/api/random");
}

/** Rabbit hole — items similar to the one the user just watched */
export async function getRelated(identifier, limit = 15) {
  return request(`/api/related/${encodeURIComponent(identifier)}?limit=${limit}`);
}

/** Wake the server from Render free-tier sleep — hits lightweight /health */
export async function wakeUp() {
  // Use the health endpoint — it returns instantly without hitting Archive.org.
  // The heavy /api/categories call happens AFTER the server is confirmed awake.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LONG_TIMEOUT);
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Wake-up timed out after 60s");
    throw err;
  }
}

// ── Hearts ─────────────────────────────────────────────────

export async function heartItem(item) {
  return request(`/api/hearts/${encodeURIComponent(item.id)}`, {
    method: "POST",
    body: JSON.stringify({
      title: item.title,
      thumbnail: item.thumbnail,
      creator: Array.isArray(item.creator) ? item.creator[0] : item.creator,
      year: item.year,
    }),
  });
}

export async function unheartItem(itemId) {
  return request(`/api/hearts/${encodeURIComponent(itemId)}`, { method: "DELETE" });
}

export async function getTopHearts(limit = 30) {
  return request(`/api/hearts/top?limit=${limit}`);
}

// ── Auth ──────────────────────────────────────────────────

export async function register(email, password, opts = {}) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, ...opts }),
  });
}

export async function login(email, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function loginAnonymous(generation) {
  return request("/api/auth/anonymous", {
    method: "POST",
    body: JSON.stringify({ generation }),
  });
}

export async function refreshToken(refresh_token) {
  return request("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token }),
  });
}

export async function getProfile() {
  return request("/api/auth/profile");
}

export async function updateProfile(updates) {
  return request("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

// ── Sync ──────────────────────────────────────────────────

export async function syncHistory(items) {
  return request("/api/sync/history", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function syncWatchlist(items) {
  return request("/api/sync/watchlist", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function syncHearts(items) {
  return request("/api/sync/hearts", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function syncGame(state) {
  return request("/api/sync/game", {
    method: "POST",
    body: JSON.stringify(state),
  });
}

export async function syncPull() {
  return request("/api/sync/pull");
}

// ── X-Ray (Contributions) ────────────────────────────────

/** Get all community-contributed metadata for an item */
export async function getXRay(itemId) {
  return request(`/api/xray/${encodeURIComponent(itemId)}`);
}

/** Add a contribution to an item's X-Ray data */
export async function contribute(itemId, { field_type, field_value, field_extra }) {
  return request(`/api/xray/${encodeURIComponent(itemId)}`, {
    method: "POST",
    body: JSON.stringify({ field_type, field_value, field_extra }),
  });
}

/** Get current user's contribution stats */
export async function getContributionStats() {
  return request("/api/xray/user/stats");
}

export default {
  getCategories, getCategoryItems, searchItems, getItem, getRandomItem,
  getRelated, wakeUp, heartItem, unheartItem, getTopHearts,
  setAuthToken, register, login, loginAnonymous, refreshToken,
  getProfile, updateProfile,
  syncHistory, syncWatchlist, syncHearts, syncGame, syncPull,
  getXRay, contribute, getContributionStats,
};
