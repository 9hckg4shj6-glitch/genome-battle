// 管理画面。Supabase Auth でログインした管理者にだけ、サーバー（get_admin_dashboard）が利用状況を返す。
// このページのプログラムは公開されているが、管理者以外にはサーバーがデータを返さない（024_admin_dashboard.sql）。
// アプリ本体の画面・端末保存とは切り離し、ログイン状態だけをこのページ用の鍵で保存する。
import { createClient, type Session } from "@supabase/supabase-js";
import "./admin.css";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
  auth: { persistSession: true, storageKey: "gb-admin-auth", autoRefreshToken: true, detectSessionInUrl: true },
});

type Activity = "study" | "ai" | "battle" | null;
interface User { name: string; code: string; last_seen: string; first_seen: string | null; online: boolean; activity: Activity; answers: number; answers_today: number; questions: number; }
interface Counts { online: number; studying: number; ai: number; battle: number; }
interface Dashboard {
  now: Counts;
  active: { h1: number; today: number; d7: number; total: number; new_today: number; new_d7: number };
  today: { answers: number; studies: number; ai: number; battles: number };
  hourly: (Counts & { at: string })[];
  daily: { day: string; online: number }[];
  peak: { online: number; at: string } | null;
  sampled_since: string | null;
  db: { connections: number; max: number };
  users: User[];
  server_now: string;
}

// 無料プランのリアルタイム同時接続の上限（目安）。アプリは1端末につき1接続。
const REALTIME_LIMIT = 200;
const REFRESH_MS = 20000;

const root = document.querySelector<HTMLElement>("#admin")!;
let session: Session | null = null;
let data: Dashboard | null = null;
let loadError = "";
let loading = false;
let loginError = "";
let busy = false;
let filter: "all" | "online" | "today" | "d7" = "online";
let query = "";

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number): string => n.toLocaleString("ja-JP");
const tokyo = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", ...opts });
const fmtTime = tokyo({ month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtHour = tokyo({ hour: "numeric" });
const fmtDay = tokyo({ month: "numeric", day: "numeric", weekday: "short" });
const todayKey = (): string => tokyo({ year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/\//g, "-");

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "いま";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}日前`;
  return fmtTime.format(new Date(iso));
}

// ---------- ログイン ----------
// ログイン前は普通のログイン欄だけを出す（登録の入口や「管理」の表示は出さない）。管理者のアカウントは登録済み。
function renderLogin(): void {
  root.innerHTML = `<section class="login card">
    <h1>ログイン</h1>
    <form id="login-form" novalidate>
      <label class="field"><span>メールアドレス</span><input name="email" type="email" autocomplete="username" required /></label>
      <label class="field"><span>パスワード</span><input name="password" type="password" autocomplete="current-password" required /></label>
      <div role="status" class="error">${esc(loginError)}</div>
      <button class="btn primary" ${busy ? "disabled" : ""}>ログイン</button>
    </form>
  </section>`;
}

const authMessage = (m: string): string =>
  /invalid login credentials/i.test(m) ? "メールアドレスかパスワードが違います。"
  : /email not confirmed/i.test(m) ? "メールアドレスの確認がまだです。"
  : /rate limit|too many/i.test(m) ? "試行が多すぎます。しばらく待ってからやり直してください。"
  : "ログインできませんでした。通信を確認して、もう一度お試しください。";

async function submitLogin(form: HTMLFormElement): Promise<void> {
  const f = new FormData(form);
  const email = String(f.get("email") ?? "").trim().toLowerCase(), password = String(f.get("password") ?? "");
  loginError = "";
  if (!email || !password) { loginError = "メールアドレスとパスワードを入力してください。"; renderLogin(); return; }
  busy = true; renderLogin();
  try {
    const { data: d, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session = d.session;
  } catch (e) { loginError = authMessage(e instanceof Error ? e.message : String(e)); }
  finally { busy = false; }
  if (session) void load(); else renderLogin();
}

// ---------- 集計の取得 ----------
async function load(): Promise<void> {
  if (loading || !session) return;
  loading = true;
  if (!data) root.innerHTML = '<p class="loading">読み込み中…</p>';
  try {
    const { data: d, error } = await supabase.rpc("get_admin_dashboard");
    if (error) throw new Error(error.message);
    data = d as Dashboard; loadError = "";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    loadError = /ADMIN_ONLY/.test(m) ? "ADMIN_ONLY" : "最新の状況を取得できませんでした。前回の値を表示しています。";
  } finally { loading = false; }
  render();
}

// ---------- 描画 ----------
const tile = (label: string, value: number, note = "", big = false, unit = ""): string =>
  `<div class="tile ${big ? "big" : ""}"><span>${label}</span><strong>${num(value)}${unit ? `<em>${unit}</em>` : ""}</strong>${note ? `<small>${note}</small>` : ""}</div>`;

// 1系列の棒グラフ。棒より広い列全体にツールチップを付け、表でも読めるようにする。
function bars(id: string, title: string, rows: { label: string; tip: string; value: number; tick: boolean }[], unit: string): string {
  const max = Math.max(1, ...rows.map(r => r.value));
  const top = Math.max(1, Math.ceil(max / (max > 10 ? 5 : 1)) * (max > 10 ? 5 : 1));
  return `<figure class="chart" id="${id}">
    <figcaption>${title}</figcaption>
    <div class="plot" role="img" aria-label="${esc(title)}。最大 ${num(max)}${unit}">
      <span class="y-top">${num(top)}</span><span class="y-zero">0</span>
      <div class="cols">${rows.map(r => `<div class="col" data-tip="${esc(`${r.tip}：${num(r.value)}${unit}`)}"><i style="height:${(100 * r.value / top).toFixed(1)}%" class="${r.value ? "" : "zero"}"></i><b>${r.tick ? esc(r.label) : ""}</b></div>`).join("")}</div>
    </div>
    <details><summary>表で見る</summary><table><thead><tr><th>時刻</th><th>最大同時人数</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.tip)}</td><td>${num(r.value)}${unit}</td></tr>`).join("")}</tbody></table></details>
  </figure>`;
}

