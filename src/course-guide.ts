import { icon } from "./ui";

// 「学ぶ」の各コーナー（問題演習・復習ノート・過去問一覧）と、各対戦モード（マッチング対戦・AI対戦・対戦室）の使い方。
// ページ最上部のボタンから図解つきで開く。
export type Course = "practice" | "notebook" | "catalog" | "matchmaking" | "ai" | "room";
const COURSES: readonly string[] = ["practice", "notebook", "catalog", "matchmaking", "ai", "room"];
export const isCourse = (v: string | undefined): v is Course => !!v && COURSES.includes(v);

// ---------- 図（画面を簡略化したイラスト） ----------
const t = (x: number, y: number, s: string, cls = "", anchor = "start"): string => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${s}</text>`;
const box = (x: number, y: number, w: number, h: number, cls = "fig-card", r = 8): string => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const lines = (x: number, y: number, widths: number[], gap = 9): string => widths.map((w, i) => box(x, y + i * gap, w, 4.5, "fig-soft", 2)).join("");
const hl = (x: number, y: number, w: number, h: number, r = 8): string => `<rect class="fig-hl" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const badge = (x: number, y: number, n: number): string => `<g class="fig-badge"><circle class="fig-pulse" cx="${x}" cy="${y}" r="10"/><circle cx="${x}" cy="${y}" r="10"/>${t(x, y + 4, String(n), "", "middle")}</g>`;
const check = (x: number, y: number, on: boolean, s = 13): string => `${box(x, y, s, s, on ? "fig-on" : "fig-btn", 3.5)}${on ? `<path class="fig-tick" d="M${x + s * 0.25} ${y + s * 0.52}l${s * 0.17} ${s * 0.18} ${s * 0.33} -${s * 0.38}"/>` : ""}`;
const btn = (x: number, y: number, w: number, h: number, label: string, primary = false): string => `${box(x, y, w, h, primary ? "fig-primary" : "fig-btn", h / 2)}${t(x + w / 2, y + h / 2 + 3.8, label, primary ? "fig-on-text fig-strong" : "fig-strong", "middle")}`;
const svg = (label: string, h: number, body: string): string => `<svg class="course-fig" viewBox="0 0 320 ${h}" role="img" aria-label="${label}">${box(1, 1, 318, h - 2, "fig-screen-card", 16)}${body}</svg>`;

function practiceSetupFigure(): string {
  const years = ["すべて", "2025年度", "2024年度"].map((y, i) => `${box(18 + i * 96, 50, 90, 24, i === 2 ? "fig-card fig-card-on" : "fig-card", 7)}${t(63 + i * 96, 66, y, i === 2 ? "fig-small-strong" : "fig-small", "middle")}`).join("");
  const fields = ["遺伝子組換え", "転写・翻訳", "DNAの構造", "PCR・解析"];
  const cards = fields.map((f, i) => {
    const x = 18 + (i % 2) * 144, y = 100 + Math.floor(i / 2) * 36, on = i !== 3;
    return `${box(x, y, 136, 30, on ? "fig-card fig-card-on" : "fig-card")}${check(x + 9, y + 8.5, on)}${t(x + 30, y + 19, f)}`;
  }).join("");
  const orders = ["未着手優先", "苦手優先", "仕上げ", "ランダム"].map((o, i) => `${box(18 + i * 71, 296, 66, 22, i === 1 ? "fig-card fig-card-on" : "fig-card", 7)}${t(51 + i * 71, 311, o, i === 1 ? "fig-small-strong" : "fig-small", "middle")}`).join("");
  return svg("問題演習コーナの設定画面。年度と分野を選び、問題数と出題配分、出題方法を決め、画面下のバーから始める", 388, `
    ${t(18, 28, "問題演習コーナ", "fig-title")}${t(18, 44, "1 出題する年度", "fig-label")}${years}${hl(13, 45, 294, 34)}${badge(300, 48, 1)}
    ${t(18, 94, "2 学習する分野", "fig-label")}${cards}${hl(13, 95, 294, 76)}${badge(300, 98, 2)}
    ${t(18, 194, "3 問題数と出題配分", "fig-label")}<path class="fig-track" d="M24 212h200"/><path class="fig-track-on" d="M24 212h86"/><circle class="fig-knob-accent" cx="110" cy="212" r="7"/>${box(238, 201, 52, 22, "fig-btn", 6)}${t(264, 216, "20問", "fig-strong", "middle")}
    ${box(18, 232, 136, 28, "fig-card fig-card-on")}${t(86, 250, "過去問の配分", "fig-strong", "middle")}${box(162, 232, 140, 28)}${t(232, 250, "分野を均等に", "", "middle")}${hl(13, 199, 294, 66)}${badge(300, 202, 3)}
    ${t(18, 288, "4 出題方法", "fig-label")}${orders}${hl(13, 291, 294, 32)}${badge(300, 294, 4)}
    ${box(12, 332, 296, 44, "fig-bar-card", 12)}${t(24, 352, "10問", "fig-strong")}${t(24, 366, "2024年度 · 3分野 · 苦手優先", "fig-small")}${btn(196, 340, 100, 28, "はじめる", true)}${hl(190, 336, 112, 36, 18)}${badge(186, 338, 5)}`);
}

function practiceSessionFigure(): string {
  const choices = ["選択肢 A", "選択肢 B", "選択肢 C", "選択肢 D"].map((c, i) => `${box(18, 108 + i * 30, 284, 25, i === 1 ? "fig-card fig-card-on" : "fig-card", 7)}${box(25, 113 + i * 30, 15, 15, "fig-soft", 4)}${t(32.5, 124 + i * 30, String(i + 1), "fig-strong", "middle")}${t(48, 124.5 + i * 30, c)}`).join("");
  return svg("演習中の画面。選択肢を押して解答。わからないときは回答を見る、後で解く、中断して保存ができる", 320, `
    ${box(18, 14, 92, 20, "fig-tag", 10)}${t(64, 28, "一人で学習", "fig-small-strong", "middle")}${btn(206, 12, 96, 24, "中断して保存")}${hl(202, 8, 104, 32, 16)}${badge(196, 12, 4)}
    ${t(18, 56, "第3問 / 10問", "fig-strong")}${box(18, 64, 284, 4, "fig-soft", 2)}${box(18, 64, 86, 4, "fig-accent", 2)}
    ${lines(18, 80, [270, 220])}
    ${choices}${hl(13, 103, 294, 124)}${badge(300, 106, 1)}
    ${btn(18, 236, 284, 28, "わからないので回答を見る")}${hl(13, 232, 294, 36, 18)}${badge(300, 236, 2)}
    ${btn(18, 276, 284, 28, "後で解く", true)}${hl(13, 272, 294, 36, 18)}${badge(300, 276, 3)}`);
}

