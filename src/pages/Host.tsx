import { useCallback, useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { ConfigForm } from '../components/ConfigForm';
import { DEFAULT_CONFIG, mergeConfig, type Config } from '../lib/config';
import { downloadText, flattenSurveys, toCsv } from '../lib/csv';
import { go } from '../nav';
import { adminOverview, configured, createHostSession, errText, fetchEvents, fetchSurveys, getHostSession, hostAuth, listSessions, sessionAction, updateHostSession, type HostSession, type Overview } from '../lib/supabase';

/** Gate for every artist page: password login + membership in cm2_admins (enforced by the database, not just the UI). */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'login' | 'denied' | 'ok' | 'config'>('checking');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('');
  const check = useCallback(async () => {
    if (!configured) { setState('config'); return; }
    try { if (!(await hostAuth.hasSession())) { setState('login'); return; } setState((await hostAuth.isAdmin()) ? 'ok' : 'denied'); }
    catch (e) { setErr(errText(e)); setState('login'); }
  }, []);
  useEffect(() => { void check(); }, [check]);
  if (state === 'ok') return <>{children}</>;
  return (
    <main className="host narrow">
      <h1>Collective Music · Artist</h1>
      {state === 'checking' && <p className="muted">Checking access…</p>}
      {state === 'config' && <p className="error">Supabase environment variables are missing (see README_V20.md).</p>}
      {state === 'denied' && <div><p className="error">This account is not authorised as an artist. Add it to cm2_admins (README_V20.md, step 3).</p><button onClick={() => void hostAuth.signOut().then(check)}>Sign out</button></div>}
      {state === 'login' && (
        <form onSubmit={e => { e.preventDefault(); setErr(''); void hostAuth.signIn(email, password).then(check).catch(x => setErr(errText(x))); }}>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button className="solid" type="submit">Sign in</button>
          {err && <p className="error">{err}</p>}
        </form>
      )}
    </main>
  );
}

export function HostHome() {
  const [rows, setRows] = useState<HostSession[]>([]); const [name, setName] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { void listSessions().then(setRows).catch(e => setErr(errText(e))); }, []);
  return (
    <main className="host">
      <header className="bar"><h1>Sessions</h1><span><button onClick={() => go('/test')}>Test mode</button> <button onClick={() => void hostAuth.signOut().then(() => window.location.assign('/host'))}>Sign out</button></span></header>
      <form className="row" onSubmit={e => { e.preventDefault(); setErr(''); void createHostSession(name).then(s => go(`/host/${s.id}`)).catch(x => setErr(errText(x))); }}>
        <input placeholder="New session name" value={name} onChange={e => setName(e.target.value)} />
        <button className="solid" type="submit">Create session</button>
      </form>
      {err && <p className="error">{err}</p>}
      <table><thead><tr><th>Name</th><th>Code</th><th>Status</th><th>Destination</th><th>Created</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className="link" onClick={() => go(`/host/${r.id}`)}>
            <td>{r.name}</td><td>{r.code}</td><td><span className={`pill ${r.status}`}>{r.status}</span></td>
            <td>{r.dest_lat !== null ? `${r.dest_name || 'unnamed'} (${r.dest_lat.toFixed(5)}, ${r.dest_lon?.toFixed(5)})` : 'not set'}</td>
            <td>{new Date(r.created_at).toLocaleString()}</td></tr>))}</tbody></table>
      {!rows.length && <p className="muted">No sessions yet.</p>}
    </main>
  );
}

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const validLat = (n: number | null) => n === null || (Number.isFinite(n) && Math.abs(n) <= 90);
const validLon = (n: number | null) => n === null || (Number.isFinite(n) && Math.abs(n) <= 180);

