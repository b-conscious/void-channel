-- Slice 16, the mature gate. Additive, zero downtime, run live in the Supabase SQL editor.
alter table profiles add column if not exists mature_pin_hash text;
alter table profiles add column if not exists mature_pin_salt text;
