/**
 * Trending + Watch Events — engagement signals for recommendations.
 *
 * Routes:
 *   POST /api/watch-events       — fire a watch event (start/progress/complete/skip)
 *   GET  /api/trending            — most-watched items in last 48h
 *   GET  /api/recommendations     — personalized "For You" feed (falls back to trending for anonymous)
 */

const express = require("express");
const { supabase } = require("./supabase");
const views = require("./views");

const router = express.Router();

// ── Record watch event ────────────────────────────────────
// Auth optional — anonymous users still contribute to trending

router.post("/watch-events", async (req, res) => {
  try {
    const { item_id, item_title, category_id, watch_percent, watch_seconds, event_type } = req.body;

    if (!item_id || !event_type) {
      return res.status(400).json({ error: "item_id and event_type required" });
    }

    const validTypes = ["start", "progress", "complete", "skip"];
    if (!validTypes.includes(event_type)) {
      return res.status(400).json({ error: "event_type must be: " + validTypes.join(", ") });
    }

    // If user is authed, save to Supabase for personalized recs
    if (req.user && supabase) {
      try {
        await supabase.from("watch_events").insert({
          user_id: req.user.id,
          item_id,
          item_title: item_title || null,
          category_id: category_id || null,
          watch_percent: watch_percent || 0,
          watch_seconds: watch_seconds || 0,
          event_type,
        });
      } catch (dbErr) {
        // Table might not exist yet — don't fail the request
        console.warn("[watch-events] DB insert failed (table may not exist):", dbErr.message);
      }
    }

    // Always record in the local view counter for trending
    if (event_type === "start") {
      views.recordView(item_id, {
        title: item_title,
        thumbnail: req.body.item_thumbnail,
        creator: req.body.item_creator,
        year: req.body.item_year,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[watch-events]", err.message);
    res.status(500).json({ error: "Failed to record event" });
  }
});

// ── Trending — most-watched in last 48h ───────────────────
// Works for ALL users (anonymous included) — uses local view counter as fallback

router.get("/trending", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // Try Supabase first (richer data from watch_events)
    if (supabase) {
      try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        // Try RPC function first
        try {
          const { data, error } = await supabase.rpc("get_trending", {
            cutoff_time: cutoff,
            max_results: limit,
          });
          if (data && !error && data.length > 0) {
            return res.json(data);
          }
        } catch (rpcErr) {
          // RPC doesn't exist — that's fine
        }

        // Fallback: raw query on watch_events table
        try {
          const { data: events, error: evErr } = await supabase
            .from("watch_events")
            .select("item_id, item_title")
            .gte("created_at", cutoff)
            .in("event_type", ["start", "complete"])
            .order("created_at", { ascending: false })
            .limit(500);

          if (!evErr && events && events.length > 0) {
            const counts = {};
            for (const ev of events) {
              if (!counts[ev.item_id]) {
                counts[ev.item_id] = { id: ev.item_id, title: ev.item_title, watches: 0 };
              }
              counts[ev.item_id].watches++;
            }
            const trending = Object.values(counts)
              .sort((a, b) => b.watches - a.watches)
              .slice(0, limit);

            const enriched = trending.map((t) => {
              const viewData = views.getCount(t.id);
              return {
                id: t.id,
                title: t.title || t.id,
                views: viewData || t.watches,
                watches_48h: t.watches,
              };
            });

            return res.json(enriched);
          }
        } catch (queryErr) {
          // Table doesn't exist — fall through to local views
          console.warn("[trending] watch_events table not available:", queryErr.message);
        }
      } catch (supaErr) {
        console.warn("[trending] Supabase fallback failed:", supaErr.message);
      }
    }

    // Final fallback: use local view counter's recent views
    const recent = views.getRecent(limit);
    res.json(recent.map((r) => ({
      id: r.id,
      title: r.title || r.id,
      thumbnail: r.thumbnail,
      creator: r.creator,
      year: r.year,
      views: r.views || r.count || 0,
    })));
  } catch (err) {
    console.error("[trending]", err.message);
    // Even if everything fails, return empty array — never 500
    res.json([]);
  }
});

