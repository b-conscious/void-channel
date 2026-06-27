/**
 * Embed / OG-meta routes — branded clip wrapper.
 *
 * When a VOIDtv clip link is shared on Twitter, Discord, Facebook, etc.,
 * these routes serve an HTML page with rich OpenGraph + Twitter Card meta tags
 * so the link unfurls into a branded preview card.
 *
 * Routes:
 *   GET /watch/:id          — full video embed page
 *   GET /watch/:id?start=N&end=N  — clip embed with time range
 *   GET /clip/:id/:start/:end     — short clip URL
 */

const express = require("express");
const router = express.Router();

// Archive.org thumbnail URL
const thumb = (id) => `https://archive.org/services/img/${id}`;

// Archive.org video stream (optimistic 512kb MP4)
const videoSrc = (id) => `https://archive.org/download/${id}/${id}_512kb.mp4`;

/**
 * Escape HTML entities in user-facing strings to prevent XSS in meta tags.
 */
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTime(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Build the branded HTML page for a video or clip embed.
 */
function buildPage({ id, title, creator, year, description, start, end, isClip }) {
  const safeTitle = esc(title || id);
  const safeCreator = esc(creator || "Unknown");
  const safeYear = esc(year || "");
  const safeDesc = esc(
    description
      ? description.slice(0, 200) + (description.length > 200 ? "..." : "")
      : "Public domain video from the Internet Archive"
  );

  const ogTitle = isClip
    ? `${safeTitle} [${formatTime(start)}–${formatTime(end)}]`
    : safeTitle;

  const ogDesc = isClip
    ? `Clip from "${safeTitle}" ${safeYear ? `(${safeYear})` : ""} — ${safeCreator}. Watch the full video on VOIDtv.`
    : `${safeDesc}`;

  const thumbnailUrl = thumb(id);
  const video = videoSrc(id);
  const startSec = start || 0;
  const endSec = end || 0;
  const clipDuration = isClip ? endSec - startSec : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ogTitle} — VOIDtv</title>

  <!-- OpenGraph -->
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDesc}">
  <meta property="og:image" content="${thumbnailUrl}">
  <meta property="og:image:width" content="640">
  <meta property="og:image:height" content="480">
  <meta property="og:site_name" content="VOIDtv">
  <meta property="og:video" content="${video}">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:video:width" content="640">
  <meta property="og:video:height" content="480">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="player">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${ogDesc}">
  <meta name="twitter:image" content="${thumbnailUrl}">
  <meta name="twitter:player" content="${video}">
  <meta name="twitter:player:width" content="640">
  <meta name="twitter:player:height" content="480">

  <!-- oEmbed discovery (Discord, Slack) -->
  <link rel="alternate" type="application/json+oembed"
    href="https://api.voidtv.net/oembed?url=${encodeURIComponent(`https://api.voidtv.net/watch/${id}`)}&format=json">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #e8e0d4;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .player-wrap {
      position: relative;
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      aspect-ratio: 16/9;
      background: #000;
    }
    video {
      width: 100%;
      height: 100%;
      display: block;
    }
    .brand-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      max-width: 900px;
      margin: 0 auto;
      width: 100%;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 3px;
      color: #f5a623;
      text-transform: uppercase;
    }
    .brand-tag {
      font-size: 9px;
      letter-spacing: 2px;
      color: #666;
      text-transform: uppercase;
    }
    .info {
      max-width: 900px;
      margin: 0 auto;
      padding: 16px 20px;
      width: 100%;
    }
    .info h1 {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 22px;
      font-weight: 600;
      color: #e8e0d4;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .meta {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .meta-chip {
      border: 1px solid #f5a62355;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      letter-spacing: 1px;
      color: #f5a623;
    }
    .meta-text {
      font-size: 13px;
      color: #999;
    }
    .clip-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #f5a62318;
      border: 1px solid #f5a62340;
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 11px;
      letter-spacing: 1px;
      color: #f5a623;
    }
    .desc {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #999;
      line-height: 1.6;
      margin-top: 10px;
    }
    .cta {
      display: flex;
      gap: 10px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .cta a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 1px;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .cta a:hover { opacity: 0.85; }
    .cta-primary {
      background: #f5a623;
      color: #0a0a0a;
    }
    .cta-secondary {
      border: 1px solid #333;
      color: #e8e0d4;
    }
    .footer {
      margin-top: auto;
      padding: 20px;
      text-align: center;
      font-size: 10px;
      letter-spacing: 2px;
      color: #444;
    }
    .footer a { color: #f5a623; text-decoration: none; }
  </style>
</head>
<body>

  <div class="brand-bar">
    <div class="brand-left">
      <span class="brand-logo">VOIDtv</span>
      <span class="brand-tag">generating since 1895</span>
    </div>
  </div>

  <div class="player-wrap">
    <video
      id="player"
      controls
      preload="metadata"
      poster="${thumbnailUrl}"
      src="${video}"
    ></video>
  </div>

  <div class="info">
    <h1>${safeTitle}</h1>
    <div class="meta">
      ${safeYear ? `<span class="meta-chip">${safeYear}</span>` : ""}
      ${safeCreator !== "Unknown" ? `<span class="meta-text">${safeCreator}</span>` : ""}
      ${isClip ? `<span class="clip-badge">&#9988; CLIP ${formatTime(start)}–${formatTime(end)} (${clipDuration}s)</span>` : ""}
    </div>
    ${safeDesc ? `<p class="desc">${safeDesc}</p>` : ""}
    <div class="cta">
      <a href="https://archive.org/details/${esc(id)}" class="cta-primary" target="_blank" rel="noopener">
        &#9654; Full Video on Archive.org
      </a>
      <a href="https://api.voidtv.net/api/item/${esc(id)}" class="cta-secondary" target="_blank" rel="noopener">
        &#128218; Item Data
      </a>
    </div>
  </div>

  <div class="footer">
    PUBLIC DOMAIN &middot; FROM THE <a href="https://archive.org" target="_blank" rel="noopener">INTERNET ARCHIVE</a>
    &middot; POWERED BY <a href="https://voidtv.net">VOIDtv</a>
  </div>

  ${isClip ? `
  <script>
    // Auto-seek to clip start and stop at clip end
    const v = document.getElementById('player');
    const clipStart = ${startSec};
    const clipEnd = ${endSec};
    v.addEventListener('loadedmetadata', () => {
      v.currentTime = clipStart;
    });
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= clipEnd) {
        v.pause();
        v.currentTime = clipStart;
      }
    });
  </script>
  ` : ""}

</body>
</html>`;
}

/**
 * GET /watch/:id — full video or clip embed page.
 * Query params: ?start=N&end=N for clips, ?title=...&creator=...&year=...
 */
router.get("/watch/:id", async (req, res) => {
  const { id } = req.params;

  // Humans get bounced to the APP (voidtv.net), where the video actually plays; only social
  // crawlers get the OG page below, so link previews still render. Without this split a person
  // clicking a shared link landed on the preview page whose only CTA is "watch on archive.org"
  // (tester: Copy Link / Void Page / socials all "redirect to IA, can't watch the video").
  // Override the app origin with the APP_URL env if the frontend domain ever changes.
  const ua = String(req.get("user-agent") || "");
  const isCrawler = /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegram|linkedinbot|embedly|pinterest|redditbot|googlebot|bingbot|skype|vkshare|preview/i.test(ua);
  if (!isCrawler) {
    const APP_URL = process.env.APP_URL || "https://voidtv.net";
    const p = new URLSearchParams();
    if (req.query.start) p.set("start", String(req.query.start));
    if (req.query.end) p.set("end", String(req.query.end));
    const qs = p.toString();
    return res.redirect(302, `${APP_URL}/watch/${encodeURIComponent(id)}${qs ? "?" + qs : ""}`);
  }

  const start = parseInt(req.query.start) || 0;
  const end = parseInt(req.query.end) || 0;
  const isClip = start > 0 || end > 0;

  // Try to get metadata from cache or Archive.org
  let title = req.query.title || id;
  let creator = req.query.creator || "";
  let year = req.query.year || "";
  let description = req.query.desc || "";

  // Attempt to fetch real metadata if not provided in query
  if (title === id) {
    try {
      const archive = require("./archive");
      const item = await archive.getItem(id);
      if (item) {
        title = item.title || id;
        creator = item.creator || creator;
        year = item.year || year;
        description = item.description || description;
      }
    } catch {
      // Fall back to ID-based title
    }
  }

  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(buildPage({ id, title, creator, year, description, start, end, isClip }));
});

/**
 * GET /clip/:id/:start/:end — short clip URL.
 * Redirects to /watch/:id?start=N&end=N
 */
router.get("/clip/:id/:start/:end", (req, res) => {
  const { id, start, end } = req.params;
  res.redirect(301, `/watch/${id}?start=${start}&end=${end}`);
});

/**
 * GET /oembed — oEmbed endpoint for Discord/Slack rich embeds.
 */
router.get("/oembed", (req, res) => {
  const url = req.query.url || "";
  const match = url.match(/\/watch\/([^?]+)/);
  const id = match ? match[1] : "unknown";

  res.json({
    version: "1.0",
    type: "video",
    provider_name: "VOIDtv",
    provider_url: "https://api.voidtv.net",
    title: `${id} — VOIDtv`,
    thumbnail_url: thumb(id),
    thumbnail_width: 640,
    thumbnail_height: 480,
    html: `<iframe src="https://api.voidtv.net/watch/${id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`,
    width: 640,
    height: 360,
  });
});

module.exports = router;
