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
  dna:'<path d="M7 3c0 8 10 10 10 18M17 3C17 11 7 13 7 21M8 6h8M10 10h4M10 14h4M8 18h8"/>',
  swords:'<path d="m4 3 7 7-3 3-5-7V3h1Zm16 0-7 7 3 3 5-7V3h-1ZM3 16l5 5M5 18l6-6M16 16l3 3M16 21l5-5M18 18l-6-6"/>',
  book:'<path d="M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V4Z"/>',
  bot:'<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M9 16h6M1 12v5M23 12v5"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>',
  room:'<path d="M3 21h18M5 21V5l10-2v18M15 7h4v14M11 12h.01"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
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
export interface Progress { sessions: string[]; answered: number; correct: number; aiWins: number; }
export function progress(): Progress {
  try {
    const p=JSON.parse(readStore('gb.progress') ?? '{}');
    return { sessions:Array.isArray(p.sessions)?p.sessions:[], answered:Number(p.answered)||0, correct:Number(p.correct)||0, aiWins:Number(p.aiWins)||0 };
  } catch { return {sessions:[],answered:0,correct:0,aiWins:0}; }
}
