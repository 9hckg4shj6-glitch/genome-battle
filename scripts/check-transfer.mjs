// 端末の引き継ぎ（発行・受け取り・元に戻す）の回帰確認（通信なし。RPCは置き換える）。
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
class MemoryStorage {
  data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i] ?? null;}
  getItem(k){return this.data.get(k) ?? null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
globalThis.localStorage=new MemoryStorage();globalThis.sessionStorage=new MemoryStorage();
const inputs={};let reloads=0;
globalThis.document={querySelector:(sel)=>sel==='#transfer-code'?inputs.code??null:null,querySelectorAll:()=>[]};
globalThis.window={setInterval:()=>1};globalThis.clearInterval=()=>{};
globalThis.location={reload(){reloads++;}};
Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
const calls=[];let reply=async()=>null;
globalThis.__call=async(fn,args)=>{calls.push([fn,args]);return reply(fn,args);};
const bundle=await build({stdin:{contents:"export * from './transfer';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const call=(fn,args)=>globalThis.__call(fn,args);export const serverNow=()=>Date.now();',loader:'js'}));}}]});
const t=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const tick=()=>new Promise(r=>setTimeout(r,0));

// コードは英数字だけにそろえ、4文字ごとにハイフンで区切って見せる。
assert.equal(t.normalizeCode(' abcd-efgh jkLm '),'ABCDEFGHJKLM');
assert.equal(t.formatCode('abcdefghjklm'),'ABCD-EFGH-JKLM');

// 発行：gb.* の端末保存を送り、端末そのものの状態（識別子・追加済み）は送らない。
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
localStorage.setItem('gb.device',A);localStorage.setItem('gb.name','ゲノム太郎');localStorage.setItem('gb.notebook','{"missed":{"q1":{}}}');
localStorage.setItem('gb.read','{"q1":1}');localStorage.setItem('gb.install-dismissed','1');localStorage.setItem('other','x');
let renders=0;const sender=new t.TransferController(A,()=>renders++);
reply=async()=>({code:'ABCDEFGHJKLM',expires_at:'2026-10-12T00:15:00Z',server_now:'2026-10-12T00:00:00Z'});
assert.equal(sender.act('transfer-issue'),true);await tick();
const [fn,args]=calls.at(-1);
assert.equal(fn,'create_device_transfer');assert.equal(args.p_device,A);
assert.deepEqual(Object.keys(args.p_payload.items).sort(),['gb.name','gb.notebook','gb.read']);
let html=sender.render();
assert.match(html,/ABCD-EFGH-JKLM/);assert.match(html,/残り <b data-transfer-left>15:00<\/b>/);
assert.match(html,/他の人に見せたり送ったりしないでください/);
// 自分で発行したコードはこの端末では受け取らない。
inputs.code={value:'abcd-efgh-jklm',focus(){}};sender.act('transfer-ask');
assert.match(sender.render(),/この端末で発行したコードです/);
// 無効にする。
reply=async()=>({cancelled:1});sender.act('transfer-cancel');await tick();
assert.equal(calls.at(-1)[0],'cancel_device_transfer');assert.doesNotMatch(sender.render(),/<output>ABCD-EFGH-JKLM/);
assert.match(sender.render(),/コードを無効にしました/);

// 受け取り：桁数が違うと確認へ進まない。
const receiver=new t.TransferController(B,()=>{});
inputs.code={value:'ABC',focus(){}};receiver.act('transfer-ask');
assert.match(receiver.render(),/コードは12文字です/);assert.doesNotMatch(receiver.render(),/置き換えて引き継ぐ/);
// 正しいコードは、置き換えの確認を出してから受け取る（確認前は通信しない）。
const before=calls.length;
inputs.code={value:'wxyz-2345-6789',focus(){}};receiver.act('transfer-ask');
assert.equal(calls.length,before);assert.match(receiver.render(),/置き換えて引き継ぐ/);assert.match(receiver.render(),/WXYZ-2345-6789/);
assert.equal(receiver.act('transfer-back'),true);assert.doesNotMatch(receiver.render(),/置き換えて引き継ぐ/);
// 受け取る側の端末の記録（Bの記録）を用意する。
localStorage.data.clear();
localStorage.setItem('gb.device',B);localStorage.setItem('gb.name','新しい端末');localStorage.setItem('gb.theme','dark');localStorage.setItem('gb.install-dismissed','1');
sessionStorage.setItem('gb.solo','old-session');sessionStorage.setItem('gb.match','old-match');
// 失敗したら記録はそのまま、理由を出す。
reply=async()=>{throw new Error('TRANSFER_NOT_FOUND');};
receiver.act('transfer-ask');receiver.act('transfer-confirm');await tick();
assert.match(receiver.render(),/コードが見つからないか、期限が切れています/);assert.equal(localStorage.getItem('gb.device'),B);assert.equal(reloads,0);
// 成功：識別子とデータを置き換え、前の記録を退避し、進行中の参照を消して読み込み直す。
reply=async()=>({device_id:A,payload:{v:1,items:{'gb.name':'ゲノム太郎','gb.notebook':'{"missed":{"q1":{}}}','gb.device':'evil','gb.install-dismissed':'0'}}});
receiver.act('transfer-ask');receiver.act('transfer-confirm');await tick();
assert.equal(calls.at(-1)[0],'redeem_device_transfer');assert.equal(calls.at(-1)[1].p_code,'WXYZ23456789');
assert.equal(reloads,1);
assert.equal(localStorage.getItem('gb.device'),A);
assert.equal(localStorage.getItem('gb.name'),'ゲノム太郎');assert.equal(localStorage.getItem('gb.notebook'),'{"missed":{"q1":{}}}');
assert.equal(localStorage.getItem('gb.theme'),null,'受け取る前の端末の設定は残さない');
assert.equal(localStorage.getItem('gb.install-dismissed'),'1','追加済みは端末の状態なので上書きしない');
assert.equal(sessionStorage.getItem('gb.solo'),null);assert.equal(sessionStorage.getItem('gb.match'),null);
assert.equal(sessionStorage.getItem('gb.title-seen'),'1');
const backup=JSON.parse(localStorage.getItem('gb.transfer-backup'));
assert.equal(backup.device,B);assert.deepEqual(backup.items,{'gb.name':'新しい端末','gb.theme':'dark'});
// ホームで1回だけ知らせる。
assert.match(t.takeTransferNotice(),/引き継ぎが完了しました/);assert.equal(t.takeTransferNotice(),'');

// 元に戻す：確認してから、退避した記録へ戻す。
const after=new t.TransferController(A,()=>{});
assert.match(after.render(),/引き継ぐ前に戻す/);
after.act('transfer-restore-ask');assert.match(after.render(),/<button class="btn primary" data-act="transfer-restore">戻す<\/button>/);
after.act('transfer-restore');
assert.equal(reloads,2);
assert.equal(localStorage.getItem('gb.device'),B);assert.equal(localStorage.getItem('gb.theme'),'dark');assert.equal(localStorage.getItem('gb.notebook'),null);
assert.equal(localStorage.getItem('gb.transfer-backup'),null);
assert.match(t.takeTransferNotice(),/引き継ぐ前/);
assert.doesNotMatch(new t.TransferController(B,()=>{}).render(),/引き継ぐ前に戻す/);
// 関係のない操作は引き受けない。
assert.equal(after.act('transfer'),false);assert.equal(after.act('install'),false);assert.equal(after.act(undefined),false);
console.log('check-transfer: ok');