function notebookFigure(): string {
  const tabs = [["誤答・わからない", 5], ["迷った問題", 2], ["保存した問題", 3]] as const;
  return svg("復習ノートの画面。タブで種類を選び、まとめて演習する。各問題は解説つきで見直せる", 300, `
    ${t(18, 28, "復習ノート", "fig-title")}
    ${tabs.map(([l, n], i) => `${box(18 + i * 96, 40, 90, 26, i === 0 ? "fig-primary" : "fig-btn", 13)}${t(63 + i * 96, 57, `${l} ${n}`, i === 0 ? "fig-on-text fig-small-strong" : "fig-small-strong", "middle")}`).join("")}${hl(13, 35, 294, 36, 18)}${badge(300, 38, 1)}
    ${btn(18, 80, 284, 30, "この5問を演習する", true)}${hl(13, 75, 294, 40, 18)}${badge(300, 78, 2)}
    ${box(18, 124, 284, 162, "fig-card", 12)}${t(30, 144, "転写 · 間違えた回数 2回", "fig-small")}${box(240, 133, 52, 16, "fig-ng", 8)}${t(266, 144.5, "× 不正解", "fig-on-text fig-small-strong", "middle")}
    ${lines(30, 154, [250, 190])}
    ${[0, 1, 2].map(i => `${box(30, 176 + i * 20, 260, 16, i === 2 ? "fig-ok-soft" : i === 0 ? "fig-ng-soft" : "fig-card", 5)}`).join("")}
    ${lines(30, 240, [250, 210])}
    ${btn(30, 258, 108, 20, "この問題を保存")}${btn(146, 258, 96, 20, "リストから外す")}${hl(25, 253, 222, 30, 14)}${badge(250, 254, 3)}`);
}

function catalogFigure(): string {
  const rows = [false, true, false].map((on, i) => {
    const y = 172 + i * 38;
    return `${box(18, y, 284, 32, on ? "fig-card fig-card-on" : "fig-card", 9)}<circle class="fig-soft" cx="34" cy="${y + 16}" r="9"/>${t(34, y + 20, String(i + 1), "fig-strong", "middle")}${box(50, y + 8, 70, 4, "fig-accent", 2)}${box(50, y + 18, 180 - i * 30, 5, "fig-ink", 2)}<path class="fig-chevron" d="M252 ${y + 13}l4 4 4-4"/>${check(272, y + 8.5, on, 15)}`;
  }).join("");
  const chip = (x: number, y: number, w: number, label: string, on = false): string => `${box(x, y, w, 18, on ? "fig-primary" : "fig-btn", 9)}${t(x + w / 2, y + 12.5, label, on ? "fig-on-text fig-small-strong" : "fig-small-strong", "middle")}`;
  return svg("過去問一覧を「選んで演習」にした画面。キーワード・年度・分野・学習状態で絞り込み、右端の四角で演習する問題を選ぶと画面下にバーが出る", 370, `
    ${t(18, 28, "過去問・問題と解説", "fig-title")}
    ${box(18, 38, 284, 26, "fig-btn", 13)}${t(90, 55, "読んで学ぶ", "fig-small", "middle")}${box(162, 41, 137, 20, "fig-primary", 10)}${t(230, 55, "選んで演習", "fig-on-text fig-small-strong", "middle")}${hl(13, 33, 294, 36)}${badge(300, 36, 1)}
    ${box(18, 74, 284, 24, "fig-btn", 8)}<circle class="fig-glyph" cx="32" cy="86" r="5"/><path class="fig-glyph" d="M36 90l4 4"/>${t(46, 90, "例：PCR、塩基配列、12", "fig-muted")}${hl(13, 70, 294, 32)}${badge(300, 72, 2)}
    ${chip(18, 108, 54, "すべて")}${chip(76, 108, 54, "2025")}${chip(134, 108, 54, "2024", true)}${box(194, 108, 108, 18, "fig-btn", 6)}${t(202, 121, "すべての分野", "fig-small")}<path class="fig-chevron" d="M288 115l4 4 4-4"/>${hl(13, 104, 294, 26)}${badge(300, 106, 3)}
    ${chip(18, 140, 50, "すべて", true)}${chip(72, 140, 62, "解説未読")}${chip(138, 140, 50, "未着手")}${chip(192, 140, 44, "誤答")}${hl(13, 136, 228, 26, 13)}${badge(250, 149, 4)}
    ${rows}${hl(46, 175, 196, 26, 6)}${badge(242, 175, 5)}${hl(266, 207, 27, 28, 6)}${badge(302, 207, 6)}
    ${box(12, 298, 296, 60, "fig-bar-card", 12)}${t(24, 318, "1問を選択中", "fig-strong")}${check(210, 308, false, 11)}${t(225, 318, "ランダムな順", "fig-small")}${btn(24, 326, 272, 22, "選んだ1問を演習する", true)}${hl(18, 322, 284, 30, 15)}${badge(300, 324, 7)}`);
}

// ---------- 対戦モードの図 ----------
const chevron = (x: number, y: number): string => `<path class="fig-chevron" d="M${x} ${y}l4 4 4-4"/>`;
const input = (x: number, y: number, w: number, label: string, value: string, select = false): string =>
  `${t(x, y, label, "fig-label")}${box(x, y + 6, w, 24, "fig-btn", 7)}${t(x + 10, y + 22, value)}${select ? chevron(x + w - 16, y + 16) : ""}`;
const nameInput = (y: number): string => input(18, y, 284, "プレイヤー名", "ゲノム太郎");
// 待機中の参加者。ready が null なら空席（参加待ち）。
const seat = (x: number, y: number, name: string, ready: boolean | null, me = false): string => ready === null
  ? `${box(x, y, 88, 30, "fig-slot", 8)}${t(x + 44, y + 19, name, "fig-small", "middle")}`
  : `${box(x, y, 88, 30, me ? "fig-card fig-card-on" : "fig-card", 8)}${t(x + 9, y + 13, name, "fig-small-strong")}${box(x + 9, y + 17, ready ? 40 : 32, 9, ready ? "fig-ok-soft" : "fig-soft", 4.5)}${t(x + 13, y + 24, ready ? "準備完了" : "準備中", "fig-tiny")}`;
// 解答中の参加者。得点と「回答済」「リーチ」。
const scorer = (x: number, y: number, name: string, score: number, mark: string, me = false): string =>
  `${box(x, y, 88, 34, me ? "fig-card fig-card-on" : "fig-card", 8)}${t(x + 9, y + 14, name, "fig-small-strong")}${t(x + 9, y + 28, String(score), "fig-score")}${mark ? `${box(x + 44, y + 19, 38, 10, mark === "リーチ" ? "fig-reach" : "fig-soft", 5)}${t(x + 63, y + 27, mark, mark === "リーチ" ? "fig-tiny fig-on-text" : "fig-tiny", "middle")}` : ""}`;
