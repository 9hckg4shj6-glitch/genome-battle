import { esc, icon, notebook, questionImage, richText, type Question } from './ui';
import { renderCommunityRate, renderDifficultyChip } from './stats';
import { stateOf, type Mastery, type QuestionState } from './mastery';
import { renderCourseGuideButton } from './course-guide';
import { renderYearPicker, validYear, yearName } from './years';
import { answerOf, loadAnswer } from './answers';
import { bookmark, catalogMode, isRead, markRead, readMap } from './reading';

// 過去問・問題と解説。問題文は手元の questions.json、正答と解説は開いた問題だけサーバから取得する。
// 「読んで学ぶ」（既定）では読むことに集中できるよう、演習に選ぶ四角と演習バーを出さない。
const failed = new Set<string>();
const opened = new Set<string>();
let catalogField = '';
let catalogYear = 0; // 0 はすべての年度
// 一度に並べる問題数。100問なら20ページになる。
const PAGE_SIZE = 5;
let catalogPage = 0;
let catalogQuery = '';
let catalogStatus: CatalogStatus = 'all';
// 演習に選んだ問題。絞り込みやページを替えても保ち、問題番号の順に出題する。
const picked = new Set<string>();
let pickShuffle = false;
// 1回の演習で選べる上限。
export const PICK_LIMIT = 100;

// 学習状態での絞り込み。習得は定着も含む。誤答は復習ノートの「誤答・わからなかった問題」。未読は解説をまだ開いていない問題。
export type CatalogStatus = 'all' | 'unread' | 'new' | 'missed' | 'learning' | 'mastered';
const STATUSES: { id: CatalogStatus; label: string }[] = [
  { id: 'all', label: 'すべて' }, { id: 'unread', label: '解説未読' }, { id: 'new', label: '未着手' }, { id: 'missed', label: '誤答' },
  { id: 'learning', label: '取り組み中' }, { id: 'mastered', label: '習得' },
];
const STATE_LABELS: Record<QuestionState, string> = { new: '未着手', learning: '取り組み中', mastered: '習得', settled: '定着' };
// 問題番号は年度ごとの 1〜100。
export interface CatalogEntry { q: Question; no: number; state: QuestionState; missed: boolean; read: boolean; }

// 全角半角・大文字小文字・カタカナとひらがなの違いを無視して比べる。
const fold = (s: string): string => s.toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = (s: string): string => fold(s.normalize('NFKC'));
export const searchTerms = (query: string): string[] => norm(query).split(/\s+/).filter(Boolean);
// 問題文・選択肢・分野名のどれかに全語が含まれる問題。数字だけの語は問題番号・年度とも一致する。
export function matchesTerms(e: CatalogEntry, terms: string[]): boolean {
  if (!terms.length) return true;
  const text = norm([e.q.question, ...e.q.choices, e.q.field].join('\n'));
  return terms.every(t => text.includes(t) || /^\d+$/.test(t) && (Number(t) === e.no || Number(t) === e.q.year));
}
export const matchesStatus = (e: CatalogEntry, status: CatalogStatus): boolean =>
  status === 'all' || (status === 'unread' ? !e.read : status === 'missed' ? e.missed : status === 'mastered' ? e.state === 'mastered' || e.state === 'settled' : e.state === status);
export function catalogEntries(questions: Map<string, Question>, m: Mastery | null, nb = notebook(), read = readMap()): CatalogEntry[] {
  return [...questions.values()].map(q => ({ q, no: q.no, state: stateOf(m, q.id, nb.uncertain), missed: !!nb.missed[q.id], read: isRead(q.id, read) }));
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
  const a = answerOf(q.id);
  const terms = searchTerms(catalogQuery);
  const choices = `<ol class="review-choices">${q.choices.map((c, n) => `<li class="${a?.answer === n ? 'correct' : ''}"><span class="num">${n + 1}</span>${highlight(c, terms)}${a?.answer === n ? '<b class="catalog-answer-mark">正解</b>' : ''}</li>`).join('')}</ol>`;
  const detail = a ? `<div class="expl">${richText(a.explanation)}</div>${renderCommunityRate(q.id)}`
    : failed.has(q.id) ? `<p class="error" role="alert">解答・解説を取得できませんでした。</p><button class="btn" data-catalog-retry="${esc(q.id)}">再取得する</button>`
    : `<p class="catalog-loading" role="status"><span class="spinner mini"></span>解答・解説を読み込み中…</p>`;
  return `${questionImage(q, true)}${choices}${detail}<div class="catalog-practice-one"><button class="btn" data-reader-from="${esc(q.id)}">${icon('play')}ここから1問ずつ読む</button><button class="btn primary" data-catalog-practice="${esc(q.id)}">${icon('book')}この問題を演習する${icon('arrow')}</button></div>`;
};

