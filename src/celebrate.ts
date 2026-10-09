// 正解・不正解の瞬間の演出（スタンプ・効果音・振動・連続正解）。進行状態は持たず、描画から呼ばれるだけ。
// 対戦画面は通信のたびに描き直されるので、演出は「最初に表示した時刻」からの経過で続きを再生し、
// 音と振動は同じ場面で1回だけ鳴らす。
import { icon, readStore, writeStore } from "./ui";

export type Outcome = "win" | "lose" | "timeout" | "rival";
export interface Moment { outcome: Outcome; streak: number; style: string; }

const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 経過時間：再描画されても演出を最初からやり直さない ----------
const firstSeen = new Map<string, number>();
export function since(key: string): string {
  const now = Date.now();
  if (!firstSeen.has(key)) {
    firstSeen.set(key, now);
    if (firstSeen.size > 60) firstSeen.delete(firstSeen.keys().next().value!);
  }
  return `--since:${now - firstSeen.get(key)!}ms`;
}

export const seen = (key: string): boolean => firstSeen.has(key);

// ---------- 連続正解：試合ごとに各問の正誤を覚える ----------
const results = new Map<string, Map<number, boolean>>();
function streakAt(session: string, index: number, ok: boolean): number {
  if (!results.has(session)) {
    results.set(session, new Map());
    if (results.size > 8) results.delete(results.keys().next().value!);
  }
  const mine = results.get(session)!;
  mine.set(index, ok);
  let n = 0;
  for (let i = index; mine.get(i) === true; i--) n++;
  return n;
}

