import { esc, icon, readStore, writeStore } from "./ui";

// LINEのリンクから開いた人に、ふだんのブラウザで開き直してホーム画面に追加する流れを図で案内する。
type Device = "iphone" | "ipad" | "android";
const DEVICES: { id: Device; label: string }[] = [{ id: "iphone", label: "iPhone" }, { id: "ipad", label: "iPad" }, { id: "android", label: "Android" }];
const DISMISS_KEY = "gb.install-dismissed";
const BASE = import.meta.env.BASE_URL;
const APP_ICON = `${BASE}icons/icon-192.png`;

const ua = navigator.userAgent;
// LINEの内部ブラウザは UA に「Line/バージョン」を含む。
export const inLineApp = /\bLine\//i.test(ua);
// iPadOS の Safari は Mac と同じ UA を名乗るので、タッチ対応で見分ける。
const detected: Device | null = /Android/i.test(ua) ? "android" : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ipad" : /iPhone|iPod/.test(ua) ? "iphone" : null;
let device: Device = detected ?? "iphone";
export function setInstallDevice(value: string | undefined): boolean {
  const next = DEVICES.find((d) => d.id === value)?.id;
  if (next) device = next;
  return !!next;
}

const standalone = (): boolean => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// Android の Chrome では、ブラウザ自身の追加画面をボタンから呼び出せる。
interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }>; }
let promptEvent: InstallPromptEvent | null = null;
let installed = false;
let onChange = (): void => {};
export const watchInstall = (rerender: () => void): void => { onChange = rerender; };
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptEvent = e as InstallPromptEvent; onChange(); });
window.addEventListener("appinstalled", () => { promptEvent = null; installed = true; onChange(); });
export async function promptInstall(): Promise<void> {
  const e = promptEvent;
  if (!e) return;
  promptEvent = null;
  try { await e.prompt(); if ((await e.userChoice).outcome === "accepted") installed = true; }
  catch { /* 呼び出せないときは手順の図で案内する */ }
  onChange();
}

// LINEは URL に openExternalBrowser=1 が付いていると、端末のブラウザで開き直す。
export function openInBrowser(): void {
  const url = new URL(location.href);
  url.searchParams.set("openExternalBrowser", "1");
  location.href = url.toString();
}
const appLink = (): string => `${location.origin}${BASE}`;
export async function copyAppLink(): Promise<void> {
  const status = document.getElementById("install-copy-status");
  try { await navigator.clipboard.writeText(appLink()); if (status) status.textContent = "コピーしました。ブラウザのアドレス欄に貼り付けて開いてください。"; }
  catch { if (status) status.textContent = `コピーできませんでした。アドレス欄に ${appLink()} と入力してください。`; }
}
export const dismissInstall = (): void => writeStore(DISMISS_KEY, "1");

// ---------- 図（端末の画面を簡略化したイラスト） ----------

const text = (x: number, y: number, s: string, cls = "", anchor = "start"): string => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${s}</text>`;
const hl = (x: number, y: number, w: number, h: number, r = 7): string => `<rect class="fig-hl" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const badge = (x: number, y: number, n: number, r = 9): string => `<g class="fig-badge"><circle class="fig-pulse" cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y}" r="${r}"/>${text(x, y + r * 0.4, String(n), "", "middle")}</g>`;
const appIcon = (id: string, x: number, y: number, s: number): string => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.23}"/></clipPath><image href="${APP_ICON}" x="${x}" y="${y}" width="${s}" height="${s}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
const vdots = (x: number, y: number): string => [-6, 0, 6].map((d) => `<circle class="fig-ink-solid" cx="${x}" cy="${y + d}" r="1.9"/>`).join("");
const hdots = (x: number, y: number): string => [-5, 0, 5].map((d) => `<circle class="fig-ink-solid" cx="${x + d}" cy="${y}" r="1.6"/>`).join("");
const shareGlyph = (x: number, y: number, s = 1): string => `<path class="fig-glyph" d="M${x - 5 * s} ${y - 2 * s}h-1.5v${9 * s}h${13 * s}v${-9 * s}h-1.5M${x} ${y + 3 * s}V${y - 8 * s}M${x - 3.5 * s} ${y - 4.5 * s}L${x} ${y - 8 * s}l${3.5 * s} ${3.5 * s}"/>`;
const plusSquare = (x: number, y: number): string => `<rect class="fig-glyph" x="${x - 6}" y="${y - 6}" width="12" height="12" rx="3"/><path class="fig-glyph" d="M${x} ${y - 3}v6M${x - 3} ${y}h6"/>`;
const closeGlyph = (x: number, y: number, s = 4): string => `<path class="fig-glyph" d="M${x - s} ${y - s}l${2 * s} ${2 * s}M${x + s} ${y - s}l${-2 * s} ${2 * s}"/>`;

