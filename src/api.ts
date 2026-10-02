import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

import { requestStarted, requestFinished } from "./connection";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key, { auth: { persistSession: false } });

export interface Player {
  seat: number;
  name: string;
  score: number;
  mark: "o" | "x" | null;
  ready?: boolean;
}

export interface MatchState {
  id: string;
  code: string | null;
  is_private: boolean;
  room_field?: string | null;
  rematch_of?: string | null;
  can_rematch?: boolean;
  rematch_requested?: boolean;
  rematch_joined?: number;
  rematch_total?: number;
  rematch_roster?: {seat:number;name:string;joined:boolean;ready:boolean}[];
  invite_token?: string | null;
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
  answer_viewed?: boolean;
  choice_order?: number[];
  choice_index?: number;
}

// サーバ時刻 − 端末時刻。カウントダウン表示にだけ使う（勝敗は常にサーバが決める）。
let clockOffset = 0;
export const serverNow = (): number => Date.now() + clockOffset;

export async function call<T = MatchState>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sent = Date.now();
  requestStarted();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  let reported=false;
  try {
    const {data,error}=await supabase.rpc(fn,args).abortSignal(controller.signal);
    // SQLでの入力エラーも、サーバーに届いた応答。通信切断として表示しない。
    requestFinished(!error || !!error.code,Date.now()-sent);reported=true;
    if(error)throw new Error(error.message);
    const serverTime=(data as Partial<MatchState>|null)?.server_now;
    if(serverTime)clockOffset=Date.parse(serverTime)-(sent+Date.now())/2;
    return data as T;
  } catch(e) {
    // Supabaseは通常errorとして返す。fetch自体がthrowしたときも終了を通知。
    if(!reported)requestFinished(false,Date.now()-sent);
    throw e;
  } finally {clearTimeout(timeout);}

}

export function listen(matchId: string, onState: (s: MatchState) => void, onLive: (live: boolean) => void): RealtimeChannel {
  return supabase
    .channel(`battle:${matchId}`)
    .on("broadcast", { event: "state" }, (msg) => onState(msg.payload as MatchState))
    .subscribe((status) => onLive(status === "SUBSCRIBED"));
}
