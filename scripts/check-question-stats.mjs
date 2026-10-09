// みんなの正答率（018_question_stats.sql と src/stats.ts）の回帰確認。
//   node scripts/check-question-stats.mjs          # 表示ロジックとサーバーの集計
//   node scripts/check-question-stats.mjs --local  # 表示ロジックだけ（DBに触れない）
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
const bundle=await build({stdin:{contents:"export * from './stats';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const st=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

// 一度も取得していなければ何も出さない（未適用のサーバー・通信失敗で「集計中」と誤って出さない）。
assert.equal(st.renderCommunityRate('q'),'');assert.equal(st.renderRateInline('q'),'');assert.equal(st.renderDifficultyChip('q'),'');
// 不正な値は受け付けない。
for (const bad of [null,[],{q:{n:1,correct:2}},{q:{n:-1,correct:0}},{q:{n:1.5,correct:1}},{q:'x'}]) assert.equal(st.applyQuestionStats(bad),false);
assert.equal(st.questionStat('q'),null);
// 反映と変更の検出、端末キャッシュ。
const stats={easy:{n:10,correct:9},mid:{n:10,correct:6},hardish:{n:10,correct:4},tough:{n:20,correct:5},few:{n:4,correct:4}};
assert.equal(st.applyQuestionStats(stats),true);assert.equal(st.applyQuestionStats(stats),false);
assert.deepEqual(JSON.parse(localStorage.getItem('gb.question-stats')),stats);
// 5人未満は率を出さず「集計中」。記録のない問題も集計中として扱う。
assert.equal(st.rateOf('few'),null);assert.match(st.renderCommunityRate('few'),/集計中（これまで4人が解答・5人から表示）/);
assert.match(st.renderCommunityRate('none'),/まだ解答がありません/);assert.equal(st.renderDifficultyChip('few'),'');
// 難しさの区切り：80%以上＝基本、60%以上＝標準、40%以上＝やや難、それ未満＝難問。
assert.deepEqual(['easy','mid','hardish','tough'].map(id=>st.difficultyOf(st.rateOf(id)).label),['基本','標準','やや難','難問']);
assert.deepEqual([.8,.79,.6,.59,.4,.39].map(r=>st.difficultyOf(r).key),['basic','standard','standard','hard','hard','tough']);
// メーターの数字と読み上げ用の説明。
const tough=st.renderCommunityRate('tough');
assert.match(tough,/<strong>25<small>%<\/small><\/strong>/);assert.match(tough,/初めて解いた20人のうち5人が正解/);assert.match(tough,/aria-label="初めて解いた20人のうち5人が正解（25%）"/);
assert.doesNotMatch(tough,/community-rate-tip/);
// 自分の結果に合わせた一言：難問に正解／基本問題を落とした／難問を落とした。それ以外は添えない。
assert.match(st.renderCommunityRate('tough','correct'),/難問に正解しました/);
assert.match(st.renderCommunityRate('easy','wrong'),/基本問題です/);assert.match(st.renderCommunityRate('easy','viewed'),/基本問題です/);
assert.match(st.renderCommunityRate('tough','none'),/多くの人が間違える難問/);
assert.doesNotMatch(st.renderCommunityRate('easy','correct'),/community-rate-tip/);assert.doesNotMatch(st.renderCommunityRate('mid','wrong'),/community-rate-tip/);
assert.match(st.renderRateInline('hardish'),/みんなの正答率 <b>40%<\/b>・やや難/);
assert.match(st.renderDifficultyChip('easy'),/基本 90%/);
// 壊れたキャッシュは使わない。
localStorage.setItem('gb.question-stats','broken');
const fresh=await build({stdin:{contents:"export * from './stats';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const st2=await import(`data:application/javascript;base64,${Buffer.from(fresh.outputFiles[0].text+'\n//2').toString('base64')}`);
assert.equal(st2.questionStat('easy'),null);
console.log('PASS local stats: validation, cache, threshold, difficulty bands, meter text, outcome advice, inline and chip');
if (process.argv.includes('--local')) process.exit(0);

// ---------- サーバー：初回だけを数える・回答を見たは不正解・対人戦も数える・正解者は返さない ----------
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
async function sql(query,parameters=[]) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});
  if(!r.ok)throw new Error(`Fixture HTTP ${r.status}`);return r.json();
}
async function rpc(fn,args) {const {data,error}=await sb.rpc(fn,args);if(error)throw new Error(`${fn}: ${error.message}`);return data;}
const [q]=JSON.parse(readFileSync('public/questions.json','utf8')).slice(-1).map(x=>x.id);
const [{answer}]=await sql('select answer from public.questions where id=$1',[q]);
const wrong=(answer+1)%5;
const learner=randomUUID(),viewer=randomUUID(),rival=randomUUID(),player=randomUUID();
const devices=[learner,viewer,rival,player],sessions=[],matches=[];
const stat=async()=>(await rpc('get_question_stats',{}))[q] ?? {n:0,correct:0};
const start=async(device,mode)=>{const s=await rpc('start_solo',{p_device:device,p_mode:mode,p_ids:[q],p_seconds:60,p_difficulty:'easy'});sessions.push(s.id);return s;};
try {
  const base=await stat();
  // 一人学習の初回正解は数え、同じ端末の2回目（誤答）は数えない。
  let s=await start(learner,'study');
  await rpc('answer_solo',{p_session:s.id,p_device:learner,p_q_index:0,p_choice:answer,p_q_id:q});
  assert.deepEqual(await stat(),{n:base.n+1,correct:base.correct+1});
  s=await start(learner,'study');
  await rpc('answer_solo',{p_session:s.id,p_device:learner,p_q_index:0,p_choice:wrong,p_q_id:q});
  assert.deepEqual(await stat(),{n:base.n+1,correct:base.correct+1});
  // 回答を見たのは不正解として数える。
  s=await start(viewer,'study');
  await rpc('view_solo_answer',{p_session:s.id,p_device:viewer,p_q_index:0,p_q_id:q,p_version:s.version});
  assert.deepEqual(await stat(),{n:base.n+2,correct:base.correct+1});
  // AI対戦のお手つきも数える。
  s=await start(rival,'ai');
  await rpc('answer_solo',{p_session:s.id,p_device:rival,p_q_index:0,p_choice:wrong,p_q_id:q});
  assert.deepEqual(await stat(),{n:base.n+3,correct:base.correct+1});
  // 対人戦の解答も数える。
  const [{id:m}]=await sql("insert into public.matches(q_ids,status,phase,phase_ends_at) values(array[$1],'playing','question',now()+interval '60 seconds') returning id",[q]);matches.push(m);
  await sql("insert into public.players(match_id,device_id,seat,name) values($1::uuid,$2::uuid,0,'stats-check'),($1::uuid,$3::uuid,1,'stats-check')",[m,player,randomUUID()]);
  await rpc('submit_answer',{p_match:m,p_device:player,p_q_index:0,p_choice:answer});
  assert.deepEqual(await stat(),{n:base.n+4,correct:base.correct+2});
  // 公開クライアントは記録を直接読めず、内部関数も呼べない。
  const direct=await sb.from('question_first_answers').select('*').eq('device_id',learner);assert.ok(direct.error || direct.data.length===0);
  const internal=await sb.rpc('_first_answer',{p_question:q,p_device:randomUUID(),p_correct:true});assert.ok(internal.error);
  assert.deepEqual(await stat(),{n:base.n+4,correct:base.correct+2});
  console.log('PASS server stats: first answer only, viewed counts as wrong, AI miss and live match counted, RLS, internal function private');
} finally {
  await sql('delete from public.question_first_answers where device_id=any($1::uuid[])',[devices]);
  if(matches.length)await sql('delete from public.matches where id=any($1::uuid[])',[matches]);
  if(sessions.length)await sql('delete from public.solo_sessions where id=any($1::uuid[])',[sessions]);
  for (const table of ['study_attempts','study_answer_records','study_completions'])await sql(`delete from public.${table} where device_id=any($1::uuid[])`,[devices]);
  console.log('Cleaned only this check’s fixtures');
}
