import { esc, icon, notebook, readStore, writeStore, type Question } from "./ui";
import { levelOf, readiness, type Mastery } from "./mastery";
import { renderOnlineCount } from "./presence";
import { renderThemeSwitch } from "./theme";
import { renderReadingControls } from "./readability";
import { renderConnection } from "./connection";
import { guideSeen } from "./guide";
import { inLineApp } from "./install";

// 画面の階層：スタート画面 → ホーム（学ぶ／対戦する）→ 各ハブ → 各モードの設定。
// ホームには「次にすること」だけを置き、記録・表示の設定などは専用のページへ分ける。

// スタート画面はタブを開いたときに1回だけ。再読み込みでは出さない。
const TITLE_KEY = "gb.title-seen";
export const titleSeen = (): boolean => readStore(TITLE_KEY, sessionStorage) === "1";
export const markTitleSeen = (): void => writeStore(TITLE_KEY, "1", sessionStorage);

const waitingReview = (): number => { const n = notebook(); return new Set([...Object.keys(n.missed), ...Object.keys(n.uncertain)]).size; };

// 使い方ガイドの入口。初めての人（ガイド未読）には「はじめての方へ」を付けて目立たせる。
export function renderGuideEntry(cls: string): string {
  const first = !guideSeen();
  return `<button class="guide-entry ${cls}${first ? " is-first" : ""}" data-act="guide">${first ? `<span class="guide-entry-badge">はじめての方へ</span>` : ""}<span class="mode-icon">${icon("help")}</span><span class="guide-entry-copy"><strong>${first ? "まずは使い方ガイド" : "使い方ガイド"}</strong><small>${first ? "どの画面で何ができるか、1分でわかります" : "操作やルールに迷ったらこちら"}</small></span>${icon("arrow")}</button>`;
}

// スタート画面：ニックネームを入れて「スタート」。初めての人には、その前に使い方ガイドを勧める。
export function renderTitle(name: string, error = ""): string {
  const first = !guideSeen();
  const line = inLineApp ? `<p class="title-line">${icon("globe")}<span><b>LINEの中で開いています。</b>記録を残すため、ブラウザで開き直してホーム画面に追加するのがおすすめです。</span><button class="btn" data-act="install">手順を見る</button></p>` : "";
  const form = `<div class="title-form"><label class="title-label" for="title-name">ニックネーム<small>対戦で相手に表示されます（12文字まで）</small></label>
      <input id="title-name" maxlength="12" autocomplete="nickname" placeholder="例：ゲノム太郎" value="${esc(name)}" ${error ? 'aria-invalid="true" aria-describedby="title-error"' : ""}/>
      ${error ? `<p class="error" id="title-error" role="alert">${esc(error)}</p>` : ""}
      <button class="btn primary title-start" data-act="title-start">${icon("play")}スタート</button>
      <button class="title-transfer" data-act="transfer">${icon("phone")}前の端末の記録を引き継ぐ</button></div>`;
  const guide = renderGuideEntry("title-guide");
  return `<section class="title-screen">
    <div class="title-model" aria-hidden="true"><canvas class="genome-model"></canvas></div>
    <div class="title-copy"><p class="eyebrow accent-eyebrow"><span></span>ゲノム解析学 2024・2025 · 過去問200問</p>
      <h1 class="title-logo"><span class="title-logo-icon">${icon("dna")}</span>GENOME<br><span>BATTLE</span></h1><p class="title-ja">ゲノム対戦</p>
      <p class="title-catch">遊んでいるうちに、<br><em>試験対策</em>が終わっている。</p></div>
    ${line}<div class="title-action">${first ? guide + form : form + guide}</div>
    <div class="title-foot"><span id="online-count">${renderOnlineCount()}</span>${renderThemeSwitch()}</div>
  </section>`;
}

// ホーム最上段のプレイヤーカード。押すと「記録」へ。
export function renderHomePlayer(name: string, questions: Map<string, Question>, m: Mastery | null): string {
  const lv = m ? levelOf(m.xp) : null;
  const r = m && questions.size ? readiness(questions, m) : null;
  const shown = name.trim() || "ゲストプレイヤー";
  return `<button class="home-player" data-act="records" aria-label="${esc(shown)}の記録を見る"><span class="home-avatar" aria-hidden="true">${esc([...shown][0])}</span>
    <span class="home-player-copy"><small>PLAYER</small><strong>${esc(shown)}</strong><span class="home-xp"><b>Lv ${lv ? lv.level : "—"}</b><span class="home-xp-bar"><i style="width:${lv ? 100 * lv.into / lv.need : 0}%"></i></span></span></span>
    <span class="home-ready"><small>試験準備度</small><strong>${r ? r.ready : "—"}<small> / ${r ? r.total : questions.size}</small></strong></span>${icon("arrow")}</button>`;
}

