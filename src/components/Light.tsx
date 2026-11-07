import { useEffect, useRef, type MutableRefObject } from 'react';
import { hexToRgb } from '../lib/config';
import { smoothAngle } from '../lib/geo';

export type LightTarget = { walk: number; walkAngle: number | null; arrival: number; peer: number; peerAngle: number | null; blend: number; fade: number };
export const newTarget = (): LightTarget => ({ walk: 0.3, walkAngle: null, arrival: 0, peer: 0, peerAngle: null, blend: 0, fade: 1 });
const mixRgb = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgbStr = (c: number[]) => c.join(' ');

/** Light as interface: CSS gradients driven by custom properties that a rAF loop eases toward the target (seconds-long easing, no flashing). */
export function Light({ target, ownColor, peerColor }: { target: MutableRefObject<LightTarget>; ownColor: string; peerColor: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const own = hexToRgb(ownColor), peer = hexToRgb(peerColor);
    el.style.setProperty('--own', rgbStr(own));
    el.style.setProperty('--hi', rgbStr(mixRgb(own, [255, 255, 255], 0.35)));
    el.style.setProperty('--lo', rgbStr(own.map(v => Math.round(v * 0.82))));
    el.style.setProperty('--peer', rgbStr(peer));
    el.style.setProperty('--mix', rgbStr(mixRgb(own, peer, 0.5).map(v => Math.min(255, v + 18))));
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cur = { walk: 0.3, arrival: 0, peer: 0, blend: 0, fade: 0, wDir: 0, wAng: 0, pDir: 0, pAng: 0 };
    let last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const T = target.current;
      const kMain = 1 - Math.exp(-dt / (reduced ? 1.6 : 0.8)), kFade = 1 - Math.exp(-dt / 2.2), kAng = 1 - Math.exp(-dt / 0.45);
      cur.walk += (T.walk - cur.walk) * kMain; cur.arrival += (T.arrival - cur.arrival) * kMain;
      cur.peer += (T.peer - cur.peer) * kMain; cur.blend += (T.blend - cur.blend) * kMain; cur.fade += (T.fade - cur.fade) * kFade;
      cur.wDir += ((T.walkAngle === null ? 0 : 1) - cur.wDir) * kAng; cur.pDir += ((T.peerAngle === null ? 0 : 1) - cur.pDir) * kAng;
      if (T.walkAngle !== null) cur.wAng = smoothAngle(cur.wAng, (T.walkAngle + 360) % 360, kAng);
      if (T.peerAngle !== null) cur.pAng = smoothAngle(cur.pAng, (T.peerAngle + 360) % 360, kAng);
      const rad = Math.PI / 180;
      const wx = 50 + cur.wDir * 34 * Math.sin(cur.wAng * rad), wy = 50 - cur.wDir * 34 * Math.cos(cur.wAng * rad);
      const px = 50 + cur.pDir * 60 * Math.sin(cur.pAng * rad), py = 55 - cur.pDir * 65 * Math.cos(cur.pAng * rad);
      const s = el.style;
      s.setProperty('--wa', cur.walk.toFixed(3)); s.setProperty('--wa2', (cur.walk * 0.4).toFixed(3));
      s.setProperty('--wr', (42 + 30 * cur.walk).toFixed(1)); s.setProperty('--wx', wx.toFixed(1)); s.setProperty('--wy', wy.toFixed(1));
      s.setProperty('--arr', cur.arrival.toFixed(3));
      s.setProperty('--pa', Math.min(1, cur.peer * 1.15).toFixed(3)); s.setProperty('--pa2', (cur.peer * 0.45).toFixed(3));
      s.setProperty('--pr', (28 + 95 * cur.peer).toFixed(1)); s.setProperty('--px', px.toFixed(1)); s.setProperty('--py', py.toFixed(1));
      s.setProperty('--col', cur.blend.toFixed(3));
      s.setProperty('--ang', (reduced ? 135 : 135 + Math.sin(now / 9000) * 40).toFixed(1));
      s.setProperty('--fade', Math.max(0, Math.min(1, cur.fade)).toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ownColor, peerColor, target]);
  return (<div className="light" ref={root} aria-hidden="true"><div className="l-walk" /><div className="l-peer" /><div className="l-arrive" /><div className="l-blend" /></div>);
}
