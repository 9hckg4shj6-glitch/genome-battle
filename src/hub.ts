import { esc, icon, notebook, readStore, writeStore, type Question } from "./ui";
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
      <button class="btn primary title-start" data-act="title-start">${icon("play")}スタート</button></div>`;
  const guide = renderGuideEntry("title-guide");
  return `<section class="title-screen">
    <div class="title-model" aria-hidden="true"><canvas class="genome-model"></canvas></div>
    <div class="title-copy"><p class="eyebrow accent-eyebrow"><span></span>ゲノム解析学 2025 · 過去問100問</p>
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

// ホームの2枚のカードの背景図。学ぶ＝DNAの二重らせん（横木は塩基の4色）、対戦する＝照準の目盛り盤。
const f1 = (n: number): string => n.toFixed(1);
const HELIX_ART = (() => {
  const x = (y: number, side: number): number => 60 + side * 30 * Math.cos(Math.PI * y / 40);
  const strand = (side: number): string => `<path class="art-strand" d="M${Array.from({ length: 81 }, (_, i) => `${f1(x(i * 2, side))} ${i * 2}`).join("L")}"/>`;
  const rungs = Array.from({ length: 16 }, (_, i) => {
    const y = 5 + i * 10;
    return `<path class="art-rung base-${"GTCA"[i % 4]}" d="M${f1(x(y, 1))} ${y}H${f1(x(y, -1))}"/><circle cx="${f1(x(y, 1))}" cy="${y}" r="1.6"/><circle cx="${f1(x(y, -1))}" cy="${y}" r="1.6"/>`;
  }).join("");
  return `<svg class="hub-art art-helix" viewBox="0 0 120 160">${rungs}${strand(1)}${strand(-1)}</svg>`;
})();
const DIAL_ART = (() => {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = i * Math.PI / 36, inner = i % 6 ? 64 : 58;
    return `M${f1(80 + inner * Math.cos(a))} ${f1(80 + inner * Math.sin(a))}L${f1(80 + 68 * Math.cos(a))} ${f1(80 + 68 * Math.sin(a))}`;
  }).join("");
  return `<svg class="hub-art art-dial" viewBox="0 0 160 160"><g class="art-spin"><circle cx="80" cy="80" r="76"/><path class="art-ticks" d="${ticks}"/>
    <path class="art-arc" d="M80 30A50 50 0 0 1 130 80M80 130A50 50 0 0 1 30 80"/></g>
    <circle class="art-dash" cx="80" cy="80" r="38"/><circle cx="80" cy="80" r="18"/><path d="M80 4v38M80 118v38M4 80h38M118 80h38"/><circle class="art-dot" cx="80" cy="80" r="3"/></svg>`;
})();

const HUBS = [
  { no: "01", cls: "mode-study", attr: 'data-mode="study"', art: HELIX_ART, icon: "book", tag: "ひとりで", en: "LEARN", title: "学ぶ",
    text: "問題演習・過去問・復習ノート。解説を読みながら理解を深める。", specs: [["解説", "毎問つき"], ["制限時間", "なし"]], foot: () => "<span>自分のペースで</span>" },
  { no: "02", cls: "mode-matchmaking", attr: 'data-act="hub-battle"', art: DIAL_ART, icon: "swords", tag: "みんなと", en: "BATTLE", title: "対戦する",
    text: "同級生やAIとクイズで勝負。試合後はそのまま復習に。", specs: [["ルール", "5問先取"], ["人数", "2〜8人"]], foot: () => `<span id="online-count">${renderOnlineCount()}</span>` },
] as const;

// メインメニュー。最初に選ぶのは「学ぶ」か「対戦する」の2つだけ。
export function renderHomeMenu(): string {
  const cards = HUBS.map((h, i) => `<button class="mode-card hub-card ${h.cls}" ${h.attr} style="--i:${i}"><span class="hub-deco" aria-hidden="true">${h.art}</span>
      <div class="mode-top"><span class="mode-icon" data-morph="icon">${icon(h.icon)}</span><span class="hub-tag">${h.tag}</span></div>
      <p class="mode-en"><span class="hub-no">${h.no}</span>${h.en}</p><h3 data-morph="title">${h.title}</h3><p class="mode-description">${h.text}</p>
      <span class="hub-specs">${h.specs.map(([k, v]) => `<span><small>${k}</small><b>${v}</b></span>`).join("")}</span>
      <div class="mode-bottom">${h.foot()}${icon("arrow")}</div></button>`).join("");
  return `<section class="home-menu" aria-labelledby="home-menu-heading"><p class="eyebrow">MAIN MENU</p><h1 id="home-menu-heading">今日は、なにをする？</h1>
    <div class="hub-grid">${cards}</div>${renderGuideEntry("home-guide")}</section>`;
}

// 「次の一歩」は1つだけ出す。LINE内での利用 → 復習待ち → ホーム画面への追加 の順。使い方ガイドはホームに常に置く。
export function renderSuggestion(): string {
  const tip = (cls: string, ic: string, title: string, text: string, act: string, label: string): string =>
    `<section class="home-tip ${cls}"><span class="mode-icon">${icon(ic)}</span><div><p class="eyebrow">NEXT STEP</p><h2>${title}</h2><p>${text}</p></div><button class="btn" data-act="${act}">${label}${icon("arrow")}</button></section>`;
  if (inLineApp) return tip("is-alert", "globe", "ブラウザで開き直そう", "LINEの中では記録が分かれてしまいます。ホーム画面に追加しておくと安心です。", "install", "手順");
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