const choiceRows = (y: number, state: (i: number) => string): string => ["選択肢 A", "選択肢 B", "選択肢 C", "選択肢 D"].map((c, i) => {
  const cls = state(i);
  return `${box(18, y + i * 28, 284, 23, cls || "fig-card", 7)}${box(25, y + 4 + i * 28, 15, 15, "fig-soft", 4)}${t(32.5, y + 15 + i * 28, String(i + 1), "fig-strong", "middle")}${t(48, y + 15.5 + i * 28, c)}${cls === "fig-ng-soft" ? t(290, y + 15.5 + i * 28, "×", "fig-strong fig-ng-text", "end") : ""}`;
}).join("");
const questionHead = (y: number, label: string, sec: string): string =>
  `${t(18, y, label, "fig-strong")}${box(132, y - 11, 72, 16, "fig-tag", 8)}${t(168, y + 0.5, "転写・翻訳", "fig-small-strong", "middle")}${t(302, y, sec, "fig-strong", "end")}${box(18, y + 8, 284, 4, "fig-soft", 2)}${box(18, y + 8, 170, 4, "fig-accent", 2)}`;

function matchSetupFigure(): string {
  const sizes = [["ソロ", "二人で対戦"], ["三人対戦", "3人で対戦"], ["四人対戦", "4人で対戦"]].map(([l, sub], i) =>
    `${box(18 + i * 96, 118, 90, 40, i === 0 ? "fig-card fig-card-on" : "fig-card", 8)}${t(63 + i * 96, 135, l, "fig-strong", "middle")}${t(63 + i * 96, 149, sub, "fig-small", "middle")}`).join("");
  return svg("マッチング対戦の設定画面。名前を確かめ、マッチング人数を選んで、対戦相手を探す", 262, `
    ${t(18, 28, "マッチング対戦", "fig-title")}${nameInput(52)}${hl(13, 40, 294, 50)}${badge(300, 44, 1)}
    ${t(18, 112, "マッチング人数", "fig-label")}${sizes}${hl(13, 101, 294, 62)}${badge(300, 104, 2)}
    ${t(18, 184, "1問20秒・全員が答えたら解説を3秒表示", "fig-small")}${t(18, 198, "同じ人数を選んだ人どうしでマッチング", "fig-small")}
    ${btn(18, 214, 284, 32, "対戦相手を探す", true)}${hl(13, 209, 294, 42, 21)}${badge(300, 212, 3)}`);
}

function matchWaitingFigure(): string {
  const levels = ["ビギナー", "スタンダード", "エキスパート"].map((l, i) => `${box(30 + i * 87, 240, 81, 18, i === 1 ? "fig-card fig-card-on" : "fig-card", 9)}${t(70.5 + i * 87, 252.5, l, i === 1 ? "fig-small-strong" : "fig-small", "middle")}`).join("");
  return svg("マッチング対戦の待機画面。参加者と待ち時間、準備完了ボタン。一人のまま待つとAI対戦の提案が出る", 342, `
    ${t(160, 28, "MATCHMAKING", "fig-label", "middle")}${t(160, 48, "対戦相手を探しています", "fig-title", "middle")}${t(160, 64, "あと1人の参加と、全員の準備完了を待っています", "fig-small", "middle")}${t(160, 82, "待ち時間 0:18", "fig-small-strong", "middle")}
    ${seat(66, 94, "ゲノム太郎", false, true)}${seat(166, 94, "参加待ち", null)}${hl(13, 70, 294, 59)}${badge(300, 74, 1)}
    ${btn(18, 138, 284, 30, "準備完了", true)}${hl(13, 133, 294, 40, 20)}${badge(300, 136, 2)}
    ${t(160, 186, "準備完了 0 / 1人。全員の準備完了後に開始します。", "fig-small", "middle")}
    ${box(18, 196, 284, 98, "fig-card", 12)}${t(30, 216, "いまは対戦相手が見つかりません", "fig-strong")}${t(30, 231, "AIと対戦しませんか？ 相手探しをやめてすぐ始まります", "fig-small")}${levels}
    ${btn(30, 266, 150, 22, "AIと対戦する", true)}${btn(188, 266, 102, 22, "このまま待つ")}${hl(13, 191, 294, 108, 14)}${badge(300, 194, 3)}
    ${btn(110, 306, 100, 24, "やめる")}${hl(105, 302, 110, 32, 16)}${badge(224, 318, 4)}`);
}

// マッチング対戦と対戦室の解答画面。全員が1回ずつ答え、正解した人全員に1点。
function groupPlayFigure(label: string, sec: number): string {
  return svg(`${label}の解答画面。参加者の得点、残り時間、選択肢、正解と解説`, 360, `
    ${box(18, 14, 108, 20, "fig-tag", 10)}${t(72, 28, label, "fig-small-strong", "middle")}${t(136, 28, "5問先取", "fig-small")}
    ${scorer(18, 44, "あなた", 3, "回答済", true)}${scorer(116, 44, "Bさん", 4, "リーチ")}${scorer(214, 44, "Cさん", 2, "")}${hl(13, 39, 294, 44)}${badge(300, 42, 1)}
    ${questionHead(100, "第6問 / 最大15問", "12秒")}${hl(264, 86, 44, 20, 10)}${badge(252, 96, 2)}
    ${lines(18, 124, [270, 230])}
    ${choiceRows(146, i => i === 2 ? "fig-card fig-card-on" : "")}${hl(13, 141, 294, 116)}${badge(300, 144, 3)}
    ${t(160, 272, "回答しました。全員の回答を待っています…（2/3人）", "fig-small", "middle")}
    ${box(18, 282, 284, 66, "fig-ok-soft", 10)}${t(30, 300, "あなたは正解！", "fig-strong")}${t(290, 300, `次へ ${sec}秒`, "fig-small", "end")}${t(30, 314, "正解者：あなた、Bさん", "fig-small")}${btn(30, 322, 128, 18, "正解したけど迷った")}
    ${hl(13, 277, 294, 76)}${badge(300, 280, 4)}`);
}

