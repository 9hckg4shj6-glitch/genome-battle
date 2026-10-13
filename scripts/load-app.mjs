// アプリ全体の同時利用の負荷テスト。端末ごとに別の接続（HTTP・Realtime）を持ち、実際の画面と同じ呼び出しを同じ間隔で行う。
//   node scripts/load-app.mjs [端末数=120] [秒数=180] [立ち上がりの秒数=20]
// 端末の内訳：学ぶ（一人学習）50%・AI対戦20%・対人のマッチング対戦30%。
//   起動：成績・学習レベル・未着手・保存した学習・みんなの正答率・フレンドを取得し、オンライン人数（Presence）に参加。
//   常時：30秒ごとに接続確認とフレンドの更新（アプリの定期処理と同じ）。
//   学ぶ：10問を「考える3〜8秒→解答（1割は回答を見る）→解説を読む2〜5秒→次へ」。終わると振り返り・レベル・成績・正答率を取得して次の10問。
//   AI対戦：解答を待つあいだ1秒ごとに状態を取得（アプリと同じ）、3〜10秒で解答、解説2〜4秒で次へ。終わると次の試合。
//   対人戦：マッチング・準備完了・Realtime 配信を購読し、問題の終了時刻や待機中は tick。終わると振り返り・成績を取得して次の試合。
// Presence は本番の「presence:app」ではなく試験用のチャンネルに入る（利用者のオンライン人数を水増ししない。上限はプロジェクト全体で共通）。
// 確認すること：呼び出しの失敗・応答時間、Realtime の接続・配信、試合が最後まで進むか、DB接続数。終了時にこのテストの記録だけを消す。
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const N=Number(process.argv[2] ?? 120),DURATION=Number(process.argv[3] ?? 180)*1000,RAMP=Number(process.argv[4] ?? 20)*1000;
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
async function sql(query,parameters=[]) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});
  if(!r.ok)throw new Error(`SQL HTTP ${r.status}: ${await r.text()}`);return r.json();
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const between=(a,b)=>a+Math.random()*(b-a);
const ids=JSON.parse(readFileSync('public/questions.json','utf8')).map(q=>q.id);
const answers=new Map((await sql('select id,answer from public.questions')).map(r=>[r.id,r.answer]));

// ---------- 計測 ----------
const calls=new Map();               // 関数名 → {ms:[], errors:Map(メッセージ→件数)}
const realtime={presenceJoined:0,presenceFailed:new Map(),presenceMax:0,battleJoined:0,battleFailed:new Map(),broadcasts:0};
const flow={studySessions:0,studyAnswers:0,aiMatches:0,aiAnswers:0,humanMatches:0,humanFinished:0,humanStuck:0,humanAnswers:0};
const samples=[];
const bump=(map,key)=>map.set(key,(map.get(key)??0)+1);
const t0=Date.now();const until=()=>Date.now()-t0<DURATION;

function device(i) {
  const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false},realtime:{params:{eventsPerSecond:10}}});
  const id=randomUUID();
  const rpc=async(fn,args,{quiet=false}={})=>{
    const c=calls.get(fn) ?? {ms:[],errors:new Map()};calls.set(fn,c);
    const t=performance.now();
    try {
      const {data,error}=await sb.rpc(fn,args);
      if(error)throw new Error(error.message);
      c.ms.push(performance.now()-t);return data;
    } catch(e) {
      c.ms.push(performance.now()-t);
      const msg=String(e instanceof Error ? e.message : e).slice(0,80);
      if(!quiet)bump(c.errors,msg);
      throw e;
    }
  };
  return {i,id,sb,rpc,name:`load${i}`};
}
const devices=Array.from({length:N},(_,i)=>device(i));
const roleOf=i=>i%10<5?'study':i%10<7?'ai':'human';

