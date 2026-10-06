import "./style.css";
import "./learning.css";
import "./social.css";
import "./readability.css";
import "./sessions.css";
import "./catalog.css";
import { ImageViewer, renderReadingControls, setReadSize } from "./readability";
import { choiceOrder } from "./choices";
import { renderConnection, realtimeState } from "./connection";
import { FriendsController, friendsIcon } from "./friends";
import { cachedPerformance, cachePerformance, renderPerformance, reviewCourse, renderReviewCourse, type Performance } from "./learning";
import { renderThemeSwitch, setTheme } from "./theme";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { call, listen, serverNow, supabase, type MatchState, type Player, type ReviewItem } from "./api";

import { esc, richText, readStore, writeStore, icon, helix, notebook, recordMiss, toggleSaved, toggleUncertain, uncertainButton, removeMissed, reviewCard, questionImage, type Question } from "./ui";
import { studyDistribution, renderDistribution } from './study-distribution';
import { getSavedStudies, renderSavedStudies, type SavedStudy } from './study-resume';
import { SoloController, difficultyName, type Difficulty, type SoloMode } from "./solo";
import { renderCatalog, setCatalogField, toggleCatalogItem } from "./catalog";

const BASE = import.meta.env.BASE_URL;
const PHASE_SECONDS = { countdown: 3, reveal: 7, waiting: 10 } as const;
// マッチング対戦は人数だけを選び、制限時間と解説の表示時間は固定する（サーバ側も同じ値に固定）。
const MATCH_SECONDS = 20;
const MATCH_REVEAL_SECONDS = 3;
const MATCH_SIZES = [{n:2,label:"ソロ",sub:"二人で対戦"},{n:3,label:"三人対戦",sub:"3人で対戦"},{n:4,label:"四人対戦",sub:"4人で対戦"}] as const;
const matchSize = (v: unknown): number => MATCH_SIZES.some((o) => o.n === Number(v)) ? Number(v) : 2;
// 旧サーバは matchmaking を返さないので、合言葉のない試合をマッチングとみなす。
const isMatchmaking = (m: MatchState): boolean => m.matchmaking ?? m.code === null;
const ERRORS: Record<string, string> = {
  NAME_REQUIRED: "名前を入力してください",
  ROOM_NOT_FOUND: "その部屋は見つかりません（開始済み・鍵付き・待機終了の可能性があります）",
  INVITE_REQUIRED: "鍵付きルームです。作成者の招待リンクから参加してください",
  ROOM_STARTED: "対戦開始後は公開設定を変更できません",
  ROOM_FULL: "その部屋は満員です",
  NOT_ALL_READY: "全員の準備完了を確認してから開始してください",
  REMATCH_MEMBERS_ONLY: "再戦は前の試合のメンバーだけが参加できます",
  REMATCH_UNAVAILABLE: "この試合では再戦できません。新しい対戦室を作成してください",
  BAD_ROOM_FIELD: "この分野の問題はありません。分野を選び直してください",
  BAD_SETTINGS: "制限時間は5〜120秒、人数は2〜8人で指定してください",
  BAD_MATCH_SIZE: "マッチング人数はソロ・三人対戦・四人対戦から選んでください",
  NEED_PLAYERS: "対戦を始めるには2人以上の参加が必要です",
  ROOM_ONLY: "この操作は作成した対戦室でのみ使えます",
  HOST_ONLY: "この操作ができるのは部屋を作った人だけです",
  NOT_IN_MATCH: "この対戦には参加していません",
  BAD_SOLO_SETTINGS: "問題と設定を選び直してください",
  SOLO_NOT_FOUND: "この学習セッションは見つかりません。もう一度開始してください",
};

const app = document.querySelector<HTMLElement>("#app")!;

const deviceId = readStore("gb.device") ?? crypto.randomUUID();
writeStore("gb.device", deviceId);

let playerName = readStore("gb.name") ?? "";
// 対戦室の定員。null は「8人まで」
let capacity: number | null = Number(readStore("gb.capacity")) || null;
let answerSeconds = Number(readStore("gb.seconds")) || 20;
let matchCapacity = matchSize(readStore("gb.match-capacity"));
let roomPrivateDraft = false;
let roomFieldDraft = readStore("gb.room-field") ?? "";
let roomInviteDraft = new URLSearchParams(location.search).get("invite") ?? "";
let roomCodeDraft = new URLSearchParams(location.search).get("room") ?? "";
const questions = new Map<string, Question>();
let match: MatchState | null = null;
let mySeat: number | null = null;
let channel: RealtimeChannel | null = null;
let live = false;
let view: "home" | "setup" | "match" | "review" | "notebook" | "catalog" = roomCodeDraft ? "setup" : "home";
let notebookTab: "missed" | "saved" | "uncertain" = "missed";
type Mode = "matchmaking" | "study" | "ai" | "room";
let selectedMode: Mode = roomCodeDraft ? "room" : "matchmaking";
let studyField = "";
let studyCount = 10;
let studyCornerExpanded=false;
let distribution=studyDistribution(readStore('gb.study-distribution'));
type StudyOrder = 'unattempted'|'random';
let studyOrder:StudyOrder=readStore('gb.study-order')==='random'?'random':'unattempted';
let savedStudies:SavedStudy[]=[];let savedStudiesLoading=false;let savedStudiesError=false;let savedStudyNotice='';let savedStudiesAgain=false;
let savedStudiesExpanded=false;
async function refreshSavedStudies():Promise<void> {
  if(savedStudiesLoading){savedStudiesAgain=true;return;}
  savedStudiesLoading=true;updateSavedStudies();
  try{savedStudies=await getSavedStudies(deviceId);savedStudiesError=false;}
  catch{savedStudiesError=true;}
  finally{savedStudiesLoading=false;updateSavedStudies();if(savedStudiesAgain){savedStudiesAgain=false;void refreshSavedStudies();}}
}
function updateSavedStudies():void {
  if(view==='home'&&!solo.active){const region=document.getElementById('saved-study-region');if(region)region.innerHTML=renderSavedStudies(savedStudies,savedStudiesLoading,savedStudiesError,savedStudyNotice,savedStudiesExpanded);}
}
async function resumeStudy(id:string):Promise<void> {
  if(busy||solo.busy||solo.active)return;
  busy=true;error='';render();
  try{
    if(await solo.resumeSaved(id)){view='home';savedStudyNotice='';window.scrollTo(0,0);}
    else{error=solo.error;void refreshSavedStudies();}
  }finally{busy=false;render();}
}
let studyAttempted=new Set<string>();let studyProgressLoaded=false;let studyProgressLoading=false;let studyProgressError=false;
async function refreshStudyProgress():Promise<void> {
  if(studyProgressLoading)return;studyProgressLoading=true;
  try {const s=await call<{attempted_ids:string[]}>('get_study_progress',{p_device:deviceId});studyAttempted=new Set(s.attempted_ids);studyProgressLoaded=true;studyProgressError=false;}
  catch {studyProgressError=true;}
  finally {studyProgressLoading=false;if(view==='setup'&&selectedMode==='study'&&!solo.active)render();}
}
let difficulty: Difficulty = "normal";
let battleGeneration = 0;
let review: ReviewItem[] = [];
let reviewLoaded=false;
let reviewLoading=false;
let battleReviewPromise:Promise<void>|null=null;
let myChoices = new Map<number, number>();
let sending = false;
let busy = false;
let error = "";
let ticking = false;
let lastTickAt = 0;
let tickJitter = 0;
const RESULT_STEP_MS = 450;
let resultIntro: { id: string; at: number } | null = null;

