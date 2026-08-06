/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/animation.ts
   The actor state machine. Eight states, four sheets: states we
   have no art for borrow the closest sheet and add procedural
   motion on top (documented per state in ANIM_STATES.substitute).

   Rules of the machine
     • loops run forever; one-shots fire onComplete and fall to `next`
     • a state only interrupts a state of equal or lower priority
     • every switch crossfades over `blend` seconds, so nothing pops
     • impactFrames raise onImpact once per pass — FX and audio hang
       their axe-hit / sword-hit off that, not off a timer
   ═══════════════════════════════════════════════════════════════ */

import type { LoadedSheet, SheetId, SheetPack } from "./sheets";

export type AnimStateId =
  | "idle" | "walk"
  | "gather_fish" | "gather_chop" | "gather_mine"
  | "attack" | "hurt" | "celebrate";

export const ANIM_STATE_IDS: readonly AnimStateId[] = [
  "idle", "walk", "gather_fish", "gather_chop", "gather_mine", "attack", "hurt", "celebrate",
];

/** Procedural motion layered on top of the sheet (design units). */
export interface MotionProfile {
  /** Continuous breathing/bounce. */
  readonly bobHz: number;
  readonly bobAmp: number;
  /** One-shot arc across the clip. */
  readonly hop: number;
  /** One-shot shove away from facing. */
  readonly recoil: number;
  /** 0..1 white/red hit flash across the clip. */
  readonly flash: number;
}

const NO_MOTION: MotionProfile = { bobHz: 0, bobAmp: 0, hop: 0, recoil: 0, flash: 0 };

export interface AnimStateDef {
  readonly id: AnimStateId;
  readonly sheet: SheetId;
  readonly fps: number;
  readonly loop: boolean;
  /** Where a one-shot lands when it finishes. */
  readonly next: AnimStateId;
  /** Higher wins: a hurt cannot be stomped by an idle. */
  readonly priority: number;
  /** Crossfade seconds when entering this state. */
  readonly blend: number;
  /** Frames that count as "the blow lands". */
  readonly impactFrames: readonly number[];
  readonly motion: MotionProfile;
  /** Non-empty when this state is borrowing another state's art. */
  readonly substitute: string;
}

function def(d: Partial<AnimStateDef> & Pick<AnimStateDef, "id" | "sheet" | "fps">): AnimStateDef {
  return {
    loop: true, next: "idle", priority: 1, blend: 0.12,
    impactFrames: [], motion: NO_MOTION, substitute: "",
    ...d,
  };
}

/** The whole machine, as data. */
export const ANIM_STATES: Readonly<Record<AnimStateId, AnimStateDef>> = {
  idle: def({
    id: "idle", sheet: "idle", fps: 6, priority: 0, blend: 0.16,
    motion: { ...NO_MOTION, bobHz: 0.55, bobAmp: 1.5 },
  }),
  walk: def({
    id: "walk", sheet: "walk", fps: 12, priority: 1, blend: 0.10,
    motion: { ...NO_MOTION, bobHz: 6, bobAmp: 2 },
  }),
  gather_fish: def({
    id: "gather_fish", sheet: "fish", fps: 8, priority: 2, blend: 0.16,
  }),
  gather_chop: def({
    id: "gather_chop", sheet: "chop", fps: 12, priority: 2, blend: 0.14,
    impactFrames: [6],
  }),
  gather_mine: def({
    id: "gather_mine", sheet: "chop", fps: 10, priority: 2, blend: 0.14,
    impactFrames: [6],
    substitute: "no mining sheet yet — plays the chop swing slightly slower",
  }),
  attack: def({
    id: "attack", sheet: "chop", fps: 16, loop: false, priority: 3, blend: 0.06,
    impactFrames: [5, 6],
    substitute: "no attack sheet yet — one fast pass of the chop swing",
  }),
  hurt: def({
    id: "hurt", sheet: "idle", fps: 12, loop: false, priority: 4, blend: 0.04,
    motion: { ...NO_MOTION, recoil: 14, flash: 1 },
    substitute: "no hurt sheet yet — idle plus a recoil shove and a red flash",
  }),
  celebrate: def({
    id: "celebrate", sheet: "idle", fps: 9, loop: false, priority: 3, blend: 0.12,
    motion: { ...NO_MOTION, hop: 26, bobHz: 0, bobAmp: 0 },
    substitute: "no celebrate sheet yet — idle plus a hop arc",
  }),
};

export interface AnimPlayOptions {
  /** Fires when a one-shot reaches its last frame (never for loops). */
  onComplete?: (() => void) | undefined;
  /** Restart even if this state is already playing. */
  restart?: boolean;
  /** Playback rate multiplier — walk speeds this with movement. */
  speed?: number;
  /** Ignore the priority gate (used by cancel/force paths). */
  force?: boolean;
}

/** Drives one actor's frame selection. Allocation-free per update. */
export class Animator {
  private pack: SheetPack;