async function boot(d) {
  await Promise.allSettled([
    d.rpc('get_performance',{p_device:d.id}),d.rpc('get_mastery',{p_device:d.id,p_session:null}),
    d.rpc('get_study_progress',{p_device:d.id}),d.rpc('list_saved_studies',{p_device:d.id}),
    d.rpc('get_question_stats',{}),d.rpc('friend_sync',{p_device:d.id,p_name:d.name}),
  ]);
  const ch=d.sb.channel('presence:load-test',{config:{presence:{key:d.id}}});
  ch.on('presence',{event:'sync'},()=>{realtime.presenceMax=Math.max(realtime.presenceMax,Object.keys(ch.presenceState()).length);})
    .subscribe((status,err)=>{
      if(status==='SUBSCRIBED'){realtime.presenceJoined++;void ch.track({at:Date.now()});}
      else if(status!=='CLOSED')bump(realtime.presenceFailed,`${status}${err?`: ${String(err.message??err).slice(0,60)}`:''}`);
    });
}
// アプリの250msループのうち、画面を開いている間ずっと続く分（接続確認・フレンド）。
async function background(d) {
  await sleep(between(0,30000));
  while(until()) {
    await Promise.allSettled([d.rpc('connection_ping',{}),d.rpc('friend_sync',{p_device:d.id,p_name:d.name})]);
    await sleep(30000);
  }
}
let statsAt=new Map();
async function afterSession(d,extra) {
  const jobs=[...extra,d.rpc('get_performance',{p_device:d.id})];
  if(Date.now()-(statsAt.get(d.id)??0)>60000){statsAt.set(d.id,Date.now());jobs.push(d.rpc('get_question_stats',{}));}
  await Promise.allSettled(jobs);
}

async function study(d) {
  while(until()) {
    let s=await d.rpc('start_solo',{p_device:d.id,p_mode:'study',p_ids:ids,p_seconds:20,p_difficulty:'normal',p_order:'random',p_count:10});
    flow.studySessions++;
    while(s.phase!=='finished' && until()) {
      await sleep(between(3000,8000));
      if(Math.random()<.1)s=await d.rpc('view_solo_answer',{p_session:s.id,p_device:d.id,p_q_index:s.q_index,p_q_id:s.q_id,p_version:s.version});
      else s=await d.rpc('answer_solo',{p_session:s.id,p_device:d.id,p_q_index:s.q_index,p_choice:Math.random()<.7?answers.get(s.q_id):(answers.get(s.q_id)+1)%5,p_q_id:s.q_id});
      flow.studyAnswers++;
      await sleep(between(2000,5000));
      s=await d.rpc('next_solo',{p_session:s.id,p_device:d.id,p_q_index:s.q_index});
    }
    if(s.phase==='finished')await afterSession(d,[d.rpc('review_solo',{p_session:s.id,p_device:d.id}),d.rpc('get_mastery',{p_device:d.id,p_session:s.id}),d.rpc('get_study_progress',{p_device:d.id})]);
  }
}

async function ai(d) {
  while(until()) {
    const pick=[...ids].sort(()=>Math.random()-.5).slice(0,15);
    let s=await d.rpc('start_solo',{p_device:d.id,p_mode:'ai',p_ids:pick,p_seconds:20,p_difficulty:['easy','normal','hard'][d.i%3]});
    flow.aiMatches++;
    while(s.phase!=='finished' && until()) {
      const think=Date.now()+between(3000,10000);
      while(s.phase==='question' && s.my_choice===null && Date.now()<think){await sleep(1000);s=await d.rpc('get_solo',{p_session:s.id,p_device:d.id});}
      if(s.phase==='question' && s.my_choice===null){
        s=await d.rpc('answer_solo',{p_session:s.id,p_device:d.id,p_q_index:s.q_index,p_choice:Math.random()<.6?answers.get(s.q_id):(answers.get(s.q_id)+1)%5,p_q_id:s.q_id});flow.aiAnswers++;
      }
      while(s.phase==='question'){await sleep(1000);s=await d.rpc('get_solo',{p_session:s.id,p_device:d.id});}
      if(s.phase==='reveal'){await sleep(between(2000,4000));s=await d.rpc('next_solo',{p_session:s.id,p_device:d.id,p_q_index:s.q_index});}
    }
    if(s.phase==='finished')await afterSession(d,[d.rpc('review_solo',{p_session:s.id,p_device:d.id})]);
  }
}

