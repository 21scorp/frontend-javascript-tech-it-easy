/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/input.ts
   One pointer layer for the whole game. Nothing else is allowed to
   add a touch listener.

   WHY it is shaped like this:
     • Mobile browsers deliver *pointer* events for touch, pen and
       mouse alike. We never touch `mousedown`/`touchstart` — the
       compatibility mouse events that follow a tap would double-fire
       every button in the game.
     • A gesture is a state machine, not a pile of booleans. A tap is
       only a tap if it ends without ever having become a drag, a
       long-press or half of a pinch. Firing a tap at the end of a
       pan is the single most-hated bug in mobile games, so "did this
       pointer get consumed" is tracked explicitly.
     • Movement slop is measured in SCREEN pixels (what the thumb
       actually did) while every emitted coordinate is in DESIGN
       units (what gameplay reasons about). Those are different
       spaces and conflating them makes the slop scale with DPI.
     • Pointers get lost: pointercancel from the OS, a scroll taking
       over, capture stolen by another element, the tab hiding
       mid-drag. Every one of those routes to the same cancel path.

   The DOM is behind a PointerSource so the state machine can be
   driven by synthetic sequences in tests with no browser at all.
   ═══════════════════════════════════════════════════════════════ */

import type { EventBus } from "../core/contracts";
import { realTimers } from "./timing";
import type { TimerApi } from "./timing";

/* ── seams ───────────────────────────────────────────────────── */

export type PointerPhase = "down" | "move" | "up" | "cancel";

export interface PointerSample {
  pointerId: number;
  /** Screen space, CSS px, page-relative. */
  x: number;
  y: number;
  pointerType: string;
  /** ms; monotonic within a gesture. */
  time: number;
}

export interface PointerSource {
  subscribe(fn: (phase: PointerPhase, sample: PointerSample) => void): () => void;
  /** Optional — DOM sources use it to keep receiving moves off-element. */
  capture?(pointerId: number): void;
  release?(pointerId: number): void;
  destroy?(): void;
}

/** Anything that can map screen px → design units. Viewport satisfies it. */
export interface DesignSpace {
  toDesign(clientX: number, clientY: number): { x: number; y: number };
}

/** Identity mapping, for tests and for headless tools. */
export const IDENTITY_SPACE: DesignSpace = { toDesign: (x, y) => ({ x, y }) };

/* ── emitted payloads ────────────────────────────────────────── */

export interface Vec2 {
  x: number;
  y: number;
}

/** All coordinates below are DESIGN units. */
export interface TapEvent extends Vec2 {
  pointerId: number;
  pointerType: string;
  /** ms the finger was down. Useful for "quick tap" feel checks. */
  duration: number;
}

export interface DragStartEvent extends Vec2 {
  pointerId: number;
  /** Where the finger first went down, design units. */
  originX: number;
  originY: number;
}

export interface DragEvent extends Vec2 {
  pointerId: number;
  /** Since the previous drag event. */
  dx: number;
  dy: number;
  /** Since dragstart. */
  totalDx: number;
  totalDy: number;
}

export interface DragEndEvent extends Vec2 {
  pointerId: number;
  totalDx: number;
  totalDy: number;
  /** Design units per second, for flick/inertia. */
  vx: number;
  vy: number;
  duration: number;
  /** True when the OS took the pointer away rather than the user lifting. */
  cancelled: boolean;
}

export type PinchPhase = "start" | "move" | "end";

export interface PinchEvent {
  phase: PinchPhase;
  /** Current distance ÷ distance at pinch start. 1 = unchanged. */
  scale: number;
  /** Change since the previous pinch event. */
  deltaScale: number;
  /** Midpoint between the two fingers, design units. */
  midX: number;
  midY: number;
  /** Midpoint travel since the previous event — two-finger pan. */
  midDx: number;
  midDy: number;
}

export interface LongPressEvent extends Vec2 {
  pointerId: number;
  pointerType: string;
}

export const INPUT_EVENTS = {
  tap: "input:tap",
  dragStart: "input:dragstart",
  drag: "input:drag",
  dragEnd: "input:dragend",
  pinch: "input:pinch",
  longPress: "input:longpress",
} as const;

