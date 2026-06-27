/**
 * Admin routes — gated to specific email addresses.
 *
 * Controls:
 *   GET    /api/admin/dashboard     — overview stats (views, hearts, cache, users, uptime)
 *   DELETE /api/admin/views         — wipe all view/trending data
 *   DELETE /api/admin/hearts        — wipe all heart data
 *   DELETE /api/admin/cache         — flush the in-memory cache
 *   GET    /api/admin/users         — list registered users (from Supabase)
 *   GET    /api/admin/contributions — pending X-Ray contributions
 *   POST   /api/admin/contributions/:id/approve — approve a contribution
 *   POST   /api/admin/contributions/:id/reject  — reject a contribution
 *   POST   /api/admin/broadcast     — set a site-wide banner message
 *   DELETE /api/admin/broadcast     — clear the banner
 */

const express = require("express");
const { supabase } = require("./supabase");
const views = require("./views");
const hearts = require("./hearts");

const router = express.Router();

// ── Admin emails — only these users can access admin routes ──
const ADMIN_EMAILS = [
  "bryankorth31@gmail.com",
  "preacherb@cashvalues.org",
];

// In-memory banner message (persists until server restart or cleared)
let siteBanner = null; // { message, type, createdAt }

// ── Admin gate middleware ─────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const email = req.user.email || "";
  if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.use(requireAdmin);

// ── Dashboard — one-stop overview ────────────────────────

router.get("/dashboard", async (req, res) => {
  try {
    const stats = {
      uptime: Math.round(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      views: {
        totalItems: Object.keys(views.getTop(99999) || []).length,
        totalViews: views.getTotalViews(),
        top5: views.getTop(5),
        recent5: views.getRecent(5),
      },
      hearts: {
        top5: hearts.getTop(5),
      },
      banner: siteBanner,
    };

    // Cache stats (injected by server.js)
    if (req._cache) {
      const cs = req._cache.stats();
      stats.cache = {
        entries: cs.entries,
        sampleKeys: cs.keys.slice(0, 10),
      };
    }

    // Supabase stats
    if (supabase) {
      try {
        const { count: userCount } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });
        stats.users = { total: userCount || 0 };
      } catch {
        stats.users = { total: "unavailable" };
      }

      try {
        const { count: contribCount } = await supabase
          .from("contributions")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved");
        const { count: pendingCount } = await supabase
          .from("contributions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        stats.contributions = {
          approved: contribCount || 0,
          pending: pendingCount || 0,
        };
      } catch {
        stats.contributions = { approved: "unavailable", pending: "unavailable" };
      }
    }

    res.json(stats);
  } catch (err) {
    console.error("[admin/dashboard]", err.message);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// ── Wipe views/trending ──────────────────────────────────

router.delete("/views", (req, res) => {
  const wiped = views.resetAll();
  console.log(`[admin] Views wiped by ${req.user.email} — ${wiped} records cleared`);
  res.json({ ok: true, wiped, message: `Cleared ${wiped} view records` });
});

// ── Wipe hearts ──────────────────────────────────────────

router.delete("/hearts", (req, res) => {
  // hearts.js doesn't have a resetAll yet — add one
  const count = hearts.resetAll ? hearts.resetAll() : 0;
  console.log(`[admin] Hearts wiped by ${req.user.email} — ${count} records cleared`);
  res.json({ ok: true, wiped: count, message: `Cleared ${count} heart records` });
});

// ── Flush cache ──────────────────────────────────────────

router.delete("/cache", async (req, res) => {
  if (req._cache) {
    const count = req._cache.stats().entries;
    await req._cache.flush();
    console.log(`[admin] Cache flushed by ${req.user.email} — ${count} L1 entries + Redis cleared`);
    res.json({ ok: true, flushed: count, message: `Cleared ${count} cache entries (L1 + Redis)` });
  } else {
    res.json({ ok: true, flushed: 0, message: "No cache reference available" });
  }
});

// ── List users ───────────────────────────────────────────

router.get("/users", async (req, res) => {
  try {
    if (!supabase) return res.json({ users: [], message: "Supabase not configured" });

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, email, xp, rank, generation, created_at, avatar_url")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ users: data || [] });
  } catch (err) {
    console.error("[admin/users]", err.message);
    res.json({ users: [], error: err.message });
  }
});

// ── Contributions moderation ─────────────────────────────

router.get("/contributions", async (req, res) => {
  try {
    if (!supabase) return res.json({ contributions: [] });

    const status = req.query.status || "pending";
    const { data, error } = await supabase
      .from("contributions")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ contributions: data || [] });
  } catch (err) {
    console.error("[admin/contributions]", err.message);
    res.json({ contributions: [], error: err.message });
  }
});

