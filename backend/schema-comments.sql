-- Comments table — threaded comments on Archive items
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) <= 2000),
  upvote_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comments_item_id ON comments(item_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- RLS: anyone can read non-deleted comments, users can insert/update/delete their own
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read comments" ON comments
  FOR SELECT USING (is_deleted = false);

CREATE POLICY "Authenticated users can insert comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments" ON comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can soft-delete own comments" ON comments
  FOR DELETE USING (auth.uid() = user_id);

-- Helper function: increment reply_count on parent comment
CREATE OR REPLACE FUNCTION increment_reply_count(comment_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE comments SET reply_count = reply_count + 1 WHERE id = comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
