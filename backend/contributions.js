/**
 * Contributions routes — the X-Ray curation layer.
 *
 * Users earn XP by adding metadata to videos: cast, crew, trivia,
 * historical context, tags, content warnings. Higher-rank users
 * get auto-approved; new users' contributions are approved by default
 * for now (moderation queue comes later with Phase 4).
 *
 * XP rewards:
 *   cast/crew member:    +10 XP
 *   trivia/fun fact:     +15 XP
 *   historical context:  +20 XP
 *   tag:                 +5  XP
 *   content warning:     +5  XP
 *   year correction:     +10 XP
 */

const express = require("express");
const { supabase, optionalAuth, requireAuth } = require("./supabase");

const router = express.Router();

// XP per contribution type
const XP_REWARDS = {
  cast: 10,
  director: 10,
  writer: 10,
  producer: 10,
  trivia: 15,
  context: 20,
  tag: 5,
  warning: 5,
  year: 10,
};

// Human-readable labels
const FIELD_LABELS = {
  cast: "Cast Member",
  director: "Director",
  writer: "Writer",
  producer: "Producer",
  trivia: "Trivia",
  context: "Historical Context",
  tag: "Tag",
  warning: "Content Warning",
  year: "Year Correction",
};

/**
 * GET /api/xray/user/stats
 * Get the current user's contribution stats.
 * NOTE: Must be before /:itemId or Express treats "user" as an itemId.
 */
router.get("/user/stats", optionalAuth, requireAuth, async (req, res) => {
  if (!supabase) return res.json({ total: 0, by_type: {} });

  try {
    const { data, error } = await supabase
      .from("contributions")
      .select("field_type")
      .eq("user_id", req.user.id);

    if (error) throw error;

    const byType = {};
    for (const c of data || []) {
      byType[c.field_type] = (byType[c.field_type] || 0) + 1;
    }

    res.json({
      total: (data || []).length,
      by_type: byType,
    });
  } catch (err) {
    console.error("[xray/stats]", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

/**
 * GET /api/xray/:itemId
 * Get all approved contributions for an item — the X-Ray data.
 * Public — no auth required.
 */
router.get("/:itemId", async (req, res) => {
  if (!supabase) return res.json({ contributions: [] });

  try {
    const { data, error } = await supabase
      .from("contributions")
      .select("id, field_type, field_value, field_extra, created_at, user_id, profiles(display_name, rank)")
      .eq("item_id", req.params.itemId)
      .eq("status", "approved")
      .order("field_type")
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Group by field type for easy rendering
    const grouped = {};
    for (const c of data || []) {
      if (!grouped[c.field_type]) grouped[c.field_type] = [];
      grouped[c.field_type].push({
        id: c.id,
        value: c.field_value,
        extra: c.field_extra,
        contributor: c.profiles?.display_name || "Anonymous",
        rank: c.profiles?.rank || "wanderer",
        date: c.created_at,
      });
    }

    res.json({
      item_id: req.params.itemId,
      contributions: grouped,
      total: (data || []).length,
    });
  } catch (err) {
    console.error("[xray/get]", err);
    res.status(500).json({ error: "Failed to load X-Ray data" });
  }
});

/**
 * POST /api/xray/:itemId
 * Add a contribution. Requires auth.
 * Body: { field_type, field_value, field_extra? }
 */
router.post("/:itemId", optionalAuth, requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Not configured" });

  const { field_type, field_value, field_extra } = req.body;
  const itemId = req.params.itemId;

  // Validate
  if (!field_type || !XP_REWARDS[field_type]) {
    return res.status(400).json({
      error: `Invalid field_type. Must be one of: ${Object.keys(XP_REWARDS).join(", ")}`,
    });
  }
  if (!field_value || field_value.trim().length === 0) {
    return res.status(400).json({ error: "field_value is required" });
  }
  if (field_value.length > 500) {
    return res.status(400).json({ error: "field_value must be under 500 characters" });
  }

  try {
    // Insert contribution
    const { data: contribution, error: insertError } = await supabase
      .from("contributions")
      .insert({
        user_id: req.user.id,
        item_id: itemId,
        field_type,
        field_value: field_value.trim(),
        field_extra: field_extra?.trim() || null,
        status: "approved", // auto-approve for now; moderation comes later
      })
      .select()
      .single();

    if (insertError) {
      // Duplicate check
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
        return res.status(409).json({ error: "This info has already been added" });
      }
      throw insertError;
    }

    // Award XP
    const xpReward = XP_REWARDS[field_type];
    const { data: profile, error: xpError } = await supabase.rpc("increment_xp", {
      user_id_param: req.user.id,
      xp_amount: xpReward,
    });

    // If the RPC doesn't exist yet, fall back to manual update
    if (xpError) {
      await supabase
        .from("profiles")
        .update({
          xp: (req.user.xp || 0) + xpReward,
          contribution_count: (req.user.contribution_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.user.id);
    }

    res.json({
      contribution: {
        id: contribution.id,
        field_type,
        field_value: contribution.field_value,
        field_extra: contribution.field_extra,
      },
      xp_earned: xpReward,
      label: FIELD_LABELS[field_type],
    });
  } catch (err) {
    console.error("[xray/post]", err);
    res.status(500).json({ error: "Failed to save contribution" });
  }
});

module.exports = router;
