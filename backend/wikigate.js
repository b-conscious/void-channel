// THE WIKI CENSOR GATE (B's idea): a Wikidata second-opinion on kids vouches. Honest scope,
// learned from probing real titles: Wikidata's children's-classification is INCONSISTENT
// (Sesame Street's description says "children's", VeggieTales' does not) and entity-matching
// is fuzzy (Thomas matched a video game). So this is NOT a hard gate. It is an ASSIST:
//   confirmed  -> Wikidata clearly says children's/preschool/kids
//   flagged    -> the matched entity is a class that is NEVER a kids program (YouTube channel,
//                 adult/porn), i.e. the Unus Annus case the title-match alone let through
//   unknown    -> no clear signal (B's vouch still governs; many real kids shows land here)
// B's vouch remains the gate; this catches the obvious mistakes and confirms the clear wins.
const API = "https://www.wikidata.org/w/api.php";
const UA = { headers: { "user-agent": "VOIDtv/0.1 (https://voidtv.net)" } };

const CONFIRM_RE = /\b(child|children|childrens|preschool|pre-school|kindergarten|toddler|kids|nursery|all[ -]ages|educational)\b/i;
const FLAG_TYPE_RE = /\b(youtube channel|web series|pornographic|adult animation|hentai)\b/i;
const FLAG_DESC_RE = /\b(pornographic|hardcore|erotic|horror film|slasher|gore)\b/i;

// Verdicts persist to disk so they survive restarts and the SERVE path can trust them without
// a live (flaky, rate-limited) network call. The serve backstop must never fail open under
// load; /check does the live lookups and warms this cache.
const fs = require("fs");
const path = require("path");
const CACHE_PATH = path.join(__dirname, "wiki-cache.json");
const cache = new Map(); // title(lowercased) -> { t, signal }
const TTL = 1000 * 60 * 60 * 24 * 30; // 30d: classifications do not move
try {
  const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  for (const k in raw) cache.set(k, raw[k]);
} catch (e) { /* first run */ }
let _saveTimer = null;
function persist() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try { fs.writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(cache))); } catch (e) {}
  }, 3000);
}

async function getJson(params) {
  const res = await fetch(`${API}?${params}&format=json`, UA);
  if (!res.ok) throw new Error(`wikidata ${res.status}`);
  return res.json();
}

// title -> { signal: 'confirmed'|'flagged'|'unknown', qid, label, desc, types }
async function wikiKidsSignal(title) {
  const key = String(title || "").trim().toLowerCase();
  if (!key) return { signal: "unknown" };
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.signal;
  let signal = { signal: "unknown" };
  try {
    const s = await getJson(`action=wbsearchentities&language=en&type=item&limit=1&search=${encodeURIComponent(title)}`);
    const top = s.search && s.search[0];
    if (top) {
      const desc = String(top.description || "");
      // instance-of + genre labels
      const cl = await getJson(`action=wbgetclaims&property=P31&entity=${top.id}`);
      const cl2 = await getJson(`action=wbgetclaims&property=P136&entity=${top.id}`);
      const ids = []
        .concat(((cl.claims && cl.claims.P31) || []).map((c) => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id))
        .concat(((cl2.claims && cl2.claims.P136) || []).map((c) => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id))
        .filter(Boolean);
      let types = [];
      if (ids.length) {
        const le = await getJson(`action=wbgetentities&props=labels&languages=en&ids=${ids.slice(0, 12).join("|")}`);
        types = Object.values(le.entities || {}).map((e) => e.labels && e.labels.en && e.labels.en.value).filter(Boolean);
      }
      const hay = (desc + " " + types.join(" ")).toLowerCase();
      if (CONFIRM_RE.test(hay)) signal = { signal: "confirmed", qid: top.id, label: top.label, desc, types };
      else if (FLAG_TYPE_RE.test(types.join(" ")) || FLAG_DESC_RE.test(desc)) signal = { signal: "flagged", qid: top.id, label: top.label, desc, types };
      else signal = { signal: "unknown", qid: top.id, label: top.label, desc, types };
    }
  } catch (e) { signal = { signal: "unknown", error: e.message }; }
  cache.set(key, { t: Date.now(), signal });
  persist();
  return signal;
}

// IA upload titles are messy ("Complete Unus Annus Archive" instead of "Unus Annus"), which
// hid a flagged entity from the raw lookup. Strip the noise to a core name and check that too.
function coreTitle(t) {
  return String(t || "").toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(complete|full|archive|collection|compilation|the|dvd|vhs|iso|mkv|mp4|hd|sd|part|vol|volume|episode|season|official|rip|remaster|restored|uncut|series|show)\b/gi, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Strongest signal across the raw title and its cleaned core (flagged beats confirmed beats
// unknown). This is what catches the messy-title flagged case the raw lookup missed.
async function wikiSignalBest(title) {
  const raw = await wikiKidsSignal(title);
  if (raw.signal === "flagged") return raw;
  const core = coreTitle(title);
  if (core && core !== String(title || "").toLowerCase().trim()) {
    const c = await wikiKidsSignal(core);
    if (c.signal === "flagged") return c;
    if (raw.signal === "unknown" && c.signal === "confirmed") return c;
  }
  return raw;
}

// SERVE-PATH lookup: cached verdicts ONLY, no network, so the kids backstop is reliable and
// can never fail open under load. Returns 'flagged' if EITHER the title or its cleaned core
// has a persisted flagged verdict; otherwise 'unknown' (served; /check is the live verifier).
function cachedSignalBest(title) {
  const get = (k) => { const h = cache.get(String(k || "").toLowerCase()); return h && h.signal ? h.signal.signal : null; };
  if (get(title) === "flagged") return "flagged";
  const core = coreTitle(title);
  if (core && get(core) === "flagged") return "flagged";
  return get(title) || get(core) || "unknown";
}

module.exports = { wikiKidsSignal, wikiSignalBest, cachedSignalBest };
