import "./style.css";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { call, listen, serverNow, supabase, type MatchState, type Player, type ReviewItem } from "./api";

import { esc, richText, readStore, writeStore, icon, helix, progress, type Question } from "./ui";
import { SoloController, difficultyName, type Difficulty, type SoloMode } from "./solo";

const BASE = import.meta.env.BASE_URL;
const PHASE_SECONDS = { countdown: 3, reveal: 7, waiting: 10 } as const;
const ERRORS: Record<string, string> = {
  NAME_REQUIRED: "名前を入力してください",
  ROOM_NOT_FOUND: "その合言葉の部屋は見つかりません（開始済みか、締め切られています）",
  ROOM_FULL: "その部屋は満員です",
  BAD_SETTINGS: "制限時間は5〜120秒、人数は2〜8人で指定してください",
  NEED_PLAYERS: "対戦を始めるには2人以上の参加が必要です",
  ROOM_ONLY: "この操作は合言葉の対戦室でのみ使えます",
  HOST_ONLY: "開始できるのは部屋を作った人だけです",
  NOT_IN_MATCH: "この対戦には参加していません",
  BAD_SOLO_SETTINGS: "問題と設定を選び直してください",
  SOLO_NOT_FOUND: "この学習セッションは見つかりません。もう一度開始してください",
};

const app = document.querySelector<HTMLElement>("#app")!;

const deviceId = readStore("gb.device") ?? crypto.randomUUID();
writeStore("gb.device", deviceId);

let playerName = readStore("gb.name") ?? "";
// null は「おまかせ」（2人以上そろって10秒後、8人で即開始）
let capacity: number | null = Number(readStore("gb.capacity")) || null;
let answerSeconds = Number(readStore("gb.seconds")) || 20;
let roomCodeDraft = new URLSearchParams(location.search).get("room") ?? "";
const questions = new Map<string, Question>();
let match: MatchState | null = null;
let mySeat: number | null = null;
let channel: RealtimeChannel | null = null;
let live = false;
let view: "home" | "setup" | "match" | "review" = roomCodeDraft ? "setup" : "home";
type Mode = "matchmaking" | "study" | "ai" | "room";
let selectedMode: Mode = roomCodeDraft ? "room" : "matchmaking";
let studyField = "";
let studyCount = 10;
let difficulty: Difficulty = "normal";
let battleGeneration = 0;
let review: ReviewItem[] = [];
let myChoices = new Map<number, number>();
let sending = false;
let busy = false;
let error = "";
let ticking = false;
let lastTickAt = 0;
let tickJitter = 0;

const solo = new SoloController(deviceId, questions, render, () => playerName);
const modeInfo = {
  matchmaking: {title:"マッチング対戦",sub:"MATCHMAKING",icon:"swords",description:"全国の学習者と、知識で競う。",label:"対戦相手を探す"},
  study: {title:"一人で学習",sub:"SOLO STUDY",icon:"book",description:"焦らず、着実に。理解を深める時間。",label:"学習をはじめる"},
  ai: {title:"AI対戦",sub:"AI BATTLE",icon:"bot",description:"いつでも挑戦できる、あなたの練習相手。",label:"AIと対戦する"},
  room: {title:"対戦室作成",sub:"PRIVATE ROOM",icon:"room",description:"仲間を誘って、同じ問題に挑もう。",label:"対戦室を作成する"},
} as const;

const errorText = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  const code = Object.keys(ERRORS).find((k) => msg.includes(k));
  return code ? ERRORS[code] : "通信できませんでした。電波の良い場所でもう一度お試しください。";
};

// ---------- 対戦の状態 ----------

