/**
 * API Client — talks to the Void Channel proxy.
 * The app never hits archive.org directly.
 */

// Point this at your computer's LAN IP so a real phone can reach the proxy.
// `localhost` from a phone means the phone itself — won't work.
const BASE_URL = __DEV__
  ? "http://10.0.0.25:3001"
  : "https://your-proxy.example.com";

const TIMEOUT = 15000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
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
  const { page = 1, rows = 25, category } = opts;
  const params = new URLSearchParams({ page: String(page), rows: String(rows) });
  if (query && query.length >= 2) params.set("q", query);
  if (category) params.set("category", category);
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

export default {
  getCategories, getCategoryItems, searchItems, getItem, getRandomItem,
  getRelated, heartItem, unheartItem, getTopHearts,
};