// アプリのホーム画面を縮小した中身。cols 列のカードを1〜2段並べる。
function page(x: number, y: number, w: number, cols = 2, rows = 2): string {
  const l = x + 14, gap = 8, cw = (w - 28 - gap * (cols - 1)) / cols;
  const cards = Array.from({ length: cols * rows }, (_, i) => {
    const cx = l + (i % cols) * (cw + gap), cy = y + 88 + Math.floor(i / cols) * 60;
    return `<rect class="fig-card" x="${cx}" y="${cy}" width="${cw}" height="52" rx="8"/><rect class="fig-accent" x="${cx + 8}" y="${cy + 8}" width="11" height="11" rx="3"/><rect class="fig-soft" x="${cx + 8}" y="${cy + 28}" width="${cw * 0.6}" height="5" rx="2"/><rect class="fig-soft" x="${cx + 8}" y="${cy + 38}" width="${cw * 0.4}" height="4" rx="2"/>`;
  }).join("");
  return `<g>${text(l, y + 18, "GENOME BATTLE", "fig-brand")}<rect class="fig-ink" x="${l}" y="${y + 28}" width="${w * 0.6}" height="10" rx="3"/><rect class="fig-ink" x="${l}" y="${y + 43}" width="${w * 0.42}" height="10" rx="3"/><rect class="fig-soft" x="${l}" y="${y + 62}" width="${w * 0.68}" height="5" rx="2"/><rect class="fig-soft" x="${l}" y="${y + 71}" width="${w * 0.5}" height="5" rx="2"/>${cards}</g>`;
}
const menu = (x: number, y: number, w: number, items: string[], step: number, target: number, size = 8.5): string =>
  `<rect class="fig-menu" x="${x}" y="${y}" width="${w}" height="${items.length * step + 6}" rx="10"/>${items.map((s, i) => `${i ? `<path class="fig-divider" d="M${x + 8} ${y + 3 + i * step}h${w - 16}"/>` : ""}${text(x + 12, y + 3 + i * step + step / 2 + size * 0.38, s, i === target ? "fig-strong" : "", "start")}`).join("")}${hl(x + 4, y + 4 + target * step, w - 8, step - 2, 6)}`;

function phone(id: string, label: string, content: string, android = false): string {
  return `<svg class="install-fig" viewBox="0 0 200 380" role="img" aria-label="${esc(label)}"><clipPath id="${id}-s"><rect x="11" y="11" width="178" height="358" rx="22"/></clipPath><rect class="fig-body" x="3" y="3" width="194" height="374" rx="30"/><g clip-path="url(#${id}-s)"><rect class="fig-screen" x="11" y="11" width="178" height="358"/>${content}</g>${android ? `<circle class="fig-island" cx="100" cy="23" r="5"/>` : `<rect class="fig-island" x="78" y="18" width="44" height="12" rx="6"/>`}</svg>`;
}
function tablet(id: string, label: string, content: string): string {
  return `<svg class="install-fig tablet" viewBox="0 0 320 230" role="img" aria-label="${esc(label)}"><clipPath id="${id}-s"><rect x="12" y="12" width="296" height="206" rx="10"/></clipPath><rect class="fig-body" x="3" y="3" width="314" height="224" rx="18"/><g clip-path="url(#${id}-s)"><rect class="fig-screen" x="12" y="12" width="296" height="206"/>${content}</g><circle class="fig-island" cx="160" cy="7.5" r="2"/></svg>`;
}