/* ── tuning ──────────────────────────────────────────────────── */

export interface InputOptions {
  bus: EventBus;
  source: PointerSource;
  space?: DesignSpace;
  timers?: TimerApi;
  /** Screen px of travel allowed before a press stops being a tap. */
  tapSlopPx?: number;
  /** Longest a tap may last; beyond this it is a press, not a tap. */
  tapMaxMs?: number;
  /** How long a still finger must hold to fire longpress. */
  longPressMs?: number;
  /** Extra slop during the hold — thumbs wobble. */
  longPressSlopPx?: number;
  /** Below this ratio change a pinch is treated as a two-finger pan. */
  pinchDeadZone?: number;
}

const DEFAULTS = {
  tapSlopPx: 9,
  tapMaxMs: 500,
  longPressMs: 450,
  longPressSlopPx: 14,
  pinchDeadZone: 0.02,
};

/* ── internal per-pointer state ──────────────────────────────── */

interface Tracked {
  id: number;
  pointerType: string;
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  /** Design-space position of the previous emitted drag event. */
  prevDesignX: number;
  prevDesignY: number;
  maxTravel: number;
  dragging: boolean;
  /** Set once this pointer can no longer produce a tap. */
  consumed: boolean;
  longPressHandle: number | null;
  longPressFired: boolean;
}

export class InputService {
  private readonly bus: EventBus;
  private readonly source: PointerSource;
  private readonly space: DesignSpace;
  private readonly timers: TimerApi;
  private readonly tapSlopPx: number;
  private readonly tapMaxMs: number;
  private readonly longPressMs: number;
  private readonly longPressSlopPx: number;
  private readonly pinchDeadZone: number;

  private readonly pointers = new Map<number, Tracked>();
  /** Pointer ids participating in the active pinch, in contact order. */
  private pinchPair: [number, number] | null = null;
  private pinchStartDist = 0;
  private pinchLastScale = 1;
  private pinchLastMid: Vec2 = { x: 0, y: 0 };

  private unsubscribe: (() => void) | null = null;
  private enabled = true;

  constructor(opts: InputOptions) {
    this.bus = opts.bus;
    this.source = opts.source;
    this.space = opts.space ?? IDENTITY_SPACE;
    this.timers = opts.timers ?? realTimers;
    this.tapSlopPx = opts.tapSlopPx ?? DEFAULTS.tapSlopPx;
    this.tapMaxMs = opts.tapMaxMs ?? DEFAULTS.tapMaxMs;
    this.longPressMs = opts.longPressMs ?? DEFAULTS.longPressMs;
    this.longPressSlopPx = opts.longPressSlopPx ?? DEFAULTS.longPressSlopPx;
    this.pinchDeadZone = opts.pinchDeadZone ?? DEFAULTS.pinchDeadZone;
  }

