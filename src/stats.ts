// みんなの正答率。各端末が「その問題に初めて答えたときの正誤」を、サーバー（get_question_stats）が問題ごとに集計する。
// 正解や解答者は含まないが、解説を表示する場面（発表・振り返り・過去問一覧）でだけ使う。
// ui.ts（Node の検証スクリプトも含む）から読み込まれるので、通信や ui.ts は読み込まない（端末保存は直接扱う）。
export interface QuestionStat { n: number; correct: number; }
type Stats = Record<string, QuestionStat>;
export type AnswerOutcome = 'correct' | 'wrong' | 'viewed' | 'none';

// 少人数の率はぶれるので、この人数に届くまでは「集計中」と表示する。
export const MIN_ANSWERS = 5;
const KEY = 'gb.question-stats';

const count = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
function valid(v: unknown): v is Stats {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(s => {
    const x = s as QuestionStat | null;
    return !!x && count(x.n) && count(x.correct) && x.correct <= x.n;
  });
}
function cached(): Stats | null {
  try { const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return valid(v) ? v : null; }
  catch { return null; }
}

// 一度も取得できていない（未適用のサーバー・初回の通信失敗）ときは何も表示しない。
let stats: Stats | null = cached();

// サーバーから受け取った集計を反映する。内容が変わったときだけ true（取得は main.ts が行う）。
export function applyQuestionStats(next: unknown): boolean {
  if (!valid(next)) return false;
  const changed = JSON.stringify(next) !== JSON.stringify(stats);
  stats = next;
  if (changed) try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 保存できなくても表示はできる */ }
  return changed;
}

export const questionStat = (id: string): QuestionStat | null => stats ? stats[id] ?? { n: 0, correct: 0 } : null;
export function rateOf(id: string): number | null {
  const s = questionStat(id);
  return s && s.n >= MIN_ANSWERS ? s.correct / s.n : null;
}

// 正答率から見た難しさ。
export function difficultyOf(rate: number): { key: 'basic' | 'standard' | 'hard' | 'tough'; label: string } {
  return rate >= .8 ? { key: 'basic', label: '基本' }
    : rate >= .6 ? { key: 'standard', label: '標準' }
    : rate >= .4 ? { key: 'hard', label: 'やや難' }
    : { key: 'tough', label: '難問' };
}

// 自分の結果と正答率を組み合わせた一言。点数より「次に何をすべきか」が伝わる言葉にする。
function advice(rate: number, outcome: AnswerOutcome): string {
  if (outcome === 'correct') return rate < .4 ? '正解する人が少ない難問に正解しました！' : rate < .6 ? '半数近くが間違える問題に正解しました。' : '';
  if (outcome === 'wrong' || outcome === 'viewed' || outcome === 'none')
    return rate >= .8 ? '多くの人が正解している基本問題です。試験で落とさないよう、ここは確実に押さえましょう。'
      : rate < .4 ? '多くの人が間違える難問です。解説のポイントを確認しておけば差がつきます。' : '';
  return '';
}

const percent = (rate: number): number => Math.round(rate * 100);

// 発表・振り返り・過去問一覧に出すメーター。outcome を渡すと自分の結果に合わせた一言を添える。
export function renderCommunityRate(id: string, outcome?: AnswerOutcome): string {
  const s = questionStat(id);
  if (!s) return '';
  if (s.n < MIN_ANSWERS) return `<div class="community-rate pending"><span class="community-rate-label">みんなの正答率</span><small>集計中（${s.n ? `これまで${s.n}人が解答` : 'まだ解答がありません'}・${MIN_ANSWERS}人から表示）</small></div>`;
  const rate = s.correct / s.n, d = difficultyOf(rate), p = percent(rate);
  const tip = outcome ? advice(rate, outcome) : '';
  return `<div class="community-rate tone-${d.key}">
    <div class="community-rate-head"><span class="community-rate-label">みんなの正答率</span><strong>${p}<small>%</small></strong><em class="difficulty-chip tone-${d.key}">${d.label}</em></div>
    <span class="community-rate-bar" role="img" aria-label="初めて解いた${s.n}人のうち${s.correct}人が正解（${p}%）"><i style="width:${p}%"></i></span>
    <p class="community-rate-note">初めて解いた${s.n}人のうち${s.correct}人が正解</p>
    ${tip ? `<p class="community-rate-tip">${tip}</p>` : ''}</div>`;
}

// 対人戦の発表（3秒）向けの1行。
export function renderRateInline(id: string): string {
  const rate = rateOf(id);
  if (rate === null) return '';
  const d = difficultyOf(rate);
  return `<span class="community-rate-inline tone-${d.key}">みんなの正答率 <b>${percent(rate)}%</b>・${d.label}</span>`;
}

// 過去問一覧の見出しに出す難しさの印。
export function renderDifficultyChip(id: string): string {
  const rate = rateOf(id);
  if (rate === null) return '';
  const d = difficultyOf(rate);
  return `<em class="difficulty-chip tone-${d.key}" title="みんなの正答率 ${percent(rate)}%">${d.label} ${percent(rate)}%</em>`;
}