// LINEの内部ブラウザ：右上の︙から、端末のブラウザで開く。
function lineFigure(id: string, openLabel: string, android: boolean): string {
  return phone(id, `LINEで開いた画面。右上の︙を押し、メニューの「${openLabel}」を選ぶ`, `<rect class="fig-bar" x="11" y="11" width="178" height="62"/>${closeGlyph(25, 56)}${text(100, 54, "ゲノム対戦", "fig-strong", "middle")}${text(100, 66, "github.io", "fig-small", "middle")}${vdots(174, 55)}
    ${page(11, 73, 178)}<rect class="fig-dim" x="11" y="73" width="178" height="296"/>
    ${hl(163, 40, 22, 30)}${menu(70, 80, 112, ["更新", "共有", "リンクをコピー", openLabel], 24, 3)}${badge(150, 55, 1)}${badge(62, 163, 2)}`, android);
}

// iPhone の Safari（iOS 26）：画面下の「…」→「共有」。
function safariMoreFigure(id: string): string {
  return phone(id, "Safariの画面。画面下の「…」を押し、メニューの「共有」を選ぶ", `${page(11, 38, 178)}<rect class="fig-dim" x="11" y="11" width="178" height="305"/>
    <rect class="fig-bar" x="11" y="316" width="178" height="53"/><circle class="fig-btn" cx="31" cy="338" r="13"/><path class="fig-glyph" d="M33 332l-6 6 6 6"/><rect class="fig-btn" x="50" y="325" width="100" height="26" rx="13"/>${text(100, 341.5, "ゲノム対戦", "", "middle")}<circle class="fig-btn" cx="169" cy="338" r="13"/>${hdots(169, 338)}
    <circle class="fig-hl" cx="169" cy="338" r="16"/>${menu(66, 196, 118, ["共有", "ブックマークを追加", "お気に入りに追加", "新規タブ"], 27, 0)}${shareGlyph(168, 216, 0.85)}${badge(146, 318, 1)}${badge(58, 210, 2)}`);
}

// iPhone の共有メニュー：「ホーム画面に追加」。
function shareSheetFigure(id: string): string {
  const people = ["AirDrop", "メッセージ", "メール", "メモ"].map((s, i) => `<circle class="fig-soft" cx="${40 + i * 40}" cy="214" r="14"/>${text(40 + i * 40, 242, s, "fig-small", "middle")}`).join("");
  const items = ["コピー", "ブックマークを追加", "ホーム画面に追加", "ページを編集"].map((s, i) => `${i ? `<path class="fig-divider" d="M27 ${256 + i * 26}h146"/>` : ""}${text(29, 256 + i * 26 + 16.5, s, i === 2 ? "fig-strong" : "")}`).join("");
  return phone(id, "共有メニュー。「ホーム画面に追加」を選ぶ", `${page(11, 38, 178)}<rect class="fig-dim" x="11" y="11" width="178" height="358"/>
    <rect class="fig-sheet" x="11" y="140" width="178" height="240" rx="18"/><rect class="fig-soft" x="88" y="146" width="24" height="4" rx="2"/>${appIcon(`${id}-i`, 23, 158, 28)}${text(59, 170, "ゲノム対戦", "fig-strong")}${text(59, 182, "github.io", "fig-small")}<circle class="fig-btn" cx="172" cy="168" r="10"/>${closeGlyph(172, 168, 3)}
    ${people}<rect class="fig-btn" x="19" y="256" width="162" height="104" rx="10"/>${items}${plusSquare(164, 321)}${hl(21, 309, 158, 24, 6)}${badge(176, 309, 3)}`);
}