// 一覧の上部の切り替え。読む人には四角と演習バーを出さない。
const MODES = [
  { id: 'read', label: '読んで学ぶ', sub: '問題と解説を読む', icon: 'book' },
  { id: 'pick', label: '選んで演習', sub: '問題を選んで解く', icon: 'check' },
] as const;
const modeSwitch = (): string => `<fieldset class="catalog-mode"><legend>一覧の使い方</legend><div class="catalog-mode-options">${MODES.map(o => {
  const on = catalogMode() === o.id;
  return `<label class="catalog-mode-option${on ? ' on' : ''}"><input type="radio" name="catalog-mode" value="${o.id}" ${on ? 'checked' : ''}/><span class="catalog-mode-icon" aria-hidden="true">${icon(o.icon)}</span><span><strong>${o.label}</strong><small>${o.sub}</small></span></label>`;
}).join('')}</div></fieldset>`;

// 読んだ解説の進み具合（年度ごと）と、しおりからの再開。
function readingPanel(questions: Map<string, Question>): string {
  const read = readMap();
  const list = [...questions.values()];
  const years = [...new Set(list.map(q => q.year))].sort((a, b) => b - a);
  const rows = years.map(y => {
    const qs = list.filter(q => q.year === y), n = qs.filter(q => read[q.id]).length;
    return `<li><span>${yearName(y)}</span><span class="reading-bar" role="progressbar" aria-label="${yearName(y)}の解説を読んだ割合" aria-valuemin="0" aria-valuemax="${qs.length}" aria-valuenow="${n}"><i style="width:${100 * n / qs.length}%"></i></span><b>${n}<small>/${qs.length}</small></b></li>`;
  }).join('');
  const b = bookmark(id => questions.has(id));
  const at = b ? questions.get(b.id)! : null;
  const resume = b && at ? `<button class="btn primary reading-resume" data-act="reader-resume">${icon('play')}<span>続きから読む<small>${esc(b.label)} · ${at.year}年度 第${at.no}問（${b.ids.indexOf(b.id) + 1}/${b.ids.length}）</small></span>${icon('arrow')}</button>` : '';
  return `<section class="panel reading-panel" aria-labelledby="reading-panel-heading"><div class="reading-panel-head"><h2 id="reading-panel-heading">${icon('book')}解説を読んだ問題</h2><p>解説を開くと「読んだ」が付きます。この端末に保存され、正答率や学習レベルには入りません。</p></div><ul class="reading-progress">${rows}</ul>${resume}</section>`;
}

export const readBadge = '<span class="catalog-state st-read">読んだ</span>';

export function renderCatalog(questions: Map<string, Question>, m: Mastery | null, busy = false, error = ''): string {
  const list = [...questions.values()];
  const fields = [...new Set(list.map(q => q.field))];
  catalogYear = validYear(questions, catalogYear);
  // 分野の件数は選んだ年度の中で数える。
  const inYear = list.filter(q => !catalogYear || q.year === catalogYear);
  const reading = catalogMode() === 'read';
  return `${renderCourseGuideButton('catalog')}<header class="hero small"><p class="eyebrow">QUESTION LIST</p><h1>過去問・問題と解説</h1><p class="lead">アプリに収録している全${list.length}問を、キーワード・年度・分野・学習状態で絞り込んで閲覧できます。${reading ? '問題を押すと正解と解説を表示します。「1問ずつ読む」で、解説を順番に読み進められます。' : '右端の四角を押して選んだ問題を、そのまま演習できます。'}</p></header>
    ${modeSwitch()}${reading ? readingPanel(questions) : ''}
    <div class="panel catalog-tools">
      <label class="field catalog-search"><span>キーワードで探す</span><span class="catalog-search-box">${icon('zoom')}<input id="catalog-search" type="search" value="${esc(catalogQuery)}" placeholder="例：PCR、塩基配列、12" enterkeyhint="search" autocomplete="off" aria-describedby="catalog-search-hint"/></span><small id="catalog-search-hint">問題文・選択肢・分野名から探します。スペースで区切ると、すべての語を含む問題に絞ります。数字は問題番号・年度でも探せます。</small></label>
      ${renderYearPicker({ name: 'catalog-year', label: '年度で絞り込む', questions, year: catalogYear, compact: true })}
      <label class="field"><span>分野で絞り込む</span><select id="catalog-field" aria-label="分野で絞り込む"><option value="">すべての分野（${inYear.length}問）</option>${fields.map(f => `<option value="${esc(f)}" ${f === catalogField ? 'selected' : ''}>${esc(f)}（${inYear.filter(q => q.field === f).length}問）</option>`).join('')}</select></label></div>
    <div id="catalog-filtered">${renderFiltered(questions, m, busy, error)}</div>`;
}

