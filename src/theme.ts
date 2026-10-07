import { icon, readStore, writeStore } from './ui';

type Theme = 'dark' | 'light';
const currentTheme = (): Theme => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
// 初回は明るい画面。暗い画面を選んだ人だけ保存値で切り替える。
const storedTheme = (value: string | null): Theme => value === 'dark' ? 'dark' : 'light';

const HINT_KEY = 'gb.theme-hint';
let hintAnimated = false; // 再描画のたびに吹き出しが出直さないよう、登場の動きは最初の1回だけ
// 一度でも切り替えた人・吹き出しを閉じた人には、明暗の案内を出さない。
const hintPending = (): boolean => !readStore(HINT_KEY) && !readStore('gb.theme');

export function dismissThemeHint(): void {
  writeStore(HINT_KEY, '1');
  document.querySelector('.theme-hint')?.remove();
  document.querySelector('.theme-switch.is-hinting')?.classList.remove('is-hinting');
}

// テーマ変更は配色とスイッチだけを更新。解答、入力値、対戦の進行を維持する。
export function setTheme(theme: Theme, persist = true): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content',theme === 'light' ? '#f6f7ef' : '#101311');
  if (persist) {writeStore('gb.theme', theme);dismissThemeHint();}
  document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  });
}

// 案内の吹き出しはホームでだけ出し、対戦・学習の途中には重ねない。
export function renderThemeSwitch(withHint = false): string {
  const theme = currentTheme();
  const hint = withHint && hintPending();
  const entering = hint && !hintAnimated;
  if (hint) hintAnimated = true;
  return `<div class="theme-switch-wrap"><div class="theme-switch ${hint ? 'is-hinting' : ''}" role="group" aria-label="画面の明るさ"><button type="button" data-theme-choice="light" aria-label="ライトモード（明るい画面）" aria-pressed="${theme === 'light'}" title="ライトモード（明るい画面）">${icon('sun')}<span>ライト</span></button><button type="button" data-theme-choice="dark" aria-label="ダークモード（暗い画面）" aria-pressed="${theme === 'dark'}" title="ダークモード（暗い画面）">${icon('moon')}<span>ダーク</span></button></div>${hint ? `<div class="theme-hint${entering ? ' is-entering' : ''}" role="note"><p><strong>画面の明るさを変えられます</strong><span class="theme-hint-keys"><span>${icon('sun')}ライト＝明るい画面</span><span>${icon('moon')}ダーク＝暗い画面</span></span>夜や暗い場所では「ダーク」が目にやさしいです。いつでも戻せます。</p><button type="button" class="btn ghost" data-act="theme-hint-dismiss">わかった</button></div>` : ''}</div>`;
}

setTheme(storedTheme(readStore('gb.theme')), false);
window.addEventListener('storage', event => {
  if (event.storageArea === localStorage && (event.key === 'gb.theme' || event.key === null)) {
    setTheme(storedTheme(event.newValue), false);
  }
});
