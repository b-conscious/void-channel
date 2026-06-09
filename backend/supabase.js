/**
 * Supabase client for the backend proxy.
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from environment variables.
 * The service key bypasses RLS — used only server-side for admin operations.
 * For user-scoped queries, pass the user's JWT to createClient or use
 * getUserFromToken() to validate and extract the profile.
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn(
    "[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY missing — auth + sync routes will be disabled"
  );
}

// Admin client — bypasses RLS, for server-side operations
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

/**
 * Create a Supabase client scoped to a specific user's JWT.
 * This respects RLS policies.
 */
function createUserClient(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Express middleware: optional auth.
 * Extracts user from Bearer token if present, but doesn't require it.
 * Sets req.user (profile row) and req.accessToken if valid.
 */
async function optionalAuth(req, res, next) {
  req.user = null;
  req.accessToken = null;

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ") || !supabase) {
    return next();
  }

  const token = header.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return next();

    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    req.user = profile || { id: user.id, email: user.email };
    req.accessToken = token;
  } catch (err) {
    console.warn("[auth] token validation failed:", err.message);
  }
  next();
}

/**
 * Express middleware: require auth.
 * Returns 401 if no valid user.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

module.exports = {
  supabase,
  createUserClient,
  optionalAuth,
  requireAuth,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
};