function applyState(s: MatchState | null): void {
  if (!s) return;
  if (match && s.id === match.id && s.version < match.version) return; // 古い配信は捨てる
  if (s.my_seat !== undefined) mySeat = s.my_seat;
  if (!match || match.id !== s.id || match.phase !== s.phase || match.q_index !== s.q_index) {
    tickJitter = Math.random() * 400; // 全員が同時に tick しないよう少しずらす
    error = "";
  }
  match = s;
  if (s.status === "finished") writeStore("gb.match", null, sessionStorage);
  render();
}

function subscribe(matchId: string): void {
  if (channel) void supabase.removeChannel(channel);
  live = false;
  channel = listen(matchId, (s) => { if (match?.id === matchId) applyState(s); }, (ok) => { if (match?.id === matchId) live = ok; });
}

async function enter(fn: "find_match" | "create_room" | "join_room"): Promise<void> {
  if (busy) return;
  const generation = ++battleGeneration;
  const nameInput = document.querySelector<HTMLInputElement>("#name");
  playerName = (nameInput?.value ?? playerName).trim().slice(0, 12);
  if (!playerName) {
    error = ERRORS.NAME_REQUIRED;
    render();
    return;
  }
  writeStore("gb.name", playerName);
  const capacityInput = document.querySelector<HTMLSelectElement>("#capacity");
  const secondsInput = document.querySelector<HTMLInputElement>("#seconds");
  if (fn !== "join_room" && capacityInput && secondsInput) {
    capacity = Number(capacityInput.value) || null;
    answerSeconds = Number(secondsInput.value);
    if (!Number.isInteger(answerSeconds) || answerSeconds < 5 || answerSeconds > 120) {
      error = ERRORS.BAD_SETTINGS;
      render();
      return;
    }
    writeStore("gb.capacity", capacity === null ? null : String(capacity));
    writeStore("gb.seconds", String(answerSeconds));
  }
  const args: Record<string, unknown> = { p_device: deviceId, p_name: playerName };
  if (fn !== "join_room") {
    args.p_capacity = capacity;
    args.p_seconds = answerSeconds;
  } else {
    roomCodeDraft = (document.querySelector<HTMLInputElement>("#code")?.value ?? "").trim();
    if (!/^\d{4}$/.test(roomCodeDraft)) {
      error = "合言葉は4桁の数字です";
      render();
      return;
    }
    args.p_code = roomCodeDraft;
  }
  busy = true;
  error = "";
  render();
  try {
    const s = await call(fn, args);
    if (generation !== battleGeneration) return;
    solo.stop();
    match = s;
    myChoices = new Map();
    review = [];
    subscribe(s.id);
    writeStore("gb.match", s.id, sessionStorage);
    view = "match";
    applyState(s);
  } catch (e) {
    error = errorText(e);
  } finally {
    busy = false;
    render();
  }
}

async function leave(): Promise<void> {
  battleGeneration++;
  solo.stop();
  error = "";
  if (match?.status === "waiting") void call("leave_match", { p_match: match.id, p_device: deviceId }).catch(() => {});
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  match = null;
  mySeat = null;
  view = "home";
  writeStore("gb.match", null, sessionStorage);
  render();
  window.scrollTo(0, 0);
}

async function tick(): Promise<void> {
  if (!match || ticking) return;
  const matchId = match.id;
  ticking = true;
  lastTickAt = Date.now();
  try {
    const s = await call("tick", { p_match: matchId, p_device: deviceId });
    if (match?.id === matchId) applyState(s);
  } catch {
    // 次のループで再試行する
  } finally {
    ticking = false;
  }
}

async function answer(choice: number): Promise<void> {
  if (!match || sending || match.phase !== "question" || myMark() !== null) return;
  const matchId = match.id;
  const qIndex = match.q_index;
  sending = true;
  myChoices.set(match.q_index, choice);
  render();
  try {
    const s = await call("submit_answer", { p_match: matchId, p_device: deviceId, p_q_index: qIndex, p_choice: choice });
    if (match?.id === matchId) applyState(s);
  } catch (e) {
    error = errorText(e);
  } finally {
    sending = false;
    render();
  }
}

