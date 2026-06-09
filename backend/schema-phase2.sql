-- ════════════════════════════════════════════════════════════
-- Void Channel — Phase 2 Schema: Playlists, Subscriptions, Watch Events
-- Run this in the Supabase SQL Editor (Dashboard > SQL > New Query)
-- ════════════════════════════════════════════════════════════

-- ── Playlists ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 100),
  description TEXT CHECK (length(description) <= 500),
  is_public BOOLEAN DEFAULT false,
  cover_thumbnail TEXT,
  item_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playlists_user
  ON playlists(user_id, updated_at DESC);

-- ── Playlist Items ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playlist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_title TEXT,
  item_thumbnail TEXT,
  item_year TEXT,
  item_creator TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist
  ON playlist_items(playlist_id, position ASC);

-- ── Subscriptions (follow a category/collection) ─────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  category_name TEXT,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
  ON subscriptions(user_id);

-- ── Watch Events (engagement signals for recommendations) ─

CREATE TABLE IF NOT EXISTS watch_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_title TEXT,
  category_id TEXT,
  watch_percent REAL DEFAULT 0,
  watch_seconds INTEGER DEFAULT 0,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('start', 'progress', 'complete', 'skip')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watch_events_user
  ON watch_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_events_item
  ON watch_events(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_events_trending
  ON watch_events(created_at DESC, item_id)
  WHERE event_type IN ('start', 'complete');

-- ── Row Level Security ────────────────────────────────────

ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_events ENABLE ROW LEVEL SECURITY;

-- Playlists: owner full access, public playlists readable by anyone
DROP POLICY IF EXISTS "Users manage own playlists" ON playlists;
CREATE POLICY "Users manage own playlists"
  ON playlists FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read public playlists" ON playlists;
CREATE POLICY "Anyone can read public playlists"
  ON playlists FOR SELECT
  USING (is_public = true);

-- Playlist items: owner full access, public playlist items readable
DROP POLICY IF EXISTS "Users manage own playlist items" ON playlist_items;
CREATE POLICY "Users manage own playlist items"
  ON playlist_items FOR ALL
  USING (
    playlist_id IN (
      SELECT id FROM playlists WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Anyone can read public playlist items" ON playlist_items;
CREATE POLICY "Anyone can read public playlist items"
  ON playlist_items FOR SELECT
  USING (
    playlist_id IN (
      SELECT id FROM playlists WHERE is_public = true
    )
  );

-- Subscriptions: users own their subscriptions
DROP POLICY IF EXISTS "Users manage own subscriptions" ON subscriptions;
CREATE POLICY "Users manage own subscriptions"
  ON subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- Watch events: users own their events, aggregated data readable for trending
DROP POLICY IF EXISTS "Users manage own watch events" ON watch_events;
CREATE POLICY "Users manage own watch events"
  ON watch_events FOR ALL
  USING (auth.uid() = user_id);

-- ── Helper: auto-update playlist item_count ───────────────

CREATE OR REPLACE FUNCTION update_playlist_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE playlists SET item_count = item_count + 1, updated_at = now()
    WHERE id = NEW.playlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE playlists SET item_count = item_count - 1, updated_at = now()
    WHERE id = OLD.playlist_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_playlist_item_count ON playlist_items;
CREATE TRIGGER trg_playlist_item_count
  AFTER INSERT OR DELETE ON playlist_items
  FOR EACH ROW EXECUTE FUNCTION update_playlist_item_count();
