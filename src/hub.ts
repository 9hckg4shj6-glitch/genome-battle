import { esc, helix, icon, notebook, readStore, writeStore, type Question } from "./ui";
import { levelOf, readiness, type Mastery } from "./mastery";
import { renderOnlineCount } from "./presence";
import { renderThemeSwitch } from "./theme";
import { renderReadingControls } from "./readability";
import { renderConnection } from "./connection";
import { guideSeen } from "./guide";
import { inLineApp, renderInstallEntry } from "./install";

// 画面の階層：スタート画面 → ホーム（学ぶ／対戦する）→ 各ハブ → 各モードの設定。
// ホームには「次にすること」だけを置き、記録・表示の設定などは専用のページへ分ける。

// スタート画面はタブを開いたときに1回だけ。再読み込みでは出さない。
const TITLE_KEY = "gb.title-seen";
export const titleSeen = (): boolean => readStore(TITLE_KEY, sessionStorage) === "1";
export const markTitleSeen = (): void => writeStore(TITLE_KEY, "1", sessionStorage);

export type TitleStep = "start" | "name";
const waitingReview = (): number => { const n = notebook(); return new Set([...Object.keys(n.missed), ...Object.keys(n.uncertain)]).size; };

export function renderTitle(step: TitleStep, name: string, error = ""): string {
  const line = inLineApp ? `<p class="title-line">${icon("globe")}<span><b>LINEの中で開いています。</b>記録を残すため、ブラウザで開き直してホーム画面に追加するのがおすすめです。</span><button class="btn" data-act="install">手順を見る</button></p>` : "";
  const action = step === "name"
    ? `<section class="title-card" aria-labelledby="title-name-heading"><p class="eyebrow">WELCOME</p><h2 id="title-name-heading">プレイヤー名を決めよう</h2><p>対戦で相手に表示される名前です。あとから「メニュー」で変えられます。</p>
        <input id="title-name" maxlength="12" autocomplete="nickname" aria-label="プレイヤー名" placeholder="名前を入力（12文字まで）" value="${esc(name)}"/>
        ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
        <button class="btn primary" data-act="title-name">この名前ではじめる${icon("arrow")}</button><button class="btn ghost" data-act="title-skip">あとで決める</button>
        <ol class="title-steps"><li><b>1</b>学ぶ<small>解説付きで演習</small></li><li><b>2</b>対戦する<small>同級生・AIと勝負</small></li><li><b>3</b>復習する<small>間違いを得点源に</small></li></ol></section>`
    : `<button class="btn primary title-start" data-act="title-start">${icon("play")}はじめる</button><p class="title-hint">${name ? `おかえりなさい、<b>${esc(name)}</b> さん` : "登録なし・無料で、すぐに遊べます"}</p>`;
  return `<section class="title-screen${step === "name" ? " is-naming" : ""}">
    <div class="title-art" aria-hidden="true">${helix()}<span class="orbit orbit-one"></span><span class="orbit orbit-two"></span></div>
    <div class="title-copy"><p class="eyebrow accent-eyebrow"><span></span>ゲノム解析学 2025 · 過去問100問</p>
      <h1 class="title-logo"><span class="title-logo-icon">${icon("dna")}</span>GENOME<br><span>BATTLE</span></h1><p class="title-ja">ゲノム対戦</p>
      <p class="title-catch">遊んでいるうちに、<br><em>試験対策</em>が終わっている。</p></div>
    ${line}<div class="title-action">${action}</div>
    <div class="title-foot"><span id="online-count">${renderOnlineCount()}</span><button class="btn ghost" data-act="guide">${icon("help")}使い方ガイド</button>${renderThemeSwitch()}</div>
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

// メインメニュー。最初に選ぶのは「学ぶ」か「対戦する」の2つだけ。
export function renderHomeMenu(): string {
  return `<section class="home-menu" aria-labelledby="home-menu-heading"><p class="eyebrow">MAIN MENU</p><h1 id="home-menu-heading">今日は、なにをする？</h1>
    <div class="hub-grid">
      <button class="mode-card hub-card mode-study" data-mode="study"><div class="mode-top"><span class="mode-icon" data-morph="icon">${icon("book")}</span><span class="hub-tag">ひとりで</span></div><p class="mode-en">LEARN</p><h3 data-morph="title">学ぶ</h3><p class="mode-description">問題演習・過去問・復習ノート。解説を読みながら自分のペースで。</p><div class="mode-bottom"><span>時間制限なし</span>${icon("arrow")}</div></button>
      <button class="mode-card hub-card mode-matchmaking" data-act="hub-battle"><div class="mode-top"><span class="mode-icon" data-morph="icon">${icon("swords")}</span><span class="hub-tag">みんなと</span></div><p class="mode-en">BATTLE</p><h3 data-morph="title">対戦する</h3><p class="mode-description">同級生やAIと、5問先取のクイズバトル。</p><div class="mode-bottom"><span id="online-count">${renderOnlineCount()}</span>${icon("arrow")}</div></button>
    </div></section>`;
}

// 「次の一歩」は1つだけ出す。LINE内での利用 → 初めての人 → 復習待ち → ホーム画面への追加 の順。
export function renderSuggestion(): string {
  const tip = (cls: string, ic: string, title: string, text: string, act: string, label: string): string =>
    `<section class="home-tip ${cls}"><span class="mode-icon">${icon(ic)}</span><div><p class="eyebrow">NEXT STEP</p><h2>${title}</h2><p>${text}</p></div><button class="btn" data-act="${act}">${label}${icon("arrow")}</button></section>`;
  if (inLineApp) return tip("is-alert", "globe", "ブラウザで開き直そう", "LINEの中では記録が分かれてしまいます。ホーム画面に追加しておくと安心です。", "install", "手順");
  if (!guideSeen()) return tip("", "help", "はじめての方へ", "どれを選べばいいか迷ったら、1分で読める使い方ガイドから。", "guide", "ガイド");
  const waiting = waitingReview();
  if (waiting) return tip("", "bookmark", `復習待ちが ${waiting}問 あります`, "間違えた・迷った問題を解き直して、得点源に変えよう。", "notebook", "復習");
  if (renderInstallEntry()) return tip("", "check", "ホーム画面に追加しよう", "アイコンからワンタップで開けて、記録もまとまります。", "install", "手順");
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
    <div id="mastery-region">${masteryHtml}</div><section id="performance-panels">${performanceHtml}</section>`;
}

