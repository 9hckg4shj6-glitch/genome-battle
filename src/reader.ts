import { esc, icon, notebook, questionImage, richText, toggleSaved, type Question } from './ui';
import { renderCommunityRate, renderDifficultyChip } from './stats';
import { answerOf, answerLoading, loadAnswer } from './answers';
import { hideAnswers, isRead, markRead, setBookmark } from './reading';

// 解説リーダー。過去問一覧で絞り込んだ問題を、1問ずつ「問題 → 正解 → 解説」の順に読み進める。
// 読むための画面なので、選択肢を押しても記録（正答率・学習レベル・復習ノートの誤答）には残さない。
interface Session { ids: string[]; index: number; label: string; revealed: boolean; guess: number | null; failed: boolean; }
let s: Session | null = null;

// startId が無ければ、まだ解説を読んでいない最初の問題から始める（すべて読んでいれば先頭）。
export function openReader(questions: Map<string, Question>, ids: string[], label: string, startId?: string): boolean {
  const list = ids.filter(id => questions.has(id));
  if (!list.length) return false;
  let index = startId ? list.indexOf(startId) : list.findIndex(id => !isRead(id));
  if (index < 0) index = 0;
  s = { ids: list, index, label, revealed: false, guess: null, failed: false };
  return true;
}
export const readerOpen = (): boolean => !!s;
export const closeReader = (): void => { s = null; };
export const readerAtEnd = (): boolean => !!s && s.index === s.ids.length - 1;
export function stepReader(delta: number): boolean {
  if (!s) return false;
  const next = s.index + delta;
  if (next < 0 || next >= s.ids.length) return false;
  Object.assign(s, { index: next, revealed: false, guess: null, failed: false });
  return true;
}
// 選択肢を押したときは、その選択を添えて正解と解説を開く。
export function revealReader(guess?: number): void {
  if (!s || s.revealed) return;
  s.revealed = true;
  if (guess !== undefined) s.guess = guess;
}
export function retryReader(): void { if (s) s.failed = false; }
export function saveReaderQuestion(): void {
  const id = s?.ids[s.index], a = id ? answerOf(id) : undefined;
  if (id && a) toggleSaved({ id, answer: a.answer, explanation: a.explanation, my_choice: null });
}

// 描画のあとに呼ぶ。表示中の問題の正解・解説を取得し、解説が見えたら「読んだ」としおりを記録する。
// 次の問題の解説も先に取得しておき、「次の問題へ」で待たせない。update は取得後に本文だけを描き直す。
export function syncReader(update: () => void): void {
  if (!s) return;
  const session = s, id = session.ids[session.index];
  setBookmark({ ids: session.ids, id, label: session.label });
  const next = session.ids[session.index + 1];
  if (answerOf(id)) {
    if (!hideAnswers() || session.revealed) markRead(id);
    if (next) void loadAnswer(next).catch(() => { /* 開いたときに取得し直す */ });
    return;
  }
  if (session.failed || answerLoading(id)) return;
  loadAnswer(id).then(() => { if (s === session && session.ids[session.index] === id) update(); })
    .catch(() => { if (s === session && session.ids[session.index] === id) { session.failed = true; update(); } });
}

export function renderReader(questions: Map<string, Question>): string {
  if (!s) return '';
  const pos = s.index + 1, total = s.ids.length;
  const hide = hideAnswers();
  return `<header class="reader-head"><p class="eyebrow">READING · ${esc(s.label)}</p>
    <div class="reader-progress"><p><b>${pos}</b><small> / ${total}問</small></p><span class="reader-bar" role="progressbar" aria-label="読み進めた問題" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${pos}"><i style="width:${100 * pos / total}%"></i></span></div>
    <label class="room-privacy reader-hide"><input id="reader-hide" type="checkbox" ${hide ? 'checked' : ''}/><span><strong>${icon('target')}答えを隠して読む</strong><small>自分で答えを考えてから、選択肢か「正解と解説を見る」で確かめます</small></span><span class="privacy-switch" aria-hidden="true"></span></label></header>
    <div id="reader-card">${renderReaderCard(questions)}</div>
    ${renderReaderNav(questions)}`;
}