async function human(d) {
  while(until()) {
    let s=await d.rpc('find_match',{p_device:d.id,p_name:d.name,p_capacity:null,p_seconds:20});
    s=await d.rpc('set_ready',{p_match:s.id,p_device:d.id,p_ready:true});
    flow.humanMatches++;
    let live=false,lastTick=Date.now();
    const apply=n=>{if(n && n.id===s.id && n.version>=s.version)s={...n,my_seat:n.my_seat ?? s.my_seat};};
    const ch=d.sb.channel(`battle:${s.id}`).on('broadcast',{event:'state'},m=>{realtime.broadcasts++;apply(m.payload);})
      .subscribe((status,err)=>{
        live=status==='SUBSCRIBED';
        if(live)realtime.battleJoined++;else if(status!=='CLOSED')bump(realtime.battleFailed,`${status}${err?`: ${String(err.message??err).slice(0,60)}`:''}`);
      });
    const answered=new Set(),started=Date.now();
    // 試合が終わるまで続ける（試験時間を過ぎても途中の試合は最後まで進める。最長5分）。
    while(s.status!=='finished' && Date.now()-started<5*60_000) {
      await sleep(250);
      const since=Date.now()-lastTick;
      const overdue=s.phase_ends_at && Date.now()>=Date.parse(s.phase_ends_at)+between(0,600);
      if(s.status==='playing' && s.phase==='question' && !answered.has(s.q_index) && Math.random()<.05){
        answered.add(s.q_index);flow.humanAnswers++;
        apply(await d.rpc('submit_answer',{p_match:s.id,p_device:d.id,p_q_index:s.q_index,p_choice:Math.random()<.6?answers.get(s.q_id):(answers.get(s.q_id)+1)%5},{quiet:true}).catch(()=>null));
      } else if((overdue && since>1000) || (s.status==='waiting' && since>2000) || (!live && since>1500)) {
        lastTick=Date.now();apply(await d.rpc('tick',{p_match:s.id,p_device:d.id}).catch(()=>null));
      }
      if(!until() && s.status==='waiting'){await d.rpc('leave_match',{p_match:s.id,p_device:d.id}).catch(()=>null);break;}
    }
    if(s.status==='finished'){flow.humanFinished++;await afterSession(d,[d.rpc('get_review',{p_match:s.id,p_device:d.id})]);}
    else if(s.status==='playing')flow.humanStuck++;
    await d.sb.removeChannel(ch);
  }
}

async function run(d) {
  await sleep(RAMP*d.i/N);
  try {await boot(d);} catch { /* 失敗は計測済み */ }
  const role=roleOf(d.i);
  void background(d);
  while(until()) {
    try {await (role==='study'?study(d):role==='ai'?ai(d):human(d));}
    catch {await sleep(2000);} // 失敗は計測済み。アプリと同じく少し待ってやり直す
  }
}

const sampler=(async()=>{
  while(until()) {
    try {
      const [r]=await sql("select count(*)::int as total,count(*) filter(where state='active')::int as active,count(*) filter(where usename='authenticator')::int as api from pg_stat_activity");
      samples.push({t:Math.round((Date.now()-t0)/1000),...r});
    } catch { /* 計測できなくても続ける */ }
    await sleep(10000);
  }
})();

console.log(`開始：${N}端末（学ぶ${devices.filter(d=>roleOf(d.i)==='study').length}・AI対戦${devices.filter(d=>roleOf(d.i)==='ai').length}・対人戦${devices.filter(d=>roleOf(d.i)==='human').length}）、${DURATION/1000}秒、${RAMP/1000}秒かけて起動`);
const progress=setInterval(()=>{
  const all=[...calls.values()],n=all.reduce((a,c)=>a+c.ms.length,0),e=all.reduce((a,c)=>a+[...c.errors.values()].reduce((x,y)=>x+y,0),0);
  console.log(`  ${Math.round((Date.now()-t0)/1000)}秒：呼び出し${n}回・失敗${e}回・Presence ${realtime.presenceJoined}/${N}・配信受信${realtime.broadcasts}・DB接続${samples.at(-1)?.total ?? '?'}`);
},15000);
await Promise.all(devices.map(run));
clearInterval(progress);await sampler;
const elapsed=(Date.now()-t0)/1000;

