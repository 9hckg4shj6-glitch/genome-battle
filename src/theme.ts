import { icon, readStore, writeStore } from './ui';

type Theme = 'dark' | 'light';
const currentTheme = (): Theme => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

// テーマ変更は配色とスイッチだけを更新。解答、入力値、対戦の進行を維持する。
export function setTheme(theme: Theme, persist = true): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content',theme === 'light' ? '#f6f7ef' : '#101311');
  if (persist) writeStore('gb.theme', theme);
  document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  });
}

export function renderThemeSwitch(): string {
  const theme = currentTheme();
  return `<div class="theme-switch" role="group" aria-label="画面の明るさ"><button type="button" data-theme-choice="light" aria-label="ライトモード" aria-pressed="${theme === 'light'}" title="ライトモード（明るい画面）">${icon('sun')}<span>ライト</span></button><button type="button" data-theme-choice="dark" aria-label="ダークモード" aria-pressed="${theme === 'dark'}" title="ダークモード（暗い画面）">${icon('moon')}<span>ダーク</span></button></div>`;
}

setTheme(readStore('gb.theme') === 'light' ? 'light' : 'dark', false);
window.addEventListener('storage', event => {
  if (event.storageArea === localStorage && (event.key === 'gb.theme' || event.key === null)) {
    setTheme(event.newValue === 'light' ? 'light' : 'dark', false);
  }
});