// iPhone の追加画面：右上の「追加」。
function addFigure(id: string): string {
  return phone(id, "「ホーム画面に追加」の画面。名前を確認して右上の「追加」を押す", `${page(11, 38, 178)}<rect class="fig-dim" x="11" y="11" width="178" height="358"/>
    <rect class="fig-sheet" x="11" y="36" width="178" height="344" rx="16"/>${text(22, 62, "キャンセル", "fig-link")}${text(100, 62, "ホーム画面に追加", "fig-strong", "middle")}${text(178, 62, "追加", "fig-link fig-strong", "end")}
    <rect class="fig-btn" x="19" y="78" width="162" height="66" rx="10"/>${appIcon(`${id}-i`, 28, 89, 44)}${text(82, 104, "ゲノム対戦", "fig-strong fig-big")}<path class="fig-divider" d="M82 112h90"/>${text(82, 128, "github.io/genome-battle", "fig-small")}
    <rect class="fig-btn" x="19" y="154" width="162" height="30" rx="10"/>${text(28, 172.5, "Webアプリとして開く")}<rect class="fig-toggle" x="146" y="161" width="28" height="16" rx="8"/><circle class="fig-knob" cx="166" cy="169" r="6.5"/>
    ${[0, 1, 2].map((r) => Array.from({ length: 10 - r }, (_, c) => `<rect class="fig-key" x="${17 + r * 8 + c * 17}" y="${262 + r * 28}" width="13" height="21" rx="3"/>`).join("")).join("")}<rect class="fig-key" x="50" y="346" width="100" height="18" rx="3"/>
    ${hl(157, 48, 28, 20, 6)}${badge(146, 58, 4)}`);
}

// ホーム画面にアイコンが増えた様子。
function homeFigure(id: string, android = false, n = 0): string {
  const apps = Array.from({ length: 16 }, (_, i) => {
    const x = 24 + (i % 4) * 40, y = 52 + Math.floor(i / 4) * 58;
    return i === 9 ? "" : `<rect class="fig-app" x="${x}" y="${y}" width="30" height="30" rx="7"/><rect class="fig-app-label" x="${x + 6}" y="${y + 36}" width="18" height="3" rx="1.5"/>`;
  }).join("");
  return phone(id, "ホーム画面。「ゲノム対戦」のアイコンが増えている", `<rect class="fig-wall" x="11" y="11" width="178" height="358"/>${apps}${appIcon(`${id}-i`, 64, 168, 30)}${text(79, 208, "ゲノム対戦", "fig-wall-text", "middle")}
    ${[94, 100, 106].map((x, i) => `<circle class="${i === 1 ? "fig-app" : "fig-app-label"}" cx="${x}" cy="304" r="2"/>`).join("")}<rect class="fig-dock" x="19" y="318" width="162" height="42" rx="16"/>${[31, 70, 109, 148].map((x) => `<rect class="fig-app" x="${x}" y="327" width="24" height="24" rx="6"/>`).join("")}
    ${hl(56, 160, 46, 56, 10)}${n ? badge(100, 162, n) : ""}`, android);
}

const ipadBar = (): string => `<rect class="fig-bar" x="12" y="12" width="296" height="30"/><rect class="fig-glyph" x="21" y="21" width="13" height="11" rx="2"/><path class="fig-glyph" d="M50 22l-4 5 4 5M62 22l4 5-4 5"/><rect class="fig-btn" x="104" y="18" width="112" height="18" rx="9"/>${text(160, 30.5, "ゲノム対戦", "fig-small fig-ink-text", "middle")}${shareGlyph(252, 28, 0.8)}<path class="fig-glyph" d="M272 22v10M267 27h10"/><rect class="fig-glyph" x="288" y="22" width="10" height="10" rx="2"/>`;

