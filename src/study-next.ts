import { fieldMastery, renderStars, type Mastery } from './mastery';
import { esc, icon, type Question } from './ui';
import type { StudyOrder } from './study-order';

// 学習の結果画面に出す「次のおすすめ」。分野マスタリーの次の★に最も近い分野を1つ選ぶ。
// ★1＝全問に取り組む、★2＝全問を習得、★3＝全問が定着。今回解いた分野を優先する。
export interface NextStep { field: string; star: 1 | 2 | 3; left: number; order: StudyOrder; count: number; }

const GOAL: Record<1 | 2 | 3, string> = { 1: 'に取り組むと', 2: 'を習得すると', 3: 'が定着すると' };
const MAX_COUNT = 10;

export function nextStep(questions: Map<string, Question>, m: Mastery, played: Set<string>): NextStep | null {
  const steps = fieldMastery(questions, m).filter(f => f.stars < 3).map(f => {
    const star = (f.stars + 1) as 1 | 2 | 3, c = f.counts;
    const left = star === 1 ? c.new : star === 2 ? c.new + c.learning : f.total - c.settled;
    // ★1は未着手を、★2は取り組み中があれば苦手を、★3は習得の問題を先に出す。
    const order: StudyOrder = star === 1 ? 'unattempted' : star === 2 ? (c.learning ? 'weak' : 'unattempted') : 'polish';
    return { field: f.field, star, left, order, count: Math.min(left, MAX_COUNT) };
  }).filter(s => s.left > 0);
  steps.sort((a, b) => Number(played.has(b.field)) - Number(played.has(a.field)) || a.left - b.left);
  return steps[0] ?? null;
}

export function renderNextStep(step: NextStep | null, busy: boolean): string {
  if (!step) return '';
  return `<section class="next-step" aria-labelledby="next-step-heading"><p class="eyebrow">NEXT STEP</p><h2 id="next-step-heading">次のおすすめ</h2>
    <p class="next-step-goal"><b>${esc(step.field)}</b>は、あと<strong>${step.left}</strong>問${GOAL[step.star]}${renderStars(step.star)}</p>
    <button class="btn" data-act="solo-next-step" data-field="${esc(step.field)}" data-order="${step.order}" data-count="${step.count}" ${busy ? 'disabled' : ''}>${icon('target')}${esc(step.field)}を${step.count}問演習する${icon('arrow')}</button></section>`;
}
