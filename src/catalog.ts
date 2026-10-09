import { call } from './api';
import { esc, icon, notebook, questionImage, richText, type Question } from './ui';
import { renderCommunityRate, renderDifficultyChip } from './stats';
import { stateOf, type Mastery, type QuestionState } from './mastery';

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
let catalogQuery = '';
let catalogStatus: CatalogStatus = 'all';

// 学習状態での絞り込み。習得は定着も含む。誤答は復習ノートの「誤答・わからなかった問題」。
export type CatalogStatus = 'all' | 'new' | 'missed' | 'learning' | 'mastered';
const STATUSES: { id: CatalogStatus; label: string }[] = [
  { id: 'all', label: 'すべて' }, { id: 'new', label: '未着手' }, { id: 'missed', label: '誤答' },
  { id: 'learning', label: '取り組み中' }, { id: 'mastered', label: '習得' },
];
const STATE_LABELS: Record<QuestionState, string> = { new: '未着手', learning: '取り組み中', mastered: '習得', settled: '定着' };
export interface CatalogEntry { q: Question; no: number; state: QuestionState; missed: boolean; }

// 全角半角・大文字小文字・カタカナとひらがなの違いを無視して比べる。
const fold = (s: string): string => s.toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = (s: string): string => fold(s.normalize('NFKC'));
export const searchTerms = (query: string): string[] => norm(query).split(/\s+/).filter(Boolean);
// 問題文・選択肢・分野名のどれかに全語が含まれる問題。数字だけの語は問題番号とも一致する。
export function matchesTerms(e: CatalogEntry, terms: string[]): boolean {
  if (!terms.length) return true;
  const text = norm([e.q.question, ...e.q.choices, e.q.field].join('\n'));
  return terms.every(t => text.includes(t) || /^\d+$/.test(t) && Number(t) === e.no);
}
export const matchesStatus = (e: CatalogEntry, status: CatalogStatus): boolean =>
  status === 'all' || (status === 'missed' ? e.missed : status === 'mastered' ? e.state === 'mastered' || e.state === 'settled' : e.state === status);
export function catalogEntries(questions: Map<string, Question>, m: Mastery | null, nb = notebook()): CatalogEntry[] {
  return [...questions.values()].map((q, i) => ({ q, no: i + 1, state: stateOf(m, q.id, nb.uncertain), missed: !!nb.missed[q.id] }));
}

// 一致した語を <mark> で囲む。表記ゆれ（全角半角など）で位置がずれる場合は強調しない。
function highlight(text: string, terms: string[]): string {
  const hay = fold(text);
  if (!terms.length || hay.length !== text.length) return esc(text);
  const hits: [number, number][] = [];
  for (const t of terms) for (let i = hay.indexOf(t); t && i >= 0; i = hay.indexOf(t, i + t.length)) hits.push([i, i + t.length]);
  hits.sort((a, b) => a[0] - b[0]);
  let out = '', at = 0;
  for (const [from, to] of hits) {
    if (to <= at) continue;
    const s = Math.max(from, at);
    out += esc(text.slice(at, s)) + `<mark>${esc(text.slice(s, to))}</mark>`; at = to;
  }
  return out + esc(text.slice(at));
}

const body = (q: Question): string => {
  const a = answers.get(q.id);
  const terms = searchTerms(catalogQuery);
  const choices = `<ol class="review-choices">${q.choices.map((c, n) => `<li class="${a?.answer === n ? 'correct' : ''}"><span class="num">${n + 1}</span>${highlight(c, terms)}${a?.answer === n ? '<b class="catalog-answer-mark">正解</b>' : ''}</li>`).join('')}</ol>`;
  const detail = a ? `<div class="expl">${richText(a.explanation)}</div>${renderCommunityRate(q.id)}`
    : failed.has(q.id) ? `<p class="error" role="alert">解答・解説を取得できませんでした。</p><button class="btn" data-catalog-retry="${esc(q.id)}">再取得する</button>`
    : `<p class="catalog-loading" role="status"><span class="spinner mini"></span>解答・解説を読み込み中…</p>`;
  return `${questionImage(q, true)}${choices}${detail}`;
};

