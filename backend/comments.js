/**
 * Comments — threaded comments on Archive items.
 *
 * Routes:
 *   GET  /api/items/:itemId/comments      — paginated comments for an item
 *   POST /api/items/:itemId/comments      — post a comment (auth required)
 *   PATCH /api/comments/:id               — edit own comment (auth required)
 *   DELETE /api/comments/:id              — soft-delete own comment (auth required)
 *
 * Storage: Supabase `comments` table. Falls back to in-memory if Supabase unavailable.
 */

const express = require("express");
const { supabase, requireAuth } = require("./supabase");

const router = express.Router();

// In-memory fallback when Supabase isn't configured
let memComments = []; // [{ id, item_id, user_id, username, body, created_at, upvote_count, is_deleted }]

// ── GET comments for an item ────────────────────────────
router.get("/items/:itemId/comments", async (req, res) => {
  try {
    const { itemId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;
    const sort = req.query.sort === "newest" ? "newest" : "top";

    if (supabase) {
      let query = supabase
        .from("comments")
        .select("id, item_id, user_id, body, upvote_count, reply_count, is_edited, is_deleted, created_at, parent_id, profiles(username, display_name, avatar_url, rank)")
        .eq("item_id", itemId)
        .is("parent_id", null) // top-level only
        .eq("is_deleted", false)
        .range(offset, offset + limit - 1);

      if (sort === "top") {
        query = query.order("upvote_count", { ascending: false }).order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;

      const comments = (data || []).map((c) => ({
        id: c.id,
        item_id: c.item_id,
        user_id: c.user_id,
        body: c.body,
        username: c.profiles?.username || c.profiles?.display_name || "anon",
        avatar_url: c.profiles?.avatar_url || null,
        rank: c.profiles?.rank || "wanderer",
        upvote_count: c.upvote_count || 0,
        reply_count: c.reply_count || 0,
        is_edited: c.is_edited || false,
        created_at: c.created_at,
      }));

      return res.json({ comments, page, hasMore: comments.length === limit });
    }

    // Fallback: in-memory
    const filtered = memComments
      .filter((c) => c.item_id === itemId && !c.is_deleted && !c.parent_id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);

    res.json({ comments: filtered, page, hasMore: filtered.length === limit });
  } catch (err) {
    console.error("[comments/get]", err.message);
    res.json({ comments: [], page: 1, hasMore: false });
  }
});

// ── GET replies to a comment ────────────────────────────
router.get("/comments/:id/replies", async (req, res) => {
  try {
    const { id } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from("comments")
        .select("id, item_id, user_id, body, upvote_count, is_edited, is_deleted, created_at, parent_id, profiles(username, display_name, avatar_url, rank)")
        .eq("parent_id", id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;

      const replies = (data || []).map((c) => ({
        id: c.id,
        user_id: c.user_id,
        body: c.body,
        username: c.profiles?.username || c.profiles?.display_name || "anon",
        avatar_url: c.profiles?.avatar_url || null,
        rank: c.profiles?.rank || "wanderer",
        upvote_count: c.upvote_count || 0,
        is_edited: c.is_edited || false,
        created_at: c.created_at,
      }));

      return res.json({ replies });
    }

    const replies = memComments
      .filter((c) => c.parent_id === id && !c.is_deleted)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ replies });
  } catch (err) {
    console.error("[comments/replies]", err.message);
    res.json({ replies: [] });
  }
});

// ── POST a comment (auth required) ─────────────────────
router.post("/items/:itemId/comments", requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { body, parent_id } = req.body;

    if (!body || body.trim().length === 0) {
      return res.status(400).json({ error: "Comment body is required" });
    }
    if (body.length > 2000) {
      return res.status(400).json({ error: "Comment too long (max 2000 chars)" });
    }

    if (supabase) {
      // Rate limit: 10 comments per hour
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.user.id)
        .gte("created_at", oneHourAgo);

      if (count >= 10) {
        return res.status(429).json({ error: "Rate limit: max 10 comments per hour" });
      }

      const insert = {
        item_id: itemId,
        user_id: req.user.id,
        body: body.trim(),
        parent_id: parent_id || null,
      };

      const { data, error } = await supabase
        .from("comments")
        .insert(insert)
        .select("id, item_id, user_id, body, created_at")
        .single();

      if (error) throw error;

      // If it's a reply, increment reply_count on parent
      if (parent_id) {
        await supabase.rpc("increment_reply_count", { comment_id: parent_id }).catch(() => {});
      }

      console.log(`[comments] ${req.user.email} commented on ${itemId}`);
      return res.json({ comment: data });
    }

    // Fallback: in-memory
    const comment = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      item_id: itemId,
      user_id: req.user.id,
      username: req.user.email?.split("@")[0] || "anon",
      body: body.trim(),
      parent_id: parent_id || null,
      upvote_count: 0,
      reply_count: 0,
      is_edited: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
    };
    memComments.unshift(comment);
    // Cap memory at 1000 comments
    if (memComments.length > 1000) memComments = memComments.slice(0, 1000);

    res.json({ comment });
  } catch (err) {
    console.error("[comments/post]", err.message);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

// ── PATCH own comment (edit) ────────────────────────────
router.patch("/comments/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body || body.trim().length === 0) {
      return res.status(400).json({ error: "Comment body is required" });
    }
    if (body.length > 2000) {
      return res.status(400).json({ error: "Comment too long (max 2000 chars)" });
    }

    if (supabase) {
      const { data, error } = await supabase
        .from("comments")
        .update({ body: body.trim(), is_edited: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", req.user.id)
        .select("id, body, is_edited")
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Comment not found or not yours" });

      return res.json({ comment: data });
    }

    // Fallback
    const comment = memComments.find((c) => c.id === id && c.user_id === req.user.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    comment.body = body.trim();
    comment.is_edited = true;
    res.json({ comment });
  } catch (err) {
    console.error("[comments/patch]", err.message);
    res.status(500).json({ error: "Failed to edit comment" });
  }
});

// ── DELETE own comment (soft delete) ────────────────────
router.delete("/comments/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from("comments")
        .update({ is_deleted: true, body: "[deleted]" })
        .eq("id", id)
        .eq("user_id", req.user.id)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Comment not found or not yours" });

      return res.json({ ok: true });
    }

    // Fallback
    const comment = memComments.find((c) => c.id === id && c.user_id === req.user.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    comment.is_deleted = true;
    comment.body = "[deleted]";
    res.json({ ok: true });
  } catch (err) {
    console.error("[comments/delete]", err.message);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

module.exports = router;
