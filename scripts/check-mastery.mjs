// 学習レベル（XP）・問題ごとの習得状態・分野マスタリー・試験準備度の回帰確認。
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
const bundle=await build({stdin:{contents:"export * from './mastery';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'}});
const ui=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

// レベル曲線：Lv1→2は20XP、以後6XPずつ増える。
assert.deepEqual(ui.levelOf(0),{level:1,into:0,need:20});
assert.deepEqual(ui.levelOf(19),{level:1,into:19,need:20});
assert.deepEqual(ui.levelOf(20),{level:2,into:0,need:26});
assert.deepEqual(ui.levelOf(46),{level:3,into:0,need:32});
assert.equal(ui.levelOf(3016).level,30);assert.equal(ui.levelOf(3015).level,29);
// 分野の★と試験準備度。「迷った」は習得・定着から外す。
const qs=new Map([['a1',{id:'a1',field:'A'}],['a2',{id:'a2',field:'A'}],['b1',{id:'b1',field:'B'}],['b2',{id:'b2',field:'B'}],['c1',{id:'c1',field:'C'}]]);
const m={xp:120,xp_today:0,states:{a1:'settled',a2:'settled',b1:'mastered',b2:'learning',c1:'mastered'}};
const stars=f=>Object.fromEntries(ui.fieldMastery(qs,m,f).map(x=>[x.field,x.stars]));
assert.deepEqual(stars({}),{A:3,B:1,C:2});
assert.deepEqual(stars({a1:true}),{A:1,B:1,C:2});
assert.equal(ui.stateOf(m,'a1',{a1:true}),'learning');assert.equal(ui.stateOf(m,'b2',{b2:true}),'learning');assert.equal(ui.stateOf(m,'zz',{}),'new');
assert.deepEqual(ui.fieldMastery(qs,{...m,states:{a1:'learning'}},{}).map(x=>x.stars),[0,0,0]);
let r=ui.readiness(qs,m,{});assert.deepEqual([r.ready,r.total],[4,5]);assert.deepEqual(r.counts,{new:0,learning:1,mastered:2,settled:2});
r=ui.readiness(qs,m,{c1:true});assert.equal(r.ready,3);
assert.equal(ui.readiness(qs,null,{}).counts.new,5);
// 端末キャッシュの検証。
assert.ok(ui.validMastery(m));assert.ok(!ui.validMastery({...m,xp:-1}));assert.ok(!ui.validMastery({...m,states:{a1:'other'}}));assert.ok(!ui.validMastery(null));
ui.cacheMastery('dev',{...m,session_xp:30});assert.deepEqual(ui.cachedMastery('dev'),m);assert.equal(ui.cachedMastery('other'),null);
localStorage.setItem('gb.mastery.bad','broken');assert.equal(ui.cachedMastery('bad'),null);
// 結果画面のレベルアップ表示。
assert.match(ui.renderSessionXp({xp:25,xp_today:25,session_xp:25,states:{}},false),/Lv 1 → <b>Lv 2/);
assert.match(ui.renderSessionXp({xp:30,xp_today:30,session_xp:5,states:{}},false),/\+5 XP.*Lv 2 · 次のレベルまで 16 XP/);
assert.equal(ui.renderSessionXp(null,false),'');assert.match(ui.renderSessionXp(null,true),/集計/);
assert.match(ui.renderStars(2),/★2つ（全問を習得）/);
console.log('PASS local mastery: level curve, field stars, readiness, uncertain demotion, cache validation, session XP');

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
async function sql(query,parameters=[]) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});
  if(!r.ok)throw new Error(`Fixture HTTP ${r.status}`);return r.json();
}
async function rpc(fn,args) {const {data,error}=await sb.rpc(fn,args);if(error)throw new Error(`${fn}: ${error.message}`);return data;}
const device=randomUUID(),other=randomUUID(),today=randomUUID();
const ids=JSON.parse(readFileSync('public/questions.json','utf8')).slice(0,6).map(q=>q.id);
const [q1,q2,q3,q4,q5,q6]=ids;
// [問題, 日本時間の日時, 正解, 回答を見た]。セッションは行ごとに別。
const d='2026-09-01';
const rows=[
  [q1,`${d} 10:00`,true,false],[q1,`${d} 11:00`,true,false],                                  // 20 + 5（同日2回目） → 習得
  [q2,`${d} 10:00`,false,false],['q2b','2026-09-02 10:00',true,false],[q2,'2026-09-05 10:00',true,false], // 3 + 25（克服） + 10 → 習得（誤答の前は数えない）
  [q3,`${d} 10:00`,true,false],[q3,`${d} 12:00`,true,false],[q3,`${d} 13:00`,true,false],  // 20 + 5 + 5 → 定着（3回連続、同じ日でも可）
  [q4,`${d} 10:00`,true,false],[q4,'2026-09-02 10:00',false,true],                              // 20 + 1 → 取り組み中
  [q5,`${d} 10:00`,false,true],[q5,`${d} 10:30`,true,false],                                     // 1 + 5 + 15 → 取り組み中
].map(([q,at,correct,viewed])=>[q==='q2b'?q2:q,at,correct,viewed]);
try {
  for (const [q,at,correct,viewed] of rows)
    await sql("insert into public.study_answer_records(session_id,question_id,device_id,correct,answer_viewed,answered_at) values(gen_random_uuid(),$1,$2::uuid,$3,$4,($5||'+09')::timestamptz)",[q,device,correct,viewed,at]);
  await sql("insert into public.study_answer_records(session_id,question_id,device_id,correct,answer_viewed,answered_at) values(gen_random_uuid(),$1,$2::uuid,true,false,'2026-09-01 10:00+09')",[q6,other]);
  let p=await rpc('get_mastery',{p_device:device});
  assert.equal(p.xp,25+38+30+21+21);assert.equal(p.xp_today,0);assert.equal(p.session_xp,null);
  assert.deepEqual(p.states,{[q1]:'mastered',[q2]:'mastered',[q3]:'settled',[q4]:'learning',[q5]:'learning'});
  // 今日の解答と、セッション指定の獲得XP。他の端末の記録は混ざらない。
  await sql("insert into public.study_answer_records(session_id,question_id,device_id,correct,answer_viewed) values($1::uuid,$2,$3::uuid,true,false),($1::uuid,$4,$3::uuid,false,false)",[today,q6,device,q1]);
  p=await rpc('get_mastery',{p_device:device,p_session:today});
  assert.equal(p.xp,135+20+3);assert.equal(p.xp_today,23);assert.equal(p.session_xp,23);
  assert.equal(p.states[q6],'learning');assert.equal(p.states[q1],'learning');
  assert.equal((await rpc('get_mastery',{p_device:device,p_session:randomUUID()})).session_xp,0);
  p=await rpc('get_mastery',{p_device:randomUUID()});assert.deepEqual([p.xp,p.xp_today,p.states],[0,0,{}]);
  // 公開クライアントから記録を直接読めない。
  const direct=await sb.from('study_answer_records').select('*').eq('device_id',device);assert.ok(direct.error || direct.data.length===0);
  // 実際の一人学習：初見正解と誤答を記録し、セッションのXPに反映する。
  const s0=await rpc('start_solo',{p_device:device,p_mode:'study',p_ids:[q6],p_seconds:20,p_difficulty:'normal'});
  const [{answer}]=await sql('select answer from public.questions where id=$1',[s0.q_id]);
  await rpc('answer_solo',{p_session:s0.id,p_device:device,p_q_index:0,p_choice:answer,p_q_id:s0.q_id});
  p=await rpc('get_mastery',{p_device:device,p_session:s0.id});
  assert.equal(p.session_xp,5);assert.equal(p.states[q6],'mastered');
  // 3回目の連続正解で定着。誤答をはさむと数え直す。
  const s1=await rpc('start_solo',{p_device:device,p_mode:'study',p_ids:[q6],p_seconds:20,p_difficulty:'normal'});
  await rpc('answer_solo',{p_session:s1.id,p_device:device,p_q_index:0,p_choice:answer,p_q_id:s1.q_id});
  p=await rpc('get_mastery',{p_device:device});assert.equal(p.states[q6],'settled');assert.equal(p.states[q1],'learning');
  await sql('delete from public.solo_sessions where id=$1::uuid',[s1.id]);
  await sql('delete from public.solo_sessions where id=$1::uuid',[s0.id]);
  console.log('PASS server mastery: XP rules, same-day halving, first-correct and recovery bonus, mastered/settled/learning, today and session XP, device isolation, RLS, live study answer');
} finally {
  // テストの解答を「みんなの正答率」に残さない（対戦・セッションを消す前に端末を割り出す）。
  await sql('delete from question_first_answers where device_id in (select device_id from solo_sessions where id=any($1::uuid[]) union select device_id from players where match_id=any($2::uuid[]) union select unnest($3::uuid[]))',[[],[],[device,other]]).catch(()=>{});
  await sql('delete from public.study_answer_records where device_id=any($1::uuid[])',[[device,other]]);
  await sql('delete from public.study_completions where device_id=any($1::uuid[])',[[device,other]]);
  await sql('delete from public.study_attempts where device_id=any($1::uuid[])',[[device,other]]).catch(()=>{});
}
