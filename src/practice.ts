import { renderDistribution, type StudyDistribution } from './study-distribution';
import { fieldMastery, renderStars, stack, type Mastery } from './mastery';
import { esc, icon, notebook, readStore, writeStore, type Question } from './ui';
import { isPolish, isWeak, STUDY_ORDERS, studyOrderName, type StudyOrder } from './study-order';
import { renderCourseGuideButton } from './course-guide';
import { renderStudyEntry } from './hub';

// 問題演習コーナ（一人で学習の演習設定ページ）。分野は複数選べ、選択はこの端末に保存する。
// null は「すべての分野」。後から分野が増えても、すべて選んだ状態を保つ。
let picked: Set<string> | null = (() => {
  try {
    const v: unknown = JSON.parse(readStore('gb.study-fields') ?? 'null');
    return Array.isArray(v) ? new Set(v.filter((f): f is string => typeof f === 'string')) : null;
  } catch { return null; }
})();
// 直前に切り替えた分野。そのカードだけチェックを弾ませる。
let popped = '';

const save = (): void => writeStore('gb.study-fields', picked ? JSON.stringify([...picked]) : null);
export const fieldsOf = (questions: Map<string, Question>): string[] => [...new Set([...questions.values()].map(q => q.field))];
export const chosenFields = (questions: Map<string, Question>): string[] => fieldsOf(questions).filter(f => !picked || picked.has(f));

export function toggleField(questions: Map<string, Question>, field: string): void {
  const next = new Set(chosenFields(questions));
  if (!next.delete(field)) next.add(field);
  picked = next.size === fieldsOf(questions).length ? null : next;
  popped = field;
  save();
}
export function selectAllFields(): void { picked = null; popped = ''; save(); }
export function clearFields(): void { picked = new Set(); popped = ''; save(); }
export function selectFields(questions: Map<string, Question>, fields: string[]): void {
  picked = fields.length === fieldsOf(questions).length ? null : new Set(fields); popped = ''; save();
}
// 自動選択の候補。苦手は学習レベルの記録、未着手は学習の着手記録が取れてから選べる。
const fieldsWith = (questions: Map<string, Question>, has: (q: Question) => boolean): string[] =>
  fieldsOf(questions).filter(f => [...questions.values()].some(q => q.field === f && has(q)));
export const weakFields = (questions: Map<string, Question>, m: Mastery | null): string[] => {
  const n = notebook();
  return m ? fieldsWith(questions, q => isWeak(q.id, m, n)) : [];
};
export const freshFields = (questions: Map<string, Question>, attempted: Set<string>, loaded: boolean): string[] =>
  loaded ? fieldsWith(questions, q => !attempted.has(q.id)) : [];

export interface PracticeView {
  questions: Map<string, Question>; busy: boolean; error: string;
  count: number; distribution: StudyDistribution; order: StudyOrder;
  attempted: Set<string>; progressLoaded: boolean; progressError: boolean;
  mastery: Mastery | null;
}

// 一人で学習の画面に置く入口。押すと見出しとアイコンが次のページの見出しへ移る。
export function renderPracticeEntry(questions: Map<string, Question>): string {
  const all = fieldsOf(questions).length, chosen = chosenFields(questions).length;
  const current = chosen === all ? 'すべての分野' : chosen ? `${chosen}分野を選択中` : '分野が未選択';
  return renderStudyEntry({ no: '01', en: 'PRACTICE', title: '問題演習コーナ', text: '分野を組み合わせて、問題数・出題方法を選んで演習します。', icon: 'book', attr: 'data-act="practice"', cls: 'practice-entry entry-practice', morph: true,
    meta: `<span class="entry-chip practice-entry-current">${icon('check')}${current}</span>` });
}

const ORDER_TEXT: Record<StudyOrder, string> = {
  unattempted: 'まだ解いていない問題から',
  weak: '取り組み中・間違えた問題から',
  polish: 'あと1回の正解で定着する問題から',
  random: '解いたかどうかに関係なく',
};

