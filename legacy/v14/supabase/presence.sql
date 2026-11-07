-- V0.9: Run once in Supabase SQL Editor, after the existing session schema.
-- Presence is ephemeral. No GPS coordinates are stored.
create table if not exists public.music_presence (
  session_id uuid not null references public.music_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  layer integer not null,
  last_seen timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists music_presence_session_seen on public.music_presence(session_id,last_seen);
alter table public.music_presence enable row level security;
create policy "session members can view presence" on public.music_presence
  for select to authenticated using (
    exists (select 1 from public.music_members m
      where m.session_id = music_presence.session_id and m.user_id = auth.uid())
  );
create policy "members can add their own presence" on public.music_presence
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.music_members m where m.session_id = music_presence.session_id
      and m.user_id = auth.uid() and m.layer = music_presence.layer)
  );
create policy "members can refresh their own presence" on public.music_presence
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.music_members m where m.session_id = music_presence.session_id
    and m.user_id = auth.uid() and m.layer = music_presence.layer)
  );
create policy "members can leave their own presence" on public.music_presence
  for delete to authenticated using (user_id = auth.uid());
grant select,insert,update,delete on public.music_presence to authenticated;