function resultFigure(): string {
  const ranks = [["ゲノム太郎", 5], ["Bさん", 4], ["Cさん", 2]] as const;
  return svg("試合後の結果発表。順位、対戦直後の復習コース、同じメンバーで再戦、解説を振り返る", 330, `
    ${t(160, 28, "試合終了", "fig-label", "middle")}${t(160, 48, "ゲノム太郎 さんの勝ち！", "fig-title", "middle")}
    ${ranks.map(([n, p], i) => `${box(18, 60 + i * 28, 284, 24, i === 0 ? "fig-card fig-card-on" : "fig-card", 7)}<circle class="${i === 0 ? "fig-on" : "fig-soft"}" cx="34" cy="${72 + i * 28}" r="8"/>${t(34, 75.5 + i * 28, String(i + 1), i === 0 ? "fig-on-text fig-small-strong" : "fig-small-strong", "middle")}${t(50, 76 + i * 28, n, "fig-strong")}${t(290, 76 + i * 28, `${p}点`, "fig-strong", "end")}`).join("")}${hl(13, 55, 294, 90)}${badge(300, 58, 1)}
    ${box(18, 152, 284, 64, "fig-card", 10)}${t(30, 170, "対戦直後の復習コース", "fig-strong")}${t(30, 184, "誤答 2問 · 未解答 1問 · 迷った 1問", "fig-small")}${btn(30, 192, 260, 18, "復習コースを始める（4問）", true)}${hl(13, 147, 294, 74)}${badge(300, 150, 2)}
    ${btn(18, 228, 284, 26, "同じメンバーで再戦", true)}${hl(13, 224, 294, 34, 17)}${badge(300, 227, 3)}
    ${btn(18, 264, 284, 24, "解説を振り返る")}${btn(18, 294, 284, 24, "もう一度ランダム対戦")}${hl(13, 260, 294, 62, 14)}${badge(300, 263, 4)}`);
}

function aiSetupFigure(): string {
  return svg("AI対戦の設定画面。名前、AIの難易度と1問の制限時間を選び、AIと対戦する", 238, `
    ${t(18, 28, "AI対戦", "fig-title")}${nameInput(52)}${hl(13, 40, 294, 50)}${badge(300, 44, 1)}
    ${input(18, 108, 136, "AIの難易度", "スタンダード", true)}${input(166, 108, 76, "1問の制限時間", "20")}${t(250, 130, "5〜120秒", "fig-small")}${hl(13, 97, 294, 49)}${badge(300, 100, 2)}
    ${t(18, 162, "AIも問題文を読んでから答えます", "fig-small")}${t(18, 176, "5問先取・最大15問の早押し対戦", "fig-small")}
    ${btn(18, 190, 284, 32, "AIと対戦する", true)}${hl(13, 185, 294, 42, 21)}${badge(300, 188, 3)}`);
}

function aiPlayFigure(): string {
  const side = (x: number, name: string, score: number, me: boolean): string =>
    `${box(x, 42, 120, 40, me ? "fig-card fig-card-on" : "fig-card", 10)}<circle class="fig-soft" cx="${x + 20}" cy="62" r="10"/>${t(x + 36, 58, name, "fig-small-strong")}${t(x + 108, 70, String(score), "fig-score-lg", "end")}${me ? "" : `${box(x + 36, 64, 36, 10, "fig-reach", 5)}${t(x + 54, 72, "リーチ", "fig-tiny fig-on-text", "middle")}`}`;
  return svg("AI対戦の解答画面。あなたとAIの得点、残り時間、早押しの選択肢、正解と解説", 356, `
    ${box(18, 14, 140, 20, "fig-tag", 10)}${t(88, 28, "AI対戦 · スタンダード", "fig-small-strong", "middle")}${t(168, 28, "5問先取", "fig-small")}
    ${side(18, "あなた", 3, true)}${t(160, 66, "VS", "fig-strong", "middle")}${side(182, "GENOME AI", 4, false)}${hl(13, 37, 294, 50)}${badge(300, 40, 1)}
    ${questionHead(104, "第8問 / 15問", "9秒")}${hl(264, 90, 44, 20, 10)}${badge(252, 100, 2)}
    ${lines(18, 128, [270, 230])}
    ${choiceRows(150, i => i === 1 ? "fig-ng-soft" : "")}${hl(13, 145, 294, 116)}${badge(300, 148, 3)}
    ${t(160, 276, "お手つき。まもなくAIの解答を発表します…", "fig-small", "middle")}
    ${box(18, 286, 284, 58, "fig-card", 10)}${t(30, 306, "AIが先に正解", "fig-strong")}${t(30, 322, "正答：3. 選択肢 C", "fig-small")}${btn(180, 310, 110, 24, "次の問題へ", true)}${hl(13, 281, 294, 68)}${badge(300, 284, 4)}`);
}

function roomCreateFigure(): string {
  return svg("対戦室の作成画面。出題する分野、定員と制限時間、鍵付きルームを選び、対戦室を作成する", 304, `
    ${t(18, 28, "対戦室", "fig-title")}${input(18, 52, 284, "プレイヤー名", "ゲノム太郎")}
    ${input(18, 100, 284, "対戦室の分野", "転写・翻訳（24問）", true)}${t(18, 146, "転写・翻訳から最大15問を出題", "fig-small")}${hl(13, 90, 294, 62)}${badge(300, 94, 1)}
    ${input(18, 168, 136, "部屋の定員", "4人", true)}${input(166, 168, 76, "1問の制限時間", "20")}${t(250, 190, "5〜120秒", "fig-small")}${hl(13, 157, 294, 49)}${badge(300, 160, 2)}
    ${box(18, 214, 284, 36, "fig-card", 9)}${t(30, 229, "鍵付きルームにする", "fig-strong")}${t(30, 242, "一覧には表示せず、招待した人だけが参加", "fig-small")}${box(258, 224, 32, 16, "fig-btn", 8)}<circle class="fig-knob-accent" cx="266" cy="232" r="5"/>${hl(13, 209, 294, 46)}${badge(300, 212, 3)}
    ${btn(18, 262, 284, 30, "対戦室を作成する", true)}${hl(13, 257, 294, 40, 20)}${badge(300, 260, 4)}`);
}

function roomWaitingFigure(): string {
  return svg("対戦室の待機画面。部屋番号、招待のボタン、鍵の切り替え、参加者と準備完了、開始ボタン", 326, `
    ${box(96, 12, 128, 20, "fig-tag", 10)}${t(160, 26, "公開ルーム · 誰でも参加", "fig-small-strong", "middle")}${t(160, 48, "部屋番号", "fig-label", "middle")}${t(160, 78, "4821", "fig-code", "middle")}${hl(86, 7, 148, 80, 12)}${badge(244, 14, 1)}
    ${btn(18, 96, 138, 26, "LINEで誘う")}${btn(164, 96, 138, 26, "招待リンクをコピー")}${hl(13, 91, 294, 36, 18)}${badge(300, 94, 2)}
    ${btn(18, 134, 284, 24, "鍵をかけて招待制にする")}${hl(13, 130, 294, 32, 16)}${badge(300, 133, 3)}
    ${t(160, 178, "出題分野：転写・翻訳 · 最大15問", "fig-small", "middle")}${t(160, 192, "参加者 3 / 4・1問20秒", "fig-small", "middle")}
    ${seat(18, 200, "ゲノム太郎", true, true)}${seat(116, 200, "Bさん", true)}${seat(214, 200, "Cさん", true)}
    ${btn(18, 240, 284, 26, "準備完了を取り消す")}${hl(13, 195, 294, 76, 14)}${badge(300, 198, 4)}
    ${btn(18, 280, 284, 30, "3人で開始", true)}${hl(13, 275, 294, 40, 20)}${badge(300, 278, 5)}`);
}

