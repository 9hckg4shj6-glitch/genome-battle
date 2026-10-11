// スタート画面のモデル「ゲノム編集」：CRISPR-Cas9 が流れる二重らせんを読み取り、標的（PAM: NGG）で止めて
// 二本鎖を切断し、修復して読み取りに戻るまでを繰り返す。canvas に毎フレーム描き、キャンバスが画面から消えたら止める。
// 色は CSS 変数から読むので、ライト／ダークの切り替えにそのまま追従する。動きを減らす設定では「標的を捉えた」1枚だけを描く。

const SEQ = "ATGCGTACCAGTTGCAGCTAGGCATCCGATTACGGTCA";
const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
const PERIOD = 120; // らせん1回転の長さ（px）
const SPACING = 12; // 塩基対の間隔（px）
const SPEED = 54; // 読み取り中に流れる速さ（px/秒）
const CYCLE = 6.4; // 1サイクル（秒）
const GAP = 11; // 切断で開くすき間（片側, px）

interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface Status { label: string; speed: number; gap: number; lock: number; }

let running = false;
let watching = false;
let clock = 0;
let offset = 0;
let cutAt = -1;
let sparks: Spark[] = [];

const ease = (p: number): number => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

// サイクル内の時刻から、流れる速さ・切断のすき間・ロックの度合い・表示する状態を決める。
function status(t: number): Status {
  if (t < 3.4) return { label: "SCANNING", speed: 1, gap: 0, lock: 0 };
  if (t < 4) { const p = (t - 3.4) / .6; return { label: "PAM NGG LOCKED", speed: (1 - p) ** 2, gap: 0, lock: ease(p) }; }
  if (t < 5.4) return { label: "DSB · CUT", speed: 0, gap: GAP * ease((t - 4) / .22), lock: 1 };
  if (t < 6) { const p = (t - 5.4) / .6; return { label: "REPAIR · NHEJ", speed: 0, gap: GAP * (1 - ease(p)), lock: 1 - ease(p) }; }
  return { label: "SCANNING", speed: ease((t - 6) / .4), gap: 0, lock: 0 };
}

