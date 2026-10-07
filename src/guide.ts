import { icon, readStore, writeStore } from "./ui";

// 初めて開いた人向けの使い方ガイド。各モードの説明から、そのモードの設定画面へ直接移動できる。
const SEEN_KEY = "gb.guide-seen";
export const guideSeen = (): boolean => readStore(SEEN_KEY) === "1";
export const markGuideSeen = (): void => writeStore(SEEN_KEY, "1");

const sections = [
  { id: "start", label: "はじめに" },
  { id: "choose", label: "モードの選び方" },
  { id: "modes", label: "各モードの使い方" },
  { id: "rules", label: "対戦のルール" },
  { id: "review", label: "復習と記録" },
  { id: "tools", label: "便利な機能" },
  { id: "faq", label: "よくある質問" },
] as const;

const steps = (items: string[]): string => `<ol class="guide-steps">${items.map((s) => `<li><span>${s}</span></li>`).join("")}</ol>`;
const openMode = (mode: string, label: string): string => `<button class="btn" data-mode="${mode}">${label}${icon("arrow")}</button>`;

interface ModeGuide { mode: string; icon: string; title: string; who: string; steps: string[]; tips: string[]; }
const modes: ModeGuide[] = [
  {
    mode: "study", icon: "book", title: "一人で学習",
    who: "まずはここから。時間制限なしで、解説を読みながら自分のペースで進めます。",
    steps: [
      "ホームで「一人で学習」を選び、<b>問題演習コーナ</b>を開く",
      "分野・問題数・出題配分を選ぶ（分野は「すべての分野」も可）",
      "「未着手の問題を優先的に演習」か「ランダム演習」を押して開始",
      "選択肢を選ぶと正解と解説が出る。読んだら「次の問題へ」",
    ],
    tips: [
      "わからない問題は「<b>わからないので回答を見る</b>」で正解と解説を確認できます（正解数には数えず、復習ノートに入ります）",
      "「<b>後で解く</b>」で問題を最後に回せます",
      "途中でやめるときは「<b>中断して保存</b>」。ホームの「保存した学習の続き」から再開できます",
      "「過去問・問題と解説」では全問の問題文を5問ずつのページで読め、問題を押すと正解と解説が開きます",
    ],
  },
  {
    mode: "matchmaking", icon: "swords", title: "マッチング対戦",
    who: "同級生と腕試し。同じ人数を選んだ人どうしで自動的に組み合わせます。",
    steps: [
      "名前を入力し、人数を「ソロ（二人で対戦）・三人対戦・四人対戦」から選ぶ",
      "「対戦相手を探す」を押して待つ",
      "人数がそろったら全員が「<b>準備完了</b>」を押す → 自動で開始",
      "1問20秒。全員が答えると正解と解説が3秒表示され、次の問題へ",
      "試合後はまず全問の振り返り → 「結果発表を見る」で順位を確認",
    ],
    tips: [
      "相手が見つかるまで時間がかかることがあります。同級生と時間を合わせると早く始まります",
      "終了後の「同じメンバーで再戦」で、同じ相手ともう一度遊べます",
    ],
  },
  {
    mode: "ai", icon: "bot", title: "AI対戦",
    who: "相手がいないときの練習相手。いつでもすぐ始められます。",
    steps: [
      "名前と難易度（ビギナー・スタンダード・エキスパート）、1問の制限時間を選ぶ",
      "「AIと対戦する」で開始",
      "AIより先に正解すると1点。先に5問正解した方の勝ち",
    ],
    tips: ["難易度が上がるほど、AIの回答が速く正確になります"],
  },
  {
    mode: "room", icon: "room", title: "対戦室作成",
    who: "友だちを誘って遊ぶとき。分野をしぼった対戦もできます。",
    steps: [
      "名前・出題する分野・定員・1問の制限時間を選び「対戦室を作成する」",
      "表示された4桁の部屋番号を伝えるか、「LINEで誘う」「招待リンクをコピー」で誘う",
      "全員が「準備完了」を押したら、部屋を作った人が「開始」を押す",
    ],
    tips: [
      "参加する側は、同じ画面の「公開ルーム」一覧から選ぶか、部屋番号を入力します",
      "「鍵付きルーム」にすると一覧に出ず、招待リンクを持つ人だけが入れます",
      "フレンドになっている相手には、待機中にフレンド画面から招待を送れます",
    ],
  },
];

