-- ── The Archivist: quota + supporter status + earned credits ──────────────
-- Run this in the Supabase SQL editor.

-- Per-user DAILY usage counter for the Archivist (Claude Haiku).
-- day_bucket = floor(epoch_ms / 1 day) — a simple, timezone-free daily window (resets at UTC midnight).
CREATE TABLE IF NOT EXISTS archivist_usage (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_bucket INTEGER NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_bucket)
);

CREATE INDEX IF NOT EXISTS idx_archivist_usage_user ON archivist_usage(user_id);

-- Supporter status — set/extended when a donation is attributed (Track 1, donations phase).
-- While supporter_until is in the future, the user gets the 4x daily Archivist allowance.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS supporter_until TIMESTAMPTZ;

-- Earned bonus consults — granted for curating the archive (tags, cross-links, descriptions).
-- Spent only after the daily allowance is used up. This is the "curate to earn rabbit-holes" loop.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS archivist_credits INTEGER DEFAULT 0;

-- RLS: the backend uses the service key (bypasses RLS) for quota/credit writes, so no
-- user-facing policies are required here. Usage rows are never read by clients.
ALTER TABLE archivist_usage ENABLE ROW LEVEL SECURITY;
