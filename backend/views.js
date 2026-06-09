/**
 * Views — our own view counter, starting from zero.
 *
 * Counts every play event. Stored in a JSON file (same pattern as hearts.js).
 * No auth required — anonymous counting.
 *
 * Routes (mounted in server.js):
 *   POST /api/views/:id          — increment view count (fire-and-forget from player)
 *   GET  /api/views/:id          — get view count for a single item
 *   GET  /api/views/top?limit=N  — most-viewed items
 *   GET  /api/views/recent       — recently viewed (last 50 unique items)
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "views.json");

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// In-memory store — persisted to disk periodically
let viewData = {}; // { [itemId]: { count, title, thumbnail, creator, year, firstViewed, lastViewed } }
let recentViews = []; // last 100 unique item IDs with timestamps
let dirty = false;

// Load from disk on startup
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    viewData = raw.views || {};
    recentViews = raw.recent || [];
    console.log(`  → Loaded ${Object.keys(viewData).length} view records`);
  }
} catch (err) {
  console.warn("[views] Failed to load data file:", err.message);
}

// Save to disk every 30 seconds if dirty
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ views: viewData, recent: recentViews }, null, 2));
  } catch (err) {
    console.warn("[views] Failed to save:", err.message);
  }
}, 30000);

/**
 * Record a view. Returns the new count.
 */
function recordView(itemId, meta = {}) {
  const now = new Date().toISOString();
  if (!viewData[itemId]) {
    viewData[itemId] = {
      count: 0,
      title: meta.title || itemId,
      thumbnail: meta.thumbnail || null,
      creator: meta.creator || null,
      year: meta.year || null,
      firstViewed: now,
      lastViewed: now,
    };
  }

  const entry = viewData[itemId];
  entry.count += 1;
  entry.lastViewed = now;
  // Update metadata if provided (in case first view had no meta)
  if (meta.title && meta.title !== itemId) entry.title = meta.title;
  if (meta.thumbnail) entry.thumbnail = meta.thumbnail;
  if (meta.creator) entry.creator = meta.creator;
  if (meta.year) entry.year = meta.year;

  // Track in recent list (deduplicate, keep last 100)
  recentViews = recentViews.filter((r) => r.id !== itemId);
  recentViews.unshift({ id: itemId, at: now });
  if (recentViews.length > 100) recentViews = recentViews.slice(0, 100);

  dirty = true;
  return entry.count;
}

/**
 * Get view count for a single item.
 */
function getCount(itemId) {
  return viewData[itemId]?.count || 0;
}

/**
 * Get top-viewed items.
 */
function getTop(limit = 30) {
  return Object.entries(viewData)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, limit)
    .map(([id, data]) => ({
      id,
      title: data.title,
      thumbnail: data.thumbnail,
      creator: data.creator,
      year: data.year,
      views: data.count,
      lastViewed: data.lastViewed,
    }));
}

/**
 * Get recently viewed items.
 */
function getRecent(limit = 50) {
  return recentViews.slice(0, limit).map((r) => ({
    id: r.id,
    ...(viewData[r.id] || {}),
    views: viewData[r.id]?.count || 0,
  }));
}

/**
 * Get total views across all items.
 */
function getTotalViews() {
  return Object.values(viewData).reduce((sum, v) => sum + v.count, 0);
}

module.exports = { recordView, getCount, getTop, getRecent, getTotalViews };
