import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const sharedConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = sharedConfigured ? createClient(url, key, {auth:{persistSession:true,autoRefreshToken:true}}) : null;

export type Member = {id:string;session_id:string;user_id:string;layer:number;checked_in:boolean;joined_at:string};
export type SharedSession = {id:string;code:string;layer_count:number;created_at:string};

async function authenticate(){
  if(!supabase) throw new Error('Supabase 설정이 없습니다. README를 확인하세요.');
  const {data:{user},error} = await supabase.auth.getUser();
  if(error && !/session missing|auth session missing/i.test(error.message)) throw error;
  if(user) return user;
  const response=await supabase.auth.signInAnonymously();
  if(response.error) throw new Error(`${response.error.message} — Supabase에서 Anonymous Sign-ins를 활성화하세요.`);
  if(!response.data.user) throw new Error('익명 로그인 실패');
  return response.data.user;
}

export async function createSharedSession(layerCount:number){
  await authenticate();
  const {data,error}=await supabase!.rpc('create_music_session',{p_layer_count:layerCount});
  if(error) throw error;
  return data as string;
}
export async function joinSharedSession(code:string){
  await authenticate();
  const {data,error}=await supabase!.rpc('join_music_session',{p_code:code.trim().toUpperCase()});
  if(error) throw error;
  return data as string;
}
export async function checkInSharedSession(sessionId:string){
  await authenticate();
  const {error}=await supabase!.rpc('check_in_music_session',{p_session_id:sessionId});
  if(error) throw error;
}
export async function getSharedState(sessionId:string){
  const [s,m]=await Promise.all([
    supabase!.from('music_sessions').select('id,code,layer_count,created_at').eq('id',sessionId).single(),
    supabase!.from('music_members').select('id,session_id,user_id,layer,checked_in,joined_at').eq('session_id',sessionId).order('joined_at')
  ]);
  if(s.error) throw s.error;
  if(m.error) throw m.error;
  return {session:s.data as SharedSession,members:m.data as Member[]};
}
export async function getMyUserId(){return (await authenticate()).id;}

/** Estimate server-minus-device wall-clock offset using RTT midpoint, choosing the lowest latency sample. */
export async function estimateServerClockOffset(samples = 5): Promise<number> {
  if (!supabase) throw new Error('Supabase 설정이 없습니다.');
  let best: {rtt: number; offset: number} | null = null;
  for (let i = 0; i < samples; i++) {
    const before = Date.now();
    const {data,error} = await supabase.rpc('music_server_time_ms');
    const after = Date.now();
    if (error) throw new Error(`서버 시계 함수가 필요합니다: ${error.message} (supabase/clock.sql 실행)`);
    const serverMs = Number(data);
    if (!Number.isFinite(serverMs)) throw new Error('서버 시각을 읽지 못했습니다.');
    const rtt = after - before;
    const offset = serverMs - (before + after) / 2;
    if (!best || rtt < best.rtt) best = {rtt,offset};
  }
  return best!.offset;
}

// V0.9: temporary on-site presence; last_seen is stamped by the database.
export type Presence = {session_id:string;user_id:string;layer:number;last_seen:string};
export async function setOnSite(sessionId:string,userId:string,layer:number){
  const {error}=await supabase!.from('music_presence').upsert({session_id:sessionId,user_id:userId,layer,last_seen:new Date().toISOString()},{onConflict:'session_id,user_id'});
  if(error)throw error;
}
export async function leaveSite(sessionId:string,userId:string){
  const {error}=await supabase!.from('music_presence').delete().eq('session_id',sessionId).eq('user_id',userId);
  if(error)throw error;
}
export async function getPresence(sessionId:string):Promise<Presence[]>{
  const {data,error}=await supabase!.from('music_presence').select('session_id,user_id,layer,last_seen').eq('session_id',sessionId);
  if(error)throw error;
  return data as Presence[];
}

// V1.0: only members of a session can see recent participant locations.
export type PeerPosition={session_id:string;user_id:string;layer:number;lat:number;lon:number;accuracy:number;last_seen:string};
export async function publishPosition(sessionId:string,userId:string,layer:number,lat:number,lon:number,accuracy:number){
 const {error}=await supabase!.from('music_positions').upsert({session_id:sessionId,user_id:userId,layer,lat,lon,accuracy,last_seen:new Date().toISOString()},{onConflict:'session_id,user_id'});
 if(error)throw error;
}
export async function readPositions(sessionId:string):Promise<PeerPosition[]>{
 const {data,error}=await supabase!.from('music_positions').select('session_id,user_id,layer,lat,lon,accuracy,last_seen').eq('session_id',sessionId);
 if(error)throw error;return data as PeerPosition[];
}
export async function clearPosition(sessionId:string,userId:string){
 await supabase!.from('music_positions').delete().eq('session_id',sessionId).eq('user_id',userId);
}

// V1.3: server-authorized destination update with verified return value.
export async function saveSessionDestination(sessionId:string,lat:number,lon:number){
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
    throw new Error('유효한 위도·경도를 입력해 주세요.');
  const {data,error}=await supabase!.rpc('set_music_destination',{
    p_session_id:sessionId,p_lat:lat,p_lon:lon
  });
  if(error)throw new Error(`목적지 저장 실패: ${error.message} (supabase/v13_destination_fix.sql 실행 필요)`);
  if(!data)throw new Error('목적지 저장을 확인할 수 없습니다.');
  const saved=await readSessionDestination(sessionId);
  if(!saved||Math.abs(saved.lat-lat)>0.0000001||Math.abs(saved.lon-lon)>0.0000001)
    throw new Error('목적지 저장 검증 실패: 서버 좌표가 일치하지 않습니다.');
}
export async function readSessionDestination(sessionId:string):Promise<{lat:number;lon:number}|null>{
  const {data,error}=await supabase!.rpc('get_music_destination',{p_session_id:sessionId});
  if(error)throw new Error(`목적지 조회 실패: ${error.message} (supabase/v13_destination_fix.sql 실행 필요)`);
  return data?.lat!=null&&data?.lon!=null?{lat:Number(data.lat),lon:Number(data.lon)}:null;
}
