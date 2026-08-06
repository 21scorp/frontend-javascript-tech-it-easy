/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/camera.ts
   Portrait camera over a tall strip.

   THE RULE THAT COST US ONCE ALREADY: the camera is COVER-fit, not
   contain-fit. Zoom is clamped so the world always covers the frame
   in BOTH axes; there is no zoom level that can reveal a letterbox
   bar, because the minimum zoom is derived from the world size and
   recomputed on every resize. Since the world is exactly DESIGN_W
   wide, minZoom lands on 1.0 on phones — pinching out simply stops.

   Everything here is in design units. Device pixels are the
   viewport's business, never ours.
   ═══════════════════════════════════════════════════════════════ */

import type { Container } from "pixi.js";
import type { Viewport } from "../core/viewport";
import { DESIGN_W } from "../core/viewport";
import { clamp } from "./rng";

export interface CameraOptions {
  world: Container;
  viewport: Viewport;
  worldW: number;
  worldH: number;
  /** Hard ceiling on zoom-in. */
  maxZoom?: number;
  /** Seconds of no touching before the camera resumes following. */
  resumeAfter?: number;
}

export interface Vec2 { x: number; y: number }
export interface RectLike { x: number; y: number; w: number; h: number }

/** Movement past this many design units turns a tap into a pan. */
const DRAG_SLOP = 14;
/** Follow stiffness — higher snaps harder. Tuned to feel attached
    without whipping when the player changes direction. */
const FOLLOW_K = 6.5;
/** The player can drift this far from centre before the camera
    bothers to move. Kills micro-jitter on idle animations. */
const DEADZONE_X = 40;
const DEADZONE_Y = 90;

export class Camera {
  readonly world: Container;
  private vp: Viewport;
  private worldW: number;
  private worldH: number;
  private maxZoom: number;
  private resumeAfter: number;

  /** Centre of the view, in world units. */
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 1;

  /** Visible view size in design units (stage space). */
  viewW = DESIGN_W;
  viewH = 1920;

  private target: Vec2 | null = null;
  private manualUntil = -1;
  private clock = 0;

  /** True when the current/last gesture travelled far enough to be a
      pan. Node tap handlers read this so a drag never harvests. */
  gestureWasPan = false;

  private pointers = new Map<number, { cx: number; cy: number }>();
  private dragging = false;
  private dragTravel = 0;
  private pinchDist = 0;
  private pinchZoom = 1;
  private pinchWorld: Vec2 = { x: 0, y: 0 };

  private canvas: HTMLCanvasElement;
  private offViewport: () => void;
  private detach: Array<() => void> = [];

  // Scratch objects — the camera is queried every frame by several
  // systems and must not allocate.
  private scratchA: Vec2 = { x: 0, y: 0 };
  private scratchB: Vec2 = { x: 0, y: 0 };
  private scratchRect: RectLike = { x: 0, y: 0, w: 0, h: 0 };

  constructor(opts: CameraOptions, canvas: HTMLCanvasElement) {
    this.world = opts.world;
    this.vp = opts.viewport;
    this.worldW = opts.worldW;
    this.worldH = opts.worldH;
    this.maxZoom = opts.maxZoom ?? 2.2;
    this.resumeAfter = opts.resumeAfter ?? 3.5;
    this.canvas = canvas;

    this.measure();
    this.zoom = this.minZoom;
    this.x = this.worldW / 2;
    this.y = this.worldH / 2;
    this.clampCentre();
    this.apply();

    this.offViewport = this.vp.onChange(() => {
      this.measure();
      this.setZoom(this.zoom);
      this.apply();
    });
    this.bindInput();
  }

  /* ── framing ──────────────────────────────────────────────── */

  private measure() {
    const m = this.vp.metrics;
    this.viewW = DESIGN_W;
    this.viewH = m.visibleH;
    // COVER fit: the larger of the two ratios guarantees no gap on
    // either axis. Contain fit (the min) is what produced bars.
    this.minZoom = Math.max(this.viewW / this.worldW, this.viewH / this.worldH);
  }

  setZoom(z: number, focusX?: number, focusY?: number) {
    const next = clamp(z, this.minZoom, Math.max(this.minZoom, this.maxZoom));
    if (focusX !== undefined && focusY !== undefined) {
      // Keep the focal world point pinned under the finger.
      const k = 1 - this.zoom / next;
      this.x += (focusX - this.x) * k;
      this.y += (focusY - this.y) * k;
    }
    this.zoom = next;
    this.clampCentre();
  }

  /** Centre cannot go anywhere that would expose an edge. */
  private clampCentre() {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    // After the zoom clamp these ranges are always valid, but a
    // degenerate viewport (0-height during rotation) must not produce
    // NaN — hence the min/max guard rather than a bare clamp.
    const loX = halfW, hiX = this.worldW - halfW;
    const loY = halfH, hiY = this.worldH - halfH;
    this.x = hiX >= loX ? clamp(this.x, loX, hiX) : this.worldW / 2;
    this.y = hiY >= loY ? clamp(this.y, loY, hiY) : this.worldH / 2;
  }

  private apply() {
    this.world.scale.set(this.zoom);
    this.world.position.set(
      Math.round((this.viewW / 2 - this.x * this.zoom) * 8) / 8,
      Math.round((this.viewH / 2 - this.y * this.zoom) * 8) / 8,
    );
  }

  /* ── following ────────────────────────────────────────────── */

  /** Attach to a live position object (an actor's transform). Pass
      null to free the camera. */
  follow(target: Vec2 | null) { this.target = target; }

