/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — viewport.ts
   PORTRAIT IS LAW.

   The game is authored against a fixed portrait design space
   (DESIGN_W × DESIGN_H). The viewport fits that space to the
   device by width, so the world always spans the full screen
   width and taller phones simply see more vertical world.

   Landscape phones get a rotate guard. Wide desktops get a
   centred portrait frame rather than a stretched one — the game
   is never played sideways.
   ═══════════════════════════════════════════════════════════════ */

/** Authoring space. All gameplay coordinates are in these units. */
export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

/** Widest portrait frame we will ever draw (3:4). Beyond this we
    letterbox horizontally instead of turning the game landscape. */
const MAX_FRAME_RATIO = 0.75;

/** Below this width/height ratio the device is treated as portrait. */
const PORTRAIT_MAX_RATIO = 1.0;

/** A device narrow enough that landscape is genuinely unusable. */
const PHONE_MAX_SHORT_EDGE = 560;

export interface ViewportMetrics {
  /** CSS pixels of the drawable frame. */
  frameW: number;
  frameH: number;
  /** design units → CSS pixels */
  scale: number;
  /** Device pixel ratio actually used for the backing store. */
  dpr: number;
  /** Visible design-space height (>= DESIGN_H on tall screens). */
  visibleH: number;
  /** Safe-area insets in design units. */
  safeTop: number;
  safeBottom: number;
  /** True while the rotate guard is showing. */
  blocked: boolean;
}

type Listener = (m: ViewportMetrics) => void;

function readInset(name: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;visibility:hidden;height:env(${name},0px);`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

export class Viewport {
  private listeners = new Set<Listener>();
  private frame: HTMLElement;
  private guard: HTMLElement;
  metrics: ViewportMetrics = {
    frameW: DESIGN_W, frameH: DESIGN_H, scale: 1, dpr: 1,
    visibleH: DESIGN_H, safeTop: 0, safeBottom: 0, blocked: false,
  };

  constructor(frame: HTMLElement, guard: HTMLElement) {
    this.frame = frame;
    this.guard = guard;

    const relayout = () => this.measure();
    window.addEventListener("resize", relayout);
    window.addEventListener("orientationchange", () => setTimeout(relayout, 120));
    // Mobile browser chrome sliding away changes the real height.
    window.visualViewport?.addEventListener("resize", relayout);
    screen.orientation?.addEventListener?.("change", () => setTimeout(relayout, 120));

    this.requestNativeLock();
    this.measure();
  }

  /** Ask the platform to hard-lock portrait. Works in installed PWAs
      and fullscreen; silently unsupported elsewhere (we still guard). */
  private async requestNativeLock() {
    try {
      const o = screen.orientation as (ScreenOrientation & {
        lock?: (t: string) => Promise<void>;
      }) | undefined;
      await o?.lock?.("portrait");
    } catch {
      /* not permitted outside fullscreen — the guard covers us */
    }
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private measure() {
    const vv = window.visualViewport;
    const winW = Math.round(vv?.width ?? window.innerWidth);
    const winH = Math.round(vv?.height ?? window.innerHeight);

    const ratio = winW / winH;
    const shortEdge = Math.min(winW, winH);
    // A phone held sideways: block. A wide desktop: letterbox politely.
    const isPhoneLandscape = ratio > PORTRAIT_MAX_RATIO && shortEdge <= PHONE_MAX_SHORT_EDGE;

    this.guard.hidden = !isPhoneLandscape;
    document.body.classList.toggle("is-blocked", isPhoneLandscape);

    // Portrait frame: full width on phones, centred column on desktop.
    const frameW = Math.min(winW, Math.round(winH * MAX_FRAME_RATIO));
    const frameH = winH;
    const scale = frameW / DESIGN_W;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    const safeTop = readInset("safe-area-inset-top") / scale;
    const safeBottom = readInset("safe-area-inset-bottom") / scale;

    this.frame.style.width = `${frameW}px`;
    this.frame.style.height = `${frameH}px`;

    this.metrics = {
      frameW, frameH, scale, dpr,
      visibleH: frameH / scale,
      safeTop, safeBottom,
      blocked: isPhoneLandscape,
    };
    for (const fn of this.listeners) fn(this.metrics);
  }

  /** Screen (CSS px, page-relative) → design units. */
  toDesign(clientX: number, clientY: number) {
    const r = this.frame.getBoundingClientRect();
    const { scale } = this.metrics;
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  /** Design units → screen (CSS px, page-relative). */
  toScreen(x: number, y: number) {
    const r = this.frame.getBoundingClientRect();
    const { scale } = this.metrics;
    return { x: r.left + x * scale, y: r.top + y * scale };
  }
}