// iPad の Safari：右上の共有ボタン →「ホーム画面に追加」。
function ipadShareFigure(id: string): string {
  return tablet(id, "iPadのSafari。右上の共有ボタンを押し、「ホーム画面に追加」を選ぶ", `${ipadBar()}${page(12, 40, 296, 4, 1)}<rect class="fig-dim" x="12" y="42" width="296" height="176"/>
    <circle class="fig-hl" cx="252" cy="26" r="11"/><path class="fig-menu" d="M246 49l6-6 6 6z"/><rect class="fig-menu" x="174" y="48" width="128" height="164" rx="10"/>${appIcon(`${id}-i`, 182, 56, 22)}${text(210, 65, "ゲノム対戦", "fig-strong fig-tiny")}${text(210, 74, "github.io", "fig-small")}
    ${[0, 1, 2, 3].map((i) => `<circle class="fig-soft" cx="${196 + i * 28}" cy="96" r="9"/>`).join("")}<rect class="fig-btn" x="180" y="116" width="116" height="88" rx="8"/>${["コピー", "ブックマークを追加", "ホーム画面に追加"].map((s, i) => `${i ? `<path class="fig-divider" d="M186 ${116 + i * 29}h104"/>` : ""}${text(188, 116 + i * 29 + 18, s, i === 2 ? "fig-strong fig-tiny" : "fig-tiny")}`).join("")}${plusSquare(284, 189)}${hl(182, 176, 112, 26, 6)}
    ${badge(234, 27, 1, 8)}${badge(170, 189, 2, 8)}`);
}
function ipadAddFigure(id: string): string {
  return tablet(id, "iPadの「ホーム画面に追加」の画面。右上の「追加」を押す", `${ipadBar()}${page(12, 40, 296, 4, 1)}<rect class="fig-dim" x="12" y="12" width="296" height="206"/>
    <rect class="fig-sheet" x="80" y="30" width="160" height="128" rx="12"/>${text(89, 51, "キャンセル", "fig-link fig-tiny")}${text(160, 51, "ホーム画面に追加", "fig-strong fig-tiny", "middle")}${text(232, 51, "追加", "fig-link fig-strong fig-tiny", "end")}
    <rect class="fig-btn" x="89" y="62" width="142" height="52" rx="8"/>${appIcon(`${id}-i`, 97, 70, 36)}${text(141, 85, "ゲノム対戦", "fig-strong")}<path class="fig-divider" d="M141 91h82"/>${text(141, 104, "github.io/genome-battle", "fig-small")}
    <rect class="fig-btn" x="89" y="122" width="142" height="24" rx="8"/>${text(97, 137, "Webアプリとして開く", "fig-tiny")}<rect class="fig-toggle" x="203" y="128" width="22" height="12" rx="6"/><circle class="fig-knob" cx="219" cy="134" r="4.8"/>
    ${hl(212, 41, 24, 15, 5)}${badge(204, 48, 3, 8)}`);
}
function ipadHomeFigure(id: string): string {
  const apps = Array.from({ length: 18 }, (_, i) => {
    const x = 38 + (i % 6) * 44, y = 32 + Math.floor(i / 6) * 48;
    return i === 8 ? "" : `<rect class="fig-app" x="${x}" y="${y}" width="26" height="26" rx="6"/><rect class="fig-app-label" x="${x + 5}" y="${y + 31}" width="16" height="3" rx="1.5"/>`;
  }).join("");
  return tablet(id, "iPadのホーム画面。「ゲノム対戦」のアイコンが増えている", `<rect class="fig-wall" x="12" y="12" width="296" height="206"/>${apps}${appIcon(`${id}-i`, 126, 80, 26)}${text(139, 116, "ゲノム対戦", "fig-wall-text", "middle")}<rect class="fig-dock" x="70" y="184" width="180" height="28" rx="10"/>${[0, 1, 2, 3, 4].map((i) => `<rect class="fig-app" x="${84 + i * 32}" y="${188 + 0}" width="20" height="20" rx="5"/>`).join("")}
    ${hl(118, 74, 42, 48, 9)}${badge(160, 76, 4, 8)}`);
}