// 問題文に無い語が選択肢で一致したとき、閉じたままでも一致箇所が分かるよう該当の選択肢を添える。
function choiceHits(q: Question, terms: string[]): string {
  const missing = terms.filter(t => !norm(q.question).includes(t));
  if (!missing.length) return '';
  const hits = q.choices.filter(ch => missing.some(t => norm(ch).includes(t)));
  return hits.length ? `<span class="catalog-hit">選択肢：${hits.map(ch => highlight(ch, terms)).join(' / ')}</span>` : '';
}

// 検索語・学習状態に応じて変わる部分。入力のたびにここだけを差し替え、検索欄のフォーカスや変換中の文字を保つ。
export function filteredEntries(questions: Map<string, Question>, m: Mastery | null): { base: CatalogEntry[]; shown: CatalogEntry[] } {
  const terms = searchTerms(catalogQuery);
  const base = catalogEntries(questions, m).filter(e => (!catalogYear || e.q.year === catalogYear) && (!catalogField || e.q.field === catalogField) && matchesTerms(e, terms));
  return { base, shown: base.filter(e => matchesStatus(e, catalogStatus)) };
}

function renderFiltered(questions: Map<string, Question>, m: Mastery | null, busy: boolean, error: string): string {
  const terms = searchTerms(catalogQuery);
  const { base, shown } = filteredEntries(questions, m);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  catalogPage = Math.min(Math.max(catalogPage, 0), pages - 1);
  const start = catalogPage * PAGE_SIZE;
  const chips = `<fieldset class="catalog-status-filter"><legend>学習状態で絞り込む</legend><div class="catalog-status-options">${STATUSES.map(s => {
    const n = base.filter(e => matchesStatus(e, s.id)).length;
    const off = !m && s.id !== 'all' && s.id !== 'missed' && s.id !== 'unread';
    return `<label class="catalog-status-option${s.id === catalogStatus ? ' on' : ''}${off ? ' off' : ''}"><input type="radio" name="catalog-status" value="${s.id}"${s.id === catalogStatus ? ' checked' : ''}${off ? ' disabled' : ''}/><span>${s.label}</span><b>${off ? '–' : n}</b></label>`;
  }).join('')}</div><small>${m ? '解説未読＝まだ解説を開いていない問題 · 習得＝直近2回連続で正解（定着も含む）· 誤答＝復習ノートの誤答・わからなかった問題' : '学習記録を読み込むと、未着手・取り組み中・習得でも絞り込めます。'}</small></fieldset>`;
  const full = picked.size >= PICK_LIMIT;
  const choosing = catalogMode() === 'pick';
  const items = shown.slice(start, start + PAGE_SIZE).map(({ q, no, state, missed, read }) => {
    const badges = `${read ? readBadge : ''}${state !== 'new' ? `<span class="catalog-state st-${state}">${STATE_LABELS[state]}</span>` : ''}${missed ? '<span class="catalog-state st-missed">誤答</span>' : ''}`;
    const on = choosing && picked.has(q.id);
    const pick = !choosing ? '' : `<label class="catalog-pick" title="${on ? '演習から外す' : '演習に選ぶ'}"><input type="checkbox" data-catalog-pick="${esc(q.id)}" aria-label="${q.year}年度 第${no}問を演習に選ぶ" ${on ? 'checked' : ''} ${busy || full && !on ? 'disabled' : ''}/><span class="catalog-pick-box" aria-hidden="true">${icon('check')}</span></label>`;
    return `<div class="catalog-item${on ? ' picked' : ''}">${pick}<details class="catalog-detail" data-catalog-id="${esc(q.id)}" ${opened.has(q.id) ? 'open' : ''}><summary><span class="catalog-no"><small>${q.year}</small>${no}</span><span class="catalog-summary"><span class="catalog-meta"><span class="catalog-field">${highlight(q.field, terms)}</span>${renderDifficultyChip(q.id)}${badges}</span><span class="catalog-q">${highlight(q.question, terms)}</span>${choiceHits(q, terms)}</span><span class="catalog-toggle" aria-hidden="true">${icon('arrow')}</span></summary><div class="catalog-body" data-catalog-body="${esc(q.id)}">${opened.has(q.id) ? body(q) : ''}</div></details></div>`;
  }).join('');
  const filtered = !!terms.length || !!catalogYear || !!catalogField || catalogStatus !== 'all';
  const status = `<p id="catalog-page-status" class="catalog-page-status" tabindex="-1" aria-live="polite">${shown.length ? `<b>${catalogPage + 1}</b> / ${pages}ページ<span>${shown.length}問中 ${start + 1}–${Math.min(start + PAGE_SIZE, shown.length)}問目</span>` : '<span class="catalog-none-count">該当 0問</span>'}</p>`;
  const empty = `<div class="rooms-empty catalog-empty"><span>${icon('zoom')}</span><p>条件に合う問題がありません。</p><small>別のキーワードを試すか、年度・分野・学習状態の絞り込みを外してください。解説の本文は検索の対象外です。</small><button class="btn" data-act="catalog-clear">条件をすべてクリア</button></div>`;
  // 読むモードは「この条件を1問ずつ読む」、選ぶモードは「この条件の問題を選ぶ」を一覧の上に置く。
  const unread = shown.filter(e => !e.read).length;
  const lead = !shown.length ? '' : choosing ? pickTools(shown, busy)
    : `<div class="catalog-lead-row reader-start-row"><p><b>${shown.length}</b>問を順番に読む<small>${unread ? `解説未読 ${unread}問 · 未読の問題から始めます` : 'すべて読みました · 最初の問題から始めます'}</small></p><button class="btn primary" data-act="reader-start">${icon('play')}1問ずつ読む${icon('arrow')}</button></div>`;
  return `${chips}${status}${lead}${shown.length ? `<div class="catalog-list${choosing ? '' : ' reading'}">${items}</div>${pager(pages)}` : empty}${shown.length && filtered ? '<button class="btn ghost catalog-clear" data-act="catalog-clear">絞り込みをすべてクリア</button>' : ''}${choosing ? pickBar(busy, error) : error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}`;
}

