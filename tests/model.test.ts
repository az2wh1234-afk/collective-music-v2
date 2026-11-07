import { DEFAULT_CONFIG } from '../src/lib/config';
import { ExperienceModel, type ModelInput, type PeerInput } from '../src/lib/model';
import { offsetLatLon } from '../src/lib/geo';
const dest = { lat: 41.8268, lon: -71.4025 };
let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
function run(distFn: (t: number) => number, peerFn: ((t: number) => PeerInput | null) | null, seconds: number, opts: { acc?: number; gpsLostFrom?: number; gpsLostTo?: number } = {}) {
  const m = new ExperienceModel(DEFAULT_CONFIG);
  let out = m.update({ fix: null, fixAgeS: 99, speed: 0, heading: null, headingReliable: false, dest, peers: [] }, 0);
  const outs: { t: number; o: typeof out }[] = [];
  for (let t = 0; t <= seconds; t += 0.25) {
    const me = offsetLatLon(dest, distFn(t), 90);
    const lost = opts.gpsLostFrom !== undefined && t >= opts.gpsLostFrom && t < (opts.gpsLostTo ?? 1e9);
    const peer = peerFn ? peerFn(t) : null;
    const inp: ModelInput = { fix: lost ? null : { ...me, accuracy: opts.acc ?? 8 }, fixAgeS: lost ? 99 : 0, speed: 1.4, heading: 0, headingReliable: true, dest, peers: peer ? [peer] : [] };
    out = m.update(inp, 1000 + t * 1000); outs.push({ t, o: out });
  }
  return { out, outs };
}
const peerAt = (distFromMe: (t: number) => number, distMe: (t: number) => number) => (t: number): PeerInput => {
  const me = offsetLatLon(dest, distMe(t), 90); const p = offsetLatLon(me, distFromMe(t), 0);
  return { pid: 'p1', lat: p.lat, lon: p.lon, accuracy: 8, ageS: 1 };
};
let r = run(t => Math.max(4, 100 - t * 3), null, 80);
ok('arrive alone: arrived', r.out.arrived); ok('arrive alone: arrival light ~1', r.out.arrivalLevel > 0.99);
ok('arrive alone: no collective', r.out.collective === 'none' && r.out.proximity === 0); ok('arrive alone: filter open', r.out.filterOpen > 0.99);
r = run(t => (t > 10 && t < 11 ? 5 : 40), null, 30); ok('brief pass: not arrived', !r.out.arrived);
r = run(() => 4, null, 30, { acc: 40 }); ok('accuracy 40m: not arrived, gpsOk false', !r.out.arrived && !r.out.gpsOk);
r = run(t => 120 - t * 2, null, 50); ok('stage 2 within 60m', r.out.stage === 2);
r = run(t => (t < 20 ? 55 : 66), null, 30); ok('stage hysteresis: 66m stays stage 2', r.out.stage === 2);
r = run(t => (t < 20 ? 55 : 75), null, 40); ok('stage returns to 1 beyond 70m', r.out.stage === 1);
r = run(t => 200 - t * 1, null, 20); ok('intro rises to 1 after 10m progress', r.out.intro > 0.99);
const v = run(t => 200 - Math.min(t, 5), null, 30).outs.map(x => x.o.intro); ok('intro monotonic', v.every((x, i) => i === 0 || x >= v[i - 1] - 1e-9));
r = run(t => 200 + t * 1, null, 20); ok('walking away: intro stays 0.6', Math.abs(r.out.intro - 0.6) < 0.02);
r = run(() => 150, () => ({ pid: 'p1', lat: null, lon: null, accuracy: null, ageS: 2 }), 20);
ok('presence only: second light visible', r.out.peerLevel >= DEFAULT_CONFIG.presenceFloor - 0.01); ok('presence only: no collective music', r.out.proximity === 0 && r.out.collective === 'none');
r = run(() => 150, () => ({ pid: 'p1', lat: null, lon: null, accuracy: null, ageS: 60 }), 20); ok('expired presence: second light gone', r.out.peerLevel < 0.02);
r = run(() => 4, peerAt(() => 6, () => 4), 30); ok('peer at 6m: full collective', r.out.collective === 'full' && r.out.proximity > 0.99);
ok('collective while arrived: arrival still on', r.out.arrived && r.out.arrivalLevel > 0.99);
r = run(() => 80, peerAt(() => 40, () => 80), 20); ok('peer at 40m: no collective yet', r.out.proximity === 0); ok('peer at 40m: light stronger than floor', r.out.peerLevel > DEFAULT_CONFIG.presenceFloor);
r = run(() => 80, peerAt(() => 16, () => 80), 30); ok('peer at 16.5m: partial', r.out.proximity > 0.4 && r.out.proximity < 0.6);
const sep = run(() => 80, peerAt(t => (t < 20 ? 5 : 60), () => 80), 24).outs;
const a = sep.find(x => x.t === 20.25)!.o.proximity, b = sep.find(x => x.t === 24)!.o.proximity; ok('separation: gradual fall', a > 0.9 && b > 0.2 && b < a);
r = run(() => 4, null, 40, { gpsLostFrom: 20, gpsLostTo: 40 }); ok('GPS loss after arrival: arrival retained', r.out.arrived && r.out.arrivalLevel > 0.99);
const o2 = new ExperienceModel(DEFAULT_CONFIG).update({ fix: { ...offsetLatLon(dest, 80, 90), accuracy: 8 }, fixAgeS: 0, speed: 0, heading: null, headingReliable: false, dest, peers: [] }, 1000);
ok('no compass: destAngle null', o2.destAngle === null); ok('with compass: destAngle defined', run(() => 80, null, 3).out.destAngle !== null);
console.log(fails ? `\n${fails} FAILED` : '\nAll scenario checks passed'); process.exit(fails ? 1 : 0);
