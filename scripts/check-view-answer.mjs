// Own UUIDs only: answer viewing must not award points or leak answers across stale actions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {join} from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
async function sql(query,parameters=[]){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});if(!r.ok)throw new Error(`Fixture HTTP ${r.status}`);return r.json();}
async function rpc(fn,args){const {data,error}=await sb.rpc(fn,args);if(error)throw new Error(`${fn}: ${error.message}`);return data;}
const device=randomUUID(),outsider=randomUUID(),solos=[];
const ids=JSON.parse(readFileSync('public/questions.json')).slice(0,3).map(q=>q.id);
const expected=new Map((await sql('select id,answer,explanation from questions where id=any($1::text[])',[ids])).map(q=>[q.id,q]));
const base=s=>({p_session:s.id,p_device:device});
const view=s=>rpc('view_solo_answer',{...base(s),p_q_index:s.q_index,p_q_id:s.q_id,p_version:s.version});
const answer=s=>rpc('answer_solo',{...base(s),p_q_index:s.q_index,p_q_id:s.q_id,p_choice:expected.get(s.q_id).answer});
const next=s=>rpc('next_solo',{...base(s),p_q_index:s.q_index});
const defer=s=>rpc('defer_solo',{...base(s),p_q_index:s.q_index,p_q_id:s.q_id,p_version:s.version});
const get=s=>rpc('get_solo',base(s));
async function start(qids=ids,mode='study'){const s=await rpc('start_solo',{p_device:device,p_mode:mode,p_ids:qids,p_seconds:120});solos.push(s.id);return s;}
try {
 let s=await start();const initial=s;assert.equal(s.reveal,null);assert.equal(s.answer_viewed,false);
 await assert.rejects(()=>rpc('view_solo_answer',{...base(s),p_device:outsider,p_q_index:s.q_index,p_q_id:s.q_id,p_version:s.version}),/SOLO_NOT_FOUND/);
 for(const bad of [{p_q_id:ids[1]},{p_q_index:1},{p_version:99},{p_version:null}]){const stale=await rpc('view_solo_answer',{...base(s),p_q_index:s.q_index,p_q_id:s.q_id,p_version:s.version,...bad});assert.equal(stale.reveal,null);assert.equal(stale.version,0);}
 const dup=await Promise.all([view(s),view(s)]);s=dup[0];assert.ok(dup.every(r=>r.version===1));assert.equal(s.phase,'reveal');assert.equal(s.my_choice,null);assert.equal(s.my_score,0);assert.equal(s.winner,null);assert.equal(s.answer_viewed,true);assert.equal(s.can_defer,false);assert.deepEqual(s.reveal,{answer:expected.get(s.q_id).answer,explanation:expected.get(s.q_id).explanation});
 assert.equal((await answer(initial)).my_score,0);assert.equal((await defer(initial)).q_id,initial.q_id);assert.equal((await get(s)).answer_viewed,true);assert.ok((await rpc('get_study_progress',{p_device:device})).attempted_ids.includes(ids[0]));
 s=await next(s);assert.equal(s.q_id,ids[1]);assert.equal(s.answer_viewed,false);assert.equal(s.reveal,null);assert.equal((await view(initial)).reveal,null);
 s=await answer(s);assert.equal(s.my_score,1);assert.equal(s.answer_viewed,false);s=await next(s);s=await next(await view(s));assert.equal(s.phase,'finished');assert.equal(s.my_score,1);
 const review=await rpc('review_solo',base(s));assert.deepEqual(review.map(r=>r.answer_viewed),[true,false,true]);assert.deepEqual(review.map(r=>r.my_choice),[null,expected.get(ids[1]).answer,null]);assert.deepEqual(review.map(r=>r.choice_index),[0,1,2]);assert.equal((await view(s)).phase,'finished');assert.deepEqual((await rpc('get_performance',{p_device:device})).study,{sessions:1,answered:3,correct:1,viewed:2});
 const one=await start([ids[0]]);assert.equal(one.can_defer,false);assert.equal((await next(await view(one))).phase,'finished');
 let rotated=await start(ids.slice(0,2));const old=rotated;rotated=await defer(rotated);assert.equal((await view(old)).reveal,null);rotated=await next(await answer(rotated));assert.equal(rotated.is_deferred,true);rotated=await view(rotated);assert.equal(rotated.deferred_count,0);assert.equal(rotated.my_score,1);
 const ai=await start(ids,'ai');await assert.rejects(()=>view(ai),/STUDY_ONLY/);assert.equal((await get(ai)).reveal,null);
 let race=await start(ids.slice(0,2));await Promise.all([view(race),answer(race)]);race=await get(race);assert.equal(race.phase,'reveal');assert.ok(race.answer_viewed?race.my_score===0&&race.my_choice===null:race.my_score===1&&race.my_choice===expected.get(race.q_id).answer);
 race=await start(ids.slice(0,2));await Promise.all([view(race),defer(race)]);race=await get(race);assert.ok(race.phase==='reveal'?race.q_id===ids[0]&&race.answer_viewed:race.q_id===ids[1]&&race.reveal===null);
 const direct=await sb.from('solo_sessions').select('*').eq('device_id',device);assert.ok(direct.error||direct.data.length===0);assert.ok((await sb.rpc('_solo_state',{p_session:initial.id})).error);
 console.log('PASS answer viewing: correct answer/explanation immediately, no score/fake choice, reload, progress/notebook history, next/reset/completion, single question, owner/study only, duplicates/stale actions/defer/answer races, RLS');
} finally {
 if(solos.length)await sql('delete from solo_sessions where id=any($1::uuid[])',[solos]);await sql('delete from study_attempts where device_id=$1::uuid',[device]);await sql('delete from study_answer_records where device_id=$1::uuid',[device]);await sql('delete from study_completions where device_id=$1::uuid',[device]);await sb.removeAllChannels();console.log('Cleaned only this check’s fixtures');
}
