import { icon, readStore, writeStore } from "./ui";
import { inLineApp } from "./install";

// 初めて開いた人向けの使い方ガイド。各説明から、その画面へ直接移動できる。
const SEEN_KEY = "gb.guide-seen";
export const guideSeen = (): boolean => readStore(SEEN_KEY) === "1";
export const markGuideSeen = (): void => writeStore(SEEN_KEY, "1");

const sections = [
  { id: "start", label: "はじめに" },
  { id: "install", label: "おすすめ：ホーム画面に追加", recommended: true },
  { id: "choose", label: "モードの選び方" },
  { id: "study", label: "一人で学習" },
  { id: "battle", label: "対戦モード" },
  { id: "rules", label: "対戦のルール" },
  { id: "review", label: "復習と記録" },
  { id: "tools", label: "便利な機能" },
  { id: "faq", label: "よくある質問" },
] as { id: string; label: string; recommended?: boolean }[];

const steps = (items: string[]): string => `<ol class="guide-steps">${items.map((s) => `<li><span>${s}</span></li>`).join("")}</ol>`;
const tips = (items: string[]): string => `<ul class="guide-tips">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;
const openMode = (mode: string, label: string): string => `<button class="btn" data-mode="${mode}">${label}${icon("arrow")}</button>`;
const openPractice = (label: string, primary = false): string => `<button class="btn ${primary ? "primary" : ""}" data-act="practice">${icon("book")}${label}${icon("arrow")}</button>`;

interface ModeGuide { mode: string; icon: string; title: string; who: string; steps: string[]; tips: string[]; }
const battles: ModeGuide[] = [
  {
    mode: "matchmaking", icon: "swords", title: "マッチング対戦",
    who: "同級生と腕試し。同じ人数を選んだ人どうしで自動的に組み合わせます。",
    steps: [
      "名前を入力し、人数を「ソロ（二人で対戦）・三人対戦・四人対戦」から選ぶ",
      "「対戦相手を探す」を押して待つ",
      "人数がそろったら全員が「<b>準備完了</b>」を押す → 自動で開始",
      "1問20秒。全員が答えると正解と解説が3秒出て、次の問題へ",
      "試合後はまず全問の解説を振り返り、「結果発表を見る」で順位を確認",
    ],
    tips: [
      "相手が見つかるまで時間がかかることがあります。同級生と時間を合わせると早く始まります",
      "一人のまま15秒たつと「AIと対戦する」を選べます。相手が来たら音と振動でお知らせします",
      "終了後の「<b>同じメンバーで再戦</b>」で、同じ相手ともう一度遊べます",
    ],
  },
  {
    mode: "ai", icon: "bot", title: "AI対戦",
    who: "相手がいないときの練習相手。いつでもすぐ始められます。",
    steps: [
      "名前・難易度（ビギナー・スタンダード・エキスパート）・1問の制限時間を選ぶ",
      "「AIと対戦する」で開始",
      "早押しで、AIより先に正解すると1点。先に5問正解した方の勝ち",
    ],
    tips: [
      "間違えるとその問題は答え直せません（お手つき）。AIが間違えたときは、まだ答えられます",
      "AIも問題文を読んでから答えます。難易度が上がるほど、読むのが速く正確になります",
    ],
  },
  {
    mode: "room", icon: "room", title: "対戦室作成",
    who: "決まった友だちと遊ぶとき。出題する分野をしぼった対戦もできます。",
    steps: [
      "名前・出題する分野・定員・1問の制限時間を選び「対戦室を作成する」",
      "4桁の部屋番号を伝えるか、「LINEで誘う」「招待リンクをコピー」で誘う",
      "全員が「準備完了」を押したら、部屋を作った人が「開始」を押す",
    ],
    tips: [
      "参加する側は、同じ画面の「公開ルーム」一覧から選ぶか、部屋番号を入力します",
      "「鍵付きルーム」にすると一覧に出ず、招待リンクを持つ人だけが入れます",
      "フレンドには、待機中にフレンド画面から招待を送れます",
    ],
  },
];

export function renderGuide(): string {
  return `<header class="hero small guide-hero"><p class="eyebrow">HOW TO USE</p><h1>使い方ガイド</h1><p class="lead">はじめての人向けに、このアプリでできることと使い方をまとめました。気になる項目から読めます。</p></header>
  <nav class="guide-toc" aria-label="ガイドの目次">${sections.map((s) => `<button class="guide-chip${s.recommended ? " recommended" : ""}" data-guide-jump="guide-${s.id}">${s.recommended ? icon("check") : ""}${s.label}</button>`).join("")}</nav>

  <section id="guide-start" class="panel guide-section"><p class="eyebrow">STEP BY STEP</p><h2 tabindex="-1">はじめに：3ステップで始める</h2>
    <div class="guide-quick">
      <div><b>1</b><strong>モードを選ぶ</strong><p>ホームの4つのカードから選びます。迷ったら「一人で学習」から。</p></div>
      <div><b>2</b><strong>設定して始める</strong><p>ログインや登録は不要です。対戦では表示する名前（12文字まで）を入れます。一人で学習では名前は任意です。</p></div>
      <div><b>3</b><strong>解いて、解説を読む</strong><p>答えるたびに正解と解説が出ます。間違えた問題は自動で復習ノートに入ります。</p></div>
    </div>
    <p class="guide-note">${icon("check")}<span>記録は<b>このブラウザ</b>に保存されます。別の端末・別のブラウザには引き継がれないので、いつも同じ場所から開くのがおすすめです。<b>LINEから開いた方は、始める前に次の「ホーム画面に追加」を済ませておきましょう。</b></span></p>
  </section>

  <section id="guide-install" class="panel guide-section guide-install"><p class="eyebrow">RECOMMENDED · まず最初に</p><h2 tabindex="-1">おすすめ：ホーム画面に追加する</h2>
    <p class="guide-intro">LINEのリンクから開いた画面（LINEの中のブラウザ）は、記録がふだんのブラウザと分かれてしまい、通信が不安定になることもあります。<b>Safari・Chromeで開き直して、ホーム画面に追加</b>しておくと、次からアイコンをタップするだけで開け、記録もひとつにまとまります。最初に1回だけ、約1分です。</p>
    ${inLineApp ? `<p class="guide-alert">${icon("globe")}<span><b>いまはLINEの中で開いています。</b>下の「ブラウザで開き直す」を押すと、Safari（AndroidはChrome）で開き直せます。</span></p>` : ""}
    <div class="guide-quick">
      <div><b>1</b><strong>ブラウザで開き直す</strong><p>LINEの画面右上の「︙」から「Safariで開く」（Androidは「ブラウザで開く」）を選びます。</p></div>
      <div><b>2</b><strong>ホーム画面に追加</strong><p>iPhoneは「…」→「共有」、iPadは右上の共有ボタン、AndroidはChromeの「︙」から「ホーム画面に追加」を選びます。</p></div>
      <div><b>3</b><strong>アイコンから開く</strong><p>次からはLINEのリンクではなく、ホーム画面の「ゲノム対戦」のアイコンから開きます。</p></div>
    </div>
    <p class="guide-note">${icon("bookmark")}<span>LINEの中で解いた記録（学習成績・復習ノート）は、ブラウザを変えると引き継がれません。早めに切り替えるほど安心です。</span></p>
    <div class="guide-actions">${inLineApp ? `<button class="btn primary" data-act="install-browser">${icon("globe")}ブラウザで開き直す</button>` : ""}<button class="btn ${inLineApp ? "" : "primary"}" data-act="install">${icon("help")}iPhone・iPad・Androidの手順を図で見る${icon("arrow")}</button></div>
  </section>

  <section id="guide-choose" class="panel guide-section"><p class="eyebrow">WHICH MODE?</p><h2 tabindex="-1">どのモードを選べばいい？</h2>
    <ul class="guide-choose">
      <li><span>試験勉強をしたい・苦手な分野を集中して解きたい</span>${openMode("study", "一人で学習")}</li>
      <li><span>同級生と勝負したい</span>${openMode("matchmaking", "マッチング対戦")}</li>
      <li><span>一人で対戦の練習をしたい</span>${openMode("ai", "AI対戦")}</li>
      <li><span>決まった友だちと遊びたい・分野をしぼって対戦したい</span>${openMode("room", "対戦室作成")}</li>
    </ul>
  </section>

  <section id="guide-study" class="panel guide-section guide-study mode-study"><p class="eyebrow">SOLO STUDY</p><h2 tabindex="-1">一人で学習：問題演習コーナ</h2>
    <p class="guide-intro">時間制限なしで、解説を読みながら自分のペースで進めるモードです。ホームで「一人で学習」を選び、<b>問題演習コーナ</b>を押すと演習の設定ページに移ります。</p>
    ${steps([
      "<b>学習する分野</b>を選ぶ。いくつでも組み合わせられます（「すべて選択」「選択を解除」も使えます）",
      "<b>問題数</b>と<b>出題配分</b>を選ぶ",
      "「<b>未着手の問題を優先的に演習</b>」か「<b>ランダム演習</b>」を押して開始",
      "選択肢を選ぶと正解と解説が出ます。読んだら「次の問題へ」",
    ])}
    <div class="guide-compare">
      <div><h3>${icon("target")}出題順の選び方</h3><dl><div><dt>未着手の問題を優先</dt><dd>まだ解答も回答の確認もしていない問題から出します。足りない分は演習済みの問題で補います。初めての範囲を一通り解くのに向いています。</dd></div><div><dt>ランダム演習</dt><dd>解いたかどうかに関係なく、選んだ分野から重複なく出します。仕上げの確認に。</dd></div></dl></div>
      <div><h3>${icon("book")}出題配分の選び方<small>（2つ以上の分野を選んだとき）</small></h3><dl><div><dt>過去問の配分で出題</dt><dd>過去問100問の構成をもとに選びます。問題の多い分野ほど出やすく、本番に近い出方になります。</dd></div><div><dt>分野を均等に出題</dt><dd>選んだ分野からできるだけ同じ数ずつ出します。問題が少ない分野の分は、ほかの分野から補います。</dd></div></dl></div>
    </div>
    <h3 class="guide-subhead">解いている途中でできること</h3>
    <dl class="guide-defs">
      <div><dt>${icon("help")}わからないので回答を見る</dt><dd>答えずに正解と解説を確認できます。正解数には数えず、復習ノートの「誤答・わからない」に入ります。</dd></div>
      <div><dt>${icon("clock")}後で解く</dt><dd>その問題を最後に回します。残りを解いた後に戻ってきます。後回しにした問題は未着手のままです。</dd></div>
      <div><dt>${icon("bookmark")}中断して保存</dt><dd>途中でやめても、ホームの「保存した学習の続き」から同じところに戻れます。</dd></div>
      <div><dt>${icon("check")}正解したけど迷った</dt><dd>正解した後の解説で押すと「迷った問題」に記録され、後で解き直せます。</dd></div>
      <div><dt>${icon("target")}みんなの正答率</dt><dd>解説と一緒に、初めて解いた人のうち何%が正解したかと難しさ（基本・標準・やや難・難問）が出ます。みんなが正解している基本問題を落としたら、優先して復習しましょう。</dd></div>
    </dl>
    <p class="guide-note">${icon("book")}<span>「一人で学習」の画面にある<b>過去問・問題と解説</b>では、全100問の問題文を5問ずつのページで読めます。分野で絞り込め、問題を押すと正解と解説が開きます。</span></p>
    <div class="guide-actions">${openPractice("問題演習コーナを開く", true)}<button class="btn" data-act="catalog">過去問・問題と解説を見る${icon("arrow")}</button></div>
  </section>

  <section id="guide-battle" class="guide-section"><div class="guide-section-head"><p class="eyebrow">BATTLE MODES</p><h2 tabindex="-1">対戦モードの使い方</h2></div>
    <div class="guide-modes">${battles.map((m) => `<article class="panel guide-mode mode-${m.mode}"><header><span class="mode-icon">${icon(m.icon)}</span><div><h3>${m.title}</h3><p>${m.who}</p></div></header>${steps(m.steps)}${tips(m.tips)}${openMode(m.mode, "このモードを開く")}</article>`).join("")}</div>
  </section>

  <section id="guide-rules" class="panel guide-section"><p class="eyebrow">RULES</p><h2 tabindex="-1">対戦のルール</h2>
    <ul class="guide-list">
      <li><b>先に5問正解した人の勝ち。</b>最大15問で、問題がなくなったときは得点の多い人の勝ち（同点は引き分け）。</li>
      <li><b>同級生との対戦</b>（マッチング・対戦室）は全員が1回ずつ答え、正解した人<b>全員</b>に1点。答えている間は、ほかの人が正解したかは見えません。</li>
      <li><b>AI対戦</b>は早押し。AIより先に正解すると1点です。</li>
      <li>選択肢の並びは問題ごとに入れ替わります。番号ではなく内容で覚えましょう。</li>
      <li>結果発表は下位から順に表示します。画面をタップするとすぐ最後まで表示できます。</li>
    </ul>
  </section>

  <section id="guide-review" class="panel guide-section"><p class="eyebrow">REVIEW</p><h2 tabindex="-1">復習と記録</h2>
    <dl class="guide-defs">
      <div><dt>${icon("bookmark")}復習ノート</dt><dd>ホームの「復習ノート」から開きます。「誤答・わからない」「迷った問題」「保存した問題」の3つのタブがあり、「この○問を演習する」でまとめて解き直せます。</dd></div>
      <div><dt>${icon("target")}終わった後の復習コース</dt><dd>学習や対戦の後の振り返りで、間違えた・わからなかった・迷った問題だけをまとめてすぐ解き直せます。</dd></div>
      <div><dt>${icon("check")}問題の保存</dt><dd>振り返り画面の「この問題を保存」で、覚えておきたい問題を「保存した問題」に残せます。</dd></div>
      <div><dt>${icon("clock")}保存した学習の続き</dt><dd>「中断して保存」した学習は、ホーム上部の「保存した学習の続き」を開き、「続きから再開」で戻れます。</dd></div>
      <div><dt>${icon("dna")}学習レベルと試験準備度</dt><dd>一人で学習・復習コースで解くとXP（経験値）がたまり、レベルが上がります。正解10・不正解3・回答を見た1XP。初めての正解や、間違えた問題を克服した正解にはボーナスがあります。同じ日に同じ問題を解き直した分は半分です。XPが減ることはありません。</dd></div>
      <div><dt>${icon("target")}習得・定着と分野の★</dt><dd>直近2回続けて正解した問題が「習得」、3回続けて正解すると「定着」。間違えたり回答を見たりすると、また1回目から数え直します。習得以上の問題数が「試験準備度」です。「迷った」に記録中の問題は数えません。分野ごとに、全問に取り組むと★1、全問習得で★2、全問定着で★3。問題演習コーナの分野カードにも表示されるので、★の少ない分野から選ぶのがおすすめです。</dd></div>
      <div><dt>${icon("trophy")}学習成績・対戦成績</dt><dd>ホームの下のほうに、取り組んだ問題数・正答率と、AI・対人ごとの勝敗が表示されます。</dd></div>
    </dl>
  </section>

  <section id="guide-tools" class="panel guide-section"><p class="eyebrow">TOOLS</p><h2 tabindex="-1">便利な機能</h2>
    <dl class="guide-defs">
      <div><dt>文字サイズ</dt><dd>画面上部の「標準・大・特大」で、問題文・選択肢・解説の文字を大きくできます。</dd></div>
      <div><dt>${icon("sun")}ライト／ダーク</dt><dd>はじめは明るい画面です。画面右上の「ダーク」で暗い画面になり、「ライト」でいつでも戻せます。</dd></div>
      <div><dt>${icon("zoom")}図の拡大</dt><dd>図のある問題は、図をタップすると拡大表示できます。＋／−で拡大し、指で動かせます。対戦中は拡大している間も時間が進みます。</dd></div>
      <div><dt>${icon("user")}フレンド</dt><dd>画面上部の「フレンド」で、10文字のフレンドコードを交換して申請・承認します。フレンドは対戦室に招待できます。</dd></div>
      <div><dt>${icon("globe")}通信状態・オンライン人数</dt><dd>画面上部に、いまアプリを開いている人数と通信状態が出ます。「通信エラー」と出たら「再接続」を押してください。</dd></div>
      <div><dt>${icon("help")}このガイド</dt><dd>画面上部の「使い方」から、いつでも開き直せます（対戦・学習の途中は表示されません）。</dd></div>
    </dl>
  </section>

  <section id="guide-faq" class="panel guide-section"><p class="eyebrow">FAQ</p><h2 tabindex="-1">よくある質問</h2>
    <div class="guide-faq">
      <details><summary>苦手な分野だけを解きたい</summary><p>問題演習コーナの「学習する分野」で、解きたい分野だけにチェックを入れてください。いくつでも組み合わせられ、選んだ分野はこの端末に保存されるので、次回も同じ選択から始められます。</p></details>
      <details><summary>「出題配分」が選べません</summary><p>出題配分は、2つ以上の分野を選んだときに選べます。1つの分野だけのときは、その分野の問題だけを出題します。</p></details>
      <details><summary>間違えた問題だけを解き直したい</summary><p>ホームの「復習ノート」の「誤答・わからない」タブで「この○問を演習する」を押してください。学習や対戦の直後なら、振り返り画面の復習コースからも解き直せます。</p></details>
      <details><summary>対戦が始まりません</summary><p>全員が「準備完了」を押すと始まります。マッチング対戦は、選んだ人数がそろうまで待ちます。対戦室は、部屋を作った人が「開始」を押します。</p></details>
      <details><summary>記録や復習ノートが消えました</summary><p>記録はブラウザごとに保存されます。別のブラウザ（LINE内のブラウザとSafariなど）で開いたり、ブラウザの履歴・データを削除したりすると、別の人として扱われます。</p></details>
      <details><summary>通信が切れました</summary><p>画面上部の「再接続」を押すか、ページを再読み込みしてください。同じタブで再読み込みすれば、進行中の対戦や学習に戻れます。タブを閉じてしまった場合、学習は「中断して保存」したものだけホームから再開できます。</p></details>
      <details><summary>選択肢の番号が前と違います</summary><p>選択肢は問題ごとに並べ替えています。番号ではなく内容で答えを覚えましょう。</p></details>
      <details><summary>ホーム画面にアプリを置きたい・LINEから開いている</summary><p>ブラウザの共有メニューから「ホーム画面に追加」を選ぶと、アプリのように開けます。LINEから開いている場合は、先にSafari・Chromeなどで開き直してください。iPhone・iPad・Androidごとの手順を図で説明しています。</p><button class="btn" data-act="install">ホーム画面に追加する方法を見る${icon("arrow")}</button></details>
    </div>
  </section>

  <div class="panel guide-end"><p>準備ができたら、さっそく始めましょう。</p><div>${openPractice("問題演習コーナから始める", true)}<button class="btn ghost" data-act="leave">ホームへ戻る</button></div></div>`;
}

// 初めて開いた人にだけ、ホームの上部に出す案内。
export function renderGuideWelcome(): string {
  if (guideSeen()) return "";
  return `<section class="guide-welcome" aria-labelledby="guide-welcome-title"><span class="mode-icon">${icon("help")}</span><div><p class="eyebrow">WELCOME</p><h2 id="guide-welcome-title">はじめての方へ</h2><p>登録なしで、モードを選ぶだけで始められます。迷ったら、まず使い方ガイドを1分だけ見てみてください。</p></div><div class="guide-welcome-actions"><button class="btn primary" data-act="guide">${icon("help")}使い方ガイドを見る</button><button class="btn ghost" data-act="guide-dismiss">閉じる</button></div></section>`;
}
