import { useEffect, useRef, useState } from 'react';
import { ConfigForm } from '../components/ConfigForm';
import { ExperienceView, type Sources } from '../components/ExperienceView';
import { Survey } from '../components/Survey';
import { CollectiveAudio } from '../lib/audio';
import { DEFAULT_CONFIG, type Config } from '../lib/config';
import { offsetLatLon } from '../lib/geo';
import type { ModelOutput } from '../lib/model';
import { go } from '../nav';

/** Artist-only simulator. Never touches Supabase, so simulated people and events cannot enter the collected feedback data. */
type Sim = { layer: 0 | 1; distance: number; meBearing: number; accuracy: number; gpsLost: boolean; speed: number; heading: number; compass: boolean;
  peerOn: boolean; peerDist: number; peerBearing: number; peerAccuracy: number; peerLocated: boolean };
const INIT: Sim = { layer: 0, distance: 200, meBearing: 270, accuracy: 6, gpsLost: false, speed: 1.4, heading: 90, compass: true, peerOn: false, peerDist: 120, peerBearing: 0, peerAccuracy: 6, peerLocated: true };

export function TestPage() {
  const [sim, setSim] = useState<Sim>(INIT);
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [dest, setDest] = useState({ lat: '41.8268', lon: '-71.4025' });
  const [runKey, setRunKey] = useState(0);
  const [ending, setEnding] = useState(false);
  const [survey, setSurvey] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [out, setOut] = useState<ModelOutput | null>(null);
  const [soundState, setSoundState] = useState('off');
  const [auto, setAuto] = useState(false);
  const audio = useRef<CollectiveAudio | null>(null);
  const simRef = useRef(sim); simRef.current = sim;
  const set = <K extends keyof Sim>(k: K, v: Sim[K]) => setSim(o => ({ ...o, [k]: v }));
  const D = { lat: Number(dest.lat), lon: Number(dest.lon) };
  const destOk = Number.isFinite(D.lat) && Number.isFinite(D.lon) && Math.abs(D.lat) <= 90 && Math.abs(D.lon) <= 180;

  const getSources = (): Sources => {
    const s = simRef.current; const me = offsetLatLon(D, s.distance, s.meBearing); const p = offsetLatLon(me, s.peerDist, s.peerBearing);
    return { fix: s.gpsLost ? null : { ...me, accuracy: s.accuracy }, fixAgeS: s.gpsLost ? 99 : 0, speed: s.speed, heading: s.compass ? s.heading : null, headingReliable: s.compass,
      peers: s.peerOn ? [{ pid: 'sim-peer', lat: s.peerLocated ? p.lat : null, lon: s.peerLocated ? p.lon : null, accuracy: s.peerLocated ? s.peerAccuracy : null, ageS: 1 }] : [] };
  };
  const startSound = async () => {
    audio.current?.dispose(); const a = new CollectiveAudio(); audio.current = a;
    const u = a.unlock(); setSoundState('loading…');
    try { await u; await a.prepare(sim.layer); a.play(null, 0); setSoundState('playing'); } catch (e) { setSoundState(`failed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const stopSound = () => { audio.current?.dispose(); audio.current = null; setSoundState('off'); };
  useEffect(() => () => audio.current?.dispose(), []);
  useEffect(() => { if (!auto) return; const t = window.setInterval(() => setSim(o => ({ ...o, peerOn: true, peerDist: Math.max(3, o.peerDist - 2) })), 500); return () => window.clearInterval(t); }, [auto]);

  const restart = () => { setRunKey(k => k + 1); setEnding(false); setEvents([]); audio.current?.setMix({ stage: 1, intro: 0.6, proximity: 0, filterOpen: 0, speed: 0 }); };
  const preset = (name: string) => {
    restart();
    if (name === 'alone') setSim(o => ({ ...o, distance: 5, peerOn: false, gpsLost: false }));
    if (name === 'far') setSim(o => ({ ...o, distance: 5, peerOn: true, peerDist: 600, peerLocated: false }));
    if (name === 'wait') setSim(o => ({ ...o, distance: 5, peerOn: true, peerDist: 90, peerLocated: true }));
    if (name === 'collective') setSim(o => ({ ...o, distance: 5, peerOn: true, peerDist: 5, peerLocated: true }));
    if (name === 'walk') setSim(o => ({ ...o, distance: 200, peerOn: false, gpsLost: false }));
    if (name === 'meetEnRoute') setSim(o => ({ ...o, distance: 90, peerOn: true, peerDist: 30, peerLocated: true }));
  };
  const slider = (label: string, k: keyof Sim, min: number, max: number, step = 1) => (
    <label className="cfgRow"><span>{label}</span><input type="range" min={min} max={max} step={step} value={sim[k] as number} onChange={e => set(k, Number(e.target.value) as never)} /><input type="number" value={sim[k] as number} onChange={e => set(k, Number(e.target.value) as never)} /></label>);
  const flag = (label: string, k: keyof Sim) => <label className="opt"><input type="checkbox" checked={sim[k] as boolean} onChange={e => set(k, e.target.checked as never)} /><span>{label}</span></label>;

  return (
    <main className="host test">
      <header className="bar"><h1><a onClick={() => go('/host')}>Artist</a> / Test mode</h1><span className="pill active">simulation · nothing is saved</span></header>
      <div className="testgrid">
        <div>
          <div className="phone">
            {destOk && !survey && <ExperienceView key={runKey} layer={sim.layer} dest={D} config={cfg} getSources={getSources} audio={audio.current} ending={ending}
              onEvent={(n, m) => setEvents(e => [`${new Date().toLocaleTimeString()}  ${n}${m ? ' ' + JSON.stringify(m) : ''}`, ...e].slice(0, 40))} onDerived={setOut} />}
            {survey && <div className="phoneScroll"><Survey ctx={{ metOther: true, reached: true }} onSubmit={a => { window.alert(JSON.stringify(a, null, 1)); setSurvey(false); }} /><button type="button" onClick={() => setSurvey(false)}>Close survey preview</button></div>}
          </div>
          <p className="muted center">Individual arrival and the two-colour encounter are separate presets.</p>
        </div>
        <div className="controls">
          <h2>Scenarios</h2>
          <div className="row wrap">
            <button onClick={() => preset('walk')}>Walking, 200 m out</button><button onClick={() => preset('alone')}>Arrive alone</button>
            <button onClick={() => preset('far')}>Other layer connects (far, no GPS)</button><button onClick={() => preset('meetEnRoute')}>Meet before destination</button>
            <button onClick={() => preset('wait')}>Waiting, other 90 m away</button><button onClick={() => preset('collective')}>Collective encounter (5 m)</button>
            <button onClick={() => setAuto(a => !a)}>{auto ? 'Stop' : 'Animate'} approach</button>
          </div>
          <div className="row wrap">
            <button onClick={restart}>Restart model</button><button onClick={() => setEnding(true)}>Trigger ending</button>
            <button onClick={() => { setEnding(true); window.setTimeout(() => setSurvey(true), 600); }}>Ending + survey</button><button onClick={() => setSurvey(true)}>Preview survey</button>
          </div>
          <h2>Sound</h2>
          <div className="row"><select value={sim.layer} onChange={e => { stopSound(); set('layer', Number(e.target.value) as 0 | 1); }}><option value={0}>This phone is Layer 01 (warm)</option><option value={1}>This phone is Layer 02 (cool)</option></select>
            {soundState === 'playing' ? <button onClick={stopSound}>Stop sound</button> : <button className="solid" onClick={() => void startSound()}>Start sound</button>}<span className="muted">{soundState}</span></div>
          <h2>Me</h2>
          {slider('Distance to destination (m)', 'distance', 0, 400)}{slider('My side of destination (° bearing)', 'meBearing', 0, 359)}
          {slider('Speed (m/s)', 'speed', 0, 3, 0.1)}{slider('GPS accuracy (m)', 'accuracy', 3, 80)}{slider('Phone heading (°)', 'heading', 0, 359)}
          <div className="row wrap">{flag('GPS lost', 'gpsLost')}{flag('Compass available', 'compass')}</div>
          <h2>Other participant (opposite layer)</h2>
          <div className="row wrap">{flag('Connected', 'peerOn')}{flag('Has GPS position', 'peerLocated')}</div>
          {slider('Distance from me (m)', 'peerDist', 0, 600)}{slider('Bearing from me (°)', 'peerBearing', 0, 359)}{slider('Their GPS accuracy (m)', 'peerAccuracy', 3, 80)}
          <h2>Parameters (this page only; real ones are set per session)</h2>
          <details><summary>Destination used by the simulator</summary><div className="two"><label>Latitude<input value={dest.lat} onChange={e => setDest(d => ({ ...d, lat: e.target.value }))} /></label><label>Longitude<input value={dest.lon} onChange={e => setDest(d => ({ ...d, lon: e.target.value }))} /></label></div></details>
          <ConfigForm value={cfg} onChange={setCfg} />
          <button onClick={() => void navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))}>Copy parameters as JSON</button>
          <h2>State</h2>
          {out && <table className="state"><tbody>
            <tr><td>GPS reliable</td><td>{String(out.gpsOk)}</td></tr><tr><td>Distance (smoothed)</td><td>{out.distToDest?.toFixed(1) ?? '—'} m</td></tr>
            <tr><td>Stage / volume</td><td>{out.stage} / {(out.intro * 100).toFixed(0)}%</td></tr><tr><td>Filter open</td><td>{(out.filterOpen * 100).toFixed(0)}%</td></tr>
            <tr><td>PRESENCE</td><td>{out.presenceCount} connected · light {(out.presenceLevel * 100).toFixed(0)}%</td></tr>
            <tr><td>PROXIMITY</td><td>{out.nearestDist?.toFixed(1) ?? '—'} m · {(out.proximity * 100).toFixed(0)}% · {out.collective}</td></tr>
            <tr><td>ARRIVAL</td><td>{out.arrived ? 'confirmed' : 'no'} · screen {(out.arrivalLevel * 100).toFixed(0)}%</td></tr>
            <tr><td>Second light</td><td>{(out.peerLevel * 100).toFixed(0)}% · direction {out.peerAngle === null ? 'none (glow)' : `${out.peerAngle.toFixed(0)}°`}</td></tr>
            <tr><td>Destination light</td><td>{out.destAngle === null ? 'none (ambient)' : `${out.destAngle.toFixed(0)}°`}</td></tr></tbody></table>}
          <h2>Simulated events (not saved)</h2><pre className="log">{events.join('\n') || '—'}</pre>
        </div>
      </div>
    </main>
  );
}
