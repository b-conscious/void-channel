/**
 * Void Channel — Caching Proxy Server
 * 
 * Architecture Step 1: The app never talks to archive.org directly.
 * This proxy handles all Archive API calls, caches responses,
 * and serves normalized data to the mobile client.
 * 
 * Cache TTLs:
 *   - Category listings: 1 hour (content doesn't change fast)
 *   - Item metadata:     6 hours (static once ingested)
 *   - Search results:    30 min (balance freshness vs load)
 *   - All categories:    1 hour (the big initial payload)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Cache = require("./cache");
const archive = require("./archive");
const hearts = require("./hearts");
const views = require("./views");
const { optionalAuth } = require("./supabase");
const authRoutes = require("./auth");
const syncRoutes = require("./sync");
const xrayRoutes = require("./contributions");
const embedRoutes = require("./embed");
const playlistRoutes = require("./playlists");
const subscriptionRoutes = require("./subscriptions");
const trendingRoutes = require("./trending");
const adminRoutes = require("./admin");
const commentRoutes = require("./comments");

const app = express();
const cache = new Cache(1200); // 20min default TTL (was 1hr — rotate content faster)

const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── Cloudflare CDN edge-cache headers ─────────────────────
// s-maxage = edge (CDN) cache TTL; max-age=0 = browsers always revalidate via CDN
// stale-while-revalidate = CDN serves stale content while fetching fresh in background
// Routes not listed here get no Cache-Control → Cloudflare passes through uncached
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const seg = req.path.split('/');
  const route = seg[2]; // /api/<route>/...
  const sub = seg[3];
  const edge = (ttl) => res.set('Cache-Control', `public, max-age=0, ${ttl}`);

  if      (route === 'item' && sub)                              edge('s-maxage=21600, stale-while-revalidate=3600'); // 6h — static metadata
  else if (route === 'categories' || route === 'category')       edge('s-maxage=1200, stale-while-revalidate=600');   // 20m — matches server cache
  else if (route === 'search')                                   edge('s-maxage=1800, stale-while-revalidate=600');   // 30m
  else if (route === 'shorts')                                   edge('s-maxage=1800, stale-while-revalidate=600');   // 30m
  else if (route === 'related')                                  edge('s-maxage=3600, stale-while-revalidate=600');   // 1h
  else if (route === 'trending')                                 edge('s-maxage=300, stale-while-revalidate=120');    // 5m — fast-changing
  else if ((route === 'hearts' || route === 'views') && sub === 'top')
                                                                 edge('s-maxage=300, stale-while-revalidate=120');    // 5m
  else if ((route === 'hearts' || route === 'views') && (sub === 'count' || sub === 'stats'))
                                                                 edge('s-maxage=300, stale-while-revalidate=60');     // 5m
  else if (route === 'banner')                                   edge('s-maxage=60');                                 // 1m
  else if (route === 'random')                                   res.set('Cache-Control', 'no-store');                // never cache

  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const cached = res.getHeader("X-Cache") || "MISS";
    console.log(`[${req.method}] ${req.path} → ${res.statusCode} (${ms}ms) [${cached}]`);
  });
  next();
});

// ── Auth & Sync ───────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/xray", xrayRoutes);

// Embed / OG-meta pages (served at root, not /api)
app.use(embedRoutes);

// Optional auth on all remaining routes — sets req.user if token present
app.use(optionalAuth);

// Phase 2: Playlists, Subscriptions, Trending, Recommendations
app.use("/api/playlists", playlistRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api", trendingRoutes);

// Comments — public read, auth required for write
app.use("/api", commentRoutes);

// Admin routes — inject cache reference for flush control
app.use("/api/admin", (req, res, next) => { req._cache = cache; next(); }, adminRoutes);

// Public banner endpoint — anyone can read the current site banner
app.get("/api/banner", (req, res) => {
  res.json(adminRoutes.getBanner ? adminRoutes.getBanner() : null);
});

// ── Routes ─────────────────────────────────────────────────

/**
 * GET /api/categories
 * Returns all categories with items — the big initial payload.
 * This is what populates the home screen.
 */