// 選ぶモードで一覧の上に置く操作。まとめて選ぶボタンはここに置き、画面下のバーは選んだあとだけ出す。
function pickTools(shown: CatalogEntry[], busy: boolean): string {
  const n = picked.size;
  const addable = shown.filter(e => !picked.has(e.q.id)).length;
  const room = PICK_LIMIT - n;
  const note = n >= PICK_LIMIT ? `1回の演習は${PICK_LIMIT}問までです。` : '問題の右端の四角を押して、演習する問題を選びましょう。';
  return `<div class="catalog-lead-row catalog-pick-tools"><p>${note}</p><button class="btn" data-act="catalog-pick-shown" ${busy || !addable || room <= 0 ? 'disabled' : ''}>${addable > room && room > 0 ? `この条件から${room}問を選ぶ` : `この条件の${addable}問を選ぶ`}</button></div>`;
}

// 選んだ問題を演習するバー。1問以上選んだときだけ画面下に留まる。
function pickBar(busy: boolean, error: string): string {
  const n = picked.size;
  if (!n) return error ? `<p class="error" role="alert">${esc(error)}</p>` : '';
  const note = n >= PICK_LIMIT ? `1回の演習は${PICK_LIMIT}問までです。` : '右端の四角を押して追加・解除できます。';
  return `<section class="catalog-pickbar active" aria-label="選んだ問題の演習">
    <div class="catalog-pickbar-head"><p role="status"><b>${n}</b>問を選択中<small>${note}</small></p>
      <label class="catalog-shuffle"><input type="checkbox" id="catalog-shuffle" ${pickShuffle ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>ランダムな順で出題</span></label></div>
    <div class="catalog-pickbar-actions">
      <button class="btn ghost" data-act="catalog-pick-clear" ${busy ? 'disabled' : ''}>選択を解除</button>
      <button class="btn primary" data-act="catalog-practice" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner mini"></span>準備中…' : `${icon('book')}選んだ${n}問を演習する${icon('arrow')}`}</button></div>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}</section>`;
}

