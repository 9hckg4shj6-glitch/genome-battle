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
  return `<div class="theme-switch" role="group" aria-label="画面の明るさ"><button type="button" data-theme-choice="light" aria-label="明るいデザイン" aria-pressed="${theme === 'light'}" title="明るいデザイン">${icon('sun')}<span>明</span></button><button type="button" data-theme-choice="dark" aria-label="暗いデザイン" aria-pressed="${theme === 'dark'}" title="暗いデザイン">${icon('moon')}<span>暗</span></button></div>`;
}

setTheme(readStore('gb.theme') === 'light' ? 'light' : 'dark', false);
window.addEventListener('storage', event => {
  if (event.storageArea === localStorage && (event.key === 'gb.theme' || event.key === null)) {
    setTheme(event.newValue === 'light' ? 'light' : 'dark', false);
  }
});
