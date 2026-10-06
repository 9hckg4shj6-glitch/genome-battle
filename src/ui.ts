import type { ReviewItem } from './api';
import { validChoiceOrder } from './choices';
export interface Question {
  id: string; field: string; question: string; choices: string[]; image?: string; imageAlt?: string;
}
export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export const richText = (s: string): string => s.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}</p>`).join('');
export function readStore(key: string, storage: Storage = localStorage): string | null {
  try { return storage.getItem(key); } catch { return null; }
}
export function writeStore(key: string, value: string | null, storage: Storage = localStorage): void {
  try { if (value === null) storage.removeItem(key); else storage.setItem(key,value); } catch { /* 保存不可でも遊べる */ }
}
const paths: Record<string,string> = {
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  moon:'<path d="M20.5 13.3A9 9 0 0 1 10.7 3.5 9 9 0 1 0 20.5 13.3Z"/>',
  dna:'<path d="M7 3c0 8 10 10 10 18M17 3C17 11 7 13 7 21M8 6h8M10 10h4M10 14h4M8 18h8"/>',
  swords:'<path d="m4 3 7 7-3 3-5-7V3h1Zm16 0-7 7 3 3 5-7V3h-1ZM3 16l5 5M5 18l6-6M16 16l3 3M16 21l5-5M18 18l-6-6"/>',
  book:'<path d="M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V4Z"/>',
  bot:'<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M9 16h6M1 12v5M23 12v5"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  room:'<path d="M3 21h18M5 21V5l10-2v18M15 7h4v14M11 12h.01"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  zoom:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M10 7v6M7 10h6"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.8M12 17h.01"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
export const icon = (name: string): string => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.dna}</svg>`;
export function helix(): string {
  const left: string[]=[]; const right: string[]=[]; const rungs: string[]=[];
  for (let i=0;i<=44;i++) {
    const y=20+i*7; const a=125+Math.sin(i*0.23)*72; const b=125-Math.sin(i*0.23)*72;
    left.push(`${a.toFixed(1)},${y}`); right.push(`${b.toFixed(1)},${y}`);
    if (i%2===0) rungs.push(`<line x1="${a}" y1="${y}" x2="${b}" y2="${y}" opacity="${0.2+Math.abs(Math.cos(i*0.23))*0.4}"/><circle cx="${a}" cy="${y}" r="3"/><circle cx="${b}" cy="${y}" r="3"/>`);
  }
  return `<svg class="helix" viewBox="0 0 250 350" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1">${rungs.join('')}</g><polyline points="${left.join(' ')}" stroke="currentColor" stroke-width="2.5"/><polyline points="${right.join(' ')}" stroke="currentColor" stroke-width="2.5"/></svg>`;
}
export function questionImage(q:Question,lazy=false):string {
  return q.image?`<figure class="question-figure"><button class="image-open" data-image-id="${esc(q.id)}" aria-label="図を拡大：${esc(q.imageAlt??'問題の図')}"><img src="${import.meta.env.BASE_URL}${esc(q.image)}" alt="${esc(q.imageAlt??'問題の図')}" ${lazy?'loading="lazy"':''}/><span>${icon('zoom')}図を拡大</span></button></figure>`:'';
}
export interface Progress { sessions: string[]; answered: number; correct: number; aiWins: number; }
export function progress(): Progress {
  try {
    const p=JSON.parse(readStore('gb.progress') ?? '{}');
    return { sessions:Array.isArray(p.sessions)?p.sessions:[], answered:Number(p.answered)||0, correct:Number(p.correct)||0, aiWins:Number(p.aiWins)||0 };
  } catch { return {sessions:[],answered:0,correct:0,aiWins:0}; }
}

// 復習ノート。正解と解説はサーバにしか無いので、解答確定時に受け取った内容ごと端末へ保存する。
export interface Note extends ReviewItem { at: number; misses: number; key: string; }
export interface Notebook { missed: Record<string,Note>; saved: Record<string,Note>; uncertain: Record<string,Note>; }
export function notebook(): Notebook {
  try {
    const n=JSON.parse(readStore('gb.notebook') ?? '{}');
    return { missed:n.missed ?? {}, saved:n.saved ?? {}, uncertain:n.uncertain ?? {} };
  } catch { return {missed:{},saved:{},uncertain:{}}; }
}
const saveNotebook = (n: Notebook): void => writeStore('gb.notebook',JSON.stringify(n));
const note = (r: ReviewItem, misses: number, key: string): Note => ({id:r.id,answer:r.answer,explanation:r.explanation,my_choice:r.my_choice,answer_viewed:r.answer_viewed,choice_order:r.choice_order,at:Date.now(),misses,key});
// key は「セッションID:問番号」。同じ解答確定の再配信や再読み込みで二重に数えない。
export function recordMiss(key: string, r: ReviewItem): void {
  const n=notebook(); const prev=n.missed[r.id];
  if (prev?.key===key) return;
  n.missed[r.id]=note(r,(prev?.misses ?? 0)+1,key);
  saveNotebook(n);
}
export function toggleSaved(r: ReviewItem): void {
  const n=notebook();
  if (n.saved[r.id]) delete n.saved[r.id]; else n.saved[r.id]=note(r,0,'');
  saveNotebook(n);
}
export function removeMissed(id: string): void {
  const n=notebook(); delete n.missed[id]; saveNotebook(n);
}
// 正解した問題だけを「迷った問題」として記録。以前の誤答・保存問題は維持する。
export function toggleUncertain(r:ReviewItem):void {
  if (r.my_choice!==r.answer) return;
  const n=notebook();
  if (n.uncertain[r.id]) delete n.uncertain[r.id]; else n.uncertain[r.id]=note(r,0,'');
  saveNotebook(n);
}
export function uncertainButton(r:ReviewItem):string {
  if (r.my_choice!==r.answer) return '';
  const on=!!notebook().uncertain[r.id];
  return `<button class="btn ghost uncertain-btn ${on?'on':''}" data-uncertain="${esc(r.id)}" aria-pressed="${on}">${icon('target')}${on?'迷った問題に記録済み':'正解したけど迷った'}</button>`;
}
export function reviewCard(q: Question, r: ReviewItem, label: string, saved: boolean, extra = '', order=r.choice_order): string {
  return `<article class="review-item"><p class="eyebrow">${label}<span class="verdict ${r.my_choice===r.answer?'ok':''}">${r.answer_viewed?'回答を見た':r.my_choice===null?'未解答':r.my_choice===r.answer?'○ 正解':'× 不正解'}</span></p><p class="review-q">${esc(q.question)}</p>${questionImage(q,true)}<ol class="review-choices">${validChoiceOrder(order,q.choices.length).map((n,pos)=>`<li class="${n===r.answer?'correct':''} ${n===r.my_choice && n!==r.answer?'wrong':''}"><span class="num">${pos+1}</span>${esc(q.choices[n])}</li>`).join('')}</ol><div class="expl">${richText(r.explanation)}</div><div class="review-actions"><button class="btn ghost save-btn ${saved?'on':''}" data-save="${esc(r.id)}" aria-pressed="${saved}">${icon('bookmark')}${saved?'保存済み':'この問題を保存'}</button>${uncertainButton(r)}${extra}</div></article>`;
}
