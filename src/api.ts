import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key, { auth: { persistSession: false } });

export interface Player {
  seat: number;
  name: string;
  score: number;
  mark: "o" | "x" | null;
}

export interface MatchState {
  id: string;
  code: string | null;
  status: "waiting" | "playing" | "finished";
  phase: "countdown" | "question" | "reveal" | null;
  q_index: number;
  q_total: number;
  q_id: string | null;
  phase_ends_at: string | null;
  server_now: string;
  winner_seat: number | null;
  win_score: number;
  capacity: number | null;
  answer_seconds: number;
  version: number;
  host_seat: number | null;
  players: Player[];
  reveal: { answer: number; explanation: string } | null;
  my_seat?: number | null;
}

export interface ReviewItem {
  id: string;
  answer: number;
  explanation: string;
  my_choice: number | null;
}

// サーバ時刻 − 端末時刻。カウントダウン表示にだけ使う（勝敗は常にサーバが決める）。
let clockOffset = 0;
export const serverNow = (): number => Date.now() + clockOffset;

export async function call<T = MatchState>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sent = Date.now();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  const serverTime = (data as Partial<MatchState> | null)?.server_now;
  if (serverTime) clockOffset = Date.parse(serverTime) - (sent + Date.now()) / 2;
  return data as T;
}

export function listen(matchId: string, onState: (s: MatchState) => void, onLive: (live: boolean) => void): RealtimeChannel {
  return supabase
    .channel(`battle:${matchId}`)
    .on("broadcast", { event: "state" }, (msg) => onState(msg.payload as MatchState))
    .subscribe((status) => onLive(status === "SUBSCRIBED"));
}