export function HostSessionPage({ id }: { id: string }) {
  const [s, setS] = useState<HostSession | null>(null);
  const [tab, setTab] = useState<'setup' | 'qr' | 'monitor' | 'data'>('setup');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [f, setF] = useState({ name: '', destName: '', lat: '', lon: '', aName: '', aLat: '', aLon: '', bName: '', bLat: '', bLon: '' });
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const load = useCallback(async () => {
    const r = await getHostSession(id); setS(r);
    setF({ name: r.name, destName: r.dest_name ?? '', lat: r.dest_lat?.toString() ?? '', lon: r.dest_lon?.toString() ?? '',
      aName: r.start_a_name ?? '', aLat: r.start_a_lat?.toString() ?? '', aLon: r.start_a_lon?.toString() ?? '',
      bName: r.start_b_name ?? '', bLat: r.start_b_lat?.toString() ?? '', bLon: r.start_b_lon?.toString() ?? '' });
    setCfg(mergeConfig(r.config));
  }, [id]);
  useEffect(() => { void load().catch(e => setErr(errText(e))); }, [load]);
  if (!s) return <main className="host"><p className="error">{err}</p>{!err && <p className="muted">Loading…</p>}</main>;
  const locked = s.status !== 'draft';
  const act = async (fn: () => Promise<unknown>, ok = '') => { setErr(''); setMsg(''); try { await fn(); await load(); if (ok) setMsg(ok); } catch (e) { setErr(errText(e)); } };
  const save = () => act(async () => {
    const lat = numOrNull(f.lat), lon = numOrNull(f.lon);
    if (!validLat(lat) || !validLon(lon) || !validLat(numOrNull(f.aLat)) || !validLat(numOrNull(f.bLat)) || !validLon(numOrNull(f.aLon)) || !validLon(numOrNull(f.bLon))) throw new Error('Latitude must be within ±90 and longitude within ±180.');
    if ((lat === null) !== (lon === null)) throw new Error('Enter both latitude and longitude for the destination.');
    const r = await updateHostSession(s.id, { name: f.name, dest_name: f.destName || null, dest_lat: lat, dest_lon: lon,
      start_a_name: f.aName || null, start_a_lat: numOrNull(f.aLat), start_a_lon: numOrNull(f.aLon),
      start_b_name: f.bName || null, start_b_lat: numOrNull(f.bLat), start_b_lon: numOrNull(f.bLon), config: cfg });
    if (lat !== null && (r.dest_lat !== lat || r.dest_lon !== lon)) throw new Error('Saved destination does not match what you entered.');
  }, 'Saved. The server returned exactly the values shown below.');
  const useGps = () => {
    setMsg('Reading this device’s location…');
    navigator.geolocation.getCurrentPosition(p => { setF(o => ({ ...o, lat: p.coords.latitude.toFixed(6), lon: p.coords.longitude.toFixed(6) })); setMsg(`Location read (accuracy about ${Math.round(p.coords.accuracy)} m). Press Save to store it.`); },
      e => setErr(`Location failed: ${e.message}`), { enableHighAccuracy: true, timeout: 20000 });
  };
  const lat = numOrNull(f.lat), lon = numOrNull(f.lon), hasDest = lat !== null && lon !== null && validLat(lat) && validLon(lon);
  const inp = (k: keyof typeof f, label: string, type = 'text') => <label>{label}<input type={type} disabled={locked} value={f[k]} onChange={e => setF(o => ({ ...o, [k]: e.target.value }))} /></label>;
  return (
    <main className="host">
      <header className="bar"><h1><a onClick={() => go('/host')}>Sessions</a> / {s.name}</h1><span className={`pill ${s.status}`}>{s.status}{s.run > 1 ? ` · run ${s.run}` : ''}</span></header>
      <nav className="tabs">{(['setup', 'qr', 'monitor', 'data'] as const).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'qr' ? 'QR codes' : t[0].toUpperCase() + t.slice(1)}</button>)}</nav>
      {err && <p className="error">{err}</p>}{msg && <p className="ok">{msg}</p>}
      {tab === 'setup' && <section>
        {locked && <p className="notice">Settings are locked while a session is {s.status}. {s.status === 'active' ? 'End it' : 'Reset it'} to change the destination.</p>}
        <h2>Session</h2>{inp('name', 'Session name')}
        <h2>Final destination</h2>{inp('destName', 'Destination name')}
        <div className="two">{inp('lat', 'Latitude', 'number')}{inp('lon', 'Longitude', 'number')}</div>
        <button disabled={locked} onClick={useGps}>Use this device’s current location</button>
        {hasDest && <div className="preview">
          <p>Preview: <strong>{f.destName || 'Destination'}</strong> at {lat!.toFixed(6)}, {lon!.toFixed(6)} · <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`}>open map</a></p>
          <iframe title="Destination preview" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${lon! - 0.002}%2C${lat! - 0.0012}%2C${lon! + 0.002}%2C${lat! + 0.0012}&layer=mapnik&marker=${lat}%2C${lon}`} />
        </div>}
        <h2>Starting locations (optional, documentation only)</h2>
        <p className="muted">These never restrict who can join. Participants’ own GPS position is used.</p>
        <div className="two">{inp('aName', 'Start A name')}{inp('bName', 'Start B name')}</div>
        <div className="two">{inp('aLat', 'Start A latitude', 'number')}{inp('aLon', 'Start A longitude', 'number')}</div>
        <div className="two">{inp('bLat', 'Start B latitude', 'number')}{inp('bLon', 'Start B longitude', 'number')}</div>
        <h2>Parameters</h2><ConfigForm value={cfg} onChange={setCfg} disabled={locked} />
        <div className="row">
          <button className="solid" disabled={locked} onClick={() => void save()}>Save settings</button>
          {s.status === 'draft' && <button disabled={s.dest_lat === null} onClick={() => { if (window.confirm('Start the experiment? The destination and parameters will lock.')) void act(() => sessionAction(s.id, 'start'), 'Experiment started.'); }}>Start experiment</button>}
        </div>
        {s.dest_lat === null && s.status === 'draft' && <p className="muted">Save a destination before starting.</p>}
        {s.dest_lat !== null && <p className="muted">Stored on server: {s.dest_name || 'unnamed'} · {s.dest_lat.toFixed(6)}, {s.dest_lon?.toFixed(6)}</p>}
      </section>}
      {tab === 'qr' && <QrTab s={s} />}
      {tab === 'monitor' && <Monitor s={s} act={act} />}
      {tab === 'data' && <DataTab s={s} />}
    </main>
  );
}

