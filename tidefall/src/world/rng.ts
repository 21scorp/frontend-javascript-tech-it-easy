/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/rng.ts
   Deterministic noise. Every scatter, tint jitter and rock facet
   is derived from a seed + world position, never Math.random().

   WHY: terrain is painted in chunks. A rock that straddles a chunk
   boundary must be drawn identically into both chunks or you get a
   visible seam. Pure functions of (seed, x, y) guarantee that, and
   they also make the world reproducible between reloads.
   ═══════════════════════════════════════════════════════════════ */

/** Mulberry32 — small, fast, good enough for art scatter. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [a,b). */
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  /** Integer in [a,b]. */
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  /** Symmetric jitter around 0. */
  jitter(amount: number): number { return (this.next() * 2 - 1) * amount; }
  /** Pick one entry. Callers only ever pass non-empty tables. */
  pick<T>(list: readonly T[]): T { return list[Math.floor(this.next() * list.length)] as T; }
  bool(chance: number): boolean { return this.next() < chance; }
}

/** Hash a 2D cell to [0,1). Used for position-stable jitter. */
export function hash2(seed: number, x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0,1). Cheap stand-in for Perlin — we only
    ever use it for low-frequency colour drift, so gradient noise
    would be wasted cycles. */
export function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = fade(x - xi), yf = fade(y - yi);
  const a = hash2(seed, xi, yi);
  const b = hash2(seed, xi + 1, yi);
  const c = hash2(seed, xi, yi + 1);
  const d = hash2(seed, xi + 1, yi + 1);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

/** Fractal sum. 3 octaves is the sweet spot: enough structure to read
    as terrain, cheap enough to run per-pixel on a 128px grain tile. */
export function fbm(seed: number, x: number, y: number, octaves = 3): number {
  let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(seed + i * 1013, fx, fy) * amp;
    norm += amp;
    amp *= 0.5; fx *= 2; fy *= 2;
  }
  return sum / norm;
}

/** Smoothstep ramp, used constantly for band blending. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
