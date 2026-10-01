// セッション・問番号を種にする。再描画や再読み込み、同じ対戦の参加者間で順序が変わらない。
export function choiceOrder(session:string,index:number,id:string,count:number):number[] {
  let seed=2166136261;
  for(const c of `${session}:${index}:${id}`) seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
  const next=():number=>{seed=(seed+0x6d2b79f5)>>>0;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const order=Array.from({length:count},(_,i)=>i);
  for(let i=count-1;i>0;i--){const j=Math.floor(next()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  if(count>1 && order.every((v,i)=>v===i)) order.push(order.shift()!);
  return order;
}
export function validChoiceOrder(order:number[]|undefined,count:number):number[] {
  return order?.length===count && new Set(order).size===count && order.every(n=>Number.isInteger(n)&&n>=0&&n<count)?order:Array.from({length:count},(_,i)=>i);
}