function roomJoinFigure(): string {
  const rooms = [["Aさんの対戦室", "2 / 4人 · 1問20秒 · 転写・翻訳", "参加する"], ["Dさんの対戦室", "8 / 8人 · 1問30秒 · すべての分野", "満員"]].map(([n, sub, act], i) =>
    `${box(28, 184 + i * 50, 264, 42, "fig-btn", 9)}${t(40, 201 + i * 50, n, "fig-small-strong")}${t(40, 215 + i * 50, sub, "fig-small")}${t(282, 208 + i * 50, act, i ? "fig-small" : "fig-small-strong", "end")}`).join("");
  return svg("対戦室に参加する画面。部屋番号と招待キーを入れて参加するか、公開ルームの一覧から選ぶ", 304, `
    ${t(18, 28, "部屋番号・招待リンクで参加", "fig-title")}
    ${input(18, 52, 180, "部屋番号（4桁）", "4821")}${btn(206, 58, 96, 24, "対戦室に参加")}${hl(13, 40, 294, 50)}${badge(300, 44, 1)}
    ${t(18, 108, "招待キー（鍵付きルームのみ）", "fig-label")}${box(18, 114, 284, 24, "fig-btn", 7)}${t(28, 130, "招待リンクから開くと自動入力", "fig-small")}${hl(13, 97, 294, 46)}${badge(300, 100, 2)}
    ${box(18, 152, 284, 140, "fig-card", 12)}${t(30, 173, "公開ルーム", "fig-strong")}${btn(244, 160, 48, 18, "更新")}${rooms}${hl(13, 147, 294, 150, 14)}${badge(300, 150, 3)}`);
}

