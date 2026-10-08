import { icon, notebook } from "./ui";

// ホーム画面の下部に固定する、主要な場所へのクイックボタン。
// モードは data-mode、それ以外は data-act で、ホームのカードと同じ処理に乗せる。
const ITEMS = [
  { attr: 'data-act="practice"', cls: "mode-study", icon: "book", label: "演習" },
  { attr: 'data-mode="matchmaking"', cls: "mode-matchmaking", icon: "swords", label: "マッチング" },
  { attr: 'data-mode="ai"', cls: "mode-ai", icon: "bot", label: "AI対戦" },
  { attr: 'data-mode="room"', cls: "mode-room", icon: "room", label: "対戦室" },
  { attr: 'data-act="notebook"', cls: "quick-notebook", icon: "bookmark", label: "復習" },
  { attr: 'data-act="catalog"', cls: "quick-catalog", icon: "zoom", label: "過去問" },
] as const;

export function renderQuickNav(): string {
  const n = notebook();
  const waiting = new Set([...Object.keys(n.missed), ...Object.keys(n.uncertain)]).size;
  const items = ITEMS.map((it) => {
    const badge = it.cls === "quick-notebook" && waiting ? `<b class="quick-badge" aria-label="復習待ち${waiting}問">${waiting > 99 ? "99+" : waiting}</b>` : "";
    return `<li><button class="quick-item ${it.cls}" ${it.attr}><span class="quick-icon">${icon(it.icon)}${badge}</span><span class="quick-label">${it.label}</span></button></li>`;
  }).join("");
  return `<nav class="quick-nav" aria-label="クイックメニュー"><ul>${items}</ul></nav>`;
}
