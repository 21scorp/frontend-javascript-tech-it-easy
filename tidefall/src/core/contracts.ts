/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — contracts.ts
   The shared seams every system plugs into. Systems talk through
   these interfaces and never reach into each other's internals.
   Change here = coordinated change everywhere, so keep it small.
   ═══════════════════════════════════════════════════════════════ */

import type { Application, Container } from "pixi.js";
import type { Viewport } from "./viewport";

/** Everything a system is handed at construction. */
export interface GameContext {
  app: Application;
  viewport: Viewport;
  /** Fixed-step seconds since boot (never wall clock). */
  now(): number;
  bus: EventBus;
}

/** A self-contained slice of the game (world, combat, base, ui…). */
export interface System {
  readonly id: string;
  /** Build state and display objects. Called once, in order. */
  init(ctx: GameContext): Promise<void> | void;
  /** Fixed-step simulation. dt is clamped seconds. */
  update?(dt: number, t: number): void;
  /** Per-frame visual work after simulation (lerps, sorting). */
  render?(t: number, alpha: number): void;
  /** Free textures/listeners. */
  destroy?(): void;
}

/** Rendering layers, back to front. Systems add into these only. */
export interface SceneLayers {
  terrain: Container;   // painted ground, water
  ground: Container;    // decals, shadows, paths
  actors: Container;    // depth-sorted by y
  overhead: Container;  // canopy, roofs the player walks behind
  fx: Container;        // particles, weather
  worldUi: Container;   // bubbles, damage numbers — world-space
}

export type EventMap = Record<string, unknown>;

/** Tiny typed pub/sub. Systems stay decoupled through this. */
export class EventBus {
  private map = new Map<string, Set<(p: unknown) => void>>();

  on<T = unknown>(key: string, fn: (payload: T) => void): () => void {
    let set = this.map.get(key);
    if (!set) { set = new Set(); this.map.set(key, set); }
    set.add(fn as (p: unknown) => void);
    return () => set!.delete(fn as (p: unknown) => void);
  }

  emit<T = unknown>(key: string, payload?: T) {
    const set = this.map.get(key);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { console.error(`[bus:${key}]`, e); }
    }
  }

  clear() { this.map.clear(); }
}

/** Device capability tier — drives particle counts, shadows, weather. */
export type QualityTier = "low" | "mid" | "high";

export function detectQuality(dpr: number): QualityTier {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 2 || cores <= 4) return "low";
  if (mem >= 8 && cores >= 8 && dpr >= 2) return "high";
  return "mid";
}
