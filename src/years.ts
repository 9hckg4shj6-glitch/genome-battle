import { esc, icon, type Question } from './ui';

// 年度別の出題・閲覧。0 は「すべての年度」。新しい年度から順に並べる。
export const yearsOf = (questions: Map<string, Question>): number[] =>
  [...new Set([...questions.values()].map(q => q.year))].sort((a, b) => b - a);
// 収録していない年度（保存値の破損・年度の入れ替え）は「すべての年度」に戻す。
export const validYear = (questions: Map<string, Question>, year: number): number =>
  yearsOf(questions).includes(year) ? year : 0;
export const yearQuestions = (questions: Map<string, Question>, year: number): Map<string, Question> =>
  year ? new Map([...questions].filter(([, q]) => q.year === year)) : questions;
export const yearName = (year: number): string => year ? `${year}年度` : 'すべての年度';

// 年度を選ぶボタン。name ごとに change を受け、選んだ年度の問題数と note（任意の補足）を添える。
export function renderYearPicker(o: { name: string; label: string; questions: Map<string, Question>; year: number; busy?: boolean; note?: (qs: Question[]) => string; compact?: boolean }): string {
  const years = yearsOf(o.questions);
  const list = [...o.questions.values()];
  const options = [0, ...years].map(y => {
    const qs = y ? list.filter(q => q.year === y) : list;
    const on = y === o.year;
    const sub = o.compact ? '' : y ? (y === years[0] ? '最新の過去問' : '') : `${years.slice().reverse().join('・')}を混ぜて`;
    const note = o.note?.(qs) ?? '';
    return `<label class="year-option${on ? ' on' : ''}"><input type="radio" name="${esc(o.name)}" value="${y}" ${on ? 'checked' : ''} ${o.busy ? 'disabled' : ''}/>
      <span class="year-mark" aria-hidden="true">${y ? `<b>${y}</b><small>年度</small>` : '<b>ALL</b><small>全年度</small>'}</span>
      <span class="year-copy"><strong>${yearName(y)}</strong><small><b>${qs.length}問</b>${sub ? ` · ${sub}` : ''}</small>${note ? `<small class="year-note">${note}</small>` : ''}</span>
      <span class="year-check" aria-hidden="true">${icon('check')}</span></label>`;
  }).join('');
  return `<fieldset class="year-picker${o.compact ? ' compact' : ''}"><legend>${esc(o.label)}</legend><div class="year-options">${options}</div></fieldset>`;
}