async function startRoom(): Promise<void> {
  if (!match || busy) return;
  busy = true;
  render();
  try {
    applyState(await call("start_room", { p_match: match.id, p_device: deviceId }));
  } catch (e) {
    error = errorText(e);
    render();
  } finally {
    busy = false;
    render();
  }
}

async function openReview(): Promise<void> {
  if (!match || busy) return;
  busy = true;
  render();
  try {
    review = await call<ReviewItem[]>("get_review", { p_match: match.id, p_device: deviceId });
    view = "review";
    window.scrollTo(0, 0);
  } catch (e) {
    error = errorText(e);
  } finally {
    busy = false;
    render();
  }
}

function shareRoom(): void {
  if (!match?.code) return;
  const link = `${location.origin}${BASE}?room=${match.code}&openExternalBrowser=1`;
  const text = `ゲノム対戦の部屋を作りました！\n合言葉：${match.code}\n${link}`;
  window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

// 期限切れの進行・待機中の生存通知・配信が届かないときの取り直しを1本のループで行う。
setInterval(() => {
  updateClock();
  solo.updateClock();
  if (solo.active) void solo.tick();
  if (!match || view !== "match" || match.status === "finished") return;
  const sinceTick = Date.now() - lastTickAt;
  const overdue = match.phase_ends_at !== null && serverNow() >= Date.parse(match.phase_ends_at) + tickJitter;
  const heartbeat = match.status === "waiting" && sinceTick > 2000;
  const poll = !live && sinceTick > 1500;
  if ((overdue && sinceTick > 1000) || heartbeat || poll) void tick();
}, 250);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (match && view === "match") void tick();
    if (solo.active) void solo.tick();
  }
});

// ---------- 描画 ----------

const me = (): Player | undefined => match?.players.find((p) => p.seat === mySeat);
const myMark = (): Player["mark"] => me()?.mark ?? null;
const nameOf = (seat: number | null): string => match?.players.find((p) => p.seat === seat)?.name ?? "";

function updateClock(): void {
  if (!match?.phase_ends_at) return;
  const left = Math.max(0, (Date.parse(match.phase_ends_at) - serverNow()) / 1000);
  const total = match.phase === "question" ? match.answer_seconds : PHASE_SECONDS[match.phase ?? "waiting"];
  document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => (el.textContent = String(Math.ceil(left))));
  document.querySelectorAll<HTMLElement>("[data-bar]").forEach((el) => {
    el.style.width = `${Math.min(100, (left / total) * 100)}%`;
    el.classList.toggle("low", match?.phase === "question" && left <= 5);
  });
}

function render(): void {
  const lobby = view === "home" && !solo.active;
  app.className = lobby ? "lobby" : "arena";
  let body: string;
  if (solo.active) body = solo.render();
  else if (view === "setup") body = renderSetup();
  else if (view === "review") body = renderReview();
  else if (!match || view === "home") body = renderHome();
  else if (match.status === "waiting") body = renderWaiting(match);
  else if (match.status === "playing") body = renderPlay(match);
  else body = renderResult(match);
  app.innerHTML = `${renderHeader(lobby)}<div class="${lobby ? "lobby-body" : "arena-body"}">${body}</div><footer class="site-footer"><span>${icon("dna")} GENOME BATTLE</span><span>知識をつなぐ。理解を深める。</span></footer>`;
  updateClock();
  solo.updateClock();
}

function renderHeader(lobby: boolean): string {
  return `<header class="app-header"><button class="brand" data-act="leave" aria-label="ゲノム対戦 ホーム" ${busy ? "disabled" : ""}><span class="brand-icon">${icon("dna")}</span><span>GENOME<span class="brand-light"> BATTLE</span><small>ゲノム対戦</small></span></button>${lobby ? `<span class="header-note"><i></i> ゲノム解析学 / 2025</span>` : `<button class="btn ghost back-btn" data-act="leave" ${busy ? "disabled" : ""}>${icon("back")}ホームへ</button>`}<span class="profile">${icon("user")}<span>${esc(playerName || "ゲストプレイヤー")}</span></span></header>`;
}

