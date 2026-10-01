// 負荷・競合テスト用のボット。本番と同じRPC・Realtimeを使って同時にランダム対戦へ入る。
//   node scripts/bots.mjs [人数=16] [1部屋の人数=おまかせ] [1問の秒数=20]
// .env.local の VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を使う。
// 確認すること: 全試合が finished になる／1問に正解者（○）が2人以上いない／配信が届いている。
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const N = Number(process.argv[2] ?? 16);
const CAPACITY = process.argv[3] ? Number(process.argv[3]) : null;
const SECONDS = Number(process.argv[4] ?? 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bot(i) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const device = crypto.randomUUID();
  const stats = { id: i, broadcasts: 0, answers: 0, doubleWinners: 0, match: null, final: null };
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  let s = await rpc("find_match", { p_device: device, p_name: `bot${i}`, p_capacity: CAPACITY, p_seconds: SECONDS });
  stats.match = s.id;
  const apply = (n) => n && n.version >= s.version && (s = { ...n, my_seat: n.my_seat ?? s.my_seat });
  const ch = sb.channel(`battle:${s.id}`).on("broadcast", { event: "state" }, (m) => {
    stats.broadcasts++;
    apply(m.payload);
  }).subscribe();
  const answered = new Set();
  const started = Date.now();
  while (s.status !== "finished" && Date.now() - started < 10 * 60_000) {
    await sleep(200 + Math.random() * 300);
    if (s.players.filter((p) => p.mark === "o").length > 1) stats.doubleWinners++;
    const overdue = s.phase_ends_at && Date.now() > Date.parse(s.phase_ends_at) + 300;
    if (s.status === "playing" && s.phase === "question" && !answered.has(s.q_index) && Math.random() < 0.15) {
      answered.add(s.q_index);
      stats.answers++;
      apply(await rpc("submit_answer", { p_match: s.id, p_device: device, p_q_index: s.q_index, p_choice: Math.floor(Math.random() * 5) }));
    } else if (overdue || s.status === "waiting") {
      apply(await rpc("tick", { p_match: s.id, p_device: device }));
    }
  }
  stats.final = s.status;
  stats.size = s.players.length;
  stats.score = s.players.find((p) => p.seat === s.my_seat)?.score;
  await sb.removeChannel(ch);
  return stats;
}

const t0 = Date.now();
const results = await Promise.all(Array.from({ length: N }, (_, i) => sleep(i * 50).then(() => bot(i))));
const matches = new Set(results.map((r) => r.match));
console.log(JSON.stringify({
  bots: N,
  matches: matches.size,
  sizes: [...matches].map((m) => results.find((r) => r.match === m).size),
  allFinished: results.every((r) => r.final === "finished"),
  doubleWinners: results.reduce((a, r) => a + r.doubleWinners, 0),
  broadcastsPerBot: Math.round(results.reduce((a, r) => a + r.broadcasts, 0) / N),
  answers: results.reduce((a, r) => a + r.answers, 0),
  seconds: Math.round((Date.now() - t0) / 1000),
}));
process.exit(0);