export function renderPractice(v: PracticeView): string {
  const list = [...v.questions.values()];
  const fields = fieldsOf(v.questions);
  const chosen = new Set(chosenFields(v.questions));
  const pool = list.filter(q => chosen.has(q.field));
  const total = pool.length;
  const count = Math.max(1, Math.min(v.count, total));
  const n = notebook();
  const fresh = (qs: Question[]): number => qs.filter(q => !v.attempted.has(q.id)).length;
  const weak = (qs: Question[]): number => qs.filter(q => isWeak(q.id, v.mastery, n)).length;
  const pop = popped; popped = '';
  const mastered = new Map(v.mastery ? fieldMastery(v.questions, v.mastery).map(f => [f.field, f]) : []);
  const cards = fields.map((f, i) => {
    const qs = list.filter(q => q.field === f), on = chosen.has(f), m = mastered.get(f);
    // 過去問全体の1割以上を占める分野は「頻出」。問題数の差がひと目で分かるようにする。
    const major = qs.length * 10 >= list.length;
    const notes = [`<b>${qs.length}問</b>`, v.progressLoaded ? `未着手 ${fresh(qs)}` : ''].filter(Boolean).join(' · ');
    const weakCount = v.mastery ? weak(qs) : 0;
    return `<label class="practice-field ${on ? 'on' : ''} ${pop === f ? 'pop' : ''}" style="--i:${i}"><input type="checkbox" name="practice-field" value="${esc(f)}" ${on ? 'checked' : ''} ${v.busy ? 'disabled' : ''}/><span class="practice-check" aria-hidden="true">${icon('check')}</span><span class="practice-field-copy"><strong>${esc(f)}${major ? '<em class="practice-major">頻出</em>' : ''}</strong>${m ? `${stack(m.counts, m.total, 'mastery-bar mini practice-bar')}` : ''}<small>${notes}</small>${m ? `<span class="practice-mastery">${renderStars(m.stars)}<span>習得 ${m.counts.mastered + m.counts.settled}/${m.total}</span>${weakCount ? `<span class="practice-weak">苦手 ${weakCount}</span>` : ''}</span>` : ''}</span></label>`;
  }).join('');
  const weakList = weakFields(v.questions, v.mastery), freshList = freshFields(v.questions, v.attempted, v.progressLoaded);
  const same = (xs: string[]): boolean => xs.length === chosen.size && xs.every(f => chosen.has(f));
  const smart = (act: string, label: string, xs: string[]): string =>
    `<button class="btn practice-smart" data-act="${act}" ${v.busy || !xs.length || same(xs) ? 'disabled' : ''}>${label}<b>${xs.length}</b></button>`;
  const summary = !chosen.size ? '分野を1つ以上選んでください。'
    : `<b>${chosen.size === fields.length ? 'すべての分野' : `${chosen.size}分野`}</b>・計<b>${total}</b>問から出題します。`;
  // 出題方法ごとの対象数。記録がまだ取れていないものは選べない／確認中と表示する。
  const target: Record<StudyOrder, number | null> = {
    unattempted: v.progressLoaded ? fresh(pool) : null,
    weak: v.mastery ? weak(pool) : null,
    polish: v.mastery ? pool.filter(q => isPolish(q.id, v.mastery, n)).length : null,
    random: total,
  };
  const needsMastery = (o: StudyOrder): boolean => (o === 'weak' || o === 'polish') && !v.mastery;
  const order = needsMastery(v.order) ? 'unattempted' : v.order;
  const options = STUDY_ORDERS.map(o => {
    const t = target[o], off = v.busy || needsMastery(o);
    const label = t === null ? (o === 'unattempted' && v.progressError ? '対象 −' : '確認中…') : o === 'random' ? `${t}問` : `対象 ${t}問`;
    return `<label class="practice-order ${o === order ? 'on' : ''} ${t === 0 ? 'none' : ''}"><input type="radio" name="study-order" value="${o}" ${o === order ? 'checked' : ''} ${off ? 'disabled' : ''}/><span class="practice-order-copy"><strong>${studyOrderName[o]}</strong><small>${ORDER_TEXT[o]}</small></span><b class="practice-order-count">${label}</b></label>`;
  }).join('');
  const even = chosen.size > 1 && v.distribution === 'even';
  const orderHelp = {
    unattempted: `${v.progressError ? '未着手の件数を取得できませんでした。出題時に確認します。' : ''}まだ解答も回答の確認もしていない問題を優先します。不足分は演習済みから補います。後回しは未着手のままです。`,
    weak: '取り組み中（「迷った」に記録中を含む）の問題と、対戦などで間違えてまだ学習で解いていない問題を優先します。不足分は未着手 → 習得 → 定着の順に補います。',
    polish: '直近2回連続で正解した「習得」の問題を優先します。もう1回正解すると「定着」になります。不足分は取り組み中 → 未着手 → 定着の順に補います。',
    random: '解いたかどうかに関係なく、選んだ分野から重複なく出題します。',
  }[order] + (even && order !== 'random' ? '選んだ配分を保ち、各分野の中で優先します。' : '')
    + (!v.mastery ? '苦手優先・仕上げは学習レベルの記録を読み込むと選べます。' : target[order] === 0 ? `いまの分野に${studyOrderName[order]}の対象はありません。ほかの問題から出題します。` : '');
  const disabled = v.busy || !total ? 'disabled' : '';
  const barNote = chosen.size ? [chosen.size === fields.length ? 'すべての分野' : `${chosen.size}分野`, studyOrderName[order], chosen.size > 1 ? (v.distribution === 'even' ? '分野均等' : '過去問配分') : ''].filter(Boolean).join(' · ') : '分野を選んでください';
  return `${renderCourseGuideButton('practice')}<header class="setup-title practice-title mode-study"><span class="mode-icon" data-morph="icon">${icon('book')}</span><div><p class="eyebrow">PRACTICE</p><h1 data-morph="title">問題演習コーナ</h1><p class="lead">分野を組み合わせて、自分だけの演習セットを作ろう。</p></div></header>
    <section class="panel practice-step" aria-labelledby="practice-fields-heading"><div class="practice-step-head"><span class="practice-step-no">1</span><div><h2 id="practice-fields-heading">学習する分野</h2><p>複数選べます。選んだ分野の問題を混ぜて出題します。</p></div></div>
      <div class="practice-bulk"><button class="btn" data-act="practice-all" ${v.busy || chosen.size === fields.length ? 'disabled' : ''}>すべて選択</button><button class="btn" data-act="practice-none" ${v.busy || !chosen.size ? 'disabled' : ''}>選択を解除</button>${smart('practice-weak-fields', '苦手な分野', weakList)}${smart('practice-fresh-fields', '未着手の分野', freshList)}</div>
      <div class="practice-fields" role="group" aria-labelledby="practice-fields-heading">${cards}</div>
      ${v.mastery ? `<p class="practice-legend" aria-hidden="true"><span><i class="st-settled"></i>定着</span><span><i class="st-mastered"></i>習得</span><span><i class="st-learning"></i>取り組み中</span><span><i class="st-new"></i>未着手</span></p>` : ''}
      <p class="practice-summary ${chosen.size ? '' : 'empty'}" role="status">${summary}</p></section>
    <section class="panel practice-step" aria-labelledby="practice-count-heading"><div class="practice-step-head"><span class="practice-step-no">2</span><div><h2 id="practice-count-heading">問題数と出題配分</h2><p>時間制限なし。解答後の解説を読んで、自分のペースで進められます。</p></div></div>
      <div class="field count-field"><span>問題数（${total ? `1〜${total}問` : '分野を選ぶと設定できます'}）</span><div class="count-row"><input id="study-count" type="range" aria-label="問題数" min="1" max="${Math.max(1, total)}" step="1" value="${count}" ${disabled}/><input id="study-count-value" type="number" inputmode="numeric" aria-label="問題数（数字で入力）" min="1" max="${Math.max(1, total)}" step="1" value="${total ? count : ''}" ${disabled}/><span>問</span></div></div>
      <div id="distribution-settings">${renderDistribution(v.distribution, chosen.size < 2)}</div></section>
    <section class="panel practice-step" aria-labelledby="practice-order-heading"><div class="practice-step-head"><span class="practice-step-no">3</span><div><h2 id="practice-order-heading">出題方法</h2><p>どの問題から優先して出すかを選びます。対象は選んだ分野の問題数です。</p></div></div>
      <fieldset class="practice-orders" aria-labelledby="practice-order-heading" aria-describedby="practice-order-help">${options}</fieldset>
      <p id="practice-order-help" class="study-order-help">${orderHelp}</p></section>
    <section class="practice-startbar ${total ? 'ready' : ''}" aria-label="演習の開始">
      <p class="practice-startbar-copy" role="status"><b>${total ? count : 0}</b>問<small>${barNote}</small></p>
      <button class="btn primary" data-act="practice-start" ${disabled}>${v.busy ? '<span class="spinner mini"></span>準備中…' : `はじめる${icon('arrow')}`}</button>
      ${v.error ? `<p class="error" role="alert">${esc(v.error)}</p>` : ''}</section>`;
}