export function renderReaderCard(questions: Map<string, Question>): string {
  if (!s) return '';
  const id = s.ids[s.index], q = questions.get(id)!;
  const a = answerOf(id);
  const visible = !hideAnswers() || s.revealed;
  const read = isRead(id);
  const choices = !visible
    ? `<div class="choices reader-guess">${q.choices.map((c, n) => `<button class="choice" data-reader-choice="${n}"><span class="num">${n + 1}</span><span>${esc(c)}</span></button>`).join('')}</div>
      <button class="btn reader-reveal" data-act="reader-reveal">${icon('zoom')}正解と解説を見る</button>`
    : `<ol class="review-choices">${q.choices.map((c, n) => `<li class="${a?.answer === n ? 'correct' : ''} ${a && s!.guess === n && n !== a.answer ? 'wrong' : ''}"><span class="num">${n + 1}</span>${esc(c)}${a?.answer === n ? '<b class="catalog-answer-mark">正解</b>' : ''}</li>`).join('')}</ol>`;
  const verdict = visible && a && s.guess !== null
    ? `<p class="reader-verdict ${s.guess === a.answer ? 'ok' : 'ng'}" role="status">${s.guess === a.answer ? '○ 正解です' : `× 不正解 · 正解は ${a.answer + 1}`}<small>読むための画面なので、記録には残りません</small></p>` : '';
  const detail = !visible ? ''
    : a ? `<div class="expl">${richText(a.explanation)}</div>${renderCommunityRate(id)}`
    : s.failed ? `<p class="error" role="alert">解答・解説を取得できませんでした。</p><button class="btn" data-act="reader-retry">再取得する</button>`
    : `<p class="catalog-loading" role="status"><span class="spinner mini"></span>解答・解説を読み込み中…</p>`;
  const saved = !!notebook().saved[id];
  const actions = visible ? `<div class="reader-actions"><button class="btn ghost save-btn ${saved ? 'on' : ''}" data-act="reader-save" aria-pressed="${saved}" ${a ? '' : 'disabled'}>${icon('bookmark')}${saved ? '復習ノートに保存済み' : 'あとで解く（復習ノートに保存）'}</button><button class="btn" data-catalog-practice="${esc(id)}">${icon('book')}この問題を演習する</button></div>` : '';
  return `<article class="panel reader-card" data-reader-card>
    <div class="reader-meta"><span class="reader-no">${q.year}年度 第${q.no}問</span><span class="catalog-field">${esc(q.field)}</span>${renderDifficultyChip(id)}${read ? '<span class="catalog-state st-read">読んだ</span>' : ''}</div>
    <p class="reader-q">${esc(q.question)}</p>${questionImage(q)}${choices}${verdict}${detail}${actions}</article>`;
}

// 前後の移動。画面下に留め、最後の問題では一覧へ戻る。左右のスワイプ・矢印キーでも移動できる。
function renderReaderNav(questions: Map<string, Question>): string {
  if (!s) return '';
  const next = questions.get(s.ids[s.index + 1] ?? '');
  return `<nav class="reader-nav" aria-label="問題の移動">
    <button class="btn" data-act="reader-prev" ${s.index === 0 ? 'disabled' : ''}>${icon('back')}前へ</button>
    ${next ? `<button class="btn primary" data-act="reader-next"><span>次の問題へ<small>${next.year}年度 第${next.no}問</small></span>${icon('arrow')}</button>`
      : `<button class="btn primary" data-act="reader-finish"><span>読み終えて一覧へ<small>${s.ids.length}問を読みました</small></span>${icon('check')}</button>`}
  </nav>`;
}