function hourlyRows(d: Dashboard) {
  const by = new Map(d.hourly.map(h => [Date.parse(h.at), h.online]));
  const now = new Date(d.server_now); now.setUTCMinutes(0, 0, 0);
  return Array.from({ length: 24 }, (_, i) => {
    const t = new Date(now.getTime() - (23 - i) * 3600000);
    const h = Number(fmtHour.format(t).replace(/\D/g, ""));
    return { label: `${h}時`, tip: `${fmtDay.format(t)} ${h}時台`, value: by.get(t.getTime()) ?? 0, tick: h % 3 === 0 };
  });
}
function dailyRows(d: Dashboard) {
  const by = new Map(d.daily.map(x => [x.day, x.online]));
  const today = new Date(`${todayKey()}T12:00:00+09:00`);
  return Array.from({ length: 14 }, (_, i) => {
    const t = new Date(today.getTime() - (13 - i) * 86400000);
    const key = tokyo({ year: "numeric", month: "2-digit", day: "2-digit" }).format(t).replace(/\//g, "-");
    return { label: tokyo({ day: "numeric" }).format(t), tip: fmtDay.format(t), value: by.get(key) ?? 0, tick: true };
  });
}

const ACTIVITY: Record<Exclude<Activity, null>, string> = { study: "学習中", ai: "AI対戦中", battle: "対人戦中" };
function filteredUsers(d: Dashboard): User[] {
  const today = Date.parse(`${todayKey()}T00:00:00+09:00`), week = Date.now() - 7 * 86400000;
  const q = query.trim().toLowerCase();
  return d.users.filter(u =>
    (filter === "all" || (filter === "online" ? u.online : filter === "today" ? Date.parse(u.last_seen) >= today : Date.parse(u.last_seen) >= week))
    && (!q || u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q)));
}
function renderUsers(d: Dashboard): string {
  const list = filteredUsers(d);
  const shown = list.slice(0, 500);
  const rows = shown.map(u => `<tr>
      <td class="name"><strong>${esc(u.name)}</strong><small>${esc(u.code)}</small></td>
      <td><span class="state ${u.online ? "on" : ""}"><i></i>${u.activity ? ACTIVITY[u.activity] : u.online ? "オンライン" : "オフライン"}</span></td>
      <td data-label="最終利用">${esc(ago(u.last_seen))}</td>
      <td data-label="初回">${u.first_seen ? esc(fmtTime.format(new Date(u.first_seen))) : "—"}</td>
      <td data-label="今日の解答" class="n">${num(u.answers_today)}</td>
      <td data-label="累計の解答" class="n">${num(u.answers)}</td>
      <td data-label="取り組んだ問題" class="n">${num(u.questions)}</td></tr>`).join("");
  return `<p class="muted users-count">${num(list.length)}人${list.length > shown.length ? `（先頭${shown.length}人を表示）` : ""}</p>
    ${shown.length ? `<div class="table-wrap"><table class="users"><thead><tr><th>名前</th><th>状態</th><th>最終利用</th><th>初回</th><th class="n">今日の解答</th><th class="n">累計の解答</th><th class="n">取り組んだ問題</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="empty">該当する利用者はいません。</p>'}`;
}

