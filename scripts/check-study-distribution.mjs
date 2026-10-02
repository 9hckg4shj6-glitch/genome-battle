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
const device=randomUUID(),sessions=[];
const bank=JSON.parse(readFileSync('public/questions.json','utf8')),ids=bank.map(q=>q.id),byId=new Map(bank.map(q=>[q.id,q]));
const fields=[...new Set(bank.map(q=>q.field))];
const capacities=Object.fromEntries(fields.map(f=>[f,bank.filter(q=>q.field===f).length]));
async function start(count,distribution='even',order='random',pool=ids,mode='study'){
 const s=await rpc('start_solo',{p_device:device,p_mode:mode,p_ids:pool,p_order:order,p_count:count,...(distribution===undefined?{}:{p_distribution:distribution})});sessions.push(s.id);
 const [row]=await sql('select q_ids,original_ids from solo_sessions where id=$1::uuid',[s.id]);
 assert.equal(row.q_ids.length,count);assert.equal(new Set(row.q_ids).size,count);assert.ok(row.q_ids.every(id=>pool.includes(id)));assert.deepEqual(row.original_ids,row.q_ids);
 assert.equal(s.reveal,null);assert.ok(!('q_ids' in s));return {...s,ids:row.q_ids};
}
const counts=s=>Object.fromEntries(fields.map(f=>[f,s.ids.filter(id=>byId.get(id).field===f).length]));
try{
 for(const n of [1,10,13,26,39,60,99,100]){
  const s=await start(n);const tally=counts(s);assert.equal(s.study_distribution,'even');
  // 配分が少ない分野は保有問題が尽きている。残った分野同士の差は1問以内。
  const nonexhausted=fields.filter(f=>tally[f]<capacities[f]);
  for(const f of nonexhausted)for(const g of fields)assert.ok(tally[g]<=tally[f]+1,`${n}: unequal ${f}/${g}`);
  if(n===10)assert.equal(Object.values(tally).filter(v=>v===1).length,10);
  if(n===26)assert.ok(Object.values(tally).every(v=>v===2));
  if(n===100)assert.deepEqual(tally,capacities);
 }
 // 未着手を各分野1問だけ残し、均等配分の各枠で未着手を優先する。
 const untouched=fields.map(f=>bank.find(q=>q.field===f).id);
 const attempted=ids.filter(id=>!untouched.includes(id));
 await sql('insert into study_attempts(device_id,question_id) select $1::uuid,unnest($2::text[])',[device,attempted]);
 const equal=await start(26,'even','unattempted');assert.ok(untouched.every(id=>equal.ids.includes(id)));assert.ok(Object.values(counts(equal)).every(v=>v===2));
 // 過去問配分と旧クライアントは全体で未着手を優先。
 const exam=await start(13,'exam','unattempted');assert.deepEqual([...exam.ids].sort(),[...untouched].sort());assert.equal(exam.study_distribution,'exam');
 const legacy=await rpc('start_solo',{p_device:device,p_mode:'study',p_ids:ids,p_order:'unattempted',p_count:13});sessions.push(legacy.id);assert.equal(legacy.study_distribution,'exam');
 const [legacyRow]=await sql('select q_ids from solo_sessions where id=$1::uuid',[legacy.id]);assert.deepEqual([...legacyRow.q_ids].sort(),[...untouched].sort());
 // 候補を越えず、容量が偏った候補でも補充する。
 const pool=[...bank.filter(q=>q.field===fields[0]).slice(0,1),...bank.filter(q=>q.field===fields[1]).slice(0,5)].map(q=>q.id);
 const subset=await start(pool.length,'even','random',pool);assert.deepEqual([...subset.ids].sort(),[...pool].sort());
 const oneField=bank.filter(q=>q.field==='DNA複製').map(q=>q.id);const single=await start(4,'even','unattempted',oneField);assert.equal(single.study_distribution,null);
 const review=await start(3,'exam','given',ids.slice(0,3));assert.deepEqual(review.ids,ids.slice(0,3));assert.equal(review.study_distribution,null);
 const ai=await start(3,'exam','given',ids.slice(0,3),'ai');assert.equal(ai.study_distribution,null);
 // 保存・再取得・後回しでも元の配分と問題順を維持。公開一覧には回答と問題順を出さない。
 let s=await rpc('defer_solo',{p_device:device,p_session:equal.id,p_q_index:equal.q_index,p_q_id:equal.q_id,p_version:equal.version});
 s=await rpc('save_study',{p_device:device,p_session:s.id});const loaded=await rpc('get_solo',{p_device:device,p_session:s.id});assert.equal(loaded.study_distribution,'even');assert.equal(loaded.q_id,equal.ids[1]);assert.equal(loaded.choice_index,1);
 const [stored]=await sql('select original_ids from solo_sessions where id=$1::uuid',[s.id]);assert.deepEqual(stored.original_ids,equal.ids);
 const saved=await rpc('list_saved_studies',{p_device:device});const card=saved.find(v=>v.id===s.id);assert.equal(card.study_distribution,'even');assert.ok(!('q_ids' in card)&&!('reveal' in card)&&!('answer' in card));
 for(const args of [{p_distribution:'bad'},{p_distribution:'even',p_order:'given'},{p_distribution:'even',p_mode:'ai',p_order:'given'},{p_ids:[ids[0],ids[0]],p_count:2}])await assert.rejects(()=>rpc('start_solo',{p_device:device,p_mode:'study',p_ids:ids,p_order:'random',p_count:2,...args}),/BAD_SOLO_SETTINGS/);
 console.log('PASS distribution: 1/10/13/26/39/60/99/100 questions, balanced quotas, shortage redistribution, no repeats, field/subset limits, per-field unattempted priority');
 console.log('PASS compatibility: legacy/exam priority, given review/AI, invalid settings, saved distribution/order/deferred choice, answer privacy');
}finally{
 if(sessions.length)await sql('delete from solo_sessions where id=any($1::uuid[])',[sessions]);
 for(const table of ['study_attempts','study_answer_records','study_completions'])await sql(`delete from ${table} where device_id=$1::uuid`,[device]);
 await sb.removeAllChannels();console.log('Cleaned only this check’s UUID');
}