// Android の Chrome：右上の︙ →「ホーム画面に追加」→「追加」。
const chromeBar = (): string => `<rect class="fig-bar" x="11" y="11" width="178" height="62"/><rect class="fig-btn" x="19" y="43" width="128" height="24" rx="12"/>${text(31, 58.5, "github.io/genome-battle", "fig-small fig-ink-text")}${vdots(176, 55)}`;
function chromeMenuFigure(id: string): string {
  return phone(id, "Chromeの画面。右上の︙を押し、「ホーム画面に追加」を選ぶ", `${chromeBar()}${page(11, 73, 178)}<rect class="fig-dim" x="11" y="73" width="178" height="296"/>
    ${hl(165, 40, 22, 30)}${menu(66, 78, 118, ["新しいタブ", "履歴", "ダウンロード", "ブックマーク", "ページ内検索", "ホーム画面に追加", "PC版サイト"], 23, 5)}${badge(156, 55, 1)}${badge(58, 202, 2)}`, true);
}
function chromeDialogFigure(id: string): string {
  return phone(id, "「ホーム画面に追加」の確認。「追加」を押す", `${chromeBar()}${page(11, 73, 178)}<rect class="fig-dim" x="11" y="11" width="178" height="358"/>
    <rect class="fig-sheet" x="23" y="128" width="154" height="124" rx="16"/>${text(37, 153, "ホーム画面に追加", "fig-strong fig-big")}${appIcon(`${id}-i`, 37, 168, 28)}${text(74, 186, "ゲノム対戦")}<path class="fig-hl-line" d="M74 193h89"/>
    ${text(124, 236, "キャンセル", "fig-link", "end")}${text(158, 236, "追加", "fig-link fig-strong", "middle")}${hl(143, 223, 30, 19, 6)}${badge(136, 224, 3)}`, true);
}

// ---------- 端末ごとの手順 ----------

interface Guide { browser: string; openLabel: string; openHow: string; add: { fig: (id: string) => string; html: string }[]; home: (id: string) => string; homeBadge: number; }
const guides: Record<Device, Guide> = {
  iphone: {
    browser: "Safari", openLabel: "Safariで開く",
    openHow: "画面右上（LINEのバージョンによっては右下）の<b>「︙」</b>を押し、<b>「Safariで開く」</b>を選びます。",
    add: [
      { fig: safariMoreFigure, html: "<b>①</b> Safariの画面下にある<b>「…」</b>を押し、<b>②「共有」</b>を選びます。<small>iOS 18以前は、画面下の<b>共有ボタン</b>（四角から上向きの矢印が出たマーク）を押します。</small>" },
      { fig: shareSheetFigure, html: "<b>③「ホーム画面に追加」</b>を押します。<small>見当たらないときは、メニューを上へスクロールしてください。</small>" },
      { fig: addFigure, html: "名前が「ゲノム対戦」になっていることを確かめて、右上の<b>④「追加」</b>を押します。" },
    ],
    home: (id) => homeFigure(id, false, 5), homeBadge: 5,
  },
  ipad: {
    browser: "Safari", openLabel: "Safariで開く",
    openHow: "画面右上の<b>「︙」</b>を押し、<b>「Safariで開く」</b>を選びます。",
    add: [
      { fig: ipadShareFigure, html: "Safariの画面右上の<b>①共有ボタン</b>（四角から上向きの矢印が出たマーク）を押し、<b>②「ホーム画面に追加」</b>を選びます。<small>共有ボタンが見当たらないときは、アドレス欄の「…」から「共有」を選びます。</small>" },
      { fig: ipadAddFigure, html: "名前が「ゲノム対戦」になっていることを確かめて、右上の<b>③「追加」</b>を押します。" },
    ],
    home: ipadHomeFigure, homeBadge: 4,
  },
  android: {
    browser: "Chrome", openLabel: "ブラウザで開く",
    openHow: "画面右上の<b>「︙」</b>を押し、<b>「ブラウザで開く」</b>を選びます。<small>「他のアプリで開く」と表示されるときは、続けて「Chrome」を選びます。</small>",
    add: [
      { fig: chromeMenuFigure, html: "Chromeの画面右上の<b>①「︙」</b>を押し、<b>②「ホーム画面に追加」</b>を選びます。<small>「アプリをインストール」と表示されることもあります。</small>" },
      { fig: chromeDialogFigure, html: "<b>③「追加」</b>（または「インストール」）を押します。もう一度確認が出たら「追加」を押します。" },
    ],
    home: (id) => homeFigure(id, true, 4), homeBadge: 4,
  },
};

