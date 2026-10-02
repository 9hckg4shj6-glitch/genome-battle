import type { ReviewItem } from './api';
import { icon, readStore, writeStore, notebook } from './ui';

export interface BattlePerformance { matches:number; wins:number; draws:number; points:number; }
export interface Performance {
  study:{sessions:number;answered:number;correct:number;viewed?:number}; ai:BattlePerformance; human:BattlePerformance;
}
export function cachedPerformance(device:string):Performance|null {
  try {
    const p=JSON.parse(readStore(`gb.performance.${device}`) ?? 'null');
    if (!p || ![p.study?.sessions,p.study?.answered,p.study?.correct,p.ai?.matches,p.ai?.wins,p.ai?.draws,p.ai?.points,p.human?.matches,p.human?.wins,p.human?.draws,p.human?.points].every(n=>Number.isInteger(n) && n>=0)) return null;
    if (p.study.viewed!==undefined && (!Number.isInteger(p.study.viewed) || p.study.viewed<0)) return null;
    return p;
  } catch {return null;}
}
export const cachePerformance=(device:string,p:Performance):void=>writeStore(`gb.performance.${device}`,JSON.stringify(p));

export function renderPerformance(p:Performance|null,error=''):string {
  if (!p) return `<div class="panel performance-loading" role="status">${error || '学習・対戦の記録を読み込んでいます…'}${error?'<button class="btn" data-act="refresh-performance">記録を再取得する</button>':''}</div>`;
  const stats=(items:[string,string,string][]):string=>`<div class="progress-stats">${items.map(([value,unit,label])=>`<div><strong>${value}<small>${unit}</small></strong><span>${label}</span></div>`).join('')}</div>`;
  const battle=(b:BattlePerformance,title:string,eyebrow:string,face:string):string=>`<section class="progress-panel performance-card"><div class="progress-intro"><span class="progress-icon">${icon(face)}</span><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>勝敗と正解で獲得した得点</p></div></div>${stats([[String(b.matches),'回','対戦数'],[String(b.wins),'勝','勝利'],[String(b.points),'点','獲得得点']])}<p class="performance-caption">${b.matches-b.wins-b.draws}敗 · ${b.draws}引き分け</p></section>`;
  return `<div class="performance-grid"><section class="progress-panel performance-card study-performance"><div class="progress-intro"><span class="progress-icon">${icon('book')}</span><div><p class="eyebrow">STUDY RECORD</p><h2>学習成績</h2><p>中断した学習・復習コースも記録</p></div></div>${stats([[String(p.study.answered),'問','取り組んだ問題'],[p.study.answered?String(Math.round(p.study.correct/p.study.answered*100)):'—',p.study.answered?'%':'','正答率'],[String(p.study.sessions),'回','完了した学習']])}<p class="performance-caption">${p.study.correct} / ${p.study.answered}問正解 · 回答を見た ${p.study.viewed??0}問</p></section>${battle(p.ai,'AI対戦成績','AI BATTLE RECORD','bot')}${battle(p.human,'対人対戦成績','MULTIPLAYER RECORD','swords')}</div><p class="performance-note">このブラウザのプレイヤーの記録 · 学習は解答・回答確認の時点で記録、対戦は終了した試合が対象です</p>${error?'<p class="error" role="status">記録を更新できませんでした。前回取得した記録を表示しています。</p><button class="btn ghost" data-act="refresh-performance">再取得する</button>':''}`;
}

export interface CourseSummary { ids:string[]; wrong:number; unanswered:number; uncertain:number; }
export function reviewCourse(items:ReviewItem[],uncertain:Record<string,unknown>=notebook().uncertain):CourseSummary {
  const seen=new Set<string>(); const result:CourseSummary={ids:[],wrong:0,unanswered:0,uncertain:0};
  for (const r of items) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.my_choice===null) {result.unanswered++;result.ids.push(r.id);}
    else if (r.my_choice!==r.answer) {result.wrong++;result.ids.push(r.id);}
    else if (uncertain[r.id]) {result.uncertain++;result.ids.push(r.id);}
  }
  return result;
}
export function renderReviewCourse(items:ReviewItem[],act:string,loaded:boolean,loading:boolean,title='対戦直後の復習コース'):string {
  const c=reviewCourse(items);
  return `<section class="review-course"><p class="eyebrow">REVIEW COURSE</p><h2>${title}</h2>${!loaded?`<p role="status">${loading?'復習する問題を準備しています…':'復習対象を取得できませんでした。もう一度お試しください。'}</p>${loading?'':'<button class="btn" data-act="reload-battle-review">復習対象を再取得する</button>'}`:c.ids.length?`<p class="course-breakdown">誤答 ${c.wrong}問 · ${items.some(r=>r.answer_viewed)?'未解答・回答を見た':'未解答'} ${c.unanswered}問 · 迷った ${c.uncertain}問</p><button class="btn primary" data-act="${act}">${icon('book')}復習コースを始める（${c.ids.length}問）${icon('arrow')}</button><p>時間制限なしで解き直し、解説を確認できます。</p>`:'<p>今回の復習対象はありません。解説から「正解したけど迷った」を記録すると追加できます。</p>'}</section>`;
}