// ---------- 効果音（Web Audio で合成。音源ファイルは持たない） ----------
let soundOn = readStore("gb.sound") !== "off";
let audio: AudioContext | null = null;
export const soundEnabled = (): boolean => soundOn;
export function toggleSound(): void {
  soundOn = !soundOn;
  writeStore("gb.sound", soundOn ? null : "off");
  if (soundOn) { unlockAudio(); tone([[880, 0, .09]], "triangle", .08); }
}
export function renderSoundToggle(): string {
  return `<button class="btn sound-toggle" data-act="sound" aria-pressed="${soundOn}" aria-label="効果音 ${soundOn ? "オン" : "オフ"}">${soundOn ? SPEAKER_ON : SPEAKER_OFF}<span>${soundOn ? "音あり" : "音なし"}</span></button>`;
}
const SPEAKER = '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>';
const SPEAKER_ON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;
const SPEAKER_OFF = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}<path d="m16 9.5 5 5m0-5-5 5"/></svg>`;

// iPhone は画面に触れた瞬間にしか音を出し始められないので、最初の操作で準備しておく。
// 消音スイッチ（マナーモード）中は鳴らさない（対応ブラウザのみ）。
export function unlockAudio(): void {
  if (!soundOn) return;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* 音が出せない環境では演出だけ行う */ }
}

// [周波数Hz, 開始秒, 長さ秒] の並びを鳴らす。
function tone(notes: [number, number, number][], type: OscillatorType = "triangle", volume = .14): void {
  if (!soundOn || !audio || audio.state !== "running") return;
  const t0 = audio.currentTime + .01;
  for (const [freq, at, len] of notes) {
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0 + at);
    gain.gain.linearRampToValueAtTime(volume, t0 + at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + at + len);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + len + .02);
  }
}

const SOUNDS = {
  // ピンポーン（高い音から少し下がる）。連続正解ではきらめきを足す。
  win: () => tone([[1318.5, 0, .16], [1046.5, .13, .55]]),
  streak: () => { tone([[1318.5, 0, .16], [1046.5, .13, .5]]); tone([[1568, .3, .12], [2093, .38, .35]], "sine", .07); },
  lose: () => tone([[196, 0, .16], [185, .2, .3]], "square", .05),
  timeout: () => tone([[392, 0, .14], [294, .14, .3]], "sine", .1),
  rival: () => tone([[659, 0, .12], [523, .12, .12], [440, .24, .3]], "sine", .09),
  fanfare: () => { tone([[523.3, 0, .14], [659.3, .12, .14], [784, .24, .14], [1046.5, .36, .7]]); tone([[1568, .5, .5]], "sine", .05); },
  finish: () => tone([[523.3, 0, .2], [440, .18, .5]], "sine", .09),
} as const;
const BUZZ: Partial<Record<keyof typeof SOUNDS, number[]>> = { win: [14, 50, 22], streak: [14, 40, 14, 40, 26], lose: [70], fanfare: [20, 60, 20, 60, 40] };

// 同じ場面（key）では1回だけ鳴らす。表示から時間が経って描き直されたとき（再開など）は鳴らさない。
const cued = new Set<string>();
export function cue(key: string, sound: keyof typeof SOUNDS, delay = 0): void {
  if (cued.has(key)) return;
  cued.add(key);
  if (cued.size > 120) cued.delete(cued.values().next().value!);
  const age = Date.now() - (firstSeen.get(key) ?? Date.now());
  if (age > 1500) return;
  setTimeout(() => {
    SOUNDS[sound]();
    const buzz = BUZZ[sound];
    if (buzz && !reducedMotion()) navigator.vibrate?.(buzz);
  }, Math.max(0, delay - age));
}

// ---------- 解答発表の瞬間 ----------
// quiet は、お手つきの時点ですでに鳴らした場合など、発表では音を重ねないときに使う。
export function revealMoment(session: string, index: number, outcome: Outcome, quiet = false): Moment {
  const key = `${session}:${index}:reveal`;
  const style = since(key);
  const streak = streakAt(session, index, outcome === "win");
  if (!quiet) cue(key, outcome === "win" ? (streak >= 3 ? "streak" : "win") : outcome);
  return { outcome, streak, style };
}

const STAMP_LABEL: Record<Outcome, string> = { win: "正解！", lose: "不正解", timeout: "時間切れ", rival: "先を越された" };
// 画面中央に一瞬だけ出すスタンプ。読み上げは下の見出しに任せる。
export function stamp(m: Moment, labels: Partial<Record<Outcome, string>> = {}): string {
  const mark = m.outcome === "win"
    ? '<circle class="stamp-stroke" cx="50" cy="50" r="34" pathLength="1"/>'
    : m.outcome === "lose"
      ? '<path class="stamp-stroke" d="M27 27 73 73" pathLength="1"/><path class="stamp-stroke second" d="M73 27 27 73" pathLength="1"/>'
      : "";
  const combo = m.outcome === "win" && m.streak >= 2 ? `<span class="stamp-combo">${m.streak}連続正解！</span>` : "";
  return `<div class="stamp stamp-${m.outcome}" style="${m.style}" aria-hidden="true"><div class="stamp-body">${mark ? `<svg viewBox="0 0 100 100">${mark}</svg>` : ""}<strong>${labels[m.outcome] ?? STAMP_LABEL[m.outcome]}</strong>${combo}</div></div>`;
}

// 解答欄の見出しの下に添える連続正解の表示。
export function streakNote(m: Moment): string {
  if (m.outcome !== "win" || m.streak < 2) return "";
  return `<p class="streak-note">${icon("target")}${m.streak}問連続正解${m.streak >= 3 ? " · その調子！" : ""}</p>`;
}

// 得点の横に浮かぶ「+1」。
export const plusOne = (): string => '<span class="plus-one" aria-hidden="true">+1</span>';

// あと1点で勝ちになる人の印。
export const reach = (): string => '<em class="reach">リーチ</em>';

// 勝利時に中心から散る紙吹雪。
export function confetti(count = 22): string {
  return `<span class="confetti" aria-hidden="true">${Array.from({ length: count }, (_, i) => {
    const a = Math.round(i * (360 / count) + (i % 3) * 7);
    const d = 70 + (i * 37) % 70;
    return `<i style="--a:${a}deg;--d:${d}px;--r:${(i * 53) % 360}deg"></i>`;
  }).join("")}</span>`;
}