const imageViewer = new ImageViewer();
const solo = new SoloController(deviceId, questions, render, () => playerName, () => {void refreshPerformance();});
const friends=new FriendsController(deviceId,()=>playerName,(name)=>{playerName=name;writeStore("gb.name",name);render();},()=>match?{...match,my_seat:mySeat}:null,(s)=>{
  if(match?.status==="waiting" && match.id!==s.id)void call("leave_match",{p_match:match.id,p_device:deviceId}).catch(()=>{});
  battleGeneration++;solo.stop();match=null;myChoices=new Map();review=[];reviewLoaded=false;reviewLoading=false;battleReviewPromise=null;
  if(!playerName){playerName=friends.state?.profile.name??"ゲストプレイヤー";writeStore("gb.name",playerName);}
  subscribe(s.id);writeStore("gb.match",s.id,sessionStorage);view="match";applyState(s);
});
let lastConnectionProbe=0;let probingConnection=false;
async function probeConnection():Promise<void> {
  if(probingConnection)return;probingConnection=true;lastConnectionProbe=Date.now();
  try {await call("connection_ping",{});}catch { /* 状態はAPI共通処理で表示する */ }
  finally {probingConnection=false;}
}
let performance=cachedPerformance(deviceId);
let performanceError="";
let performanceLoading=false;
let performanceAgain=false;
const modeInfo = {
  matchmaking: {title:"マッチング対戦",sub:"MATCHMAKING",icon:"swords",description:"同級生と対戦",label:"対戦相手を探す"},
  study: {title:"一人で学習",sub:"SOLO STUDY",icon:"book",description:"焦らず、着実に。理解を深める時間。",label:"学習をはじめる"},
  ai: {title:"AI対戦",sub:"AI BATTLE",icon:"bot",description:"いつでも挑戦できる、あなたの練習相手。",label:"AIと対戦する"},
  room: {title:"対戦室作成",sub:"BATTLE ROOMS",icon:"room",description:"仲間を誘って、同じ問題に挑もう。",label:"対戦室を作成する"},
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
  if (match?.id === s.id && s.invite_token === undefined) s = {...s, invite_token: s.is_private ? match.invite_token : null};
  const newlyFinished=s.status === "finished" && match?.status !== "finished";
  // マッチング対戦は、終了したらまず問題と解説の振り返りを開く（順位はその後に見る）。
  if (s.status === "finished" && match?.id === s.id && match.status === "playing" && view === "match" && isMatchmaking(s)) {view = "review";window.scrollTo(0, 0);}
  match = s;
  const mine = myChoices.get(s.q_index);
  if (s.phase === "reveal" && s.reveal && s.q_id && mine !== undefined && mine !== s.reveal.answer)
    recordMiss(`${s.id}:${s.q_index}`, { id: s.q_id, answer: s.reveal.answer, explanation: s.reveal.explanation, my_choice: mine,choice_order:choiceOrder(s.id,s.q_index,s.q_id,questions.get(s.q_id)?.choices.length??5) });
  if (newlyFinished) {void refreshPerformance();void prepareBattleReview();}
  render();
}

function subscribe(matchId: string): void {
  if (channel) void supabase.removeChannel(channel);
  live = false;realtimeState("connecting");
  channel = listen(matchId, (s) => { if (match?.id === matchId) applyState(s); }, (ok) => { if (match?.id === matchId) {live = ok;realtimeState(ok?"live":"fallback");} });
}

