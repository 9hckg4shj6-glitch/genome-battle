import { call } from './api';
import { esc, icon } from './ui';

export interface SavedStudy {
  id: string; field: string; q_total: number; answered: number;
  phase: 'question'|'reveal'; updated_at: string;
}

export function renderSavedStudies(studies: SavedStudy[], loading: boolean, error: boolean, notice=''): string {
  if (!studies.length && !loading && !error && !notice) return '';
  const card=(s:SavedStudy):string=>`<article class="saved-study"><div><h3>${esc(s.field)}</h3><p>${s.answered} / ${s.q_total}問に取り組み済み · 残り${s.q_total-s.answered}問${s.phase==='reveal'?' · 解説から再開':''}</p></div><button class="btn primary" data-resume-study="${esc(s.id)}" aria-label="続きから再開：${esc(s.field)}、${s.answered} / ${s.q_total}問">続きから再開${icon('arrow')}</button></article>`;
  return `<section class="saved-studies" aria-labelledby="saved-study-heading"><p class="eyebrow">CONTINUE STUDY</p><h2 id="saved-study-heading">保存した学習の続き</h2>${notice?`<p class="saved-study-notice" role="status">${esc(notice)}</p>`:''}${studies.slice(0,3).map(card).join('')}${studies.length>3?`<details><summary>ほかの保存した学習（${studies.length-3}件）</summary>${studies.slice(3).map(card).join('')}</details>`:''}${loading?'<p role="status">保存した学習を確認中…</p>':''}${error?'<p role="alert">保存した学習を取得できませんでした。接続を確認して、もう一度お試しください。</p><button class="btn" data-act="refresh-saved-studies">再取得する</button>':''}<p class="saved-study-help">問題順・後回し・解説の状態を保存しています。同じブラウザで後から再開できます。</p></section>`;
}

export const getSavedStudies=(device:string):Promise<SavedStudy[]>=>call<SavedStudy[]>('list_saved_studies',{p_device:device});