export function renderSettings(name: string): string {
  const row = (act: string, ic: string, title: string, text: string): string =>
    `<button class="menu-row" data-act="${act}"><span class="mode-icon">${icon(ic)}</span><span><strong>${title}</strong><small>${text}</small></span>${icon("arrow")}</button>`;
  return `<header class="setup-title menu-title"><span class="mode-icon">${icon("menu")}</span><div><p class="eyebrow">MENU</p><h1>メニュー</h1><p class="lead">表示の設定・プレイヤー名・ヘルプ。</p></div></header>
    <section class="panel menu-section" aria-labelledby="menu-display"><h2 id="menu-display">表示</h2>
      <div class="menu-setting"><span>画面の明るさ</span>${renderThemeSwitch()}</div>
      <div class="menu-setting">${renderReadingControls()}</div><p class="menu-note">文字サイズは問題文・選択肢・解説に効きます。対戦や学習の途中でも画面上部から変えられます。</p></section>
    <section class="panel menu-section" aria-labelledby="menu-player"><h2 id="menu-player">プレイヤー</h2>
      <label class="field"><span>プレイヤー名（対戦で表示）</span><input id="menu-name" maxlength="12" autocomplete="nickname" placeholder="名前を入力（12文字まで）" value="${esc(name)}"/></label></section>
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
