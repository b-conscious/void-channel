-- JOB_1: multi-type social prep. Additive with defaults: zero downtime, safe to run live
-- in the Supabase SQL editor. Adjust table names here if any differ in the project.
ALTER TABLE IF EXISTS hearts        ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'video';
ALTER TABLE IF EXISTS views         ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'video';
ALTER TABLE IF EXISTS playlists     ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'video';
ALTER TABLE IF EXISTS playlist_items ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'video';
ALTER TABLE IF EXISTS watch_events  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'video';
-- Existing rows backfill via the DEFAULT; new writes pass item_type explicitly from JOB_4 on.