function render(): void {
  if (!session) { renderLogin(); return; }
  if (loadError === "ADMIN_ONLY") {
    root.innerHTML = `<section class="login card"><h1>表示できるページがありません</h1><p class="muted">このアカウントでは利用できません。</p><button class="btn" data-act="logout">ログアウト</button></section>`;
    return;
  }
  const d = data;
  if (!d) { root.innerHTML = `<p class="loading">${esc(loadError || "読み込み中…")}</p>`; return; }
  const focused = document.activeElement?.id === "user-search";
  const realtimePct = Math.round(100 * d.now.online / REALTIME_LIMIT), dbPct = Math.round(100 * d.db.connections / d.db.max);
  root.innerHTML = `<header class="top">
      <div><p class="eyebrow">ADMIN</p><h1>ゲノム対戦 管理</h1></div>
      <div class="top-actions"><small class="muted">${loading ? "更新中…" : `${esc(fmtTime.format(new Date(d.server_now)))} 時点 · 20秒ごとに更新`}</small><button class="btn" data-act="refresh">更新</button><button class="btn ghost" data-act="logout">ログアウト</button></div>
    </header>
    ${loadError ? `<p class="error" role="status">${esc(loadError)}</p>` : ""}
    <section class="tiles now">
      ${tile("いまオンライン", d.now.online, "直近90秒にアプリを表示", true)}
      ${tile("学習中", d.now.studying)}${tile("AI対戦中", d.now.ai)}${tile("対人戦中", d.now.battle)}
    </section>
    <section class="card"><h2>利用した端末</h2><div class="tiles">
      ${tile("直近1時間", d.active.h1)}${tile("今日", d.active.today, `うち初めて ${num(d.active.new_today)}`)}${tile("直近7日", d.active.d7, `うち初めて ${num(d.active.new_d7)}`)}${tile("累計", d.active.total)}
    </div></section>
    <section class="card"><h2>今日の利用</h2><div class="tiles">
      ${tile("学習の解答", d.today.answers, "", false, "問")}${tile("学習の開始", d.today.studies, "", false, "回")}${tile("AI対戦", d.today.ai, "", false, "試合")}${tile("対人戦", d.today.battles, "", false, "試合")}
    </div></section>
    <section class="card"><h2>最大同時人数</h2>
      <p class="muted">${d.peak ? `記録上の最大：<b>${num(d.peak.online)}人</b>（${esc(fmtTime.format(new Date(d.peak.at)))}）` : "まだ記録がありません。"}${d.sampled_since ? ` · ${esc(fmtTime.format(new Date(d.sampled_since)))}から記録` : ""} · アプリを開いている端末が1分ごとに記録します</p>
      <div class="charts">${bars("hourly", "過去24時間（1時間ごとの最大）", hourlyRows(d), "人")}${bars("daily", "過去14日（1日ごとの最大）", dailyRows(d), "人")}</div>
    </section>
    <section class="card"><h2>サーバーの余裕</h2>
      <div class="meters">
        <div class="meter"><span>リアルタイム接続（無料プランの上限 約${REALTIME_LIMIT}）</span><strong>${num(d.now.online)} / ${REALTIME_LIMIT}</strong><span class="bar ${realtimePct >= 80 ? "warn" : ""}"><i style="width:${Math.min(100, realtimePct)}%"></i></span></div>
        <div class="meter"><span>データベース接続</span><strong>${num(d.db.connections)} / ${num(d.db.max)}</strong><span class="bar ${dbPct >= 80 ? "warn" : ""}"><i style="width:${Math.min(100, dbPct)}%"></i></span></div>
      </div>
      <p class="muted">2026年10月13日の負荷テストでは、120端末の同時利用で失敗0件でした。オンラインが160人を超えるようなら、上限への備えを検討してください。</p>
    </section>
    <section class="card"><h2>利用者一覧</h2>
      <div class="user-tools">
        <div class="chips" role="group" aria-label="絞り込み">${(["online", "today", "d7", "all"] as const).map(f => `<button class="chip ${filter === f ? "on" : ""}" data-filter="${f}" aria-pressed="${filter === f}">${{ online: "オンライン", today: "今日", d7: "7日以内", all: "すべて" }[f]}</button>`).join("")}</div>
        <input id="user-search" type="search" placeholder="名前・フレンドコードで検索" value="${esc(query)}" />
      </div>
      <div id="users">${renderUsers(d)}</div>
      <p class="muted">名前はアプリで設定されたニックネーム（未設定は「ゲストプレイヤー」）です。1台の端末を1人として数えるため、スマホとPCを使い分ける人は2人と数えます。</p>
    </section>
    <div class="tip" id="tip" role="tooltip" hidden></div>`;
  if (focused) { const s = document.querySelector<HTMLInputElement>("#user-search"); s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); }
}

