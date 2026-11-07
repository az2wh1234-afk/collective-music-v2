-- Collective Music V2.0 — run ONCE in the Supabase SQL Editor.
-- Independent of the v1.4 tables (music_*). All V2 objects are prefixed cm2_.
-- Requires: Authentication -> Providers -> "Allow anonymous sign-ins" ENABLED (participants), Email provider ENABLED (artist).
-- Clients never touch cm2_* tables directly (except the artist, via admin-only SELECT policies); everything else goes through SECURITY DEFINER functions.

create table if not exists public.cm2_admins (user_id uuid primary key references auth.users(id) on delete cascade);

create table if not exists public.cm2_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default 'Untitled session',
  status text not null default 'draft' check (status in ('draft','active','ended')),
  run integer not null default 1,
  dest_name text,
  dest_lat double precision check (dest_lat between -90 and 90),
  dest_lon double precision check (dest_lon between -180 and 180),
  start_a_name text, start_a_lat double precision check (start_a_lat between -90 and 90), start_a_lon double precision check (start_a_lon between -180 and 180),
  start_b_name text, start_b_lat double precision check (start_b_lat between -90 and 90), start_b_lon double precision check (start_b_lon between -180 and 180),
  config jsonb not null default '{}'::jsonb,
  owner uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.cm2_participants (
  session_id uuid not null references public.cm2_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  layer smallint not null check (layer in (0,1)),
  consent boolean not null default false,
  run integer not null,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- Latest position only (one row per participant, overwritten); deleted on leave / session end. No history.
create table if not exists public.cm2_presence (
  session_id uuid not null references public.cm2_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  layer smallint not null check (layer in (0,1)),
  run integer not null,
  lat double precision, lon double precision, accuracy real,
  arrived boolean not null default false,
  collective text not null default 'none',
  nearest_m real,
  gps_ok boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.cm2_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.cm2_sessions(id) on delete cascade,
  run integer not null,
  pid text not null,
  layer smallint,
  event text not null check (char_length(event) <= 48),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cm2_events_session on public.cm2_events(session_id, created_at);

create table if not exists public.cm2_surveys (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cm2_sessions(id) on delete cascade,
  run integer not null,
  pid text not null,
  layer smallint,
  skipped boolean not null default false,
  met_other boolean not null default false,
  reached_destination boolean not null default false,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, run, pid)
);

alter table public.cm2_admins enable row level security;
alter table public.cm2_sessions enable row level security;
alter table public.cm2_participants enable row level security;
alter table public.cm2_presence enable row level security;
alter table public.cm2_events enable row level security;
alter table public.cm2_surveys enable row level security;
revoke all on public.cm2_admins, public.cm2_sessions, public.cm2_participants, public.cm2_presence, public.cm2_events, public.cm2_surveys from anon, authenticated;

create or replace function public.cm2_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cm2_admins a where a.user_id = auth.uid())
$$;

grant select on public.cm2_sessions, public.cm2_events, public.cm2_surveys, public.cm2_participants to authenticated;
drop policy if exists "admin read sessions" on public.cm2_sessions;
drop policy if exists "admin read events" on public.cm2_events;
drop policy if exists "admin read surveys" on public.cm2_surveys;
drop policy if exists "admin read participants" on public.cm2_participants;
create policy "admin read sessions" on public.cm2_sessions for select to authenticated using (public.cm2_is_admin());
create policy "admin read events" on public.cm2_events for select to authenticated using (public.cm2_is_admin());
create policy "admin read surveys" on public.cm2_surveys for select to authenticated using (public.cm2_is_admin());
create policy "admin read participants" on public.cm2_participants for select to authenticated using (public.cm2_is_admin());

create or replace function public.cm2_pid(p_session uuid, p_user uuid, p_run integer) returns text
language sql immutable set search_path = '' as $$ select left(md5(p_user::text || p_session::text || p_run::text), 8) $$;

