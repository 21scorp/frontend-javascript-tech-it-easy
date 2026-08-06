/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/sheet.ts
   The draggable bottom sheet. Peek / half / full, with momentum,
   rubber-banding and a dimming backdrop.

   WHY this file is the fussiest in src/ui: every panel in the game
   arrives through this gesture, so it is the single interaction the
   player feels most. Three rules make it feel native:

   1. NEVER animate on a timer while a finger is down. The sheet is
      pinned to the finger 1:1; release hands the live velocity to a
      spring so there is no seam between drag and settle.
   2. Project where the flick was *going* (y + v·t) and snap to the
      nearest detent to that, not to the nearest detent to where the
      finger stopped. This is what makes a small fast flick jump a
      whole detent — the thing cheap sheets get wrong.
   3. Do not fight the scroller. A drag that starts inside scrolled
      content belongs to the content. We only claim the gesture when
      the body is already at the top and the finger moves down,
      where the browser has nothing to scroll anyway.
   ═══════════════════════════════════════════════════════════════ */

import { el, on, clamp } from "./dom";
import { icon } from "./icons";
import { Spring, addTick, haptic } from "./motion";
import { prefersReducedMotion } from "./theme";

export type Detent = "peek" | "half" | "full";

export interface SheetOptions {
  /** Detents this sheet allows, low to high. Default all three. */
  detents?: Detent[];
  /** Fired after the sheet settles on a new detent. */
  onDetent?: (d: Detent) => void;
  /** Fired once the close animation finishes. */
  onClose?: () => void;
  /** Fired when the sheet becomes visible (before the spring runs). */
  onOpen?: (d: Detent) => void;
}

const PEEK_FRAC = 0.34;
const HALF_FRAC = 0.60;
const BACKDROP_MAX = 0.92;
/** Seconds of travel used to project a flick. Tuned by feel. */
const PROJECT_S = 0.14;
/** Past this downward velocity we close regardless of position. */
const DISMISS_V = 900;

export class Sheet {
  readonly node: HTMLElement;
  readonly backdrop: HTMLElement;

  private readonly grab: HTMLElement;
  private readonly head: HTMLElement;
  private readonly body: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly topFade: HTMLElement;

  private readonly opts: Required<Pick<SheetOptions, "detents">> & SheetOptions;
  private readonly spring: Spring;
  private disposers: Array<() => void> = [];

  private open = false;
  private detent: Detent = "half";
  private y = 0;              // px translated down from fully-open
  private sheetH = 1;
  private frameH = 1;

  // gesture state
  private pid: number | null = null;
  private claimed = false;      // we own the gesture (vs the scroller)
  private undecided = false;    // waiting to see which way the finger goes
  private startY = 0;
  private startTop = 0;
  private baseY = 0;
  private lastY = 0;
  private lastT = 0;
  private vel = 0;

  constructor(options: SheetOptions = {}) {
    this.opts = { detents: options.detents ?? ["peek", "half", "full"], ...options };

    this.backdrop = el("div.tf-backdrop", { "aria-hidden": "true" });

    this.grab = el("div.tf-sheet__grab", { "aria-hidden": "true" }, el("span"));
    this.eyebrow = el("span.tf-sheet__eyebrow");
    this.title = el("h2.tf-sheet__title", { id: "tf-sheet-title" });
    this.actions = el("div.tf-sheet__acts");
    this.head = el("div.tf-sheet__head", {},
      el("div.tf-sheet__titles", {}, this.eyebrow, this.title),
      this.actions,
      el("button.tf-iconbtn", { type: "button", "aria-label": "Close panel", "data-close": "1" },
        icon("close", { size: "0.8em" })),
    );
    this.body = el("div.tf-sheet__body");
    this.topFade = el("div.tf-sheet__fade.tf-sheet__fade--top", { style: "opacity:0" });

    this.node = el("section.tf-sheet",
      { role: "dialog", "aria-modal": "false", "aria-labelledby": "tf-sheet-title", hidden: true },
      el("div.tf-sheet__crown", { "aria-hidden": "true" }),
      this.grab, this.head, this.topFade, this.body,
      // Content must dissolve behind the nav bar, never get guillotined.
      el("div.tf-sheet__fade.tf-sheet__fade--bot", { "aria-hidden": "true" }),
    );

    this.spring = new Spring(0, {
      stiffness: 260, damping: 30, epsilon: 0.4,
      onUpdate: (v) => this.paint(v),
      onRest: () => this.afterSettle(),
    });

    this.bind();
  }

