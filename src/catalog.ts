import { call } from './api';
import { esc, icon, questionImage, richText, type Question } from './ui';
import { renderCommunityRate, renderDifficultyChip } from './stats';

// 過去問・問題と解説。問題文は手元の questions.json、正答と解説は開いた問題だけサーバから取得する。
interface Answer { answer: number; explanation: string; }
const answers = new Map<string, Answer>();
const loading = new Set<string>();
const failed = new Set<string>();
const opened = new Set<string>();
let catalogField = '';
// 一度に並べる問題数。100問なら20ページになる。
const PAGE_SIZE = 5;
let catalogPage = 0;

const body = (q: Question): string => {
  const a = answers.get(q.id);
  const choices = `<ol class="review-choices">${q.choices.map((c, n) => `<li class="${a?.answer === n ? 'correct' : ''}"><span class="num">${n + 1}</span>${esc(c)}${a?.answer === n ? '<b class="catalog-answer-mark">正解</b>' : ''}</li>`).join('')}</ol>`;
  const detail = a ? `<div class="expl">${richText(a.explanation)}</div>${renderCommunityRate(q.id)}`
    : failed.has(q.id) ? `<p class="error" role="alert">解答・解説を取得できませんでした。</p><button class="btn" data-catalog-retry="${esc(q.id)}">再取得する</button>`
    : `<p class="catalog-loading" role="status"><span class="spinner mini"></span>解答・解説を読み込み中…</p>`;
  return `${questionImage(q, true)}${choices}${detail}`;
};

export function renderCatalog(questions: Map<string, Question>): string {
  const list = [...questions.values()];
  const fields = [...new Set(list.map(q => q.field))];
  const shown = list.filter(q => !catalogField || q.field === catalogField);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  catalogPage = Math.min(Math.max(catalogPage, 0), pages - 1);
  const start = catalogPage * PAGE_SIZE;
  const items = shown.slice(start, start + PAGE_SIZE).map(q => {
    const no = list.indexOf(q) + 1;
    return `<details class="catalog-item" data-catalog-id="${esc(q.id)}" ${opened.has(q.id) ? 'open' : ''}><summary><span class="catalog-no">${no}</span><span class="catalog-summary"><span class="catalog-meta"><span class="catalog-field">${esc(q.field)}</span>${renderDifficultyChip(q.id)}</span><span class="catalog-q">${esc(q.question)}</span></span><span class="catalog-toggle" aria-hidden="true">${icon('arrow')}</span></summary><div class="catalog-body" data-catalog-body="${esc(q.id)}">${opened.has(q.id) ? body(q) : ''}</div></details>`;
  }).join('');
  const status = `<p id="catalog-page-status" class="catalog-page-status" tabindex="-1" aria-live="polite"><b>${catalogPage + 1}</b> / ${pages}ページ<span>${shown.length}問中 ${start + 1}–${Math.min(start + PAGE_SIZE, shown.length)}問目</span></p>`;
  return `<header class="hero small"><p class="eyebrow">QUESTION LIST</p><h1>過去問・問題と解説</h1><p class="lead">アプリに収録している全${list.length}問を、${PAGE_SIZE}問ずつのページで閲覧できます。問題を押すと、正解と解説を表示します。</p></header>
    <div class="panel catalog-tools"><button class="btn ghost" data-act="catalog-back">${icon('back')}一人で学習に戻る</button><label class="field"><span>分野で絞り込む</span><select id="catalog-field" aria-label="分野で絞り込む"><option value="">すべての分野（${list.length}問）</option>${fields.map(f => `<option value="${esc(f)}" ${f === catalogField ? 'selected' : ''}>${esc(f)}（${list.filter(q => q.field === f).length}問）</option>`).join('')}</select></label></div>
    ${status}<div class="catalog-list">${items}</div>${pager(pages)}`;
}

// 全ページ番号（10個ずつ2段）と、その下に前後ボタン。
const pager = (pages: number): string => pages < 2 ? '' : `<nav class="catalog-pager" aria-label="ページ切り替え">
    <div class="catalog-pages">${Array.from({ length: pages }, (_, n) => `<button class="catalog-page" data-catalog-page="${n}" aria-label="${n + 1}ページ目" ${n === catalogPage ? 'aria-current="page"' : ''}>${n + 1}</button>`).join('')}</div>
    <button class="btn catalog-step" data-catalog-page="${catalogPage - 1}" ${catalogPage === 0 ? 'disabled' : ''}>${icon('back')}前の${PAGE_SIZE}問</button>
    <button class="btn catalog-step" data-catalog-page="${catalogPage + 1}" ${catalogPage === pages - 1 ? 'disabled' : ''}>次の${PAGE_SIZE}問${icon('arrow')}</button>
  </nav>`;

export function setCatalogField(field: string): void { catalogField = field; catalogPage = 0; }
export function setCatalogPage(page: number): void { catalogPage = page; }

// 開閉時に呼ぶ。開いた問題の本文だけを差し替え、ほかの問題の開閉やスクロール位置は保つ。
export async function toggleCatalogItem(q: Question, open: boolean): Promise<void> {
  if (!open) { opened.delete(q.id); return; }
  opened.add(q.id);
  const update = (): void => {
    const el = document.querySelector<HTMLElement>(`[data-catalog-body="${CSS.escape(q.id)}"]`);
    if (el) el.innerHTML = body(q);
  };
  if (answers.has(q.id) || loading.has(q.id)) return update();
  loading.add(q.id); failed.delete(q.id); update();
  try {
    const a = await call<Answer | null>('get_question_answer', { p_id: q.id });
    if (!a) throw new Error('QUESTION_NOT_FOUND');
    answers.set(q.id, { answer: a.answer, explanation: a.explanation });
  } catch { failed.add(q.id); }
  finally { loading.delete(q.id); update(); }
}
