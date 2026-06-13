-- Slice 16: RLS AUDIT (the watchlist's highest-priority unverified assumption).
-- Run PART 1 in the Supabase SQL editor and READ the output before running anything else.
-- The backend talks through the SERVICE key, which BYPASSES RLS, so enabling RLS does not
-- break the API; it protects against anyone using the public ANON key directly.

-- ── PART 1: the audit. Which public tables have RLS off, and what policies exist?
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       coalesce(p.policy_count, 0) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join (
  select polrelid, count(*) as policy_count from pg_policy group by polrelid
) p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- ── PART 2: the lockdown. For every row above with rls_enabled = false, enable RLS.
-- With NO policies defined, enabling RLS means the anon key can read/write NOTHING on that
-- table (deny by default), while the backend service key continues working unchanged.
-- That deny-by-default posture is CORRECT for this app: all client traffic goes through
-- the Express API, never directly to Supabase. Uncomment per table after reading Part 1.
--
-- alter table profiles enable row level security;
-- alter table history enable row level security;
-- alter table watchlist enable row level security;
-- alter table hearts enable row level security;
-- alter table playlists enable row level security;
-- alter table playlist_items enable row level security;
-- alter table subscriptions enable row level security;
-- alter table comments enable row level security;
-- alter table contributions enable row level security;
-- alter table watch_events enable row level security;
-- alter table archivist_usage enable row level security;
--
-- (Table names are best-effort from the codebase; Part 1's output is the truth. Enable RLS
-- on every public table it lists. If some client feature breaks afterward, that feature was
-- talking to Supabase directly with the anon key and we want to know about it.)

-- ── PART 3: verify. Rerun Part 1; every table should show rls_enabled = true.
