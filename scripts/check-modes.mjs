// 実Supabaseに対する回帰確認。作成したテスト用セッションだけを最後に削除する。
// node scripts/check-modes.mjs
// ~/.supabase-token はfixtureの時刻操作とテスト後の片付けにのみ使う。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
const created=[];
const createdMatches=[];
async function sql(query,parameters=[]) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});
  if (!r.ok) throw new Error(`Fixture query HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function rpc(fn,args) {const {data,error}=await sb.rpc(fn,args);if (error) throw new Error(`${fn}: ${error.message}`);return data;}
const device=randomUUID();
const qs=JSON.parse(readFileSync('public/questions.json','utf8')).slice(0,15);
const expected=await sql('select id,answer from public.questions where id=any($1::text[])',[qs.map(q=>q.id)]);
const answers=new Map(expected.map(q=>[q.id,q.answer]));
async function start(mode,ids,extra={}) {const s=await rpc('start_solo',{p_device:device,p_mode:mode,p_ids:ids,p_seconds:5,p_difficulty:'normal',...extra});created.push(s.id);return s;}
function params(s) {return {p_session:s.id,p_device:device};}
try {
  let s=await start('study',qs.slice(0,3).map(q=>q.id));
  assert.equal(s.reveal,null);assert.equal(s.phase_ends_at,null);
  assert.ok(!('answer' in s) && !('ai_due_at' in s) && !('ai_correct' in s));
  await assert.rejects(()=>rpc('get_solo',{p_session:s.id,p_device:randomUUID()}),/SOLO_NOT_FOUND/);
  assert.equal(await rpc('review_solo',params(s)),null);
  const args={...params(s),p_q_index:0,p_choice:answers.get(s.q_id)};
  const concurrent=await Promise.all([rpc('answer_solo',args),rpc('answer_solo',args)]);
  assert.ok(concurrent.every(n=>n.my_score===1 && n.phase==='reveal'));
  const doubleNext=await Promise.all([rpc('next_solo',{...params(s),p_q_index:0}),rpc('next_solo',{...params(s),p_q_index:0})]);
  assert.ok(doubleNext.every(n=>n.q_index===1));s=doubleNext[1];
  s=await rpc('answer_solo',{...params(s),p_q_index:1,p_choice:(answers.get(s.q_id)+1)%5});
  assert.equal(s.my_score,1);assert.equal(s.phase,'reveal');
  s=await rpc('next_solo',{...params(s),p_q_index:1});
  s=await rpc('answer_solo',{...params(s),p_q_index:2,p_choice:answers.get(s.q_id)});
  s=await rpc('next_solo',{...params(s),p_q_index:2});
  assert.equal(s.phase,'finished');assert.equal(s.my_score,2);
  const review=await rpc('review_solo',params(s));assert.equal(review.length,3);assert.ok(review.every(r=>r.explanation && Number.isInteger(r.answer)));
  console.log('PASS study: reveal privacy, ownership, scoring, concurrent answers/next, finish and review');
  await assert.rejects(()=>start('study',[qs[0].id,qs[0].id]),/BAD_SOLO_SETTINGS/);
  await assert.rejects(()=>start('study',['missing']),/BAD_SOLO_SETTINGS/);
  await assert.rejects(()=>start('ai',[qs[0].id],{p_seconds:0}),/BAD_SOLO_SETTINGS/);
  console.log('PASS settings: reject duplicates, missing questions and invalid timers');
  s=await start('ai',qs.slice(0,2).map(q=>q.id));
  await sql("update public.solo_sessions set ai_due_at=now()-interval '1 second',ai_correct=true where id=$1::uuid",[s.id]);
  s=await rpc('answer_solo',{...params(s),p_q_index:0,p_choice:answers.get(s.q_id)});
  assert.equal(s.winner,'ai');assert.equal(s.ai_score,1);assert.equal(s.my_score,0);assert.equal(s.my_choice,null);
  assert.equal(s.reveal.answer,answers.get(s.q_id));
  console.log('PASS AI: earlier server-side AI answer wins over late human answer');
  s=await start('ai',[qs[0].id]);
  await sql("update public.solo_sessions set ai_due_at=now()-interval '1 second',ai_correct=false where id=$1::uuid",[s.id]);
  s=await rpc('get_solo',params(s));assert.equal(s.ai_mark,'x');assert.equal(s.phase,'question');assert.equal(s.reveal,null);
  s=await rpc('answer_solo',{...params(s),p_q_index:0,p_choice:answers.get(s.q_id)});
  assert.equal(s.winner,'me');assert.equal(s.my_score,1);
  s=await rpc('next_solo',{...params(s),p_q_index:0});assert.equal(s.phase,'finished');
  console.log('PASS AI: opponent mistake permits human answer; final result persists');
  s=await start('ai',[qs[0].id]);
  await sql("update public.solo_sessions set question_at=now()-interval '20 seconds',ai_due_at=now()-interval '10 seconds',ai_correct=false where id=$1::uuid",[s.id]);
  s=await rpc('get_solo',params(s));assert.equal(s.phase,'reveal');assert.equal(s.winner,null);
  const repeat=await rpc('get_solo',params(s));assert.equal(repeat.version,s.version);assert.equal(repeat.ai_score,0);
  console.log('PASS AI: timeout, no double scoring, idempotent poll');
  s=await start('ai',qs.map(q=>q.id));
  for(let i=0;i<5;i++) {
    await sql("update public.solo_sessions set ai_due_at=now()+interval '1 hour' where id=$1::uuid",[s.id]);
    s=await rpc('answer_solo',{...params(s),p_q_index:i,p_choice:answers.get(s.q_id)});
    s=await rpc('next_solo',{...params(s),p_q_index:i});
  }
  assert.equal(s.my_score,5);assert.equal(s.phase,'finished');assert.equal((await rpc('review_solo',params(s))).length,5);
  console.log('PASS AI: first to five finishes before the 15-question limit');
  const direct=await sb.from('solo_sessions').select('*');assert.ok(direct.error || direct.data.length===0);
  const internal=await sb.rpc('_solo_state',{p_session:s.id});assert.ok(internal.error);
  console.log('PASS permissions: direct rows and internal functions are inaccessible to guests');
  const guest=randomUUID();
  let room=await rpc('create_room',{p_device:device,p_name:'test-host',p_capacity:2,p_seconds:5,p_private:true});
  createdMatches.push(room.id);
  await assert.rejects(()=>rpc('start_room',{p_match:room.id,p_device:device}),/NEED_PLAYERS/);
  const joined=await rpc('join_room',{p_code:room.code,p_device:guest,p_name:'test-guest',p_invite:room.invite_token});
  assert.equal(joined.players.length,2);assert.equal(joined.my_seat,1);
  await assert.rejects(()=>rpc('start_room',{p_match:room.id,p_device:guest}),/HOST_ONLY/);
  await assert.rejects(()=>rpc('join_room',{p_code:room.code,p_device:randomUUID(),p_name:'test-extra',p_invite:room.invite_token}),/ROOM_FULL/);
  await sql('update players set ready=true,last_seen=now() where match_id=$1::uuid',[room.id]);
  room=await rpc('start_room',{p_match:room.id,p_device:device});assert.equal(room.phase,'countdown');
  await sql("update public.matches set phase_ends_at=now()-interval '1 second' where id=$1::uuid",[room.id]);
  room=await rpc('tick',{p_match:room.id,p_device:device});assert.equal(room.phase,'question');
  const [answer]=await sql('select answer from public.questions where id=$1',[room.q_id]);
  const simultaneous=await Promise.all([device,guest].map(d=>rpc('submit_answer',{p_match:room.id,p_device:d,p_q_index:room.q_index,p_choice:answer.answer})));
  for(const result of simultaneous) {
    assert.equal(result.phase,'reveal');assert.equal(result.players.filter(p=>p.mark==='o').length,1);
    assert.equal(result.players.reduce((a,p)=>a+p.score,0),1);
  }
  assert.equal((await rpc('get_review',{p_match:room.id,p_device:device})).length,1);
  console.log('PASS private room: creation, join, capacity, host permission, countdown, concurrent winner and review');

  const host=randomUUID(), peer=randomUUID(), outsider=randomUUID();
  let open=await rpc('create_room',{p_device:host,p_name:'public-host',p_capacity:3,p_seconds:20});
  createdMatches.push(open.id);
  const listed=async()=> (await rpc('list_public_rooms',{})).find(r=>r.id===open.id);
  assert.equal(open.is_private,false);assert.equal(open.invite_token,null);
  let item=await listed();assert.equal(item.host_name,'public-host');assert.equal(item.player_count,1);
  assert.deepEqual(Object.keys(item).sort(),['answer_seconds','capacity','field','host_name','id','player_count','q_total']);
  let peerState=await rpc('join_public_room',{p_match:open.id,p_device:peer,p_name:'public-peer'});
  assert.equal(peerState.my_seat,1);assert.equal(peerState.players.length,2);
  await assert.rejects(()=>rpc('set_room_private',{p_match:open.id,p_device:peer,p_private:true}),/HOST_ONLY/);
  open=await rpc('set_room_private',{p_match:open.id,p_device:host,p_private:true});
  const firstInvite=open.invite_token;assert.ok(firstInvite);assert.equal(await listed(),undefined);
  await assert.rejects(()=>rpc('join_public_room',{p_match:open.id,p_device:outsider,p_name:'outsider'}),/ROOM_NOT_FOUND/);
  await assert.rejects(()=>rpc('join_room',{p_code:open.code,p_device:outsider,p_name:'outsider'}),/INVITE_REQUIRED/);
  await assert.rejects(()=>rpc('join_room',{p_code:open.code,p_device:outsider,p_name:'outsider',p_invite:'incorrect'}),/INVITE_REQUIRED/);
  assert.equal(await rpc('get_match',{p_match:open.id,p_device:outsider}),null);
  await assert.rejects(()=>rpc('tick',{p_match:open.id,p_device:outsider}),/NOT_IN_MATCH/);
  const peerPrivate=await rpc('get_match',{p_match:open.id,p_device:peer});assert.equal(peerPrivate.invite_token,null);
  const [broadcast]=await sql('select public._state($1::uuid) as state',[open.id]);assert.ok(!('invite_token' in broadcast.state));
  const invited=await rpc('join_room',{p_code:open.code,p_device:outsider,p_name:'invited',p_invite:firstInvite});
  assert.equal(invited.players.length,3);assert.equal(invited.invite_token,null);
  await rpc('leave_match',{p_match:open.id,p_device:outsider});
  open=await rpc('set_room_private',{p_match:open.id,p_device:host,p_private:false});
  assert.equal(open.invite_token,null);assert.ok(await listed());
  open=await rpc('set_room_private',{p_match:open.id,p_device:host,p_private:true});assert.notEqual(open.invite_token,firstInvite);
  await assert.rejects(()=>rpc('join_room',{p_code:open.code,p_device:outsider,p_name:'old-invite',p_invite:firstInvite}),/INVITE_REQUIRED/);
  await rpc('tick',{p_match:open.id,p_device:peer});
  open=await rpc('set_room_private',{p_match:open.id,p_device:host,p_private:false});
  const contenders=[randomUUID(),randomUUID()];
  const admissions=await Promise.allSettled(contenders.map(d=>rpc('join_public_room',{p_match:open.id,p_device:d,p_name:'contender'})));
  assert.equal(admissions.filter(r=>r.status==='fulfilled').length,1);
  assert.ok(admissions.some(r=>r.status==='rejected' && /ROOM_FULL/.test(r.reason.message)));
  item=await listed();assert.equal(item.player_count,3);
  await rpc('tick',{p_match:open.id,p_device:host});
  await sql('update players set ready=true,last_seen=now() where match_id=$1::uuid',[open.id]);
  open=await rpc('start_room',{p_match:open.id,p_device:host});assert.equal(open.phase,'countdown');
  assert.equal(await listed(),undefined);
  await assert.rejects(()=>rpc('set_room_private',{p_match:open.id,p_device:host,p_private:true}),/ROOM_STARTED/);
  await assert.rejects(()=>rpc('join_public_room',{p_match:open.id,p_device:randomUUID(),p_name:'late'}),/ROOM_NOT_FOUND/);
  const stale=await rpc('create_room',{p_device:host,p_name:'stale-room'});createdMatches.push(stale.id);
  await sql("update public.matches set last_active=now()-interval '20 seconds' where id=$1::uuid",[stale.id]);
  assert.ok(!(await rpc('list_public_rooms',{})).some(r=>r.id===stale.id));
  await assert.rejects(()=>rpc('join_public_room',{p_match:stale.id,p_device:peer,p_name:'stale-join'}),/ROOM_NOT_FOUND/);
  const auto=await rpc('find_match',{p_device:randomUUID(),p_name:'queue-test',p_capacity:7,p_seconds:119});createdMatches.push(auto.id);
  assert.ok(!(await rpc('list_public_rooms',{})).some(r=>r.id===auto.id));
  console.log('PASS public rooms: default visibility, list selection, host locking, invitation privacy/rotation, concurrent capacity, started/stale exclusion');


} finally {
  if(createdMatches.length) await sql('delete from public.matches where id=any($1::uuid[])',[createdMatches]);
  if(created.length) await sql('delete from public.solo_sessions where id=any($1::uuid[])',[created]);
  await sql('delete from study_attempts where device_id=$1::uuid',[device]);
  await sb.removeAllChannels();
  console.log(`Cleaned ${created.length} test sessions`);
}
