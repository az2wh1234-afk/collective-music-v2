import { useEffect, useRef, useState } from 'react';
import { ExperienceView, type Sources } from '../components/ExperienceView';
import { Survey, type Answers } from '../components/Survey';
import { COPY } from '../copy';
import { CollectiveAudio } from '../lib/audio';
import { DEFAULT_CONFIG, mergeConfig, type Config } from '../lib/config';
import { GpsTracker } from '../lib/gps';
import { Compass } from '../lib/orientation';
import type { ModelOutput, PeerInput } from '../lib/model';
import { configured, errText, getSession, heartbeat, joinSession, leaveSession, logEvent, participantAuth, serverClockOffset, sessionInfo, submitSurvey, type SessionInfo, type SessionPayload } from '../lib/supabase';

type Phase = 'loading' | 'intro' | 'joining' | 'waiting' | 'running' | 'ending' | 'ended' | 'survey' | 'done' | 'notfound' | 'error';

export function Participant({ code, layerKey }: { code: string; layerKey: string }) {
  const layer: 0 | 1 = layerKey.toLowerCase() === 'b' ? 1 : 0;
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [sess, setSess] = useState<SessionPayload | null>(null);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [agree, setAgree] = useState(false);
  const [surveyErr, setSurveyErr] = useState('');
  const [panel, setPanel] = useState(false);
  const [problem, setProblem] = useState('');
  const [online, setOnline] = useState(true);
  const [left, setLeft] = useState(false);

  const cfgRef = useRef(config); cfgRef.current = config;
  const gps = useRef<GpsTracker | null>(null); if (!gps.current) gps.current = new GpsTracker(() => cfgRef.current.fixMaxAccuracy);
  const compass = useRef(new Compass());
  const audio = useRef<CollectiveAudio | null>(null);
  const peers = useRef<{ list: PeerInput[]; at: number }>({ list: [], at: 0 });
  const derived = useRef<ModelOutput | null>(null);
  const sessRef = useRef<SessionPayload | null>(null);
  const flags = useRef({ met: false, reached: false });
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const offset = useRef(0);
  const ended = useRef(false);
  const ran = useRef(false); // true once the experience actually started for this participant

  const teardown = (keepAudio: boolean) => {
    gps.current?.stop(); compass.current.stop();
    if (!keepAudio) { audio.current?.dispose(); audio.current = null; }
    void wake.current?.release().catch(() => undefined); wake.current = null;
  };
  const ev = (name: string, meta?: Record<string, unknown>) => {
    if (name === 'collective_full_entered') flags.current.met = true;
    if (name === 'destination_reached') flags.current.reached = true;
    const s = sessRef.current; if (s) logEvent(s.id, name, meta);
  };

  useEffect(() => {
    if (!configured) { setErr('This installation is not connected to Supabase yet.'); setPhase('error'); return; }
    void (async () => {
      try {
        await participantAuth();
        const i = await sessionInfo(code);
        if (!i) { setPhase('notfound'); return; }
        setInfo(i); setPhase(i.status === 'ended' ? 'ended' : 'intro');
      } catch (e) { setErr(errText(e)); setPhase('error'); }
    })();
    return () => teardown(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Begin: audio unlock, compass and location prompts all start synchronously inside the tap (iOS requirement).
  const begin = () => {
    if (!agree) return; // Begin is disabled until the consent box is ticked; this guards against any other trigger
    const a = new CollectiveAudio(); audio.current = a;
    const unlocked = a.unlock().then(() => true, () => false);
    void compass.current.request().catch(() => undefined);
    gps.current!.start();
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request('screen').then(l => { wake.current = l; }).catch(() => undefined);
    setPhase('joining');
    void (async () => {
      try {
        const ok = await unlocked;
        const [joined] = await Promise.all([joinSession(code, layer, agree), a.prepare(layer)]);
        if (joined.status === 'ended') { teardown(false); setPhase('ended'); return; }
        const s = joined as SessionPayload;
        sessRef.current = s; setSess(s); setConfig(mergeConfig(s.config));
        if (!ok) setProblem('Sound is blocked. Tap the screen to enable it.');
        if (s.status === 'active') await run(s); else setPhase('waiting');
      } catch (e) { setErr(errText(e)); setPhase('error'); teardown(false); }
    })();
  };
  const run = async (s: SessionPayload) => {
    try { offset.current = await serverClockOffset(); } catch { offset.current = s.server_ms - Date.now(); }
    ran.current = true;
    audio.current?.play(s.started_at_ms, offset.current);
    sessRef.current = s; setSess(s); setConfig(mergeConfig(s.config));
    logEvent(s.id, 'audio_activated', { ctx: audio.current?.state ?? 'none' });
    setPhase('running');
  };
  const finish = (byUser: boolean) => {
    if (ended.current) return; ended.current = true;
    setLeft(byUser); setPhase('ending'); setPanel(false);
    const s = sessRef.current;
    if (s) { ev(byUser ? 'left_early' : 'experience_ended'); void leaveSession(s.id).catch(() => undefined); }
    window.setTimeout(() => { teardown(false); setPhase('ended'); }, 6500);
  };

  // Withdraw before the experience has started (waiting screen): free the server-side presence and stop everything.
  const leaveWaiting = () => {
    if (ended.current) return; ended.current = true;
    const s = sessRef.current; if (s) void leaveSession(s.id).catch(() => undefined);
    teardown(false); setLeft(true); setPhase('ended');
  };

  useEffect(() => {
    if (phase !== 'waiting' || !sess) return;
    const id = window.setInterval(() => {
      void getSession(sess.id).then(s => { if (s.status === 'active') void run(s); else if (s.status === 'ended') finish(false); }).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sess?.id]);

  useEffect(() => {
    if (phase !== 'running' || !sess) return;
    let fails = 0;
    const beat = () => {
      const g = gps.current!.snapshot(), d = derived.current;
      const fixOk = !!g.fix && g.fixAgeS <= 15;
      void heartbeat(sess.id, { lat: fixOk ? g.fix!.lat : null, lon: fixOk ? g.fix!.lon : null, accuracy: fixOk ? g.fix!.accuracy : null,
        arrived: d?.arrived ?? false, collective: d?.collective ?? 'none', nearest: d?.nearestDist ?? null, gpsOk: d?.gpsOk ?? false })
        .then(r => { fails = 0; setOnline(true); peers.current = { list: r.peers, at: Date.now() }; if (r.status !== 'active') finish(false); })
        .catch(() => { if (++fails >= 3) setOnline(false); });
    };
    beat();
    const hb = window.setInterval(beat, 3000);
    const hint = window.setInterval(() => {
      const g = gps.current!.snapshot(); let p = '';
      if (g.status === 'denied') p = 'Location is off. Allow location for this site to follow the light.';
      else if (g.status === 'unsupported' || g.status === 'unavailable') p = 'Location is unavailable on this device.';
      else if ((g.status === 'weak' || g.status === 'stale') && !derived.current?.arrived) p = 'Looking for a stronger location signal…';
      if (audio.current && audio.current.isPlaying && audio.current.state !== 'running') p = 'Tap the screen to restore sound.';
      setProblem(p);
    }, 1500);
    const vis = () => { if (document.visibilityState === 'visible') { void audio.current?.resume(); beat(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(hb); window.clearInterval(hint); document.removeEventListener('visibilitychange', vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sess?.id]);

  const getSources = (): Sources => {
    const g = gps.current!.snapshot(), c = compass.current.snapshot(), el = (Date.now() - peers.current.at) / 1000;
    return { fix: g.fix, fixAgeS: g.fixAgeS, speed: g.speed, heading: c.heading, headingReliable: c.reliable, peers: peers.current.list.map(p => ({ ...p, ageS: p.ageS + el })) };
  };
  const tapped = () => { void audio.current?.resume(); setPanel(p => !p); window.setTimeout(() => setPanel(false), 7000); };
  // The survey is required to complete the experience, so a failed send is reported and can be retried (no silent "Thank you").
  const submit = async (a: Answers) => {
    setSurveyErr('');
    try { if (sess) await submitSurvey(sess.id, a, false); setPhase('done'); } catch { setSurveyErr(COPY.surveyFail); }
  };

  if (phase === 'running' || phase === 'ending') {
    const dest = sess && sess.dest_lat !== null && sess.dest_lon !== null ? { lat: sess.dest_lat, lon: sess.dest_lon } : null;
    return (
      <ExperienceView layer={layer} dest={dest} config={config} getSources={getSources} audio={audio.current} ending={phase === 'ending'}
        onEvent={ev} onDerived={o => { derived.current = o; }} onTap={tapped}
        overlay={o => (<>
          {(problem || !online) && phase === 'running' && <p className="hint">{!online ? 'Connection lost. Reconnecting…' : problem}</p>}
          {panel && phase === 'running' && (
            <div className="panel" onClick={e => e.stopPropagation()}>
              <p>Layer {layer + 1}{sess?.dest_name ? ` · ${sess.dest_name}` : ''}</p>
              <p className="muted">{o?.distToDest != null ? `About ${Math.max(0, Math.round(o.distToDest / 5) * 5)} m to go` : 'Waiting for location'}</p>
              <button onClick={() => finish(true)}>{COPY.leave}</button>
            </div>)}
        </>)} />
    );
  }
  return (
    <main className="screen">
      {phase === 'loading' && <p className="muted">Loading…</p>}
      {phase === 'notfound' && <p>{COPY.notFound}</p>}
      {phase === 'error' && <div><p>Something went wrong.</p><p className="muted">{err}</p></div>}
      {phase === 'intro' && (
        <div className={`intro l${layer}`}>
          <h1>{COPY.title}</h1><p className="lead">{COPY.lead}</p>
          <ul>{COPY.steps.map(s => <li key={s}>{s}</li>)}</ul>
          <section className="consentBox" aria-label={COPY.aboutTitle}>
            <h2>{COPY.aboutTitle}</h2>
            {COPY.about.map(x => <div key={x.h}><h3>{x.h}</h3><p>{x.t}</p></div>)}
          </section>
          <label className="opt consent"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>{COPY.consentLabel}</span></label>
          <button className="solid big" disabled={!agree} onClick={begin}>{COPY.begin}</button>
          {info?.name && <p className="tiny">{info.name}</p>}
        </div>
      )}
      {phase === 'joining' && <p className="muted pulse">Preparing sound…</p>}
      {phase === 'waiting' && <div><p className="muted pulse">{COPY.waiting}</p><button onClick={leaveWaiting}>{COPY.leave}</button></div>}
      {phase === 'ended' && (
        <div className="intro">
          <p className="lead">{sess ? (left ? COPY.left : COPY.ended) : COPY.ended}</p>
          {sess && ran.current ? (<>
            <button className="solid" onClick={() => setPhase('survey')}>{left ? COPY.surveyOffer : COPY.surveyContinue}</button>
            <p className="muted">{COPY.surveyNote}</p></>) : <p className="muted">{COPY.thanks}</p>}
        </div>
      )}
      {phase === 'survey' && <Survey ctx={{ metOther: flags.current.met, reached: flags.current.reached }} onSubmit={submit} error={surveyErr} />}
      {phase === 'done' && <p className="lead">{COPY.thanks}</p>}
    </main>
  );
}
