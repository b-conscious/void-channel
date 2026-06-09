/**
 * Auth routes — register, login, profile, anonymous sessions.
 *
 * Uses Supabase Auth under the hood. The proxy handles token exchange
 * so the mobile client never talks to Supabase directly.
 */

const express = require("express");
const { supabase, optionalAuth, requireAuth } = require("./supabase");

const router = express.Router();

// Generate a unique username like "void_a3f8b2c1" from the user's UUID
function generateUsername(uuid) {
  // Take chars from UUID (skip hyphens), grab 8 for a short but unique tag
  const clean = uuid.replace(/-/g, '');
  return 'void_' + clean.slice(0, 8);
}

// ── Register (email + password) ────────────────────────────

router.post("/register", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Auth not configured" });

  const { email, password, username, displayName, generation } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for now
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("duplicate")) {
        return res.status(409).json({ error: "Email already registered" });
      }
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;
    const autoUsername = username || generateUsername(userId);

    // Create profile — always has a unique username
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      username: autoUsername,
      display_name: displayName || username || email.split("@")[0],
      generation: generation || "millennial",
      xp: 0,
      rank: "wanderer",
    });

    if (profileError) console.warn("[auth] profile create warning:", profileError.message);

    // Sign in to get tokens
    const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return res.status(500).json({ error: "Account created but sign-in failed. Try logging in." });
    }

    // Fetch the profile we just created
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    res.json({
      user: profile,
      session: {
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        expires_at: session.session.expires_at,
      },
    });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ── Login (email + password) ───────────────────────────────

router.post("/login", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Auth not configured" });

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    res.json({
      user: profile || { id: data.user.id, email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ── Anonymous session ──────────────────────────────────────

router.post("/anonymous", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Auth not configured" });

  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      return res.status(500).json({ error: "Failed to create anonymous session" });
    }

    // Create a bare profile for the anonymous user — still gets a unique username
    const anonUsername = generateUsername(data.user.id);
    await supabase.from("profiles").upsert({
      id: data.user.id,
      username: anonUsername,
      display_name: "Anonymous Explorer",
      generation: req.body.generation || "millennial",
      xp: 0,
      rank: "wanderer",
    });

    res.json({
      user: { id: data.user.id, username: anonUsername, is_anonymous: true },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    console.error("[auth/anonymous]", err);
    res.status(500).json({ error: "Anonymous session failed" });
  }
});

// ── Refresh token ──────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Auth not configured" });

  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: "refresh_token required" });
  }

  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) {
      return res.status(401).json({ error: "Token refresh failed — please sign in again" });
    }

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    console.error("[auth/refresh]", err);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// ── Profile ────────────────────────────────────────────────

router.get("/profile", optionalAuth, requireAuth, async (req, res) => {
  res.json(req.user);
});

router.patch("/profile", optionalAuth, requireAuth, async (req, res) => {
  const allowed = ["username", "display_name", "avatar_url", "generation"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  updates.updated_at = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) {
      if (error.message.includes("unique") || error.code === "23505") {
        return res.status(409).json({ error: "Username already taken" });
      }
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error("[auth/profile]", err);
    res.status(500).json({ error: "Profile update failed" });
  }
});

module.exports = router;
