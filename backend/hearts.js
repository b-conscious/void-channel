/**
 * Hearts — global tally of which Archive items users have favorited.
 *
 * Persistence: a simple JSON file on disk. Plenty for hobby scale.
 * Migrate to SQLite/Postgres when this becomes a real bottleneck.
 *
 * Schema: { items: { [itemId]: { count, title, thumbnail, creator, year, lastHearted } } }
 */

const fs = require("fs");
const path = require("path");

const HEARTS_FILE = process.env.HEARTS_FILE || path.join(__dirname, "hearts.json");
let data = { items: {} };
let dirty = false;
let flushTimer = null;

function load() {
  try {
    const raw = fs.readFileSync(HEARTS_FILE, "utf8");
    data = JSON.parse(raw);
    if (!data.items) data.items = {};
  } catch {
    // File doesn't exist yet — start with empty state
    data = { items: {} };
  }
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    if (dirty) {
      try {
        fs.writeFileSync(HEARTS_FILE, JSON.stringify(data, null, 2));
        dirty = false;
      } catch (e) {
        console.error("[hearts] flush failed:", e);
      }
    }
    flushTimer = null;
  }, 500); // batch writes
}

function heart(item) {
  const id = item.id;
  if (!id) return null;
  if (!data.items[id]) {
    data.items[id] = {
      count: 0,
      title: item.title || "Untitled",
      thumbnail: item.thumbnail || null,
      creator: item.creator || null,
      year: item.year || null,
      firstHearted: Date.now(),
    };
  }
  data.items[id].count = (data.items[id].count || 0) + 1;
  data.items[id].lastHearted = Date.now();
  scheduleFlush();
  return { id, ...data.items[id] };
}

function unheart(itemId) {
  if (!data.items[itemId]) return null;
  data.items[itemId].count = Math.max(0, (data.items[itemId].count || 0) - 1);
  scheduleFlush();
  return { id: itemId, ...data.items[itemId] };
}

function getTop(limit = 30) {
  return Object.entries(data.items)
    .filter(([_, v]) => (v.count || 0) > 0)
    .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
    .slice(0, limit)
    .map(([id, v]) => ({
      id,
      title: v.title,
      thumbnail: v.thumbnail,
      creator: v.creator,
      year: v.year,
      hearts: v.count,
      archiveUrl: `https://archive.org/details/${id}`,
    }));
}

function getCount(itemId) {
  return data.items[itemId]?.count || 0;
}

function resetAll() {
  const count = Object.keys(data.items).length;
  data = { items: {} };
  scheduleFlush();
  return count;
}

load();

module.exports = { heart, unheart, getTop, getCount, resetAll };