const figure = (fig: string, html: string): string => `<figure class="install-shot">${fig}<figcaption>${html}</figcaption></figure>`;
const canPrompt = (): boolean => !!promptEvent;

// ホームの「おすすめ」。LINEの中で開いているときは、ホームの一番上に出す。
export function renderInstallEntry(): string {
  if (standalone() || installed || (!inLineApp && readStore(DISMISS_KEY) === "1")) return "";
  const g = guides[device];
  const lead = inLineApp
    ? `いまは<b>LINEの中</b>で開いています。${g.browser}などのブラウザで開き直してから、ホーム画面に追加しておくのがおすすめです。`
    : "ホーム画面に追加しておくと、次からはアイコンをタップするだけで開けます。";
  const actions = inLineApp
    ? `<button class="btn primary" data-act="install-browser">${icon("globe")}${g.browser}で開き直す</button><button class="btn" data-act="install">図で手順を見る${icon("arrow")}</button>`
    : `<button class="btn primary" data-act="${canPrompt() ? "install-prompt" : "install"}">${canPrompt() ? `${icon("check")}ホーム画面に追加する` : `図で手順を見る${icon("arrow")}`}</button>${canPrompt() ? `<button class="btn" data-act="install">図で手順を見る</button>` : ""}<button class="btn ghost" data-act="install-dismiss">追加済みなので閉じる</button>`;
  return `<section class="recommend${inLineApp ? " in-line" : ""}" aria-labelledby="recommend-title"><div class="section-heading"><div><p class="eyebrow">RECOMMENDED</p><h2 id="recommend-title">おすすめ</h2></div><span class="section-note">最初に1回だけ・約1分</span></div>
    <div class="panel recommend-card"><div class="recommend-art" aria-hidden="true">${homeFigure("rec-home", device === "android")}</div><div class="recommend-copy"><p class="eyebrow">ADD TO HOME SCREEN</p><h3>ホーム画面に追加して、<wbr>アプリのように使おう</h3><p>${lead}</p><ol class="recommend-flow"><li><b>1</b>${inLineApp ? `${g.browser}で開き直す` : "ブラウザで開く"}</li><li><b>2</b>ホーム画面に追加</li><li><b>3</b>アイコンから開く</li></ol><div class="recommend-actions">${actions}</div></div></div></section>`;
}