async function enter(fn: "find_match" | "create_room" | "join_room" | "join_public_room", publicRoomId?: string): Promise<void> {
  if (busy) return;
  const generation = ++battleGeneration;
  const nameInput = document.querySelector<HTMLInputElement>("#name");
  playerName = (nameInput?.value ?? playerName).trim().slice(0, 12);
  if (!playerName) {
    error = ERRORS.NAME_REQUIRED;
    render();
    document.querySelector<HTMLInputElement>("#name")?.focus();
    return;
  }
  writeStore("gb.name", playerName);
  const capacityInput = document.querySelector<HTMLSelectElement>("#capacity");
  const secondsInput = document.querySelector<HTMLInputElement>("#seconds");
  if (fn === "find_match") {
    matchCapacity = matchSize(document.querySelector<HTMLInputElement>('input[name="match-size"]:checked')?.value ?? matchCapacity);
    writeStore("gb.match-capacity", String(matchCapacity));
  } else if (fn === "create_room" && capacityInput && secondsInput) {
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
  if (fn === "find_match") {
    args.p_capacity = matchCapacity;
    args.p_seconds = MATCH_SECONDS;
  } else if (fn === "create_room") {
    args.p_capacity = capacity;
    args.p_seconds = answerSeconds;
    args.p_private = roomPrivateDraft;args.p_field=roomFieldDraft||null;writeStore("gb.room-field",roomFieldDraft||null);
  } else if (fn === "join_public_room") {
    if (!publicRoomId) return;
    args.p_match = publicRoomId;
  } else {
    roomCodeDraft = (document.querySelector<HTMLInputElement>("#code")?.value ?? "").trim();
    if (!/^\d{4}$/.test(roomCodeDraft)) {
      error = "部屋番号は4桁の数字です";
      render();
      return;
    }
    args.p_code = roomCodeDraft;
    args.p_invite = roomInviteDraft || null;
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
    review = [];reviewLoaded=false;reviewLoading=false;battleReviewPromise=null;
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
  if(busy||solo.busy)return;
  if(solo.state?.mode==='study' && solo.state.phase!=='finished') {
    busy=true;render();
    const saved=await solo.pause();busy=false;
    if(!saved){render();return;}
    savedStudyNotice='学習を保存しました。「続きから再開」で戻れます。';
  } else solo.stop();
  battleGeneration++;
  error = "";
  if (match?.status === "waiting") void call("leave_match", { p_match: match.id, p_device: deviceId }).catch(() => {});
  if (channel) void supabase.removeChannel(channel);
  channel = null;realtimeState("off");
  match = null;
  mySeat = null;
  view = "home";
  writeStore("gb.match", null, sessionStorage);
  render();
  void refreshPerformance();void refreshStudyProgress();void refreshSavedStudies();
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
    if(match?.id===matchId && match.q_index===qIndex && myMark()===null)myChoices.delete(qIndex);
    error = "解答を送信できませんでした。通信を確認して、もう一度選んでください。";
  } finally {
    sending = false;
    render();
  }
}

async function setReady():Promise<void> {
  const m=match;if(!m||busy||m.status!=='waiting')return;
  busy=true;error='';render();
  try {const s=await call('set_ready',{p_match:m.id,p_device:deviceId,p_ready:!me()?.ready});if(match?.id===m.id)applyState(s);}
  catch(e){error=errorText(e);}
  finally{busy=false;render();}
}
async function rematch():Promise<void> {
  const m=match;if(!m||busy||m.status!=='finished')return;
  const generation=++battleGeneration;busy=true;error='';render();
  try {
    const s=await call('request_rematch',{p_match:m.id,p_device:deviceId});
    if(generation!==battleGeneration)return;
    myChoices=new Map();review=[];reviewLoaded=false;reviewLoading=false;battleReviewPromise=null;
    view='match';writeStore('gb.match',s.id,sessionStorage);applyState(s);subscribe(s.id);window.scrollTo(0,0);
  }catch(e){error=errorText(e);}
  finally{busy=false;render();}
}
function renderRematch(m:MatchState):string {
  return m.can_rematch?`<div class="rematch-actions"><button class="btn primary" data-act="rematch" ${busy?'disabled':''}>${icon('swords')}${m.rematch_requested?'再戦に参加する':'同じメンバーで再戦'}</button><p>${m.rematch_requested?`再戦に参加中 ${m.rematch_joined??0} / ${m.rematch_total??m.players.length}人。`:'メンバー・分野・制限時間を引き継ぎます。'}全員が再戦に参加し、準備完了になると開始します。</p></div>`:'';
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

async function refreshPerformance():Promise<void> {
  if (performanceLoading) {performanceAgain=true;return;}
  performanceLoading=true;
  try {
    const next=await call<Performance>("get_performance",{p_device:deviceId});
    performance=next;performanceError="";cachePerformance(deviceId,next);
  } catch {performanceError="学習・対戦の記録を取得できませんでした。";}
  finally {
    performanceLoading=false;
    if (view==="home" && !solo.active) {
      const region=document.querySelector<HTMLElement>("#performance-panels");
      if (region) region.innerHTML=renderPerformance(performance,performanceError);
    }
    if (performanceAgain) {performanceAgain=false;void refreshPerformance();}
  }
}
async function prepareBattleReview():Promise<void> {
  const m=match;if (!m || m.status!=="finished" || reviewLoaded) return;
  if (battleReviewPromise) return battleReviewPromise;
  const generation=battleGeneration;reviewLoading=true;error="";render();
  battleReviewPromise=(async()=>{
    try {
      const items=await call<ReviewItem[]>("get_review",{p_match:m.id,p_device:deviceId});
      if (generation!==battleGeneration || match?.id!==m.id) return;
      review=items.map((r,i)=>({...r,choice_order:choiceOrder(m.id,i,r.id,questions.get(r.id)?.choices.length??5)}));reviewLoaded=true;
    } catch(e) {if (generation===battleGeneration && match?.id===m.id) error=errorText(e);}
    finally {if (generation===battleGeneration && match?.id===m.id) {reviewLoading=false;battleReviewPromise=null;render();}}
  })();
  return battleReviewPromise;
}
async function openReview():Promise<void> {
  if (!match || busy) return;
  busy=true;render();
  try {await prepareBattleReview();if (reviewLoaded) {view="review";window.scrollTo(0,0);}}
  finally {busy=false;render();}
}
function currentBattleItem():ReviewItem|null {
  if (!match?.reveal || !match.q_id || myMark()!=="o") return null;
  return {id:match.q_id,answer:match.reveal.answer,explanation:match.reveal.explanation,my_choice:match.reveal.answer,choice_order:choiceOrder(match.id,match.q_index,match.q_id,questions.get(match.q_id)?.choices.length??5)};
}
async function startBattleCourse():Promise<void> {
  const items=solo.state?.mode==="ai" && solo.state.phase==="finished"?solo.review:review;
  const ids=reviewCourse(items).ids;
  if (ids.length) await startSolo("study",ids,true);
}

function shareRoom(): void {
  if (!match?.code) return;
  const link = roomLink();
  if (!link) return;
  const text = `ゲノム対戦の部屋を作りました！\n合言葉：${match.code}\n${link}`;
  window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

function roomLink(): string | null {
  if (!match?.code || (match.is_private && !match.invite_token)) return null;
  const params = new URLSearchParams({room:match.code,openExternalBrowser:"1"});
  if (match.is_private && match.invite_token) params.set("invite",match.invite_token);
  return `${location.origin}${BASE}?${params}`;
}

async function copyRoomLink(): Promise<void> {
  const link=roomLink(); if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    const button=document.querySelector<HTMLButtonElement>('[data-act="copy-room"]');
    if (button) button.textContent="招待リンクをコピーしました";
  } catch { error="コピーできませんでした。「LINEで誘う」から招待してください。";render(); }
}

async function toggleRoomPrivacy(): Promise<void> {
  if (!match || busy) return;
  busy=true;error="";render();
  try { applyState(await call("set_room_private",{p_match:match.id,p_device:deviceId,p_private:!match.is_private})); }
  catch(e) {error=errorText(e);}
  finally {busy=false;render();}
}

interface PublicRoom {id:string;host_name:string;player_count:number;capacity:number;answer_seconds:number;field?:string|null;q_total?:number;}
let publicRooms:PublicRoom[]=[];
let roomsLoading=false;
let roomsLoaded=false;
let roomsError="";
let lastRoomsFetch=0;
function renderPublicRooms(): string {
  return `<div class="public-rooms-heading"><div><p class="eyebrow">OPEN ROOMS</p><h2>公開ルーム</h2></div><button class="btn ghost" data-act="refresh-rooms" ${roomsLoading || busy ? "disabled" : ""}>${roomsLoading ? "更新中…" : "更新"}</button></div><p class="rooms-hint">同級生の部屋を選んで参加。名前を入力するだけで入れます。</p>
    ${roomsError ? `<p class="error" role="alert">${esc(roomsError)}</p>` : ""}
    ${!roomsLoaded && roomsLoading ? '<p class="rooms-empty" role="status">公開ルームを探しています…</p>' : publicRooms.length ? `<div class="room-list">${publicRooms.map(r=>`<button class="room-row" data-public-room="${esc(r.id)}" ${busy || r.player_count>=r.capacity ? "disabled" : ""}><span class="room-row-icon">${icon("room")}</span><span class="room-row-copy"><strong>${esc(r.host_name)}の対戦室</strong><span>${r.player_count} / ${r.capacity}人 · 1問${r.answer_seconds}秒<br>${esc(r.field||"すべての分野")}${r.q_total?` · 最大${r.q_total}問`:""}</span></span><span class="room-row-join">${r.player_count>=r.capacity ? "満員" : "参加する"}${icon("arrow")}</span></button>`).join("")}</div>` : '<div class="rooms-empty"><span>'+icon("room")+'</span><p>いま待機中の公開ルームはありません。</p><small>公開ルームを作成して、同級生の参加を待とう。</small></div>'}`;
}
function updatePublicRooms():void {
  if (view!=="setup" || selectedMode!=="room") return;
  const region=document.querySelector<HTMLElement>("#public-rooms");
  if (region) region.innerHTML=renderPublicRooms();
}
async function refreshPublicRooms():Promise<void> {
  if (roomsLoading) return;
  roomsLoading=true;lastRoomsFetch=Date.now();
  if (!roomsLoaded) updatePublicRooms();
  try {
    const next=await call<PublicRoom[]>("list_public_rooms",{});
    const changed=JSON.stringify(next)!==JSON.stringify(publicRooms) || !!roomsError || !roomsLoaded;
    publicRooms=next;roomsError="";roomsLoaded=true;roomsLoading=false;
    if (changed) updatePublicRooms();
  } catch {roomsError="一覧を更新できませんでした。接続を確認して更新してください。";roomsLoading=false;updatePublicRooms();}
}

// 期限切れの進行・待機中の生存通知・配信が届かないときの取り直しを1本のループで行う。
setInterval(() => {
  updateClock();
  solo.updateClock();
  void friends.refresh();
  if(document.visibilityState==="visible" && navigator.onLine && Date.now()-lastConnectionProbe>30000)void probeConnection();
  if (solo.active) void solo.tick();
  if (view === "setup" && selectedMode === "room" && !busy && !solo.active && document.visibilityState === "visible" && Date.now()-lastRoomsFetch>5000) void refreshPublicRooms();
  if (!match || (view !== "match" && view !== "review")) return;
  if(match.status==='finished') {if(document.visibilityState==='visible'&&Date.now()-lastTickAt>10000)void tick();return;}
  if(view!=='match')return;
  const sinceTick = Date.now() - lastTickAt;
  const overdue = match.phase_ends_at !== null && serverNow() >= Date.parse(match.phase_ends_at) + tickJitter;
  const heartbeat = match.status === "waiting" && sinceTick > 2000;
  const poll = !live && sinceTick > 1500;
  if ((overdue && sinceTick > 1000) || heartbeat || poll) void tick();
}, 250);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void probeConnection();void friends.refresh(true);
    if(view==='home'&&!solo.active){void refreshSavedStudies();void refreshPerformance();}
    if (match && view === "match") void tick();
    if (solo.active) void solo.tick();
    if (view === "setup" && selectedMode === "room") void refreshPublicRooms();
  }
});

