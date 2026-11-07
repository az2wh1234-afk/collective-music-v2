import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CollectiveAudio } from '../lib/audio';
import type { Config } from '../lib/config';
import type { LatLon } from '../lib/geo';
import { ExperienceModel, type Fix, type ModelOutput, type PeerInput } from '../lib/model';
import { Light, newTarget } from './Light';

export type Sources = { fix: Fix | null; fixAgeS: number; speed: number; heading: number | null; headingReliable: boolean; peers: PeerInput[] };
type Props = { layer: 0 | 1; dest: LatLon | null; config: Config; getSources: () => Sources; audio: CollectiveAudio | null; ending: boolean;
  onEvent: (name: string, meta?: Record<string, unknown>) => void; onDerived?: (o: ModelOutput) => void; onTap?: () => void; overlay?: (o: ModelOutput | null) => ReactNode };

/** Runs the interaction model at 5 Hz, drives audio + light from it, and emits feedback events on state transitions. */
export function ExperienceView(props: Props) {
  const P = useRef(props); P.current = props;
  const model = useRef<ExperienceModel | null>(null);
  const target = useRef(newTarget());
  const [info, setInfo] = useState<ModelOutput | null>(null);
  const prev = useRef({ stage: 1, arrived: false, presence: 0, collective: 'none', gpsBadSince: null as number | null, gpsLostLogged: false, faded: false });
  useEffect(() => { if (!model.current) model.current = new ExperienceModel(props.config); else model.current.setConfig(props.config); }, [props.config]);
  useEffect(() => {
    if (!model.current) model.current = new ExperienceModel(P.current.config);
    let n = 0;
    const tick = () => {
      const p = P.current, s = p.getSources(), now = Date.now();
      const o = model.current!.update({ ...s, dest: p.dest }, now);
      const L = target.current;
      L.walk = o.walkLevel * (1 - o.arrivalLevel); L.walkAngle = o.destAngle;
      L.arrival = o.arrivalLevel * p.config.arrivalBrightness;
      L.peer = o.peerLevel; L.peerAngle = o.peerAngle; L.blend = o.blendLevel; L.fade = p.ending ? 0 : 1;
      const a = p.audio;
      if (a) {
        a.setMix({ stage: o.stage, intro: o.intro, proximity: o.proximity, filterOpen: o.filterOpen, speed: s.speed });
        if (p.ending && !prev.current.faded) { prev.current.faded = true; a.fadeOut(5); }
      }
      const v = prev.current, ev = p.onEvent;
      if (o.stage === 2 && v.stage === 1) ev('stage2_entered', { dist: Math.round(o.distToDest ?? -1) });
      if (o.arrived && !v.arrived) ev('destination_reached');
      if (o.presenceCount > 0 && v.presence === 0) ev('opposite_presence_detected');
      if (o.collective !== v.collective) {
        if (o.collective === 'transition' && v.collective === 'none') ev('collective_transition_started');
        if (o.collective === 'full') ev('collective_full_entered', { nearest: Math.round(o.nearestDist ?? -1) });
        if (v.collective === 'full' && o.collective !== 'full') ev('collective_state_exited');
      }
      if (!o.gpsOk) { v.gpsBadSince ??= now; if (!v.gpsLostLogged && now - v.gpsBadSince > 8000) { v.gpsLostLogged = true; ev('gps_unreliable'); } }
      else { if (v.gpsLostLogged) ev('gps_restored'); v.gpsBadSince = null; v.gpsLostLogged = false; }
      v.stage = o.stage; v.arrived = o.arrived; v.presence = o.presenceCount; v.collective = o.collective;
      p.onDerived?.(o);
      if (n++ % 5 === 0) setInfo(o);
    };
    tick(); const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, []);
  const own = props.layer === 0 ? props.config.color0 : props.config.color1;
  const other = props.layer === 0 ? props.config.color1 : props.config.color0;
  return (<div className="stage" onClick={props.onTap}><Light target={target} ownColor={own} peerColor={other} />{props.overlay?.(info)}</div>);
}
