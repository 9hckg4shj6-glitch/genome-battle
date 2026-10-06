import { supabase } from "./api";

// アプリを開いている端末を Realtime Presence で数える。同じ端末の複数タブは端末IDで1人にまとめる。
// 閉じた端末は Realtime の切断検知（数十秒）で自動的に外れる。
let count: number | null = null;

export function renderOnlineCount(): string {
  const label = count === null ? "接続人数を確認中" : `いま ${count}人がオンライン`;
  return `<span class="online-count ${count === null ? "waiting" : ""}" role="status" aria-live="polite" title="このアプリを開いている端末の数"><i></i>${label}</span>`;
}

function changed(): void {
  const el = document.getElementById("online-count");
  if (el) el.innerHTML = renderOnlineCount();
}

export function startPresence(deviceId: string): void {
  const channel = supabase.channel("presence:app", { config: { presence: { key: deviceId } } });
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
