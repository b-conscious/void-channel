/**
 * One-time migration: create contributions table + add column to profiles.
 * Run: node _migrate.js
 */
require("dotenv").config();
const fetch = require("node-fetch");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const statements = [
  `CREATE TABLE IF NOT EXISTS contributions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('cast','director','writer','producer','trivia','context','tag','warning','year')),
    field_value TEXT NOT NULL CHECK (length(field_value) <= 500),
    field_extra TEXT,
    status TEXT DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(item_id, field_type, field_value)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_contributions_item ON contributions(item_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_contributions_user ON contributions(user_id, created_at DESC)`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contribution_count INTEGER DEFAULT 0`,
  `ALTER TABLE contributions ENABLE ROW LEVEL SECURITY`,
];

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  // Use the Supabase management API pg endpoint directly
  // Actually, we need to use the supabase-js client's rpc or direct pg
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // The service role key can execute raw SQL via the pg_graphql or via
  // a helper function. Let's create a helper function first, then use it.
  // Simpler: just use individual table operations to verify.

  // Method: Use the Supabase HTTP API to run SQL via pg
  // The /pg endpoint isn't available via REST. We need to use
  // the dashboard SQL editor or create an RPC function.

  // Simplest approach: create an RPC function that executes SQL
  console.log("Creating exec_sql function...");
  const createFn = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({ sql_text: statements.join(";\n") }),
  });
  console.log("exec_sql status:", createFn.status);

  // If exec_sql doesn't exist, we need to create it via the management API
  // Let's try the /sql endpoint which some Supabase versions support
  const sqlUrl = `${SUPABASE_URL.replace(".supabase.co", ".supabase.co")}/pg/query`;
  for (const sql of statements) {
    console.log("Running:", sql.slice(0, 60) + "...");
    try {
      const { data, error } = await sb.rpc("exec_sql", { sql_text: sql });
      if (error) console.log("  RPC error:", error.message);
      else console.log("  OK");
    } catch (e) {
      console.log("  Exception:", e.message);
    }
  }

  // Verify
  const { data, error } = await sb.from("contributions").select("id").limit(1);
  if (error) console.log("\ncontributions table: MISSING -", error.message);
  else console.log("\ncontributions table: EXISTS ✓");

  const { data: p, error: pe } = await sb
    .from("profiles")
    .select("contribution_count")
    .limit(1);
  if (pe) console.log("contribution_count: MISSING -", pe.message);
  else console.log("contribution_count: EXISTS ✓");
}

main().catch(console.error);
