import { readStore, writeStore } from './ui';

// 「読んで学ぶ」の記録。どれも端末保存で、学習レベル・正答率・未着手の判定には混ぜない。

// 解説を読んだ問題（問題ID → 最後に読んだ時刻）。
const readStoreJson = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(readStore(key) ?? 'null') ?? fallback; } catch { return fallback; }
};
export function readMap(): Record<string, number> {
  const v = readStoreJson<unknown>('gb.read', {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, number> : {};
}
export const isRead = (id: string, map = readMap()): boolean => !!map[id];
export function markRead(id: string): boolean {
  const map = readMap();
  const first = !map[id];
  map[id] = Date.now();
  writeStore('gb.read', JSON.stringify(map));
  return first;
}

// しおり。解説リーダーで最後に開いた問題と、そのときの問題の並び（絞り込みの結果）を覚える。
export interface Bookmark { ids: string[]; id: string; label: string; }
export function bookmark(valid: (id: string) => boolean): Bookmark | null {
  const b = readStoreJson<Partial<Bookmark> | null>('gb.reader-bookmark', null);
  if (!b || typeof b.id !== 'string' || !Array.isArray(b.ids) || typeof b.label !== 'string') return null;
  const ids = b.ids.filter((id): id is string => typeof id === 'string' && valid(id));
  return ids.includes(b.id) ? { ids, id: b.id, label: b.label } : null;
}
export const setBookmark = (b: Bookmark): void => writeStore('gb.reader-bookmark', JSON.stringify(b));

// 過去問一覧のモード。最初は「読んで学ぶ」（四角と演習バーを出さない）。
export type CatalogMode = 'read' | 'pick';
export const catalogMode = (): CatalogMode => readStore('gb.catalog-mode') === 'pick' ? 'pick' : 'read';
export const setCatalogMode = (mode: string): void => writeStore('gb.catalog-mode', mode === 'pick' ? 'pick' : null);

// 解説リーダーで正解と解説を伏せておくか（暗記カードのように自分で考えてから確かめる）。
export const hideAnswers = (): boolean => readStore('gb.reader-hide') === '1';
export const setHideAnswers = (on: boolean): void => writeStore('gb.reader-hide', on ? '1' : null);
