/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/motion.ts
   Springs, tweens and the count-up ticker.

   WHY not CSS transitions everywhere: the bottom sheet is dragged,
   so it needs to hand off from a live finger velocity to a settle
   animation without a visible seam. That is a spring, integrated in
   JS. CSS keeps the cheap stuff (hover, press, fades); this module
   owns anything that must respond to input velocity.

   Every entry point checks prefers-reduced-motion and degrades to an
   instant set rather than a fast animation — motion sickness is a
   real accessibility issue on a full-screen game.
   ═══════════════════════════════════════════════════════════════ */

import { prefersReducedMotion } from "./theme";

export type Disposer = () => void;

/* ── shared rAF pump ─────────────────────────────────────────────
   One loop for every active animation. Dozens of independent rAF
   callbacks is how a phone UI starts dropping frames. */

type Tick = (dtMs: number, nowMs: number) => boolean; // return false to stop

const running = new Set<Tick>();
let rafId = 0;
let last = 0;

function pump(now: number) {
  _frames++;
  const dt = last ? Math.min(now - last, 64) : 16.7;
  last = now;
  for (const tick of [...running]) {
    let alive = false;
    try { alive = tick(dt, now); } catch (e) { console.error("[motion]", e); }
    if (!alive) running.delete(tick);
  }
  rafId = running.size ? requestAnimationFrame(pump) : (last = 0);
}

export function addTick(tick: Tick): Disposer {
  running.add(tick);
  if (!rafId) rafId = requestAnimationFrame(pump);
  return () => running.delete(tick);
}

let _frames = 0;
/** Live animation count — dev overlay / leak checks only. */
export function motionStats() {
  return { active: running.size, scheduled: rafId !== 0, frames: _frames };
}

/* ── spring ──────────────────────────────────────────────────────
   Critically-ish damped by default. `stiffness` is in 1/s², damping
   in 1/s, integrated semi-implicitly at the frame rate. */

export interface SpringOpts {
  stiffness?: number;
  damping?: number;
  /** Stop when |x - target| and |v| fall under these. */
  epsilon?: number;
  onUpdate: (value: number, velocity: number) => void;
  onRest?: () => void;
}

export class Spring {
  private x: number;
  private v = 0;
  private target: number;
  private stop: Disposer | null = null;
  private readonly k: number;
  private readonly c: number;
  private readonly eps: number;
  private readonly onUpdate: SpringOpts["onUpdate"];
  private readonly onRest: SpringOpts["onRest"];

  constructor(initial: number, opts: SpringOpts) {
    this.x = initial;
    this.target = initial;
    this.k = opts.stiffness ?? 220;
    this.c = opts.damping ?? 28;
    this.eps = opts.epsilon ?? 0.12;
    this.onUpdate = opts.onUpdate;
    this.onRest = opts.onRest;
  }

  get value() { return this.x; }
  get velocity() { return this.v; }

  /** Jump with no animation (drag frames, reduced motion). */
  set(value: number, velocity = 0) {
    this.stop?.(); this.stop = null;
    this.x = value; this.v = velocity; this.target = value;
    this.onUpdate(this.x, this.v);
  }

  /** Animate to `to`, optionally seeded with the finger's velocity. */
  to(target: number, velocity?: number) {
    this.target = target;
    if (velocity !== undefined) this.v = velocity;
    if (prefersReducedMotion()) { this.set(target); this.onRest?.(); return; }
    if (this.stop) return;                 // already integrating
    this.stop = addTick((dtMs) => {
      // Sub-step at a fixed 60Hz. A single big dt is unstable at this
      // stiffness, but clamping it instead makes the sheet crawl in
      // wall-clock terms on a device that is dropping frames — which is
      // exactly the device where a sluggish sheet is most noticeable.
      let remaining = Math.min(dtMs, 120) / 1000;
      const STEP = 1 / 60;
      while (remaining > 0) {
        const dt = Math.min(STEP, remaining);
        remaining -= dt;
        const a = -this.k * (this.x - this.target) - this.c * this.v;
        this.v += a * dt;
        this.x += this.v * dt;
      }
      if (Math.abs(this.x - this.target) < this.eps && Math.abs(this.v) < this.eps * 8) {
        this.x = this.target; this.v = 0;
        this.onUpdate(this.x, this.v);
        this.stop = null;
        this.onRest?.();
        return false;
      }
      this.onUpdate(this.x, this.v);
      return true;
    });
  }

  cancel() { this.stop?.(); this.stop = null; this.v = 0; }
}

/* ── tween ───────────────────────────────────────────────────── */

export const Ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Overshoots then settles — the "pop". */
  back: (t: number) => {
    const c = 1.70158, c3 = c + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  /** Decaying bounce, for reward numbers. */
  elastic: (t: number) =>
    t === 0 || t === 1 ? t : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
} as const;

export function tween(
  ms: number,
  onUpdate: (t: number) => void,
  ease: (t: number) => number = Ease.out,
  onDone?: () => void,
): Disposer {
  if (prefersReducedMotion()) { onUpdate(1); onDone?.(); return () => {}; }
  let elapsed = 0;
  onUpdate(0);
  return addTick((dt) => {
    elapsed += dt;
    const p = Math.min(1, elapsed / ms);
    onUpdate(ease(p));
    if (p >= 1) { onDone?.(); return false; }
    return true;
  });
}

/* ── count-up ────────────────────────────────────────────────────
   Currency that snaps from 1,204 to 9,910 reads as a bug. Rolling
   it up over ~700ms reads as a reward. Long distances ease out so
   the last digits still land legibly. */

export class CountUp {
  private current: number;
  private target: number;
  private stop: Disposer | null = null;

  constructor(initial: number, private readonly onValue: (v: number) => void) {
    this.current = initial;
    this.target = initial;
    onValue(initial);
  }

  get value() { return this.target; }

  set(v: number) {
    this.stop?.(); this.stop = null;
    this.current = v; this.target = v;
    this.onValue(v);
  }

  to(v: number, ms = 700) {
    if (v === this.target) return;
    this.target = v;
    if (prefersReducedMotion()) { this.set(v); return; }
    const from = this.current;
    const delta = v - from;
    let elapsed = 0;
    this.stop?.();
    this.stop = addTick((dt) => {
      elapsed += dt;
      const p = Math.min(1, elapsed / ms);
      this.current = from + delta * Ease.out(p);
      this.onValue(p >= 1 ? this.target : this.current);
      if (p >= 1) { this.current = this.target; this.stop = null; return false; }
      return true;
    });
  }
}

/* ── one-shot class pulse ────────────────────────────────────────
   Retriggering a CSS animation needs a reflow between removals;
   this hides that dance. */
export function pulse(node: HTMLElement, cls: string, ms = 420): void {
  if (prefersReducedMotion()) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  window.setTimeout(() => node.classList.remove(cls), ms);
}

/** Best-effort haptic. Silent no-op where unsupported (iOS Safari). */
export function haptic(ms = 8): void {
  try { navigator.vibrate?.(ms); } catch { /* not permitted */ }
}
