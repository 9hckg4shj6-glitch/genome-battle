// 学習／対戦の集計分離、迷った記録、復習コースの回帰確認。
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
class MemoryStorage {
  data=new Map();getItem(k){return this.data.get(k) ?? null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
globalThis.localStorage=new MemoryStorage();
const bundle=await build({stdin:{contents:"export * from './ui';export * from './learning';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'}});
const ui=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const correct={id:'correct',answer:1,my_choice:1,explanation:'correct explanation'};
const wrong={id:'wrong',answer:1,my_choice:2,explanation:'wrong explanation'};
const unanswered={id:'unanswered',answer:1,my_choice:null,explanation:'unanswered explanation'};
localStorage.setItem('gb.notebook',JSON.stringify({missed:{wrong:{...wrong,misses:2,key:'old',at:1}},saved:{correct:{...correct,misses:0,key:'',at:1}}}));
assert.deepEqual(ui.notebook().uncertain,{});
ui.toggleUncertain(wrong);assert.deepEqual(ui.notebook().uncertain,{});
ui.toggleUncertain(unanswered);assert.deepEqual(ui.notebook().uncertain,{});
ui.toggleUncertain(correct);assert.ok(ui.notebook().uncertain.correct);assert.equal(ui.notebook().missed.wrong.misses,2);assert.ok(ui.notebook().saved.correct);
assert.match(ui.uncertainButton(correct),/aria-pressed="true"/);assert.equal(ui.uncertainButton(wrong),'');assert.equal(ui.uncertainButton(unanswered),'');
const course=ui.reviewCourse([wrong,unanswered,correct,{...correct,id:'confident'},wrong],{correct:true,outside:true});
assert.deepEqual(course,{ids:['wrong','unanswered','correct'],wrong:1,unanswered:1,uncertain:1});
ui.toggleUncertain(correct);assert.ok(!ui.notebook().uncertain.correct);assert.ok(ui.notebook().saved.correct);
assert.deepEqual(ui.reviewCourse([correct],{}).ids,[]);
localStorage.setItem('gb.performance.bad','broken');assert.equal(ui.cachedPerformance('bad'),null);
const cached={study:{sessions:1,answered:3,correct:2},ai:{matches:5,wins:2,draws:1,points:17},human:{matches:2,wins:0,draws:1,points:4}};
ui.cachePerformance('a',cached);assert.deepEqual(ui.cachedPerformance('a'),cached);assert.equal(ui.cachedPerformance('b'),null);
assert.match(ui.renderPerformance(cached),/67<small>%/);
console.log('PASS local learning: old notebook preserved, correct-only uncertainty, toggle/reload, distinct course targets, empty course, separate player caches');

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
const createdSolo=[],createdMatches=[];const device=randomUUID();
async function sql(query,parameters=[]) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});
  if(!r.ok)throw new Error(`Fixture HTTP ${r.status}`);return r.json();
}
async function rpc(fn,args) {const {data,error}=await sb.rpc(fn,args);if(error)throw new Error(`${fn}: ${error.message}`);return data;}
const ids=JSON.parse(readFileSync('public/questions.json','utf8')).slice(0,2).map(q=>q.id);
const answerRows=await sql('select id,answer from public.questions where id=any($1::text[])',[ids]);const answers=new Map(answerRows.map(q=>[q.id,q.answer]));
const stats=async()=>{const p=await rpc('get_performance',{p_device:device});delete p.server_now;return p;};const args=s=>({p_session:s.id,p_device:device});
const zeroBattle={matches:0,wins:0,draws:0,points:0};
async function solo(mode,qids) {const s=await rpc('start_solo',{p_device:device,p_mode:mode,p_ids:qids,p_seconds:5,p_difficulty:'normal'});createdSolo.push(s.id);return s;}
try {
  let p=await stats();assert.deepEqual(p.study,{sessions:0,answered:0,correct:0,viewed:0});assert.deepEqual(p.ai,zeroBattle);assert.deepEqual(p.human,zeroBattle);
  let s=await solo('study',ids);
  s=await rpc('answer_solo',{...args(s),p_q_index:0,p_choice:answers.get(s.q_id)});s=await rpc('next_solo',{...args(s),p_q_index:0});
  s=await rpc('answer_solo',{...args(s),p_q_index:1,p_choice:(answers.get(s.q_id)+1)%5});
  assert.deepEqual((await stats()).study,{sessions:0,answered:2,correct:1,viewed:0});
  s=await rpc('next_solo',{...args(s),p_q_index:1});assert.equal(s.phase,'finished');
  p=await stats();assert.deepEqual(p.study,{sessions:1,answered:2,correct:1,viewed:0});assert.deepEqual(p.ai,zeroBattle);
  s=await solo('ai',[ids[0]]);await sql("update public.solo_sessions set ai_due_at=now()+interval '1 hour' where id=$1::uuid",[s.id]);
  s=await rpc('answer_solo',{...args(s),p_q_index:0,p_choice:answers.get(s.q_id)});await rpc('next_solo',{...args(s),p_q_index:0});
  s=await solo('ai',[ids[0]]);await sql("update public.solo_sessions set ai_due_at=now()-interval '1 second',ai_correct=true where id=$1::uuid",[s.id]);
  s=await rpc('get_solo',args(s));await rpc('next_solo',{...args(s),p_q_index:0});
  s=await solo('ai',[ids[0]]);await sql("update public.solo_sessions set question_at=now()-interval '20 seconds',ai_due_at=now()-interval '10 seconds',ai_correct=false where id=$1::uuid",[s.id]);
  s=await rpc('get_solo',args(s));await rpc('next_solo',{...args(s),p_q_index:0});
  p=await stats();assert.deepEqual(p.study,{sessions:1,answered:2,correct:1,viewed:0});assert.deepEqual(p.ai,{matches:3,wins:1,draws:1,points:1});
  const peer=randomUUID(),third=randomUUID();
  let m=await rpc('create_room',{p_device:device,p_name:'metrics-host',p_capacity:3,p_seconds:5,p_private:true});createdMatches.push(m.id);
  await rpc('join_room',{p_code:m.code,p_invite:m.invite_token,p_device:peer,p_name:'metrics-peer'});
  await rpc('join_room',{p_code:m.code,p_invite:m.invite_token,p_device:third,p_name:'metrics-third'});
  await sql('update public.matches set q_ids=$2::text[] where id=$1::uuid',[m.id,ids]);
  await sql('update players set ready=true,last_seen=now() where match_id=$1::uuid',[m.id]);
  await rpc('start_room',{p_match:m.id,p_device:device});
  // 両問とも全員未解答で時間切れにし、実際の進行RPCで完了させる。
  for(let i=0;i<5;i++) {
    await sql("update public.matches set phase_ends_at=now()-interval '1 second' where id=$1::uuid",[m.id]);
    m=await rpc('tick',{p_match:m.id,p_device:device});
  }
  assert.equal(m.status,'finished');assert.equal(m.phase,null);
  assert.deepEqual((await stats()).human,{matches:1,wins:0,draws:1,points:0});
  await sql('update public.players set score=case when device_id=$2::uuid then 1 else 2 end where match_id=$1::uuid',[m.id,device]);
  p=await stats();assert.deepEqual(p.human,{matches:1,wins:0,draws:0,points:1});
  assert.deepEqual((await rpc('get_performance',{p_device:peer})).human,{matches:1,wins:0,draws:1,points:2});
  await sql('update public.players set score=3 where match_id=$1::uuid and device_id=$2::uuid',[m.id,device]);assert.equal((await stats()).human.wins,1);
  await sql('update public.players set score=2 where match_id=$1::uuid and device_id=$2::uuid',[m.id,device]);assert.deepEqual((await stats()).human,{matches:1,wins:0,draws:1,points:2});
  m=await rpc('create_room',{p_device:device,p_name:'cancelled'});createdMatches.push(m.id);
  await sql("update public.matches set status='finished' where id=$1::uuid",[m.id]);
  const again=await stats();assert.deepEqual(again.human,{matches:1,wins:0,draws:1,points:2});assert.deepEqual(again.study,p.study);assert.deepEqual(again.ai,p.ai);
  assert.deepEqual(await stats(),again);assert.ok(!('answer' in again));
  console.log('PASS server performance: partial study counted before completion, AI win/loss/draw separate, human sole winner/tied top/loss, cancelled rooms excluded, repeat reads stable');
} finally {
  // テストの解答を「みんなの正答率」に残さない（対戦・セッションを消す前に端末を割り出す）。
  await sql('delete from question_first_answers where device_id in (select device_id from solo_sessions where id=any($1::uuid[]) union select device_id from players where match_id=any($2::uuid[]) union select unnest($3::uuid[]))',[createdSolo,createdMatches,[device]]).catch(()=>{});
  if(createdMatches.length)await sql('delete from public.matches where id=any($1::uuid[])',[createdMatches]);
  if(createdSolo.length)await sql('delete from public.solo_sessions where id=any($1::uuid[])',[createdSolo]);
  await sql('delete from study_attempts where device_id=$1::uuid',[device]);await sql('delete from study_answer_records where device_id=$1::uuid',[device]);await sql('delete from study_completions where device_id=$1::uuid',[device]);
  await sb.removeAllChannels();console.log('Cleaned only fixtures created by this check');
}