export function renderCatalog(questions: Map<string, Question>, m: Mastery | null): string {
  const list = [...questions.values()];
  const fields = [...new Set(list.map(q => q.field))];
  return `<header class="hero small"><p class="eyebrow">QUESTION LIST</p><h1>過去問・問題と解説</h1><p class="lead">アプリに収録している全${list.length}問を、キーワード・分野・学習状態で絞り込んで閲覧できます。問題を押すと、正解と解説を表示します。</p></header>
    <div class="panel catalog-tools"><button class="btn ghost" data-act="catalog-back">${icon('back')}一人で学習に戻る</button>
      <label class="field catalog-search"><span>キーワードで探す</span><span class="catalog-search-box">${icon('zoom')}<input id="catalog-search" type="search" value="${esc(catalogQuery)}" placeholder="例：PCR、塩基配列、12" enterkeyhint="search" autocomplete="off" aria-describedby="catalog-search-hint"/></span><small id="catalog-search-hint">問題文・選択肢・分野名から探します。スペースで区切ると、すべての語を含む問題に絞ります。数字は問題番号でも探せます。</small></label>
      <label class="field"><span>分野で絞り込む</span><select id="catalog-field" aria-label="分野で絞り込む"><option value="">すべての分野（${list.length}問）</option>${fields.map(f => `<option value="${esc(f)}" ${f === catalogField ? 'selected' : ''}>${esc(f)}（${list.filter(q => q.field === f).length}問）</option>`).join('')}</select></label></div>
    <div id="catalog-filtered">${renderFiltered(questions, m)}</div>`;
}

// 問題文に無い語が選択肢で一致したとき、閉じたままでも一致箇所が分かるよう該当の選択肢を添える。
function choiceHits(q: Question, terms: string[]): string {
  const missing = terms.filter(t => !norm(q.question).includes(t));
  if (!missing.length) return '';
  const hits = q.choices.filter(ch => missing.some(t => norm(ch).includes(t)));
  return hits.length ? `<span class="catalog-hit">選択肢：${hits.map(ch => highlight(ch, terms)).join(' / ')}</span>` : '';
}

