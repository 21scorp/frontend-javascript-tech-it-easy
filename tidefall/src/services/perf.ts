/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/perf.ts
   Frame budget watchdog and the auto-degrade policy.

   WHY it is not "if (fps < 50) turn things off":
     • Instantaneous FPS is noise. A GC pause, a texture upload or the
       OS scheduling another app all spike one frame. We degrade on a
       ROLLING AVERAGE held below target for a sustained window, and
       recover only after a much longer clean window — asymmetric
       hysteresis, so quality never oscillates in front of the player.
     • The first second of frames is always bad (shader compiles,
       first uploads). A warmup period is skipped entirely, otherwise
       every device on earth boots into "low".
     • Degrading is a ratchet with LEVELS, not a boolean: tier goes
       high→mid→low, and once at low we keep raising `level` so
       systems can shed progressively (particles, then shadows, then
       weather) rather than all-or-nothing.
     • p95 matters more than the mean for feel — a 60fps average with
       regular 120ms hitches is a worse game than a steady 45.
   ═══════════════════════════════════════════════════════════════ */

import { detectQuality } from "../core/contracts";
import type { EventBus, QualityTier } from "../core/contracts";
import { realClock } from "./timing";
import type { Clock } from "./timing";

const TIER_ORDER: QualityTier[] = ["low", "mid", "high"];

export interface PerfStats {
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  worstFrameMs: number;
  tier: QualityTier;
  /** How many degrade steps have been applied. 0 = untouched. */
  level: number;
  samples: number;
  /** Frames whose cost exceeded the budget, since boot. */
  hitches: number;
}

export interface PerfDegradeEvent {
  tier: QualityTier;
  level: number;
  fps: number;
  reason: "sustained-low-fps" | "hitching";
}

export interface PerfRecoverEvent {
  tier: QualityTier;
  level: number;
  fps: number;
}

export const PERF_EVENTS = {
  degrade: "perf:degrade",
  recover: "perf:recover",
  stats: "perf:stats",
} as const;

export interface PerfOptions {
  bus?: EventBus;
  /** Starting tier. Defaults to detectQuality(dpr). */
  tier?: QualityTier;
  dpr?: number;
  /** Frames averaged. 120 ≈ 2s at 60fps. */
  windowSize?: number;
  /** Below this average FPS we consider the device struggling. */
  degradeBelowFps?: number;
  /** Above this average FPS we consider it comfortable again. */
  recoverAboveFps?: number;
  /** How long the average must stay low before acting. */
  sustainMs?: number;
  /** How long it must stay good before undoing a degrade. */
  recoverMs?: number;
  /** Frames ignored at startup while caches warm. */
  warmupFrames?: number;
  /** A frame costing more than this counts as a hitch. */
  hitchMs?: number;
  /** Max degrade steps. Beyond this we stop asking systems for more. */
  maxLevel?: number;
  /** How often `perf:stats` is emitted. */
  statsEveryMs?: number;
  now?: Clock;
}

export class PerfService {
  private readonly bus?: EventBus;
  private readonly window: number;
  private readonly degradeBelow: number;
  private readonly recoverAbove: number;
  private readonly sustainMs: number;
  private readonly recoverMs: number;
  private readonly warmupFrames: number;
  private readonly hitchMs: number;
  private readonly maxLevel: number;
  private readonly statsEveryMs: number;
  private readonly now: Clock;

  /** Ring buffer of frame costs in ms. */
  private readonly ring: Float64Array;
  private ringIndex = 0;
  private ringCount = 0;
  private ringSum = 0;

  private frames = 0;
  private hitches = 0;
  private worst = 0;
  private tierValue: QualityTier;
  private level = 0;

  private lowSince: number | null = null;
  private goodSince: number | null = null;
  private lastStatsAt = 0;
  /** Player chose a fixed quality — auto-degrade must not fight them. */
  private locked = false;

