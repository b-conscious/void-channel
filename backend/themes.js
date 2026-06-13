// JOB_14 cheap v1: the editorial heartbeat, smallest honest slice. One pinned theme crate at
// the top of the wall during its window. Config lives in theme-config.json so B edits copy
// without touching code; the file is re-read on a short TTL so edits land without a restart.
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const CONFIG_PATH = path.join(__dirname, "theme-config.json");
const TTL_MS = 30 * 1000;

let cached = { t: 0, themes: [] };

function loadThemes() {
  if (Date.now() - cached.t < TTL_MS) return cached.themes;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    cached = { t: Date.now(), themes: Array.isArray(raw.themes) ? raw.themes : [] };
  } catch (e) {
    // A broken edit must never take the wall down: keep last good, log once per TTL
    cached.t = Date.now();
    console.warn("[theme] config unreadable, serving last good:", e.message);
  }
  return cached.themes;
}

router.get("/api/theme", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const active = loadThemes().find((t) => t && t.crateId && t.starts <= today && today <= t.ends) || null;
  res.json({ theme: active });
});

module.exports = router;
