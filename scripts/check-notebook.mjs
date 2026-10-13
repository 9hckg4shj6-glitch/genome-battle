// 復習ノートの自動で外れるしくみと、ノートからの演習の問題の選び方の回帰確認（通信なし）。
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

// 誤答：2回続けて正解で外れる。同じ解答の再配信は数えない。
ui.recordMiss('s1:0',wrong);
assert.equal(ui.waitingReview(),1);
ui.recordCorrect('s1:0','q1');assert.equal(ui.notebook().missed.q1.streak,undefined,'誤答と同じ解答では数えない');
ui.recordCorrect('s2:3','q1');assert.equal(ui.notebook().missed.q1.streak,1);
assert.match(ui.noteFeedback('s2:3','q1'),/あと1回/);
ui.recordCorrect('s2:3','q1');assert.equal(ui.notebook().missed.q1.streak,1,'再配信・再読み込みで二重に数えない');
ui.recordCorrect('s3:1','q1');assert.ok(!ui.notebook().missed.q1);
assert.match(ui.noteFeedback('s3:1','q1'),/外しました/);
assert.equal(ui.waitingReview(),0);

// 途中で間違えると数え直し。間違えた回数は残る。
ui.recordMiss('s4:0',wrong);ui.recordCorrect('s5:0','q1');ui.recordMiss('s6:0',wrong);
assert.equal(ui.notebook().missed.q1.streak,undefined);assert.equal(ui.notebook().missed.q1.misses,2);
ui.recordCorrect('s7:0','q1');assert.ok(ui.notebook().missed.q1);
ui.recordCorrect('s8:0','q1');assert.ok(!ui.notebook().missed.q1);

// 迷った：記録した解答の再配信では外さず、別の解答で正解したら外す。その解説で記録し直せば残り、知らせも消える。
ui.toggleUncertain(right,'t1:0');
ui.recordCorrect('t1:0','q1');assert.ok(ui.notebook().uncertain.q1);
ui.recordCorrect('t2:0','q1');assert.ok(!ui.notebook().uncertain.q1);
assert.match(ui.noteFeedback('t2:0','q1'),/迷った問題」から外しました/);
ui.toggleUncertain(right,'t2:0');
ui.recordCorrect('t2:0','q1');assert.ok(ui.notebook().uncertain.q1,'記録し直した迷ったは同じ解答で外さない');
assert.equal(ui.noteFeedback('t2:0','q1'),'');
// 以前の版の迷った記録（キーなし）は、次の正解で外れる。保存した問題は変わらない。
ui.toggleSaved(right);ui.toggleUncertain(right);ui.toggleUncertain(right);
ui.recordCorrect('t3:0','q1');assert.ok(!ui.notebook().uncertain.q1);assert.ok(ui.notebook().saved.q1);
// ノートに無い問題の正解は何も変えない。
const before=localStorage.getItem('gb.notebook');ui.recordCorrect('t4:0','q9');assert.equal(localStorage.getItem('gb.notebook'),before);assert.equal(ui.noteFeedback('t4:0','q9'),'');

// ノートからの演習：既定は10問・ランダム。優先順は間違えた回数が多い順→記録が古い順。
const notes=Array.from({length:25},(_,i)=>({id:`n${i}`,answer:0,my_choice:1,explanation:'',at:1000-i,misses:i%5,key:''}));
assert.equal(ui.noteCount(),'10');assert.equal(ui.noteOrder(),'random');
const random=ui.pickNotes(notes);assert.equal(random.length,10);assert.equal(new Set(random).size,10);
assert.ok(ui.setNoteOrder('priority'));assert.ok(!ui.setNoteOrder('bad'));
const top=ui.pickNotes(notes);assert.deepEqual(top.slice(0,5),['n24','n19','n14','n9','n4']);
assert.ok(ui.setNoteCount('20'));assert.equal(ui.pickNotes(notes).length,20);
assert.equal(ui.noteTake(12),12);assert.equal(ui.noteTake(30),20);
assert.ok(ui.setNoteCount('all'));assert.equal(ui.pickNotes(notes).length,25);
assert.ok(!ui.setNoteCount('5'));assert.equal(ui.noteCount(),'all');

console.log('PASS notebook: 2回連続正解で誤答から外す・再配信と数え直し・迷ったの解除と記録し直し・演習の問題数と優先順');