function renderHome(): string {
  const p = progress();
  return `<section class="lobby-hero"><div class="hero-copy"><p class="eyebrow accent-eyebrow"><span></span> KNOWLEDGE IS YOUR POWER</p><h1>その知識が、<br><em>勝利</em>に変わる。</h1><p class="hero-description">学んで、挑んで、強くなる。<br>ゲノム解析学の知識で戦う、クイズバトル。</p><div class="hero-tags"><span>${icon("book")}2025年度 過去問100問</span><span>${icon("swords")}最大8人で対戦</span></div></div><div class="dna-art">${helix()}<span class="dna-caption">DECODE. LEARN. BATTLE.</span><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span></div></section>
  <section class="mode-section"><div class="section-heading"><div><p class="eyebrow">CHOOSE YOUR MODE</p><h2>今日は、どんな挑戦を？</h2></div><span class="section-note">4つのモードで、理解をその先へ。</span></div><div class="mode-grid">${(Object.keys(modeInfo) as Mode[]).map((mode,i) => {const m=modeInfo[mode];return `<button class="mode-card mode-${mode}" data-mode="${mode}"><div class="mode-top"><span class="mode-icon">${icon(m.icon)}</span><span class="mode-number">0${i+1}</span></div><p class="mode-en">${m.sub}</p><h3>${m.title}</h3><p class="mode-description">${m.description}</p><div class="mode-bottom"><span>${mode === "matchmaking" ? "2–8人 / 早押し" : mode === "study" ? "分野別 / 解説付き" : mode === "ai" ? "3段階の難易度" : "合言葉で参加"}</span>${icon("arrow")}</div></button>`;}).join("")}</div></section>
  <section class="progress-panel"><div class="progress-intro"><span class="progress-icon">${icon("target")}</span><div><p class="eyebrow">YOUR PROGRESS</p><h2>小さな一歩が、確かな実力に。</h2><p>この端末での学習・AI対戦の記録</p></div></div><div class="progress-stats"><div><strong>${p.answered}<small>問</small></strong><span>学習した問題</span></div><div><strong>${p.answered ? Math.round(p.correct / p.answered * 100) : "—"}<small>${p.answered ? "%" : ""}</small></strong><span>正答率</span></div><div><strong>${p.aiWins}<small>勝</small></strong><span>AI対戦の勝利</span></div></div></section>
  <section class="howto"><span class="howto-icon">${icon("swords")}</span><div><h2>先に5問正解した人の勝ち。</h2><p>対戦は最大15問。いちばん早く正解した人に1点、お手つきはその問題の解答終了。毎問の解説と試合後の振り返りで、知識を自分のものに。</p></div><span class="howto-badge">LEARN BY PLAYING</span></section>${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}`;
}

