// 自分のUUIDだけを使用。問題ごとの記録と中断・再開のサーバー状態を検証。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
async function sql(query,parameters=[]){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});if(!r.ok)throw new Error(`SQL HTTP ${r.status}`);return r.json();}
async function rpc(fn,args){const {data,error}=await sb.rpc(fn,args);if(error)throw new Error(`${fn}: ${error.message}`);return data;}
const device=randomUUID(),outsider=randomUUID(),sessions=[];
const ids=JSON.parse(readFileSync('public/questions.json','utf8')).slice(0,3).map(q=>q.id);
const answers=new Map((await sql('select id,answer from questions where id=any($1::text[])',[ids])).map(q=>[q.id,q.answer]));
const args=s=>({p_device:device,p_session:s.id});
const get=s=>rpc('get_solo',args(s));
const save=s=>rpc('save_study',args(s));
const list=()=>rpc('list_saved_studies',{p_device:device});
const stats=async()=>(await rpc('get_performance',{p_device:device})).study;
const next=s=>rpc('next_solo',{...args(s),p_q_index:s.q_index});
const answer=(s,correct=true)=>rpc('answer_solo',{...args(s),p_q_index:s.q_index,p_q_id:s.q_id,p_choice:(answers.get(s.q_id)+(correct?0:1))%5});
const view=s=>rpc('view_solo_answer',{...args(s),p_q_index:s.q_index,p_q_id:s.q_id,p_version:s.version});
const defer=s=>rpc('defer_solo',{...args(s),p_q_index:s.q_index,p_q_id:s.q_id,p_version:s.version});
async function start(mode='study',qids=ids){const s=await rpc('start_solo',{p_device:device,p_mode:mode,p_ids:qids,p_seconds:120});sessions.push(s.id);return s;}
try{
  assert.deepEqual(await list(),[]);
  let s=await start();const original=s;
  s=await defer(s);assert.deepEqual(await stats(),{sessions:0,answered:0,correct:0,viewed:0});
  s=await save(s);const restored=await get(s);
  for(const key of ['q_id','q_index','choice_index','deferred_count','q_total','phase','my_score'])assert.equal(restored[key],s[key]);
  assert.equal(restored.q_id,ids[1]);assert.equal(restored.choice_index,1);assert.equal(restored.reveal,null);
  let saved=await list();assert.equal(saved.length,1);assert.equal(saved[0].answered,0);assert.equal(saved[0].q_total,3);
  assert.ok(!('reveal' in saved[0])&&!('q_ids' in saved[0])&&!('answer' in saved[0]));
  assert.deepEqual(await rpc('list_saved_studies',{p_device:outsider}),[]);
  await assert.rejects(()=>rpc('save_study',{...args(s),p_device:outsider}),/SOLO_NOT_FOUND/);
  // 二重回答・保存・再読込では増えない。正解直後、「次へ」前から計上。
  await Promise.all([answer(s),answer(s)]);s=await get(s);
  assert.deepEqual(await stats(),{sessions:0,answered:1,correct:1,viewed:0});
  s=await save(s);assert.equal((await get(s)).phase,'reveal');assert.equal((await list())[0].answered,1);
  await Promise.all([save(s),get(s)]);assert.deepEqual(await stats(),{sessions:0,answered:1,correct:1,viewed:0});
  s=await next(s);s=await answer(s,false);s=await save(s);
  assert.deepEqual(await stats(),{sessions:0,answered:2,correct:1,viewed:0});
  s=await next(s);assert.equal(s.q_id,ids[0]);assert.equal(s.choice_index,original.choice_index);assert.equal(s.is_deferred,true);
  await Promise.all([view(s),view(s)]);s=await get(s);s=await save(s);
  assert.equal(s.answer_viewed,true);assert.equal((await get(s)).answer_viewed,true);
  assert.deepEqual(await stats(),{sessions:0,answered:3,correct:1,viewed:1});
  assert.equal((await list())[0].answered,3); // 残り0問でも最後の解説は再開できる。
  await Promise.all([next(s),next(s)]);s=await get(s);assert.equal(s.phase,'finished');
  assert.deepEqual(await stats(),{sessions:1,answered:3,correct:1,viewed:1});assert.deepEqual(await list(),[]);
  const review=await rpc('review_solo',args(s));assert.deepEqual(review.map(q=>q.id),[ids[1],ids[2],ids[0]]);
  // 別の演習を始めても以前の中断分を上書きしない。7日超も保持。
  const older=await start();await save(older);await sql("update solo_sessions set created_at=now()-interval '8 days' where id=$1::uuid",[older.id]);
  const newer=await start();await save(newer);saved=await list();assert.equal(saved.length,2);assert.equal(saved[0].id,newer.id);assert.equal((await get(older)).q_id,older.q_id);
  // 完了セッションを期限で整理しても問題記録と完了回数は残る。
  await sql("update solo_sessions set created_at=now()-interval '8 days' where id=$1::uuid",[s.id]);
  await start();assert.deepEqual(await stats(),{sessions:1,answered:3,correct:1,viewed:1});
  await assert.rejects(()=>get(s),/SOLO_NOT_FOUND/);assert.equal((await get(older)).phase,'question');
  const ai=await start('ai');await assert.rejects(()=>save(ai),/STUDY_ONLY/);
  assert.ok(!(await list()).some(v=>v.id===ai.id));assert.deepEqual(await stats(),{sessions:1,answered:3,correct:1,viewed:1});
  // 保存と解答が並行しても確定した解答は一度だけ記録。
  const race=await start();await Promise.all([save(race),answer(race)]);assert.equal((await get(race)).phase,'reveal');
  assert.deepEqual(await stats(),{sessions:1,answered:4,correct:2,viewed:1});
  for(const table of ['study_answer_records','study_completions']){const r=await sb.from(table).select('*');assert.ok(r.error||r.data.length===0);}
  for(const fn of ['_record_study_answer','_touch_solo_session'])assert.ok((await sb.rpc(fn,{})).error);
  console.log('PASS saved study: owner only, multiple saves, reload state, deferred/choice order, question/reveal/viewed/final explanation, completed list removal, old studies retained');
  console.log('PASS partial records: correct/wrong/viewed before next, duplicates/concurrent saves, completion once, permanent records after session cleanup, AI excluded, RLS');
}finally{
  if(sessions.length)await sql('delete from solo_sessions where id=any($1::uuid[])',[sessions]);
  for(const table of ['study_answer_records','study_completions','study_attempts'])await sql(`delete from ${table} where device_id=$1::uuid`,[device]);
  await sb.removeAllChannels();console.log('Cleaned only this check’s UUIDs');
}
