import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PrototypeAudio} from './audio';
import {sharedConfigured,supabase,createSharedSession,joinSharedSession,getSharedState,getMyUserId,estimateServerClockOffset,publishPosition,readPositions,clearPosition,type PeerPosition,type Member,saveSessionDestination,readSessionDestination} from './shared';
import './style.css';

type Position = {lat:number;lon:number;accuracy?:number};
const INITIAL_DEST: Position={lat:41.8268,lon:-71.4025}; // EDIT: illustrative Providence coordinates, not a confirmed meeting spot
const meters=(a:Position,b:Position)=>{const R=6371000,rad=Math.PI/180;const dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const errorText=(e:unknown)=>{if(e instanceof Error)return e.message;if(e&&typeof e==='object'&&'message' in e)return String((e as {message:unknown}).message);return String(e);};
function locationSearch(){return typeof window==='undefined'?'':window.location.search;}
function App(){
  const [mode,setMode]=useState<'simulation'|'gps'>('simulation');
  const [layer,setLayer]=useState(0);
  const [distance,setDistance]=useState(200);
  const [remaining,setRemaining]=useState(200);
  const startDistanceRef=useRef<number|null>(null);
  const maxApproachRef=useRef(0);
  const [destination,setDestination]=useState<Position>(INITIAL_DEST);
  const [location,setLocation]=useState<Position|null>(null);
  const [active,setActive]=useState(false);
  const [speed,setSpeed]=useState(0);
  const [clockOffset,setClockOffset]=useState<number|null>(null);
  const [motionStatus,setMotionStatus]=useState('Stopped');
  const gpsLast=useRef<{position:Position;time:number}|null>(null);
  const smoothSpeed=useRef(0);
  const stopCandidate=useRef<number|null>(null);
  const [message,setMessage]=useState('시뮬레이션에서 먼저 음악을 테스트해 보세요.');
  const [events,setEvents]=useState<{time:string;event:string}[]>([]);
  const [peers,setPeers]=useState<PeerPosition[]>([]);
  const [positionError,setPositionError]=useState('');
  const [simulationSide,setSimulationSide]=useState(0);
  const [sessionCode,setSessionCode]=useState(new URLSearchParams(locationSearch()).get('session') || '');
  const [sharedId,setSharedId]=useState<string|null>(null);
  const [sessionCreatedAt,setSessionCreatedAt]=useState<string|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [myId,setMyId]=useState<string|null>(null);
  const [layerCount,setLayerCount]=useState(2);
  const [busy,setBusy]=useState(false);
  const [sharedError,setSharedError]=useState('');
  const [copied,setCopied]=useState(false);
  const [host,setHost]=useState(false);
  const [easyMode,setEasyMode]=useState(true);
  const [destinationSync,setDestinationSync]=useState('');
  const [locationStatus,setLocationStatus]=useState('');
  const [joiningLink,setJoiningLink]=useState(Boolean(new URLSearchParams(locationSearch()).get('session')));
  const autoJoinAttempt=useRef(false);
  const myMember=members.find(m=>m.user_id===myId);
  // In simulation, the two phones approach the same destination from opposite directions.
  const simulatedPosition:Position={lat:destination.lat+(simulationSide===0?1:-1)*remaining/111195,lon:destination.lon,accuracy:5};
  const myPosition=mode==='gps'?location:simulatedPosition;
  const freshPeers=peers.filter(p=>p.user_id!==myId && Date.now()-Date.parse(p.last_seen)<11000 && p.accuracy<=50);
  const nearest=freshPeers.length&&myPosition?Math.min(...freshPeers.map(p=>meters(myPosition,p))):Infinity;
  const proximity=clamp((25-nearest)/17); // crossfade from 25m to 8m
  const stage=remaining<=60?2:1;
  useEffect(()=>{audio.current?.updateStage(stage);audio.current?.updateProximity(proximity);},[stage,proximity]);
  useEffect(()=>{audio.current?.updateSpeed(speed);},[speed]);
  useEffect(()=>{
    if(startDistanceRef.current===null)startDistanceRef.current=remaining;
    const approach=Math.max(0,startDistanceRef.current-remaining);
    maxApproachRef.current=Math.max(maxApproachRef.current,approach);
    audio.current?.updateIntroGain(0.60+0.40*clamp(maxApproachRef.current/10));
    audio.current?.updateArrivalOpen(remaining<=10);
  },[remaining,mode]);
  useEffect(()=>{startDistanceRef.current=null;maxApproachRef.current=0;},[sharedId,mode]);
  const refresh=async(id:string)=>{try{const state=await getSharedState(id);setMembers(state.members);setLayerCount(state.session.layer_count);setSessionCreatedAt(state.session.created_at);setSharedError('');}catch(e){setSharedError(errorText(e));}};
  const join=async(create:boolean)=>{if(!sharedConfigured){setSharedError('Supabase 설정을 먼저 완료하세요.');return;}setBusy(true);setSharedError('');try{
    const code=create?await createSharedSession(layerCount):sessionCode.trim().toUpperCase();
    const id=await joinSharedSession(code);
    const userId=await getMyUserId();
    const state=await getSharedState(id);
    const mine=state.members.find(m=>m.user_id===userId);
    setHost(create);setPeers([]);setClockOffset(null);setSharedId(id);setMyId(userId);setMembers(state.members);setSessionCode(code);setLayerCount(state.session.layer_count);setSessionCreatedAt(state.session.created_at);
    if(mine){if(active)stop();setLayer(mine.layer);setSimulationSide(mine.layer);}
    try {
      if(create){await saveSessionDestination(id,destination.lat,destination.lon);setDestinationSync('목적지 공유 완료 (서버 확인됨)');}
      else {const remote=await readSessionDestination(id);if(remote){setDestination(remote);setDestinationSync('목적지 자동 적용 완료');}}
    }catch(e){setDestinationSync(errorText(e));}
    window.history.replaceState({},'',`${window.location.pathname}?session=${code}`);
    log(`Shared session joined: ${code}`);
  }catch(e){setSharedError(errorText(e));}finally{setBusy(false);}};
  // Invitation URL joins automatically; no code entry for participants.
  useEffect(()=>{if(!sharedConfigured||sharedId||busy||autoJoinAttempt.current)return;
    const code=new URLSearchParams(window.location.search).get('session');
    if(code){autoJoinAttempt.current=true;setSessionCode(code);void join(false);}
  },[sharedId,busy]);
  // Keep participant destination in sync with the host.
  useEffect(()=>{if(!sharedId||host)return;
    const poll=()=>void readSessionDestination(sharedId).then(remote=>{
      if(remote){setDestination(old=>old.lat===remote.lat&&old.lon===remote.lon?old:remote);setDestinationSync(`목적지 동기화됨: ${remote.lat.toFixed(5)}, ${remote.lon.toFixed(5)}`);}
    }).catch(e=>setDestinationSync(errorText(e)));
    poll();const timer=window.setInterval(poll,5000);return()=>clearInterval(timer);
  },[sharedId,host]);
  // GPS updates must use the latest destination even if changed after watchPosition began.
  const destinationRef=useRef(destination);
  useEffect(()=>{destinationRef.current=destination;
    if(mode==='gps'&&location)setRemaining(meters(location,destination));
  },[destination,location?.lat,location?.lon,mode]);
  const saveDestination=async(next:Position)=>{
    setDestination(next);
    if(sharedId&&host){try{await saveSessionDestination(sharedId,next.lat,next.lon);setDestinationSync('목적지 공유 완료 (서버 확인됨)');}catch(e){setDestinationSync(errorText(e));}}
  };
  const useCurrentAsDestination=()=>{
    if(!navigator.geolocation){setLocationStatus('위치를 지원하지 않는 브라우저입니다.');return;}
    setLocationStatus('현재 위치 확인 중…');
    navigator.geolocation.getCurrentPosition(p=>{
      const next={lat:p.coords.latitude,lon:p.coords.longitude};
      void saveDestination(next);
      setLocationStatus(`현재 위치를 목적지로 설정했어요 (정확도 약 ${Math.round(p.coords.accuracy)}m).`);
    },e=>setLocationStatus(`위치 확인 실패: ${e.message}`),{enableHighAccuracy:true,timeout:15000});
  };
  useEffect(()=>{if(!sharedId||!supabase)return;
    const channel=supabase.channel(`members-${sharedId}`).on('postgres_changes',{event:'*',schema:'public',table:'music_members',filter:`session_id=eq.${sharedId}`},()=>{void refresh(sharedId);}).subscribe();
    const poll=window.setInterval(()=>void refresh(sharedId),5000);
    return()=>{window.clearInterval(poll);void supabase!.removeChannel(channel);};
  },[sharedId]);
  // Publish current GPS (or virtual simulation) position. Stale devices expire automatically.
  useEffect(()=>{if(!sharedId||!myId||!myPosition)return;
    let cancelled=false;
    const tick=()=>void publishPosition(sharedId,myId,layer,myPosition.lat,myPosition.lon,myPosition.accuracy||5)
      .catch(e=>{if(!cancelled)setPositionError(errorText(e));});
    tick();const timer=window.setInterval(tick,3000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[sharedId,myId,layer,myPosition?.lat,myPosition?.lon,myPosition?.accuracy]);
  useEffect(()=>{if(!sharedId)return;let cancelled=false;
    const poll=()=>void readPositions(sharedId).then(rows=>{if(!cancelled){setPeers(rows);setPositionError('');}}).catch(e=>{if(!cancelled)setPositionError(`Run supabase/positions.sql: ${errorText(e)}`);});
    poll();const timer=window.setInterval(poll,2500);
    return()=>{cancelled=true;clearInterval(timer);};
  },[sharedId]);
  const shareLink=()=>`${window.location.origin}${window.location.pathname}?session=${sessionCode}`;
  const copyLink=async()=>{try{await navigator.clipboard.writeText(shareLink());setCopied(true);}catch{setSharedError('주소창의 링크를 복사해 주세요.');}};
  const audio=useRef<PrototypeAudio|null>(null);
  const watcher=useRef<number|null>(null);
  const progress=clamp(1-remaining/distance);
  const log=(event:string)=>setEvents(old=>[{time:new Date().toLocaleTimeString(),event},...old].slice(0,50));
  useEffect(()=>{return ()=>{if(watcher.current!==null)navigator.geolocation.clearWatch(watcher.current);audio.current?.stop();};},[]);
  const start=async()=>{try{audio.current?.stop();const offset=sharedId?await estimateServerClockOffset():0;setClockOffset(sharedId?offset:null);const a=new PrototypeAudio();await a.start(layer,sharedId&&sessionCreatedAt?Date.parse(sessionCreatedAt):null,offset);audio.current=a;setActive(true);a.updateStage(stage);a.updateProximity(proximity);a.updateJourneyProgress(progress);a.updateIntroGain(0.60+0.40*clamp(maxApproachRef.current/10));a.updateArrivalOpen(remaining<=10);a.updateSpeed(speed);log(`Audio started: Layer ${layer+1}`);setMessage('실제 음원 재생 중. 가까워지면 두 레이어의 3단계가 함께 들립니다.');}catch(e){setMessage(`오디오 시작 실패: ${errorText(e)}`);}};
  useEffect(()=>{if(!active||!sharedId)return;let cancelled=false;const timer=window.setInterval(()=>{void estimateServerClockOffset(3).then(offset=>{if(!cancelled){setClockOffset(offset);audio.current?.setSyncOffset(offset);}}).catch(e=>setSharedError(`Clock sync: ${errorText(e)}`));},30000);return()=>{cancelled=true;clearInterval(timer);};},[active,sharedId]);
  const stop=()=>{audio.current?.stop();audio.current=null;setActive(false);log('Audio stopped');};
  const beginGps=()=>{
    if(!navigator.geolocation){setMessage('이 브라우저는 GPS를 지원하지 않습니다.');return;}
    if(watcher.current!==null)navigator.geolocation.clearWatch(watcher.current);
    gpsLast.current=null;smoothSpeed.current=0;stopCandidate.current=null;setSpeed(0);setMotionStatus('Waiting for GPS');
    setMode('gps');setMessage('위치 권한을 허용해 주세요. GPS는 야외에서 더 정확합니다. HTTPS 또는 localhost가 필요합니다.');
    watcher.current=navigator.geolocation.watchPosition(p=>{
      const current={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};
      const now=Date.now();setLocation(current);setRemaining(meters(current,destinationRef.current));
      const prev=gpsLast.current;gpsLast.current={position:current,time:now};
      const delta=prev?(now-prev.time)/1000:0;
      const derived=prev&&delta>=1?meters(prev.position,current)/delta:0;
      const reported=p.coords.speed;
      const raw=reported!==null&&Number.isFinite(reported)&&reported>=0?reported:derived;
      // Discard poor GPS accuracy and implausible speed spikes.
      if(p.coords.accuracy>60 || !prev || delta<1 || delta>30){setMotionStatus('Calibrating / weak GPS');return;}
      const bounded=Math.min(3,Math.max(0,raw));
      smoothSpeed.current=smoothSpeed.current*0.7+bounded*0.3;
      // Require 4 seconds below threshold before treating the user as stopped.
      if(smoothSpeed.current<0.35){
        if(stopCandidate.current===null)stopCandidate.current=now;
        if(now-stopCandidate.current>=4000){setSpeed(0);setMotionStatus('Stopped · low-pass on');}
        else setMotionStatus('Checking stop…');
      }else{
        stopCandidate.current=null;setSpeed(smoothSpeed.current);setMotionStatus('Moving · filter opening');
      }
    },e=>setMessage(`GPS 오류: ${e.message}`),{enableHighAccuracy:true,maximumAge:1000,timeout:12000});
  };
  const simulation=()=>{if(watcher.current!==null)navigator.geolocation.clearWatch(watcher.current);watcher.current=null;gpsLast.current=null;setMode('simulation');setLocation(null);setRemaining(distance);setSpeed(0);setMotionStatus('Stopped');};
  const saveLog=()=>{const csv=['time,event',...events.slice().reverse().map(e=>`"${e.time}","${e.event.replaceAll('"','""')}"`)].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='prototype-events.csv';a.click();URL.revokeObjectURL(a.href);};
  return <main className="wrap">
  <section className="panel" style={{border:'2px solid #8294be'}}>
    <div className="sectionTitle"><span>NEW</span><h2>Quick start</h2></div>
    <p className="note">참가자는 초대 링크만 열면 세션에 자동 참여합니다. 위치를 허용하고 음악을 시작하세요.</p>
    {!sharedId?<div className="actions"><button disabled={busy} className="primary" onClick={()=>void join(true)}>Create experience (host)</button>{joiningLink&&<span className="note">초대 세션 연결 중…</span>}</div>:<>
      <p className="status">Connected · Layer {String.fromCharCode(65+layer)}</p>
      {host?<><p className="note">① 목적지를 한 번만 정하면 모든 참가자에게 자동 적용됩니다.</p>
        <button onClick={useCurrentAsDestination}>Use my current location as destination</button>
        <div className="grid"><label>Latitude<input type="number" step="0.000001" value={destination.lat} onChange={e=>setDestination(v=>({...v,lat:Number(e.target.value)}))}/></label><label>Longitude<input type="number" step="0.000001" value={destination.lon} onChange={e=>setDestination(v=>({...v,lon:Number(e.target.value)}))}/></label></div>
        <button onClick={()=>void saveDestination(destination)}>Save destination for everyone</button>
        <p className="note">{locationStatus} {destinationSync}</p>
        <p className="note">② 이 QR을 친구에게 보여주거나 초대 링크를 공유하세요.</p>
        <img alt="Session invitation QR code" width="180" height="180" src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareLink())}`}/>
        <button onClick={()=>void copyLink()}>{copied?'Copied':'Copy invite link'}</button>
      </>:<p className="note">목적지 자동 공유 · {destinationSync||'위치 동기화 중'}</p>}
      <div className="actions"><button onClick={beginGps}>Allow location / GPS</button><button className="primary" onClick={active?stop:()=>void start()}>{active?'Stop music':'Start experience'}</button></div>
      <p className="note">{message}</p>
    </>}
    <button onClick={()=>setEasyMode(v=>!v)}>{easyMode?'Show developer controls':'Hide developer controls'}</button>
  </section>
  {!easyMode&&<><header><div className="eyebrow">COLLECTIVE MUSIC / RESEARCH PROTOTYPE</div><h1>Walk into the music.</h1><p>V1.0 · 실제 음원 2레이어 × 3단계 · 자동 근접 믹스</p></header>
  <section className="panel"><div className="sectionTitle"><span>01</span><h2>Session setup</h2></div><label>Session code <input value={sessionCode} onChange={e=>setSessionCode(e.target.value)} /></label><div className="grid"><label>Assigned layer<select value={layer} disabled={Boolean(sharedId)} onChange={e=>{if(active)stop();setLayer(Number(e.target.value));}}><option value={0}>Layer A</option><option value={1}>Layer B</option></select></label><label>Starting distance (m)<input type="number" min={50} max={1000} step={50} value={distance} onChange={e=>{const d=Math.max(50,Number(e.target.value)||50);setDistance(d);if(mode==='simulation')setRemaining(d);}} /></label></div><p className="note">공유 세션 연결 시 레이어는 서버에서 배정됩니다. GPS 위치를 세션 참가자끼리 공유하여 서로 가까워지면 3단계 음악이 자동으로 합쳐집니다.</p></section>
  <section className="panel"><div className="sectionTitle"><span>01B</span><h2>Multi-user session (pilot)</h2></div>
  {!sharedConfigured?<p className="note">현재는 로컬 모드입니다. Supabase 연결은 README의 설정을 완료한 뒤 활성화됩니다.</p>:<>
  <p className="note">세션을 생성하거나 다른 사람이 보낸 코드를 입력해 참가하세요. 처음 참가할 때 레이어가 자동 배정됩니다.</p>
  {!sharedId?<><label>Required layers (for new session)<select value={layerCount} onChange={e=>setLayerCount(Number(e.target.value))}><option value={2}>2 layers</option></select></label><div className="actions"><button disabled={busy} onClick={()=>void join(true)}>Create new session</button><button disabled={busy||!sessionCode.trim()} onClick={()=>void join(false)}>Join by code</button></div></>:<>
    <p className="status">Connected · Session <strong>{sessionCode}</strong> · My layer <strong>{myMember?String.fromCharCode(65+myMember.layer):'…'}</strong></p>
    <button onClick={()=>void copyLink()}>{copied?'Link copied':'Copy invitation link'}</button>
    <p className="note">Nearby distance: {Number.isFinite(nearest)?`${Math.round(nearest)}m`:'waiting for other participant'} · crossfade: {Math.round(proximity*100)}%</p>
    <div className="memberList">{members.map(m=><div key={m.id}>Layer {String.fromCharCode(65+m.layer)} {m.user_id===myId?'(you)':''} <strong>{peers.some(p=>p.user_id===m.user_id&&Date.now()-Date.parse(p.last_seen)<11000)?'Position active':'Waiting'}</strong></div>)}</div>
  </>}
  {positionError&&<p className="status" role="alert">{positionError}</p>}
  {sharedError&&<p className="status" role="alert">{sharedError}</p>}
  </>}</section>
  <section className="panel"><div className="sectionTitle"><span>02</span><h2>Walk & listen</h2></div><div className="tabs"><button className={mode==='simulation'?'selected':''} onClick={simulation}>Simulation</button><button className={mode==='gps'?'selected':''} onClick={beginGps}>Real GPS</button></div><div className="meter"><div className="meterFill" style={{width:`${progress*100}%`}}/></div><div className="stats"><div><strong>{Math.round(remaining)}m</strong><small>remaining</small></div><div><strong>{Math.round(progress*100)}%</strong><small>journey</small></div><div><strong>{proximity>0.9?3:stage}/3</strong><small>music stage</small></div></div>{mode==='simulation'?<><label>Move toward the meeting point<input aria-label="Remaining distance" type="range" min={0} max={distance} step={1} value={Math.min(remaining,distance)} onChange={e=>setRemaining(Number(e.target.value))}/></label><div className="rangeEnds"><span>Meeting point · 0m</span><span>Start · {distance}m</span></div><label>Walking speed (simulation): {speed.toFixed(1)} m/s<input aria-label="Walking speed" type="range" min={0} max={3} step={0.1} value={speed} onChange={e=>{const v=Number(e.target.value);setSpeed(v);setMotionStatus(v<0.35?'Stopped · low-pass on':'Moving · filter opening');}}/></label><p className="note">걷는 속도가 0m/s일 때 로우패스가 닫히고 2m/s 이상에서 열립니다. 시뮬레이션에서는 두 참가자가 목적지의 반대쪽에서 접근한다고 가정합니다.</p></>:<><p className="note">GPS accuracy: {location?`${Math.round(location.accuracy||0)}m`:'waiting…'} · Speed: {speed.toFixed(1)} m/s · {motionStatus}</p><div className="grid"><label>Destination latitude<input type="number" step="0.000001" value={destination.lat} disabled={Boolean(sharedId&&!host)} onChange={e=>setDestination(v=>({...v,lat:Number(e.target.value)}))}/></label><label>Destination longitude<input type="number" step="0.000001" value={destination.lon} disabled={Boolean(sharedId&&!host)} onChange={e=>setDestination(v=>({...v,lon:Number(e.target.value)}))}/></label></div><p className="note">목적지 좌표는 예시입니다. 실제 현장 테스트 전에 안전한 만남 장소 좌표로 바꿔 주세요.</p></>}
  {sharedId&&<p className="note">Server clock: {clockOffset===null?'waiting':'active'} · proximity: {Number.isFinite(nearest)?Math.round(nearest)+'m':'not detected'}</p>}
  <div className="stages"><span className={stage===1?'on':''}>Stage 1 · far</span><span className={stage===2?'on':''}>Stage 2 · destination near</span><span className={proximity>0.5?'on':''}>Stage 3 · people near</span></div>
  <div className="actions"><button className="primary" onClick={active?stop:start}>{active?'Stop music':'Start music'}</button></div>
  <p className="status">{message}</p><p className="note">Check-in 없이 자동으로 작동합니다. 25m부터 서로의 3단계 음원이 섞이고 8m 안에서는 완전히 합쳐집니다. 위치가 오래되면 상대 레이어가 사라집니다.</p>
</section>
  <section className="panel"><div className="sectionTitle"><span>03</span><h2>Research log</h2></div><p className="note">로컬 이벤트 기록입니다. GPS 이동 경로는 저장하지 않습니다.</p><button onClick={saveLog}>Export CSV</button><div className="logs">{events.length?events.map((e,i)=><div key={i}><time>{e.time}</time><span>{e.event}</span></div>):<p className="note">No events yet.</p>}</div></section><footer>V1.0 prototype · Two supplied layers, three WAV stages each. Stage 1 beyond 60m from destination, stage 2 within 60m; stage 3 on both devices when participants approach within 25m, fully mixed by 8m, regardless of destination. Real GPS may have significant error. Positions shared with session members while page is open; avoid sharing links publicly. Simulation positions are virtual. Keep the screen awake; background GPS may pause. Never test while crossing roads.</footer></>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