// ---------- 操作 ----------
root.addEventListener("submit", e => {
  const form = e.target as HTMLFormElement;
  if (form.id === "login-form") { e.preventDefault(); void submitLogin(form); }
});
root.addEventListener("click", async e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-filter]");
  if (!el) return;
  if (el.dataset.filter) { filter = el.dataset.filter as typeof filter; render(); return; }
  const act = el.dataset.act;
  if (act === "refresh") void load();
  else if (act === "logout") { await supabase.auth.signOut(); session = null; data = null; loadError = ""; renderLogin(); }
});
root.addEventListener("input", e => {
  const el = e.target as HTMLInputElement;
  if (el.id === "user-search" && data) { query = el.value; document.querySelector("#users")!.innerHTML = renderUsers(data); }
});
// グラフの列にツールチップ。
root.addEventListener("pointermove", e => {
  const tip = document.querySelector<HTMLElement>("#tip");
  if (!tip) return;
  const col = (e.target as HTMLElement).closest<HTMLElement>(".col");
  if (!col) { tip.hidden = true; return; }
  tip.textContent = col.dataset.tip ?? ""; tip.hidden = false;
  const r = col.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
  tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 8}px`;
});
root.addEventListener("pointerleave", () => { const tip = document.querySelector<HTMLElement>("#tip"); if (tip) tip.hidden = true; });

setInterval(() => { if (session && document.visibilityState === "visible") void load(); }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (session && document.visibilityState === "visible") void load(); });
supabase.auth.onAuthStateChange((_event, s) => { session = s; if (!s) { data = null; renderLogin(); } });

void (async () => {
  session = (await supabase.auth.getSession()).data.session;
  if (session) void load(); else renderLogin();
})();
