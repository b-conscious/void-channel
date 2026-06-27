// Spine Supabase client (service key). The spine inherits SUPABASE_URL / SUPABASE_SERVICE_KEY from
// start-prod.js but not the library; this adds read access for the series_seeds table (the admin
// series wish list). Fail-soft: `supabase` is null when env or the lib is missing, so the catalog
// just falls back to series-seeds.json and nothing breaks.
let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) supabase = createClient(url, key, { auth: { persistSession: false } });
  else console.warn('[spine/supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY missing — series stays on the JSON seeds');
} catch (e) {
  console.warn('[spine/supabase] client unavailable:', e.message);
}
module.exports = { supabase };
