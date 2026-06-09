/**
 * Playlists — user-created video collections.
 *
 * Routes:
 *   GET    /api/playlists              — list current user's playlists
 *   POST   /api/playlists              — create a playlist
 *   GET    /api/playlists/:id          — get a single playlist with items
 *   PATCH  /api/playlists/:id          — update title/description/public
 *   DELETE /api/playlists/:id          — delete playlist
 *   POST   /api/playlists/:id/items    — add item to playlist
 *   DELETE /api/playlists/:id/items/:itemId — remove item
 *   POST   /api/playlists/:id/reorder  — reorder items
 */

const express = require("express");
const { supabase, requireAuth } = require("./supabase");

const router = express.Router();

// All playlist routes require auth
router.use(requireAuth);

// ── List user's playlists ─────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("playlists")
      .select("*")
      .eq("user_id", req.user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("[playlists] list:", err.message);
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

// ── Create playlist ───────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const { title, description, is_public } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    // Limit: 50 playlists per user
    const { count } = await supabase
      .from("playlists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user.id);

    if (count >= 50) {
      return res.status(400).json({ error: "Maximum 50 playlists reached" });
    }

    const { data, error } = await supabase
      .from("playlists")
      .insert({
        user_id: req.user.id,
        title: title.trim().slice(0, 100),
        description: (description || "").trim().slice(0, 500) || null,
        is_public: !!is_public,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error("[playlists] create:", err.message);
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

// ── Get single playlist with items ────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: playlist, error: pErr } = await supabase
      .from("playlists")
      .select("*")
      .eq("id", id)
      .single();

    if (pErr || !playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Only owner or public — anonymous users can view public playlists
    const isOwner = req.user && playlist.user_id === req.user.id;
    if (!isOwner && !playlist.is_public) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    const { data: items, error: iErr } = await supabase
      .from("playlist_items")
      .select("*")
      .eq("playlist_id", id)
      .order("position", { ascending: true });

    if (iErr) throw iErr;

    res.json({ ...playlist, items: items || [] });
  } catch (err) {
    console.error("[playlists] get:", err.message);
    res.status(500).json({ error: "Failed to fetch playlist" });
  }
});

// ── Update playlist ───────────────────────────────────────

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title.trim().slice(0, 100);
    if (req.body.description !== undefined) updates.description = (req.body.description || "").trim().slice(0, 500) || null;
    if (req.body.is_public !== undefined) updates.is_public = !!req.body.is_public;
    if (req.body.cover_thumbnail !== undefined) updates.cover_thumbnail = req.body.cover_thumbnail;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("playlists")
      .update(updates)
      .eq("id", id)
      .eq("user_id", req.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Playlist not found" });

    res.json(data);
  } catch (err) {
    console.error("[playlists] update:", err.message);
    res.status(500).json({ error: "Failed to update playlist" });
  }
});

// ── Delete playlist ───────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("playlists")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[playlists] delete:", err.message);
    res.status(500).json({ error: "Failed to delete playlist" });
  }
});

// ── Add item to playlist ──────────────────────────────────

router.post("/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const { item_id, item_title, item_thumbnail, item_year, item_creator } = req.body;

    if (!item_id) {
      return res.status(400).json({ error: "item_id is required" });
    }

    // Verify ownership
    const { data: playlist } = await supabase
      .from("playlists")
      .select("id, user_id")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .single();

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Get next position
    const { data: lastItem } = await supabase
      .from("playlist_items")
      .select("position")
      .eq("playlist_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .single();

    const position = (lastItem?.position ?? -1) + 1;

    // Limit: 200 items per playlist
    if (position >= 200) {
      return res.status(400).json({ error: "Maximum 200 items per playlist" });
    }

    const { data, error } = await supabase
      .from("playlist_items")
      .upsert({
        playlist_id: id,
        item_id,
        item_title: item_title || item_id,
        item_thumbnail: item_thumbnail || null,
        item_year: item_year || null,
        item_creator: item_creator || null,
        position,
      }, { onConflict: "playlist_id,item_id" })
      .select()
      .single();

    if (error) throw error;

    // Set cover thumbnail if first item
    if (position === 0 && item_thumbnail) {
      await supabase
        .from("playlists")
        .update({ cover_thumbnail: item_thumbnail })
        .eq("id", id);
    }

    res.status(201).json(data);
  } catch (err) {
    console.error("[playlists] add item:", err.message);
    res.status(500).json({ error: "Failed to add item" });
  }
});

// ── Remove item from playlist ─────────────────────────────

router.delete("/:id/items/:itemId", async (req, res) => {
  try {
    const { id, itemId } = req.params;

    // Verify ownership
    const { data: playlist } = await supabase
      .from("playlists")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .single();

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    const { error } = await supabase
      .from("playlist_items")
      .delete()
      .eq("playlist_id", id)
      .eq("item_id", itemId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[playlists] remove item:", err.message);
    res.status(500).json({ error: "Failed to remove item" });
  }
});

// ── Reorder playlist items ────────────────────────────────

router.post("/:id/reorder", async (req, res) => {
  try {
    const { id } = req.params;
    const { item_ids } = req.body; // ordered array of item_id strings

    if (!Array.isArray(item_ids)) {
      return res.status(400).json({ error: "item_ids array is required" });
    }

    // Verify ownership
    const { data: playlist } = await supabase
      .from("playlists")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .single();

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Update positions in batch
    const updates = item_ids.map((item_id, index) =>
      supabase
        .from("playlist_items")
        .update({ position: index })
        .eq("playlist_id", id)
        .eq("item_id", item_id)
    );

    await Promise.all(updates);
    res.json({ ok: true });
  } catch (err) {
    console.error("[playlists] reorder:", err.message);
    res.status(500).json({ error: "Failed to reorder" });
  }
});

module.exports = router;