-- ───────────── Artist functions ─────────────
create or replace function public.cm2_create_session(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions;
begin
  if not public.cm2_is_admin() then raise exception 'Artist access required'; end if;
  insert into public.cm2_sessions(code, name, owner)
    values (upper(left(md5(random()::text || clock_timestamp()::text), 6)), coalesce(nullif(trim(p_name), ''), 'Untitled session'), auth.uid())
    returning * into v;
  return to_jsonb(v);
end $$;

-- Destination, starting points, name and config can only change while the session is a draft.
create or replace function public.cm2_update_session(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions;
begin
  if not public.cm2_is_admin() then raise exception 'Artist access required'; end if;
  select * into v from public.cm2_sessions where id = p_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v.status <> 'draft' then raise exception 'Session is % — end and reset it before changing its settings', v.status; end if;
  update public.cm2_sessions s set
    name       = case when p_patch ? 'name' then coalesce(nullif(trim(p_patch->>'name'), ''), s.name) else s.name end,
    dest_name  = case when p_patch ? 'dest_name' then p_patch->>'dest_name' else s.dest_name end,
    dest_lat   = case when p_patch ? 'dest_lat' then (p_patch->>'dest_lat')::double precision else s.dest_lat end,
    dest_lon   = case when p_patch ? 'dest_lon' then (p_patch->>'dest_lon')::double precision else s.dest_lon end,
    start_a_name = case when p_patch ? 'start_a_name' then p_patch->>'start_a_name' else s.start_a_name end,
    start_a_lat  = case when p_patch ? 'start_a_lat' then (p_patch->>'start_a_lat')::double precision else s.start_a_lat end,
    start_a_lon  = case when p_patch ? 'start_a_lon' then (p_patch->>'start_a_lon')::double precision else s.start_a_lon end,
    start_b_name = case when p_patch ? 'start_b_name' then p_patch->>'start_b_name' else s.start_b_name end,
    start_b_lat  = case when p_patch ? 'start_b_lat' then (p_patch->>'start_b_lat')::double precision else s.start_b_lat end,
    start_b_lon  = case when p_patch ? 'start_b_lon' then (p_patch->>'start_b_lon')::double precision else s.start_b_lon end,
    config     = case when p_patch ? 'config' then coalesce(p_patch->'config', '{}'::jsonb) else s.config end
  where s.id = p_id returning * into v;
  return to_jsonb(v);
end $$;

-- p_action: 'start' (draft -> active), 'end' (active -> ended), 'reset' (ended -> draft, new run).
create or replace function public.cm2_session_action(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions;
begin
  if not public.cm2_is_admin() then raise exception 'Artist access required'; end if;
  select * into v from public.cm2_sessions where id = p_id for update;
  if not found then raise exception 'Session not found'; end if;
  if p_action = 'start' then
    if v.status <> 'draft' then raise exception 'Only a draft session can be started'; end if;
    if v.dest_lat is null or v.dest_lon is null then raise exception 'Set the destination before starting'; end if;
    update public.cm2_sessions set status='active', started_at=now(), ended_at=null where id=p_id returning * into v;
  elsif p_action = 'end' then
    if v.status <> 'active' then raise exception 'Only an active session can be ended'; end if;
    update public.cm2_sessions set status='ended', ended_at=now() where id=p_id returning * into v;
    delete from public.cm2_presence where session_id = p_id;
  elsif p_action = 'reset' then
    if v.status <> 'ended' then raise exception 'Only an ended session can be reset'; end if;
    update public.cm2_sessions set status='draft', run=run+1, started_at=null, ended_at=null where id=p_id returning * into v;
    delete from public.cm2_presence where session_id = p_id;
  else raise exception 'Unknown action'; end if;
  return to_jsonb(v);
end $$;

create or replace function public.cm2_admin_overview(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions; res jsonb;
begin
  if not public.cm2_is_admin() then raise exception 'Artist access required'; end if;
  select * into v from public.cm2_sessions where id = p_id;
  if not found then raise exception 'Session not found'; end if;
  select jsonb_build_object(
    'status', v.status, 'run', v.run,
    'participants', coalesce(jsonb_agg(jsonb_build_object(
        'pid', public.cm2_pid(p.session_id, p.user_id, p.run), 'layer', p.layer, 'consent', p.consent,
        'age_s', case when pr.updated_at is null then null else round(extract(epoch from (now() - pr.updated_at))::numeric, 1) end,
        'accuracy', pr.accuracy, 'gps_ok', coalesce(pr.gps_ok, false), 'arrived', coalesce(pr.arrived, false),
        'collective', coalesce(pr.collective, 'none'), 'nearest_m', pr.nearest_m) order by p.joined_at), '[]'::jsonb),
    'surveys', (select count(*) from public.cm2_surveys s where s.session_id = p_id and s.run = v.run),
    'events', (select count(*) from public.cm2_events e where e.session_id = p_id and e.run = v.run)
  ) into res
  from public.cm2_participants p
  left join public.cm2_presence pr on pr.session_id = p.session_id and pr.user_id = p.user_id
  where p.session_id = p_id and p.run = v.run;
  return coalesce(res, jsonb_build_object('status', v.status, 'run', v.run, 'participants', '[]'::jsonb, 'surveys', 0, 'events', 0));
end $$;

-- ───────────── Participant functions (anonymous users have role "authenticated") ─────────────
create or replace function public.cm2_server_ms() returns double precision
language sql volatile set search_path = '' as $$ select extract(epoch from clock_timestamp()) * 1000.0 $$;

-- Intro-screen info. Does NOT include the destination.
create or replace function public.cm2_session_info(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.cm2_sessions where code = upper(trim(p_code));
  if not found then return null; end if;
  return jsonb_build_object('id', v.id, 'name', v.name, 'status', v.status);
end $$;

create or replace function public.cm2_get_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions; m public.cm2_participants; st text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into m from public.cm2_participants where session_id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'Not a participant of this session'; end if;
  select * into v from public.cm2_sessions where id = p_session_id;
  st := case when m.run <> v.run then 'ended' else v.status end;
  return jsonb_build_object('id', v.id, 'name', v.name, 'status', st, 'run', v.run, 'layer', m.layer, 'consent', m.consent,
    'dest_name', case when st = 'active' then v.dest_name end,
    'dest_lat', case when st = 'active' then v.dest_lat end,
    'dest_lon', case when st = 'active' then v.dest_lon end,
    'config', v.config,
    'started_at_ms', case when v.started_at is null then null else extract(epoch from v.started_at) * 1000.0 end,
    'server_ms', extract(epoch from clock_timestamp()) * 1000.0);
end $$;

-- QR A -> p_layer 0, QR B -> p_layer 1. No location check. Re-scanning is idempotent.
create or replace function public.cm2_join(p_code text, p_layer smallint, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_layer not in (0,1) then raise exception 'Invalid layer'; end if;
  select * into v from public.cm2_sessions where code = upper(trim(p_code));
  if not found then raise exception 'Session not found'; end if;
  if v.status = 'ended' then return jsonb_build_object('id', v.id, 'name', v.name, 'status', 'ended'); end if;
  insert into public.cm2_participants(session_id, user_id, layer, consent, run)
    values (v.id, auth.uid(), p_layer, coalesce(p_consent, false), v.run)
  on conflict (session_id, user_id) do update set layer = excluded.layer, consent = excluded.consent, run = excluded.run;
  if coalesce(p_consent, false) then
    insert into public.cm2_events(session_id, run, pid, layer, event) values (v.id, v.run, public.cm2_pid(v.id, auth.uid(), v.run), p_layer, 'session_joined');
  end if;
  return public.cm2_get_session(v.id);
end $$;

-- ~every 3 s. Stores only the latest position; returns opposite-layer participants with server-measured ages.
create or replace function public.cm2_heartbeat(
  p_session_id uuid, p_lat double precision, p_lon double precision, p_accuracy real,
  p_arrived boolean, p_collective text, p_nearest real, p_gps_ok boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.cm2_sessions; m public.cm2_participants; peers jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into m from public.cm2_participants where session_id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'Not a participant of this session'; end if;
  select * into v from public.cm2_sessions where id = p_session_id;
  if v.status <> 'active' or m.run <> v.run then return jsonb_build_object('status', 'ended', 'peers', '[]'::jsonb); end if;
  insert into public.cm2_presence(session_id, user_id, layer, run, lat, lon, accuracy, arrived, collective, nearest_m, gps_ok, updated_at)
    values (p_session_id, auth.uid(), m.layer, m.run,
            case when p_lat between -90 and 90 then p_lat end, case when p_lon between -180 and 180 then p_lon end,
            p_accuracy, coalesce(p_arrived, false), left(coalesce(p_collective, 'none'), 12), p_nearest, coalesce(p_gps_ok, false), now())
  on conflict (session_id, user_id) do update set layer = excluded.layer, run = excluded.run, lat = excluded.lat, lon = excluded.lon,
     accuracy = excluded.accuracy, arrived = excluded.arrived, collective = excluded.collective, nearest_m = excluded.nearest_m,
     gps_ok = excluded.gps_ok, updated_at = now();
  select coalesce(jsonb_agg(jsonb_build_object('pid', public.cm2_pid(pr.session_id, pr.user_id, pr.run), 'lat', pr.lat, 'lon', pr.lon,
           'accuracy', pr.accuracy, 'age_s', extract(epoch from (now() - pr.updated_at)))), '[]'::jsonb) into peers
    from public.cm2_presence pr
    where pr.session_id = p_session_id and pr.run = v.run and pr.layer <> m.layer and pr.updated_at > now() - interval '120 seconds';
  return jsonb_build_object('status', 'active', 'peers', peers);
end $$;

create or replace function public.cm2_leave(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.cm2_presence where session_id = p_session_id and user_id = auth.uid();
end $$;

-- Feedback events are stored only for participants who consented.
create or replace function public.cm2_log_event(p_session_id uuid, p_event text, p_meta jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.cm2_participants; v public.cm2_sessions;
begin
  if auth.uid() is null or p_event is null or char_length(p_event) > 48 then return; end if;
  select * into m from public.cm2_participants where session_id = p_session_id and user_id = auth.uid();
  if not found or not m.consent then return; end if;
  select * into v from public.cm2_sessions where id = p_session_id;
  if m.run <> v.run then return; end if;
  insert into public.cm2_events(session_id, run, pid, layer, event, meta)
    values (p_session_id, m.run, public.cm2_pid(p_session_id, auth.uid(), m.run), m.layer, p_event,
            case when p_meta is not null and char_length(p_meta::text) <= 1500 then p_meta else '{}'::jsonb end);
end $$;

create or replace function public.cm2_submit_survey(p_session_id uuid, p_answers jsonb, p_skipped boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare m public.cm2_participants; v_pid text; v_met boolean; v_reached boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into m from public.cm2_participants where session_id = p_session_id and user_id = auth.uid();
  if not found or not m.consent then return false; end if;
  v_pid := public.cm2_pid(p_session_id, auth.uid(), m.run);
  v_met     := exists (select 1 from public.cm2_events e where e.session_id = p_session_id and e.run = m.run and e.pid = v_pid and e.event = 'collective_full_entered');
  v_reached := exists (select 1 from public.cm2_events e where e.session_id = p_session_id and e.run = m.run and e.pid = v_pid and e.event = 'destination_reached');
  insert into public.cm2_surveys(session_id, run, pid, layer, skipped, met_other, reached_destination, answers)
    values (p_session_id, m.run, v_pid, m.layer, coalesce(p_skipped, false), v_met, v_reached,
            case when p_answers is not null and char_length(p_answers::text) <= 20000 then p_answers else '{}'::jsonb end)
  on conflict (session_id, run, pid) do update set skipped = excluded.skipped, answers = excluded.answers, met_other = excluded.met_other, reached_destination = excluded.reached_destination;
  insert into public.cm2_events(session_id, run, pid, layer, event) values (p_session_id, m.run, v_pid, m.layer, case when coalesce(p_skipped, false) then 'survey_skipped' else 'survey_submitted' end);
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'cm2_is_admin()', 'cm2_pid(uuid,uuid,integer)', 'cm2_create_session(text)', 'cm2_update_session(uuid,jsonb)', 'cm2_session_action(uuid,text)',
    'cm2_admin_overview(uuid)', 'cm2_server_ms()', 'cm2_session_info(text)', 'cm2_get_session(uuid)', 'cm2_join(text,smallint,boolean)',
    'cm2_heartbeat(uuid,double precision,double precision,real,boolean,text,real,boolean)', 'cm2_leave(uuid)',
    'cm2_log_event(uuid,text,jsonb)', 'cm2_submit_survey(uuid,jsonb,boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- AFTER creating your artist user (Authentication -> Users -> Add user), run once:
--   insert into public.cm2_admins(user_id) select id from auth.users where email = 'YOU@EXAMPLE.COM';
