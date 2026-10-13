import { call, serverNow } from "./api";
import { esc, icon, readStore, writeStore } from "./ui";

// 端末の引き継ぎ。サーバーの記録（学習レベル・解答記録・保存した学習・成績・フレンド）はすべて
// プレイヤー識別子（gb.device）に紐づくので、識別子と端末保存のデータをまとめて短いコードで渡す。
// 受け取った端末は、それまでの自分のデータを gb.transfer-backup に退避してから置き換え、読み込み直す。

// 端末そのものの状態（追加済みの表示・更新の再試行）は移さない。
const LOCAL_ONLY = new Set(["gb.device", "gb.install-dismissed", "gb.update-tried", "gb.transfer-backup"]);
// タブを開いている間だけの進行中の対戦・学習。引き継いだ後は前の識別子の進行を指すので消す。
const SESSION_KEYS = ["gb.solo", "gb.solo-course", "gb.match", "gb.match-wait", "gb.ai-fallback"];
const BACKUP_KEY = "gb.transfer-backup";
const DONE_KEY = "gb.transfer-done";
const CODE_LENGTH = 12;

interface Payload { v: 1; at: string; items: Record<string, string> }
interface Backup { device: string; at: string; items: Record<string, string> }

const messages: Record<string, string> = {
  TRANSFER_NOT_FOUND: "コードが見つからないか、期限が切れています。発行した端末でコードを確かめて、もう一度入力してください。",
  TRANSFER_TOO_LARGE: "この端末のデータが大きすぎて送れません。復習ノートを整理してから、もう一度発行してください。",
};
const errorText = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  const code = Object.keys(messages).find((k) => msg.includes(k));
  return code ? messages[code] : "通信できませんでした。電波の良い場所でもう一度お試しください。";
};

const storedKeys = (): string[] => {
  try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").filter((k) => k.startsWith("gb.") && !LOCAL_ONLY.has(k)); }
  catch { return []; }
};
const snapshot = (): Record<string, string> => Object.fromEntries(storedKeys().map((k) => [k, readStore(k) ?? ""]));
export const normalizeCode = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z]/g, "");
export const formatCode = (s: string): string => normalizeCode(s).replace(/(.{4})(?=.)/g, "$1-");

// 端末保存のデータを丸ごと入れ替え、識別子を切り替えて読み込み直す。
function replaceWith(device: string, items: Record<string, string>): void {
  storedKeys().forEach((k) => writeStore(k, null));
  Object.entries(items).forEach(([k, v]) => { if (k.startsWith("gb.") && !LOCAL_ONLY.has(k) && typeof v === "string") writeStore(k, v); });
  writeStore("gb.device", device);
  SESSION_KEYS.forEach((k) => writeStore(k, null, sessionStorage));
  // 読み込み直した後はスタート画面を出さず、ホームで完了を知らせる。
  writeStore("gb.title-seen", "1", sessionStorage);
}

function readBackup(): Backup | null {
  try {
    const b = JSON.parse(readStore(BACKUP_KEY) ?? "null") as Partial<Backup> | null;
    return b && typeof b.device === "string" && typeof b.at === "string" && b.items && typeof b.items === "object" ? b as Backup : null;
  } catch { return null; }
}

// 引き継ぎ・元に戻した直後のお知らせ。ホームに1回だけ出す。
export function takeTransferNotice(): string {
  const v = readStore(DONE_KEY, sessionStorage);
  writeStore(DONE_KEY, null, sessionStorage);
  return v === "restored" ? "引き継ぐ前のこの端末の記録に戻しました。" : v ? "引き継ぎが完了しました。前の端末の記録で続けられます。" : "";
}

export class TransferController {
  private issued: { code: string; expiresAt: number } | null = null;
  private expired = false;
  private issuing = false;
  private redeeming = false;
  private confirming = false;
  private restoring = false;
  private draft = "";
  private sendError = "";
  private receiveError = "";
  private notice = "";
  private timer = 0;
  constructor(private device: string, private rerender: () => void) {}

  get busy(): boolean { return this.issuing || this.redeeming; }

  // 画面を開くたびに入力途中の確認を閉じる（発行済みのコードは期限まで残す）。
  open(): void { this.confirming = false; this.restoring = false; this.sendError = ""; this.receiveError = ""; this.notice = ""; }