const HUBS = [
  { cls: "mode-study", attr: 'data-mode="study"', icon: "book", en: "LEARN", title: "学ぶ", text: "ひとりで、解説を読みながら", foot: () => "<span>時間制限なし</span>" },
  { cls: "mode-matchmaking", attr: 'data-act="hub-battle"', icon: "swords", en: "BATTLE", title: "対戦する", text: "みんなと、5問先取で勝負", foot: () => `<span id="online-count">${renderOnlineCount()}</span>` },
] as const;

// メインメニュー。最初に選ぶのは「学ぶ」か「対戦する」の2つだけ。ゲームのメニューのような、厚みと縁取りのあるボタンにする。
export function renderHomeMenu(): string {
  const cards = HUBS.map((h, i) => `<button class="mode-card hub-card ${h.cls}" ${h.attr} style="--i:${i}"><span class="hub-shine" aria-hidden="true"></span>
      <span class="mode-icon" data-morph="icon">${icon(h.icon)}</span><span class="mode-en">${h.en}</span><h3 data-morph="title">${h.title}</h3>
      <span class="hub-orn" aria-hidden="true"><i></i></span><span class="mode-description">${h.text}</span><span class="hub-foot">${h.foot()}</span></button>`).join("");
  return `<section class="home-menu" aria-labelledby="home-menu-heading"><p class="eyebrow">MAIN MENU</p><h1 id="home-menu-heading">今日は、なにをする？</h1>
    <div class="hub-grid">${cards}</div>${renderGuideEntry("home-guide")}</section>`;
}

// 「学ぶ」の3つの入口。製本したノートのように、章番号の入った背表紙・重なったページ・折り返した角で作る。
export interface StudyEntry { no: string; en: string; title: string; text: string; icon: string; attr: string; cls: string; meta: string; morph?: boolean }
export function renderStudyEntry(e: StudyEntry): string {
  const morph = (k: string): string => e.morph ? ` data-morph="${k}"` : "";
  return `<button class="panel catalog-entry study-entry ${e.cls}" ${e.attr}><span class="entry-spine" aria-hidden="true"><b>${e.no}</b><span>${e.en}</span></span>
    <span class="entry-body"><span class="entry-head"><span class="mode-icon"${morph("icon")}>${icon(e.icon)}</span><span class="entry-title"><span class="eyebrow">CHAPTER ${e.no}</span><strong${morph("title")}>${e.title}</strong></span></span>
    <small>${e.text}</small><span class="entry-foot"><span class="entry-meta">${e.meta}</span><span class="entry-go">開く${icon("arrow")}</span></span></span></button>`;
}

// 「次の一歩」は復習待ちがあるときだけ出す。LINE内での利用・ホーム画面への追加は、ホーム上部の案内（renderInstallBanner）で目立たせる。
export function renderSuggestion(): string {
  const tip = (cls: string, ic: string, title: string, text: string, act: string, label: string): string =>
    `<section class="home-tip ${cls}"><span class="mode-icon">${icon(ic)}</span><div><p class="eyebrow">NEXT STEP</p><h2>${title}</h2><p>${text}</p></div><button class="btn" data-act="${act}">${label}${icon("arrow")}</button></section>`;
  const waiting = waitingReview();
  if (waiting) return tip("", "bookmark", `復習待ちが ${waiting}問 あります`, "間違えた・迷った問題を解き直して、得点源に変えよう。", "notebook", "復習");
  return "";
}

const BATTLES = [
  { mode: "matchmaking", icon: "swords", en: "MATCHMAKING", title: "マッチング対戦", text: "同じ人数を選んだ同級生と自動で対戦。", meta: "2〜4人 · 1問20秒" },
  { mode: "ai", icon: "bot", en: "AI BATTLE", title: "AI対戦", text: "相手を待たずに、いつでも練習試合。", meta: "3段階の難易度 · 早押し" },
  { mode: "room", icon: "room", en: "BATTLE ROOMS", title: "対戦室", text: "部屋を作って友だちを招待。公開ルームへの参加もここから。", meta: "2〜8人 · 分野を指定" },
] as const;

export function renderBattleHub(): string {
  return `<header class="setup-title battle-title mode-matchmaking"><span class="mode-icon" data-morph="icon">${icon("swords")}</span><div><p class="eyebrow">BATTLE</p><h1 data-morph="title">対戦する</h1><p class="lead">対戦のしかたを選んでください。</p></div></header>
    <p class="battle-online"><span id="online-count">${renderOnlineCount()}</span></p>
    <div class="battle-list">${BATTLES.map((b, i) => `<button class="mode-card battle-card mode-${b.mode}" data-mode="${b.mode}" style="--i:${i}"><span class="mode-icon" data-morph="icon">${icon(b.icon)}</span><span class="battle-copy"><span class="mode-en">${b.en}</span><strong data-morph="title">${b.title}</strong><span class="battle-text">${b.text}</span><span class="battle-meta">${b.meta}</span></span>${icon("arrow")}</button>`).join("")}</div>
    <details class="panel battle-rules"><summary>${icon("help")}対戦のルール</summary><ul class="guide-list"><li><b>先に5問正解した人の勝ち。</b>最大15問で、問題がなくなったら得点の多い人の勝ち。</li><li>同級生との対戦は全員が1回ずつ答え、正解した人<b>全員</b>に1点。</li><li>AI対戦は早押し。AIより先に正解すると1点。</li><li>毎問の解説と試合後の振り返りで、そのまま復習できます。</li></ul></details>`;
}

