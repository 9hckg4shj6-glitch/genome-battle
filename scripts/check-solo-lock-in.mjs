// 一人学習・AI対戦で、押してから判定が返るまでの表示をクライアントだけで確認（DBに触れない）。
//   - 押した瞬間に押した選択肢だけ「確定」の見た目（mine + locked-in）になり、「判定中…」を出す
//   - 判定が返ったら確定表示を外し、通信に失敗したら選び直せる
// node scripts/check-solo-lock-in.mjs
import assert from 'node:assert/strict';import {build} from 'esbuild';import {resolve} from 'node:path';
class MemoryStorage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
globalThis.localStorage=new MemoryStorage();globalThis.sessionStorage=new MemoryStorage();
globalThis.matchMedia=()=>({matches:true});localStorage.setItem('gb.sound','off');
const replies=[];
globalThis.studyFixtureCall=async()=>{const r=replies.shift();return typeof r==='function'?r():structuredClone(r);};
const bundle=await build({stdin:{contents:"export {SoloController} from './solo';export {choiceOrder} from './choices';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'},plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const call=(fn,args)=>globalThis.studyFixtureCall(fn,args);export const serverNow=()=>Date.now();',loader:'js'}));}}]});
const ui=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const questions=new Map([['q1',{id:'q1',question:'問題1',field:'転写',choices:['選択A','選択B','選択C','選択D','選択E']}]]);
const question=mode=>({id:`${mode}-session`,mode,difficulty:'normal',q_index:0,q_total:15,q_id:'q1',choice_index:0,phase:'question',answer_seconds:20,phase_ends_at:mode==='ai'?new Date(Date.now()+20000).toISOString():null,my_choice:null,my_score:0,ai_score:0,ai_mark:null,winner:null,reveal:null,version:1});
const mineButton=(html,i)=>new RegExp(`class="choice[^"]*\\bmine\\b[^"]*" data-solo-choice="${i}"`).test(html);
const mines=html=>[...html.matchAll(/class="choice[^"]*\bmine\b/g)].length;
const deferred=()=>{let settle;const p=new Promise((ok,ng)=>settle={ok,ng});replies.push(()=>p);return settle;};
const controller=async mode=>{const c=new ui.SoloController('device',questions,()=>{},()=>'テスト',()=>{});replies.push(question(mode));await c.start(mode,['q1'],20,'normal');return c;};

for (const mode of ['study','ai']) {
  const shown=i=>ui.choiceOrder(`${mode}-session`,0,'q1',5).indexOf(i)+1;
  // 押した瞬間：押した選択肢だけ確定表示、判定中を知らせる。
  let c=await controller(mode);let settle=deferred();
  let pending=c.act('answer',3);let html=c.render();
  assert.match(html,/<ol class="choices locked-in" aria-busy="true" style="--since:/);
  assert.ok(mineButton(html,3));assert.equal(mines(html),1);
  assert.match(html,new RegExp(`role="status">${shown(3)}番で解答しました。判定中…`));
  assert.equal([...html.matchAll(/data-solo-choice="\d" disabled/g)].length,5);
  // 判定が返ったら確定表示と判定中は消える。
  settle.ok({...question(mode),phase:'reveal',phase_ends_at:null,my_choice:3,reveal:{answer:2,explanation:'解説'},version:2});await pending;
  html=c.render();assert.doesNotMatch(html,/locked-in|判定中/);assert.match(html,/class="choice[^"]*\bwrong\b/);
  console.log(`PASS ${mode}: tapped choice locks in immediately, cleared once judged`);

  // 通信に失敗したら選び直せる。
  c=await controller(mode);settle=deferred();pending=c.act('answer',1);
  assert.ok(mineButton(c.render(),1));
  settle.ng(new Error('network'));await pending;
  html=c.render();assert.doesNotMatch(html,/locked-in|判定中/);assert.equal(mines(html),0);
  assert.doesNotMatch(html,/data-solo-choice="\d" disabled/);assert.match(html,/通信できませんでした/);
  console.log(`PASS ${mode}: failed request releases the lock so the user can pick again`);
}