export function renderInstall(): string {
  const g = guides[device];
  const tabs = DEVICES.map((d) => `<button class="install-device" data-install-device="${d.id}" aria-pressed="${d.id === device}">${d.label}${d.id === detected ? "<small>この端末</small>" : ""}</button>`).join("");
  const lineFig = figure(lineFigure(`${device}-line`, g.openLabel, device === "android"), `${g.openHow}`);
  const step1 = inLineApp
    ? `<p>LINEの中の画面では、ホーム画面に追加できません。まず<b>${g.browser}</b>で開き直します。下のボタンを押すと${g.browser}が開きます。</p><button class="btn primary install-cta" data-act="install-browser">${icon("globe")}${g.browser}でこのページを開く</button><p class="install-sub">ボタンで開かないときは、次の図のように操作します。</p><div class="install-shots one">${lineFig}</div>`
    : `<p class="install-done">${icon("check")}<span>いまは<b>LINEの外のブラウザ</b>で開いています。この手順は終わっているので、ステップ2へ進んでください。</span></p><details class="install-more"><summary>LINEで開いたときの操作を見る</summary><div class="install-shots one">${lineFig}</div></details>`;
  const prompt = device === "android" && canPrompt() ? `<div class="install-quick"><p><b>この端末では、ボタン1つで追加できます。</b>確認が出たら「インストール」または「追加」を押してください。</p><button class="btn primary" data-act="install-prompt">${icon("check")}ホーム画面に追加する</button></div>` : "";
  return `<header class="hero small install-hero"><p class="eyebrow">RECOMMENDED · ADD TO HOME SCREEN</p><h1>ホーム画面に追加する方法</h1><p class="lead">LINEで届いたリンクから初めて開いた方へ。<b>ブラウザで開き直す → ホーム画面に追加 → アイコンから開く</b>の3ステップ（約1分）で、次からアプリのようにワンタップで開けます。</p></header>
  <section class="panel install-why"><h2>なぜホーム画面に追加するの？</h2><ul><li>${icon("check")}<span><b>ワンタップで開ける</b>　LINEでリンクを探さなくても、アイコンからすぐ始められます。</span></li><li>${icon("bookmark")}<span><b>記録をまとめて残せる</b>　学習成績や復習ノートは開いたブラウザごとに保存されます。いつも同じ場所から開けば、記録が分かれません。</span></li><li>${icon("globe")}<span><b>画面が広く、安定する</b>　LINEの中の画面より表示が広く、対戦中の通信も安定しやすくなります。</span></li></ul></section>
  <div class="install-devices" role="group" aria-label="使っている端末を選ぶ"><span>使っている端末：</span>${tabs}</div>
  <ol class="install-steps">
    <li class="panel install-step"><header><b>1</b><div><p class="eyebrow">STEP 1</p><h2>LINEの外のブラウザ（${g.browser}）で開く</h2></div></header>${step1}</li>
    <li class="panel install-step"><header><b>2</b><div><p class="eyebrow">STEP 2</p><h2>ホーム画面に追加する</h2></div></header><p>${g.browser}で「ゲノム対戦」を開いたまま、図の番号の順に押します。</p>${prompt}<div class="install-shots">${g.add.map((a, i) => figure(a.fig(`${device}-add${i}`), a.html)).join("")}</div></li>
    <li class="panel install-step"><header><b>3</b><div><p class="eyebrow">STEP 3</p><h2>次からはアイコンから開く</h2></div></header><div class="install-shots one">${figure(g.home(`${device}-home`), `ホーム画面に<b>「ゲノム対戦」</b>のアイコン（図の${"①②③④⑤"[g.homeBadge - 1]}）が増えます。次からはLINEのリンクではなく、<b>このアイコンから</b>開いてください。`)}</div></li>
  </ol>
  <section class="panel install-notes"><h2>うまくいかないとき・知っておきたいこと</h2><dl class="guide-defs">
    <div><dt>${icon("bookmark")}LINEで解いた記録は引き継がれません</dt><dd>記録は開いたブラウザごとに保存されるため、LINEの中で解いた分はブラウザを変えると表示されません。早めに切り替えておくのがおすすめです。</dd></div>
    <div><dt>${icon("check")}いつも同じアイコンから</dt><dd>追加した後は、LINEのリンクや${g.browser}ではなく、ホーム画面のアイコンから開いてください。開く場所が変わると、記録が別々になることがあります。</dd></div>
    <div><dt>${icon("help")}「ホーム画面に追加」が見つからない</dt><dd>${device === "android" ? "Chrome以外のブラウザでは、メニューの名前が違うことがあります。Chromeで開き直してから試してください。" : "共有メニューの一番下の「アクションを編集」から「ホーム画面に追加」を表示できます。Chromeなど他のブラウザでも、共有ボタンから追加できます。"}</dd></div>
    <div><dt>${icon("globe")}ボタンを押してもブラウザが開かない</dt><dd>アドレスをコピーして、${g.browser}のアドレス欄に貼り付けて開いてください。<span class="install-copy"><button class="btn" data-act="install-copy">アドレスをコピー</button><span id="install-copy-status" role="status">${esc(appLink())}</span></span></dd></div>
  </dl></section>
  <div class="panel guide-end"><p>追加できたら、さっそく始めましょう。</p><div><button class="btn primary" data-act="leave">ホームへ戻る</button><button class="btn ghost" data-act="guide">使い方ガイドを見る</button></div></div>`;
}
