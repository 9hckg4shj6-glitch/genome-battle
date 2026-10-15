// オンライン人数（Presence）のキーと管理画面の結びつけ（src/presence.ts・025_presence_keys.sql）の回帰確認。
//   node scripts/check-presence.mjs
// 確認すること：キーが端末IDのハッシュで端末IDを含まない／サーバーの _presence_key と一致する／
//               アプリと同じ方法で入った端末を、ほかの購読者はハッシュのキーでしか見られない／公開クライアントは内部関数・管理用RPCを呼べない。
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

// presence.ts は Supabase の接続（api.ts）を読み込むので、ハッシュ関数だけを使えるよう差し替えて束ねる。
const bundle=await build({stdin:{contents:"export {presenceKey} from './presence';",resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',
  plugins:[{name:'stub-api',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'api',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const supabase=null;',loader:'js'}));}}]});
const {presenceKey}=await import(`data:application/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const device=randomUUID();
const key=await presenceKey(device);
assert.match(key,/^[0-9a-f]{64}$/);assert.ok(!key.includes(device.replace(/-/g,'')) && !key.includes(device));
assert.equal(key,createHash('sha256').update(`gb-presence:${device}`).digest('hex'));
assert.equal(await presenceKey(device),key);assert.notEqual(await presenceKey(randomUUID()),key);
console.log('PASS local presence key: 64-hex SHA-256 of the device id, stable per device, never contains the id');

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];const token=readFileSync(join(homedir(),'.supabase-token'),'utf8').trim();
async function sql(query,parameters=[]) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,parameters})});
  if(!r.ok)throw new Error(`Fixture HTTP ${r.status}`);return r.json();
}
const [{server}]=await sql('select public._presence_key($1::uuid) as server',[device]);
assert.equal(server,key);
const anon=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
assert.ok((await anon.rpc('_presence_key',{p_device:device})).error);
assert.ok((await anon.rpc('get_admin_dashboard',{p_present:[key]})).error);
assert.ok((await anon.rpc('get_admin_dashboard')).error);

// アプリと同じ方法（試験用チャンネル）で入り、別の購読者から見えるキーを確かめる。
const app=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const watcher=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const name=`presence:check-${randomUUID().slice(0,8)}`;
try {
  const seen=await new Promise((done,fail)=>{
    const timer=setTimeout(()=>fail(new Error('presence timeout')),20000);
    const w=watcher.channel(name);
    w.on('presence',{event:'sync'},()=>{const keys=Object.keys(w.presenceState());if(keys.length){clearTimeout(timer);done(keys);}})
      .subscribe(s=>{
        if(s!=='SUBSCRIBED')return;
        const a=app.channel(name,{config:{presence:{key}}});
        a.subscribe(t=>t==='SUBSCRIBED'&&void a.track({at:Date.now()}));
      });
  });
  assert.deepEqual(seen,[key]);assert.ok(!JSON.stringify(seen).includes(device));
  console.log('PASS server presence key: matches _presence_key, other subscribers see only the hash, internal and admin RPCs denied to anonymous clients');
} finally {await app.removeAllChannels();await watcher.removeAllChannels();}
process.exit(0);