  /** Begin listening. Idempotent. */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.source.subscribe((phase, s) => this.handle(phase, s));
  }

  /**
   * Stop routing input without tearing the service down — used while a
   * blocking modal or the rotate guard owns the screen. Any in-flight
   * gesture is cancelled so nothing is left half-open.
   */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) this.cancelAll();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  get activePointerCount(): number {
    return this.pointers.size;
  }

  isDragging(): boolean {
    for (const p of this.pointers.values()) if (p.dragging) return true;
    return false;
  }

  isPinching(): boolean {
    return this.pinchPair !== null;
  }

  destroy(): void {
    this.cancelAll();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.source.destroy?.();
  }

  /* ── state machine ─────────────────────────────────────────── */

  private handle(phase: PointerPhase, s: PointerSample): void {
    if (!this.enabled) return;
    switch (phase) {
      case "down":
        this.onDown(s);
        break;
      case "move":
        this.onMove(s);
        break;
      case "up":
        this.onUp(s, false);
        break;
      case "cancel":
        this.onUp(s, true);
        break;
    }
  }

  private onDown(s: PointerSample): void {
    // A duplicate down for a live id means we missed an up. Reset it.
    if (this.pointers.has(s.pointerId)) this.finishPointer(s.pointerId, s, true);

    const d = this.space.toDesign(s.x, s.y);
    const t: Tracked = {
      id: s.pointerId,
      pointerType: s.pointerType,
      startX: s.x,
      startY: s.y,
      startTime: s.time,
      lastX: s.x,
      lastY: s.y,
      lastTime: s.time,
      prevDesignX: d.x,
      prevDesignY: d.y,
      maxTravel: 0,
      dragging: false,
      consumed: false,
      longPressHandle: null,
      longPressFired: false,
    };
    this.pointers.set(s.pointerId, t);
    this.source.capture?.(s.pointerId);

    if (this.pointers.size === 1) {
      this.armLongPress(t);
    } else if (this.pointers.size === 2 && !this.pinchPair) {
      this.beginPinch();
    } else {
      // Third finger and beyond: ignore, but make sure it can't tap.
      t.consumed = true;
      this.disarmLongPress(t);
    }
  }

  private onMove(s: PointerSample): void {
    const t = this.pointers.get(s.pointerId);
    if (!t) return;

    const travel = Math.hypot(s.x - t.startX, s.y - t.startY);
    t.maxTravel = Math.max(t.maxTravel, travel);
    t.lastX = s.x;
    t.lastY = s.y;
    t.lastTime = s.time;

    // Wandering past the hold slop kills a pending long-press.
    if (t.longPressHandle !== null && travel > this.longPressSlopPx) this.disarmLongPress(t);

    if (this.pinchPair) {
      this.updatePinch();
      return;
    }

    if (!t.dragging) {
      if (travel <= this.tapSlopPx) return;
      t.dragging = true;
      t.consumed = true;
      this.disarmLongPress(t);
      const origin = this.space.toDesign(t.startX, t.startY);
      const d = this.space.toDesign(s.x, s.y);
      t.prevDesignX = d.x;
      t.prevDesignY = d.y;
      const payload: DragStartEvent = {
        pointerId: t.id,
        x: d.x,
        y: d.y,
        originX: origin.x,
        originY: origin.y,
      };
      this.bus.emit(INPUT_EVENTS.dragStart, payload);
      return;
    }

    const d = this.space.toDesign(s.x, s.y);
    const origin = this.space.toDesign(t.startX, t.startY);
    const payload: DragEvent = {
      pointerId: t.id,
      x: d.x,
      y: d.y,
      dx: d.x - t.prevDesignX,
      dy: d.y - t.prevDesignY,
      totalDx: d.x - origin.x,
      totalDy: d.y - origin.y,
    };
    t.prevDesignX = d.x;
    t.prevDesignY = d.y;
    this.bus.emit(INPUT_EVENTS.drag, payload);
  }

  private onUp(s: PointerSample, cancelled: boolean): void {
    const t = this.pointers.get(s.pointerId);
    if (!t) return;
    t.lastX = s.x;
    t.lastY = s.y;
    t.lastTime = s.time;
    this.finishPointer(s.pointerId, s, cancelled);
  }

  private finishPointer(id: number, s: PointerSample, cancelled: boolean): void {
    const t = this.pointers.get(id);
    if (!t) return;

    this.disarmLongPress(t);
    this.pointers.delete(id);
    this.source.release?.(id);

    const inPinch = this.pinchPair !== null && (this.pinchPair[0] === id || this.pinchPair[1] === id);
    if (inPinch) {
      this.endPinch();
      // The finger still on glass must not become a tap or a drag.
      for (const other of this.pointers.values()) {
        other.consumed = true;
        other.dragging = false;
        this.disarmLongPress(other);
      }
      return;
    }

    if (t.dragging) {
      const d = this.space.toDesign(s.x, s.y);
      const origin = this.space.toDesign(t.startX, t.startY);
      const duration = Math.max(1, s.time - t.startTime);
      const payload: DragEndEvent = {
        pointerId: id,
        x: d.x,
        y: d.y,
        totalDx: d.x - origin.x,
        totalDy: d.y - origin.y,
        vx: ((d.x - origin.x) / duration) * 1000,
        vy: ((d.y - origin.y) / duration) * 1000,
        duration,
        cancelled,
      };
      this.bus.emit(INPUT_EVENTS.dragEnd, payload);
      return;
    }

    if (cancelled || t.consumed || t.longPressFired) return;

    const duration = s.time - t.startTime;
    if (t.maxTravel > this.tapSlopPx || duration > this.tapMaxMs) return;

    const d = this.space.toDesign(s.x, s.y);
    const payload: TapEvent = {
      pointerId: id,
      pointerType: t.pointerType,
      x: d.x,
      y: d.y,
      duration,
    };
    this.bus.emit(INPUT_EVENTS.tap, payload);
  }

  /** OS-level loss, tab hide, or setEnabled(false). Nothing is left open. */
  cancelAll(): void {
    const ids = [...this.pointers.keys()];
    for (const id of ids) {
      const t = this.pointers.get(id);
      if (!t) continue;
      this.finishPointer(id, {
        pointerId: id,
        x: t.lastX,
        y: t.lastY,
        pointerType: t.pointerType,
        time: t.lastTime,
      }, true);
    }
    this.pointers.clear();
    if (this.pinchPair) this.endPinch();
  }

  /* ── long press ────────────────────────────────────────────── */

  private armLongPress(t: Tracked): void {
    t.longPressHandle = this.timers.setTimeout(() => {
      t.longPressHandle = null;
      if (t.dragging || t.consumed || this.pinchPair) return;
      t.longPressFired = true;
      t.consumed = true; // a long-press never also produces a tap
      const d = this.space.toDesign(t.lastX, t.lastY);
      const payload: LongPressEvent = {
        pointerId: t.id,
        pointerType: t.pointerType,
        x: d.x,
        y: d.y,
      };
      this.bus.emit(INPUT_EVENTS.longPress, payload);
    }, this.longPressMs);
  }

  private disarmLongPress(t: Tracked): void {
    if (t.longPressHandle === null) return;
    this.timers.clearTimeout(t.longPressHandle);
    t.longPressHandle = null;
  }

  /* ── pinch ─────────────────────────────────────────────────── */

  private twoPointers(): [Tracked, Tracked] | null {
    if (!this.pinchPair) return null;
    const a = this.pointers.get(this.pinchPair[0]);
    const b = this.pointers.get(this.pinchPair[1]);
    return a && b ? [a, b] : null;
  }

  private beginPinch(): void {
    const ids = [...this.pointers.keys()];
    const first = ids[0];
    const second = ids[1];
    if (first === undefined || second === undefined) return;
    this.pinchPair = [first, second];

    const pair = this.twoPointers();
    if (!pair) {
      this.pinchPair = null;
      return;
    }
    const [a, b] = pair;

    // A pinch supersedes whatever those fingers were doing.
    for (const t of [a, b]) {
      this.disarmLongPress(t);
      if (t.dragging) {
        t.dragging = false;
        const d = this.space.toDesign(t.lastX, t.lastY);
        const origin = this.space.toDesign(t.startX, t.startY);
        const duration = Math.max(1, t.lastTime - t.startTime);
        const payload: DragEndEvent = {
          pointerId: t.id,
          x: d.x,
          y: d.y,
          totalDx: d.x - origin.x,
          totalDy: d.y - origin.y,
          vx: 0,
          vy: 0,
          duration,
          cancelled: true,
        };
        this.bus.emit(INPUT_EVENTS.dragEnd, payload);
      }
      t.consumed = true;
    }

    this.pinchStartDist = Math.max(1e-3, Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY));
    this.pinchLastScale = 1;
    this.pinchLastMid = this.midpoint(a, b);
    const payload: PinchEvent = {
      phase: "start",
      scale: 1,
      deltaScale: 0,
      midX: this.pinchLastMid.x,
      midY: this.pinchLastMid.y,
      midDx: 0,
      midDy: 0,
    };
    this.bus.emit(INPUT_EVENTS.pinch, payload);
  }

  private midpoint(a: Tracked, b: Tracked): Vec2 {
    return this.space.toDesign((a.lastX + b.lastX) / 2, (a.lastY + b.lastY) / 2);
  }

  private updatePinch(): void {
    const pair = this.twoPointers();
    if (!pair) return;
    const [a, b] = pair;
    const dist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
    const scale = dist / this.pinchStartDist;
    const mid = this.midpoint(a, b);
    const deltaScale = scale - this.pinchLastScale;
    const midDx = mid.x - this.pinchLastMid.x;
    const midDy = mid.y - this.pinchLastMid.y;

    // Inside the dead zone the fingers are panning, not zooming; report
    // scale 1 so a shaky two-finger drag never nudges the camera zoom.
    const reported = Math.abs(scale - 1) < this.pinchDeadZone ? 1 : scale;

    this.pinchLastScale = scale;
    this.pinchLastMid = mid;
    const payload: PinchEvent = {
      phase: "move",
      scale: reported,
      deltaScale,
      midX: mid.x,
      midY: mid.y,
      midDx,
      midDy,
    };
    this.bus.emit(INPUT_EVENTS.pinch, payload);
  }

  private endPinch(): void {
    if (!this.pinchPair) return;
    this.pinchPair = null;
    const payload: PinchEvent = {
      phase: "end",
      scale: this.pinchLastScale,
      deltaScale: 0,
      midX: this.pinchLastMid.x,
      midY: this.pinchLastMid.y,
      midDx: 0,
      midDy: 0,
    };
    this.pinchStartDist = 0;
    this.bus.emit(INPUT_EVENTS.pinch, payload);
  }
}

