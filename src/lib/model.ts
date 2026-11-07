import type { Config } from './config';
import { type LatLon, angleDiff, bearingDeg, clamp01, distanceM, smoothstep } from './geo';

export type PeerInput = { pid: string; lat: number | null; lon: number | null; accuracy: number | null; ageS: number };
export type Fix = { lat: number; lon: number; accuracy: number };
export type ModelInput = { fix: Fix | null; fixAgeS: number; speed: number; heading: number | null; headingReliable: boolean; dest: LatLon | null; peers: PeerInput[] };
export type CollectiveState = 'none' | 'transition' | 'full';
export type ModelOutput = {
  gpsOk: boolean; distToDest: number | null; stage: 1 | 2; intro: number; filterOpen: number;
  presenceCount: number; presenceLevel: number;
  nearestDist: number | null; proximity: number; collective: CollectiveState;
  arrived: boolean; arrivalLevel: number;
  walkLevel: number; peerLevel: number; blendLevel: number;
  destAngle: number | null; peerAngle: number | null;
};
const slew = (cur: number, target: number, up: number, down: number, dt: number) =>
  target > cur ? Math.min(target, cur + up * dt) : Math.max(target, cur - down * dt);

/** Pure interaction logic shared by real sessions and the simulator. Presence, proximity and arrival are independent. */
export class ExperienceModel {
  private last = 0; private smDist: number | null = null; private baseline: number | null = null; private maxApproach = 0;
  private destKey = ''; private stage: 1 | 2 = 1;
  private arrivalSince: number | null = null; private leaveSince: number | null = null; private arrived = false; private arrivalLevel = 0;
  private distOpen = 0; private distOpenOn = false; private presence = 0; private proximity = 0;
  private collective: CollectiveState = 'none'; private target: string | null = null; private smPeerDist: number | null = null;
  constructor(private cfg: Config) {}
  setConfig(cfg: Config) { this.cfg = cfg; }

