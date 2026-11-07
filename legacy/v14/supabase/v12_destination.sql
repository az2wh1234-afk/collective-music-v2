-- Run once in Supabase SQL editor before deploying V1.2
alter table public.music_sessions
  add column if not exists destination_lat double precision,
  add column if not exists destination_lon double precision;
-- Existing session access policies continue to apply.
