import { esc, icon, readStore, writeStore, notebook, type Question } from './ui';

// 学習レベル・分野マスタリー・試験準備度。XPと問題ごとの状態はサーバー（get_mastery）が
// 一人学習・復習の記録から計算する。「迷った」は端末保存なので、ここで習得から外す。
export type ServerState = 'learning' | 'mastered' | 'settled';
export type QuestionState = 'new' | ServerState;
export interface Mastery { xp: number; xp_today: number; session_xp?: number | null; states: Record<string, ServerState>; }

const STATES: ServerState[] = ['learning', 'mastered', 'settled'];
const count = (n: unknown): boolean => Number.isInteger(n) && (n as number) >= 0;
export function validMastery(m: unknown): m is Mastery {
  const v = m as Mastery | null;
  return !!v && count(v.xp) && count(v.xp_today) && typeof v.states === 'object' && v.states !== null
    && Object.values(v.states).every(s => STATES.includes(s));
}
export function cachedMastery(device: string): Mastery | null {
  try { const m: unknown = JSON.parse(readStore(`gb.mastery.${device}`) ?? 'null'); return validMastery(m) ? m : null; }
  catch { return null; }
}
export const cacheMastery = (device: string, m: Mastery): void =>
  writeStore(`gb.mastery.${device}`, JSON.stringify({ xp: m.xp, xp_today: m.xp_today, states: m.states }));

// Lv n → n+1 に必要なXP。序盤は数問で上がり、全問を2〜3周してLv30前後。
const need = (level: number): number => 20 + 6 * (level - 1);
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1, rest = Math.max(0, xp);
  while (rest >= need(level)) { rest -= need(level); level++; }
  return { level, into: rest, need: need(level) };
}

export function stateOf(m: Mastery | null, id: string, uncertain: Record<string, unknown> = notebook().uncertain): QuestionState {
  const s = m?.states[id];
  if (!s) return 'new';
  return s !== 'learning' && uncertain[id] ? 'learning' : s;
}

export interface FieldMastery { field: string; total: number; counts: Record<QuestionState, number>; stars: 0 | 1 | 2 | 3; }
const empty = (): Record<QuestionState, number> => ({ new: 0, learning: 0, mastered: 0, settled: 0 });
// ★1：全問に取り組んだ ★2：全問を習得 ★3：全問が定着
export function fieldMastery(questions: Map<string, Question>, m: Mastery | null, uncertain: Record<string, unknown> = notebook().uncertain): FieldMastery[] {
  const by = new Map<string, FieldMastery>();
  for (const q of questions.values()) {
    const f = by.get(q.field) ?? { field: q.field, total: 0, counts: empty(), stars: 0 };
    f.total++; f.counts[stateOf(m, q.id, uncertain)]++; by.set(q.field, f);
  }
  for (const f of by.values()) {
    f.stars = f.counts.settled === f.total ? 3 : f.counts.mastered + f.counts.settled === f.total ? 2 : f.counts.new === 0 ? 1 : 0;
  }
  return [...by.values()];
}
export function readiness(questions: Map<string, Question>, m: Mastery | null, uncertain: Record<string, unknown> = notebook().uncertain): { ready: number; total: number; counts: Record<QuestionState, number> } {
  const counts = empty();
  for (const id of questions.keys()) counts[stateOf(m, id, uncertain)]++;
  return { ready: counts.mastered + counts.settled, total: questions.size, counts };
}

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8L12 3Z"/></svg>';
const STAR_NAMES = ['', '全問に取り組んだ', '全問を習得', '全問が定着'];
export const renderStars = (stars: number): string =>
  `<span class="mastery-stars" role="img" aria-label="★${stars}つ${stars ? `（${STAR_NAMES[stars]}）` : ''}">${[1, 2, 3].map(i => `<i class="${i <= stars ? `on star-${i}` : ''}">${STAR}</i>`).join('')}</span>`;

const LABELS: Record<QuestionState, string> = { settled: '定着', mastered: '習得', learning: '取り組み中', new: '未着手' };
const ORDER: QuestionState[] = ['settled', 'mastered', 'learning', 'new'];
const stack = (counts: Record<QuestionState, number>, total: number, cls: string): string =>
  `<span class="${cls}" aria-hidden="true">${ORDER.map(s => counts[s] ? `<i class="st-${s}" style="width:${100 * counts[s] / total}%"></i>` : '').join('')}</span>`;

