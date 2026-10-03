// 公開クライアントで過去問・問題と解説の正答・解説を確認。値や認証情報は出力しない。
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

let checked=0,passed=0,missingPassed=false;
let sb;
try {
  const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
  const questions=JSON.parse(readFileSync('public/questions.json','utf8'));
  if(!Array.isArray(questions)||questions.length!==100||new Set(questions.map(q=>q.id)).size!==100)throw new Error('INVALID_CATALOG');
  sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
  // 独立した参照を10問ずつ確認。応答値と通信エラーの内容はログに出さない。
  for(let offset=0;offset<questions.length;offset+=10){
    const results=await Promise.all(questions.slice(offset,offset+10).map(async q=>{
      try {
        const {data,error}=await sb.rpc('get_question_answer',{p_id:q.id});
        return !error&&data?.id===q.id&&Number.isInteger(data.answer)&&Array.isArray(q.choices)
          &&data.answer>=0&&data.answer<q.choices.length&&typeof data.explanation==='string'&&data.explanation.trim().length>0;
      } catch {return false;}
    }));
    checked+=results.length;passed+=results.filter(Boolean).length;
  }
  const {data,error}=await sb.rpc('get_question_answer',{p_id:`__catalog_missing_${randomUUID()}`});
  missingPassed=!error&&data===null;
} catch {
  // 失敗時にもエラーオブジェクト、正答、接続設定を表示しない。
} finally {
  if(sb)await sb.removeAllChannels();
}
console.log(`${checked===100&&passed===100?'PASS':'FAIL'} 全100問: ${passed}/100（確認 ${checked}件）`);
console.log(`${missingPassed?'PASS':'FAIL'} 存在しないID: ${missingPassed?1:0}/1`);
if(checked!==100||passed!==100||!missingPassed)process.exitCode=1;
