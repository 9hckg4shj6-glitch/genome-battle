// 年度別の出題・閲覧（問題演習コーナの年度ボタン）の回帰確認（通信なし）。
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
class MemoryStorage {
  data=new Map();getItem(k){return this.data.get(k) ?? null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
globalThis.localStorage=new MemoryStorage();
// hub → theme が読み込み時に画面へ触れるため、最小限の document・window を置く。
globalThis.document={documentElement:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};globalThis.window={addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})};
const bundle=await build({stdin:{contents:"export * from './practice';export * from './years';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'},plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const call=async()=>null;export const serverNow=()=>Date.now();export const supabase={};',loader:'js'}));}}]});
const c=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const q=(id,year,no,field)=>[id,{id,year,no,field,question:id,choices:['a','b','c','d','e']}];
const qs=new Map([q('a',2025,1,'転写'),q('b',2025,2,'翻訳'),q('c',2024,1,'転写'),q('d',2024,2,'転写')]);
// 年度は新しい順。収録していない年度は「すべての年度」に戻す。
assert.deepEqual(c.yearsOf(qs),[2025,2024]);
assert.equal(c.validYear(qs,2024),2024);
assert.equal(c.validYear(qs,2019),0);
assert.equal(c.yearName(0),'すべての年度');
// 既定はすべての年度。選んだ年度は端末に保存し、件数・候補はその年度だけで数える。
assert.equal(c.practiceQuestions(qs).size,4);
c.setPracticeYear('2024');
assert.equal(localStorage.getItem('gb.study-year'),'2024');
assert.deepEqual([...c.practiceQuestions(qs).keys()],['c','d']);
const view={questions:qs,busy:false,error:'',count:10,distribution:'exam',order:'random',attempted:new Set(['c']),progressLoaded:true,progressError:false,mastery:{xp:0,xp_today:0,states:{d:'mastered'}}};
let html=c.renderPractice(view);
assert.match(html,/出題する年度/);
assert.match(html,/<label class="year-option on"><input type="radio" name="practice-year" value="2024" checked/);
assert.match(html,/<b>2024年度<\/b>・<b>すべての分野<\/b>・計<b>2<\/b>問から出題します。/);
assert.match(html,/全部（2問）/);
// 年度ボタンにはその年度の未着手・習得の数を添える。
assert.match(html,/value="2024"[\s\S]*?<small class="year-note">未着手 1 · 習得 1<\/small>/);
assert.match(html,/value="0"[\s\S]*?<b>4問<\/b> · 2024・2025を混ぜて/);
assert.match(c.renderPracticeEntry(qs),/2024年度 · すべての分野/);
// 不正な値・すべての年度に戻すと保存を消す。
c.setPracticeYear('bogus');
assert.equal(localStorage.getItem('gb.study-year'),null);
assert.equal(c.practiceQuestions(qs).size,4);
assert.match(c.renderPractice(view),/<b>すべての年度<\/b>・<b>すべての分野<\/b>・計<b>4<\/b>問/);
console.log('PASS years: order, fallback, saved practice year, year-scoped counts and summary, progress notes, entry label');
