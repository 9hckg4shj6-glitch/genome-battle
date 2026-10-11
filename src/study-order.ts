import { stateOf, type Mastery } from './mastery';
import { notebook, readStore, writeStore, type Question } from './ui';
import type { StudyDistribution } from './study-distribution';

// 問題演習コーナの出題方法。未着手優先・ランダムはサーバー（start_solo）が選ぶ。
// 苦手優先・仕上げは学習レベルの習得状態と復習ノートから端末で選び、選んだ問題だけを渡す。
export type StudyOrder = 'unattempted' | 'weak' | 'polish' | 'random';
export const STUDY_ORDERS: StudyOrder[] = ['unattempted', 'weak', 'polish', 'random'];
export const isStudyOrder = (v: unknown): v is StudyOrder => STUDY_ORDERS.includes(v as StudyOrder);
export const studyOrderName: Record<StudyOrder, string> = { unattempted: '未着手優先', weak: '苦手優先', polish: '仕上げ', random: 'ランダム' };
export const clientOrder = (o: StudyOrder): boolean => o === 'weak' || o === 'polish';

// 苦手：取り組み中（「迷った」に記録中を含む）と、対戦などで間違えたまま学習で解いていない問題。
// 仕上げ：習得（直近2回連続で正解）で、あと1回の正解で定着になる問題。
export function isWeak(id: string, m: Mastery | null, n = notebook()): boolean {
  const s = stateOf(m, id, n.uncertain);
  return s === 'learning' || (s === 'new' && !!n.missed[id]);
}
export const isPolish = (id: string, m: Mastery | null, n = notebook()): boolean => stateOf(m, id, n.uncertain) === 'mastered';

// 小さいほど先に出す。対象が足りないときに補う順もここで決める。
function rank(order: 'weak' | 'polish', id: string, m: Mastery | null, n: ReturnType<typeof notebook>): number {
  const s = stateOf(m, id, n.uncertain);
  if (order === 'weak') return isWeak(id, m, n) ? 0 : s === 'new' ? 1 : s === 'mastered' ? 2 : 3;
  return s === 'mastered' ? 0 : s === 'learning' ? 1 : s === 'new' ? 2 : 3;
}

// start_solo の分野均等と同じ割り当て：最も割当の少ない分野へ1問ずつ、枯渇した分野は除き、同数はランダム。
function quotas(pool: Question[], count: number): Map<string, number> {
  const caps = new Map<string, number>(), got = new Map<string, number>();
  for (const q of pool) caps.set(q.field, (caps.get(q.field) ?? 0) + 1);
  for (let i = 0; i < count; i++) {
    const open = [...caps].filter(([f, c]) => (got.get(f) ?? 0) < c).map(([f]) => f);
    if (!open.length) break;
    const least = Math.min(...open.map(f => got.get(f) ?? 0));
    const ties = open.filter(f => (got.get(f) ?? 0) === least);
    const f = ties[Math.floor(Math.random() * ties.length)];
    got.set(f, least + 1);
  }
  return got;
}

export function pickStudyIds(pool: Question[], count: number, order: 'weak' | 'polish', distribution: StudyDistribution, m: Mastery | null): string[] {
  const n = notebook();
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  // 同じ優先度の中はシャッフルした順のまま（sort は安定）。
  const ranked = shuffled.map(q => ({ q, r: rank(order, q.id, m, n) })).sort((a, b) => a.r - b.r).map(x => x.q);
  if (distribution !== 'even' || new Set(pool.map(q => q.field)).size < 2) return ranked.slice(0, count).map(q => q.id);
  const quota = quotas(pool, count), used = new Map<string, number>();
  return ranked.filter(q => {
    const k = used.get(q.field) ?? 0;
    if (k >= (quota.get(q.field) ?? 0)) return false;
    used.set(q.field, k + 1);
    return true;
  }).map(q => q.id);
}

// サーバーには「ランダム」として渡すため、学習中の表示名は端末に覚えておく。
const LABEL_KEY = 'gb.study-order-labels';
const labels = (): Record<string, StudyOrder> => {
  try { const v: unknown = JSON.parse(readStore(LABEL_KEY) ?? '{}'); return v && typeof v === 'object' ? v as Record<string, StudyOrder> : {}; }
  catch { return {}; }
};
export function rememberOrder(sessionId: string, order: StudyOrder): void {
  const all = Object.entries(labels()).filter(([id]) => id !== sessionId).slice(-29);
  writeStore(LABEL_KEY, JSON.stringify(Object.fromEntries([...all, [sessionId, order]])));
}
export function sessionOrderName(sessionId: string, serverOrder: string | undefined): string {
  const local = labels()[sessionId];
  if (serverOrder === 'random' && isStudyOrder(local)) return studyOrderName[local];
  return serverOrder === 'unattempted' || serverOrder === 'random' ? studyOrderName[serverOrder] : '';
}