  update(inp: ModelInput, now: number): ModelOutput {
    const c = this.cfg;
    const dt = this.last ? Math.min(1, Math.max(0, (now - this.last) / 1000)) : 0;
    this.last = now;
    const key = inp.dest ? `${inp.dest.lat.toFixed(6)},${inp.dest.lon.toFixed(6)}` : '';
    if (key !== this.destKey) { this.destKey = key; this.baseline = null; this.maxApproach = 0; this.smDist = null; this.arrivalSince = null; this.arrived = false; this.stage = 1; }
    const gpsOk = !!inp.fix && inp.fixAgeS <= 15 && inp.fix.accuracy <= c.fixMaxAccuracy;

    if (gpsOk && inp.fix && inp.dest) {
      const raw = distanceM(inp.fix, inp.dest);
      this.smDist = this.smDist === null ? raw : this.smDist + (raw - this.smDist) * (dt > 0 ? Math.min(1, dt / 1.0) : 1);
      if (this.baseline === null) this.baseline = this.smDist;
      this.maxApproach = Math.max(this.maxApproach, this.baseline - this.smDist);
    }
    const d = this.smDist;

    if (gpsOk && d !== null) {
      if (this.stage === 1 && d <= c.stage2Distance) this.stage = 2;
      else if (this.stage === 2 && d > c.stage2Distance + c.stage2Hysteresis) this.stage = 1;
    }
    const intro = c.introStartGain + (1 - c.introStartGain) * clamp01(this.maxApproach / c.introDistance);

    if (gpsOk && inp.fix && d !== null) {
      const inside = d <= c.arrivalRadius && inp.fix.accuracy <= c.arrivalMaxAccuracy;
      if (!this.arrived) {
        if (inside) { this.arrivalSince ??= now; if (now - this.arrivalSince >= c.arrivalDwellSec * 1000) { this.arrived = true; this.leaveSince = null; } }
        else this.arrivalSince = null;
      } else if (d > c.arrivalRadius * c.arrivalExitFactor) {
        this.leaveSince ??= now;
        if (now - this.leaveSince >= 6000) { this.arrived = false; this.arrivalSince = null; this.leaveSince = null; }
      } else this.leaveSince = null;
    }
    this.arrivalLevel = slew(this.arrivalLevel, this.arrived ? 1 : 0, 0.4, 0.25, dt);

    const active = inp.peers.filter(p => p.ageS <= c.peerMaxAgeSec);
    this.presence = slew(this.presence, active.length ? 1 : 0, 0.4, 0.15, dt);

    let nearest: { pid: string; dist: number; peer: PeerInput } | null = null;
    if (gpsOk && inp.fix) {
      const reliable = active.filter(p => p.lat !== null && p.lon !== null && p.accuracy !== null && p.accuracy <= c.fixMaxAccuracy)
        .map(p => ({ pid: p.pid, dist: distanceM(inp.fix!, { lat: p.lat!, lon: p.lon! }), peer: p }));
      if (reliable.length) {
        const best = reliable.reduce((a, b) => (b.dist < a.dist ? b : a));
        const cur = reliable.find(r => r.pid === this.target);
        nearest = cur && !(best.dist < cur.dist - Math.max(5, cur.dist * 0.2)) ? cur : best;
      }
    }
    if (nearest) {
      if (nearest.pid !== this.target || this.smPeerDist === null) { this.target = nearest.pid; this.smPeerDist = nearest.dist; }
      else this.smPeerDist += (nearest.dist - this.smPeerDist) * (dt > 0 ? Math.min(1, dt / 1.5) : 1);
    } else { this.target = null; this.smPeerDist = null; }
    const span = Math.max(1, c.collectiveFar - c.collectiveNear);
    const proxTarget = this.smPeerDist === null ? 0 : clamp01((c.collectiveFar - this.smPeerDist) / span);
    this.proximity = slew(this.proximity, proxTarget, c.proximityRiseRate, c.proximityFallRate, dt);
    if (this.collective === 'none' && this.proximity > 0.02) this.collective = 'transition';
    else if (this.collective !== 'none' && this.proximity < 0.005) this.collective = 'none';
    if (this.collective === 'transition' && this.proximity >= 0.98) this.collective = 'full';
    else if (this.collective === 'full' && this.proximity < 0.85) this.collective = 'transition';

    if (gpsOk && d !== null) {
      if (!this.distOpenOn && d <= c.filterOpenDistance) this.distOpenOn = true;
      else if (this.distOpenOn && d > c.filterOpenDistance + 3) this.distOpenOn = false;
    }
    this.distOpen = slew(this.distOpen, this.distOpenOn ? 1 : 0, 1, 0.7, dt);
    const filterOpen = Math.max(this.distOpen, this.proximity);

    const farRange = this.smPeerDist === null ? 0 : smoothstep((c.lightFar - this.smPeerDist) / Math.max(1, c.lightFar - c.collectiveFar));
    const peerLevel = this.presence * Math.max(c.presenceFloor, 0.55 * farRange) + 0.45 * this.proximity;
    const progress = this.baseline && d !== null ? clamp01(1 - d / Math.max(1, this.baseline)) : 0;
    const walkLevel = 0.3 + 0.35 * progress;
    const headingOk = inp.heading !== null && inp.headingReliable;
    const destAngle = headingOk && gpsOk && inp.fix && inp.dest && d !== null && d > c.arrivalRadius ? angleDiff(inp.heading!, bearingDeg(inp.fix, inp.dest)) : null;
    const peerAngle = headingOk && nearest && inp.fix && this.smPeerDist !== null && this.smPeerDist > 10
      ? angleDiff(inp.heading!, bearingDeg(inp.fix, { lat: nearest.peer.lat!, lon: nearest.peer.lon! })) : null;
    return { gpsOk, distToDest: d, stage: this.stage, intro, filterOpen, presenceCount: active.length, presenceLevel: this.presence,
      nearestDist: this.smPeerDist, proximity: this.proximity, collective: this.collective, arrived: this.arrived, arrivalLevel: this.arrivalLevel,
      walkLevel, peerLevel: clamp01(peerLevel), blendLevel: this.proximity, destAngle, peerAngle };
  }
}
