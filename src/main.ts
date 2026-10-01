import "./style.css";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { call, listen, serverNow, supabase, type MatchState, type Player, type ReviewItem } from "./api";

interface Question {
  id: string;
  field: string;
  question: string;
  choices: string[];
  image?: string;
  imageAlt?: string;
}

const BASE = import.meta.env.BASE_URL;
const PHASE_SECONDS = { countdown: 3, question: 20, reveal: 7, waiting: 10 } as const;
const ERRORS: Record<string, string> = {
  NAME_REQUIRED: "名前を入力してください",
  ROOM_NOT_FOUND: "その合言葉の部屋は見つかりません（開始済みか、締め切られています）",
  ROOM_FULL: "その部屋は満員です（8人まで）",
  HOST_ONLY: "開始できるのは部屋を作った人だけです",
  NOT_IN_MATCH: "この対戦には参加していません",
};

const app = document.querySelector<HTMLElement>("#app")!;

function readStore(key: string, storage: Storage = localStorage): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null, storage: Storage = localStorage): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // 保存できない環境（プライベートブラウズ等）でも遊べる
  }
}

const deviceId = readStore("gb.device") ?? crypto.randomUUID();
writeStore("gb.device", deviceId);

let playerName = readStore("gb.name") ?? "";
let roomCodeDraft = new URLSearchParams(location.search).get("room") ?? "";
let questions = new Map<string, Question>();
let match: MatchState | null = null;
let mySeat: number | null = null;
let channel: RealtimeChannel | null = null;
let live = false;
let view: "home" | "match" | "review" = "home";
let review: ReviewItem[] = [];
let myChoices = new Map<number, number>();
let sending = false;
let busy = false;
let error = "";
let ticking = false;
let lastTickAt = 0;
let tickJitter = 0;

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const richText = (s: string): string =>
  s
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`)
    .join("");

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
  channel = listen(matchId, applyState, (ok) => (live = ok));
}

async function enter(fn: "find_match" | "create_room" | "join_room"): Promise<void> {
  const nameInput = document.querySelector<HTMLInputElement>("#name");
  playerName = (nameInput?.value ?? playerName).trim().slice(0, 12);
  if (!playerName) {
    error = ERRORS.NAME_REQUIRED;
    render();
    return;
  }
  writeStore("gb.name", playerName);
  const args: Record<string, unknown> = { p_device: deviceId, p_name: playerName };
  if (fn === "join_room") {
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
    match = null;
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
  if (match?.status === "waiting") void call("leave_match", { p_match: match.id, p_device: deviceId }).catch(() => {});
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  match = null;
  mySeat = null;
  view = "home";
  writeStore("gb.match", null, sessionStorage);
  render();
}

async function tick(): Promise<void> {
  if (!match || ticking) return;
  ticking = true;
  lastTickAt = Date.now();
  try {
    applyState(await call("tick", { p_match: match.id, p_device: deviceId }));
  } catch {
    // 次のループで再試行する
  } finally {
    ticking = false;
  }
}

async function answer(choice: number): Promise<void> {
  if (!match || sending || match.phase !== "question" || myMark() !== null) return;
  sending = true;
  myChoices.set(match.q_index, choice);
  render();
  try {
    applyState(await call("submit_answer", { p_match: match.id, p_device: deviceId, p_q_index: match.q_index, p_choice: choice }));
  } catch (e) {
    error = errorText(e);
  } finally {
    sending = false;
    render();
  }
}

async function startRoom(): Promise<void> {
  if (!match) return;
  try {
    applyState(await call("start_room", { p_match: match.id, p_device: deviceId }));
  } catch (e) {
    error = errorText(e);
    render();
  }
}

async function openReview(): Promise<void> {
  if (!match) return;
  try {
    review = await call<ReviewItem[]>("get_review", { p_match: match.id, p_device: deviceId });
    view = "review";
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    error = errorText(e);
    render();
  }
}

function shareRoom(): void {
  if (!match?.code) return;
  const link = `${location.origin}${BASE}?room=${match.code}&openExternalBrowser=1`;
  const text = `ゲノム対戦の部屋を作りました！\n合言葉：${match.code}\n${link}`;
  window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
}

// 期限切れの進行・待機中の生存通知・配信が届かないときの取り直しを1本のループで行う。
setInterval(() => {
  updateClock();
  if (!match || view !== "match" || match.status === "finished") return;
  const sinceTick = Date.now() - lastTickAt;
  const overdue = match.phase_ends_at !== null && serverNow() >= Date.parse(match.phase_ends_at) + tickJitter;
  const heartbeat = match.status === "waiting" && sinceTick > 2000;
  const poll = !live && sinceTick > 1500;
  if ((overdue && sinceTick > 1000) || heartbeat || poll) void tick();
}, 250);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && match && view === "match") void tick();
});

// ---------- 描画 ----------

const me = (): Player | undefined => match?.players.find((p) => p.seat === mySeat);
const myMark = (): Player["mark"] => me()?.mark ?? null;
const nameOf = (seat: number | null): string => match?.players.find((p) => p.seat === seat)?.name ?? "";

function updateClock(): void {
  if (!match?.phase_ends_at) return;
  const left = Math.max(0, (Date.parse(match.phase_ends_at) - serverNow()) / 1000);
  const total = PHASE_SECONDS[match.phase ?? "waiting"];
  document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => (el.textContent = String(Math.ceil(left))));
  document.querySelectorAll<HTMLElement>("[data-bar]").forEach((el) => {
    el.style.width = `${Math.min(100, (left / total) * 100)}%`;
    el.classList.toggle("low", match?.phase === "question" && left <= 5);
  });
}

function render(): void {
  if (view === "review") app.innerHTML = renderReview();
  else if (!match || view === "home") app.innerHTML = renderHome();
  else if (match.status === "waiting") app.innerHTML = renderWaiting(match);
  else if (match.status === "playing") app.innerHTML = renderPlay(match);
  else app.innerHTML = renderResult(match);
  updateClock();
}

function renderHome(): string {
  return `
    <header class="hero">
      <p class="eyebrow">ゲノム解析学・2025年度 過去問100問</p>
      <h1>ゲノム対戦</h1>
      <p class="lead">2〜8人で早押し5択。先に${5}問正解した人の勝ち。</p>
    </header>
    <section class="panel">
      <label class="field">
        <span>表示名（12文字まで）</span>
        <input id="name" maxlength="12" autocomplete="nickname" placeholder="例：ゲノム太郎" value="${esc(playerName)}" />
      </label>
      <button class="btn primary" data-act="random" ${busy ? "disabled" : ""}>ランダム対戦</button>
      <div class="divider"><span>友だちと遊ぶ</span></div>
      <button class="btn" data-act="create" ${busy ? "disabled" : ""}>部屋を作る（合言葉を発行）</button>
      <div class="join">
        <input id="code" inputmode="numeric" maxlength="4" placeholder="合言葉4桁" value="${esc(roomCodeDraft)}" />
        <button class="btn" data-act="join" ${busy ? "disabled" : ""}>入る</button>
      </div>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
    </section>
    <section class="rules">
      <h2>ルール</h2>
      <ul>
        <li>問題と5つの選択肢が同時に出ます。<strong>いちばん早く正解した人だけ</strong>に1点。</li>
        <li>まちがえるとその問題はもう答えられません（お手つき）。</li>
        <li>制限時間は1問20秒。${5}問先取か、15問終了時点の得点で順位が決まります。</li>
        <li>毎問の決着後に正解と解説が出ます。試合後は全問を振り返れます。</li>
      </ul>
    </section>`;
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
       <p class="lead">${m.phase_ends_at ? `あと<span data-count></span>秒で開始` : "もう1人そろうと10秒後に開始します"}</p>
       ${m.phase_ends_at ? `<div class="timer"><i data-bar></i></div>` : `<div class="spinner"></div>`}`;
  const action = m.code
    ? isHost
      ? `<button class="btn primary" data-act="start">${m.players.length}人で開始</button>`
      : `<p class="lead">部屋を作った人が開始するのを待っています</p>`
    : "";
  return `
    <section class="panel center">
      ${head}
      <p class="count-label">参加者 ${m.players.length} / 8</p>
      ${renderPlayers(m, false)}
      ${action}
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <button class="btn ghost" data-act="leave">やめる</button>
    </section>`;
}