window.addEventListener("online",()=>{void probeConnection();void friends.refresh(true);if(match)void tick();if(solo.active)void solo.tick();});

// ---------- 描画 ----------

const me = (): Player | undefined => match?.players.find((p) => p.seat === mySeat);
const myMark = (): Player["mark"] => me()?.mark ?? null;

function updateClock(): void {
  if (!match?.phase_ends_at) return;
  const left = Math.max(0, (Date.parse(match.phase_ends_at) - serverNow()) / 1000);
  const total = match.phase === "question" ? match.answer_seconds : match.phase === "reveal" && isMatchmaking(match) ? MATCH_REVEAL_SECONDS : PHASE_SECONDS[match.phase ?? "waiting"];
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
  else if (view === "notebook") body = renderNotebook();
  else if (view === "catalog") body = renderCatalog(questions);
  else if (!match || view === "home") body = renderHome();
  else if (match.status === "waiting") body = renderWaiting(match);
  else if (match.status === "playing") body = renderPlay(match);
  else body = renderResult(match);
  app.innerHTML = `${renderHeader(lobby)}<div class="reading-toolbar">${renderReadingControls()}<div id="connection-status" class="connection-strip">${renderConnection()}</div></div><div class="${lobby ? "lobby-body" : "arena-body"}">${body}</div><footer class="site-footer"><span>${icon("dna")} GENOME BATTLE</span><span>知識をつなぐ。理解を深める。</span></footer>`;
  updateClock();
  solo.updateClock();friends.update();
}

function renderHeader(lobby: boolean): string {
  const navigationBusy=busy||solo.busy;
  const backLabel=solo.state?.mode==='study'&&solo.state.phase!=='finished'?'中断してホームへ':'ホームへ';
  return `<header class="app-header"><button class="brand" data-act="leave" aria-label="ゲノム対戦 ホーム" ${navigationBusy ? "disabled" : ""}><span class="brand-icon">${icon("dna")}</span><span>GENOME<span class="brand-light"> BATTLE</span><small>ゲノム対戦</small></span></button>${lobby ? `<span class="header-note"><i></i> ゲノム解析学 / 2025</span>` : `<button class="btn ghost back-btn" data-act="leave" ${navigationBusy ? "disabled" : ""}>${icon("back")}${backLabel}</button>`}<span class="profile">${icon("user")}<span>${esc(playerName || "ゲストプレイヤー")}</span></span><div class="header-actions"><button class="btn ghost friends-open" data-act="friends" ${navigationBusy?"disabled":""}>${friendsIcon()}フレンド <b id="friends-badge" ${friends.badge()?"":"hidden"}>${friends.badge()}</b></button>${renderThemeSwitch()}</div></header>`;
}

function renderHome(): string {
  return `<div id="saved-study-region">${renderSavedStudies(savedStudies,savedStudiesLoading,savedStudiesError,savedStudyNotice,savedStudiesExpanded)}</div><section class="lobby-hero"><div class="hero-copy"><p class="eyebrow accent-eyebrow"><span></span> KNOWLEDGE IS YOUR POWER</p><h1>その知識が、<br><em>勝利</em>に変わる。</h1><p class="hero-description">学んで、挑んで、強くなる。<br>ゲノム解析学の知識で戦う、クイズバトル。</p><div class="hero-tags"><span>${icon("book")}2025年度 過去問100問</span><span>${icon("swords")}最大8人で対戦</span></div></div><div class="dna-art">${helix()}<span class="dna-caption">DECODE. LEARN. BATTLE.</span><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span></div></section>
  <section class="mode-section"><div class="section-heading"><div><p class="eyebrow">CHOOSE YOUR MODE</p><h2>今日は、どんな挑戦を？</h2></div><span class="section-note">4つのモードで、理解をその先へ。</span></div><div class="mode-grid">${(Object.keys(modeInfo) as Mode[]).map((mode,i) => {const m=modeInfo[mode];return `<button class="mode-card mode-${mode}" data-mode="${mode}"><div class="mode-top"><span class="mode-icon">${icon(m.icon)}</span><span class="mode-number">0${i+1}</span></div><p class="mode-en">${m.sub}</p><h3>${m.title}</h3><p class="mode-description">${m.description}</p><div class="mode-bottom"><span>${mode === "matchmaking" ? "2–4人 / 1問20秒" : mode === "study" ? "分野別 / 解説付き" : mode === "ai" ? "3段階の難易度" : "公開ルーム / 招待"}</span>${icon("arrow")}</div></button>`;}).join("")}</div></section>
  ${renderNotebookEntry()}
  <section id="performance-panels">${renderPerformance(performance,performanceError)}</section>
  <section class="howto"><span class="howto-icon">${icon("swords")}</span><div><h2>先に5問正解した人の勝ち。</h2><p>対戦は最大15問。対人戦は全員が1回ずつ解答し、正解した人全員に1点。AI対戦は先に正解した方に1点。毎問の解説と試合後の振り返りで、知識を自分のものに。</p></div><span class="howto-badge">LEARN BY PLAYING</span></section>${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}`;
}

