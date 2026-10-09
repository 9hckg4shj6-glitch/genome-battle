// AI対戦の発表欄をクライアントだけで確認（DBに触れない）。
//   - 正答の行（表示番号と選択肢）を一人学習と同じく出す
//   - AIの正解・時間切れより後に届いた解答を「タッチの差」として知らせ、押した選択肢を示す
// node scripts/check-ai-reveal-client.mjs
import assert from 'node:assert/strict';import {build} from 'esbuild';import {resolve} from 'node:path';
class MemoryStorage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
globalThis.localStorage=new MemoryStorage();globalThis.sessionStorage=new MemoryStorage();
globalThis.matchMedia=()=>({matches:true});localStorage.setItem('gb.sound','off');
const replies=[];
globalThis.studyFixtureCall=async()=>structuredClone(replies.shift());
const bundle=await build({stdin:{contents:"export {SoloController} from './solo';export {choiceOrder} from './choices';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'},plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const call=(fn,args)=>globalThis.studyFixtureCall(fn,args);export const serverNow=()=>Date.now();',loader:'js'}));}}]});
const ui=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const questions=new Map([['q1',{id:'q1',question:'問題1',field:'転写',choices:['選択A','選択B','選択C','選択D','選択E']}]]);
const question={id:'ai-session',mode:'ai',difficulty:'normal',q_index:0,q_total:15,q_id:'q1',choice_index:0,phase:'question',answer_seconds:20,phase_ends_at:new Date(Date.now()+20000).toISOString(),my_choice:null,my_score:0,ai_score:0,ai_mark:null,winner:null,reveal:null,version:1};
const reveal=(extra)=>({...question,phase:'reveal',phase_ends_at:null,version:2,reveal:{answer:2,explanation:'解説'},...extra});
const order=ui.choiceOrder('ai-session',0,'q1',5);
const shown=i=>order.indexOf(i)+1;
const lateButton=(html,i)=>new RegExp(`class="choice[^"]*\\blate\\b[^"]*" data-solo-choice="${i}"`).test(html);
const controller=async()=>{const c=new ui.SoloController('device',questions,()=>{},()=>'テスト',()=>{});replies.push(question);await c.start('ai',['q1'],20,'normal');return c;};

// 正答の行：AI対戦の発表にも、表示番号つきで出す。
let c=await controller();
c.state=reveal({winner:'ai',ai_score:1,ai_mark:'o'});
let html=c.render();
assert.match(html,new RegExp(`正答：${shown(2)}\\. 選択C`));
assert.match(html,/AIが先に正解/);assert.doesNotMatch(html,/タッチの差/);
console.log('PASS answer line: AI reveal shows the correct choice with its displayed number');

// AIの正解の後に届いた解答（正解を選んでいた）。
c=await controller();replies.push(reveal({winner:'ai',ai_score:1,ai_mark:'o'}));await c.act('answer',2);
html=c.render();
assert.match(html,/タッチの差でAIが先に正解/);
assert.match(html,new RegExp(`あなたの解答（${shown(2)}番）はAIの正解より後に届いたため、得点になりませんでした。選んだ答えは正解でした。`));
assert.ok(lateButton(html,2));assert.match(html,/<strong>タッチの差<\/strong>/);
console.log('PASS late tap: AI won first, tapped choice marked, told it was correct but late');

// AIの正解の後に届いた解答（不正解を選んでいた）。
c=await controller();replies.push(reveal({winner:'ai',ai_score:1,ai_mark:'o'}));await c.act('answer',4);
html=c.render();
assert.match(html,/選んだ答えは不正解でした。/);assert.ok(lateButton(html,4));assert.ok(!lateButton(html,2));
console.log('PASS late tap: wrong choice is reported as wrong');

// 制限時間の後に届いた解答。
c=await controller();replies.push(reveal({winner:null}));await c.act('answer',1);
html=c.render();
assert.match(html,/タッチの差で時間切れ/);assert.match(html,/制限時間より後に届いたため/);
console.log('PASS late tap: timeout reported as such');

// 解答が受け付けられた場合（先に正解・お手つき）はタッチの差を出さない。
c=await controller();replies.push(reveal({winner:'me',my_choice:2,my_score:1}));await c.act('answer',2);
html=c.render();assert.match(html,/あなたが先に正解/);assert.doesNotMatch(html,/タッチの差|late-note/);
c=await controller();replies.push({...question,my_choice:4,version:2});await c.act('answer',4);
assert.doesNotMatch(c.render(),/タッチの差/);
console.log('PASS accepted answers: no late notice for a first correct answer or a miss');

// 次の問題に進んだら表示を消す。
c=await controller();replies.push(reveal({winner:'ai',ai_score:1,ai_mark:'o'}));await c.act('answer',2);
replies.push({...question,q_index:1,version:3});await c.act('next');
html=c.render();assert.doesNotMatch(html,/タッチの差|\blate\b/);
console.log('PASS next question: late notice cleared');