  /* ── content ────────────────────────────────────────────────── */

  setHeader(eyebrow: string, title: string): void {
    this.eyebrow.textContent = eyebrow;
    this.title.textContent = title;
  }

  /** Right-aligned header controls (filters, currency, etc). */
  setActions(...nodes: Node[]): void {
    this.actions.replaceChildren(...nodes);
  }

  setContent(node: Node): void {
    this.body.replaceChildren(node);
    this.body.scrollTop = 0;
    this.topFade.style.opacity = "0";
  }

  get content(): HTMLElement { return this.body; }
  get isOpen(): boolean { return this.open; }
  get currentDetent(): Detent { return this.detent; }

  /* ── open / close ───────────────────────────────────────────── */

  show(detent: Detent = "half"): void {
    this.measure();
    const target = this.allowed(detent);
    if (!this.open) {
      this.node.hidden = false;
      this.backdrop.classList.add("is-live");
      this.y = this.sheetH;
      this.paint(this.y);
      this.spring.set(this.sheetH);
      // Let the browser paint the closed state before springing up.
      void this.node.offsetHeight;
      this.open = true;
      this.opts.onOpen?.(target);
    }
    this.detent = target;
    this.spring.to(this.yFor(target), 0);
    this.node.setAttribute("aria-modal", "false");
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.backdrop.classList.remove("is-live");
    this.spring.to(this.sheetH + 4, Math.max(0, this.spring.velocity));
    if (prefersReducedMotion()) this.afterSettle();
  }

  setDetent(d: Detent): void {
    if (!this.open) { this.show(d); return; }
    this.detent = this.allowed(d);
    this.spring.to(this.yFor(this.detent));
  }

  /** Recompute detent geometry — call on viewport resize. */
  measure(): void {
    const parent = this.node.parentElement;
    this.frameH = parent ? parent.clientHeight : window.innerHeight;
    this.sheetH = this.node.offsetHeight || Math.round(this.frameH * 0.95);
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.spring.cancel();
    this.node.remove();
    this.backdrop.remove();
  }

  /* ── geometry ───────────────────────────────────────────────── */

  private allowed(d: Detent): Detent {
    return this.opts.detents.includes(d) ? d : (this.opts.detents[this.opts.detents.length - 1] ?? "full");
  }

  private yFor(d: Detent): number {
    if (d === "full") return 0;
    const frac = d === "peek" ? PEEK_FRAC : HALF_FRAC;
    const visible = Math.max(this.frameH * frac, 240);
    return clamp(this.sheetH - visible, 0, this.sheetH);
  }

  private detentYs(): Array<{ d: Detent; y: number }> {
    return this.opts.detents.map((d) => ({ d, y: this.yFor(d) }));
  }

  /** Progressive resistance past the top stop. Classic iOS curve. */
  private rubber(overshoot: number): number {
    const dim = this.sheetH || 1;
    return (overshoot * dim * 0.55) / (dim + 0.55 * overshoot);
  }

  private paint(y: number): void {
    this.y = y;
    this.node.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    const t = this.sheetH > 0 ? 1 - clamp(y / this.sheetH, 0, 1) : 0;
    this.backdrop.style.opacity = (t * BACKDROP_MAX).toFixed(3);
  }

  private afterSettle(): void {
    if (!this.open) {
      this.node.hidden = true;
      this.backdrop.style.opacity = "0";
      this.opts.onClose?.();
    } else {
      this.opts.onDetent?.(this.detent);
    }
  }

  /* ── gesture ────────────────────────────────────────────────── */

