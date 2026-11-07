import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PeerInput } from './model';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = Boolean(url && key);
// Separate storage keys: an artist logged in on this browser never becomes a participant by opening a QR link.
const make = (storageKey: string): SupabaseClient | null => configured ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, storageKey } }) : null;
const pc = make('cm2-participant'); const hc = make('cm2-host');
export const errText = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
};
const need = (c: SupabaseClient | null): SupabaseClient => { if (!c) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'); return c; };

export type SessionInfo = { id: string; name: string; status: 'draft' | 'active' | 'ended' };
export type SessionPayload = { id: string; name: string; status: 'draft' | 'active' | 'ended'; run: number; layer: number; consent: boolean;
  dest_name: string | null; dest_lat: number | null; dest_lon: number | null; config: unknown; started_at_ms: number | null; server_ms: number };
export type HeartbeatIn = { lat: number | null; lon: number | null; accuracy: number | null; arrived: boolean; collective: string; nearest: number | null; gpsOk: boolean };

export async function participantAuth(): Promise<void> {
  const c = need(pc); const { data } = await c.auth.getSession(); if (data.session) return;
  const r = await c.auth.signInAnonymously();
  if (r.error) throw new Error(`${r.error.message} — enable Anonymous sign-ins in Supabase (Authentication → Providers).`);
}
export async function sessionInfo(code: string): Promise<SessionInfo | null> {
  const { data, error } = await need(pc).rpc('cm2_session_info', { p_code: code }); if (error) throw error; return (data as SessionInfo | null) ?? null;
}
export async function joinSession(code: string, layer: 0 | 1, consent: boolean): Promise<SessionPayload | { status: 'ended' }> {
  const { data, error } = await need(pc).rpc('cm2_join', { p_code: code, p_layer: layer, p_consent: consent }); if (error) throw error; return data as SessionPayload;
}
export async function getSession(id: string): Promise<SessionPayload> {
  const { data, error } = await need(pc).rpc('cm2_get_session', { p_session_id: id }); if (error) throw error; return data as SessionPayload;
}
export async function heartbeat(id: string, h: HeartbeatIn): Promise<{ status: string; peers: PeerInput[] }> {
  const { data, error } = await need(pc).rpc('cm2_heartbeat', { p_session_id: id, p_lat: h.lat, p_lon: h.lon, p_accuracy: h.accuracy, p_arrived: h.arrived, p_collective: h.collective, p_nearest: h.nearest, p_gps_ok: h.gpsOk });
  if (error) throw error;
  const d = data as { status: string; peers: { pid: string; lat: number | null; lon: number | null; accuracy: number | null; age_s: number }[] };
  return { status: d.status, peers: d.peers.map(p => ({ pid: p.pid, lat: p.lat, lon: p.lon, accuracy: p.accuracy, ageS: p.age_s })) };
}
export async function leaveSession(id: string) { await need(pc).rpc('cm2_leave', { p_session_id: id }); }
export function logEvent(id: string, event: string, meta: Record<string, unknown> = {}) {
  void need(pc).rpc('cm2_log_event', { p_session_id: id, p_event: event, p_meta: meta }).then(() => undefined, () => undefined);
}
export async function submitSurvey(id: string, answers: Record<string, unknown>, skipped: boolean): Promise<boolean> {
  const { data, error } = await need(pc).rpc('cm2_submit_survey', { p_session_id: id, p_answers: answers, p_skipped: skipped }); if (error) throw error; return Boolean(data);
}
export async function serverClockOffset(n = 5): Promise<number> {
  const c = need(pc); let best: { rtt: number; off: number } | null = null;
  for (let i = 0; i < n; i++) {
    const t0 = Date.now(); const { data, error } = await c.rpc('cm2_server_ms'); const t1 = Date.now(); if (error) throw error;
    const rtt = t1 - t0, off = Number(data) - (t0 + t1) / 2; if (!best || rtt < best.rtt) best = { rtt, off };
  }
  return best!.off;
}

export type HostSession = { id: string; code: string; name: string; status: 'draft' | 'active' | 'ended'; run: number;
  dest_name: string | null; dest_lat: number | null; dest_lon: number | null;
  start_a_name: string | null; start_a_lat: number | null; start_a_lon: number | null; start_b_name: string | null; start_b_lat: number | null; start_b_lon: number | null;
  config: Record<string, unknown>; created_at: string; started_at: string | null; ended_at: string | null };
export type Overview = { status: string; run: number; surveys: number; events: number;
  participants: { pid: string; layer: number; consent: boolean; age_s: number | null; accuracy: number | null; gps_ok: boolean; arrived: boolean; collective: string; nearest_m: number | null }[] };
export const hostAuth = {
  async signIn(email: string, password: string) { const { error } = await need(hc).auth.signInWithPassword({ email, password }); if (error) throw error; },
  async signOut() { await need(hc).auth.signOut(); },
  async hasSession(): Promise<boolean> { const { data } = await need(hc).auth.getSession(); return Boolean(data.session); },
  async isAdmin(): Promise<boolean> { const { data, error } = await need(hc).rpc('cm2_is_admin'); if (error) throw error; return Boolean(data); },
};
export async function listSessions(): Promise<HostSession[]> { const { data, error } = await need(hc).from('cm2_sessions').select('*').order('created_at', { ascending: false }); if (error) throw error; return data as HostSession[]; }
export async function getHostSession(id: string): Promise<HostSession> { const { data, error } = await need(hc).from('cm2_sessions').select('*').eq('id', id).single(); if (error) throw error; return data as HostSession; }
export async function createHostSession(name: string): Promise<HostSession> { const { data, error } = await need(hc).rpc('cm2_create_session', { p_name: name }); if (error) throw error; return data as HostSession; }
export async function updateHostSession(id: string, patch: Record<string, unknown>): Promise<HostSession> { const { data, error } = await need(hc).rpc('cm2_update_session', { p_id: id, p_patch: patch }); if (error) throw error; return data as HostSession; }
export async function sessionAction(id: string, action: 'start' | 'end' | 'reset'): Promise<HostSession> { const { data, error } = await need(hc).rpc('cm2_session_action', { p_id: id, p_action: action }); if (error) throw error; return data as HostSession; }
export async function adminOverview(id: string): Promise<Overview> { const { data, error } = await need(hc).rpc('cm2_admin_overview', { p_id: id }); if (error) throw error; return data as Overview; }
async function fetchAll(table: 'cm2_events' | 'cm2_surveys', id: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await need(hc).from(table).select('*').eq('session_id', id).order('created_at').range(from, from + 999);
    if (error) throw error; out.push(...(data as Record<string, unknown>[])); if (!data || data.length < 1000) break;
  }
  return out;
}
export const fetchEvents = (id: string) => fetchAll('cm2_events', id);
export const fetchSurveys = (id: string) => fetchAll('cm2_surveys', id);