app.get("/api/categories", async (req, res) => {
  try {
    const shuffle = req.query.shuffle === "true";
    const refresh = req.query.refresh === "true";

    // When shuffle is on, don't cache — each call should return different items.
    // When refresh is true, force a fresh fetch and update the cache.
    // Time-bucket: rotate content every 20 minutes so repeat visits show new items.
    const timeBucket = Math.floor(Date.now() / (20 * 60 * 1000));
    const cacheKey = `all_categories:${timeBucket}`;
    if (!shuffle && !refresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const categories = await archive.getAllCategories(15, shuffle);

    // Cache for 20 min (matches the time bucket rotation)
    if (!shuffle) cache.set(cacheKey, categories, 1200);

    res.set("X-Cache", shuffle ? "BYPASS" : refresh ? "REFRESH" : "MISS");
    if (shuffle) res.set("Cache-Control", "no-store"); // bypass CDN for shuffled results
    res.json(categories);
  } catch (err) {
    console.error("[/api/categories]", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

/**
 * GET /api/category/:id
 * Returns items for a single category.
 * Supports pagination via ?page=N&rows=N
 */
app.get("/api/category/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const rows = Math.min(parseInt(req.query.rows) || 25, 50);
    const cacheKey = `cat:${id}:${page}:${rows}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const result = await archive.getCategoryItems(id, rows, page);
    if (result.error) return res.status(404).json(result);

    cache.set(cacheKey, result, 1200); // 20 min (was 1hr)
    res.set("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    console.error(`[/api/category/${req.params.id}]`, err);
    res.status(500).json({ error: "Failed to fetch category" });
  }
});

/**
 * GET /api/search?q=...&page=N&rows=N
 * Full-text search across the Archive, filtered to video.
 */
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const categoryId = req.query.category;
    const collectionId = req.query.collection; // raw Archive.org collection (e.g. betty_boop_cartoons)
    const creatorQuery = req.query.creator;    // creator/studio name
    const hasQ = q.length >= 2;

    // Need at least a query, category, collection, or creator
    if (!hasQ && !categoryId && !collectionId && !creatorQuery) {
      return res.status(400).json({ error: "Query, category, collection, or creator required" });
    }

    const page = parseInt(req.query.page) || 1;
    const rows = Math.min(parseInt(req.query.rows) || 25, 50);
    const minDuration = parseInt(req.query.minDuration) || 0; // seconds
    const maxDuration = parseInt(req.query.maxDuration) || 0; // seconds, 0 = no max
    const cacheKey = `search:${q}:${categoryId || ""}:${collectionId || ""}:${creatorQuery || ""}:${page}:${rows}:${minDuration}:${maxDuration}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    // Build Lucene query
    let lucene;
    if (collectionId) {
      // Raw collection browsing — "more from this show/series"
      lucene = hasQ ? `collection:(${collectionId}) AND (${q})` : `collection:(${collectionId})`;
    } else if (creatorQuery) {
      // Creator search — "more by this studio/director"
      lucene = hasQ ? `creator:(${JSON.stringify(creatorQuery)}) AND (${q})` : `creator:(${JSON.stringify(creatorQuery)})`;
    } else if (categoryId) {
      const cat = archive.CATEGORIES.find((c) => c.id === categoryId);
      if (!cat) return res.status(400).json({ error: "Unknown category" });
      // Strip the trailing mediatype clause from the category's query — we add it once at the end
      const catFilter = cat.query.replace(/\s*AND\s*mediatype:\([^)]+\)/i, "").trim();
      lucene = hasQ ? `(${catFilter}) AND (${q})` : `(${catFilter})`;
    } else {
      lucene = `(${q})`;
    }
    // Append NSFW exclusion unless the user explicitly opted into mature content
    const mature = req.query.mature === "true";
    const nsfwFilter = mature ? "" : " " + archive.NSFW_EXCLUDE;
    // Duration filter — Archive.org `runtime` is in seconds (as a string number)
    let durationFilter = "";
    if (minDuration > 0 && maxDuration > 0) {
      durationFilter = ` AND runtime:[${minDuration} TO ${maxDuration}]`;
    } else if (minDuration > 0) {
      durationFilter = ` AND runtime:[${minDuration} TO 999999]`;
    } else if (maxDuration > 0) {
      durationFilter = ` AND runtime:[0 TO ${maxDuration}]`;
    }
    const searchQuery = `${lucene} AND mediatype:(movies)${nsfwFilter}${durationFilter}`;

    // Determine sort order: collection/creator → downloads, category may override, else default
    let sortOrder;
    if (collectionId || creatorQuery) {
      sortOrder = 'downloads desc';
    } else if (categoryId) {
      const cat = archive.CATEGORIES.find((c) => c.id === categoryId);
      sortOrder = cat?.sort || 'downloads desc';
    }

    const items = await archive.search(searchQuery, rows, page, sortOrder);
    const result = { query: q, category: categoryId || null, collection: collectionId || null, creator: creatorQuery || null, page, rows, items };

    cache.set(cacheKey, result, 1800); // 30 min
    res.set("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    console.error(`[/api/search]`, err);
    res.status(500).json({ error: "Search failed" });
  }
});

/**
 * GET /api/shorts
 * Short-form content — videos under 2 minutes from the Archive.
 * YouTube Shorts equivalent for public domain clips, trailers, newsreels.
 */
app.get("/api/shorts", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const timeBucket = Math.floor(Date.now() / (30 * 60 * 1000)); // 30min rotation
    const cacheKey = `shorts:${limit}:${timeBucket}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    // Short-form: under 120 seconds, sorted by popularity
    const query = `mediatype:(movies) AND runtime:[1 TO 120]${archive.NSFW_EXCLUDE}`;
    const page = Math.floor(Math.random() * 5) + 1; // rotate through pages for variety
    const items = await archive.search(query, limit, page, "downloads desc");

    cache.set(cacheKey, items, 1800); // 30 min cache
    res.set("X-Cache", "MISS");
    res.json(items);
  } catch (err) {
    console.error("[/api/shorts]", err);
    res.status(500).json({ error: "Failed to fetch shorts" });
  }
});

/**
 * GET /api/item/:identifier
 * Full item details including resolved video URL.
 * This is the expensive call — hits the Archive metadata API
 * to find the best MP4 stream URL.
 */
app.get("/api/item/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    const cacheKey = `item:${identifier}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const item = await archive.getItem(identifier);
    cache.set(cacheKey, item, 21600); // 6 hours
    res.set("X-Cache", "MISS");
    res.json(item);
  } catch (err) {
    console.error(`[/api/item/${req.params.identifier}]`, err);
    res.status(500).json({ error: "Failed to fetch item" });
  }
});

/**
 * GET /api/related/:identifier
 * Rabbit hole — items adjacent to the one the user just watched.
 * Uses the item's subjects + collection to surface similar-but-different content.
 */
app.get("/api/related/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 15, 30);
    const cacheKey = `related:${identifier}:${limit}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const items = await archive.getRelated(identifier, limit);
    cache.set(cacheKey, items, 3600); // 1 hour
    res.set("X-Cache", "MISS");
    res.json(items);
  } catch (err) {
    console.error(`[/api/related/${req.params.identifier}]`, err);
    res.status(500).json({ error: "Failed to find related items" });
  }
});

/**
 * GET /api/random
 * Random pick from a random category.
 */
app.get("/api/random", async (req, res) => {
  try {
    const cats = archive.CATEGORIES.filter((c) => !c.mature);
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const page = Math.floor(Math.random() * 5) + 1;
    const items = await archive.search(cat.query, 20, page);

    if (items.length === 0) {
      return res.status(404).json({ error: "No results" });
    }

    const pick = items[Math.floor(Math.random() * items.length)];
    // Resolve the video URL for the random pick
    const full = await archive.getItem(pick.id);
    res.json(full);
  } catch (err) {
    console.error("[/api/random]", err);
    res.status(500).json({ error: "Failed to get random item" });
  }
});

/**
 * GET /api/cache/stats
 * Debug endpoint — cache health check.
 */
app.get("/api/cache/stats", (req, res) => {
  res.json(cache.stats());
});

// ── Hearts ─────────────────────────────────────────────────

/** POST /api/hearts/:id  — body: { title, thumbnail, creator?, year? } */
app.post("/api/hearts/:id", (req, res) => {
  const { id } = req.params;
  const item = { id, ...req.body };
  const result = hearts.heart(item);
  res.json(result || { error: "Invalid id" });
});

/** DELETE /api/hearts/:id — decrement count */
app.delete("/api/hearts/:id", (req, res) => {
  const result = hearts.unheart(req.params.id);
  res.json(result || { ok: true });
});

/** GET /api/hearts/top?limit=N — community library */
app.get("/api/hearts/top", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  res.json(hearts.getTop(limit));
});

/** GET /api/hearts/count/:id — heart count for a single item */
app.get("/api/hearts/count/:id", (req, res) => {
  res.json({ id: req.params.id, hearts: hearts.getCount(req.params.id) });
});

// ── Views ─────────────────────────────────────────────────

/** POST /api/views/:id — record a view (fire from player on load) */
app.post("/api/views/:id", (req, res) => {
  const count = views.recordView(req.params.id, req.body);
  res.json({ id: req.params.id, views: count });
});

/** GET /api/views/:id — get view count */
app.get("/api/views/count/:id", (req, res) => {
  res.json({ id: req.params.id, views: views.getCount(req.params.id) });
});

/** GET /api/views/top — most-viewed on Void Channel */
app.get("/api/views/top", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  res.json(views.getTop(limit));
});

/** GET /api/views/stats — total views across all items */
app.get("/api/views/stats", (req, res) => {
  res.json({ totalViews: views.getTotalViews() });
});

// ── Health Check ───────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Start ──────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n  ⚡ VOID CHANNEL PROXY`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Cache TTL: categories=20m, items=6h, search=30m\n`);

  // Backfill usernames for profiles that have none (one-time on startup)
  try {
    const { supabase } = require("./supabase");
    if (supabase) {
      const { data: nullProfiles } = await supabase
        .from("profiles")
        .select("id")
        .is("username", null)
        .limit(500);
      if (nullProfiles && nullProfiles.length > 0) {
        let patched = 0;
        for (const p of nullProfiles) {
          const clean = p.id.replace(/-/g, '');
          const username = 'void_' + clean.slice(0, 8);
          const { error } = await supabase
            .from("profiles")
            .update({ username })
            .eq("id", p.id)
            .is("username", null); // guard: only if still null
          if (!error) patched++;
        }
        if (patched > 0) console.log(`  → Backfilled ${patched} profile usernames`);
      }
    }
  } catch (err) {
    // Non-fatal — backfill is best-effort
    console.warn("  → Username backfill skipped:", err.message);
  }
});

module.exports = app;