  state: AnimStateId = "idle";
  def: AnimStateDef = ANIM_STATES.idle;
  sheet: LoadedSheet | null = null;
  frame = 0;

  /** Outgoing pose kept alive for the crossfade. */
  fromSheet: LoadedSheet | null = null;
  fromFrame = 0;
  /** 0 → fully the old pose, 1 → fully the new one. */
  blend = 1;

  /** 0..1 through the current clip (one-shots) or the current loop. */
  progress = 0;

  /** Raised once per impact frame. Set by the owner, never allocated. */
  onImpact: ((frame: number) => void) | null = null;

  private speed = 1;
  private clock = 0;
  private blendDur = 0.12;
  private done = false;
  private onComplete: (() => void) | null = null;

  constructor(pack: SheetPack) {
    this.pack = pack;
    this.applyState(ANIM_STATES.idle);
  }

  /** Frames in the current clip (1 when the sheet is missing). */
  get frameCount(): number { return this.sheet ? this.sheet.def.frames : 1; }

  /** Seconds one full pass takes. */
  get duration(): number { return this.frameCount / this.def.fps; }

  play(state: AnimStateId, opts?: AnimPlayOptions): boolean {
    const next = ANIM_STATES[state];
    if (!next) return false;

    const sameState = state === this.state;
    if (sameState && !opts?.restart) {
      // Keep playing, but let a caller refresh the completion hook.
      if (opts && "onComplete" in opts) this.onComplete = opts.onComplete ?? null;
      this.speed = opts?.speed ?? this.speed;
      return true;
    }
    // A live one-shot of higher priority holds the floor.
    if (!opts?.force && !this.done && !this.def.loop && next.priority < this.def.priority) return false;

    this.fromSheet = this.sheet;
    this.fromFrame = this.frame;
    this.blend = next.blend > 0 && this.fromSheet ? 0 : 1;
    this.blendDur = Math.max(0.001, next.blend);

    this.onComplete = opts?.onComplete ?? null;
    this.speed = opts?.speed ?? 1;
    this.applyState(next);
    return true;
  }

  /** Drop the current one-shot and settle back to a loop. */
  cancel(to: AnimStateId = "idle"): void {
    this.onComplete = null;
    this.play(to, { force: true });
  }

  setSpeed(mult: number): void { this.speed = mult; }

  update(dt: number): void {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      if (this.blend >= 1) this.fromSheet = null;
    }
    if (this.done) { this.progress = 1; return; }

    this.clock += dt * this.speed;
    const count = this.frameCount;
    const dur = count / this.def.fps;
    const raw = this.clock / dur;

    if (this.def.loop) {
      this.progress = raw % 1;
      this.setFrame(Math.floor(this.progress * count) % count);
      return;
    }

    if (raw >= 1) {
      this.progress = 1;
      this.setFrame(count - 1);
      this.done = true;
      const cb = this.onComplete;
      this.onComplete = null;
      const fallback = this.def.next;
      if (cb) cb();
      // A callback may have queued its own state; only fall through if not.
      if (this.done && this.state === this.def.id) this.play(fallback, { force: true });
      return;
    }
    this.progress = raw;
    this.setFrame(Math.min(count - 1, Math.floor(raw * count)));
  }

  private setFrame(i: number): void {
    if (i === this.frame) return;
    this.frame = i;
    const impacts = this.def.impactFrames;
    if (impacts.length && this.onImpact) {
      for (let k = 0; k < impacts.length; k++) {
        if (impacts[k] === i) { this.onImpact(i); break; }
      }
    }
  }

  private applyState(d: AnimStateDef): void {
    this.def = d;
    this.state = d.id;
    this.sheet = this.pack.get(d.sheet) ?? this.pack.get("idle");
    this.clock = 0;
    this.progress = 0;
    this.done = false;
    this.frame = -1;
    this.setFrame(0);
  }
}

/* ─────────────── motion helpers (pure, no allocation) ─────────────── */

/** Vertical offset in design units for the current pose. */
export function motionOffsetY(a: Animator, t: number): number {
  const m = a.def.motion;
  let y = 0;
  if (m.bobAmp > 0) y -= Math.abs(Math.sin(t * Math.PI * m.bobHz)) * m.bobAmp;
  if (m.hop > 0) {
    const p = a.progress;
    y -= Math.sin(p * Math.PI) * m.hop;
  }
  return y;
}

/** Horizontal shove in design units, already signed by facing. */
export function motionOffsetX(a: Animator, facing: number): number {
  const m = a.def.motion;
  if (m.recoil <= 0) return 0;
  const p = a.progress;
  return -facing * m.recoil * Math.max(0, 1 - p) * (p < 0.15 ? p / 0.15 : 1);
}

/** 0..1 hit-flash strength for the current pose. */
export function motionFlash(a: Animator): number {
  const m = a.def.motion;
  if (m.flash <= 0) return 0;
  return m.flash * Math.max(0, 1 - a.progress * 1.6);
}
