// 追加機能の回帰確認。自分で作成したfixtureのみを片付ける。
import assert from 'node:assert/strict';import {build} from 'esbuild';import {readFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
class MemoryStorage {data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,v);}removeItem(k){this.data.delete(k);}}
globalThis.localStorage=new MemoryStorage();
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const bundle=await build({stdin:{contents:"export * from './choices';export * from './connection';export * from './ui';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'}});
const ui=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const order=ui.choiceOrder('session',0,'question',5);assert.deepEqual([...order].sort(),[0,1,2,3,4]);assert.notDeepEqual(order,[0,1,2,3,4]);assert.deepEqual(ui.choiceOrder('session',0,'question',5),order);assert.ok(new Set(Array.from({length:25},(_,i)=>JSON.stringify(ui.choiceOrder(`session${i}`,0,'question',5)))).size>10);
const q={id:'question',question:'test',field:'test',choices:['a','b','c','d','e']};const r={id:q.id,answer:order[0],my_choice:order[0],explanation:'explanation',choice_order:order};
ui.toggleSaved(r);assert.deepEqual(ui.notebook().saved[q.id].choice_order,order);const card=ui.reviewCard(q,r,'test',true);assert.ok(card.indexOf(q.choices[order[0]]+'</li>')<card.indexOf(q.choices[order[1]]+'</li>'));assert.match(card,new RegExp(`class="correct[^>]*><span class="num">1</span>${q.choices[order[0]]}`));
assert.deepEqual(ui.validChoiceOrder([0,0,2,3,4],5),[0,1,2,3,4]);
const base={online:true,healthy:true,pending:0,latency:100,lastSuccess:1,realtime:'off'};
assert.equal(ui.connectionLabel(base).label,'接続良好');assert.equal(ui.connectionLabel({...base,online:false}).label,'オフライン');assert.equal(ui.connectionLabel({...base,healthy:false}).tone,'bad');assert.match(ui.connectionLabel({...base,realtime:'fallback'}).label,/定期通信/);assert.match(ui.connectionLabel({...base,realtime:'live'}).label,/リアルタイム/);assert.equal(ui.connectionLabel({...base,healthy:null}).tone,'waiting');
console.log('PASS local: shuffle permutation/reload/new sessions, canonical answer mapping, notebook order, connection states');
const networkBundle=await build({stdin:{contents:"export {call} from './api';export {renderConnection} from './connection';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.VITE_SUPABASE_URL':'"fixture"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'fixture-network',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createClient=()=>globalThis.fixtureNetworkClient;',loader:'js'}));}}]});
const replies=[];globalThis.fixtureNetworkClient={rpc:()=>({abortSignal:async()=>{const next=replies.shift();if(next instanceof Error)throw next;return next;}})};
const net=await import(`data:application/javascript;base64,${Buffer.from(networkBundle.outputFiles[0].text).toString('base64')}`);
replies.push({data:{},error:null});await net.call('ping',{});assert.match(net.renderConnection(),/接続良好/);
replies.push({data:null,error:{code:'',message:'Failed to fetch'}});await assert.rejects(()=>net.call('ping',{}));assert.match(net.renderConnection(),/通信エラー/);
replies.push({data:null,error:{code:'P0001',message:'NAME_REQUIRED'}});await assert.rejects(()=>net.call('domain',{}));assert.match(net.renderConnection(),/接続良好/);
replies.push(new TypeError('Network failure'));await assert.rejects(()=>net.call('ping',{}));assert.match(net.renderConnection(),/通信エラー/);
replies.push({data:{},error:null});await net.call('ping',{});assert.match(net.renderConnection(),/接続良好/);
console.log('PASS network: fetch failure/exception, domain rejection stays connected, successful retry recovers');
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
async function sql(query,parameters=[]){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});if(!r.ok)throw new Error(`SQL HTTP ${r.status}`);return r.json();}
async function rpc(fn,args){const {data,error}=await sb.rpc(fn,args);if(error)throw new Error(`${fn}: ${error.message}`);return data;}
const a=randomUUID(),b=randomUUID(),c=randomUUID();const profiles=[a,b,c],rooms=[],solos=[];
try {
 const pa=await rpc('friend_sync',{p_device:a,p_name:'social-a'}),pb=await rpc('friend_sync',{p_device:b,p_name:'social-b'});await rpc('friend_sync',{p_device:c,p_name:'outsider'});
 assert.match(pa.profile.code,/^[A-F0-9]{10}$/);assert.equal((await rpc('friend_sync',{p_device:a})).profile.code,pa.profile.code);
 await assert.rejects(()=>rpc('friend_request',{p_device:a,p_code:pa.profile.code}),/FRIEND_SELF/);await assert.rejects(()=>rpc('friend_request',{p_device:a,p_code:'xxxxxxxxxx'}),/FRIEND_NOT_FOUND/);
 let sa=await rpc('friend_request',{p_device:a,p_code:pb.profile.code.toLowerCase()});assert.equal(sa.outgoing.length,1);
 await rpc('friend_request',{p_device:a,p_code:pb.profile.code});assert.equal((await rpc('friend_sync',{p_device:a})).outgoing.length,1);
 let bs=await rpc('friend_sync',{p_device:b});const fid=bs.incoming[0].id;
 await assert.rejects(()=>rpc('friend_respond',{p_device:a,p_friendship:fid,p_action:'accept'}),/FRIEND_ACTION_DENIED/);await assert.rejects(()=>rpc('friend_respond',{p_device:c,p_friendship:fid,p_action:'accept'}),/FRIEND_NOT_FOUND/);
 bs=await rpc('friend_respond',{p_device:b,p_friendship:fid,p_action:'accept'});assert.equal(bs.friends.length,1);assert.equal(bs.incoming.length,0);
 sa=await rpc('friend_sync',{p_device:a});assert.equal(sa.friends[0].code,pb.profile.code);assert.equal(sa.friends[0].online,true);assert.ok(!JSON.stringify(sa).includes(b));
 await sql("update public.friend_profiles set last_seen=now()-interval '2 minutes' where device_id=$1::uuid",[b]);assert.equal((await rpc('friend_sync',{p_device:a})).friends[0].online,false);
 console.log('PASS friends: stable codes, requests/duplicates, owner-only accept, mutual list, presence, no device identifiers');
 let m=await rpc('create_room',{p_device:a,p_name:'social-a',p_capacity:2,p_seconds:120,p_private:true});rooms.push(m.id);
 await assert.rejects(async()=>rpc('invite_friend',{p_device:a,p_code:(await rpc('friend_sync',{p_device:c})).profile.code,p_match:m.id}),/FRIEND_NOT_ACCEPTED/);
 await assert.rejects(()=>rpc('invite_friend',{p_device:b,p_code:pa.profile.code,p_match:m.id}),/HOST_ONLY/);
 await rpc('invite_friend',{p_device:a,p_code:pb.profile.code,p_match:m.id});bs=await rpc('friend_sync',{p_device:b});assert.equal(bs.invites.length,1);assert.ok(!JSON.stringify(bs).includes(m.invite_token));const inv=bs.invites[0].id;
 await assert.rejects(()=>rpc('join_friend_invite',{p_device:c,p_invite:inv,p_name:'outsider'}),/FRIEND_INVITE_EXPIRED/);
 let joined=await rpc('join_friend_invite',{p_device:b,p_invite:inv,p_name:'social-b'});assert.equal(joined.my_seat,1);assert.equal(joined.invite_token,null);assert.equal((await rpc('join_friend_invite',{p_device:b,p_invite:inv,p_name:'social-b'})).my_seat,1);assert.equal((await rpc('friend_sync',{p_device:b})).invites.length,0);
 // 正解の表示位置を選んでも、送る値は元の選択肢index。
 const ids=JSON.parse(readFileSync('public/questions.json')).slice(0,2).map(q=>q.id);let ss=await rpc('start_solo',{p_device:a,p_mode:'study',p_ids:ids,p_seconds:20,p_difficulty:'normal'});solos.push(ss.id);
 const [qa]=await sql('select answer from questions where id=$1',[ss.q_id]);const shuffled=ui.choiceOrder(ss.id,ss.q_index,ss.q_id,5);const pos=shuffled.indexOf(qa.answer);ss=await rpc('answer_solo',{p_session:ss.id,p_device:a,p_q_index:0,p_choice:shuffled[pos]});assert.equal(ss.my_score,1);assert.equal(ss.my_choice,qa.answer);
 console.log('PASS invites: accepted friends/host only, recipient only, hidden key, private join, idempotent retry; shuffled answer scores correctly');
 m=await rpc('create_room',{p_device:a,p_name:'social-a',p_capacity:2,p_seconds:120,p_private:true});rooms.push(m.id);await rpc('invite_friend',{p_device:a,p_code:pb.profile.code,p_match:m.id});const old=(await rpc('friend_sync',{p_device:b})).invites[0].id;
 await rpc('set_room_private',{p_device:a,p_match:m.id,p_private:false});await rpc('set_room_private',{p_device:a,p_match:m.id,p_private:true});assert.equal((await rpc('friend_sync',{p_device:b})).invites.length,0);await assert.rejects(()=>rpc('join_friend_invite',{p_device:b,p_invite:old,p_name:'social-b'}),/FRIEND_INVITE_EXPIRED/);
 await rpc('invite_friend',{p_device:a,p_code:pb.profile.code,p_match:m.id});const recent=(await rpc('friend_sync',{p_device:b})).invites[0].id;await rpc('dismiss_friend_invite',{p_device:b,p_invite:recent});assert.equal((await rpc('friend_sync',{p_device:b})).invites.length,0);
 await rpc('invite_friend',{p_device:a,p_code:pb.profile.code,p_match:m.id});await sql("update public.friend_invites set expires_at=now()-interval '1 second' where match_id=$1::uuid",[m.id]);assert.equal((await rpc('friend_sync',{p_device:b})).invites.length,0);
 await rpc('invite_friend',{p_device:a,p_code:pb.profile.code,p_match:m.id});await rpc('friend_respond',{p_device:b,p_friendship:fid,p_action:'remove'});assert.equal((await rpc('friend_sync',{p_device:a})).friends.length,0);assert.equal((await rpc('friend_sync',{p_device:b})).invites.length,0);
 for(const table of ['friend_profiles','friendships','friend_invites']){const res=await sb.from(table).select('*');assert.ok(res.error||!res.data.length);}
 assert.ok((await sb.rpc('_friend_snapshot',{p_device:a})).error);assert.ok((await rpc('connection_ping',{})).server_now);
 console.log('PASS expiry/privacy: rotated key, dismissed/expired invitations, unfriend revokes invites, RLS/internal RPC denied, health RPC');
}finally{if(rooms.length)await sql('delete from matches where id=any($1::uuid[])',[rooms]);if(solos.length)await sql('delete from solo_sessions where id=any($1::uuid[])',[solos]);await sql('delete from friend_profiles where device_id=any($1::uuid[])',[profiles]);await sql('delete from study_attempts where device_id=any($1::uuid[])',[profiles]);await sql('delete from study_answer_records where device_id=any($1::uuid[])',[profiles]);await sql('delete from study_completions where device_id=any($1::uuid[])',[profiles]);await sb.removeAllChannels();console.log('Cleaned only own social fixtures');}
