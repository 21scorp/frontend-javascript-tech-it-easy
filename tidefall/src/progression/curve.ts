/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — progression/curve.ts
   The single XP curve every skill shares. Levels 1-100.

   WHY THIS SHAPE (and why not 25·l^1.9, and why not RuneScape):

   RuneScape's curve is geometric — each level costs ~10.4% more
   than the last. That makes levels 1-10 nearly free and levels
   90-99 half the entire game. It is a great *feeling* and a
   terrible *schedule*: 99 is 300-800 hours.

   A pure power law (the 25·l^1.9 reference) is the opposite shape:
   steep early (level 9 costs 70× level 1) and flat late (level 99
   costs only 2% more than level 98). It fixes the schedule but
   loses the long tail entirely.

   TIDEFALL wants the RuneScape *silhouette* on a mobile schedule.
   The trick is that time-per-level = xpForLevel(l) ÷ xp-rate(l),
   and our xp-rate grows ~16.5× across the game (8 resource tiers
   × 7 tool steps). So the curve can be a power law after all —
   the rising rate flattens the front end for free, and a high
   exponent rebuilds the tail on top of it. Solving the anchors

       level 10  ≈ first session      (~15 min)
       level 50  ≈ 15-25 h
       level 100 ≈ 120-200 h

   against that rate ladder pins the exponent to a narrow window:
   below 2.75 the level-50 window blows out past 25 h, above 3.10
   it collapses under 15 h. 2.85 sits in the middle with room on
   both sides. sim.ts prints that sweep, so the choice is
   reproducible rather than folklore.

   `floor` is the flat cost added to every level. At 140 it makes
   the first level ~11 shrimp (≈43 s) instead of ~2, and holds
   levels 1-6 to a steady 40-75 s each — a real onboarding cadence
   — while contributing 0.11% of the total XP to 100.

   The result: 24.2M XP to 100, versus RuneScape's 13.0M to 99 —
   nearly twice the XP in roughly half the hours, because our
   content ladder pays 16.5× more per action at the top than at
   the bottom, where RuneScape pays about 4×. Same "the last ten
   levels are a third of the game" silhouette (level 50 = 6.8% of
   total, level 75 = 32.8%, level 90 = 66.5%), a schedule you can
   actually finish. That is the softening.

   Everything here is data + O(1) lookups: both tables are built
   once at module load and `levelFromTotalXp` binary-searches 100
   entries (7 comparisons), never a linear scan.
   ═══════════════════════════════════════════════════════════════ */

export const MAX_LEVEL = 100;

export interface CurveParams {
  /** Scales the whole curve — the one dial sim.ts solves for. */
  readonly coefficient: number;
  /** Steepness of the long tail. */
  readonly exponent: number;
  /** Flat cost added to every level; keeps levels 1-4 meaningful. */
  readonly floor: number;
  readonly maxLevel: number;
}

/**
 * FINAL TUNED VALUES. `coefficient` is the output of
 * `solveCoefficient("fishing", 158)` in sim.ts — the one dial that
 * moves the whole schedule. Re-run the sim after touching it.
 */
export const CURVE: CurveParams = {
  coefficient: 1.8907,
  exponent: 2.85,
  floor: 140,
  maxLevel: MAX_LEVEL,
};

/* ── the multiplier concept ─────────────────────────────────────
   Late levels stay reachable because content scales, not because
   the curve bends. These two tables are the contract content.ts
   must honour: eight resource tiers, unlocking at TIER_LEVELS,
   paying TIER_XP_SCALE xp per action. 10 → 158 is a 15.8× xp jump
   per action; action time only grows 1.5×, so raw throughput
   grows ~10.5× and the top tool step adds another 1.57×. */
export const TIER_COUNT = 8;

export const TIER_LEVELS: readonly number[] = [1, 5, 12, 22, 35, 50, 68, 85];

export const TIER_XP_SCALE: readonly number[] = [10, 21, 36, 55, 76, 100, 126, 158];

/** Highest tier (1-based) usable at `level`. */
export function tierAtLevel(level: number): number {
  let tier = 1;
  for (let i = 0; i < TIER_LEVELS.length; i++) {
    if (level >= TIER_LEVELS[i]) tier = i + 1;
    else break;
  }
  return tier;
}

/** xp-per-action multiplier of `tier` relative to tier 1. */
export function tierXpMultiplier(tier: number): number {
  const i = Math.min(Math.max(tier, 1), TIER_COUNT) - 1;
  return TIER_XP_SCALE[i] / TIER_XP_SCALE[0];
}

/* ── tables ─────────────────────────────────────────────────── */

export interface CurveTable {
  /** increment[l] = xp to go from level l to l+1. 0 at the cap. */
  readonly increment: readonly number[];
  /** cumulative[l] = total xp required to *be* level l. [1] = 0. */
  readonly cumulative: readonly number[];
  readonly maxLevel: number;
  /** Total xp banked at the cap. */
  readonly totalToCap: number;
}

/** Pure builder — sim.ts calls this with candidate params. */
export function buildCurveTable(params: CurveParams): CurveTable {
  const max = params.maxLevel;
  const increment = new Array<number>(max + 2).fill(0);
  const cumulative = new Array<number>(max + 2).fill(0);

  for (let l = 1; l < max; l++) {
    increment[l] = Math.round(params.coefficient * Math.pow(l, params.exponent)) + params.floor;
  }
  for (let l = 2; l <= max; l++) cumulative[l] = cumulative[l - 1] + increment[l - 1];
  // One past the cap so progress maths never falls off the end.
  cumulative[max + 1] = cumulative[max];

  return { increment, cumulative, maxLevel: max, totalToCap: cumulative[max] };
}

const TABLE = buildCurveTable(CURVE);

/** XP to advance from `level` to `level + 1`. 0 at the cap. */
export function xpForLevel(level: number): number {
  if (level < 1 || level >= MAX_LEVEL) return 0;
  return TABLE.increment[level];
}

/** Total banked XP required to *be* `level`. levelling starts at 1. */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= MAX_LEVEL) return TABLE.totalToCap;
  return TABLE.cumulative[level];
}

/** Total XP at the cap — the headline number for a maxed skill. */
export const TOTAL_XP_TO_MAX = TABLE.totalToCap;

/** Binary search, 7 comparisons, no allocation. */
export function levelFromTotalXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  if (totalXp >= TABLE.totalToCap) return MAX_LEVEL;
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (TABLE.cumulative[mid] <= totalXp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface LevelProgress {
  readonly level: number;
  readonly totalXp: number;
  /** XP earned since reaching `level`. */
  readonly xpIntoLevel: number;
  /** XP the whole of `level` costs. 0 at the cap. */
  readonly xpForNext: number;
  /** 0..1. Pinned to 1 at the cap. */
  readonly progress: number;
  readonly atCap: boolean;
}

export function progressAt(totalXp: number): LevelProgress {
  const level = levelFromTotalXp(totalXp);
  const atCap = level >= MAX_LEVEL;
  const base = totalXpForLevel(level);
  const span = xpForLevel(level);
  const into = Math.max(0, totalXp - base);
  return {
    level,
    totalXp,
    xpIntoLevel: atCap ? 0 : into,
    xpForNext: span,
    progress: atCap ? 1 : span > 0 ? Math.min(1, into / span) : 0,
    atCap,
  };
}

/** XP still owed to reach `target`. Never negative. */
export function xpRemainingTo(totalXp: number, target: number): number {
  return Math.max(0, totalXpForLevel(Math.min(target, MAX_LEVEL)) - totalXp);
}
