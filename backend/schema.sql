-- ════════════════════════════════════════════════════════════
-- Archive TV — Phase 1 Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New Query)
-- ════════════════════════════════════════════════════════════

-- ── Profiles ───────────────────────────────────────────────
-- Auto-created on signup via trigger (below).

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  generation TEXT DEFAULT 'millennial'
    CHECK (generation IN ('boomer', 'millennial', 'genz')),
  xp INTEGER DEFAULT 0,
  rank TEXT DEFAULT 'wanderer',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Watch History ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watch_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_title TEXT,
  item_thumbnail TEXT,
  item_year TEXT,
  item_creator TEXT,
  watched_at TIMESTAMPTZ DEFAULT now(),
  watch_duration_seconds INTEGER DEFAULT 0,
  category_id TEXT,
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_history_user_time
  ON watch_history(user_id, watched_at DESC);

-- ── Watchlist ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_title TEXT,
  item_thumbnail TEXT,
  item_year TEXT,
  item_creator TEXT,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_time
  ON watchlist(user_id, added_at DESC);

-- ── Hearts ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hearts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_title TEXT,
  item_thumbnail TEXT,
  item_creator TEXT,
  item_year TEXT,
  hearted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_hearts_user
  ON hearts(user_id, hearted_at DESC);

CREATE INDEX IF NOT EXISTS idx_hearts_item
  ON hearts(item_id);

-- ── Top Hearts (materialized view for community library) ───

CREATE MATERIALIZED VIEW IF NOT EXISTS top_hearts AS
SELECT
  item_id,
  item_title,
  item_thumbnail,
  item_creator,
  item_year,
  COUNT(*) AS heart_count,
  MAX(hearted_at) AS last_hearted
FROM hearts
GROUP BY item_id, item_title, item_thumbnail, item_creator, item_year
ORDER BY heart_count DESC;

-- Refresh this periodically (or after bulk heart operations):
-- REFRESH MATERIALIZED VIEW top_hearts;

-- ── Auto-create profile on signup ──────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Explorer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Row Level Security ─────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE hearts ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Watch history: users own their data
CREATE POLICY "Users manage own history"
  ON watch_history FOR ALL
  USING (auth.uid() = user_id);

-- Watchlist: users own their data
CREATE POLICY "Users manage own watchlist"
  ON watchlist FOR ALL
  USING (auth.uid() = user_id);

-- Hearts: users can manage their own; everyone can read (for counts)
CREATE POLICY "Users manage own hearts"
  ON hearts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read hearts"
  ON hearts FOR SELECT
  USING (true);

-- ── Contributions (X-Ray curation layer) ──────────────────
-- User-contributed metadata: cast, crew, trivia, context, tags.
-- This is the core of the curation system — XP is earned here.

CREATE TABLE IF NOT EXISTS contributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  field_type TEXT NOT NULL
    CHECK (field_type IN ('cast','director','writer','producer','trivia','context','tag','warning','year')),
  field_value TEXT NOT NULL CHECK (length(field_value) <= 500),
  field_extra TEXT,                -- optional: role name for cast, etc.
  status TEXT DEFAULT 'approved'
    CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id, field_type, field_value)  -- no duplicate facts per item
);

CREATE INDEX IF NOT EXISTS idx_contributions_item
  ON contributions(item_id, status);

CREATE INDEX IF NOT EXISTS idx_contributions_user
  ON contributions(user_id, created_at DESC);

-- Update profiles to track contribution count
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contribution_count INTEGER DEFAULT 0;

-- RLS for contributions
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved contributions (the X-Ray data)
CREATE POLICY "Anyone can read approved contributions"
  ON contributions FOR SELECT
  USING (status = 'approved');

-- Authenticated users can insert
CREATE POLICY "Authenticated users can contribute"
  ON contributions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update/delete their own pending contributions
CREATE POLICY "Users manage own pending contributions"
  ON contributions FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Allow the service role to bypass RLS (our backend uses service key)
-- This is automatic with service_role key, but explicit for clarity.
