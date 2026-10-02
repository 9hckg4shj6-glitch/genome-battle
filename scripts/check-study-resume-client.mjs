// 実際のコントローラーで通信失敗・タブを開き直した再開・進行中の操作を検証。
import assert from 'node:assert/strict';import {build} from 'esbuild';import {resolve} from 'node:path';
class MemoryStorage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
globalThis.localStorage=new MemoryStorage();globalThis.sessionStorage=new MemoryStorage();
const replies=[];const calls=[];
globalThis.studyFixtureCall=async(fn,args)=>{calls.push({fn,args});const next=replies.shift();if(next instanceof Error)throw next;return typeof next==='function'?await next():structuredClone(next);};
const bundle=await build({stdin:{contents:"export {SoloController} from './solo';export {renderSavedStudies} from './study-resume';export {notebook} from './ui';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'},plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const call=(fn,args)=>globalThis.studyFixtureCall(fn,args);export const serverNow=()=>Date.now();',loader:'js'}));}}]});
const ui=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const questions=new Map([['q1',{id:'q1',question:'問題1',field:'転写',choices:['a','b','c','d','e']}],['q2',{id:'q2',question:'問題2',field:'転写',choices:['a','b','c','d','e']}]]);
const state={id:'session',mode:'study',difficulty:'normal',q_index:0,q_total:2,q_id:'q2',choice_index:1,phase:'question',answer_seconds:20,phase_ends_at:null,my_choice:null,my_score:0,ai_score:0,ai_mark:null,winner:null,reveal:null,version:1,can_defer:true,deferred_count:1,answer_viewed:false};
const controller=()=>new ui.SoloController('device',questions,()=>{},()=>'',()=>{});
let c=controller();replies.push(state);await c.start('study',['q1','q2'],20,'normal',true);assert.equal(c.course,true);
// 保存失敗時に現在の問題と再読込用の情報を維持する。
replies.push(new Error('Failed to fetch'));assert.equal(await c.pause(),false);assert.equal(c.active,true);assert.equal(c.busy,false);assert.equal(sessionStorage.getItem('gb.solo'),'session');assert.match(c.error,/通信/);
let release;replies.push(()=>new Promise(r=>{release=r;}));const saving=c.pause();assert.equal(c.busy,true);assert.match(c.render(),/data-act="study-pause" disabled/);assert.equal(await c.pause(),false);release({...state,version:2});assert.equal(await saving,true);assert.equal(c.active,false);assert.equal(sessionStorage.getItem('gb.solo'),null);
// 新しいタブ相当の空のsessionStorageでも、保存したセッションを選んで再開できる。
globalThis.sessionStorage=new MemoryStorage();c=controller();replies.push({...state,version:2});assert.equal(await c.resumeSaved('session'),true);assert.equal(c.course,true);assert.equal(c.state.choice_index,1);assert.equal(c.state.deferred_count,1);assert.equal(sessionStorage.getItem('gb.solo'),'session');
const viewed={...state,phase:'reveal',version:3,answer_viewed:true,reveal:{answer:2,explanation:'解説'}};replies.push(viewed);await c.act('view-answer');assert.match(c.render(),/回答を確認しよう/);assert.equal(ui.notebook().missed.q2.misses,1);
replies.push({...viewed,version:4});await c.pause();c=controller();replies.push({...viewed,version:4});await c.resumeSaved('session');assert.equal(ui.notebook().missed.q2.misses,1);assert.equal(c.state.answer_viewed,true);assert.match(c.render(),/正答：/);
// 再読込中の一時的な通信失敗で再開IDを消さない。
c=controller();replies.push(new Error('Failed to fetch'));await c.resume();assert.equal(sessionStorage.getItem('gb.solo'),'session');
replies.push(new Error('SOLO_NOT_FOUND'));await c.resume();assert.equal(sessionStorage.getItem('gb.solo'),null);
// 遅れて返った再開応答で、終了した画面を復活させない。
c=controller();replies.push(()=>new Promise(r=>{release=r;}));const pending=c.resumeSaved('session');c.stop();release(state);assert.equal(await pending,false);assert.equal(c.active,false);
const html=ui.renderSavedStudies([{id:'session',field:'<転写>',q_total:2,answered:2,phase:'reveal',updated_at:''}],false,false);
assert.match(html,/&lt;転写&gt;/);assert.match(html,/残り0問 · 解説から再開/);assert.match(html,/続きから再開/);assert.equal(ui.renderSavedStudies([],false,false),'');assert.match(ui.renderSavedStudies([],false,true),/再取得する/);
console.log('PASS client: save failure retains state, busy duplicate blocked, new-tab resume, review mode/order/deferred/reveal restored, notebook not duplicated, reload failure preserves ID, stale responses ignored, saved-card rendering');
