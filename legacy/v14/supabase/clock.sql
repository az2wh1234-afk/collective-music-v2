-- Run once in the Supabase SQL Editor. Returns the database server's UTC epoch milliseconds.
create or replace function public.music_server_time_ms()
returns double precision
language sql volatile
security invoker
set search_path = ''
as $$ select extract(epoch from clock_timestamp()) * 1000.0 $$;
grant execute on function public.music_server_time_ms() to anon, authenticated;