export function renderRecords(masteryHtml: string, performanceHtml: string): string {
  return `<header class="setup-title records-title"><span class="mode-icon">${icon("chart")}</span><div><p class="eyebrow">RECORDS</p><h1>記録</h1><p class="lead">学習レベル・試験準備度・学習と対戦の成績。</p></div></header>
    <div id="mastery-region">${masteryHtml}</div><section id="performance-panels">${performanceHtml}</section>
    <p class="records-transfer">${icon("phone")}<span><b>機種変更・別の端末で続けるときは</b><br>この記録はすべて、引き継ぎコードで新しい端末へ移せます。</span><button class="btn" data-act="transfer">端末の引き継ぎ${icon("arrow")}</button></p>`;
}

export function renderSettings(name: string): string {
  const row = (act: string, ic: string, title: string, text: string): string =>
    `<button class="menu-row" data-act="${act}"><span class="mode-icon">${icon(ic)}</span><span><strong>${title}</strong><small>${text}</small></span>${icon("arrow")}</button>`;
  return `<header class="setup-title menu-title"><span class="mode-icon">${icon("menu")}</span><div><p class="eyebrow">MENU</p><h1>メニュー</h1><p class="lead">表示の設定・プレイヤー名・端末の引き継ぎ・ヘルプ。</p></div></header>
    <section class="panel menu-section" aria-labelledby="menu-display"><h2 id="menu-display">表示</h2>
      <div class="menu-setting"><span>画面の明るさ</span>${renderThemeSwitch()}</div>
      <div class="menu-setting">${renderReadingControls()}</div><p class="menu-note">文字サイズは問題文・選択肢・解説に効きます。対戦や学習の途中でも画面上部から変えられます。</p></section>
    <section class="panel menu-section" aria-labelledby="menu-player"><h2 id="menu-player">プレイヤー</h2>
      <label class="field"><span>プレイヤー名（対戦で表示）</span><input id="menu-name" maxlength="12" autocomplete="nickname" placeholder="名前を入力（12文字まで）" value="${esc(name)}"/></label></section>
    <section class="panel menu-section" aria-labelledby="menu-data"><h2 id="menu-data">データ</h2>
      ${row("transfer", "phone", "端末の引き継ぎ", "機種変更・別の端末へ、記録をすべて移す")}</section>
    <section class="panel menu-section" aria-labelledby="menu-help"><h2 id="menu-help">ヘルプ</h2>
      ${row("guide", "help", "使い方ガイド", "モードの選び方・対戦のルール・復習のしかた")}
      ${row("install", "check", "ホーム画面に追加する", "iPhone・iPad・Androidの手順を図で説明")}
      ${row("friends", "user", "フレンド", "コードを交換して、対戦室に招待")}
      ${row("title", "play", "スタート画面", "タイトル画面をもう一度表示")}</section>
    <section class="panel menu-section" aria-labelledby="menu-status"><h2 id="menu-status">通信</h2><div class="menu-status"><span id="online-count">${renderOnlineCount()}</span><div id="connection-status" class="connection-strip">${renderConnection()}</div></div></section>`;
}

// 画面下のタブ。いま居る階層を示し、どこからでも主要な場所へ1タップで移れる。
export type Tab = "home" | "study" | "battle" | "notebook" | "records";
const TABS = [
  { tab: "home", attr: 'data-act="tab-home"', icon: "home", label: "ホーム" },
  { tab: "study", attr: 'data-mode="study"', icon: "book", label: "学ぶ" },
  { tab: "battle", attr: 'data-act="hub-battle"', icon: "swords", label: "対戦" },
  { tab: "notebook", attr: 'data-act="notebook"', icon: "bookmark", label: "復習" },
  { tab: "records", attr: 'data-act="records"', icon: "chart", label: "記録" },
] as const;

export function renderTabBar(current: Tab | null): string {
  const waiting = waitingReview();
  const items = TABS.map((t) => {
    const badge = t.tab === "notebook" && waiting ? `<b class="tab-badge" aria-label="復習待ち${waiting}問">${waiting > 99 ? "99+" : waiting}</b>` : "";
    return `<li><button class="tab-item tab-${t.tab}" ${t.attr} ${t.tab === current ? 'aria-current="page"' : ""}><span class="tab-icon">${icon(t.icon)}${badge}</span><span class="tab-label">${t.label}</span></button></li>`;
  }).join("");
  return `<nav class="tab-bar" aria-label="メインメニュー"><ul>${items}</ul></nav>`;
}
