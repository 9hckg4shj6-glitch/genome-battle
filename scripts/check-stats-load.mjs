// みんなの正答率の負荷・競合テスト。大勢の端末が同じ問題に一斉に初めて答え、同時に正答率を取得する。
//   node scripts/check-stats-load.mjs [端末数=80] [1端末あたりの取得回数=3]
// 確認すること: 全員の解答がエラーなく通る／同じ問題への同時解答でも人数・正解数が1件もずれない／
//               問題ごとの合計（022）が初回解答の数え直しと全問で一致する／取得の応答時間。
// 終了時にこのテストの端末の記録だけを削除し、正答率が元の値に戻ることも確かめる。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const N=Number(process.argv[2] ?? 80),FETCHES=Number(process.argv[3] ?? 3);
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
async function sql(query,parameters=[]) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});
  if(!r.ok)throw new Error(`Fixture HTTP ${r.status}: ${await r.text()}`);return r.json();
}
async function rpc(fn,args) {const {data,error}=await sb.rpc(fn,args);if(error)throw new Error(`${fn}: ${error.message}`);return data;}
const timed=async(list,fn,args)=>{const t=performance.now();const data=await rpc(fn,args);list.push(performance.now()-t);return data;};
const summary=ms=>{const s=[...ms].sort((a,b)=>a-b),at=p=>s[Math.min(s.length-1,Math.floor(s.length*p))];return `${s.length}回 中央値${Math.round(at(.5))}ms・95%${Math.round(at(.95))}ms・最大${Math.round(s.at(-1))}ms`;};

const [q]=JSON.parse(readFileSync('public/questions.json','utf8')).slice(-1).map(x=>x.id);
const [{answer}]=await sql('select answer from public.questions where id=$1',[q]);
const devices=Array.from({length:N},()=>randomUUID()),sessions=[];
const rights=devices.map((_,i)=>i%3!==0); // 3人に2人が正解
const stat=async()=>(await rpc('get_question_stats',{}))[q] ?? {n:0,correct:0};
const hasTotals=(await sql("select to_regclass('public.question_stat_totals') is not null as ok"))[0].ok;
const drift=async()=>hasTotals?sql(`select coalesce(t.question_id,f.question_id) as id,t.n,t.correct,f.n as fn,f.correct as fc
  from public.question_stat_totals t full join (select question_id,count(*)::int as n,(count(*) filter(where correct))::int as correct from public.question_first_answers group by question_id) f
  on f.question_id=t.question_id where coalesce(t.n,0)<>coalesce(f.n,0) or coalesce(t.correct,0)<>coalesce(f.correct,0)`):[];
const startMs=[],answerMs=[],statsMs=[];
try {
  const base=await stat();
  assert.deepEqual(await drift(),[],'開始時点で合計と初回解答がずれている');
  // 全端末が同時に学習を始め、同じ問題へ一斉に解答する。その最中に全端末が正答率を取得する。
  const started=await Promise.all(devices.map(d=>timed(startMs,'start_solo',{p_device:d,p_mode:'study',p_ids:[q],p_seconds:60,p_difficulty:'easy'})));
  sessions.push(...started.map(s=>s.id));
  const t0=performance.now();
  await Promise.all([
    ...devices.map((d,i)=>timed(answerMs,'answer_solo',{p_session:started[i].id,p_device:d,p_q_index:0,p_choice:rights[i]?answer:(answer+1)%5,p_q_id:q})),
    ...devices.flatMap(()=>Array.from({length:FETCHES},()=>timed(statsMs,'get_question_stats',{}))),
  ]);
  const burst=performance.now()-t0;
  const after=await stat();
  assert.deepEqual(after,{n:base.n+N,correct:base.correct+rights.filter(Boolean).length},'同時解答で人数・正解数がずれた');
  assert.deepEqual(await drift(),[],'同時解答の後に合計と初回解答がずれた');
  console.log(`PASS ${N}端末が同じ問題へ同時に初回解答（${Math.round(burst)}ms）：人数 ${base.n}→${after.n}・正解 ${base.correct}→${after.correct}、${hasTotals?'全問の合計が数え直しと一致':'（022未適用：合計表なし）'}`);
  console.log(`  学習開始 ${summary(startMs)}`);
  console.log(`  解答     ${summary(answerMs)}`);
  console.log(`  正答率   ${summary(statsMs)}`);
} finally {
  await sql('delete from public.question_first_answers where device_id=any($1::uuid[])',[devices]);
  if(sessions.length)await sql('delete from public.solo_sessions where id=any($1::uuid[])',[sessions]);
  for (const table of ['study_attempts','study_answer_records','study_completions'])await sql(`delete from public.${table} where device_id=any($1::uuid[])`,[devices]);
  assert.deepEqual(await drift(),[],'後片付けの後に合計と初回解答がずれた');
  console.log('Cleaned only this check’s fixtures（合計も元に戻ったことを確認）');
}
