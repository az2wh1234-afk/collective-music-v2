import { distanceM, lerp } from './geo';
import type { Fix } from './model';
export type GpsStatus = 'idle' | 'asking' | 'ok' | 'weak' | 'stale' | 'denied' | 'unavailable' | 'unsupported';
export type GpsSnapshot = { status: GpsStatus; fix: Fix | null; fixAgeS: number; speed: number; latestAccuracy: number | null };

/** watchPosition wrapper: accuracy gate, jump rejection (3 consistent fixes), accuracy-weighted smoothing, speed dwell, silent-GPS watchdog. */
export class GpsTracker {
  private watchId: number | null = null; private status: GpsStatus = 'idle';
  private fix: Fix | null = null; private fixTime = 0;
  private raw: { lat: number; lon: number; t: number } | null = null;
  private speedSm = 0; private speedOut = 0; private stopSince: number | null = null;
  private jumps = 0; private latestAcc: number | null = null; private lastEvent = 0;
  constructor(private maxAccuracy: () => number) {}
  start() {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) { this.status = 'unsupported'; return; }
    this.status = 'asking';
    this.watchId = navigator.geolocation.watchPosition(p => this.onPos(p), e => this.onErr(e), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
  }
  stop() { if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId); this.watchId = null; this.status = 'idle'; }
  private onErr(e: GeolocationPositionError) {
    if (e.code === 1) this.status = 'denied';
    else if (this.status !== 'denied') this.status = this.fix ? 'stale' : 'unavailable';
  }
  private onPos(p: GeolocationPosition) {
    const now = Date.now(); this.lastEvent = now;
    const acc = p.coords.accuracy; this.latestAcc = acc;
    const cur = { lat: p.coords.latitude, lon: p.coords.longitude };
    const prev = this.raw; const dt = prev ? (now - prev.t) / 1000 : 0;
    const derived = prev && dt >= 1 && dt <= 30 ? distanceM(prev, cur) / dt : 0;
    const reported = p.coords.speed;
    const sp = reported !== null && Number.isFinite(reported) && reported >= 0 ? reported : derived;
    if (acc > this.maxAccuracy()) { this.status = 'weak'; return; }
    this.raw = { ...cur, t: now };
    if (this.fix) {
      const gap = (now - this.fixTime) / 1000, d = distanceM(this.fix, cur);
      if (gap < 10 && d > 2 * (acc + this.fix.accuracy) && d / Math.max(gap, 0.5) > 9) { if (++this.jumps < 3) return; }
    }
    this.jumps = 0;
    if (this.fix) {
      const w = Math.min(0.75, Math.max(0.25, this.fix.accuracy ** 2 / (this.fix.accuracy ** 2 + acc ** 2)));
      this.fix = { lat: lerp(this.fix.lat, cur.lat, w), lon: lerp(this.fix.lon, cur.lon, w), accuracy: acc };
    } else this.fix = { ...cur, accuracy: acc };
    this.fixTime = now; this.status = 'ok';
    this.speedSm = this.speedSm * 0.7 + Math.min(4, Math.max(0, sp)) * 0.3;
    if (this.speedSm < 0.35) { this.stopSince ??= now; if (now - this.stopSince >= 4000) this.speedOut = 0; }
    else { this.stopSince = null; this.speedOut = this.speedSm; }
  }
  snapshot(now = Date.now()): GpsSnapshot {
    const age = this.fix ? (now - this.fixTime) / 1000 : 999;
    let status = this.status;
    if (status === 'ok' && age > 8) status = 'stale';
    if (this.watchId !== null && this.lastEvent && now - this.lastEvent > 20000 && (status === 'ok' || status === 'weak')) status = 'stale';
    const speed = age > 6 ? 0 : this.speedOut;
    return { status, fix: this.fix, fixAgeS: age, speed, latestAccuracy: this.latestAcc };
  }
}