// 検索語・学習状態に応じて変わる部分。入力のたびにここだけを差し替え、検索欄のフォーカスや変換中の文字を保つ。
function renderFiltered(questions: Map<string, Question>, m: Mastery | null): string {
  const terms = searchTerms(catalogQuery);
  const base = catalogEntries(questions, m).filter(e => (!catalogField || e.q.field === catalogField) && matchesTerms(e, terms));
  const shown = base.filter(e => matchesStatus(e, catalogStatus));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  catalogPage = Math.min(Math.max(catalogPage, 0), pages - 1);
  const start = catalogPage * PAGE_SIZE;
  const chips = `<fieldset class="catalog-status-filter"><legend>学習状態で絞り込む</legend><div class="catalog-status-options">${STATUSES.map(s => {
    const n = base.filter(e => matchesStatus(e, s.id)).length;
    const off = !m && s.id !== 'all' && s.id !== 'missed';
    return `<label class="catalog-status-option${s.id === catalogStatus ? ' on' : ''}${off ? ' off' : ''}"><input type="radio" name="catalog-status" value="${s.id}"${s.id === catalogStatus ? ' checked' : ''}${off ? ' disabled' : ''}/><span>${s.label}</span><b>${off ? '–' : n}</b></label>`;
  }).join('')}</div><small>${m ? '習得＝直近2回連続で正解（定着も含む）· 誤答＝復習ノートの誤答・わからなかった問題' : '学習記録を読み込むと、未着手・取り組み中・習得でも絞り込めます。'}</small></fieldset>`;
  const items = shown.slice(start, start + PAGE_SIZE).map(({ q, no, state, missed }) => {
    const badges = `${state !== 'new' ? `<span class="catalog-state st-${state}">${STATE_LABELS[state]}</span>` : ''}${missed ? '<span class="catalog-state st-missed">誤答</span>' : ''}`;
    return `<details class="catalog-item" data-catalog-id="${esc(q.id)}" ${opened.has(q.id) ? 'open' : ''}><summary><span class="catalog-no">${no}</span><span class="catalog-summary"><span class="catalog-meta"><span class="catalog-field">${highlight(q.field, terms)}</span>${renderDifficultyChip(q.id)}${badges}</span><span class="catalog-q">${highlight(q.question, terms)}</span>${choiceHits(q, terms)}</span><span class="catalog-toggle" aria-hidden="true">${icon('arrow')}</span></summary><div class="catalog-body" data-catalog-body="${esc(q.id)}">${opened.has(q.id) ? body(q) : ''}</div></details>`;
  }).join('');
  const filtered = !!terms.length || !!catalogField || catalogStatus !== 'all';
  const status = `<p id="catalog-page-status" class="catalog-page-status" tabindex="-1" aria-live="polite">${shown.length ? `<b>${catalogPage + 1}</b> / ${pages}ページ<span>${shown.length}問中 ${start + 1}–${Math.min(start + PAGE_SIZE, shown.length)}問目</span>` : '<span class="catalog-none-count">該当 0問</span>'}</p>`;
  const empty = `<div class="rooms-empty catalog-empty"><span>${icon('zoom')}</span><p>条件に合う問題がありません。</p><small>別のキーワードを試すか、分野・学習状態の絞り込みを外してください。解説の本文は検索の対象外です。</small><button class="btn" data-act="catalog-clear">条件をすべてクリア</button></div>`;
  return `${chips}${status}${shown.length ? `<div class="catalog-list">${items}</div>${pager(pages)}` : empty}${shown.length && filtered ? '<button class="btn ghost catalog-clear" data-act="catalog-clear">絞り込みをすべてクリア</button>' : ''}`;
}

// 検索語の入力・学習記録の更新時に、絞り込み結果だけを描き直す。選んでいた状態ボタンのフォーカスは戻す。
export function updateCatalogResults(questions: Map<string, Question>, m: Mastery | null): void {
  const region = document.getElementById('catalog-filtered');
  if (!region) return;
  const focused = document.activeElement instanceof HTMLInputElement && region.contains(document.activeElement) ? document.activeElement.value : null;
  region.innerHTML = renderFiltered(questions, m);
  if (focused) region.querySelector<HTMLInputElement>(`input[name="catalog-status"][value="${CSS.escape(focused)}"]`)?.focus();
}

// 全ページ番号（10個ずつ2段）と、その下に前後ボタン。
const pager = (pages: number): string => pages < 2 ? '' : `<nav class="catalog-pager" aria-label="ページ切り替え">
    <div class="catalog-pages">${Array.from({ length: pages }, (_, n) => `<button class="catalog-page" data-catalog-page="${n}" aria-label="${n + 1}ページ目" ${n === catalogPage ? 'aria-current="page"' : ''}>${n + 1}</button>`).join('')}</div>
    <button class="btn catalog-step" data-catalog-page="${catalogPage - 1}" ${catalogPage === 0 ? 'disabled' : ''}>${icon('back')}前の${PAGE_SIZE}問</button>
    <button class="btn catalog-step" data-catalog-page="${catalogPage + 1}" ${catalogPage === pages - 1 ? 'disabled' : ''}>次の${PAGE_SIZE}問${icon('arrow')}</button>
  </nav>`;

export function setCatalogField(field: string): void { catalogField = field; catalogPage = 0; }
export function setCatalogQuery(query: string): void { if (query !== catalogQuery) { catalogQuery = query; catalogPage = 0; } }
export function setCatalogStatus(status: string): void { catalogStatus = STATUSES.some(s => s.id === status) ? status as CatalogStatus : 'all'; catalogPage = 0; }
export function clearCatalogFilters(): void { catalogQuery = ''; catalogField = ''; catalogStatus = 'all'; catalogPage = 0; }
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
