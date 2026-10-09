// 過去問一覧のキーワード検索・学習状態の絞り込みの回帰確認（通信なし）。
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
class MemoryStorage {
  data=new Map();getItem(k){return this.data.get(k) ?? null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
globalThis.localStorage=new MemoryStorage();
const bundle=await build({stdin:{contents:"export * from './catalog';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'},plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const call=async()=>null;export const serverNow=()=>Date.now();',loader:'js'}));}}]});
const c=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const qs=new Map([
  ['a',{id:'a',field:'ゲノム編集',question:'CRISPR-Cas9 が認識する配列は？',choices:['PAM','TATAボックス']}],
  ['b',{id:'b',field:'シーケンス',question:'次世代シーケンサーの特徴は？',choices:['長いリード','並列に読む']}],
  ['c',{id:'c',field:'シーケンス',question:'ＰＣＲ の原理は？',choices:['DNAポリメラーゼ','RNA']}],
]);
const m={xp:0,xp_today:0,states:{a:'settled',b:'learning'}};
const entries=c.catalogEntries(qs,m,{missed:{b:{}},saved:{},uncertain:{}});
const find=(q,status='all')=>entries.filter(e=>c.matchesTerms(e,c.searchTerms(q))&&c.matchesStatus(e,status)).map(e=>e.q.id);

// 番号・状態・誤答の付与。
assert.deepEqual(entries.map(e=>[e.no,e.state,e.missed]),[[1,'settled',false],[2,'learning',true],[3,'new',false]]);
// 問題文・選択肢・分野名、大文字小文字・全角半角・カタカナひらがなを問わない。
assert.deepEqual(find(''),['a','b','c']);
assert.deepEqual(find('crispr'),['a']);
assert.deepEqual(find('pcr'),['c']);
assert.deepEqual(find('ＰＣＲ'),['c']);
assert.deepEqual(find('pam'),['a']);
assert.deepEqual(find('しーけんす'),['b','c']);
// スペース区切りはすべての語を含む問題（全角スペースも可）。
assert.deepEqual(find('シーケンス　リード'),['b']);
assert.deepEqual(find('シーケンス 存在しない語'),[]);
// 数字だけの語は問題番号とも一致する。
assert.deepEqual(find('2'),['b']);
assert.deepEqual(find('9'),['a']);
// 学習状態：習得は定着を含む。誤答は復習ノートの誤答。
assert.deepEqual(find('','new'),['c']);
assert.deepEqual(find('','learning'),['b']);
assert.deepEqual(find('','mastered'),['a']);
assert.deepEqual(find('','missed'),['b']);
assert.deepEqual(find('シーケンス','new'),['c']);
// 「迷った」に記録中の習得問題は取り組み中として扱う。
const unsure=c.catalogEntries(qs,m,{missed:{},saved:{},uncertain:{a:{}}});
assert.equal(unsure[0].state,'learning');
// 学習記録が無ければすべて未着手。
assert.ok(c.catalogEntries(qs,null,{missed:{},saved:{},uncertain:{}}).every(e=>e.state==='new'));

// 描画：一致語の強調、0件時の案内、絞り込みの解除。
c.setCatalogQuery('crispr');
let html=c.renderCatalog(qs,m);
assert.match(html,/<mark>CRISPR<\/mark>/);
assert.match(html,/1問中 1–1問目/);
assert.match(html,/value="crispr"/);
// 選択肢だけで一致した問題は、閉じた状態でも一致した選択肢を添える。
c.setCatalogQuery('pam');
assert.match(c.renderCatalog(qs,m),/選択肢：<mark>PAM<\/mark>/);
c.setCatalogQuery('<script>');
html=c.renderCatalog(qs,m);
assert.ok(!html.includes('<script>'));
assert.match(html,/条件に合う問題がありません/);
c.clearCatalogFilters();c.setCatalogStatus('bogus');
assert.match(c.renderCatalog(qs,m),/3問中 1–3問目/);
// 学習記録が未取得なら、記録に依存する状態ボタンは押せない。
assert.match(c.renderCatalog(qs,null),/value="new" disabled/);
console.log('catalog search: ok');
