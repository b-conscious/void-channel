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
  // Categories fetches 47 collections from Archive.org — can take 2+ min on cold cache
  return request(`/api/categories${qs ? "?" + qs : ""}`, { _timeout: 180000 });
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

/**
 * Browse all items in an Archive.org collection (e.g. "betty_boop_cartoons").
 * Used for "More from this show/series" on the player screen.
 */
export async function searchCollection(collectionId, query = '', opts = {}) {
  const { page = 1, rows = 30 } = opts;
  const params = new URLSearchParams({ page: String(page), rows: String(rows), collection: collectionId });
  if (query && query.length >= 2) params.set('q', query);
  return request(`/api/search?${params.toString()}`);
}

/**
 * Find all items by a specific creator/studio.
 * Used for "More by this creator" on the player screen.
 */
export async function searchCreator(creator, opts = {}) {
  const { page = 1, rows = 30 } = opts;
  const params = new URLSearchParams({ page: String(page), rows: String(rows), creator });
  return request(`/api/search?${params.toString()}`);
}

export async function getItem(identifier) {
  return request(`/api/item/${identifier}`);
}

/** Shorts — short-form content under 2 min (YouTube Shorts equivalent) */
export async function getShorts(limit = 15) {
  return request(`/api/shorts?limit=${limit}`);
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

// ── Views ────────────────────────────────────────────────

/** Record a view — fire-and-forget from PlayerScreen */
export async function recordView(itemId, meta = {}) {
  return request(`/api/views/${encodeURIComponent(itemId)}`, {
    method: "POST",
    body: JSON.stringify(meta),
  });
}

/** Get view count for a single item */
export async function getViewCount(itemId) {
  return request(`/api/views/count/${encodeURIComponent(itemId)}`);
}

/** Get most-viewed items on Void Channel */
export async function getTopViewed(limit = 30) {
  return request(`/api/views/top?limit=${limit}`);
}

/** Get total views across all items */
export async function getViewStats() {
  return request("/api/views/stats");
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

// ── Playlists ───────────────────────────────────────────

/** List current user's playlists */
export async function getPlaylists() {
  return request("/api/playlists");
}

/** Create a new playlist */
export async function createPlaylist(title, description = "", is_public = false) {
  return request("/api/playlists", {
    method: "POST",
    body: JSON.stringify({ title, description, is_public }),
  });
}

/** Get a single playlist with all its items */
export async function getPlaylist(playlistId) {
  return request(`/api/playlists/${playlistId}`);
}

/** Update playlist metadata */
export async function updatePlaylist(playlistId, updates) {
  return request(`/api/playlists/${playlistId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** Delete a playlist */
export async function deletePlaylist(playlistId) {
  return request(`/api/playlists/${playlistId}`, { method: "DELETE" });
}

/** Add item to a playlist */
export async function addToPlaylist(playlistId, item) {
  return request(`/api/playlists/${playlistId}/items`, {
    method: "POST",
    body: JSON.stringify({
      item_id: item.id,
      item_title: item.title,
      item_thumbnail: item.thumbnail,
      item_year: item.year,
      item_creator: Array.isArray(item.creator) ? item.creator[0] : item.creator,
    }),
  });
}

/** Remove item from a playlist */
export async function removeFromPlaylist(playlistId, itemId) {
  return request(`/api/playlists/${playlistId}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

/** Reorder playlist items */
export async function reorderPlaylist(playlistId, itemIds) {
  return request(`/api/playlists/${playlistId}/reorder`, {
    method: "POST",
    body: JSON.stringify({ item_ids: itemIds }),
  });
}

// ── Subscriptions ───────────────────────────────────────

/** List user's subscriptions */
export async function getSubscriptions() {
  return request("/api/subscriptions");
}

/** Subscribe to a category */
export async function subscribe(categoryId) {
  return request("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify({ category_id: categoryId }),
  });
}

/** Unsubscribe from a category */
export async function unsubscribe(categoryId) {
  return request(`/api/subscriptions/${encodeURIComponent(categoryId)}`, {
    method: "DELETE",
  });
}

/** Get subscription feed — items from followed categories */
export async function getSubscriptionFeed(page = 1, rows = 20) {
  return request(`/api/subscriptions/feed?page=${page}&rows=${rows}`);
}

// ── Watch Events & Discovery ────────────────────────────

/** Fire a watch event (start/progress/complete/skip) */
export async function sendWatchEvent(event) {
  return request("/api/watch-events", {
    method: "POST",
    body: JSON.stringify(event),
  });
}

/** Get trending items (most-watched in last 48h) */
export async function getTrending(limit = 20) {
  return request(`/api/trending?limit=${limit}`);
}

/** Get personalized "For You" recommendations (requires auth) */
export async function getRecommendations(limit = 20) {
  return request(`/api/recommendations?limit=${limit}`);
}

// ── Comments ────────────────────────────────────────────

/** Get comments for an item */
export async function getComments(itemId, page = 1, sort = "newest") {
  return request(`/api/items/${encodeURIComponent(itemId)}/comments?page=${page}&sort=${sort}`);
}

/** Post a comment on an item */
export async function postComment(itemId, body, parent_id = null) {
  return request(`/api/items/${encodeURIComponent(itemId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, parent_id }),
  });
}

/** Edit own comment */
export async function editComment(commentId, body) {
  return request(`/api/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

/** Delete own comment (soft delete) */
export async function deleteComment(commentId) {
  return request(`/api/comments/${commentId}`, { method: "DELETE" });
}

/** Get replies to a comment */
export async function getCommentReplies(commentId) {
  return request(`/api/comments/${commentId}/replies`);
}

// ── Admin ───────────────────────────────────────────────

/** Get admin dashboard stats */
export async function adminDashboard() {
  return request("/api/admin/dashboard");
}

/** Wipe all view/trending data */
export async function adminWipeViews() {
  return request("/api/admin/views", { method: "DELETE" });
}

/** Wipe all heart data */
export async function adminWipeHearts() {
  return request("/api/admin/hearts", { method: "DELETE" });
}

/** Flush the server-side cache */
export async function adminFlushCache() {
  return request("/api/admin/cache", { method: "DELETE" });
}

/** List registered users */
export async function adminUsers() {
  return request("/api/admin/users");
}

/** Get pending contributions */
export async function adminContributions(status = "pending") {
  return request(`/api/admin/contributions?status=${status}`);
}

/** Approve a contribution */
export async function adminApproveContribution(id) {
  return request(`/api/admin/contributions/${id}/approve`, { method: "POST" });
}

/** Reject a contribution */
export async function adminRejectContribution(id) {
  return request(`/api/admin/contributions/${id}/reject`, { method: "POST" });
}

/** Set a site-wide banner message */
export async function adminSetBanner(message, type = "info") {
  return request("/api/admin/broadcast", {
    method: "POST",
    body: JSON.stringify({ message, type }),
  });
}

/** Clear the site-wide banner */
export async function adminClearBanner() {
  return request("/api/admin/broadcast", { method: "DELETE" });
}

export default {
  getCategories, getCategoryItems, searchItems, searchCollection, searchCreator,
  getItem, getShorts, getRandomItem,
  getRelated, wakeUp, heartItem, unheartItem, getTopHearts,
  setAuthToken, register, login, loginAnonymous, refreshToken,
  getProfile, updateProfile,
  syncHistory, syncWatchlist, syncHearts, syncGame, syncPull,
  getXRay, contribute, getContributionStats,
  recordView, getViewCount, getTopViewed, getViewStats,
  getPlaylists, createPlaylist, getPlaylist, updatePlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist, reorderPlaylist,
  getSubscriptions, subscribe, unsubscribe, getSubscriptionFeed,
  sendWatchEvent, getTrending, getRecommendations,
  getComments, postComment, editComment, deleteComment, getCommentReplies,
  adminDashboard, adminWipeViews, adminWipeHearts, adminFlushCache,
  adminUsers, adminContributions, adminApproveContribution, adminRejectContribution,
  adminSetBanner, adminClearBanner,
};
