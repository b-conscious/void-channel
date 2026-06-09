/**
 * Trending + Watch Events — engagement signals for recommendations.
 *
 * Routes:
 *   POST /api/watch-events       — fire a watch event (start/progress/complete/skip)
 *   GET  /api/trending            — most-watched items in last 48h
 *   GET  /api/recommendations     — personalized "For You" feed
 */

const express = require("express");
const { supabase, requireAuth } = require("./supabase");
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
      await supabase.from("watch_events").insert({
        user_id: req.user.id,
        item_id,
        item_title: item_title || null,
        category_id: category_id || null,
        watch_percent: watch_percent || 0,
        watch_seconds: watch_seconds || 0,
        event_type,
      });
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
// Works for anonymous users too (uses local view counter)

router.get("/trending", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // Try Supabase first (richer data from watch_events)
    if (supabase) {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase.rpc("get_trending", {
        cutoff_time: cutoff,
        max_results: limit,
      }).catch(() => ({ data: null, error: true }));

      // If RPC exists and returns data, use it
      if (data && !error && data.length > 0) {
        return res.json(data);
      }

      // Fallback: raw query on watch_events
      const { data: events, error: evErr } = await supabase
        .from("watch_events")
        .select("item_id, item_title")
        .gte("created_at", cutoff)
        .in("event_type", ["start", "complete"])
        .order("created_at", { ascending: false })
        .limit(500);

      if (!evErr && events && events.length > 0) {
        // Aggregate manually
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

        // Enrich with view counter data (thumbnails, etc.)
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
    res.status(500).json({ error: "Failed to fetch trending" });
  }
});

// ── Recommendations — personalized "For You" ──────────────
// Requires auth. Uses collaborative filtering: "users who watched X also watched Y"

router.get("/recommendations", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    if (!supabase) {
      return res.json({ items: [], message: "Recommendations unavailable" });
    }

    // Step 1: Get this user's recent watches
    const { data: myWatches, error: wErr } = await supabase
      .from("watch_events")
      .select("item_id, category_id")
      .eq("user_id", req.user.id)
      .in("event_type", ["start", "complete"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (wErr || !myWatches || myWatches.length === 0) {
      // No watch history — return trending as fallback
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
    const { data: coViewers, error: cvErr } = await supabase
      .from("watch_events")
      .select("user_id")
      .in("item_id", myItemIds.slice(0, 20))
      .neq("user_id", req.user.id)
      .in("event_type", ["start", "complete"])
      .limit(200);

    const coViewerIds = [...new Set((coViewers || []).map((r) => r.user_id))].slice(0, 30);

    let recsFromCF = [];

    if (coViewerIds.length > 0) {
      // Step 3: Get what those co-viewers watched that I haven't
      const { data: theirWatches } = await supabase
        .from("watch_events")
        .select("item_id, item_title")
        .in("user_id", coViewerIds)
        .in("event_type", ["complete"])  // Only completed = strong signal
        .order("created_at", { ascending: false })
        .limit(300);

      if (theirWatches) {
        // Count co-occurrences, exclude items user already watched
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
          .slice(0, Math.ceil(limit * 0.6)); // 60% from collaborative filtering
      }
    }

    // Step 4: Fill remaining slots with category-based recs
    const recsFromCategory = [];
    if (recsFromCF.length < limit && myCategories.length > 0) {
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
          recsFromCategory.push({
            id: w.item_id,
            title: w.item_title,
            score: 1,
            source: "category",
          });
          if (recsFromCategory.length >= limit - recsFromCF.length) break;
        }
      }
    }

    // Combine and shuffle slightly to avoid staleness
    const combined = [...recsFromCF, ...recsFromCategory].slice(0, limit);

    // Enrich with view data
    const enriched = combined.map((r) => {
      const viewCount = views.getCount(r.id);
      return {
        id: r.id,
        title: r.title || r.id,
        views: viewCount,
        score: r.score,
        source: r.source || "collaborative",
      };
    });

    res.json({
      items: enriched,
      source: "personalized",
      watchedCount: myItemIds.length,
    });
  } catch (err) {
    console.error("[recommendations]", err.message);
    res.status(500).json({ error: "Failed to generate recommendations" });
  }
});

module.exports = router;