function renderSetup(): string {
  const m = modeInfo[selectedMode];
  const study = selectedMode === "study";
  const ai = selectedMode === "ai";
  const fields = [...new Set([...questions.values()].map(q => q.field))];
  return `<header class="setup-title mode-${selectedMode}"><span class="mode-icon">${icon(m.icon)}</span><div><p class="eyebrow">${m.sub}</p><h1>${m.title}</h1><p class="lead">${m.description}</p></div></header><section class="panel setup-panel"><label class="field"><span>プレイヤー名${study ? "（任意）" : ""}</span><input id="name" maxlength="12" autocomplete="nickname" placeholder="名前を入力（12文字まで）" value="${esc(playerName)}" ${busy ? "disabled" : ""}/></label>
    ${study ? `<div class="settings"><label class="field"><span>学習する分野</span><select id="study-field" aria-label="学習する分野"><option value="">すべての分野</option>${fields.map(f=>`<option value="${esc(f)}" ${f===studyField ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label><label class="field"><span>問題数</span><select id="study-count" aria-label="問題数">${[5,10,20,100].map(n=>`<option value="${n}" ${n===studyCount ? "selected" : ""}>${n===100 ? "すべて" : n+"問"}</option>`).join("")}</select></label></div><p class="setup-hint">時間制限なし。解答後の解説を読んで、自分のペースで進められます。選んだ分野の問題数が少ない場合は、その分野の全問を出題します。</p>` : `<div class="settings">${ai ? `<label class="field"><span>AIの難易度</span><select id="difficulty" aria-label="AIの難易度">${(["easy","normal","hard"] as Difficulty[]).map(d=>`<option value="${d}" ${d===difficulty ? "selected" : ""}>${difficultyName[d]}</option>`).join("")}</select></label>` : `<label class="field"><span>${selectedMode==="room" ? "部屋の定員" : "対戦人数"}</span><select id="capacity" aria-label="${selectedMode === "room" ? "部屋の定員" : "対戦人数"}"><option value="">${selectedMode==="room" ? "8人まで" : "おまかせ（2〜8人）"}</option>${[2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===capacity ? "selected" : ""}>${n}人</option>`).join("")}</select></label>`}<label class="field"><span>1問の制限時間</span><input id="seconds" aria-label="1問の制限時間" type="number" inputmode="numeric" min="5" max="120" step="1" value="${answerSeconds}"/><small>5〜120秒</small></label></div><p class="setup-hint">${ai ? "AIの回答速度と正答率が難易度で変化します。5問先取・最大15問の早押し対戦です。" : selectedMode==="room" ? "4桁の合言葉を発行します。招待した友だちが集まったら、ホストが対戦を開始できます。" : "同じ人数・制限時間の人どうしでマッチング。おまかせは2人以上そろうと10秒後、8人で即開始します。"}</p>`}
    <button class="btn primary" data-act="${study || ai ? "solo-start" : selectedMode==="room" ? "create" : "random"}" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner mini"></span>接続中…' : icon(m.icon)+m.label+icon("arrow")}</button>
    ${selectedMode==="room" ? `<div class="divider"><span>合言葉を持っている方はこちら</span></div><label class="field"><span>合言葉（4桁）</span><div class="join"><input id="code" aria-label="合言葉（4桁）" inputmode="numeric" maxlength="4" placeholder="0000" value="${esc(roomCodeDraft)}"/><button class="btn" data-act="join" ${busy ? "disabled" : ""}>対戦室に参加</button></div></label>` : ""}
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}</section><p class="setup-footnote">${icon("check")}ログイン不要 · ${study ? "記録はこの端末に保存" : "名前だけで参加できます"}</p>`;
}

async function startSolo(mode: SoloMode = selectedMode === "ai" ? "ai" : "study", retryIds?: string[]): Promise<void> {
  if (busy) return;
  playerName = playerName.trim().slice(0, 12);
  if (mode === "ai" && !playerName) {error=ERRORS.NAME_REQUIRED; render(); return;}
  if (mode === "ai" && (!Number.isInteger(answerSeconds) || answerSeconds < 5 || answerSeconds > 120)) {error=ERRORS.BAD_SETTINGS;render();return;}
  writeStore("gb.name",playerName);
  if (mode === "ai") writeStore("gb.seconds",String(answerSeconds));
  const available = [...questions.values()].filter(q => retryIds ? retryIds.includes(q.id) : mode === "ai" || !studyField || q.field === studyField).map(q=>q.id);
  // Fisher–Yates。特定の問題に偏らないようシャッフルする。
  for (let i=available.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  const ids=available.slice(0,retryIds ? available.length : mode === "ai" ? 15 : studyCount);
  if (!ids.length) {error="この分野の問題はありません";render();return;}
  busy=true; error=""; render();
  try {
    await solo.start(mode,ids,mode === "study" ? 20 : answerSeconds,difficulty);
    view="home";
    window.scrollTo(0,0);
  } catch (e) {error=errorText(e); if (solo.active) solo.error=error;}
  finally {busy=false;render();}
}

function renderPlayers(m: MatchState, withMarks: boolean): string {
  return `<ul class="players">${m.players
    .map((p) => {
      const cls = [`seat-${p.seat % 8}`, p.seat === mySeat ? "me" : "", withMarks && p.seat === m.winner_seat ? "winner" : ""].join(" ");
      const mark = withMarks && p.mark ? `<em class="mark ${p.mark}">${p.mark === "o" ? "○" : "×"}</em>` : "";
      const score = m.status === "waiting" ? "" : `<span class="pts">${p.score}</span>`;
      return `<li class="${cls}"><b>${esc(p.name)}</b>${score}${mark}</li>`;
    })
    .join("")}</ul>`;
}

function renderWaiting(m: MatchState): string {
  const isHost = m.code !== null && (m.host_seat === mySeat || m.host_seat === null);
  const head = m.code
    ? `<p class="eyebrow">合言葉</p><div class="code">${m.code}</div>
       <button class="btn line" data-act="share">LINEで誘う</button>`
    : `<h2>対戦相手を探しています</h2>
       <p class="lead">${
         m.capacity !== null
           ? `あと${m.capacity - m.players.length}人そろうと開始します`
           : m.phase_ends_at
             ? `あと<span data-count></span>秒で開始`
             : "もう1人そろうと10秒後に開始します"
       }</p>
       ${m.phase_ends_at ? `<div class="timer"><i data-bar></i></div>` : `<div class="spinner"></div>`}`;
  const action = m.code
    ? isHost
      ? `<button class="btn primary" data-act="start" ${busy || m.players.length < 2 ? "disabled" : ""}>${m.players.length < 2 ? "もう1人の参加を待っています" : m.players.length + "人で開始"}</button>`
      : `<p class="lead">部屋を作った人が開始するのを待っています</p>`
    : "";
  return `
    <section class="panel center waiting-panel">
      <p class="eyebrow">${m.code ? "PRIVATE ROOM" : "MATCHMAKING"}</p>
      ${head}
      <p class="count-label">参加者 ${m.players.length} / ${m.capacity ?? 8}・1問${m.answer_seconds}秒</p>
      ${renderPlayers(m, false)}
      ${action}
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
      <button class="btn ghost" data-act="leave">やめる</button>
    </section>`;
}

function renderPlay(m: MatchState): string {
  const q = m.q_id ? questions.get(m.q_id) : undefined;
  const top = `
    <div class="session-label"><span class="tag">${icon("swords")} ${m.code ? "友だちと対戦" : "マッチング対戦"}</span><span>5問先取</span></div>
    ${renderPlayers(m, true)}
    <div class="qhead">
      <span>第${m.q_index + 1}問<small> / 最大${m.q_total}問</small></span>
      ${q ? `<span class="tag">${esc(q.field)}</span>` : ""}
      <span class="clock"><span data-count></span>秒</span>
    </div>
    <div class="timer"><i data-bar></i></div>`;
  if (m.phase === "countdown" || !q) {
    return `${top}<section class="countdown"><span data-count></span><p>まもなく開始</p></section>`;
  }
  const reveal = m.phase === "reveal" ? m.reveal : null;
  const mine = myChoices.get(m.q_index);
  const locked = reveal !== null || myMark() !== null || sending;
  const choices = q.choices
    .map((c, i) => {
      const cls = [
        reveal?.answer === i ? "correct" : "",
        mine === i && (reveal ? reveal.answer !== i : myMark() === "x") ? "wrong" : "",
        mine === i ? "mine" : "",
      ].join(" ");
      return `<li><button class="choice ${cls}" data-choice="${i}" ${locked ? "disabled" : ""}><span class="num">${i + 1}</span><span>${esc(c)}</span></button></li>`;
    })
    .join("");
  let footer = "";
  if (reveal) {
    const [head, ...body] = reveal.explanation.split(/\n{2,}/);
    const banner = m.winner_seat === null ? "正解者なし" : m.winner_seat === mySeat ? "あなたが正解！" : `${esc(nameOf(m.winner_seat))} さんが正解！`;
    footer = `
      <section class="reveal ${m.winner_seat === mySeat ? "win" : ""}">
        <p class="banner">${banner}</p>
        <div class="expl">${richText(head)}${body[0] ? richText(body[0]) : ""}</div>
        <p class="next">次へ <span data-count></span>秒（解説の全文は試合後に読めます）</p>
      </section>`;
  } else if (myMark() === "x") {
    footer = `<p class="note">お手つき。ほかの人の解答を待っています…</p>`;
  }
  return `${top}
    <section class="question">
      <p>${esc(q.question)}</p>
      ${q.image ? `<img src="${BASE}${q.image}" alt="${esc(q.imageAlt ?? "")}" />` : ""}
    </section>
    <ol class="choices">${choices}</ol>
    ${footer}
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}`;
}

function renderResult(m: MatchState): string {
  const ranked = [...m.players].sort((a, b) => b.score - a.score);
  const rankOf = (p: Player): number => ranked.findIndex((r) => r.score === p.score) + 1;
  const champions = ranked.filter((p) => p.score === ranked[0]?.score);
  const title = champions.length === 1 ? `${esc(champions[0].name)} さんの勝ち！` : "引き分け！";
  const mine = ranked.find((p) => p.seat === mySeat);
  return `
    <section class="panel center">
      <p class="eyebrow">試合終了</p>
      <h2 class="result-title">${title}</h2>
      ${mine ? `<p class="lead">あなたは ${rankOf(mine)}位（${mine.score}問正解）</p>` : ""}
      <ol class="ranking">${ranked
        .map((p) => `<li class="seat-${p.seat % 8} ${p.seat === mySeat ? "me" : ""}"><span class="rank">${rankOf(p)}</span><b>${esc(p.name)}</b><span class="pts">${p.score}</span></li>`)
        .join("")}</ol>
      <button class="btn primary" data-act="review" ${busy ? "disabled" : ""}>解説を振り返る</button>
      <button class="btn" data-act="random">もう一度ランダム対戦</button>
      <button class="btn ghost" data-act="leave">トップへ</button>
    </section>`;
}

function renderReview(): string {
  const items = review
    .map((r, n) => {
      const q = questions.get(r.id);
      if (!q) return "";
      const verdict = r.my_choice === null ? "未解答" : r.my_choice === r.answer ? "○ 正解" : "× 不正解";
      return `
        <article class="review-item">
          <p class="eyebrow">第${n + 1}問・${esc(q.field)}<span class="verdict ${r.my_choice === r.answer ? "ok" : ""}">${verdict}</span></p>
          <p class="review-q">${esc(q.question)}</p>
          ${q.image ? `<img src="${BASE}${q.image}" alt="${esc(q.imageAlt ?? "")}" loading="lazy" />` : ""}
          <ol class="review-choices">${q.choices
            .map((c, i) => `<li class="${i === r.answer ? "correct" : ""} ${i === r.my_choice && i !== r.answer ? "wrong" : ""}"><span class="num">${i + 1}</span>${esc(c)}</li>`)
            .join("")}</ol>
          <div class="expl">${richText(r.explanation)}</div>
        </article>`;
    })
    .join("");
  return `
    <header class="hero small"><p class="eyebrow">振り返り</p><h1>今回の${review.length}問</h1></header>
    ${items}
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    <div class="panel"><button class="btn primary" data-act="random">もう一度ランダム対戦</button><button class="btn ghost" data-act="leave">トップへ</button></div>`;
}

app.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === "name") playerName = input.value;
  if (input.id === "code") roomCodeDraft = input.value;
  if (input.id === "seconds") answerSeconds = Number(input.value);
});
app.addEventListener("change", (e) => {
  const input = e.target as HTMLSelectElement;
  if (input.id === "capacity") capacity = Number(input.value) || null;
  if (input.id === "study-field") studyField = input.value;
  if (input.id === "study-count") studyCount = Number(input.value);
  if (input.id === "difficulty") difficulty = input.value as Difficulty;
});
app.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest<HTMLButtonElement>("button")?.disabled) return;
  const mode = target.closest<HTMLElement>("[data-mode]")?.dataset.mode as Mode | undefined;
  if (mode && mode in modeInfo) {selectedMode=mode;view="setup";error="";render();window.scrollTo(0,0);return;}
  const soloChoice = target.closest<HTMLElement>("[data-solo-choice]");
  if (soloChoice) return void solo.act("answer",Number(soloChoice.dataset.soloChoice));
  const choice = target.closest<HTMLElement>("[data-choice]");
  if (choice) return void answer(Number(choice.dataset.choice));
  const act = target.closest<HTMLElement>("[data-act]")?.dataset.act;
  if (busy) return;
  if (act === "random") void enter("find_match");
  else if (act === "create") void enter("create_room");
  else if (act === "join") void enter("join_room");
  else if (act === "start") void startRoom();
  else if (act === "share") shareRoom();
  else if (act === "review") void openReview();
  else if (act === "leave") void leave();
  else if (act === "solo-start") void startSolo();
  else if (act === "solo-next") {void solo.act("next");window.scrollTo(0,0);}
  else if (act === "solo-review") {void solo.act("review");window.scrollTo(0,0);}
  else if (act === "solo-retry") {const ids=solo.retryIds(); void startSolo("study",ids);}
  else if (act === "solo-again") {selectedMode=solo.state?.mode === "ai" ? "ai" : "study"; if (solo.state) {difficulty=solo.state.difficulty;answerSeconds=solo.state.answer_seconds;} solo.stop();view="setup";render();window.scrollTo(0,0);}
  else if (act === "reload") location.reload();
});
app.addEventListener("keydown", (e) => {
  const id = (e.target as HTMLElement).id;
  if (e.key === "Enter" && id === "name" && !busy) {
    if (selectedMode === "study" || selectedMode === "ai") void startSolo();
    else void enter(selectedMode === "room" ? "create_room" : "find_match");
  }
  if (e.key === "Enter" && id === "code") void enter("join_room");
});

