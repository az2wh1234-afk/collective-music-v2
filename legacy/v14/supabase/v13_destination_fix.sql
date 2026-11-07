-- V1.3: Run once in Supabase SQL Editor.
-- Server-side access control: only the earliest joined member can change a session's destination.
-- All session members may read its destination.
alter table public.music_sessions
  add column if not exists destination_lat double precision,
  add column if not exists destination_lon double precision;

create or replace function public.set_music_destination(
  p_session_id uuid,p_lat double precision,p_lon double precision
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_lat is null or p_lon is null or p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180
    then raise exception 'Invalid coordinates'; end if;
  select m.user_id into v_owner
  from public.music_members m
  where m.session_id=p_session_id
  order by m.joined_at asc,m.id asc limit 1;
  if v_owner is distinct from auth.uid() then raise exception 'Only the session host can change destination'; end if;
  update public.music_sessions
    set destination_lat=p_lat,destination_lon=p_lon
    where id=p_session_id;
  if not found then raise exception 'Session not found'; end if;
  return true;
end $$;

create or replace function public.get_music_destination(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_lat double precision; v_lon double precision;
begin
  if auth.uid() is null or not exists(
    select 1 from public.music_members m
    where m.session_id=p_session_id and m.user_id=auth.uid()
  ) then raise exception 'Not a session member'; end if;
  select destination_lat,destination_lon into v_lat,v_lon
    from public.music_sessions where id=p_session_id;
  return jsonb_build_object('lat',v_lat,'lon',v_lon);
end $$;

revoke all on function public.set_music_destination(uuid,double precision,double precision) from public;
revoke all on function public.get_music_destination(uuid) from public;
grant execute on function public.set_music_destination(uuid,double precision,double precision) to authenticated;
grant execute on function public.get_music_destination(uuid) to authenticated;
