import { supabase } from "./api";

// アプリを開いている端末を Realtime Presence で数える。同じ端末の複数タブは同じキーで1人にまとめる。
// 閉じた端末は Realtime の切断検知（数十秒）で自動的に外れる。
// Presence の一覧は誰でも購読できるので、キーに端末ID（各RPCの本人確認に使う値）をそのまま使わない。
// 端末IDから作ったハッシュ（元に戻せない）をキーにし、管理画面はサーバー（_presence_key）で同じ計算をして端末と結びつける。
let count: number | null = null;

export async function presenceKey(deviceId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`gb-presence:${deviceId}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ハッシュを計算できない環境では、タブごとの乱数をキーにする（人数には数えるが、管理画面では端末と結びつかない）。
async function keyFor(deviceId: string): Promise<string> {
  try { return await presenceKey(deviceId); }
  catch {
    try {
      const saved = sessionStorage.getItem("gb.presence-key");
      if (saved) return saved;
      const key = `tab-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;
      sessionStorage.setItem("gb.presence-key", key);
      return key;
    } catch { return `tab-${Math.random().toString(36).slice(2)}`; }
  }
}

export function renderOnlineCount(): string {
  const label = count === null ? "接続人数を確認中" : `いま ${count}人がオンライン`;
  return `<span class="online-count ${count === null ? "waiting" : ""}" role="status" aria-live="polite" title="このアプリを開いている端末の数"><i></i>${label}</span>`;
}

function changed(): void {
  const el = document.getElementById("online-count");
  if (el) el.innerHTML = renderOnlineCount();
}

export async function startPresence(deviceId: string): Promise<void> {
  const key = await keyFor(deviceId);
  const channel = supabase.channel("presence:app", { config: { presence: { key } } });
  channel
    .on("presence", { event: "sync" }, () => {
      // 自分の track が反映される前の同期では0人になるので、自分の分を数える。
      count = Math.max(1, Object.keys(channel.presenceState()).length);
      changed();
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      else {count = null;changed();}
    });
}
