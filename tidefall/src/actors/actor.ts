/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/actor.ts
   One body in the world: the player, a shopkeeper, a crab. Holds
   position in DESIGN UNITS, a facing, a paperdoll and an animator.

   Feet are the origin: (x, y) is the ground contact point, so
   zIndex = y depth-sorts against trees and buildings for free.

   Movement accelerates in and brakes out, so taps never produce a
   dead-stop snap. Nothing here allocates per frame.
   ═══════════════════════════════════════════════════════════════ */

import { Container } from "pixi.js";
import type { AnimPlayOptions, AnimStateId } from "./animation";
import { Animator, motionOffsetX, motionOffsetY } from "./animation";
import { Paperdoll } from "./paperdoll";
import type { SheetPack } from "./sheets";
import { defaultAppearance } from "./character";
import type { CharacterAppearance } from "./character";

export type Facing = 1 | -1;

export interface ActorOptions {
  sheets: SheetPack;
  id?: string;
  appearance?: CharacterAppearance;
  /** On-screen height in design units (1080-wide world). */
  height?: number;
  /** Top speed, design units / second. */
  speed?: number;
  /** Acceleration and braking, design units / second². */
  accel?: number;
  x?: number;
  y?: number;
  facing?: Facing;
  shadow?: boolean;
}

/** What a walk order does when it lands. */
export type ArriveHandler = (() => void) | null;

export class Actor {
  readonly id: string;
  readonly paperdoll: Paperdoll;
  readonly anim: Animator;
  /** Parent this into SceneLayers.actors. */
  readonly view: Container;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing: Facing = 1;

  speed: number;
  accel: number;
  readonly height: number;

  /** Simulation position at the previous fixed step, for render lerp. */
  private px = 0;
  private py = 0;

  private hasTarget = false;
  private tx = 0;
  private ty = 0;
  private onArrive: ArriveHandler = null;
  /** State to settle into once a walk finishes. */
  private restState: AnimStateId = "idle";
  private clock = 0;

  constructor(opts: ActorOptions) {
    this.id = opts.id ?? `actor_${(Math.random() * 1e9) | 0}`;
    this.height = opts.height ?? 300;
    this.speed = opts.speed ?? 340;
    this.accel = opts.accel ?? 2200;
    this.x = this.px = opts.x ?? 0;
    this.y = this.py = opts.y ?? 0;
    this.facing = opts.facing ?? 1;

    this.paperdoll = new Paperdoll({
      sheets: opts.sheets,
      height: this.height,
      shadow: opts.shadow !== false,
    });
    this.paperdoll.setAppearance(opts.appearance ?? defaultAppearance());
    this.anim = new Animator(opts.sheets);
    this.view = this.paperdoll.root;
    this.view.position.set(this.x, this.y);
  }

  /* ─────────────── appearance ─────────────── */

  setAppearance(a: CharacterAppearance): void { this.paperdoll.setAppearance(a); }
  getAppearance(): CharacterAppearance { return this.paperdoll.getAppearance(); }

  /* ─────────────── facing ─────────────── */

  /** Unflipped art faces right; -1 mirrors the whole doll. */
  setFacing(dir: Facing): void { this.facing = dir; }

  /** Look at a world x. Ignores tiny deltas so actors don't jitter
      when their target is directly underfoot. */
  faceTowards(worldX: number, deadzone = 6): void {
    const dx = worldX - this.x;
    if (Math.abs(dx) < deadzone) return;
    this.facing = dx < 0 ? -1 : 1;
  }

  /* ─────────────── animation ─────────────── */

  play(state: AnimStateId, opts?: AnimPlayOptions): boolean {
    return this.anim.play(state, opts);
  }

  /** Start an action while explicitly turning to the thing you are
      acting on — the fix for swinging an axe away from the tree. */
  playAt(state: AnimStateId, targetX: number, opts?: AnimPlayOptions): boolean {
    this.faceTowards(targetX, 1);
    return this.anim.play(state, opts);
  }

