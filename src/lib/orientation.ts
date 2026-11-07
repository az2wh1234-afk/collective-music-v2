import { smoothAngle } from './geo';
export type CompassStatus = 'idle' | 'unsupported' | 'denied' | 'ok';
export type CompassSnapshot = { status: CompassStatus; heading: number | null; reliable: boolean };
export function compassHeading(alpha: number, beta: number, gamma: number): number {
  const d = Math.PI / 180, x = beta * d, y = gamma * d, z = alpha * d;
  const cY = Math.cos(y), cZ = Math.cos(z), sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
  const vx = -cZ * sY - sZ * sX * cY, vy = -sZ * sY + cZ * sX * cY;
  let h = Math.atan(vx / vy);
  if (vy < 0) h += Math.PI; else if (vx < 0) h += 2 * Math.PI;
  return (h * 180 / Math.PI + 360) % 360;
}
type DOEWithPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };
/** iOS: webkitCompassHeading (permission from a tap). Android: deviceorientationabsolute. Relative-only events are ignored. */
export class Compass {
  private status: CompassStatus = 'idle'; private heading: number | null = null; private acc: number | null = null;
  private lastEvent = 0; private listening = false;
  async request(): Promise<void> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: DOEWithPermission }).DeviceOrientationEvent;
    if (!DOE) { this.status = 'unsupported'; return; }
    if (typeof DOE.requestPermission === 'function') {
      try { if ((await DOE.requestPermission()) !== 'granted') { this.status = 'denied'; return; } } catch { this.status = 'denied'; return; }
    }
    this.status = 'ok';
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientationabsolute', this.onEvent as EventListener, true);
    window.addEventListener('deviceorientation', this.onEvent as EventListener, true);
  }
  stop() {
    window.removeEventListener('deviceorientationabsolute', this.onEvent as EventListener, true);
    window.removeEventListener('deviceorientation', this.onEvent as EventListener, true);
    this.listening = false;
  }
  private onEvent = (e: DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassHeadingAccuracy?: number }) => {
    let h: number | null = null; let acc: number | null = null;
    if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) { h = e.webkitCompassHeading; acc = e.webkitCompassHeadingAccuracy ?? null; }
    else if (e.absolute && e.alpha !== null && e.beta !== null && e.gamma !== null) { h = compassHeading(e.alpha, e.beta, e.gamma); acc = 0; }
    if (h === null || !Number.isFinite(h)) return;
    this.lastEvent = Date.now(); this.acc = acc;
    this.heading = this.heading === null ? h : smoothAngle(this.heading, h, 0.15);
  };
  snapshot(): CompassSnapshot {
    const fresh = Date.now() - this.lastEvent < 2500;
    const reliable = this.status === 'ok' && this.heading !== null && fresh && (this.acc === null || (this.acc >= 0 && this.acc <= 35));
    return { status: this.status, heading: this.heading, reliable };
  }
}
