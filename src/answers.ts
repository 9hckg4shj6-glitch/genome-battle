import { call } from './api';

// 過去問一覧・解説リーダーで使う正答と解説。開いた問題だけサーバから取得し、同じ画面のあいだは再取得しない。
export interface Answer { answer: number; explanation: string; }
const answers = new Map<string, Answer>();
const pending = new Map<string, Promise<Answer>>();

export const answerOf = (id: string): Answer | undefined => answers.get(id);
export const answerLoading = (id: string): boolean => pending.has(id);

// 同じ問題を同時に開いても通信は1回にまとめる。
export function loadAnswer(id: string): Promise<Answer> {
  const have = answers.get(id);
  if (have) return Promise.resolve(have);
  let p = pending.get(id);
  if (!p) {
    p = call<Answer | null>('get_question_answer', { p_id: id }).then(a => {
      if (!a) throw new Error('QUESTION_NOT_FOUND');
      const v = { answer: a.answer, explanation: a.explanation };
      answers.set(id, v);
      return v;
    }).finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}
