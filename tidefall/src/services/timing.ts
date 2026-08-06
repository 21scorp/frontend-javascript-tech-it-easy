/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/timing.ts
   Every service that debounces, times out, or measures needs a
   clock. If they reach for the global one they become untestable
   and flaky under CI. So the clock and the timer queue are values
   we pass in, defaulting to the real thing in production.
   ═══════════════════════════════════════════════════════════════ */

/** The two timer calls services are allowed to make. Nothing else. */
export interface TimerApi {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

/** Wall clock in ms. Separate from GameContext.now() (fixed-step sim time). */
export type Clock = () => number;

export const realTimers: TimerApi = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h) => globalThis.clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
};

/** Monotonic where available — never jumps when the user changes TZ. */
export const realClock: Clock = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/** Wall clock, for "when was this saved" style stamps only. */
export const wallClock: Clock = () => Date.now();

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smooth 0→1 ramp; used by audio stem fades and perf hysteresis. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Small deterministic PRNG (mulberry32). Audio variation and any other
 * "random but reproducible in tests" need uses this rather than Math.random.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