  constructor(opts: PerfOptions = {}) {
    this.bus = opts.bus;
    this.window = Math.max(8, opts.windowSize ?? 120);
    this.degradeBelow = opts.degradeBelowFps ?? 45;
    this.recoverAbove = opts.recoverAboveFps ?? 56;
    this.sustainMs = opts.sustainMs ?? 2500;
    this.recoverMs = opts.recoverMs ?? 10000;
    this.warmupFrames = opts.warmupFrames ?? 90;
    this.hitchMs = opts.hitchMs ?? 34;
    this.maxLevel = opts.maxLevel ?? 3;
    this.statsEveryMs = opts.statsEveryMs ?? 1000;
    this.now = opts.now ?? realClock;
    this.ring = new Float64Array(this.window);
    this.tierValue =
      opts.tier ?? detectQuality(opts.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
  }

  get tier(): QualityTier {
    return this.tierValue;
  }

  get degradeLevel(): number {
    return this.level;
  }

  get fps(): number {
    const avg = this.avgFrameMs;
    return avg > 0 ? 1000 / avg : 0;
  }

  get avgFrameMs(): number {
    return this.ringCount ? this.ringSum / this.ringCount : 0;
  }

  get p95FrameMs(): number {
    if (!this.ringCount) return 0;
    const copy = Array.from(this.ring.subarray(0, this.ringCount)).sort((a, b) => a - b);
    const idx = Math.min(copy.length - 1, Math.floor(copy.length * 0.95));
    return copy[idx] ?? 0;
  }

  /**
   * Call once per rendered frame with the frame's cost in ms
   * (Pixi: `ticker.deltaMS`).
   */
  frame(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    // A tab that was backgrounded returns one enormous delta; it says
    // nothing about the device and would instantly trigger a degrade.
    const cost = Math.min(deltaMs, 1000);
    this.frames++;

    const old = this.ring[this.ringIndex] ?? 0;
    this.ring[this.ringIndex] = cost;
    this.ringIndex = (this.ringIndex + 1) % this.window;
    if (this.ringCount < this.window) {
      this.ringCount++;
      this.ringSum += cost;
    } else {
      this.ringSum += cost - old;
    }

    if (cost > this.hitchMs) this.hitches++;
    if (cost > this.worst) this.worst = cost;

    if (this.frames <= this.warmupFrames) return;
    if (this.ringCount < Math.min(this.window, 30)) return;

    const t = this.now();
    this.evaluate(t);

    if (t - this.lastStatsAt >= this.statsEveryMs) {
      this.lastStatsAt = t;
      this.bus?.emit(PERF_EVENTS.stats, this.stats());
    }
  }

  private evaluate(t: number): void {
    if (this.locked) return;
    const fps = this.fps;

    if (fps < this.degradeBelow) {
      this.goodSince = null;
      if (this.lowSince === null) this.lowSince = t;
      else if (t - this.lowSince >= this.sustainMs && this.level < this.maxLevel) {
        this.applyDegrade(fps, "sustained-low-fps");
        this.lowSince = t; // restart the window; degrade one step at a time
      }
      return;
    }

    if (fps > this.recoverAbove) {
      this.lowSince = null;
      if (this.goodSince === null) this.goodSince = t;
      else if (t - this.goodSince >= this.recoverMs && this.level > 0) {
        this.applyRecover(fps);
        this.goodSince = t;
      }
      return;
    }

    // Between the two thresholds: the device is exactly where we want
    // it. Hold everything, and let neither timer accumulate.
    this.lowSince = null;
    this.goodSince = null;
  }

  private applyDegrade(fps: number, reason: PerfDegradeEvent["reason"]): void {
    this.level = Math.min(this.maxLevel, this.level + 1);
    this.tierValue = stepTier(this.tierValue, -1);
    const payload: PerfDegradeEvent = { tier: this.tierValue, level: this.level, fps, reason };
    this.bus?.emit(PERF_EVENTS.degrade, payload);
  }

  private applyRecover(fps: number): void {
    this.level = Math.max(0, this.level - 1);
    this.tierValue = stepTier(this.tierValue, 1);
    const payload: PerfRecoverEvent = { tier: this.tierValue, level: this.level, fps };
    this.bus?.emit(PERF_EVENTS.recover, payload);
  }

  stats(): PerfStats {
    return {
      fps: Math.round(this.fps * 10) / 10,
      avgFrameMs: Math.round(this.avgFrameMs * 100) / 100,
      p95FrameMs: Math.round(this.p95FrameMs * 100) / 100,
      worstFrameMs: Math.round(this.worst * 100) / 100,
      tier: this.tierValue,
      level: this.level,
      samples: this.ringCount,
      hitches: this.hitches,
    };
  }

  /**
   * Force a tier (settings screen "Graphics: Low"). With `lock` the
   * watchdog stops acting entirely — a player who picked Low must not
   * be dragged back to High, and one who picked High accepts the cost.
   */
  setTier(tier: QualityTier, lock = false): void {
    this.tierValue = tier;
    this.locked = lock;
    this.lowSince = null;
    this.goodSince = null;
  }

  /** Hand control back to the watchdog ("Graphics: Auto"). */
  setAuto(): void {
    this.locked = false;
    this.lowSince = null;
    this.goodSince = null;
  }

  isLocked(): boolean {
    return this.locked;
  }

  /** Clear the window — call after a zone change so old costs don't linger. */
  reset(): void {
    this.ring.fill(0);
    this.ringIndex = 0;
    this.ringCount = 0;
    this.ringSum = 0;
    this.frames = 0;
    this.worst = 0;
    this.lowSince = null;
    this.goodSince = null;
  }
}

function stepTier(tier: QualityTier, delta: number): QualityTier {
  const i = TIER_ORDER.indexOf(tier);
  const next = Math.max(0, Math.min(TIER_ORDER.length - 1, i + delta));
  return TIER_ORDER[next] ?? tier;
}