export function togglePick(id: string, on: boolean): void { if (on && picked.size < PICK_LIMIT) picked.add(id); else if (!on) picked.delete(id); }
// 絞り込み結果のうち、まだ選んでいない問題を番号順に上限まで加える。
export function pickShown(questions: Map<string, Question>, m: Mastery | null): void {
  for (const e of filteredEntries(questions, m).shown) { if (picked.size >= PICK_LIMIT) break; picked.add(e.q.id); }
}
export function clearPicks(): void { picked.clear(); }
export function setPickShuffle(on: boolean): void { pickShuffle = on; }
export const pickShuffled = (): boolean => pickShuffle;
// 選んだ問題を問題番号の順に返す。
export const pickedIds = (questions: Map<string, Question>): string[] => [...questions.keys()].filter(id => picked.has(id));

// 検索語の入力・学習記録の更新時に、絞り込み結果だけを描き直す。選んでいた状態ボタンのフォーカスは戻す。
export function updateCatalogResults(questions: Map<string, Question>, m: Mastery | null, busy = false, error = ''): void {
  const region = document.getElementById('catalog-filtered');
  if (!region) return;
  const active = document.activeElement instanceof HTMLInputElement && region.contains(document.activeElement) ? document.activeElement : null;
  region.innerHTML = renderFiltered(questions, m, busy, error);
  if (active?.name === 'catalog-status') region.querySelector<HTMLInputElement>(`input[name="catalog-status"][value="${CSS.escape(active.value)}"]`)?.focus();
  else if (active?.dataset.catalogPick) region.querySelector<HTMLInputElement>(`input[data-catalog-pick="${CSS.escape(active.dataset.catalogPick)}"]`)?.focus();
  else if (active?.id) document.getElementById(active.id)?.focus();
}

// 全ページ番号（10個ずつ2段）と、その下に前後ボタン。
const pager = (pages: number): string => pages < 2 ? '' : `<nav class="catalog-pager" aria-label="ページ切り替え">
    <div class="catalog-pages">${Array.from({ length: pages }, (_, n) => `<button class="catalog-page" data-catalog-page="${n}" aria-label="${n + 1}ページ目" ${n === catalogPage ? 'aria-current="page"' : ''}>${n + 1}</button>`).join('')}</div>
    <button class="btn catalog-step" data-catalog-page="${catalogPage - 1}" ${catalogPage === 0 ? 'disabled' : ''}>${icon('back')}前の${PAGE_SIZE}問</button>
    <button class="btn catalog-step" data-catalog-page="${catalogPage + 1}" ${catalogPage === pages - 1 ? 'disabled' : ''}>次の${PAGE_SIZE}問${icon('arrow')}</button>
  </nav>`;

export function setCatalogField(field: string): void { catalogField = field; catalogPage = 0; }
export function setCatalogYear(year: string): void { catalogYear = Number(year) || 0; catalogPage = 0; }
export function setCatalogQuery(query: string): void { if (query !== catalogQuery) { catalogQuery = query; catalogPage = 0; } }
export function setCatalogStatus(status: string): void { catalogStatus = STATUSES.some(s => s.id === status) ? status as CatalogStatus : 'all'; catalogPage = 0; }
export function clearCatalogFilters(): void { catalogQuery = ''; catalogYear = 0; catalogField = ''; catalogStatus = 'all'; catalogPage = 0; }
export function setCatalogPage(page: number): void { catalogPage = page; }

// 開閉時に呼ぶ。開いた問題の本文だけを差し替え、ほかの問題の開閉やスクロール位置は保つ。
// 解説を表示できたら「読んだ」を記録し、見出しにも印を付ける（一覧全体は描き直さない）。
export async function toggleCatalogItem(q: Question, open: boolean): Promise<void> {
  if (!open) { opened.delete(q.id); return; }
  opened.add(q.id);
  const update = (): void => {
    const el = document.querySelector<HTMLElement>(`[data-catalog-body="${CSS.escape(q.id)}"]`);
    if (el) el.innerHTML = body(q);
  };
  const shown = (): void => {
    update();
    if (!markRead(q.id)) return;
    const meta = document.querySelector<HTMLElement>(`[data-catalog-id="${CSS.escape(q.id)}"] .catalog-meta`);
    if (meta && !meta.querySelector('.st-read')) meta.insertAdjacentHTML('beforeend', readBadge);
  };
  if (answerOf(q.id)) return shown();
  failed.delete(q.id); update();
  try { await loadAnswer(q.id); }
  catch { failed.add(q.id); return update(); }
  if (opened.has(q.id)) shown();
}