router.post("/contributions/:id/approve", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const { error } = await supabase
      .from("contributions")
      .update({ status: "approved", reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id);

    if (error) throw error;
    console.log(`[admin] Contribution ${req.params.id} approved by ${req.user.email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/approve]", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/contributions/:id/reject", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const { error } = await supabase
      .from("contributions")
      .update({ status: "rejected", reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id);

    if (error) throw error;
    console.log(`[admin] Contribution ${req.params.id} rejected by ${req.user.email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/reject]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Site banner ──────────────────────────────────────────

router.post("/broadcast", (req, res) => {
  const { message, type } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  siteBanner = { message, type: type || "info", createdAt: new Date().toISOString(), setBy: req.user.email };
  console.log(`[admin] Banner set by ${req.user.email}: "${message}"`);
  res.json({ ok: true, banner: siteBanner });
});

router.delete("/broadcast", (req, res) => {
  siteBanner = null;
  console.log(`[admin] Banner cleared by ${req.user.email}`);
  res.json({ ok: true });
});

// ── Kill list (hard_excludes): items that vanish from every surface in <=60s ──
router.get("/excludes", async (req, res) => {
  if (!supabase) return res.json({ excludes: [] });
  const { data, error } = await supabase.from("hard_excludes")
    .select("id, ia_id, reason, created_at").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ excludes: data || [] });
});
router.post("/excludes", async (req, res) => {
  const ia_id = String((req.body && req.body.ia_id) || "").trim();
  const reason = (req.body && req.body.reason) ? String(req.body.reason).slice(0, 280) : null;
  if (!ia_id) return res.status(400).json({ error: "ia_id required" });
  if (!supabase) return res.status(503).json({ error: "supabase unavailable" });
  const { data, error } = await supabase.from("hard_excludes")
    .upsert({ ia_id, reason }, { onConflict: "ia_id" }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  console.log(`[admin] kill added by ${req.user.email}: ${ia_id}`);
  res.json({ ok: true, exclude: data });
});
router.delete("/excludes/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "supabase unavailable" });
  const { error } = await supabase.from("hard_excludes").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Series seeds (the SHOWS catalog wish list) ──
router.get("/series", async (req, res) => {
  if (!supabase) return res.json({ series: [] });
  const { data, error } = await supabase.from("series_seeds")
    .select("id, name, query, enabled, created_at").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ series: data || [] });
});
router.post("/series", async (req, res) => {
  const name = String((req.body && req.body.name) || "").trim();
  const query = (req.body && req.body.query) ? String(req.body.query).slice(0, 400) : null;
  if (!name) return res.status(400).json({ error: "name required" });
  if (!supabase) return res.status(503).json({ error: "supabase unavailable" });
  const { data, error } = await supabase.from("series_seeds").insert({ name, query }).select().single();
  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "already added" });
    return res.status(500).json({ error: error.message });
  }
  console.log(`[admin] series added by ${req.user.email}: ${name}`);
  res.json({ ok: true, series: data });
});
router.delete("/series/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "supabase unavailable" });
  const { error } = await supabase.from("series_seeds").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
// Pull: tell the spine to refresh seeds from Supabase + pool the new shows (background).
router.post("/series/pull", async (req, res) => {
  const url = process.env.SPINE_URL;
  if (!url) return res.status(503).json({ error: "spine not configured" });
  try {
    const r = await fetch(`${url}/catalog/seeds/sync`, {
      method: "POST", headers: { "x-spine-key": process.env.SPINE_ADMIN_KEY || "" },
    });
    const j = await r.json().catch(() => ({}));
    res.json({ ok: r.ok, spine: j });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
});

// Expose banner for non-admin routes to read
router.getBanner = () => siteBanner;

// ── Helpers ──────────────────────────────────────────────

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Shared admin check — reused by other modules (e.g. the Archivist's unlimited bypass).
function isAdmin(user) {
  const email = ((user && user.email) || "").toLowerCase();
  return ADMIN_EMAILS.includes(email);
}

module.exports = router;
module.exports.isAdmin = isAdmin;