export function renderGuide(): string {
  return `<header class="hero small guide-hero"><p class="eyebrow">HOW TO USE</p><h1>使い方ガイド</h1><p class="lead">はじめての人向けに、このアプリでできることと使い方をまとめました。</p></header>
  <nav class="guide-toc" aria-label="ガイドの目次">${sections.map((s) => `<button class="guide-chip" data-guide-jump="guide-${s.id}">${s.label}</button>`).join("")}</nav>

  <section id="guide-start" class="panel guide-section"><p class="eyebrow">STEP BY STEP</p><h2 tabindex="-1">はじめに：3ステップで始める</h2>
    <div class="guide-quick">
      <div><b>1</b><strong>名前を入れる</strong><p>ログインや登録は不要です。対戦で表示する名前（12文字まで）を入れるだけ。</p></div>
      <div><b>2</b><strong>モードを選ぶ</strong><p>ホームの4つのカードから選びます。迷ったら「一人で学習」から。</p></div>
      <div><b>3</b><strong>解いて、解説を読む</strong><p>解答ごとに正解と解説が出ます。間違えた問題は自動で復習ノートへ。</p></div>
    </div>
    <p class="guide-note">${icon("check")}<span>記録は<b>このブラウザ</b>に結びついています。別の端末・別のブラウザでは引き継がれないので、いつも同じブラウザで開くのがおすすめです。LINEから開いたときは、外部ブラウザで開くと安定します。</span></p>
  </section>

  <section id="guide-choose" class="panel guide-section"><p class="eyebrow">WHICH MODE?</p><h2 tabindex="-1">どのモードを選べばいい？</h2>
    <ul class="guide-choose">
      <li><span>じっくり理解したい・試験勉強をしたい</span>${openMode("study", "一人で学習")}</li>
      <li><span>同級生と勝負したい</span>${openMode("matchmaking", "マッチング対戦")}</li>
      <li><span>一人で対戦の練習をしたい</span>${openMode("ai", "AI対戦")}</li>
      <li><span>決まった友だちと遊びたい・分野をしぼりたい</span>${openMode("room", "対戦室作成")}</li>
    </ul>
  </section>

  <section id="guide-modes" class="guide-section"><div class="guide-section-head"><p class="eyebrow">MODES</p><h2 tabindex="-1">各モードの使い方</h2></div>
    <div class="guide-modes">${modes.map((m) => `<article class="panel guide-mode mode-${m.mode}"><header><span class="mode-icon">${icon(m.icon)}</span><div><h3>${m.title}</h3><p>${m.who}</p></div></header>${steps(m.steps)}<ul class="guide-tips">${m.tips.map((t) => `<li>${t}</li>`).join("")}</ul>${openMode(m.mode, "このモードを開く")}</article>`).join("")}</div>
  </section>

  <section id="guide-rules" class="panel guide-section"><p class="eyebrow">RULES</p><h2 tabindex="-1">対戦のルール</h2>
    <ul class="guide-list">
      <li><b>先に5問正解した人の勝ち。</b>最大15問で、問題がなくなったときは得点の多い人の勝ち（同点は引き分け）。</li>
      <li><b>同級生との対戦</b>（マッチング・対戦室）は全員が1回ずつ答え、正解した人<b>全員</b>に1点。答えている間は、他の人が正解したかは見えません。</li>
      <li><b>AI対戦</b>は早押し。AIより先に正解すると1点です。</li>
      <li>選択肢の並びは問題ごとに入れ替わります。番号ではなく内容で覚えましょう。</li>
      <li>試合の後は全問の解説を振り返れます。間違えた問題や迷った問題は「復習コース」でそのまま解き直せます。</li>
    </ul>
  </section>

  <section id="guide-review" class="panel guide-section"><p class="eyebrow">REVIEW</p><h2 tabindex="-1">復習と記録</h2>
    <dl class="guide-defs">
      <div><dt>${icon("bookmark")}復習ノート</dt><dd>ホームの「復習ノート」から開きます。「誤答・わからない」「迷った問題」「保存した問題」の3つのタブがあり、「この○問を演習する」でまとめて解き直せます。</dd></div>
      <div><dt>${icon("check")}正解したけど迷った</dt><dd>正解した後の解説や振り返りで押すと、「迷った問題」に記録されます。まぐれ当たりを残さないために使いましょう。</dd></div>
      <div><dt>${icon("target")}学習成績・対戦成績</dt><dd>ホームの下のほうに、取り組んだ問題数・正答率と、AI・対人ごとの勝敗が表示されます。</dd></div>
      <div><dt>${icon("clock")}保存した学習の続き</dt><dd>「中断して保存」した学習は、ホームの一番上から続きを再開できます。</dd></div>
    </dl>
  </section>

  <section id="guide-tools" class="panel guide-section"><p class="eyebrow">TOOLS</p><h2 tabindex="-1">便利な機能</h2>
    <dl class="guide-defs">
      <div><dt>文字サイズ</dt><dd>画面上部の「標準・大・特大」で、問題文・選択肢・解説の文字を大きくできます。</dd></div>
      <div><dt>${icon("sun")}ライト／ダーク</dt><dd>はじめは明るい画面です。画面右上の「ダーク」を押すと暗い画面になり、「ライト」でいつでも戻せます。</dd></div>
      <div><dt>${icon("zoom")}図の拡大</dt><dd>図のある問題は、図をタップすると拡大表示できます。対戦中は拡大している間も時間が進みます。</dd></div>
      <div><dt>${icon("user")}フレンド</dt><dd>画面上部の「フレンド」で、10文字のフレンドコードを交換して申請・承認します。フレンドは対戦室に招待できます。</dd></div>
      <div><dt>${icon("globe")}通信状態・オンライン人数</dt><dd>画面上部に、いまアプリを開いている人数と通信状態が出ます。「通信エラー」と出たら「再接続」を押してください。</dd></div>
    </dl>
  </section>

  <section id="guide-faq" class="panel guide-section"><p class="eyebrow">FAQ</p><h2 tabindex="-1">よくある質問</h2>
    <div class="guide-faq">
      <details><summary>対戦が始まりません</summary><p>全員が「準備完了」を押すと始まります。マッチング対戦は、選んだ人数がそろうまで待ちます。対戦室は、部屋を作った人が「開始」を押します。</p></details>
      <details><summary>記録や復習ノートが消えました</summary><p>記録はブラウザごとに保存されます。別のブラウザ（LINE内のブラウザとSafariなど）で開いたり、ブラウザの履歴・データを削除したりすると、別の人として扱われます。</p></details>
      <details><summary>対戦中に通信が切れました</summary><p>画面上部の「再接続」を押すか、ページを再読み込みしてください。同じタブで再読み込みすれば、進行中の対戦や学習に戻れます。タブを閉じてしまった場合は、学習なら「中断して保存」したものだけホームから再開できます。</p></details>
      <details><summary>選択肢の番号が前と違います</summary><p>選択肢は問題ごとに並べ替えています。番号ではなく内容で答えを覚えましょう。</p></details>
      <details><summary>ホーム画面にアプリを置きたい</summary><p>ブラウザの共有メニューから「ホーム画面に追加」を選ぶと、アプリのように開けます。</p></details>
    </div>
  </section>

  <div class="panel guide-end"><p>準備ができたら、さっそく始めましょう。</p><div>${openMode("study", "一人で学習から始める")}<button class="btn ghost" data-act="leave">ホームへ戻る</button></div></div>`;
}

// 初めて開いた人にだけ、ホームの上部に出す案内。
export function renderGuideWelcome(): string {
  if (guideSeen()) return "";
  return `<section class="guide-welcome" aria-labelledby="guide-welcome-title"><span class="mode-icon">${icon("help")}</span><div><p class="eyebrow">WELCOME</p><h2 id="guide-welcome-title">はじめての方へ</h2><p>名前を入れてモードを選ぶだけで始められます。迷ったら、まず使い方ガイドを1分だけ見てみてください。</p></div><div class="guide-welcome-actions"><button class="btn primary" data-act="guide">${icon("help")}使い方ガイドを見る</button><button class="btn ghost" data-act="guide-dismiss">閉じる</button></div></section>`;
}