function QrTab({ s }: { s: HostSession }) {
  const base = window.location.origin;
  const links = [{ key: 'A', layer: 'Layer 01 (warm)', url: `${base}/j/${s.code}/a` }, { key: 'B', layer: 'Layer 02 (cool)', url: `${base}/j/${s.code}/b` }];
  const [imgs, setImgs] = useState<Record<string, string>>({});
  useEffect(() => { void Promise.all(links.map(async l => [l.key, await QRCode.toDataURL(l.url, { width: 800, margin: 3, errorCorrectionLevel: 'M' })] as const)).then(e => setImgs(Object.fromEntries(e))); }, [s.code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section>
      <p className="muted">QR A always assigns Layer 01 and QR B always assigns Layer 02. Both open the same session, from anywhere. People who scan before you press Start see a quiet waiting screen and begin automatically.</p>
      <div className="qrs">{links.map(l => (
        <div key={l.key} className="qr">
          <h3>QR {l.key} → {l.layer}</h3>
          {imgs[l.key] ? <img alt={`QR ${l.key}`} src={imgs[l.key]} /> : <p className="muted">Generating…</p>}
          <p className="mono">{l.url}</p>
          <div className="row">
            <button onClick={() => { const a = document.createElement('a'); a.href = imgs[l.key]; a.download = `collective-music-${s.code}-QR-${l.key}.png`; a.click(); }}>Download PNG</button>
            <button onClick={() => void navigator.clipboard.writeText(l.url)}>Copy link</button>
            <a className="btn" href={l.url} target="_blank" rel="noreferrer">Preview participant page</a>
          </div>
        </div>))}</div>
    </section>
  );
}

function Monitor({ s, act }: { s: HostSession; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [o, setO] = useState<Overview | null>(null); const [err, setErr] = useState('');
  useEffect(() => {
    let dead = false; const pull = () => void adminOverview(s.id).then(r => { if (!dead) { setO(r); setErr(''); } }).catch(e => { if (!dead) setErr(errText(e)); });
    pull(); const t = window.setInterval(pull, 3000); return () => { dead = true; window.clearInterval(t); };
  }, [s.id, s.status]);
  const P = o?.participants ?? [], active = P.filter(p => p.age_s !== null && p.age_s <= 20);
  const by = (l: number) => ({ joined: P.filter(p => p.layer === l).length, active: active.filter(p => p.layer === l).length });
  const a = by(0), b = by(1);
  const presence = active.some(p => p.layer === 0) && active.some(p => p.layer === 1);
  const coll = active.filter(p => p.collective === 'full').length, trans = active.filter(p => p.collective === 'transition').length;
  return (
    <section>
      {err && <p className="error">{err}</p>}
      <div className="stats">
        <div><strong>{a.active}/{a.joined}</strong><small>Layer 01 active / joined</small></div>
        <div><strong>{b.active}/{b.joined}</strong><small>Layer 02 active / joined</small></div>
        <div><strong>{active.filter(p => p.arrived).length}</strong><small>at destination</small></div>
        <div><strong>{presence ? 'yes' : 'no'}</strong><small>both layers connected</small></div>
        <div><strong>{coll}{trans ? ` (+${trans})` : ''}</strong><small>in collective state</small></div>
      </div>
      <table><thead><tr><th>ID</th><th>Layer</th><th>Seen</th><th>GPS</th><th>Accuracy</th><th>Arrived</th><th>Nearest opposite</th><th>Collective</th><th>Consent</th></tr></thead>
        <tbody>{P.map(p => (<tr key={p.pid} className={p.age_s !== null && p.age_s <= 20 ? '' : 'dim'}>
          <td className="mono">{p.pid}</td><td>{p.layer + 1}</td><td>{p.age_s === null ? '—' : `${Math.round(p.age_s)}s ago`}</td>
          <td>{p.gps_ok ? 'ok' : 'weak/none'}</td><td>{p.accuracy ? `${Math.round(p.accuracy)} m` : '—'}</td><td>{p.arrived ? 'yes' : ''}</td>
          <td>{p.nearest_m !== null ? `${Math.round(p.nearest_m)} m` : '—'}</td><td>{p.collective}</td><td>{p.consent ? 'yes' : 'no'}</td></tr>))}</tbody></table>
      {!P.length && <p className="muted">No participants have joined this run.</p>}
      <div className="row">
        {s.status === 'active' && <button className="danger" onClick={() => { if (window.confirm('End the session for everyone? Music and light will fade out and participants will be invited to the survey.')) void act(() => sessionAction(s.id, 'end'), 'Session ended.'); }}>End session</button>}
        {s.status === 'ended' && <button onClick={() => { if (window.confirm('Reset for a new run? Settings unlock; past data is kept and labelled by run.')) void act(() => sessionAction(s.id, 'reset'), 'Reset. Participants must scan again.'); }}>Reset for a new run</button>}
        {s.status === 'draft' && <p className="muted">Start the experiment from the Setup tab.</p>}
      </div>
    </section>
  );
}

function DataTab({ s }: { s: HostSession }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [o, setO] = useState<Overview | null>(null);
  useEffect(() => { void adminOverview(s.id).then(setO).catch(e => setErr(errText(e))); }, [s.id]);
  const exp = async (kind: 'surveys' | 'events') => {
    setBusy(kind); setErr('');
    try {
      if (kind === 'events') { const r = await fetchEvents(s.id); downloadText(`collective-music-${s.code}-events.csv`, toCsv(r, ['created_at', 'session_id', 'run', 'pid', 'layer', 'event', 'meta'])); }
      else { const f = flattenSurveys(await fetchSurveys(s.id)); downloadText(`collective-music-${s.code}-surveys.csv`, toCsv(f.rows, f.columns)); }
    } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };
  return (
    <section>
      {err && <p className="error">{err}</p>}
      <p className="muted">Current run: {o?.surveys ?? '…'} survey responses · {o?.events ?? '…'} events. Exports include every run (column “run”). Survey rows say whether the participant reached the destination and entered the full collective state (derived from their logged events). Only participants who consented are recorded. No coordinates are ever logged.</p>
      <div className="row"><button className="solid" disabled={!!busy} onClick={() => void exp('surveys')}>Export survey CSV</button><button disabled={!!busy} onClick={() => void exp('events')}>Export event log CSV</button></div>
    </section>
  );
}