// ---------- 結果 ----------
const pct=(ms,p)=>{const s=[...ms].sort((a,b)=>a-b);return Math.round(s[Math.min(s.length-1,Math.floor(s.length*p))] ?? 0);};
const rows=[...calls].sort((a,b)=>b[1].ms.length-a[1].ms.length).map(([fn,c])=>{
  const errors=[...c.errors.values()].reduce((a,b)=>a+b,0);
  return {fn,calls:c.ms.length,errors,p50:pct(c.ms,.5),p95:pct(c.ms,.95),p99:pct(c.ms,.99),max:pct(c.ms,1)};
});
const total=rows.reduce((a,r)=>a+r.calls,0),errors=rows.reduce((a,r)=>a+r.errors,0);
const allMs=[...calls.values()].flatMap(c=>c.ms);
console.log(`\n===== 結果（${Math.round(elapsed)}秒）=====`);
console.log(`呼び出し ${total}回（平均 ${(total/elapsed).toFixed(1)}回/秒）・失敗 ${errors}回（${(100*errors/Math.max(1,total)).toFixed(2)}%）・全体 中央値${pct(allMs,.5)}ms・95%${pct(allMs,.95)}ms・99%${pct(allMs,.99)}ms`);
console.table(rows);
for (const [fn,c] of calls) for (const [msg,n] of c.errors) console.log(`  失敗 ${fn}: ${msg} ×${n}`);
console.log(`Realtime：Presence 参加 ${realtime.presenceJoined}/${N}（同時に見えた最大 ${realtime.presenceMax}人）・対戦チャンネル参加 ${realtime.battleJoined}・配信受信 ${realtime.broadcasts}`);
for (const [msg,n] of realtime.presenceFailed) console.log(`  Presence 失敗: ${msg} ×${n}`);
for (const [msg,n] of realtime.battleFailed) console.log(`  対戦チャンネル失敗: ${msg} ×${n}`);
console.log(`進行：学ぶ ${flow.studySessions}回開始・${flow.studyAnswers}問解答／AI対戦 ${flow.aiMatches}試合・${flow.aiAnswers}問解答／対人戦 ${flow.humanMatches}回参加・決着 ${flow.humanFinished}・途中で止まった ${flow.humanStuck}・${flow.humanAnswers}問解答`);
console.log(`DB接続（10秒ごと）：最大 ${Math.max(...samples.map(s=>s.total))}（APIからの接続 最大${Math.max(...samples.map(s=>s.api))}・実行中 最大${Math.max(...samples.map(s=>s.active))}）／上限 ${(await sql("select current_setting('max_connections') as m"))[0].m}`);

// ---------- 後片付け：このテストの端末の記録だけ ----------
await Promise.allSettled(devices.map(d=>d.sb.removeAllChannels()));
const list=devices.map(d=>d.id);
await sql('delete from public.question_first_answers where device_id=any($1::uuid[])',[list]);
// 利用者と同じ試合に入った場合、その試合は利用者の記録なので消さない（件数だけ報告する）。
const [{mixed}]=await sql('select count(distinct match_id)::int as mixed from public.players p where p.match_id in (select match_id from public.players where device_id=any($1::uuid[])) and not p.device_id=any($1::uuid[])',[list]);
await sql('delete from public.matches m where m.id in (select match_id from public.players where device_id=any($1::uuid[])) and not exists(select 1 from public.players p where p.match_id=m.id and not p.device_id=any($1::uuid[]))',[list]);
for (const table of ['solo_sessions','study_attempts','study_answer_records','study_completions','friend_profiles','device_transfers'])
  await sql(`delete from public.${table} where device_id=any($1::uuid[])`,[list]);
const [left]=await sql(`select (select count(*) from public.players where device_id=any($1::uuid[]))::int as players,(select count(*) from public.solo_sessions where device_id=any($1::uuid[]))::int as solo,
  (select count(*) from public.question_first_answers where device_id=any($1::uuid[]))::int as stats,
  (select count(*) from public.question_stat_totals t where t.n<>(select count(*) from public.question_first_answers f where f.question_id=t.question_id))::int as drift`,[list]);
console.log(`後片付け：利用者と同じになった試合 ${mixed}（残す）・残った記録 対戦${left.players}・学習${left.solo}・正答率${left.stats}、正答率の合計のずれ ${left.drift}問`);
process.exit(0);