// ── Recommendations — personalized "For You" ──────────────
// Works for ALL users — anonymous get trending, authed get collaborative filtering

router.get("/recommendations", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // Anonymous users — return top-viewed items as "recommendations"
    if (!req.user) {
      const topViewed = views.getTop(limit);
      return res.json({
        items: topViewed,
        source: "popular",
        message: "Sign in to get personalized recommendations",
      });
    }

    if (!supabase) {
      const topViewed = views.getTop(limit);
      return res.json({ items: topViewed, source: "popular" });
    }

    // Step 1: Get this user's recent watches
    let myWatches = [];
    try {
      const { data, error } = await supabase
        .from("watch_events")
        .select("item_id, category_id")
        .eq("user_id", req.user.id)
        .in("event_type", ["start", "complete"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && data) myWatches = data;
    } catch {
      // Table might not exist
    }

    if (myWatches.length === 0) {
      const topViewed = views.getTop(limit);
      return res.json({
        items: topViewed,
        source: "trending",
        message: "Watch more to get personalized recommendations",
      });
    }

    const myItemIds = [...new Set(myWatches.map((w) => w.item_id))];
    const myCategories = [...new Set(myWatches.map((w) => w.category_id).filter(Boolean))];

    // Step 2: Find other users who watched the same items
    let coViewerIds = [];
    try {
      const { data: coViewers } = await supabase
        .from("watch_events")
        .select("user_id")
        .in("item_id", myItemIds.slice(0, 20))
        .neq("user_id", req.user.id)
        .in("event_type", ["start", "complete"])
        .limit(200);
      coViewerIds = [...new Set((coViewers || []).map((r) => r.user_id))].slice(0, 30);
    } catch {}

    let recsFromCF = [];

    if (coViewerIds.length > 0) {
      try {
        const { data: theirWatches } = await supabase
          .from("watch_events")
          .select("item_id, item_title")
          .in("user_id", coViewerIds)
          .in("event_type", ["complete"])
          .order("created_at", { ascending: false })
          .limit(300);

        if (theirWatches) {
          const counts = {};
          for (const w of theirWatches) {
            if (myItemIds.includes(w.item_id)) continue;
            if (!counts[w.item_id]) {
              counts[w.item_id] = { id: w.item_id, title: w.item_title, score: 0 };
            }
            counts[w.item_id].score++;
          }
          recsFromCF = Object.values(counts)
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.ceil(limit * 0.6));
        }
      } catch {}
    }

    // Step 3: Fill remaining slots with category-based recs
    const recsFromCategory = [];
    if (recsFromCF.length < limit && myCategories.length > 0) {
      try {
        const { data: catItems } = await supabase
          .from("watch_events")
          .select("item_id, item_title")
          .in("category_id", myCategories.slice(0, 5))
          .in("event_type", ["start", "complete"])
          .order("created_at", { ascending: false })
          .limit(100);

        if (catItems) {
          const seen = new Set([...myItemIds, ...recsFromCF.map((r) => r.id)]);
          for (const w of catItems) {
            if (seen.has(w.item_id)) continue;
            seen.add(w.item_id);
            recsFromCategory.push({ id: w.item_id, title: w.item_title, score: 1, source: "category" });
            if (recsFromCategory.length >= limit - recsFromCF.length) break;
          }
        }
      } catch {}
    }

    // Combine
    const combined = [...recsFromCF, ...recsFromCategory].slice(0, limit);

    // If collaborative filtering returned nothing, fall back to popular
    if (combined.length === 0) {
      const topViewed = views.getTop(limit);
      return res.json({
        items: topViewed,
        source: "popular",
        message: "Not enough community data yet — showing popular items",
      });
    }

    const enriched = combined.map((r) => {
      const viewCount = views.getCount(r.id);
      return { id: r.id, title: r.title || r.id, views: viewCount, score: r.score, source: r.source || "collaborative" };
    });

    res.json({
      items: enriched,
      source: "personalized",
      watchedCount: myItemIds.length,
    });
  } catch (err) {
    console.error("[recommendations]", err.message);
    // Fallback to popular — never 500
    const topViewed = views.getTop(20);
    res.json({ items: topViewed, source: "popular" });
  }
});

module.exports = router;
