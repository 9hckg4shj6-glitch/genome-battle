import { readStore, writeStore } from "./ui";

// 新しい版が公開されていたら読み込み直す。GitHub Pages は HTML を最大10分キャッシュさせ、
// ホーム画面に追加したアプリはさらに長く古い版を開き続けることがあるため、起動時と画面に戻ったときに確かめる。
const SCRIPT = /assets\/index-[\w-]+\.js/;
const TRIED_KEY = "gb.update-tried";
const BUST = "_v";

const running = (): string | null =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.src.match(SCRIPT)?.[0] ?? null;

// 読み込み直しに付けた目印をアドレスから外す（ホーム画面への追加・共有に残さない）。
export function clearUpdateMark(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has(BUST)) return;
  url.searchParams.delete(BUST);
  history.replaceState(history.state, "", url);
}

export async function reloadIfUpdated(): Promise<void> {
  const mine = running();
  if (!import.meta.env.PROD || !mine) return;
  try {
    const page = new URL(location.href);
    page.hash = "";
    const html = await (await fetch(page, { cache: "no-store" })).text();
    const latest = html.match(SCRIPT)?.[0];
    // 同じ版への読み込み直しはタブごとに1回まで。入れ替わらなかったときに繰り返さない。
    if (!latest || latest === mine || readStore(TRIED_KEY, sessionStorage) === latest) return;
    writeStore(TRIED_KEY, latest, sessionStorage);
    // キャッシュに残った古い HTML を避けるため、目印を付けた別のアドレスで開き直す。
    page.searchParams.set(BUST, latest.replace(/^assets\/index-|\.js$/g, ""));
    location.replace(page);
  } catch { /* 確認できなくても今の版で遊べる */ }
}