/* ── DOM source ──────────────────────────────────────────────── */

export interface DomPointerSourceOptions {
  /** Element that receives `pointerdown`. Normally the portrait frame. */
  element: HTMLElement;
  /** Where move/up/cancel are observed. Window keeps drags alive off-frame. */
  window?: Window;
  /** Set touch-action:none so the browser never steals the gesture. */
  manageTouchAction?: boolean;
  /** Suppress the Android long-press context menu. */
  suppressContextMenu?: boolean;
}

/**
 * Pointer events only. Deliberately no mouse/touch fallbacks: every
 * browser this game ships to has PointerEvent, and mixing families is
 * how you get phantom double-taps.
 */
export function domPointerSource(opts: DomPointerSourceOptions): PointerSource {
  const el = opts.element;
  const win = opts.window ?? window;
  const listeners = new Set<(phase: PointerPhase, s: PointerSample) => void>();
  const disposers: (() => void)[] = [];

  if (opts.manageTouchAction !== false) {
    // Without this, Chrome for Android hands the first 100ms of every
    // drag to its own scroller and the game misses the gesture start.
    el.style.touchAction = "none";
    el.style.setProperty("-webkit-user-select", "none");
    el.style.userSelect = "none";
  }

  const toSample = (e: PointerEvent): PointerSample => ({
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    pointerType: e.pointerType || "touch",
    time: e.timeStamp || performance.now(),
  });

  const fan = (phase: PointerPhase, e: PointerEvent) => {
    const s = toSample(e);
    for (const fn of listeners) fn(phase, s);
  };

  const add = (
    target: EventTarget,
    type: string,
    fn: (e: Event) => void,
    options?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn, options);
    disposers.push(() => target.removeEventListener(type, fn, options));
  };

  add(el, "pointerdown", (e) => {
    const pe = e as PointerEvent;
    // Right/middle mouse buttons are not gameplay input.
    if (pe.pointerType === "mouse" && pe.button !== 0) return;
    pe.preventDefault();
    fan("down", pe);
  }, { passive: false });

  // Moves and releases live on the window: a finger that slides past the
  // frame edge mid-drag must keep steering, and an up outside the frame
  // must still close the gesture.
  add(win, "pointermove", (e) => fan("move", e as PointerEvent), { passive: false });
  add(win, "pointerup", (e) => fan("up", e as PointerEvent));
  add(win, "pointercancel", (e) => fan("cancel", e as PointerEvent));
  add(el, "lostpointercapture", (e) => fan("cancel", e as PointerEvent));

  if (opts.suppressContextMenu !== false) {
    add(el, "contextmenu", (e) => e.preventDefault());
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    capture(id) {
      try {
        el.setPointerCapture(id);
      } catch {
        /* pointer already gone — cancel path handles it */
      }
    },
    release(id) {
      try {
        if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      } catch {
        /* nothing to release */
      }
    },
    destroy() {
      for (const d of disposers) d();
      disposers.length = 0;
      listeners.clear();
    },
  };
}