  snapTo(x: number, y: number) {
    this.x = x; this.y = y;
    this.clampCentre();
    this.apply();
  }

  /** True while the player is driving the camera by hand. */
  get isManual() { return this.clock < this.manualUntil; }

  update(dt: number) {
    this.clock += dt;
    if (this.target && !this.isManual && !this.dragging) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      // Deadzone first, then exponential smoothing on the remainder.
      const wantX = Math.abs(dx) > DEADZONE_X ? dx - Math.sign(dx) * DEADZONE_X : 0;
      const wantY = Math.abs(dy) > DEADZONE_Y ? dy - Math.sign(dy) * DEADZONE_Y : 0;
      const k = 1 - Math.exp(-FOLLOW_K * dt);
      this.x += wantX * k;
      this.y += wantY * k;
      this.clampCentre();
    }
    this.apply();
  }

  /* ── conversions ──────────────────────────────────────────── */

  /** Stage/design space → world space. */
  toWorld(sx: number, sy: number, out: Vec2 = this.scratchA): Vec2 {
    out.x = (sx - this.world.position.x) / this.zoom;
    out.y = (sy - this.world.position.y) / this.zoom;
    return out;
  }

  /** World space → stage/design space. */
  toScreen(wx: number, wy: number, out: Vec2 = this.scratchB): Vec2 {
    out.x = wx * this.zoom + this.world.position.x;
    out.y = wy * this.zoom + this.world.position.y;
    return out;
  }

  /** Browser client coords → world space. */
  fromClient(clientX: number, clientY: number, out?: Vec2): Vec2 {
    const d = this.vp.toDesign(clientX, clientY);
    return this.toWorld(d.x, d.y, out);
  }

  /** World-space rect currently on screen. Shared scratch — read it,
      do not keep it. */
  visibleRect(pad = 0): RectLike {
    const halfW = this.viewW / (2 * this.zoom) + pad;
    const halfH = this.viewH / (2 * this.zoom) + pad;
    this.scratchRect.x = this.x - halfW;
    this.scratchRect.y = this.y - halfH;
    this.scratchRect.w = halfW * 2;
    this.scratchRect.h = halfH * 2;
    return this.scratchRect;
  }

  /* ── input ────────────────────────────────────────────────── */

  private bindInput() {
    const cv = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.detach.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    on(cv, "pointerdown", (e: PointerEvent) => {
      this.pointers.set(e.pointerId, { cx: e.clientX, cy: e.clientY });
      // A fresh gesture is innocent until it travels.
      if (this.pointers.size === 1) {
        this.gestureWasPan = false;
        this.dragging = true;
        this.dragTravel = 0;
      }
      if (this.pointers.size === 2) this.beginPinch();
    });

    on(window, "pointermove", (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const scale = this.vp.metrics.scale || 1;
      const dxDesign = (e.clientX - p.cx) / scale;
      const dyDesign = (e.clientY - p.cy) / scale;
      p.cx = e.clientX; p.cy = e.clientY;

      if (this.pointers.size >= 2) { this.updatePinch(); return; }

      this.dragTravel += Math.hypot(dxDesign, dyDesign);
      if (this.dragTravel > DRAG_SLOP) this.gestureWasPan = true;
      if (!this.gestureWasPan) return;

      // Drag moves the ground under the finger 1:1.
      this.x -= dxDesign / this.zoom;
      this.y -= dyDesign / this.zoom;
      this.clampCentre();
      this.markManual();
    });

    const release = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) {
        this.dragging = false;
        if (this.gestureWasPan) this.markManual();
      }
    };
    on(window, "pointerup", release);
    on(window, "pointercancel", release);

    on(cv, "wheel", (e: WheelEvent) => {
      e.preventDefault();
      const f = this.fromClient(e.clientX, e.clientY, this.scratchA);
      // Exponential so a notch feels the same at any zoom level.
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0016), f.x, f.y);
      this.markManual();
    }, { passive: false });
  }

  private markManual() { this.manualUntil = this.clock + this.resumeAfter; }

  private pinchMid(out: Vec2): Vec2 {
    let sx = 0, sy = 0, n = 0;
    for (const p of this.pointers.values()) { sx += p.cx; sy += p.cy; n++; }
    out.x = sx / n; out.y = sy / n;
    return out;
  }

  private pinchSpread(): number {
    const it = this.pointers.values();
    const a = it.next().value as { cx: number; cy: number } | undefined;
    const b = it.next().value as { cx: number; cy: number } | undefined;
    if (!a || !b) return 0;
    return Math.hypot(a.cx - b.cx, a.cy - b.cy);
  }

  private beginPinch() {
    this.pinchDist = this.pinchSpread();
    this.pinchZoom = this.zoom;
    const mid = this.pinchMid(this.scratchB);
    // Anchor on the world point between the fingers so the pinch
    // feels like stretching the map, not scrolling it.
    const w = this.fromClient(mid.x, mid.y, this.scratchA);
    this.pinchWorld.x = w.x; this.pinchWorld.y = w.y;
    this.gestureWasPan = true;
  }

  private updatePinch() {
    if (this.pinchDist <= 0) { this.beginPinch(); return; }
    const d = this.pinchSpread();
    if (d <= 0) return;
    this.setZoom(this.pinchZoom * (d / this.pinchDist), this.pinchWorld.x, this.pinchWorld.y);
    this.markManual();
  }

  destroy() {
    for (const off of this.detach) off();
    this.detach.length = 0;
    this.offViewport();
    this.pointers.clear();
    this.target = null;
  }
}