function renderPlay(m: MatchState): string {
  const q = m.q_id ? questions.get(m.q_id) : undefined;
  const top = `
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
    ${error ? `<p class="error">${esc(error)}</p>` : ""}`;
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
      <button class="btn primary" data-act="review">解説を振り返る</button>
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
    <div class="panel"><button class="btn primary" data-act="random">もう一度ランダム対戦</button><button class="btn ghost" data-act="leave">トップへ</button></div>`;
}

app.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const choice = target.closest<HTMLElement>("[data-choice]");
  if (choice) return void answer(Number(choice.dataset.choice));
  const act = target.closest<HTMLElement>("[data-act]")?.dataset.act;
  if (act === "random") void enter("find_match");
  else if (act === "create") void enter("create_room");
  else if (act === "join") void enter("join_room");
  else if (act === "start") void startRoom();
  else if (act === "share") shareRoom();
  else if (act === "review") void openReview();
  else if (act === "leave") void leave();
});

app.addEventListener("keydown", (e) => {
  const id = (e.target as HTMLElement).id;
  if (e.key === "Enter" && id === "name") void enter("find_match");
  if (e.key === "Enter" && id === "code") void enter("join_room");
});

async function boot(): Promise<void> {
  app.innerHTML = `<p class="loading">読み込み中…</p>`;
  const list = (await (await fetch(`${BASE}questions.json`)).json()) as Question[];
  questions = new Map(list.map((q) => [q.id, q]));
  // 図は計300KB程度なので先読みして、出題時に待たせない
  list.forEach((q) => q.image && (new Image().src = `${BASE}${q.image}`));
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

void boot();
