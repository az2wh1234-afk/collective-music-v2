/** Tunable artistic / technical parameters. Stored per session in Supabase (cm2_sessions.config). */
export type Config = {
  stage2Distance: number; stage2Hysteresis: number; introStartGain: number; introDistance: number;
  collectiveFar: number; collectiveNear: number; proximityRiseRate: number; proximityFallRate: number;
  arrivalRadius: number; arrivalDwellSec: number; arrivalMaxAccuracy: number; arrivalExitFactor: number; filterOpenDistance: number;
  fixMaxAccuracy: number; peerMaxAgeSec: number;
  presenceFloor: number; lightFar: number; arrivalBrightness: number; color0: string; color1: string;
};
export const DEFAULT_CONFIG: Config = {
  stage2Distance: 60, stage2Hysteresis: 10, introStartGain: 0.6, introDistance: 10,
  collectiveFar: 25, collectiveNear: 8, proximityRiseRate: 0.25, proximityFallRate: 0.15,
  arrivalRadius: 10, arrivalDwellSec: 3, arrivalMaxAccuracy: 25, arrivalExitFactor: 1.6, filterOpenDistance: 10,
  fixMaxAccuracy: 35, peerMaxAgeSec: 20,
  presenceFloor: 0.14, lightFar: 150, arrivalBrightness: 1, color0: '#ffb347', color1: '#4aa8ff',
};
type Field = { key: keyof Config; label: string; min: number; max: number; step: number; group: string };
export const NUMERIC_FIELDS: Field[] = [
  { key: 'stage2Distance', label: 'Stage 2 distance (m)', min: 10, max: 500, step: 1, group: 'Music' },
  { key: 'stage2Hysteresis', label: 'Stage 2 hysteresis (m)', min: 0, max: 50, step: 1, group: 'Music' },
  { key: 'introStartGain', label: 'Starting volume', min: 0.1, max: 1, step: 0.05, group: 'Music' },
  { key: 'introDistance', label: 'Distance to full volume (m)', min: 2, max: 100, step: 1, group: 'Music' },
  { key: 'collectiveFar', label: 'Collective begins (m)', min: 5, max: 100, step: 1, group: 'Collective' },
  { key: 'collectiveNear', label: 'Collective full (m)', min: 1, max: 50, step: 1, group: 'Collective' },
  { key: 'proximityRiseRate', label: 'Rise rate (/s)', min: 0.05, max: 1, step: 0.05, group: 'Collective' },
  { key: 'proximityFallRate', label: 'Fall rate (/s)', min: 0.05, max: 1, step: 0.05, group: 'Collective' },
  { key: 'arrivalRadius', label: 'Arrival radius (m)', min: 3, max: 50, step: 1, group: 'Arrival' },
  { key: 'arrivalDwellSec', label: 'Arrival dwell (s)', min: 0, max: 20, step: 0.5, group: 'Arrival' },
  { key: 'arrivalMaxAccuracy', label: 'Arrival max GPS error (m)', min: 5, max: 80, step: 1, group: 'Arrival' },
  { key: 'filterOpenDistance', label: 'Filter fully open within (m)', min: 3, max: 100, step: 1, group: 'Arrival' },
  { key: 'fixMaxAccuracy', label: 'Ignore GPS worse than (m)', min: 10, max: 100, step: 1, group: 'Reliability' },
  { key: 'peerMaxAgeSec', label: 'Presence timeout (s)', min: 6, max: 90, step: 1, group: 'Reliability' },
  { key: 'presenceFloor', label: 'Second light when connected', min: 0, max: 0.6, step: 0.02, group: 'Light' },
  { key: 'lightFar', label: 'Second light grows within (m)', min: 30, max: 1000, step: 10, group: 'Light' },
  { key: 'arrivalBrightness', label: 'Arrival brightness', min: 0.3, max: 1, step: 0.05, group: 'Light' },
];
const HEX = /^#[0-9a-fA-F]{6}$/;
export function mergeConfig(raw: unknown): Config {
  const out: Config = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const f of NUMERIC_FIELDS) { const v = r[f.key]; if (typeof v === 'number' && Number.isFinite(v)) (out[f.key] as number) = Math.min(f.max, Math.max(f.min, v)); }
  if (typeof r.color0 === 'string' && HEX.test(r.color0)) out.color0 = r.color0;
  if (typeof r.color1 === 'string' && HEX.test(r.color1)) out.color1 = r.color1;
  if (out.collectiveNear >= out.collectiveFar) out.collectiveNear = Math.max(1, out.collectiveFar - 1);
  return out;
}
export function hexToRgb(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex : '#ffffff';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