function renderSetup(): string {
  const m = modeInfo[selectedMode];
  const study = selectedMode === "study";
  const ai = selectedMode === "ai";
  const fields = [...new Set([...questions.values()].map(q => q.field))];
  const roomTotal=[...questions.values()].filter(q=>!roomFieldDraft||q.field===roomFieldDraft).length;
  const fieldTotal = [...questions.values()].filter(q => !studyField || q.field === studyField).length;
  return `<header class="setup-title mode-${selectedMode}"><span class="mode-icon">${icon(m.icon)}</span><div><p class="eyebrow">${m.sub}</p><h1>${m.title}</h1><p class="lead">${m.description}</p></div></header>${study ? `<details id="study-corner" class="panel study-corner" ${studyCornerExpanded?"open":""}><summary class="catalog-entry study-corner-toggle"><span class="mode-icon">${icon("book")}</span><span><span class="eyebrow">PRACTICE</span><strong>問題演習コーナ</strong><small>分野・問題数・出題配分を選んで演習します。</small></span><span class="study-corner-cue" aria-hidden="true"><span class="when-closed">開く</span><span class="when-open">閉じる</span>${icon("arrow")}</span></summary><section class="setup-panel study-corner-body">` : `<section class="panel setup-panel">`}<label class="field"><span>プレイヤー名${study ? "（任意）" : ""}</span><input id="name" maxlength="12" autocomplete="nickname" placeholder="名前を入力（12文字まで）" value="${esc(playerName)}" ${busy ? "disabled" : ""}/></label>
    ${selectedMode==="room"?`<label class="field"><span>対戦室の分野</span><select id="room-field" aria-label="対戦室の分野"><option value="">すべての分野</option>${fields.map(f=>`<option value="${esc(f)}" ${f===roomFieldDraft?"selected":""}>${esc(f)}（${[...questions.values()].filter(q=>q.field===f).length}問）</option>`).join("")}</select></label><p class="room-field-summary">${esc(roomFieldDraft||"すべての分野")}から最大${Math.min(15,roomTotal)}問を出題。5問先取、問題が終わった場合は得点で決着します。</p>`:""}
    ${study ? `<div class="settings"><label class="field"><span>学習する分野</span><select id="study-field" aria-label="学習する分野"><option value="">すべての分野</option>${fields.map(f=>`<option value="${esc(f)}" ${f===studyField ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label><div class="field count-field"><span>問題数（1〜${fieldTotal}問）</span><div class="count-row"><input id="study-count" type="range" aria-label="問題数" min="1" max="${fieldTotal}" step="1" value="${Math.min(studyCount,fieldTotal)}"/><input id="study-count-value" type="number" inputmode="numeric" aria-label="問題数（数字で入力）" min="1" max="${fieldTotal}" step="1" value="${Math.min(studyCount,fieldTotal)}"/><span>問</span></div></div></div><div id="distribution-settings">${renderDistribution(distribution,!!studyField)}</div><p class="setup-hint">時間制限なし。解答後の解説を読んで、自分のペースで進められます。</p>` : `${selectedMode==="matchmaking" ? renderMatchSize() : `<div class="settings">${ai ? `<label class="field"><span>AIの難易度</span><select id="difficulty" aria-label="AIの難易度">${(["easy","normal","hard"] as Difficulty[]).map(d=>`<option value="${d}" ${d===difficulty ? "selected" : ""}>${difficultyName[d]}</option>`).join("")}</select></label>` : `<label class="field"><span>部屋の定員</span><select id="capacity" aria-label="部屋の定員"><option value="">8人まで</option>${[2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===capacity ? "selected" : ""}>${n}人</option>`).join("")}</select></label>`}<label class="field"><span>1問の制限時間</span><input id="seconds" aria-label="1問の制限時間" type="number" inputmode="numeric" min="5" max="120" step="1" value="${answerSeconds}"/><small>5〜120秒</small></label></div><p class="setup-hint">${ai ? "AIの回答速度と正答率が難易度で変化します。5問先取・最大15問の早押し対戦です。" : "作成した部屋は標準で公開ルーム一覧に表示されます。鍵をかけると、招待リンクを持つ人だけが参加できます。"}</p>`}`}
    ${selectedMode==="room" ? `<label class="room-privacy"><input id="room-private" type="checkbox" aria-label="鍵付きルームにする" ${roomPrivateDraft ? "checked" : ""}/><span><strong>${icon("lock")}鍵付きルームにする</strong><small>一覧には表示せず、招待した人だけが参加</small></span><span class="privacy-switch" aria-hidden="true"></span></label>` : ""}
    ${study?`<div class="study-start-actions"><button class="btn primary" data-study-order="unattempted" ${busy?"disabled":""}>未着手の問題を優先的に演習${icon("arrow")}</button><button class="btn" data-study-order="random" ${busy?"disabled":""}>ランダム演習${icon("arrow")}</button></div><p class="study-order-help">${studyProgressError?"未着手の件数を取得できませんでした。出題時に確認します。":studyProgressLoaded?`この分野の未着手：${[...questions.values()].filter(q=>(!studyField||q.field===studyField)&&!studyAttempted.has(q.id)).length} / ${fieldTotal}問。`:"未着手の件数を確認中…"}${!studyField&&distribution==='even'?"選んだ配分を保ち、各分野内で未着手の問題を優先します。":"まだ解答も回答の確認もしていない問題を優先します。"}不足分は演習済みから補います。後回しは未着手のままです。</p>`:`<button class="btn primary" data-act="${study || ai ? "solo-start" : selectedMode==="room" ? "create" : "random"}" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner mini"></span>接続中…' : icon(m.icon)+m.label+icon("arrow")}</button>`}
    ${selectedMode==="room" ? `<div class="divider"><span>部屋番号・招待リンクで参加</span></div><label class="field"><span>部屋番号（4桁）</span><div class="join"><input id="code" aria-label="部屋番号（4桁）" inputmode="numeric" maxlength="4" placeholder="0000" value="${esc(roomCodeDraft)}"/><button class="btn" data-act="join" ${busy ? "disabled" : ""}>対戦室に参加</button></div></label><label class="field"><span>招待キー（鍵付きルームのみ）</span><input id="invite-key" type="password" autocomplete="off" aria-label="招待キー" placeholder="招待リンクから開くと自動入力" value="${esc(roomInviteDraft)}"/></label>` : ""}
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}</section>${study ? `</details>` : ""}${study ? `<button class="panel catalog-entry" data-act="catalog"><span class="mode-icon">${icon("book")}</span><span><span class="eyebrow">QUESTION LIST</span><strong>過去問・問題と解説</strong><small>全${questions.size}問の問題文を閲覧。問題を押すと正解と解説を表示します。</small></span>${icon("arrow")}</button>` : ""}<p class="setup-footnote">${icon("check")}ログイン不要 · ${study ? "記録はこの端末に保存" : "名前だけで参加できます"} · 選択肢は問題ごとに並べ替えます</p>${selectedMode === "room" ? `<section id="public-rooms" class="panel public-rooms-panel">${renderPublicRooms()}</section>` : ""}`;
}

function renderMatchSize(): string {
  return `<fieldset class="match-size"><legend>マッチング人数</legend><div class="match-size-options">${MATCH_SIZES.map((o) => `<label class="distribution-option ${o.n === matchCapacity ? "on" : ""}"><input type="radio" name="match-size" value="${o.n}" ${o.n === matchCapacity ? "checked" : ""} ${busy ? "disabled" : ""}/><span><strong>${o.label}</strong><small>${o.sub}</small></span></label>`).join("")}</div></fieldset><p class="setup-hint">1問の制限時間は${MATCH_SECONDS}秒。全員が回答したら解説を${MATCH_REVEAL_SECONDS}秒表示して次の問題へ進みます。同じ人数を選んだ人どうしでマッチングし、全員の準備完了で開始。試合後はまず全問の解説を振り返れます。</p>`;
}

async function startSolo(mode: SoloMode = selectedMode === "ai" ? "ai" : "study", retryIds?: string[], course=false, order:StudyOrder=studyOrder): Promise<void> {
  if (busy) return;
  playerName = playerName.trim().slice(0, 12);
  if (mode === "ai" && !playerName) {error=ERRORS.NAME_REQUIRED; render(); return;}
  if (mode === "ai" && (!Number.isInteger(answerSeconds) || answerSeconds < 5 || answerSeconds > 120)) {error=ERRORS.BAD_SETTINGS;render();return;}
  writeStore("gb.name",playerName);
  if (mode === "ai") writeStore("gb.seconds",String(answerSeconds));
  const available = [...questions.values()].filter(q => retryIds ? retryIds.includes(q.id) : mode === "ai" || !studyField || q.field === studyField).map(q=>q.id);
  // Fisher–Yates。特定の問題に偏らないようシャッフルする。
  for (let i=available.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  const orderedStudy=mode==="study"&&!retryIds;
  const ids=orderedStudy?available:available.slice(0,retryIds ? 100 : mode === "ai" ? 15 : studyCount); // サーバ側の上限は100問
  if (!ids.length) {error="この分野の問題はありません";render();return;}
  busy=true; error=""; render();
  try {
    await solo.start(mode,ids,mode === "study" ? 20 : answerSeconds,difficulty,course,orderedStudy?order:"given",orderedStudy?Math.min(studyCount,available.length):undefined,orderedStudy&&!studyField?distribution:undefined);
    savedStudyNotice='';
    if (channel) void supabase.removeChannel(channel);
    channel=null;realtimeState("off");match=null;mySeat=null;writeStore("gb.match",null,sessionStorage);
    view="home";
    window.scrollTo(0,0);
  } catch (e) {error=errorText(e); if (solo.active) solo.error=error;}
  finally {busy=false;render();}
}

function renderPlayers(m: MatchState, withMarks: boolean): string {
  return `<ul class="players">${m.players
    .map((p) => {
      const cls = [`seat-${p.seat % 8}`, p.seat === mySeat ? "me" : "", withMarks && p.mark === "o" ? "winner" : ""].join(" ");
      const mark = withMarks && p.mark ? `<em class="mark ${p.mark}">${p.mark === "o" ? "○" : p.mark === "x" ? "×" : "回答済"}</em>` : "";
      const score = m.status === "waiting" ? "" : `<span class="pts">${p.score}</span>`;
      const ready=m.status==="waiting"?`<em class="ready-badge ${p.ready?"is-ready":""}">${p.ready?"準備完了":"準備中"}</em>`:"";
      return `<li class="${cls}"><b>${esc(p.name)}</b>${score}${mark}${ready}</li>`;
    })
    .join("")}</ul>`;
}

function renderWaiting(m: MatchState): string {
  const allReady=m.players.length>=2&&m.players.every(p=>p.ready);
  const ownReady=!!m.players.find(p=>p.seat===mySeat)?.ready;
  const isHost = m.code !== null && (m.host_seat === mySeat || m.host_seat === null);
  const head = m.rematch_of
    ? `<h2>同じメンバーで再戦</h2><p class="lead">全員の参加と準備完了を待っています</p><ul class="rematch-roster">${(m.rematch_roster??[]).map(p=>`<li><b>${esc(p.name)}</b><span class="ready-badge ${p.ready?'is-ready':''}">${!p.joined?'未参加':p.ready?'準備完了':'準備中'}</span></li>`).join('')}</ul>`
    : m.code
    ? `<span class="room-status ${m.is_private ? "locked" : "open"}">${icon(m.is_private ? "lock" : "globe")}${m.is_private ? "鍵付きルーム · 招待のみ" : "公開ルーム · 誰でも参加"}</span><p class="eyebrow">部屋番号</p><div class="code">${m.code}</div>
       ${!m.is_private || m.invite_token ? `<div class="room-invite-actions"><button class="btn line" data-act="share">LINEで誘う</button><button class="btn" data-act="copy-room">招待リンクをコピー</button></div>` : ""}
       ${isHost ? `<button class="btn room-lock-btn" data-act="toggle-private" ${busy ? "disabled" : ""}>${icon(m.is_private ? "globe" : "lock")}${m.is_private ? "鍵を外して公開する" : "鍵をかけて招待制にする"}</button><p class="room-privacy-note">${m.is_private ? "公開一覧には表示されません。招待リンクで同級生を誘えます。" : "公開一覧に表示されています。鍵をかけると、これからの参加は招待リンクが必要になります。"}参加済みの人はそのまま遊べます。</p>` : ""}`
    : `<h2>対戦相手を探しています</h2>
       <p class="lead">${
         m.capacity !== null
           ? `${m.players.length<m.capacity?`あと${m.capacity-m.players.length}人の参加と、全員の準備完了を待っています`:"全員の準備完了を待っています"}`
           : m.phase_ends_at
             ? `あと<span data-count></span>秒で開始`
             : "2人以上がそろい、全員の準備完了後に10秒で開始します"
       }</p>
       ${m.phase_ends_at ? `<div class="timer"><i data-bar></i></div>` : `<div class="spinner"></div>`}`;
  const action = m.rematch_of ? "" : m.code
    ? isHost
      ? `<button class="btn primary" data-act="start" ${busy || !allReady ? "disabled" : ""}>${m.players.length < 2 ? "もう1人の参加を待っています" : allReady?m.players.length+"人で開始":"全員の準備完了を待っています"}</button>`
      : `<p class="lead">部屋を作った人が開始するのを待っています</p>`
    : "";
  return `
    <section class="panel center waiting-panel">
      <p class="eyebrow">${m.code ? "BATTLE ROOM" : "MATCHMAKING"}</p>
      ${head}
      ${m.code?`<p class="room-field-summary">出題分野：${esc(m.room_field||"すべての分野")} · 最大${m.q_total}問</p>`:""}
      <p class="count-label">参加者 ${m.players.length} / ${m.capacity ?? 8}・1問${m.answer_seconds}秒</p>
      ${m.rematch_of?"":renderPlayers(m,false)}
      <div class="ready-actions"><button class="btn ${ownReady?'ghost':'primary'}" data-act="ready" aria-pressed="${ownReady}" ${busy?'disabled':''}>${icon('check')}${ownReady?'準備完了を取り消す':'準備完了'}</button><p>準備完了 ${m.players.filter(p=>p.ready).length} / ${m.rematch_of?(m.rematch_roster?.length??m.players.length):m.players.length}人${m.rematch_of?'。全員が準備完了になると開始します。':m.code?'。全員がそろったら作成者が開始します。':'。全員の準備完了後に開始します。'}</p></div>
      ${action}
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
      <button class="btn ghost" data-act="leave">やめる</button>
    </section>`;
}

function renderPlay(m: MatchState): string {
  const q = m.q_id ? questions.get(m.q_id) : undefined;
  const top = `
    <div class="session-label"><span class="tag">${icon("swords")} ${isMatchmaking(m) ? "マッチング対戦" : "友だちと対戦"}</span><span>5問先取</span></div>
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
  const choices = choiceOrder(m.id,m.q_index,q.id,q.choices.length)
    .map((i, pos) => {
      const cls = [
        reveal?.answer === i ? "correct" : "",
        mine === i && reveal && reveal.answer !== i ? "wrong" : "",
        mine === i ? "mine" : "",
      ].join(" ");
      return `<li><button class="choice ${cls}" data-choice="${i}" ${locked ? "disabled" : ""}><span class="num">${pos + 1}</span><span>${esc(q.choices[i])}</span></button></li>`;
    })
    .join("");
  let footer = "";
  if (reveal) {
    const [head, ...body] = reveal.explanation.split(/\n{2,}/);
    const banner = myMark() === "o" ? "あなたは正解！" : myMark() === null ? "時間切れ" : "不正解…";
    const correct = m.players.filter((p) => p.mark === "o").map((p) => `${esc(p.name)} さん`);
    footer = `
      <section class="reveal ${myMark() === "o" ? "win" : ""}">
        <p class="banner">${banner}</p>
        <p class="note">${correct.length ? `正解者：${correct.join("、")}` : "正解者なし"}</p>
        <div class="expl">${richText(head)}${body[0] ? richText(body[0]) : ""}</div>
        <div class="confidence-actions">${currentBattleItem()?uncertainButton(currentBattleItem()!):""}</div>
        <p class="next">次へ <span data-count></span>秒（解説の全文は試合後に読めます）</p>
      </section>`;
  } else if (myMark() !== null) {
    footer = `<p class="note">回答しました。全員の回答を待っています…（${m.players.filter((p) => p.mark !== null).length}/${m.players.length}人）</p>`;
  }
  return `${top}
    <section class="question">
      <p>${esc(q.question)}</p>
      ${questionImage(q)}
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
  // 下位から順に発表し、最後に1位と勝者名を出す。再描画されても経過時間から続きを再生する。
  if (resultIntro?.id !== m.id) resultIntro = { id: m.id, at: Date.now() };
  const scores = [...new Set(ranked.map((p) => p.score))];
  const revealAt = (score: number): number => {
    const i = scores.indexOf(score);
    return 400 + (scores.length - 1 - i) * RESULT_STEP_MS + (i === 0 && scores.length > 1 ? 350 : 0);
  };
  const titleAt = revealAt(scores[0] ?? 0) + 550;
  const leadAt = titleAt + 400, restAt = leadAt + 300;
  const elapsed = Date.now() - resultIntro.at;
  const intro = elapsed < restAt + 600;
  const burst = `<span class="burst" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join("")}</span>`;
  return `
    <section class="panel center result-stage${intro ? " intro" : ""}" ${intro ? `style="--elapsed:${elapsed}ms;--rest-at:${restAt}ms"` : ""}>
      ${intro ? `<p class="result-skip">タップでスキップ</p>` : ""}
      <p class="eyebrow">試合終了</p>
      <h2 class="result-title" style="--at:${titleAt}ms">${title}</h2>
      ${mine ? `<p class="lead result-lead" style="--at:${leadAt}ms">あなたは ${rankOf(mine)}位（獲得得点 ${mine.score}点）</p>` : ""}
      <ol class="ranking">${ranked
        .map((p) => {
          const rank = rankOf(p);
          return `<li class="seat-${p.seat % 8} ${p.seat === mySeat ? "me" : ""} ${rank === 1 ? "champion" : ""}" style="--at:${revealAt(p.score)}ms"><span class="rank rank-${rank}">${rank}</span><b>${esc(p.name)}</b><span class="pts">${p.score}</span>${rank === 1 && intro ? burst : ""}</li>`;
        })
        .join("")}</ol>
      ${renderReviewCourse(review,"battle-retry",reviewLoaded,reviewLoading)}
      ${renderRematch(m)}
      ${error?`<p class="error" role="alert">${esc(error)}</p>`:""}
      <button class="btn" data-act="review" ${busy ? "disabled" : ""}>解説を振り返る</button>
      <button class="btn" data-act="random">もう一度ランダム対戦</button>
      <button class="btn ghost" data-act="leave">トップへ</button>
    </section>`;
}

function renderReview(): string {
  const saved = notebook().saved;
  const items = review
    .map((r, n) => {
      const q = questions.get(r.id);
      return q ? reviewCard(q, r, `第${n + 1}問・${esc(q.field)}`, !!saved[r.id]) : "";
    })
    .join("");
  return `
    <header class="hero small"><p class="eyebrow">振り返り</p><h1>${reviewLoaded ? `今回の${review.length}問` : "試合の振り返り"}</h1><p class="lead">問題と解説を確認したら、結果発表へ進めます。</p></header>
    ${match?.status === "finished" ? `<div class="panel review-to-result"><button class="btn primary" data-act="show-result">${icon("swords")}結果発表を見る${icon("arrow")}</button></div>` : ""}
    ${renderReviewCourse(review,"battle-retry",reviewLoaded,reviewLoading)}
    ${items}
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    ${match?renderRematch(match):""}
    <div class="panel">${match?.status === "finished" ? `<button class="btn primary" data-act="show-result">結果発表を見る</button>` : ""}<button class="btn" data-act="random">もう一度ランダム対戦</button><button class="btn ghost" data-act="leave">トップへ</button></div>`;
}

function renderNotebookEntry(): string {
  const n = notebook();
  const missed = Object.keys(n.missed).length;
  const uncertain = Object.keys(n.uncertain).length;
  const waiting = new Set([...Object.keys(n.missed),...Object.keys(n.uncertain)]).size;
  return `<button class="progress-panel notebook-entry" data-act="notebook"><div class="progress-intro"><span class="progress-icon">${icon("bookmark")}</span><div><p class="eyebrow">REVIEW NOTEBOOK<span class="notebook-badge">${waiting ? `復習待ち ${waiting}問` : "苦手克服"}</span></p><h2>復習ノートで、間違えた問題を得点源に。</h2><p>間違えた問題・回答を見た問題・正解しても迷った問題を集めます。解き直して弱点をつぶそう。</p></div></div><div class="progress-stats"><div><strong>${missed}<small>問</small></strong><span>誤答・わからない</span></div><div><strong>${uncertain}<small>問</small></strong><span>迷った問題</span></div><div><strong>${Object.keys(n.saved).length}<small>問</small></strong><span>保存した問題</span></div></div><span class="notebook-cta">復習する${icon("arrow")}</span></button>`;
}

function renderNotebook(): string {
  const n = notebook();
  const notes = Object.values(n[notebookTab]).filter((r) => questions.has(r.id)).sort((a, b) => b.at - a.at);
  const tab = (t: typeof notebookTab, label: string): string =>
    `<button class="notebook-tab ${t === notebookTab ? "on" : ""}" data-tab="${t}" aria-pressed="${t === notebookTab}">${label}<b>${Object.keys(n[t]).length}</b></button>`;
  const items = notes
    .map((r) => {
      const q = questions.get(r.id)!;
      const label = notebookTab === "missed" ? `${esc(q.field)} · ${r.misses}回要復習に記録` : notebookTab === "uncertain" ? `${esc(q.field)} · 正解したけど迷った` : esc(q.field);
      const remove = notebookTab === "missed" ? `<button class="btn ghost" data-note-remove="${esc(r.id)}">リストから外す</button>` : "";
      return reviewCard(q, r, label, !!n.saved[r.id], remove);
    })
    .join("");
  return `<header class="hero small"><p class="eyebrow">REVIEW NOTEBOOK</p><h1>復習ノート</h1><p class="lead">間違えた問題と「わからないので回答を見る」で確認した問題は自動で追加されます。正解後の「正解したけど迷った」と、振り返り画面の「保存」も使えます。</p></header>
    <div class="notebook-tabs">${tab("missed", "誤答・わからない")}${tab("uncertain", "迷った問題")}${tab("saved", "保存した問題")}</div>
    ${notes.length
      ? `<div class="panel"><button class="btn primary" data-act="note-practice" ${busy ? "disabled" : ""}>${icon("book")}この${notes.length}問を演習する${icon("arrow")}</button></div>${items}`
      : `<div class="rooms-empty"><span>${icon("bookmark")}</span><p>${notebookTab === "missed" ? "誤答・わからなかった問題はありません。" : notebookTab === "uncertain" ? "まだ迷った問題はありません。" : "まだ保存した問題はありません。"}</p><small>${notebookTab === "missed" ? "対戦・学習で間違えた問題と、回答を見た問題がここに集まります。" : notebookTab === "uncertain" ? "正解後や解説画面の「正解したけど迷った」から記録できます。" : "振り返り画面の「この問題を保存」から追加できます。"}</small></div>`}
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}`;
}

app.addEventListener("toggle", (e) => {
  const panel=e.target;
  if(panel instanceof HTMLDetailsElement && panel.id==="saved-study-panel" && panel.isConnected) savedStudiesExpanded=panel.open;
  if(panel instanceof HTMLDetailsElement && panel.id==="study-corner" && panel.isConnected) studyCornerExpanded=panel.open;
  const catalogId=panel instanceof HTMLDetailsElement && panel.isConnected?panel.dataset.catalogId:undefined;
  const catalogQuestion=catalogId?questions.get(catalogId):undefined;
  if(catalogQuestion) void toggleCatalogItem(catalogQuestion,(panel as HTMLDetailsElement).open);
}, true);

app.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === "name") playerName = input.value;
  if (input.id === "code") roomCodeDraft = input.value;
  if (input.id === "invite-key") roomInviteDraft = input.value;
  if (input.id === "seconds") answerSeconds = Number(input.value);
  if (input.id === "study-count") {studyCount = Number(input.value); (document.getElementById("study-count-value") as HTMLInputElement).value = input.value;}
  if (input.id === "study-count-value" && Number.isInteger(Number(input.value)) && Number(input.value) >= 1 && Number(input.value) <= Number(input.max)) {studyCount = Number(input.value); (document.getElementById("study-count") as HTMLInputElement).value = input.value;}
});
app.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === "room-private") roomPrivateDraft = input.checked;
  if (input.id === "capacity") capacity = Number(input.value) || null;
  if (input.name === "match-size") {matchCapacity=matchSize(input.value);writeStore("gb.match-capacity",String(matchCapacity));render();document.querySelector<HTMLInputElement>(`input[name="match-size"][value="${matchCapacity}"]`)?.focus();}
  if (input.id === "room-field") {roomFieldDraft=input.value;render();}
  if (input.name === "study-distribution") {distribution=studyDistribution(input.value);writeStore('gb.study-distribution',distribution);render();document.querySelector<HTMLInputElement>(`input[name="study-distribution"][value="${distribution}"]`)?.focus();}
  if (input.id === "study-field") {studyField = input.value; render();}
  if (input.id === "catalog-field") {setCatalogField(input.value);render();document.getElementById("catalog-field")?.focus();}
  // 範囲外・空欄のまま離れたら、直前の有効な値に戻す。
  if (input.id === "study-count-value") input.value = String(Math.min(studyCount, Number(input.max)));
  if (input.id === "difficulty") difficulty = input.value as Difficulty;
});
app.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest<HTMLButtonElement>("button")?.disabled) return;
  const sizeChoice=target.closest<HTMLElement>("[data-read-size]")?.dataset.readSize;
  if(sizeChoice==="standard"||sizeChoice==="large"||sizeChoice==="xlarge"){setReadSize(sizeChoice);return;}
  const imageId=target.closest<HTMLElement>("[data-image-id]")?.dataset.imageId;
  if(imageId){const q=questions.get(imageId);if(q)imageViewer.open(q,solo.active?solo.state?.mode==="ai"&&solo.state.phase!=="finished":match?.status==="playing");return;}
  const themeChoice = target.closest<HTMLElement>("[data-theme-choice]")?.dataset.themeChoice;
  if (themeChoice === "light" || themeChoice === "dark") {setTheme(themeChoice); return;}
  const mode = target.closest<HTMLElement>("[data-mode]")?.dataset.mode as Mode | undefined;
  if (mode && mode in modeInfo) {selectedMode=mode;if(mode==="study")studyCornerExpanded=false;view="setup";error="";render();window.scrollTo(0,0);if (mode === "room") void refreshPublicRooms();if(mode==="study")void refreshStudyProgress();return;}
  const soloChoice = target.closest<HTMLElement>("[data-solo-choice]");
  if (soloChoice) return void solo.act("answer",Number(soloChoice.dataset.soloChoice));
  const choice = target.closest<HTMLElement>("[data-choice]");
  if (choice) return void answer(Number(choice.dataset.choice));
  if (resultIntro && target.closest(".result-stage.intro") && !target.closest("button,a,input,select,label,[data-act]")) {resultIntro.at = 0;render();return;}
  const act = target.closest<HTMLElement>("[data-act]")?.dataset.act;
  const uncertainId=target.closest<HTMLElement>("[data-uncertain]")?.dataset.uncertain;
  if (uncertainId) {
    const current=solo.active?solo.currentReviewItem():currentBattleItem();
    const pool=solo.active?[...(current?[current]:[]),...solo.review]:view==="review" || view==="match"?[...(current?[current]:[]),...review]:Object.values(notebook()[notebookTab]);
    const item=pool.find(r=>r.id===uncertainId);
    if (item) toggleUncertain(item);
    render();return;
  }
  const saveId = target.closest<HTMLElement>("[data-save]")?.dataset.save;
  if (saveId) {
    const n = notebook();
    const pool = solo.reviewing ? solo.review : view === "review" ? review : Object.values(n[notebookTab]);
    const item = pool.find((r) => r.id === saveId);
    if (item) toggleSaved(item);
    return render();
  }
  const tab = target.closest<HTMLElement>("[data-tab]")?.dataset.tab;
  if (tab === "missed" || tab === "saved" || tab === "uncertain") {notebookTab = tab; return render();}
  const removeId = target.closest<HTMLElement>("[data-note-remove]")?.dataset.noteRemove;
  if (removeId) {removeMissed(removeId); return render();}
  const catalogRetry=questions.get(target.closest<HTMLElement>("[data-catalog-retry]")?.dataset.catalogRetry??"");
  if (catalogRetry) return void toggleCatalogItem(catalogRetry,true);
  if (busy || solo.busy) return;
  const resumeId=target.closest<HTMLElement>('[data-resume-study]')?.dataset.resumeStudy;
  if(resumeId){void resumeStudy(resumeId);return;}
  const orderChoice=target.closest<HTMLElement>('[data-study-order]')?.dataset.studyOrder;
  if(orderChoice==='unattempted'||orderChoice==='random'){studyOrder=orderChoice;writeStore('gb.study-order',studyOrder);void startSolo('study',undefined,false,studyOrder);return;}
  const publicRoomId=target.closest<HTMLElement>("[data-public-room]")?.dataset.publicRoom;
  if (publicRoomId) return void enter("join_public_room",publicRoomId);
  if (act === "friends") {friends.open();return;}
  if (act === "retry-connection") {void probeConnection();void friends.refresh(true);if(match)void tick();if(solo.active)void solo.tick();return;}
  if (act === "refresh-performance") return void refreshPerformance();
  if (act === "refresh-saved-studies") return void refreshSavedStudies();
  if (act === "battle-retry") return void startBattleCourse();
  if (act === "reload-battle-review") return void (solo.active?solo.loadReview():prepareBattleReview());
  if (act === "refresh-rooms") return void refreshPublicRooms();
  if (act === "toggle-private") return void toggleRoomPrivacy();
  if (act === "copy-room") return void copyRoomLink();
  if (act === "random") void enter("find_match");
  else if (act === "create") void enter("create_room");
  else if (act === "join") void enter("join_room");
  else if (act === "ready") void setReady();
  else if (act === "rematch") void rematch();
  else if (act === "start") void startRoom();
  else if (act === "share") shareRoom();
  else if (act === "review") void openReview();
  else if (act === "show-result") {view = "match"; error = ""; render(); window.scrollTo(0, 0);}
  else if (act === "leave" || act === "study-pause") void leave();
  else if (act === "notebook") {view = "notebook"; error = ""; render(); window.scrollTo(0, 0);}
  else if (act === "catalog") {view = "catalog"; error = ""; render(); window.scrollTo(0, 0);}
  else if (act === "catalog-back") {view = "setup"; selectedMode = "study"; error = ""; render(); window.scrollTo(0, 0);}
  else if (act === "note-practice") void startSolo("study", Object.keys(notebook()[notebookTab]));
  else if (act === "solo-start") void startSolo();
  else if (act === "solo-view-answer") {void solo.act("view-answer").then(()=>{if(solo.state?.phase==="reveal"){const heading=document.getElementById("solo-reveal-heading");heading?.scrollIntoView({block:"start"});heading?.focus({preventScroll:true});}});}
  else if (act === "solo-defer") {void solo.act("defer");window.scrollTo(0,0);}
  else if (act === "solo-next") {void solo.act("next");window.scrollTo(0,0);}
  else if (act === "solo-review") {void solo.act("review");window.scrollTo(0,0);}
  else if (act === "solo-retry") {const ids=solo.retryIds(); void startSolo("study",ids);}
  else if (act === "solo-again") {selectedMode=solo.state?.mode === "ai" ? "ai" : "study"; if (solo.state) {difficulty=solo.state.difficulty;answerSeconds=solo.state.answer_seconds;} solo.stop();view="setup";if(selectedMode==="study")void refreshStudyProgress();render();window.scrollTo(0,0);}
  else if (act === "reload") location.reload();
});
app.addEventListener("keydown", (e) => {
  const id = (e.target as HTMLElement).id;
  if (e.key === "Enter" && id === "name" && !busy) {
    if (selectedMode === "study" || selectedMode === "ai") void startSolo();
    else void enter(selectedMode === "room" ? "create_room" : "find_match");
  }
  if (e.key === "Enter" && (id === "code" || id === "invite-key")) void enter("join_room");
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
  void refreshPerformance();void refreshStudyProgress();void refreshSavedStudies();void friends.refresh(true);
  await solo.resume();
  if (solo.active) {render();return;}
  const resumeId = readStore("gb.match", sessionStorage);
  if (resumeId) {
    const s = await call<MatchState | null>("get_match", { p_match: resumeId, p_device: deviceId }).catch(() => null);
    if (s && s.my_seat !== null) {
      subscribe(s.id);
      view = "match";
      applyState(s);
      return;
    }
  }
  render();
  if (view === "setup" && selectedMode === "room") void refreshPublicRooms();
}

void boot().catch(() => {
  app.innerHTML = `${renderHeader(false)}<section class="panel center"><h1>読み込みできませんでした</h1><p>接続を確認して、もう一度お試しください。</p><button class="btn primary" data-act="reload">再読み込み</button></section>`;
});