// ---------- 部品 ----------
const legend = (items: string[]): string => `<ol class="course-legend">${items.map((s, i) => `<li><b>${i + 1}</b><span>${s}</span></li>`).join("")}</ol>`;
const figure = (fig: string, items: string[]): string => `<figure class="course-figure">${fig}<figcaption>${legend(items)}</figcaption></figure>`;
const flow = (nodes: string[]): string => `<ol class="course-flow">${nodes.map(n => `<li>${n}</li>`).join("")}</ol>`;
const tips = (items: string[]): string => `<ul class="course-tips">${items.map(s => `<li>${s}</li>`).join("")}</ul>`;
// 対戦のルールをカードで並べる。
const rules = (items: [string, string][]): string => `<dl class="course-rules">${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
const note = (ic: string, html: string): string => `<p class="course-note">${icon(ic)}<span>${html}</span></p>`;
const section = (eyebrow: string, title: string, body: string): string => `<section class="course-section"><p class="eyebrow">${eyebrow}</p><h3>${title}</h3>${body}</section>`;

// 解説リーダーの画面。進み具合・答えを隠す切り替え・問題と解説・前後の移動。
function readerFigure(): string {
  const choices = ["花粉", "ウイルス", "培養細胞"].map((c, i) => `${box(30, 150 + i * 26, 260, 21, i === 2 ? "fig-card fig-card-on" : "fig-card", 6)}${t(44, 164.5 + i * 26, `${i + 1}  ${c}`, i === 2 ? "fig-small-strong" : "fig-small")}`).join("");
  return svg("解説リーダーの画面。答えを隠す切り替え、問題と正解・解説、あとで解く、前後の移動ボタン", 330, `
    ${t(18, 28, "過去問を1問ずつ読む", "fig-title")}${t(18, 50, "2 / 100問", "fig-strong")}<path class="fig-track" d="M92 46h206"/><path class="fig-track-on" d="M92 46h40"/>
    ${box(18, 60, 284, 30, "fig-card", 9)}${t(30, 79, "答えを隠して読む", "fig-small-strong")}${box(258, 67, 32, 16, "fig-btn", 8)}<circle class="fig-knob-accent" cx="266" cy="75" r="5"/>${hl(13, 55, 294, 40)}${badge(300, 58, 1)}
    ${box(18, 100, 284, 168, "fig-card", 12)}${t(30, 120, "2025年度 第2問 · 遺伝子組換え", "fig-small")}${t(30, 138, "対象とならない生物はどれか", "fig-strong")}${choices}
    ${lines(30, 228, [240, 200], 7)}${hl(24, 145, 272, 78)}${badge(300, 148, 2)}
    ${btn(30, 243, 150, 18, "あとで解く（保存）")}${hl(25, 239, 160, 26, 13)}${badge(186, 241, 3)}
    ${box(12, 278, 296, 42, "fig-bar-card", 12)}${btn(22, 285, 70, 28, "前へ")}${btn(100, 285, 196, 28, "次の問題へ", true)}${hl(94, 281, 208, 36, 18)}${badge(300, 284, 4)}`);
}
export const renderReaderFigure = (): string => figure(readerFigure(), [
  "<b>答えを隠して読む</b>をオンにすると、正解と解説を伏せたまま問題を読めます。自分で答えを考えてから確かめる暗記カードの使い方です（オフなら最初から解説まで表示）",
  "隠しているときは<b>選択肢を押す</b>か「正解と解説を見る」で表示。選んだ答えの正誤も出ますが、読むための画面なので記録には残りません",
  "<b>あとで解く</b>で、その問題を復習ノートの「保存した問題」に入れます。「この問題を演習する」ですぐ解くこともできます",
  "<b>次の問題へ</b>・<b>前へ</b>で移動（左右のスワイプ、パソコンでは ← → キーでも）。次の問題の解説は先に読み込むので待たずに読めます",
]);

interface Guide { eyebrow: string; title: string; lead: string; body: string; start: string; }
// マッチング対戦・対戦室の試合後（結果発表の図）の説明。
const afterMatch = (rematch: string): string[] => [
  "試合が終わると、まず全問の<b>解説を振り返る</b>画面が開きます。読み終えたら「結果発表を見る」で<b>順位と得点</b>が出ます",
  "<b>対戦直後の復習コース</b>：間違えた・時間切れ・迷った問題だけを、時間制限なしで解き直せます",
  `<b>同じメンバーで再戦</b>：${rematch}。全員が再戦に参加し、準備完了になると始まります`,
  "<b>解説を振り返る</b>でもう一度全問の解説へ。「もう一度ランダム対戦」で新しい相手を探します",
];
// 過去問一覧の図と番号つき説明。全体の使い方ガイドでも使う。
export const renderCatalogFigure = (): string => figure(catalogFigure(), [
  "一番上の切り替えを<b>選んで演習</b>にする（「読んで学ぶ」のときは、四角と演習のバーは出ません）",
  "<b>キーワード</b>で探す。問題文・選択肢・分野名が対象です。スペースで区切るとすべての語を含む問題に、数字だけなら問題番号・年度でも探せます",
  "<b>年度</b>（すべて・2025・2024）のボタンと<b>分野</b>で絞り込む。分野の問題数は選んだ年度の中で数えます",
  "<b>学習状態</b>（解説未読・未着手・誤答・取り組み中・習得）で絞り込む",
  "<b>問題を押す</b>と、正解と解説が開きます。開いた問題の下の「この問題を演習する」で1問だけ解くこともできます",
  "<b>右端の四角</b>を押すと、演習する問題に選ばれます（もう一度押すと外れます）。一覧の上の「この条件のM問を選ぶ」で、絞り込んだ問題をまとめて選べます",
  "1問以上選ぶと画面下に<b>バー</b>が出ます。「<b>選んだN問を演習する</b>」で開始。「ランダムな順」をオンにすると順番を混ぜます",
]);

const GUIDES: Record<Course, Guide> = {
  practice: {
    eyebrow: "COURSE GUIDE", title: "問題演習コーナの使い方",
    lead: "年度と分野を組み合わせて、自分だけの演習セットを作るコーナーです。時間制限はなく、1問ごとに正解と解説を読みながら進められます。",
    body: section("STEP 1", "設定して始める", figure(practiceSetupFigure(), [
      "<b>出題する年度</b>を選ぶ。「すべての年度」か、2025年度・2024年度の1年度分だけかをボタンで切り替えます",
      "<b>学習する分野</b>を選ぶ。いくつでも組み合わせられます（「すべて選択」「選択を解除」もあります）",
      "<b>問題数</b>を「5問・10問・20問・全部」のボタン、スライダー、数字のどれかで決める（1問およそ1分の目安時間が出ます）。2分野以上なら<b>出題配分</b>（過去問の配分／分野を均等に）も選ぶ",
      "<b>出題方法</b>を選ぶ。<b>未着手優先</b>・<b>苦手優先</b>（取り組み中・間違えた問題）・<b>仕上げ</b>（あと1回の正解で定着する問題）・<b>ランダム</b>の4つ。右に対象の問題数が出ます",
      "画面の下に留まる<b>はじめる</b>を押して開始。どこまでスクロールしていても、すぐに始められます",
    ]))
      + section("STEP 2", "解いて、解説を読む", figure(practiceSessionFigure(), [
        "選択肢を押して解答。すぐに正解と解説が出ます",
        "<b>わからないので回答を見る</b>：当てずっぽうにせず答えと解説を確認。正解数には入らず、復習ノートに記録されます",
        "<b>後で解く</b>：この問題を最後に回します。残りを解いたあとに戻ってきます",
        "<b>中断して保存</b>：途中でやめても、「学ぶ」の<b>保存した学習の続き</b>から再開できます",
      ]))
      + section("FLOW", "1問の流れ", flow(["解答する", "正解・解説を読む", "「次の問題へ」", "最後に全問を振り返る"])
        + `<p class="course-note">${icon("bookmark")}<span>間違えた問題・回答を見た問題は<b>復習ノート</b>に自動で入ります。正解でも自信がなければ、解説の下の「<b>正解したけど迷った</b>」で記録できます。</span></p>`)
      + section("TIPS", "うまく使うコツ", tips([
        "はじめは「すべての分野」×「過去問の配分」で、試験に近い形から始めるのがおすすめです",
        "1年度分を通して解きたいときは、年度を選んで「全部（100問）」にすると本番と同じ問題がそろいます",
        "苦手な分野だけを選んで、少ない問題数で繰り返すと定着しやすくなります",
        "各分野の★と「習得」の数で、どこまで身についたかが分かります（初めて解いて正解すると習得。間違えたことのある問題は2回連続で正解）",
      ])),
    start: "設定をはじめる",
  },
  notebook: {
    eyebrow: "COURSE GUIDE", title: "復習ノートの使い方",
    lead: "間違えた問題や迷った問題が自動で集まる、あなた専用の復習リストです。試験までの1週間、<b>その日の分を毎日片づける</b>使い方を想定しています。",
    body: section("HOW IT FILLS", "問題がたまる仕組み", `<div class="course-lanes">
        <div><span>学習・対戦で<b>間違えた</b>・対戦で<b>時間切れ</b><br>「<b>わからないので回答を見る</b>」で確認した</span>${icon("arrow")}<strong>誤答・わからない</strong></div>
        <div><span>正解したあとに<br>「<b>正解したけど迷った</b>」を押した</span>${icon("arrow")}<strong>迷った問題</strong></div>
        <div><span>振り返り画面の「<b>この問題を保存</b>」<br>解説リーダーの「<b>あとで解く</b>」を押した</span>${icon("arrow")}<strong>保存した問題</strong></div>
      </div>`)
      + section("HOW TO USE", "見直して、解き直す", figure(notebookFigure(), [
        "<b>タブ</b>で、見直したい種類を選ぶ。数字はたまっている問題数です",
        "<b>このN問を演習する</b>で、そのタブの問題だけをまとめて解き直します（時間制限なし）。10問より多いときは、<b>問題数</b>（10問・20問・全部）と<b>選び方</b>（ランダム・間違えた回数が多い順）を選べます",
        "各問題は正解・あなたの解答・解説つきで並びます。<b>保存</b>したり、もう覚えた問題をすぐ<b>リストから外し</b>たりできます",
      ]))
      + section("FLOW", "おすすめの復習サイクル", flow(["間違えた日に解説を読んで解き直す", "正解したら今日の分は完了", "翌日もう一度正解したら自動で外れる", "毎日「今日の復習」を0にする"]))
      + section("TIPS", "うまく使うコツ", tips([
        "「誤答・わからない」の問題は、<b>日をあけて2回正解</b>すると自動で外れます。間違えた当日の解き直しも1回目に数え、2回目は翌日以降です（途中で間違えたら数え直し）。数えるのは時間制限のない学習・復習の正解だけで、対戦の正解では外れません",
        "「迷った問題」は、翌日以降に正解すると外れます。そのときも迷ったら、解説の「正解したけど迷った」をもう一度押すと残せます",
        "画面下の「復習」タブや「学ぶ」に出る<b>今日の復習</b>は、今日まだ正解していない問題の数です。試験まで毎日これを0にするのが目安です",
        "過去問の解説を読んでいて気になった問題は、解説リーダーの「あとで解く」で保存しておくと、ここからまとめて解けます",
        "記録はこのブラウザに保存されます。いつも同じブラウザ・ホーム画面のアイコンから開くと、ノートがひとつにまとまります",
      ])),
    start: "ノートを見る",
  },
  catalog: {
    eyebrow: "COURSE GUIDE", title: "過去問・問題と解説の使い方",
    lead: "アプリに収録している全問題を、探して・読んで・選んで演習できる一覧です。上の切り替えで、解説を読んで学ぶ「読んで学ぶ」と、問題を集めて解く「選んで演習」を選べます。",
    body: section("READ", "読んで学ぶ：1問ずつ読み進める", `<p class="course-note">${icon("book")}<span>最初は「読んで学ぶ」になっています。絞り込んだ問題を「<b>1問ずつ読む</b>」で、解説を順番に読み進められます。解説を開いた問題には「<b>読んだ</b>」が付き、年度ごとの読んだ数と「<b>続きから読む</b>」（しおり）が一覧の上に出ます。学習状態の「<b>解説未読</b>」で、まだ読んでいない問題だけに絞れます。</span></p>` + renderReaderFigure())
      + section("FLOW", "読んで学ぶ流れ", flow(["年度・分野で絞り込む", "「1問ずつ読む」", "正解と解説を読む", "「続きから読む」で再開"]))
      + section("HOW TO USE", "探して、選んで、演習する", renderCatalogFigure())
      + section("TIPS", "うまく使うコツ", tips([
        "「読んだ」の記録はこの端末に保存され、正答率・学習レベル・未着手の判定には入りません。読むだけで気軽に進められます",
        "試験前は年度を選んで「答えを隠して読む」をオンにすると、1年度分を本番のように確かめられます",
        "選んだ問題は、ページや絞り込みを変えても残ります。いろいろな条件から少しずつ集められます",
        "出題は問題番号の順です。バーの「<b>ランダムな順で出題</b>」をオンにすると順番を混ぜます",
        "1回の演習は<b>100問まで</b>選べます",
        "「誤答」で絞り込んで「この条件の問題を選ぶ」と、苦手な問題だけの演習がすぐに作れます",
        "<b>年度</b>で絞り込んで「この条件の100問を選ぶ」と、その年度の過去問を1回分まるごと解けます",
      ])),
    start: "一覧を見る",
  },
  matchmaking: {
    eyebrow: "BATTLE GUIDE", title: "マッチング対戦の使い方",
    lead: "人数を選ぶだけで、同じ人数を選んだ同級生と自動で組み合わさる対戦です。早押しではなく、<b>全員が1問ずつ答えて正解した人全員に1点</b>。落ち着いて考えた人が勝てるルールです。",
    body: section("RULES", "対戦のルール", rules([
      ["5問先取", "先に5問正解した人の勝ち"],
      ["最大15問", "問題がなくなったら得点の多い人の勝ち"],
      ["全員で解答", "1問20秒。正解した人<b>全員</b>に1点"],
    ]))
      + section("STEP 1", "人数を選んで、相手を探す", figure(matchSetupFigure(), [
        "<b>プレイヤー名</b>を確かめる。対戦相手にこの名前が表示されます（12文字まで）",
        "<b>マッチング人数</b>を「ソロ（二人で対戦）・三人対戦・四人対戦」から選ぶ。同じ人数を選んだ人どうしで組み合わせます",
        "<b>対戦相手を探す</b>を押す。制限時間（1問20秒）と解説の表示時間は全員共通です",
      ]))
      + section("STEP 2", "そろったら、準備完了", figure(matchWaitingFigure(), [
        "参加者と<b>待ち時間</b>が出ます。選んだ人数がそろうまで、そのまま待ちます。相手が来たら音と振動でお知らせします",
        "<b>準備完了</b>を押す。人数がそろい、全員が準備完了になると自動で始まります（押したあとは「準備完了を取り消す」で戻せます）",
        "一人のまま15秒たつと<b>AI対戦</b>を提案します。難易度を選んで「AIと対戦する」ですぐ開始、「このまま待つ」で相手探しを続けます",
        "<b>やめる</b>で相手探しをやめます",
      ]))
      + section("STEP 3", "全員で同じ問題を解く", figure(groupPlayFigure("マッチング対戦", 3), [
        "参加者と<b>得点</b>。答えた人には「回答済」が付きます（正誤は発表まで隠れます）。あと1問で勝つ人には<b>リーチ</b>が出ます",
        "<b>残り時間</b>。1問20秒で、時間内に答えないと時間切れ（得点なし）です",
        "選択肢を押して解答。<b>答えは1回だけ</b>で、押したら変えられません。早押しではないので、最後まで考えてから選べます",
        "全員が答えるか時間切れで<b>正解と解説</b>を3秒表示して次の問題へ。自信がなければ「<b>正解したけど迷った</b>」で復習ノートに残せます",
      ]))
      + section("FLOW", "試合の流れ", flow(["人数を選んで相手を探す", "全員が準備完了", "1問ずつ全員で解答", "解説を振り返り、結果発表"]))
      + section("STEP 4", "試合のあと", figure(resultFigure(), afterMatch("メンバーを引き継いでもう一度")))
      + section("TIPS", "うまく使うコツ", tips([
        "相手が見つかるまで時間がかかることがあります。同級生と時間を合わせると早く始まります。決まった友だちとなら「対戦室」が確実です",
        "解説は対戦中は3秒だけです。<b>全文は試合後の振り返り</b>でゆっくり読めます",
        "間違えた問題・時間切れの問題は、自動で<b>復習ノート</b>に入ります",
        "効果音は、対戦画面の上の音のボタンで切り替えられます",
      ])),
    start: "人数を選ぶ",
  },
  ai: {
    eyebrow: "BATTLE GUIDE", title: "AI対戦の使い方",
    lead: "相手を待たずに、いつでもすぐ始められる練習試合です。AIとの<b>早押し</b>で、先に正解した方に1点。すべての年度・分野から出題されるので、短い時間での力試しにも向いています。",
    body: section("RULES", "対戦のルール", rules([
      ["5問先取", "先に5問正解した方の勝ち"],
      ["最大15問", "問題がなくなったら得点の多い方の勝ち"],
      ["早押し", "AIより<b>先に正解</b>すると1点"],
    ]))
      + section("STEP 1", "難易度を選んで始める", figure(aiSetupFigure(), [
        "<b>プレイヤー名</b>を確かめる（12文字まで）",
        "<b>AIの難易度</b>（ビギナー・スタンダード・エキスパート）と<b>1問の制限時間</b>（5〜120秒）を選ぶ。難易度が上がるほど、AIが速く正確に答えます",
        "<b>AIと対戦する</b>で開始。すべての年度・分野から最大15問を出題します",
      ]))
      + section("STEP 2", "早押しで答える", figure(aiPlayFigure(), [
        "あなたとAIの<b>得点</b>。あと1問で勝つときは<b>リーチ</b>が出ます",
        "<b>残り時間</b>。AIも問題文を読んでから答えるので、長い問題・図のある問題ほどAIは遅めです",
        "選択肢を押して解答。AIより<b>先に正解</b>すると1点。間違えると<b>お手つき</b>で、その問題はもう答えられません。AIがお手つきしたときは、まだ答えられます",
        "正解と解説を読んだら<b>次の問題へ</b>。解説を読む時間に制限はありません",
      ]))
      + section("FLOW", "試合の流れ", flow(["難易度と制限時間を選ぶ", "早押しで解答", "正解と解説を読む", "5問先取で決着"]))
      + section("AFTER", "試合のあと", note("trophy", "勝敗と得点が出ます。<b>対戦直後の復習コース</b>で、間違えた・時間切れ・迷った問題だけを時間制限なしで解き直せます。「<b>正解と解説を振り返る</b>」で全問の解説を読み直し、「<b>もう一度対戦する</b>」で同じ設定の次の試合へ進めます。"))
      + section("TIPS", "うまく使うコツ", tips([
        "まずは<b>ビギナー</b>で操作に慣れ、勝てるようになったら難易度を上げるのがおすすめです",
        "制限時間を長くすると、問題をじっくり読んでから答える練習になります",
        "押した答えがAIの正解や制限時間より少し遅れて届くと「<b>タッチの差</b>」と出ます。選んだ答えが正解だったかも分かります",
        "マッチング対戦で相手が見つからないときも、待ち画面からそのままAI対戦に切り替えられます",
        "間違えた問題・時間切れの問題は、自動で<b>復習ノート</b>に入ります",
      ])),
    start: "対戦の設定へ",
  },
  room: {
    eyebrow: "BATTLE GUIDE", title: "対戦室の使い方",
    lead: "部屋を作って友だちを誘う、仲間うちの対戦です。<b>出題する分野</b>・<b>定員</b>（2〜8人）・<b>1問の制限時間</b>を自由に決められるので、授業の範囲だけでの勝負や、試験前のグループ学習にも使えます。",
    body: section("RULES", "対戦のルール", rules([
      ["5問先取", "先に5問正解した人の勝ち"],
      ["最大15問", "選んだ分野から出題。問題がなくなったら得点の多い人の勝ち"],
      ["全員で解答", "正解した人<b>全員</b>に1点"],
    ]))
      + section("STEP 1", "部屋を作る", figure(roomCreateFigure(), [
        "出題する<b>分野</b>を選ぶ（「すべての分野」も選べます）。選んだ分野から最大15問を出題します",
        "<b>部屋の定員</b>（2〜8人）と<b>1問の制限時間</b>（5〜120秒）を決める",
        "<b>鍵付きルーム</b>にすると公開ルーム一覧に出ず、招待リンクを持つ人だけが入れます",
        "<b>対戦室を作成する</b>で部屋ができ、待機画面に移ります",
      ]))
      + section("STEP 2", "友だちを誘って始める", figure(roomWaitingFigure(), [
        "<b>部屋番号</b>（4桁）。公開ルームなら、番号を伝えるだけで参加してもらえます",
        "<b>LINEで誘う</b>・<b>招待リンクをコピー</b>で招待リンクを送れます。鍵付きルームにも、このリンクから入れます",
        "部屋を作った人は、待機中でも<b>鍵をかける／外す</b>を切り替えられます。参加済みの人はそのまま遊べます",
        "参加者がそろったら、全員が<b>準備完了</b>を押す（押したあとは「準備完了を取り消す」で戻せます）",
        "全員が準備完了になると、部屋を作った人の<b>N人で開始</b>が押せるようになります。参加した側は開始を待つだけです",
      ]) + note("user", "フレンドには、待機中に右上の「<b>フレンド</b>」から「<b>この部屋に招待</b>」を送れます。"))
      + section("JOIN", "誘われた側：部屋に参加する", figure(roomJoinFigure(), [
        "<b>部屋番号</b>（4桁）を入れて「対戦室に参加」。招待リンクから開くと、番号が入った状態でこの画面が開きます",
        "鍵付きルームは<b>招待キー</b>も必要です。招待リンクから開けば自動で入ります",
        "<b>公開ルーム</b>の一覧から選んで参加することもできます。満員の部屋は選べません。「更新」で最新の一覧にします",
      ]))
      + section("STEP 3", "全員で同じ問題を解く", figure(groupPlayFigure("友だちと対戦", 7), [
        "参加者と<b>得点</b>。答えた人には「回答済」が付きます（正誤は発表まで隠れます）。あと1問で勝つ人には<b>リーチ</b>が出ます",
        "<b>残り時間</b>。部屋で決めた制限時間で、時間内に答えないと時間切れ（得点なし）です",
        "選択肢を押して解答。<b>答えは1回だけ</b>で、押したら変えられません。早押しではないので、最後まで考えてから選べます",
        "全員が答えるか時間切れで<b>正解と解説</b>を7秒表示して次の問題へ。自信がなければ「<b>正解したけど迷った</b>」で復習ノートに残せます",
      ]))
      + section("FLOW", "試合の流れ", flow(["部屋を作って友だちを誘う", "全員が準備完了", "作った人が開始", "解説を振り返り、結果発表"]))
      + section("STEP 4", "試合のあと", figure(resultFigure(), afterMatch("メンバー・分野・制限時間を引き継いでもう一度")))
      + section("TIPS", "うまく使うコツ", tips([
        "授業で習った分野だけを選ぶと、範囲をしぼった確認テストのように使えます",
        "はじめての人がいるときは、制限時間を長めにすると落ち着いて答えられます",
        "公開ルームは同級生なら誰でも参加できます。決まったメンバーだけで遊ぶなら<b>鍵付き</b>にします",
        "間違えた問題・時間切れの問題は、自動で<b>復習ノート</b>に入ります",
      ])),
    start: "対戦室の設定へ",
  },
};

export function renderCourseGuideButton(course: Course): string {
  return `<button class="course-guide-open" data-course-guide="${course}"><span class="course-guide-icon">${icon("help")}</span><span><strong>使い方はこちら</strong><small>${course === "matchmaking" || course === "ai" || course === "room" ? "このモードの遊び方を図解で説明します" : "このコーナーの使い方を図解で説明します"}</small></span>${icon("arrow")}</button>`;
}

let dialog: HTMLDialogElement | null = null;
export function openCourseGuide(course: Course): void {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "course-guide-dialog";
    dialog.setAttribute("aria-labelledby", "course-guide-title");
    // 背景（ダイアログの外側）を押しても閉じる。
    dialog.addEventListener("click", (e) => { if (e.target === dialog || (e.target as HTMLElement).closest("[data-course-guide-close]")) dialog?.close(); });
    document.body.append(dialog);
  }
  const g = GUIDES[course];
  dialog.innerHTML = `<div class="course-guide-head"><div><p class="eyebrow">${g.eyebrow}</p><h2 id="course-guide-title">${g.title}</h2></div><button class="btn ghost" data-course-guide-close aria-label="使い方を閉じる">閉じる</button></div>
    <div class="course-guide-body"><p class="course-lead">${g.lead}</p>${g.body}<button class="btn primary course-guide-start" data-course-guide-close>${g.start}${icon("arrow")}</button></div>`;
  dialog.showModal();
  dialog.querySelector(".course-guide-body")?.scrollTo(0, 0);
}