async function boot(): Promise<void> {
  app.innerHTML = `<p class="loading">読み込み中…</p>`;
  const response = await fetch(`${BASE}questions.json`);
  if (!response.ok) throw new Error("QUESTIONS_UNAVAILABLE");
  const list = (await response.json()) as Question[];
  if (!list.length) throw new Error("QUESTIONS_UNAVAILABLE");
  list.forEach(q => questions.set(q.id, q));
  // 図は計300KB程度なので先読みして、出題時に待たせない
  list.forEach((q) => q.image && (new Image().src = `${BASE}${q.image}`));
  await solo.resume();
  if (solo.active) {render();return;}
  const resumeId = readStore("gb.match", sessionStorage);
  if (resumeId) {
    const s = await call<MatchState | null>("get_match", { p_match: resumeId, p_device: deviceId }).catch(() => null);
    if (s && s.my_seat !== null && s.status !== "finished") {
      subscribe(s.id);
      view = "match";
      applyState(s);
      return;
    }
  }
  render();
}

void boot().catch(() => {
  app.innerHTML = `${renderHeader(false)}<section class="panel center"><h1>読み込みできませんでした</h1><p>接続を確認して、もう一度お試しください。</p><button class="btn primary" data-act="reload">再読み込み</button></section>`;
});
