-- Run once in Supabase SQL Editor. Locations visible only to members of the same session.
create table if not exists public.music_positions (
 session_id uuid not null references public.music_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 layer integer not null check (layer in (0,1)),
 lat double precision not null check (lat between -90 and 90),
 lon double precision not null check (lon between -180 and 180),
 accuracy double precision not null default 0,
 last_seen timestamptz not null default now(),
 primary key(session_id,user_id)
);
alter table public.music_positions enable row level security;
create policy "members read positions" on public.music_positions for select to authenticated using (
 exists(select 1 from public.music_members m where m.session_id=music_positions.session_id and m.user_id=auth.uid())
);
create policy "members insert own position" on public.music_positions for insert to authenticated with check (
 user_id=auth.uid() and exists(select 1 from public.music_members m where m.session_id=music_positions.session_id and m.user_id=auth.uid() and m.layer=music_positions.layer)
);
create policy "members update own position" on public.music_positions for update to authenticated using(user_id=auth.uid()) with check (
 user_id=auth.uid() and exists(select 1 from public.music_members m where m.session_id=music_positions.session_id and m.user_id=auth.uid() and m.layer=music_positions.layer)
);
create policy "members delete own position" on public.music_positions for delete to authenticated using(user_id=auth.uid());
grant select,insert,update,delete on public.music_positions to authenticated;