  /** Loop a gather/attack state until told otherwise, facing the work. */
  workAt(targetX: number, targetY: number, state: AnimStateId): void {
    this.stop();
    this.restState = state;
    this.faceTowards(targetX, 1);
    void targetY;
    this.anim.play(state, { force: true });
  }

  /* ─────────────── movement ─────────────── */

  /** Walk to a point in design units. Replaces any previous order. */
  walkTo(x: number, y: number, onArrive?: ArriveHandler): void {
    this.tx = x;
    this.ty = y;
    this.hasTarget = true;
    this.onArrive = onArrive ?? null;
    this.restState = "idle";
    this.faceTowards(x, 2);
    this.anim.play("walk", { force: true });
  }

  /** Drop the walk order and brake. Keeps the current animation. */
  stop(): void {
    this.hasTarget = false;
    this.onArrive = null;
    this.vx = 0;
    this.vy = 0;
  }

  teleport(x: number, y: number): void {
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = this.vy = 0;
    this.hasTarget = false;
  }

  get isWalking(): boolean { return this.hasTarget; }
  get speedNow(): number { return Math.hypot(this.vx, this.vy); }

  /** Rough tap target: a box around the body. */
  hitTest(wx: number, wy: number): boolean {
    const h = this.height;
    return Math.abs(wx - this.x) < h * 0.30 && wy < this.y + h * 0.12 && wy > this.y - h;
  }

  /* ─────────────── loop ─────────────── */

  update(dt: number): void {
    this.px = this.x;
    this.py = this.y;
    this.clock += dt;

    if (this.hasTarget) this.steer(dt);
    else this.brake(dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // walk cycle keeps pace with actual ground speed
    if (this.anim.state === "walk") {
      const s = this.speedNow / Math.max(1, this.speed);
      this.anim.setSpeed(0.65 + s * 0.55);
    }
    this.anim.update(dt);
  }

  private steer(dt: number): void {
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);

    // Close enough, and slow enough to land without a skid.
    if (dist < 3 && this.speedNow < this.speed * 0.25) {
      this.x = this.tx;
      this.y = this.ty;
      this.vx = this.vy = 0;
      this.hasTarget = false;
      const cb = this.onArrive;
      this.onArrive = null;
      this.anim.play(this.restState, { force: true });
      if (cb) cb();
      return;
    }

    // Brake into the target: v² = 2·a·d gives the fastest safe speed.
    const want = Math.min(this.speed, Math.sqrt(2 * this.accel * Math.max(0, dist - 2)));
    const inv = dist > 0.0001 ? 1 / dist : 0;
    const wantX = dx * inv * want;
    const wantY = dy * inv * want;

    const step = this.accel * dt;
    this.vx = approach(this.vx, wantX, step);
    this.vy = approach(this.vy, wantY, step);

    if (Math.abs(this.vx) > this.speed * 0.12) this.facing = this.vx < 0 ? -1 : 1;
  }

  private brake(dt: number): void {
    const step = this.accel * 1.6 * dt;
    this.vx = approach(this.vx, 0, step);
    this.vy = approach(this.vy, 0, step);
  }

  /** Visual pass: interpolate, apply procedural motion, depth-sort. */
  render(alpha: number): void {
    const ix = this.px + (this.x - this.px) * alpha;
    const iy = this.py + (this.y - this.py) * alpha;
    this.view.position.set(
      ix + motionOffsetX(this.anim, this.facing),
      iy + motionOffsetY(this.anim, this.clock),
    );
    this.view.zIndex = Math.round(iy);
    this.paperdoll.apply(this.anim, this.facing);
  }

  destroy(): void {
    this.onArrive = null;
    this.anim.onImpact = null;
    this.paperdoll.destroy();
  }
}

function approach(v: number, target: number, step: number): number {
  const d = target - v;
  if (d > step) return v + step;
  if (d < -step) return v - step;
  return target;
}