  private bind(): void {
    const D = this.disposers;

    D.push(on(this.backdrop, "pointerdown", () => this.hide()));
    D.push(on<MouseEvent>(this.head, "click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-close]")) this.hide();
    }));

    // Header + grabber always drag. They are touch-action:none.
    for (const handle of [this.grab, this.head]) {
      D.push(on<PointerEvent>(handle, "pointerdown", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        this.begin(e, false);
      }));
    }

    // In the body we only *maybe* drag — see rule 3 in the header.
    D.push(on<PointerEvent>(this.body, "pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button,[role='button'],input,a")) return;
      this.begin(e, true);
    }));

    D.push(on<PointerEvent>(window, "pointermove", (e) => this.move(e), { passive: true }));
    D.push(on<PointerEvent>(window, "pointerup", (e) => this.end(e)));
    D.push(on<PointerEvent>(window, "pointercancel", (e) => this.cancel(e)));

    D.push(on(this.body, "scroll", () => {
      const s = this.body.scrollTop;
      this.topFade.style.opacity = String(clamp(s / 26, 0, 1));
    }, { passive: true }));

    // Escape closes — desktop QA and switch-control users need this.
    D.push(on<KeyboardEvent>(window, "keydown", (e) => {
      if (e.key === "Escape" && this.open) { e.preventDefault(); this.hide(); }
    }));
  }

  private begin(e: PointerEvent, fromBody: boolean): void {
    if (!this.open || this.pid !== null) return;
    this.measure();
    this.pid = e.pointerId;
    this.claimed = !fromBody;
    this.undecided = fromBody;
    this.startY = e.clientY;
    this.lastY = e.clientY;
    this.lastT = performance.now();
    this.baseY = this.y;
    this.startTop = this.body.scrollTop;
    this.vel = 0;
    if (!fromBody) {
      this.spring.cancel();
      this.node.classList.add("is-dragging");
    }
  }

  private move(e: PointerEvent): void {
    if (this.pid !== e.pointerId) return;
    const dy = e.clientY - this.startY;

    if (this.undecided) {
      // The scroller owns upward drags and anything below the top.
      if (Math.abs(dy) < 5) return;
      if (dy < 0 || this.startTop > 0) { this.undecided = false; this.pid = null; return; }
      this.undecided = false;
      this.claimed = true;
      this.spring.cancel();
      this.node.classList.add("is-dragging");
      this.startY = e.clientY;   // re-zero so there is no jump
      this.baseY = this.y;
    }
    if (!this.claimed) return;

    const now = performance.now();
    const dt = Math.max(1, now - this.lastT);
    const inst = ((e.clientY - this.lastY) / dt) * 1000;
    this.vel = this.vel * 0.7 + inst * 0.3;   // smoothed, px/s
    this.lastY = e.clientY;
    this.lastT = now;

    let next = this.baseY + (e.clientY - this.startY);
    if (next < 0) next = -this.rubber(-next);
    if (next > this.sheetH) next = this.sheetH + this.rubber(next - this.sheetH) * 0.5;
    this.paint(next);
  }

  private end(e: PointerEvent): void {
    if (this.pid !== e.pointerId) return;
    this.pid = null;
    if (!this.claimed) { this.undecided = false; return; }
    this.claimed = false;
    this.node.classList.remove("is-dragging");

    const v = this.vel;

    // A hard downward flick from anywhere dismisses.
    if (v > DISMISS_V || this.y > this.sheetH * 0.72) {
      this.hide();
      return;
    }

    // Rule 2: snap to the detent nearest the *projected* landing point.
    const projected = this.y + v * PROJECT_S;
    const stops = this.detentYs();
    let best = stops[0]!;
    for (const s of stops) {
      if (Math.abs(s.y - projected) < Math.abs(best.y - projected)) best = s;
    }
    const changed = best.d !== this.detent;
    this.detent = best.d;
    this.spring.to(best.y, v);
    if (changed) haptic(6);
  }

  private cancel(e: PointerEvent): void {
    if (this.pid !== e.pointerId) return;
    this.pid = null;
    this.undecided = false;
    if (this.claimed) {
      this.claimed = false;
      this.node.classList.remove("is-dragging");
      this.spring.to(this.yFor(this.detent), this.vel);
    }
  }
}

/* ── a tiny inertial helper the panels reuse for popovers ──────── */

/** Fade a node out then remove it, without leaking a timer on unmount. */
export function dismiss(node: HTMLElement, cls = "is-out", ms = 180): void {
  node.classList.add(cls);
  if (prefersReducedMotion()) { node.remove(); return; }
  let t = 0;
  addTick((dt) => {
    t += dt;
    if (t >= ms) { node.remove(); return false; }
    return true;
  });
}
