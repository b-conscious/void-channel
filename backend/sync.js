/**
 * Sync routes — merge device data with cloud.
 *
 * Strategy: newest timestamp wins on conflict.
 * Bulk upsert via ON CONFLICT for efficiency.
 */

const express = require("express");
const { supabase, optionalAuth, requireAuth } = require("./supabase");

const router = express.Router();

// Apply auth to all sync routes
router.use(optionalAuth, requireAuth);

// ── Push: History ──────────────────────────────────────────

router.post("/history", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Sync not configured" });

  const { items } = req.body; // array of { item_id, item_title, item_thumbnail, item_year, item_creator, watched_at, watch_duration_seconds, category_id }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array required" });
  }

  try {
    const rows = items.slice(0, 500).map((i) => ({
      user_id: req.user.id,
      item_id: i.item_id || i.id,
      item_title: i.item_title || i.title,
      item_thumbnail: i.item_thumbnail || i.thumbnail,
      item_year: i.item_year || i.year,
      item_creator: i.item_creator || i.creator,
      watched_at: i.watched_at || i.watchedAt || new Date().toISOString(),
      watch_duration_seconds: i.watch_duration_seconds || 0,
      category_id: i.category_id || i.categoryId || null,
    }));

    const { error } = await supabase
      .from("watch_history")
      .upsert(rows, { onConflict: "user_id,item_id" });

    if (error) throw error;
    res.json({ synced: rows.length });
  } catch (err) {
    console.error("[sync/history]", err);
    res.status(500).json({ error: "History sync failed" });
  }
});

// ── Push: Watchlist ────────────────────────────────────────

router.post("/watchlist", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Sync not configured" });

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array required" });
  }

  try {
    const rows = items.slice(0, 500).map((i) => ({
      user_id: req.user.id,
      item_id: i.item_id || i.id,
      item_title: i.item_title || i.title,
      item_thumbnail: i.item_thumbnail || i.thumbnail,
      item_year: i.item_year || i.year,
      item_creator: i.item_creator || i.creator,
      added_at: i.added_at || i.addedAt || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("watchlist")
      .upsert(rows, { onConflict: "user_id,item_id" });

    if (error) throw error;
    res.json({ synced: rows.length });
  } catch (err) {
    console.error("[sync/watchlist]", err);
    res.status(500).json({ error: "Watchlist sync failed" });
  }
});

// ── Push: Hearts ───────────────────────────────────────────

router.post("/hearts", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Sync not configured" });

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array required" });
  }

  try {
    const rows = items.slice(0, 500).map((i) => ({
      user_id: req.user.id,
      item_id: i.item_id || i.id,
      item_title: i.item_title || i.title,
      item_thumbnail: i.item_thumbnail || i.thumbnail,
      item_creator: i.item_creator || i.creator,
      item_year: i.item_year || i.year,
      hearted_at: i.hearted_at || i.heartedAt || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("hearts")
      .upsert(rows, { onConflict: "user_id,item_id" });

    if (error) throw error;
    res.json({ synced: rows.length });
  } catch (err) {
    console.error("[sync/hearts]", err);
    res.status(500).json({ error: "Hearts sync failed" });
  }
});

// ── Push: XP + Game State ──────────────────────────────────

router.post("/game", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Sync not configured" });

  const { xp, rank, generation } = req.body;

  try {
    // Use the higher of local vs cloud XP
    const { data: current } = await supabase
      .from("profiles")
      .select("xp")
      .eq("id", req.user.id)
      .single();

    const cloudXP = current?.xp || 0;
    const finalXP = Math.max(cloudXP, xp || 0);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        xp: finalXP,
        rank: rank || undefined,
        generation: generation || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ xp: data.xp, rank: data.rank });
  } catch (err) {
    console.error("[sync/game]", err);
    res.status(500).json({ error: "Game state sync failed" });
  }
});

// ── Pull: Everything ───────────────────────────────────────

router.get("/pull", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Sync not configured" });

  try {
    const userId = req.user.id;

    const [historyRes, watchlistRes, heartsRes, profileRes] = await Promise.all([
      supabase
        .from("watch_history")
        .select("*")
        .eq("user_id", userId)
        .order("watched_at", { ascending: false })
        .limit(200),
      supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", userId)
        .order("added_at", { ascending: false })
        .limit(500),
      supabase
        .from("hearts")
        .select("*")
        .eq("user_id", userId)
        .order("hearted_at", { ascending: false })
        .limit(500),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single(),
    ]);

    res.json({
      profile: profileRes.data,
      history: historyRes.data || [],
      watchlist: watchlistRes.data || [],
      hearts: heartsRes.data || [],
    });
  } catch (err) {
    console.error("[sync/pull]", err);
    res.status(500).json({ error: "Pull failed" });
  }
});

module.exports = router;