function draw(canvas: HTMLCanvasElement, t: number, dt: number): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const css = getComputedStyle(canvas);
  const v = (name: string): string => css.getPropertyValue(name).trim() || "#888";
  const accent = v("--accent"), text = v("--text"), muted = v("--muted");
  const base: Record<string, string> = { A: v("--base-A"), T: v("--base-T"), G: v("--base-G"), C: v("--base-C") };
  const dark = document.documentElement.dataset.theme === "dark";
  const s = status(t);
  const mid = h * .54, amp = Math.min(24, h * .25), k = (2 * Math.PI) / PERIOD;
  const cx = Math.round(w * .62);
  const gap = s.gap;
  // 画面の x → らせん上の位置。切断中は切れ目の左を左へ、右を右へずらす。
  const along = (x: number): number => (x < cx ? x + gap : x - gap) + offset;
  const screen = (u: number): number => (u - offset < cx ? u - offset - gap : u - offset + gap);
  const inGap = (x: number): boolean => gap > .5 && Math.abs(x - cx) < gap;

  // 下の目盛り（bp）。読み取りに合わせて流れる。
  g.font = "600 8px ui-monospace, SFMono-Regular, monospace";
  g.fillStyle = muted; g.strokeStyle = muted;
  for (let n = Math.floor(offset / SPACING); n * SPACING - offset < w; n++) {
    const x = n * SPACING - offset, major = n % 5 === 0;
    g.globalAlpha = major ? .5 : .25; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, h - 4); g.lineTo(x, h - (major ? 10 : 7)); g.stroke();
    if (n % 10 === 0 && x > 4 && x < w - 30) { g.globalAlpha = .45; g.fillText(`${n * 10}bp`, x + 3, h - 6); }
  }

  // 塩基対（横木）。正面を向いているものほど濃く、標的の付近はロック中に光らせる。
  for (let n = Math.floor((offset - gap) / SPACING) - 1; ; n++) {
    const u = n * SPACING, x = screen(u);
    if (x > w + SPACING) break;
    if (x < -SPACING || inGap(x)) continue;
    const y1 = mid + amp * Math.sin(k * u), y2 = mid - amp * Math.sin(k * u);
    const b = SEQ[((n % SEQ.length) + SEQ.length) % SEQ.length], p = PAIR[b];
    const near = s.lock * Math.max(0, 1 - Math.abs(x - cx) / 30);
    g.globalAlpha = .18 + .55 * Math.abs(Math.sin(k * u)) + .3 * near;
    g.lineWidth = 2 + near;
    if (near > .05 && dark) { g.shadowColor = accent; g.shadowBlur = 10 * near; }
    g.strokeStyle = near > .5 ? accent : base[b]; g.beginPath(); g.moveTo(x, y1); g.lineTo(x, mid); g.stroke();
    g.strokeStyle = near > .5 ? accent : base[p]; g.beginPath(); g.moveTo(x, mid); g.lineTo(x, y2); g.stroke();
    g.shadowBlur = 0;
  }

  // 2本の鎖。奥にある部分は細く薄く、手前は太く濃くして立体感を出す。
  const strand = (sign: number, color: string): void => {
    g.strokeStyle = color; g.lineCap = "round";
    for (let x = 0; x < w; x += 2) {
      if (inGap(x) || inGap(x + 2)) continue;
      const u0 = along(x), u1 = along(x + 2);
      const z = sign * Math.cos(k * u0);
      g.globalAlpha = .22 + .78 * (z + 1) / 2;
      g.lineWidth = 1.1 + 1.9 * (z + 1) / 2;
      g.beginPath(); g.moveTo(x, mid + sign * amp * Math.sin(k * u0)); g.lineTo(x + 2, mid + sign * amp * Math.sin(k * u1)); g.stroke();
    }
  };
  strand(1, accent);
  strand(-1, dark ? base.T : text);

  // Cas9 の照準。読み取り中はゆっくり明滅しながら走査線を動かし、ロックで狭まって色が変わる。
  const half = 17 - 5 * s.lock, top = mid - amp - 12, bottom = mid + amp + 12, arm = 7;
  const scanColor = s.lock > .5 ? accent : muted;
  g.globalAlpha = s.lock > .5 ? 1 : .55 + .25 * Math.sin(t * 5);
  g.strokeStyle = scanColor; g.lineWidth = 2; g.lineCap = "square";
  if (dark) { g.shadowColor = scanColor; g.shadowBlur = 8 * s.lock; }
  for (const [x, dx] of [[cx - half, 1], [cx + half, -1]] as const) {
    g.beginPath(); g.moveTo(x + dx * arm, top); g.lineTo(x, top); g.lineTo(x, bottom); g.lineTo(x + dx * arm, bottom); g.stroke();
  }
  g.shadowBlur = 0;
  if (s.lock < .2 && s.gap === 0) {
    const y = mid + (amp + 6) * Math.sin(t * 3.2);
    const beam = g.createLinearGradient(cx - half, 0, cx + half, 0);
    beam.addColorStop(0, "transparent"); beam.addColorStop(.5, accent); beam.addColorStop(1, "transparent");
    g.globalAlpha = .8; g.strokeStyle = beam; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - half, y); g.lineTo(cx + half, y); g.stroke();
  }

  // 切断の瞬間：縦の閃光と火花。
  if (t >= 4 && cutAt < 0) {
    cutAt = t;
    const colors = [accent, base.A, base.G, base.C];
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      sparks.push({ x: cx, y: mid + (Math.random() - .5) * amp, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .45 + Math.random() * .35, color: colors[i % colors.length] });
    }
  }
  if (t < 4) cutAt = -1;
  if (cutAt >= 0 && t - cutAt < .4) {
    const f = 1 - (t - cutAt) / .4;
    g.globalAlpha = f; g.strokeStyle = dark ? "#fff" : accent; g.lineWidth = 1 + 2 * f;
    if (dark) { g.shadowColor = accent; g.shadowBlur = 16 * f; }
    g.beginPath(); g.moveTo(cx, 4); g.lineTo(cx, h - 12); g.stroke(); g.shadowBlur = 0;
  }
  sparks = sparks.filter((p) => (p.life -= dt) > 0);
  for (const p of sparks) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94;
    g.globalAlpha = Math.min(1, p.life * 2.2); g.strokeStyle = p.color; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * .05, p.y - p.vy * .05); g.stroke();
  }

  // 表示：左上に名前、右上に状態。左右の端はぼかしているので、その内側に置く。
  const inset = Math.round(w * .09);
  g.globalAlpha = .7; g.fillStyle = muted; g.font = "600 9px ui-monospace, SFMono-Regular, monospace";
  g.textAlign = "left"; g.fillText("CRISPR-Cas9", inset, 10);
  g.globalAlpha = s.lock > .5 ? 1 : .7; g.fillStyle = s.lock > .5 ? accent : muted; g.textAlign = "right";
  g.fillText(s.label + (s.label === "SCANNING" ? ".".repeat(1 + Math.floor(t * 2.5) % 3) : ""), w - inset, 10);
  g.textAlign = "left"; g.globalAlpha = 1;
}

// スタート画面を描いた後に呼ぶ。キャンバスがあるあいだだけ毎フレーム描き、なくなったら止める。
export function mountModel(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas.genome-model");
  if (!canvas) return;
  if (!watching) {
    watching = true;
    // 動きを止めているときは、テーマの切り替え・画面の幅の変化のたびに描き直す。
    new MutationObserver(() => { if (!running) mountModel(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", () => { if (!running) mountModel(); });
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { draw(canvas, 3.9, 0); return; }
  if (running) return;
  running = true;
  let last = performance.now();
  const frame = (now: number): void => {
    const c = document.querySelector<HTMLCanvasElement>("canvas.genome-model");
    if (!c) { running = false; return; }
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    clock = (clock + dt) % CYCLE;
    offset += SPEED * status(clock).speed * dt;
    draw(c, clock, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
