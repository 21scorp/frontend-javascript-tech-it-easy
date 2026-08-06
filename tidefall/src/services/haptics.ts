/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/haptics.ts
   Haptics are the cheapest "game feel" win on mobile and the fastest
   way to get uninstalled if you overdo them.

   WHY this is a wrapper and not `navigator.vibrate()` at call sites:
     • navigator.vibrate is a blunt duration list; native iOS has real
       impact/notification generators and iOS Safari has NO vibrate at
       all. The Capacitor Haptics plugin covers both, but only in the
       native build. So calls go through a HapticsBackend and the
       native build swaps one object — no call site changes.
     • Consent is not optional: a user setting AND
       prefers-reduced-motion both have to allow it. Reduced-motion
       users get nothing, ever, without having to find a setting.
     • A rate limit exists because an idle game fires "reward" events
       in bursts; buzzing continuously drains battery and feels broken.
   ═══════════════════════════════════════════════════════════════ */

import { realClock } from "./timing";
import type { Clock } from "./timing";

export type HapticImpact = "light" | "medium" | "heavy";
export type HapticNotify = "success" | "warning" | "error";
export type HapticPattern = HapticImpact | HapticNotify | "selection";

/**
 * Durations tuned on Android's linear actuator: under ~8ms is
 * imperceptible, over ~40ms reads as a buzz rather than a tap.
 */
export const HAPTIC_PATTERNS: Record<HapticPattern, number[]> = {
  selection: [8],
  light: [12],
  medium: [22],
  heavy: [38],
  success: [14, 60, 26],
  warning: [26, 90, 26],
  error: [34, 70, 34, 70, 46],
};

/** The seam the native build replaces. */
export interface HapticsBackend {
  readonly name: string;
  isSupported(): boolean;
  /** Alternating on/off durations in ms, exactly like navigator.vibrate. */
  vibrate(pattern: number[]): void;
  cancel(): void;
}

export function webVibrateBackend(nav: Navigator = navigator): HapticsBackend {
  return {
    name: "navigator.vibrate",
    isSupported: () => typeof nav.vibrate === "function",
    vibrate(pattern) {
      try {
        nav.vibrate(pattern);
      } catch {
        /* some browsers throw when the page is backgrounded */
      }
    },
    cancel() {
      try {
        nav.vibrate(0);
      } catch {
        /* ignore */
      }
    },
  };
}

export function nullHapticsBackend(): HapticsBackend {
  return {
    name: "null",
    isSupported: () => false,
    vibrate: () => {},
    cancel: () => {},
  };
}

/**
 * Shape the Capacitor build implements. Kept as a comment-level contract
 * rather than an import so the web bundle never pulls in Capacitor:
 *
 *   import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
 *   const capacitorBackend: HapticsBackend = {
 *     name: "capacitor",
 *     isSupported: () => true,
 *     vibrate(pattern) {
 *       // map by length: 1 entry = impact, 3+ = notification
 *       if (pattern.length === 1) {
 *         const d = pattern[0]!;
 *         void Haptics.impact({ style: d >= 32 ? ImpactStyle.Heavy
 *                                    : d >= 18 ? ImpactStyle.Medium
 *                                    : ImpactStyle.Light });
 *       } else {
 *         void Haptics.notification({ type: NotificationType.Success });
 *       }
 *     },
 *     cancel: () => {},
 *   };
 */

export interface HapticsOptions {
  backend?: HapticsBackend;
  /** Player setting. Defaults on; persisted by whoever owns settings. */
  enabled?: boolean;
  /** Injected so tests do not need matchMedia. */
  prefersReducedMotion?: () => boolean;
  now?: Clock;
  /** Minimum gap between two haptics, ms. */
  minIntervalMs?: number;
}

function defaultReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

export class HapticsService {
  private readonly backend: HapticsBackend;
  private readonly reduced: () => boolean;
  private readonly now: Clock;
  private readonly minInterval: number;
  private enabled: boolean;
  private lastAt = -Infinity;

  constructor(opts: HapticsOptions = {}) {
    this.backend = opts.backend ?? webVibrateBackend();
    this.enabled = opts.enabled ?? true;
    this.reduced = opts.prefersReducedMotion ?? defaultReducedMotion;
    this.now = opts.now ?? realClock;
    this.minInterval = opts.minIntervalMs ?? 40;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.backend.cancel();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Everything that must be true before a single buzz is allowed. */
  isAvailable(): boolean {
    return this.enabled && !this.reduced() && this.backend.isSupported();
  }

  /** Returns whether it actually fired — useful in tests and diagnostics. */
  fire(pattern: HapticPattern): boolean {
    if (!this.isAvailable()) return false;
    const t = this.now();
    if (t - this.lastAt < this.minInterval) return false;
    const shape = HAPTIC_PATTERNS[pattern];
    this.lastAt = t;
    this.backend.vibrate([...shape]);
    return true;
  }

  impact(style: HapticImpact = "light"): boolean {
    return this.fire(style);
  }

  notify(type: HapticNotify = "success"): boolean {
    return this.fire(type);
  }

  /** The lightest possible tick — list scrolling, slider notches. */
  selection(): boolean {
    return this.fire("selection");
  }

  cancel(): void {
    this.backend.cancel();
  }

  backendName(): string {
    return this.backend.name;
  }
}
