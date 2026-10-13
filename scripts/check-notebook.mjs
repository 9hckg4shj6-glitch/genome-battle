// 復習ノートの日単位の回し方（今日の復習・日をあけた2回の正解で外す）と、ノートからの演習の問題の選び方の回帰確認（通信なし）。
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
class MemoryStorage {
  data=new Map();getItem(k){return this.data.get(k) ?? null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
globalThis.localStorage=new MemoryStorage();
const bundle=await build({stdin:{contents:"export * from './ui';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'}});
const ui=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const wrong={id:'q1',answer:1,my_choice:2,explanation:'e'};
const right={...wrong,my_choice:1};
// 日付は日本時間で区切る。1日目 23:30 JST と 2日目 0:30 JST は別の日。
const DAY1=Date.parse('2026-10-13T10:00:00+09:00'),LATE1=Date.parse('2026-10-13T23:30:00+09:00'),DAY2=Date.parse('2026-10-14T00:30:00+09:00'),DAY3=Date.parse('2026-10-15T09:00:00+09:00');
const realNow=Date.now;const at=(t)=>{Date.now=()=>t;};
at(DAY1);assert.equal(ui.studyDay(),'2026-10-13');at(DAY2);assert.equal(ui.studyDay(),'2026-10-14');

// 誤答：間違えた当日の正解で今日の分は完了（復習待ちから外れる）、翌日以降の正解で外れる。同じ日の2回目は数えない。
at(DAY1);ui.recordMiss('s1:0',wrong);
assert.equal(ui.waitingReview(),1);
ui.recordCorrect('s1:0','q1');assert.equal(ui.notebook().missed.q1.streak,undefined,'誤答と同じ解答では数えない');
ui.recordCorrect('s2:3','q1');assert.equal(ui.notebook().missed.q1.streak,1);
assert.equal(ui.waitingReview(),0,'今日正解した問題は今日の復習から外す');
assert.match(ui.noteFeedback('s2:3','q1'),/今日の分は完了/);assert.match(ui.noteFeedback('s2:3','q1'),/role="status"/);
ui.recordCorrect('s2:3','q1');assert.equal(ui.notebook().missed.q1.streak,1,'再配信・再読み込みで二重に数えない');
at(LATE1);ui.recordCorrect('s3:1','q1');assert.ok(ui.notebook().missed.q1,'同じ日の2回目では外さない');
assert.match(ui.noteFeedback('s3:1','q1'),/今日はすでに正解/);
at(DAY2);assert.equal(ui.waitingReview(),1,'翌日はまた今日の復習に入る');
ui.recordCorrect('s4:0','q1');assert.ok(!ui.notebook().missed.q1);
assert.match(ui.noteFeedback('s4:0','q1'),/日をあけて2回正解/);
assert.equal(ui.waitingReview(),0);

// 途中で間違えると数え直し。間違えた回数は残る。
at(DAY2);ui.recordMiss('s5:0',wrong);ui.recordCorrect('s6:0','q1');
at(DAY3);ui.recordMiss('s7:0',wrong);
assert.equal(ui.notebook().missed.q1.streak,undefined);assert.equal(ui.notebook().missed.q1.misses,2);assert.equal(ui.waitingReview(),1);
ui.recordCorrect('s8:0','q1');assert.ok(ui.notebook().missed.q1);
at(DAY3+86400e3);ui.recordCorrect('s9:0','q1');assert.ok(!ui.notebook().missed.q1);

// 迷った：記録した日は外さず（今日の復習にも入れない）、翌日以降の正解で外す。その解説で記録し直せば残り、知らせも消える。
at(DAY1);ui.toggleUncertain(right,'t1:0');
assert.equal(ui.waitingReview(),0,'迷ったを記録した日は今日の復習に入れない');
ui.recordCorrect('t1:0','q1');assert.ok(ui.notebook().uncertain.q1);
ui.recordCorrect('t1b:0','q1');assert.ok(ui.notebook().uncertain.q1,'記録した日の別の正解では外さない');
assert.match(ui.noteFeedback('t1b:0','q1'),/明日以降に正解すると外れます/);
at(DAY2);assert.equal(ui.waitingReview(),1);
ui.recordCorrect('t2:0','q1');assert.ok(!ui.notebook().uncertain.q1);
assert.match(ui.noteFeedback('t2:0','q1'),/迷った問題」から外しました/);
ui.toggleUncertain(right,'t2:0');
ui.recordCorrect('t2:0','q1');assert.ok(ui.notebook().uncertain.q1,'記録し直した迷ったは同じ解答で外さない');
assert.equal(ui.noteFeedback('t2:0','q1'),'');
// 以前の版の迷った記録（キー・日付なし）は、次の正解で外れる。保存した問題は変わらない。
ui.toggleUncertain(right);ui.toggleSaved(right);
const legacy=ui.notebook();legacy.uncertain.q1={...right,at:1,misses:0,key:''};localStorage.setItem('gb.notebook',JSON.stringify(legacy));
ui.recordCorrect('t3:0','q1');assert.ok(!ui.notebook().uncertain.q1);assert.ok(ui.notebook().saved.q1);
// ノートに無い問題の正解は何も変えない。
const before=localStorage.getItem('gb.notebook');ui.recordCorrect('t4:0','q9');assert.equal(localStorage.getItem('gb.notebook'),before);assert.equal(ui.noteFeedback('t4:0','q9'),'');
Date.now=realNow;

// ノートからの演習：既定は10問・ランダム。優先順は間違えた回数が多い順→記録が古い順。
const notes=Array.from({length:25},(_,i)=>({id:`n${i}`,answer:0,my_choice:1,explanation:'',at:1000-i,misses:i%5,key:''}));
assert.equal(ui.noteCount(),'10');assert.equal(ui.noteOrder(),'random');
const random=ui.pickNotes(notes);assert.equal(random.length,10);assert.equal(new Set(random).size,10);
assert.ok(ui.setNoteOrder('priority'));assert.ok(!ui.setNoteOrder('bad'));
const top=ui.pickNotes(notes);assert.deepEqual(top.slice(0,5),['n24','n19','n14','n9','n4']);
// 今日正解済みの問題は後回し（今日の復習を先に出す）。
const today=ui.studyDay();const mixed=notes.map((r,i)=>i>=15?{...r,okDay:today}:r);
assert.ok(ui.pickNotes(mixed,'10','priority').every(id=>Number(id.slice(1))<15));
assert.ok(ui.pickNotes(mixed,'10','random').every(id=>Number(id.slice(1))<15));
assert.ok(ui.setNoteCount('20'));assert.equal(ui.pickNotes(notes).length,20);
assert.equal(ui.noteTake(12),12);assert.equal(ui.noteTake(30),20);
assert.ok(ui.setNoteCount('all'));assert.equal(ui.pickNotes(notes).length,25);
assert.ok(!ui.setNoteCount('5'));assert.equal(ui.noteCount(),'all');

console.log('PASS notebook: 日をあけた2回の正解で誤答から外す・今日の復習の数え方・再配信と数え直し・迷ったの解除と記録し直し・今日の分を先に出す演習');
