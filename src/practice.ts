import { renderDistribution, type StudyDistribution } from './study-distribution';
import { fieldMastery, renderStars, type Mastery } from './mastery';
import { esc, icon, readStore, writeStore, type Question } from './ui';

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

export interface PracticeView {
  questions: Map<string, Question>; playerName: string; busy: boolean; error: string;
  count: number; distribution: StudyDistribution;
  attempted: Set<string>; progressLoaded: boolean; progressError: boolean;
  mastery: Mastery | null;
}

// 一人で学習の画面に置く入口。押すと見出しとアイコンが次のページの見出しへ移る。
export function renderPracticeEntry(questions: Map<string, Question>): string {
  const all = fieldsOf(questions).length, chosen = chosenFields(questions).length;
  const current = chosen === all ? 'すべての分野' : chosen ? `${chosen}分野を選択中` : '分野が未選択';
  return `<button class="panel catalog-entry practice-entry mode-study" data-act="practice"><span class="mode-icon" data-morph="icon">${icon('book')}</span><span><span class="eyebrow">PRACTICE</span><strong data-morph="title">問題演習コーナ</strong><small>分野を組み合わせて、問題数・出題配分を選んで演習します。</small><span class="practice-entry-current">${icon('check')}${current}</span></span>${icon('arrow')}</button>`;
}

export function renderPractice(v: PracticeView): string {
  const list = [...v.questions.values()];
  const fields = fieldsOf(v.questions);
  const chosen = new Set(chosenFields(v.questions));
  const pool = list.filter(q => chosen.has(q.field));
  const total = pool.length;
  const count = Math.max(1, Math.min(v.count, total));
  const fresh = (qs: Question[]): number => qs.filter(q => !v.attempted.has(q.id)).length;
  const pop = popped; popped = '';
  const mastered = new Map(v.mastery ? fieldMastery(v.questions, v.mastery).map(f => [f.field, f]) : []);
  const cards = fields.map((f, i) => {
    const qs = list.filter(q => q.field === f), on = chosen.has(f), m = mastered.get(f);
    return `<label class="practice-field ${on ? 'on' : ''} ${pop === f ? 'pop' : ''}" style="--i:${i}"><input type="checkbox" name="practice-field" value="${esc(f)}" ${on ? 'checked' : ''} ${v.busy ? 'disabled' : ''}/><span class="practice-check" aria-hidden="true">${icon('check')}</span><span class="practice-field-copy"><strong>${esc(f)}</strong><small>${qs.length}問${v.progressLoaded ? ` · 未着手 ${fresh(qs)}問` : ''}</small>${m ? `<span class="practice-mastery">${renderStars(m.stars)}<span>習得 ${m.counts.mastered + m.counts.settled}/${m.total}</span></span>` : ''}</span></label>`;
  }).join('');
  const summary = !chosen.size ? '分野を1つ以上選んでください。'
    : `<b>${chosen.size === fields.length ? 'すべての分野' : `${chosen.size}分野`}</b>・計<b>${total}</b>問から出題します。`;
  const orderHelp = v.progressError ? '未着手の件数を取得できませんでした。出題時に確認します。'
    : v.progressLoaded ? `選んだ分野の未着手：${fresh(pool)} / ${total}問。` : '未着手の件数を確認中…';
  const disabled = v.busy || !total ? 'disabled' : '';
  return `<header class="setup-title practice-title mode-study"><span class="mode-icon" data-morph="icon">${icon('book')}</span><div><p class="eyebrow">PRACTICE</p><h1 data-morph="title">問題演習コーナ</h1><p class="lead">分野を組み合わせて、自分だけの演習セットを作ろう。</p></div></header>
    <section class="panel practice-step" aria-labelledby="practice-fields-heading"><div class="practice-step-head"><span class="practice-step-no">1</span><div><h2 id="practice-fields-heading">学習する分野</h2><p>複数選べます。選んだ分野の問題を混ぜて出題します。</p></div></div>
      <div class="practice-bulk"><button class="btn" data-act="practice-all" ${v.busy || chosen.size === fields.length ? 'disabled' : ''}>すべて選択</button><button class="btn" data-act="practice-none" ${v.busy || !chosen.size ? 'disabled' : ''}>選択を解除</button></div>
      <div class="practice-fields" role="group" aria-labelledby="practice-fields-heading">${cards}</div>
      <p class="practice-summary ${chosen.size ? '' : 'empty'}" role="status">${summary}</p></section>
    <section class="panel practice-step" aria-labelledby="practice-count-heading"><div class="practice-step-head"><span class="practice-step-no">2</span><div><h2 id="practice-count-heading">問題数と出題配分</h2><p>時間制限なし。解答後の解説を読んで、自分のペースで進められます。</p></div></div>
      <div class="field count-field"><span>問題数（${total ? `1〜${total}問` : '分野を選ぶと設定できます'}）</span><div class="count-row"><input id="study-count" type="range" aria-label="問題数" min="1" max="${Math.max(1, total)}" step="1" value="${count}" ${disabled}/><input id="study-count-value" type="number" inputmode="numeric" aria-label="問題数（数字で入力）" min="1" max="${Math.max(1, total)}" step="1" value="${total ? count : ''}" ${disabled}/><span>問</span></div></div>
      <div id="distribution-settings">${renderDistribution(v.distribution, chosen.size < 2)}</div></section>
    <section class="panel practice-step" aria-labelledby="practice-start-heading"><div class="practice-step-head"><span class="practice-step-no">3</span><div><h2 id="practice-start-heading">演習をはじめる</h2></div></div>
      <label class="field"><span>プレイヤー名（任意）</span><input id="name" maxlength="12" autocomplete="nickname" placeholder="名前を入力（12文字まで）" value="${esc(v.playerName)}" ${v.busy ? 'disabled' : ''}/></label>
      <div class="study-start-actions"><button class="btn primary" data-study-order="unattempted" ${disabled}>${v.busy ? '<span class="spinner mini"></span>準備中…' : `未着手の問題を優先的に演習${icon('arrow')}`}</button><button class="btn" data-study-order="random" ${disabled}>ランダム演習${icon('arrow')}</button></div>
      <p class="study-order-help">${orderHelp}${chosen.size > 1 && v.distribution === 'even' ? '選んだ配分を保ち、各分野内で未着手の問題を優先します。' : 'まだ解答も回答の確認もしていない問題を優先します。'}不足分は演習済みから補います。後回しは未着手のままです。</p>
      ${v.error ? `<p class="error" role="alert">${esc(v.error)}</p>` : ''}</section>
    <button class="btn ghost practice-back" data-act="practice-back">${icon('back')}一人で学習に戻る</button>`;
}