// 分野一覧の開閉は再描画・再取得のあいだ保つ。
let fieldsOpen = false;
if (typeof document !== 'undefined') document.addEventListener('toggle', e => {
  const t = e.target;
  if (t instanceof HTMLDetailsElement && t.classList.contains('mastery-fields')) fieldsOpen = t.open;
}, true);

export function renderMastery(questions: Map<string, Question>, m: Mastery | null, error = ''): string {
  if (!questions.size) return '';
  if (!m) return `<div class="panel mastery-panel performance-loading" role="status">${error || '学習レベルを読み込んでいます…'}${error ? '<button class="btn" data-act="refresh-mastery">再取得する</button>' : ''}</div>`;
  const lv = levelOf(m.xp);
  const r = readiness(questions, m);
  const fields = fieldMastery(questions, m);
  const legend = ORDER.map(s => `<span><i class="st-${s}"></i>${LABELS[s]} <b>${r.counts[s]}</b></span>`).join('');
  const rows = fields.map(f => `<li><span class="mastery-field-name">${esc(f.field)}</span>${renderStars(f.stars)}${stack(f.counts, f.total, 'mastery-bar mini')}<span class="mastery-field-count">${f.counts.mastered + f.counts.settled}<small>/${f.total}</small></span></li>`).join('');
  const starTotal = fields.reduce((n, f) => n + f.stars, 0);
  return `<section class="panel mastery-panel" aria-labelledby="mastery-heading">
    <div class="mastery-level"><span class="mastery-badge" aria-hidden="true"><small>Lv</small>${lv.level}</span><div class="mastery-level-copy"><p class="eyebrow">STUDY LEVEL</p><h2 id="mastery-heading">学習レベル <b>Lv ${lv.level}</b></h2><span class="mastery-xp-bar" role="progressbar" aria-label="次のレベルまでの経験値" aria-valuemin="0" aria-valuemax="${lv.need}" aria-valuenow="${lv.into}"><i style="width:${100 * lv.into / lv.need}%"></i></span><p class="mastery-xp-note">次のレベルまで <b>${lv.need - lv.into} XP</b> · 累計 ${m.xp} XP${m.xp_today ? ` · <span class="mastery-today">今日 +${m.xp_today} XP</span>` : ''}</p></div></div>
    <div class="mastery-ready"><div class="mastery-ready-head"><h3>${icon('target')}試験準備度</h3><p><strong>${r.ready}</strong><span> / ${r.total}問</span></p></div>${stack(r.counts, r.total, 'mastery-bar')}<div class="mastery-legend">${legend}</div></div>
    <details class="mastery-fields" ${fieldsOpen ? 'open' : ''}><summary><span>${icon('book')}分野マスタリー</span><span class="mastery-star-total">★ ${starTotal} / ${fields.length * 3}</span></summary><ul>${rows}</ul></details>
    <p class="mastery-note">習得＝直近2回連続で正解 · 定着＝直近3回連続で正解 · 「迷った」に記録中の問題は習得に数えません。XPは一人で学習・復習コースの解答で増え、減ることはありません。</p>
    ${error ? '<p class="error" role="status">最新のレベルを取得できませんでした。前回の記録を表示しています。</p>' : ''}</section>`;
}

// 一人学習・復習コースの結果画面に出す、その学習で得たXPとレベルアップ。
export function renderSessionXp(m: Mastery | null, loading: boolean): string {
  if (!m || m.session_xp == null) return loading ? '<p class="session-xp" role="status">獲得XPを集計しています…</p>' : '';
  const now = levelOf(m.xp), before = levelOf(m.xp - m.session_xp);
  const up = now.level > before.level;
  return `<div class="session-xp ${up ? 'level-up' : ''}" role="status"><strong>+${m.session_xp} XP</strong><span>${up ? `レベルアップ！ Lv ${before.level} → <b>Lv ${now.level}</b>` : `Lv ${now.level} · 次のレベルまで ${now.need - now.into} XP`}</span></div>`;
}
