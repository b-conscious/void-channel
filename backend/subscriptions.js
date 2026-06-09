/**
 * Subscriptions — follow categories/collections.
 *
 * Routes:
 *   GET    /api/subscriptions              — list user's subscriptions
 *   POST   /api/subscriptions              — subscribe to a category
 *   DELETE /api/subscriptions/:categoryId  — unsubscribe
 *   GET    /api/subscriptions/feed         — items from subscribed categories
 */

const express = require("express");
const { supabase, requireAuth } = require("./supabase");
const archive = require("./archive");

const router = express.Router();

router.use(requireAuth);

// ── List subscriptions ────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", req.user.id)
      .order("subscribed_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("[subscriptions] list:", err.message);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

// ── Subscribe to category ─────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const { category_id } = req.body;
    if (!category_id) {
      return res.status(400).json({ error: "category_id is required" });
    }

    // Validate category exists
    const cat = archive.CATEGORIES.find((c) => c.id === category_id);
    if (!cat) {
      return res.status(400).json({ error: "Unknown category" });
    }

    // Limit: 30 subscriptions
    const { count } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user.id);

    if (count >= 30) {
      return res.status(400).json({ error: "Maximum 30 subscriptions" });
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .upsert({
        user_id: req.user.id,
        category_id,
        category_name: cat.name,
      }, { onConflict: "user_id,category_id" })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error("[subscriptions] subscribe:", err.message);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// ── Unsubscribe ───────────────────────────────────────────

router.delete("/:categoryId", async (req, res) => {
  try {
    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", req.user.id)
      .eq("category_id", req.params.categoryId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[subscriptions] unsubscribe:", err.message);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

// ── Subscription feed — items from followed categories ────

router.get("/feed", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const rows = Math.min(parseInt(req.query.rows) || 20, 50);

    // Get user's subscriptions
    const { data: subs, error: subErr } = await supabase
      .from("subscriptions")
      .select("category_id")
      .eq("user_id", req.user.id);

    if (subErr) throw subErr;

    if (!subs || subs.length === 0) {
      return res.json({ items: [], page, total: 0, message: "No subscriptions yet" });
    }

    // Fetch items from each subscribed category (round-robin blend)
    const categoryIds = subs.map((s) => s.category_id);
    const perCategory = Math.max(2, Math.ceil(rows / categoryIds.length));

    const fetches = categoryIds.map((catId) =>
      archive.getCategoryItems(catId, perCategory, page).catch(() => ({ items: [] }))
    );

    const results = await Promise.all(fetches);

    // Interleave items from different categories
    const allItems = [];
    const maxLen = Math.max(...results.map((r) => (r.items || []).length));
    for (let i = 0; i < maxLen; i++) {
      for (const result of results) {
        const items = result.items || [];
        if (i < items.length) {
          // Deduplicate
          if (!allItems.some((existing) => existing.id === items[i].id)) {
            allItems.push(items[i]);
          }
        }
      }
    }

    res.json({
      items: allItems.slice(0, rows),
      page,
      total: allItems.length,
      categories: categoryIds.length,
    });
  } catch (err) {
    console.error("[subscriptions] feed:", err.message);
    res.status(500).json({ error: "Failed to fetch subscription feed" });
  }
});

module.exports = router;
