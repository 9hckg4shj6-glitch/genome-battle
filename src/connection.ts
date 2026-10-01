export interface ConnectionState {online:boolean;healthy:boolean|null;pending:number;latency:number|null;lastSuccess:number|null;realtime:'off'|'connecting'|'live'|'fallback';}
export function connectionLabel(s:ConnectionState):{label:string;tone:string} {
  if(!s.online)return {label:'オフライン',tone:'bad'};
  if(s.healthy===false)return {label:'通信エラー・再接続待ち',tone:'bad'};
  if(s.healthy===null)return {label:'通信を確認中',tone:'waiting'};
  if(s.realtime==='connecting')return {label:'対戦の同期に接続中',tone:'waiting'};
  if(s.realtime==='fallback')return {label:'定期通信で対戦を同期',tone:'waiting'};
  return {label:s.realtime==='live'?'リアルタイム同期中':'接続良好',tone:'good'};
}
const state:ConnectionState={online:typeof navigator==='undefined'||navigator.onLine,healthy:null,pending:0,latency:null,lastSuccess:null,realtime:'off'};
function changed():void {
  if(typeof document==='undefined')return;const el=document.getElementById('connection-status');if(!el)return;
  const {label,tone}=connectionLabel(state);const indicator=el.querySelector<HTMLElement>('.connection-indicator');
  if(!indicator || indicator.querySelector('span')?.textContent!==label || !indicator.classList.contains(tone))el.innerHTML=renderConnection();
  else indicator.title=connectionDetail();
}
function connectionDetail():string {return state.lastSuccess?`最終応答 ${new Date(state.lastSuccess).toLocaleTimeString('ja-JP')} · 応答 ${state.latency}ms`:'サーバーとの通信を確認しています';}
export function renderConnection():string {
  const {label,tone}=connectionLabel(state);
  const detail=connectionDetail();
  return `<div class="connection-indicator ${tone}" role="status" aria-live="polite" title="${detail}"><i></i><span>${label}</span>${tone==='bad'?'<button class="btn ghost" data-act="retry-connection">再接続</button>':''}</div>`;
}
export function requestStarted():void {state.pending++;changed();}
export function requestFinished(reachable:boolean,latency:number):void {
  state.pending=Math.max(0,state.pending-1);state.healthy=reachable;
  if(reachable){state.latency=Math.round(latency);state.lastSuccess=Date.now();}changed();
}
export function realtimeState(value:ConnectionState['realtime']):void {state.realtime=value;changed();}
if(typeof window!=='undefined') {
  window.addEventListener('offline',()=>{state.online=false;changed();});
  window.addEventListener('online',()=>{state.online=true;state.healthy=null;changed();});
}
