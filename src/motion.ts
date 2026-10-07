// 画面遷移と押下の演出。進行状態は持たず、描画の前後から呼ばれるだけ。
// 非対応ブラウザ・動きを減らす設定では、従来どおり即時に切り替える。

type Direction = "forward" | "back";
type Target = () => Element | null;

const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
// 押したカードのアイコンと見出しを、次の画面の見出しへ受け渡す。
const MORPH = { icon: "morph-icon", title: "morph-title" } as const;

let morphTarget: Target | null = null;
let navId = 0;

function name(scope: Element | null): void {
  (Object.keys(MORPH) as (keyof typeof MORPH)[]).forEach((part) => {
    const el = scope?.querySelector<HTMLElement>(`[data-morph="${part}"]`);
    if (el) el.style.viewTransitionName = MORPH[part];
  });
}

// 同じ名前が2つ残ると遷移が成立しないので、付け直す前にすべて外す。
const clearNames = (): void => {
  document.querySelectorAll<HTMLElement>("[data-morph]").forEach((el) => { el.style.viewTransitionName = ""; });
};

// 画面外の要素へ飛んでいく動きは追えないので、見えている要素だけをつなぐ。
const visible = (el: Element | null): Element | null => {
  const r = el?.getBoundingClientRect();
  return r && r.bottom > 0 && r.top < innerHeight ? el : null;
};

export function navigate(update: () => void, direction: Direction = "forward", from?: Element | null, to?: Target): void {
  if (typeof document.startViewTransition !== "function" || reducedMotion()) { update(); return; }
  const root = document.documentElement;
  const id = ++navId;
  root.dataset.nav = direction;
  // ヘッダーが見えているときだけ固定して残す。スクロールで隠れていたら、上から滑り込ませずに画面と一緒に切り替える。
  if (scrollY < 24) root.dataset.navPinned = "";
  from?.classList.add("is-launching");
  name(from ?? null);
  morphTarget = to ? () => visible(to()) : null;
  const vt = document.startViewTransition(() => { update(); afterRender(); });
  vt.ready.catch(() => {}); // 連打で前の遷移が打ち切られたときの拒否。画面の更新自体は行われる
  void vt.finished.finally(() => {
    if (id !== navId) return; // 連続で押したときは、後の遷移の後片付けに任せる
    clearNames();
    morphTarget = null;
    delete root.dataset.nav;
    delete root.dataset.navPinned;
  });
}

// 遷移中に通信などで再描画されても、受け渡し先の名前を付け直して動きを途切れさせない。
export function afterRender(): void {
  if (!morphTarget) return;
  clearNames();
  name(morphTarget());
}

let lastScene = "";
const STAGED = new Set(["home", "setup", "practice", "guide", "install", "notebook", "catalog", "review"]);
// 画面が変わったときだけ入場演出を付ける。同じ画面の再描画（入力・通信）では再生しない。
export function enterScene(scene: string): string {
  const changed = scene !== lastScene;
  lastScene = scene;
  return changed && STAGED.has(scene.split(":")[0]) ? " scene-enter" : "";
}

// 指・カーソルの位置にカードの光を置く。
const LIT = ".mode-card,.catalog-entry,.notebook-entry";
export function installPointerLight(root: HTMLElement): void {
  const place = (e: PointerEvent): void => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(LIT);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  root.addEventListener("pointerdown", place, { passive: true });
  root.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") place(e); }, { passive: true });
}

// 対応端末（主にAndroid）だけ、モードに入る瞬間を短い振動で伝える。
export function tapFeedback(): void {
  if (!reducedMotion()) navigator.vibrate?.(8);
}