  private left(): number { return this.issued ? Math.max(0, Math.ceil((this.issued.expiresAt - Date.now()) / 1000)) : 0; }
  private clock(): string { const s = this.left(); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  private tick(): void {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (!this.issued) { clearInterval(this.timer); return; }
      if (this.left() <= 0) { clearInterval(this.timer); this.issued = null; this.expired = true; this.rerender(); return; }
      document.querySelectorAll<HTMLElement>("[data-transfer-left]").forEach((el) => (el.textContent = this.clock()));
    }, 1000);
  }

  private async issue(): Promise<void> {
    if (this.busy) return;
    this.issuing = true; this.sendError = ""; this.notice = ""; this.expired = false; this.rerender();
    try {
      const payload: Payload = { v: 1, at: new Date().toISOString(), items: snapshot() };
      const r = await call<{ code: string; expires_at: string; server_now: string }>("create_device_transfer", { p_device: this.device, p_payload: payload });
      // サーバー時刻との差を除いて、端末の時計で残り時間を数える。
      this.issued = { code: r.code, expiresAt: Date.now() + (Date.parse(r.expires_at) - Date.parse(r.server_now)) };
      this.tick();
    } catch (e) { this.sendError = errorText(e); }
    finally { this.issuing = false; this.rerender(); }
  }

  private async cancel(): Promise<void> {
    if (this.busy) return;
    this.issued = null; clearInterval(this.timer); this.notice = "コードを無効にしました。";
    this.rerender();
    try { await call("cancel_device_transfer", { p_device: this.device }); }
    catch { this.notice = "コードを無効にできませんでした。15分たつと自動で使えなくなります。"; this.rerender(); }
  }

  private async copy(): Promise<void> {
    if (!this.issued) return;
    try { await navigator.clipboard.writeText(formatCode(this.issued.code)); this.notice = "コードをコピーしました。"; }
    catch { this.notice = "コピーできませんでした。コードを見ながら新しい端末に入力してください。"; }
    this.rerender();
  }

  private async share(): Promise<void> {
    if (!this.issued || !navigator.share) return;
    try { await navigator.share({ title: "ゲノム対戦 引き継ぎコード", text: `ゲノム対戦の引き継ぎコード：${formatCode(this.issued.code)}（15分間・1回だけ有効）` }); }
    catch { /* 共有をやめたときは何もしない */ }
  }

  // 「引き継ぐ」→ 置き換えの確認 → コードを使ってデータを受け取り、読み込み直す。
  private ask(): void {
    const input = document.querySelector<HTMLInputElement>("#transfer-code");
    this.draft = normalizeCode(input?.value ?? this.draft);
    this.receiveError = "";
    if (this.draft.length !== CODE_LENGTH) this.receiveError = `コードは${CODE_LENGTH}文字です（ハイフンは入れなくてもかまいません）。`;
    else if (this.issued && this.draft === this.issued.code) this.receiveError = "この端末で発行したコードです。新しい端末で入力してください。";
    else this.confirming = true;
    this.rerender();
    if (this.receiveError) document.querySelector<HTMLInputElement>("#transfer-code")?.focus();
  }

  private async redeem(): Promise<void> {
    if (this.busy) return;
    this.redeeming = true; this.receiveError = ""; this.rerender();
    try {
      const r = await call<{ device_id: string; payload: Partial<Payload> }>("redeem_device_transfer", { p_code: this.draft });
      const items = r.payload?.items && typeof r.payload.items === "object" ? r.payload.items : {};
      if (r.device_id !== this.device) {
        const backup: Backup = { device: this.device, at: new Date(serverNow()).toISOString(), items: snapshot() };
        replaceWith(r.device_id, items);
        writeStore(BACKUP_KEY, JSON.stringify(backup));
      } else replaceWith(r.device_id, items);
      writeStore(DONE_KEY, "done", sessionStorage);
      location.reload();
    } catch (e) {
      this.redeeming = false; this.confirming = false; this.receiveError = errorText(e); this.rerender();
    }
  }

  private restore(): void {
    const b = readBackup();
    if (!b) return;
    replaceWith(b.device, b.items);
    writeStore(BACKUP_KEY, null);
    writeStore(DONE_KEY, "restored", sessionStorage);
    location.reload();
  }

  // 戻り値 true は、この画面の操作として処理したこと。
  act(action: string | undefined): boolean {
    if (!action?.startsWith("transfer-")) return false;
    if (action === "transfer-issue") void this.issue();
    else if (action === "transfer-cancel") void this.cancel();
    else if (action === "transfer-copy") void this.copy();
    else if (action === "transfer-share") void this.share();
    else if (action === "transfer-ask") this.ask();
    else if (action === "transfer-confirm") void this.redeem();
    else if (action === "transfer-back") { this.confirming = false; this.rerender(); }
    else if (action === "transfer-restore-ask") { this.restoring = true; this.rerender(); }
    else if (action === "transfer-restore-cancel") { this.restoring = false; this.rerender(); }
    else if (action === "transfer-restore") this.restore();
    else return false;
    return true;
  }
  input(value: string): void { this.draft = normalizeCode(value); }

  private renderSend(): string {
    const head = `<header><b>1</b><div><p class="eyebrow">いままで使っていた端末で</p><h2>引き継ぎコードを発行</h2></div></header>`;
    const error = this.sendError ? `<p class="error" role="alert">${esc(this.sendError)}</p>` : "";
    const notice = this.notice ? `<p class="transfer-notice" role="status">${esc(this.notice)}</p>` : "";
    if (this.issued) {
      return `<section class="panel transfer-card is-issued">${head}
        <div class="transfer-code" aria-label="引き継ぎコード ${esc(this.issued.code.split("").join(" "))}"><output>${esc(formatCode(this.issued.code))}</output><span>残り <b data-transfer-left>${this.clock()}</b> · 1回だけ使えます</span></div>
        <div class="transfer-actions"><button class="btn primary" data-act="transfer-copy">コードをコピー</button>${"share" in navigator ? `<button class="btn" data-act="transfer-share">共有する</button>` : ""}<button class="btn ghost" data-act="transfer-cancel">このコードを無効にする</button></div>
        ${notice}<p class="transfer-warn">${icon("lock")}<span>このコードを知っている人は、あなたの記録を引き継げます。<b>他の人に見せたり送ったりしないでください。</b></span></p></section>`;
    }
    return `<section class="panel transfer-card">${head}
      <p>この端末の記録を新しい端末へ送るための、12文字のコードを作ります。コードは<b>15分間・1回だけ</b>使えます。</p>
      ${this.expired ? `<p class="transfer-notice" role="status">コードの期限が切れました。もう一度発行してください。</p>` : notice}${error}
      <button class="btn primary transfer-main" data-act="transfer-issue" ${this.issuing ? "disabled" : ""}>${icon("sync")}${this.issuing ? "発行しています…" : "引き継ぎコードを発行する"}</button></section>`;
  }

  private renderReceive(): string {
    const head = `<header><b>2</b><div><p class="eyebrow">新しい端末で</p><h2>コードを入力して引き継ぐ</h2></div></header>`;
    if (this.confirming) {
      return `<section class="panel transfer-card is-confirm" aria-live="polite">${head}
        <p class="transfer-confirm-code">コード <b>${esc(formatCode(this.draft))}</b></p>
        <p class="transfer-warn is-strong">${icon("help")}<span><b>この端末の記録は、引き継いだ記録に置き換わります。</b>置き換える前の記録はこの端末に保存し、あとから「引き継ぐ前に戻す」で戻せます。</span></p>
        ${this.receiveError ? `<p class="error" role="alert">${esc(this.receiveError)}</p>` : ""}
        <div class="transfer-actions"><button class="btn primary" data-act="transfer-confirm" ${this.redeeming ? "disabled" : ""}>${icon("check")}${this.redeeming ? "引き継いでいます…" : "置き換えて引き継ぐ"}</button><button class="btn ghost" data-act="transfer-back" ${this.redeeming ? "disabled" : ""}>やめる</button></div></section>`;
    }
    return `<section class="panel transfer-card">${head}
      <p>いままで使っていた端末で発行したコードを入力します。</p>
      <div class="transfer-input"><label class="field"><span>引き継ぎコード（12文字）</span><input id="transfer-code" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" spellcheck="false" maxlength="20" placeholder="例：ABCD-EFGH-JKLM" value="${esc(formatCode(this.draft))}" ${this.receiveError ? 'aria-invalid="true" aria-describedby="transfer-error"' : ""}/></label>
      <button class="btn primary" data-act="transfer-ask">引き継ぐ${icon("arrow")}</button></div>
      ${this.receiveError ? `<p class="error" id="transfer-error" role="alert">${esc(this.receiveError)}</p>` : ""}</section>`;
  }

  private renderBackup(): string {
    const b = readBackup();
    if (!b) return "";
    const when = new Date(b.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const body = this.restoring
      ? `<p><b>いまの記録を、${esc(when)}に引き継ぐ前の記録に戻します。</b>引き継いだ記録は、前の端末やもう一度発行したコードから戻せます。</p><div class="transfer-actions"><button class="btn primary" data-act="transfer-restore">戻す</button><button class="btn ghost" data-act="transfer-restore-cancel">やめる</button></div>`
      : `<p>${esc(when)}に引き継ぐ前の、この端末の記録を保存しています。まちがえて引き継いだときは元に戻せます。</p><div class="transfer-actions"><button class="btn" data-act="transfer-restore-ask">引き継ぐ前に戻す</button></div>`;
    return `<section class="panel transfer-backup"><h2>${icon("back")}引き継ぐ前の記録</h2>${body}</section>`;
  }

  render(): string {
    const items = [
      ["chart", "学習レベル・試験準備度・分野の★"], ["check", "問題ごとの解答記録・未着手"], ["play", "保存した学習の続き"],
      ["trophy", "学習・AI・対人の成績"], ["bookmark", "復習ノート（間違えた・保存・迷った）"], ["book", "過去問の読んだ記録・しおり"],
      ["user", "フレンド・ニックネーム"], ["sun", "表示の設定・選んだ分野と出題方法"],
    ].map(([ic, label]) => `<li>${icon(ic)}<span>${label}</span></li>`).join("");
    return `<header class="setup-title transfer-title"><span class="mode-icon">${icon("phone")}</span><div><p class="eyebrow">DATA TRANSFER</p><h1>端末の引き継ぎ</h1><p class="lead">機種変更したとき、別のスマートフォン・タブレット・パソコンで続けたいときに。<b>いままでの記録をすべて</b>新しい端末へ移せます。</p></div></header>
      <section class="panel transfer-flow" aria-label="引き継ぎの流れ"><ol><li><span>${icon("phone")}</span><b>いままでの端末</b><small>コードを発行</small></li><li class="transfer-arrow" aria-hidden="true">${icon("arrow")}</li><li><span>${icon("lock")}</span><b>12文字のコード</b><small>15分間・1回だけ</small></li><li class="transfer-arrow" aria-hidden="true">${icon("arrow")}</li><li><span>${icon("phone")}</span><b>新しい端末</b><small>コードを入力</small></li></ol>
        <details class="transfer-items"><summary>引き継ぐもの</summary><ul>${items}</ul></details></section>
      <div class="transfer-grid">${this.renderSend()}${this.renderReceive()}</div>
      ${this.renderBackup()}
      <section class="panel install-notes"><h2>知っておきたいこと</h2><dl class="guide-defs">
        <div><dt>${icon("phone")}引き継いだ後は、新しい端末で</dt><dd>学習レベル・解答記録・成績・保存した学習・フレンドは、両方の端末で同じ記録として続きます。復習ノート・迷った・読んだ記録は端末ごとに保存されるため、引き継いだ後に前の端末で増やした分は移りません。新しい端末をメインにしてください。</dd></div>
        <div><dt>${icon("clock")}対戦・学習の途中なら</dt><dd>途中の学習は「学ぶ」の「保存した学習の続き」から新しい端末で再開できます。対戦は終えてから引き継いでください。</dd></div>
        <div><dt>${icon("globe")}LINEの中では引き継がない</dt><dd>LINEの中の画面に引き継ぐと、ブラウザやホーム画面のアイコンから開いたときに記録が見えません。新しい端末では、ホーム画面に追加したアイコン（またはSafari・Chrome）から開いてコードを入力してください。</dd></div>
        <div><dt>${icon("help")}コードの期限が切れた・失敗した</dt><dd>いままでの端末で、もう一度「引き継ぎコードを発行する」を押してください。発行し直すと、前のコードは使えなくなります。</dd></div>
      </dl></section>`;
  }
}
