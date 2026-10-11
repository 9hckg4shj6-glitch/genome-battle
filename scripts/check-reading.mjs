// 過去問一覧の「読んで学ぶ／選んで演習」・読んだ記録・しおりと、解説リーダーの回帰確認（通信なし）。
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
class MemoryStorage {
  data=new Map();getItem(k){return this.data.get(k) ?? null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
globalThis.localStorage=new MemoryStorage();
// hub → theme が読み込み時に画面へ触れるため、最小限の document・window を置く。
globalThis.document={documentElement:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};globalThis.window={addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})};
// 正答・解説の取得は呼び出し回数を数える固定の応答に差し替える。
globalThis.answerCalls=[];
const bundle=await build({stdin:{contents:"export * from './catalog';export * from './reader';export * from './reading';export * from './answers';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'},plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const supabase={};export const serverNow=()=>Date.now();export const call=async(fn,args)=>{globalThis.answerCalls.push(args.p_id);return args.p_id==='missing'?null:{id:args.p_id,answer:1,explanation:'解説 '+args.p_id};};",loader:'js'}));}}]});
const c=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const tick=()=>new Promise(r=>setTimeout(r,0));

const q=(id,year,no,field)=>[id,{id,year,no,field,question:'問題'+id,choices:['a','b','c','d','e']}];
const qs=new Map([q('a',2025,1,'転写'),q('b',2025,2,'翻訳'),q('c',2024,1,'転写')]);
const m={xp:0,xp_today:0,states:{}};

// 一覧：最初は「読んで学ぶ」。四角と演習バーを出さず、読んだ記録と「1問ずつ読む」を出す。
assert.equal(c.catalogMode(),'read');
let html=c.renderCatalog(qs,m);
assert.match(html,/name="catalog-mode" value="read" checked/);
assert.ok(!html.includes('data-catalog-pick'));
assert.ok(!html.includes('catalog-pickbar'));
assert.match(html,/解説を読んだ問題/);
assert.match(html,/data-act="reader-start"/);
assert.match(html,/解説未読 3問/);
// 解説未読の絞り込みは学習記録が無くても使える。
assert.match(c.renderCatalog(qs,null),/value="unread"\/>/);
// 読んだ印と解説未読の絞り込み。
c.markRead('a');
assert.ok(c.isRead('a'));
html=c.renderCatalog(qs,m);
assert.match(html,/st-read">読んだ/);
assert.match(html,/2025年度[\s\S]*?<b>1<small>\/2<\/small><\/b>/);
c.setCatalogStatus('unread');
assert.deepEqual(c.filteredEntries(qs,m).shown.map(e=>e.q.id),['b','c']);
c.clearCatalogFilters();

// 「選んで演習」：四角は出すが、演習バーは選んだあとだけ。まとめて選ぶボタンは一覧の上。
c.setCatalogMode('pick');
html=c.renderCatalog(qs,m);
assert.match(html,/data-catalog-pick="a"/);
assert.ok(!html.includes('catalog-pickbar'));
assert.match(html,/この条件の3問を選ぶ/);
c.togglePick('b',true);
html=c.renderCatalog(qs,m);
assert.match(html,/catalog-pickbar active/);
assert.match(html,/選んだ1問を演習する/);
c.clearPicks();c.setCatalogMode('read');
assert.equal(localStorage.getItem('gb.catalog-mode'),null);

// リーダー：未読の最初の問題から。解説を表示したら読んだ・しおりを記録し、次の問題を先読みする。
assert.ok(!c.openReader(qs,['zzz'],'x'));
assert.ok(c.openReader(qs,['a','b','c'],'すべての年度 · すべての分野'));
let updates=0;const update=()=>{updates++;c.syncReader(update);};
c.syncReader(update);await tick();await tick();
assert.equal(updates,1);
assert.ok(c.isRead('b'));
assert.deepEqual(c.bookmark(id=>qs.has(id)),{ids:['a','b','c'],id:'b',label:'すべての年度 · すべての分野'});
assert.ok(answerCalls.includes('c'),'次の問題を先読み');
html=c.renderReader(qs);
assert.match(html,/<b>2<\/b><small> \/ 3問<\/small>/);
assert.match(html,/2025年度 第2問/);
assert.match(html,/解説 b/);
assert.match(html,/次の問題へ<small>2024年度 第1問/);
// 同じ問題は再取得しない。
const before=answerCalls.length;c.syncReader(update);await tick();assert.equal(answerCalls.length,before);

// 答えを隠す：選択肢を押すまで解説を出さず、読んだにもならない。押すと正誤を出す（記録はしない）。
c.setHideAnswers(true);
assert.ok(c.stepReader(1));
c.syncReader(update);
html=c.renderReaderCard(qs);
assert.match(html,/data-reader-choice="0"/);
assert.match(html,/正解と解説を見る/);
assert.ok(!html.includes('解説 c'));
assert.ok(!c.isRead('c'));
c.revealReader(0);c.syncReader(update);
html=c.renderReaderCard(qs);
assert.match(html,/× 不正解 · 正解は 2/);
assert.match(html,/解説 c/);
assert.ok(c.isRead('c'));
assert.ok(c.readerAtEnd());
assert.match(c.renderReader(qs),/読み終えて一覧へ/);
assert.ok(!c.stepReader(1));
// あとで解く：復習ノートの保存に入れ、もう一度押すと外す。
c.saveReaderQuestion();
assert.ok(JSON.parse(localStorage.getItem('gb.notebook')).saved.c);
assert.match(c.renderReaderCard(qs),/復習ノートに保存済み/);
c.saveReaderQuestion();
assert.ok(!JSON.parse(localStorage.getItem('gb.notebook')).saved.c);
// しおりからの再開：存在しない問題は除き、指定の問題から開く。
localStorage.setItem('gb.reader-bookmark',JSON.stringify({ids:['a','gone','c'],id:'c',label:'L'}));
assert.deepEqual(c.bookmark(id=>qs.has(id)),{ids:['a','c'],id:'c',label:'L'});
localStorage.setItem('gb.reader-bookmark','{broken');
assert.equal(c.bookmark(id=>qs.has(id)),null);
// 取得に失敗したら再取得ボタン。
assert.ok(c.openReader(new Map([...qs,q('missing',2024,9,'転写')]),['missing'],'x'));
c.setHideAnswers(false);
const qs2=new Map([...qs,q('missing',2024,9,'転写')]);
c.syncReader(()=>{});await tick();await tick();
assert.match(c.renderReaderCard(qs2),/data-act="reader-retry"/);
c.closeReader();assert.ok(!c.readerOpen());
console.log('PASS reading: read/pick modes, pick bar only when picked, read badges and unread filter, reader start/sync/prefetch/bookmark, hidden answers and guesses, save toggle, failure retry');
