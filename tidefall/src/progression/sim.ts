/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — progression/sim.ts
   The balance proof. Run it:

       npx tsx src/progression/sim.ts

   It walks every skill level 1→100 using the real content tables
   (xp per action, seconds per action, tool speed steps) and prints
   hours-to-milestone. Nothing here is estimated or hand-waved —
   if the numbers move, it is because content.ts or curve.ts moved.

   It also SOLVES for CURVE.coefficient. Time is linear in the
   coefficient (increment = A·l^p + floor), so the solver does one
   exact linear solve and then bisects on the *rounded* table to
   land the max-level target dead on. Paste the printed value into
   curve.ts and re-run to confirm.

   TARGETS being proved:
     first level-up  < 60 s
     level 10        ≲ 15 min  (first session)
     level 50        15-25 h
     level 100       120-200 h per skill
   ═══════════════════════════════════════════════════════════════ */

import { EventBus } from "../core/contracts";
import type { GameContext } from "../core/contracts";
import {
  CURVE, MAX_LEVEL, TIER_LEVELS, TOTAL_XP_TO_MAX, buildCurveTable,
  levelFromTotalXp, progressAt, totalXpForLevel, xpForLevel,
  type CurveParams, type CurveTable,
} from "./curve.ts";
import { SKILL_IDS, SKILLS, TOOL_STEPS, toolSpeedAt, type SkillId } from "./skills.ts";
import { CONTENT, CONTENT_BY_SKILL, bestXpPerHour, skillLadder, xpPerHour } from "./content.ts";
import {
  ProgressionSystem, PROGRESSION_EVENTS,
  type SkillLevelUpEvent,
} from "./progression.ts";

/* ── play profile (data, like everything else) ────────────────
   A realistic mobile idler's day: two coffee-break sessions plus
   an overnight/at-work idle payout. Idle earns at 40% of active
   rate and only ever feeds ONE skill at a time, which is why
   maxing all twelve is not twelve times one skill in calendar
   terms — the idle budget is shared, not multiplied. */
const PLAY_PROFILE = {
  activeMinutesPerDay: 50,
  idleHoursPerDay: 9,
  idleEfficiency: 0.40,
} as const;

const EFFECTIVE_HOURS_PER_DAY =
  PLAY_PROFILE.activeMinutesPerDay / 60 +
  PLAY_PROFILE.idleHoursPerDay * PLAY_PROFILE.idleEfficiency;

const MILESTONES = [10, 25, 50, 75, 100] as const;

/* ── core walk ──────────────────────────────────────────────── */

/** hours[l] = cumulative active hours to *reach* level l. hours[1]=0. */
function timeline(skill: SkillId, table: CurveTable): number[] {
  const hours = new Array<number>(MAX_LEVEL + 1).fill(0);
  let acc = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    acc += table.increment[l] / bestXpPerHour(skill, l);
    hours[l + 1] = acc;
  }
  return hours;
}

function secondsToFirstLevel(skill: SkillId, table: CurveTable): number {
  return (table.increment[1] / bestXpPerHour(skill, 1)) * 3600;
}

/* ── solver ─────────────────────────────────────────────────── */

/** Hours to max for `skill` with candidate curve params. */
function maxHours(skill: SkillId, params: CurveParams): number {
  return timeline(skill, buildCurveTable(params))[MAX_LEVEL];
}

/**
 * Solve CURVE.coefficient so `skill` maxes in `targetHours`.
 * hours(A) = A·S + floor·T is exactly linear, so one algebraic
 * step gets within a rounding error; 60 bisection steps on the
 * real (rounded) table close the rest.
 */
function solveCoefficient(skill: SkillId, targetHours: number, exponent = CURVE.exponent): number {
  let s = 0;
  let t = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    const rate = bestXpPerHour(skill, l);
    s += Math.pow(l, exponent) / rate;
    t += 1 / rate;
  }
  let guess = (targetHours - CURVE.floor * t) / s;

  let lo = guess * 0.5;
  let hi = guess * 1.5;
  for (let i = 0; i < 60; i++) {
    guess = (lo + hi) / 2;
    if (maxHours(skill, { ...CURVE, exponent, coefficient: guess }) < targetHours) lo = guess;
    else hi = guess;
  }
  return guess;
}

/* ── formatting ─────────────────────────────────────────────── */

const pad = (s: string, w: number) => (s.length >= w ? s : " ".repeat(w - s.length) + s);
const padR = (s: string, w: number) => (s.length >= w ? s : s + " ".repeat(w - s.length));

function hoursLabel(h: number): string {
  if (h < 1 / 60) return `${(h * 3600).toFixed(1)}s`;
  if (h < 1) return `${(h * 60).toFixed(1)}m`;
  return `${h.toFixed(1)}h`;
}

const int = (n: number) => Math.round(n).toLocaleString("en-US");

function rule(width = 78) { console.log("─".repeat(width)); }

function heading(title: string) {
  console.log("");
  console.log(`═══ ${title} ${"═".repeat(Math.max(0, 74 - title.length))}`);
}

/* ── report sections ────────────────────────────────────────── */

function reportCurve(table: CurveTable, params: CurveParams) {
  heading("XP CURVE");
  console.log(`xpForLevel(l) = round(${params.coefficient} · l^${params.exponent}) + ${params.floor}   ·   cap ${MAX_LEVEL}`);
  console.log("");
  console.log(padR("level", 8) + pad("to next", 12) + pad("total", 14) + pad("% of max", 10));
  rule(44);
  for (const l of [1, 2, 5, 10, 25, 50, 75, 90, 99, 100]) {
    const pct = (table.cumulative[l] / table.totalToCap) * 100;
    console.log(
      padR(String(l), 8) +
      pad(int(table.increment[l]), 12) +
      pad(int(table.cumulative[l]), 14) +
      pad(`${pct.toFixed(1)}%`, 10),
    );
  }
  rule(44);
  console.log(`Total XP to level ${MAX_LEVEL}: ${int(table.totalToCap)}`);
  console.log(`RuneScape 1-99 for comparison: 13,034,431 (geometric, ~300-800 h)`);
}

function reportTiers() {
  heading("XP/HOUR BY TIER  (the multiplier that keeps the tail reachable)");
  console.log(
    padR("skill", 14) + pad("T", 3) + pad("lvl", 5) + pad("xp", 7) +
    pad("sec", 7) + pad("tool", 7) + pad("xp/hr", 11) + pad("×T1", 7),
  );
  rule();
  const sample: SkillId[] = ["fishing", "smithing", "combat", "slayer", "construction", "trading"];
  for (const skill of sample) {
    const rows = CONTENT_BY_SKILL[skill];
    const base = xpPerHour(rows[0], TIER_LEVELS[0]);
    for (const e of rows) {
      const rate = xpPerHour(e, e.level);
      console.log(
        padR(e.tier === 1 ? SKILLS[skill].name : "", 14) +
        pad(String(e.tier), 3) +
        pad(String(e.level), 5) +
        pad(String(e.xp), 7) +
        pad(e.seconds.toFixed(1), 7) +
        pad(`×${toolSpeedAt(e.level).toFixed(2)}`, 7) +
        pad(int(rate), 11) +
        pad(`${(rate / base).toFixed(1)}×`, 7),
      );
    }
    rule();
  }
  const top = toolSpeedAt(MAX_LEVEL);
  console.log(`Tool ladder: ${TOOL_STEPS.length} steps, ×1.00 → ×${top.toFixed(2)} action speed.`);
  console.log(`Peak fishing rate at level 100: ${int(bestXpPerHour("fishing", 100))} xp/hr.`);
}

interface SkillResult {
  skill: SkillId;
  firstLevelSeconds: number;
  hours: number[];
}

function reportMilestones(results: readonly SkillResult[]) {
  heading("HOURS TO MILESTONE  (active play, tools + tiers applied)");
  console.log(
    padR("skill", 14) + pad("lv2", 8) +
    MILESTONES.map((m) => pad(`lv${m}`, 10)).join("") + pad("days*", 9),
  );
  rule();
  for (const r of results) {
    console.log(
      padR(SKILLS[r.skill].name, 14) +
      pad(`${r.firstLevelSeconds.toFixed(0)}s`, 8) +
      MILESTONES.map((m) => pad(hoursLabel(r.hours[m]), 10)).join("") +
      pad((r.hours[MAX_LEVEL] / EFFECTIVE_HOURS_PER_DAY).toFixed(0), 9),
    );
  }
  rule();
  console.log(
    `*days = calendar days at ${PLAY_PROFILE.activeMinutesPerDay} min active + ` +
    `${PLAY_PROFILE.idleHoursPerDay} h idle @ ${(PLAY_PROFILE.idleEfficiency * 100).toFixed(0)}% ` +
    `= ${EFFECTIVE_HOURS_PER_DAY.toFixed(2)} effective h/day.`,
  );
}

function reportTotals(results: readonly SkillResult[]) {
  heading("TOTALS");
  const each = results.map((r) => r.hours[MAX_LEVEL]);
  const total = each.reduce((a, b) => a + b, 0);
  const fastest = results.reduce((a, b) => (a.hours[MAX_LEVEL] <= b.hours[MAX_LEVEL] ? a : b));
  const slowest = results.reduce((a, b) => (a.hours[MAX_LEVEL] >= b.hours[MAX_LEVEL] ? a : b));

  console.log(`Fastest skill to 100 : ${SKILLS[fastest.skill].name} — ${fastest.hours[MAX_LEVEL].toFixed(0)} h`);
  console.log(`Slowest skill to 100 : ${SKILLS[slowest.skill].name} — ${slowest.hours[MAX_LEVEL].toFixed(0)} h`);
  console.log(`Max ALL twelve       : ${total.toFixed(0)} active h`);
  console.log(`                       ${(total / EFFECTIVE_HOURS_PER_DAY).toFixed(0)} days  (~${(total / EFFECTIVE_HOURS_PER_DAY / 7).toFixed(0)} weeks) at the profile above`);
  console.log("");
  console.log("Production-skill note: xp assumes inputs are on hand. Feeding one");
  console.log("hour of a production skill costs roughly this much gathering:");
  for (const skill of SKILL_IDS) {
    const def = SKILLS[skill];
    if (!def.feeder) continue;
    const prod = CONTENT_BY_SKILL[skill][7];
    const feed = CONTENT_BY_SKILL[def.feeder][7];
    const qty = prod.inputs[0]?.qty ?? 1;
    const feedSeconds = (feed.seconds / toolSpeedAt(100)) * qty;
    const prodSeconds = prod.seconds / toolSpeedAt(100);
    console.log(
      `  ${padR(def.name, 13)} ← ${padR(SKILLS[def.feeder].name, 12)} ` +
      `${(feedSeconds / prodSeconds).toFixed(2)} h gathered per 1 h produced (tier 8)`,
    );
  }
}

function reportTargets(results: readonly SkillResult[]) {
  heading("TARGET CHECK");
  const worstFirst = Math.max(...results.map((r) => r.firstLevelSeconds));
  const worstTen = Math.max(...results.map((r) => r.hours[10])) * 60;
  const l50 = results.map((r) => r.hours[50]);
  const l100 = results.map((r) => r.hours[MAX_LEVEL]);

  const checks: [string, boolean, string][] = [
    ["first level-up  < 60 s", worstFirst < 60, `worst ${worstFirst.toFixed(0)}s`],
    ["level 10        ~15 min", worstTen <= 15, `worst ${worstTen.toFixed(1)} min`],
    ["level 50        15-25 h", Math.min(...l50) >= 15 && Math.max(...l50) <= 25,
      `${Math.min(...l50).toFixed(1)}-${Math.max(...l50).toFixed(1)} h`],
    ["level 100       120-200 h", Math.min(...l100) >= 120 && Math.max(...l100) <= 200,
      `${Math.min(...l100).toFixed(0)}-${Math.max(...l100).toFixed(0)} h`],
    ["level 100       multi-week", results.every((r) => r.hours[MAX_LEVEL] / EFFECTIVE_HOURS_PER_DAY >= 21),
      `${Math.min(...l100.map((h) => h / EFFECTIVE_HOURS_PER_DAY)).toFixed(0)}+ days`],
  ];
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${padR(label, 28)} ${detail}`);
  }
}

/**
 * The tuning loop, kept in the repo so the choice of exponent is
 * reproducible rather than folklore. For each candidate exponent
 * we solve the coefficient that puts the BASELINE gathering skill
 * at `anchorHours`, then read the whole roster's spread back.
 * The exponent is chosen to satisfy the level-50 AND level-100
 * windows simultaneously across all twelve skills.
 */
const ANCHOR_HOURS = 158;

function reportSweep() {
  heading(`EXPONENT SWEEP  (coefficient solved so gathering maxes at ${ANCHOR_HOURS} h)`);
  console.log(
    padR("exp", 7) + pad("coeff", 9) + pad("lv2", 8) + pad("lv10", 9) +
    pad("lv50 min-max", 16) + pad("lv100 min-max", 17) + pad("verdict", 10),
  );
  rule();
  for (const exponent of [2.35, 2.55, 2.75, 2.85, 2.95, 3.05, 3.15, 3.25]) {
    const coefficient = solveCoefficient("fishing", ANCHOR_HOURS, exponent);
    const params: CurveParams = { ...CURVE, exponent, coefficient };
    const table = buildCurveTable(params);
    const all = SKILL_IDS.map((s) => timeline(s, table));
    const l50 = all.map((h) => h[50]);
    const l100 = all.map((h) => h[MAX_LEVEL]);
    const ok =
      Math.min(...l50) >= 15 && Math.max(...l50) <= 25 &&
      Math.min(...l100) >= 120 && Math.max(...l100) <= 200;
    console.log(
      padR(exponent.toFixed(2), 7) +
      pad(coefficient.toFixed(3), 9) +
      pad(`${secondsToFirstLevel("fishing", table).toFixed(0)}s`, 8) +
      pad(hoursLabel(all[0][10]), 9) +
      pad(`${Math.min(...l50).toFixed(1)}-${Math.max(...l50).toFixed(1)}h`, 16) +
      pad(`${Math.min(...l100).toFixed(0)}-${Math.max(...l100).toFixed(0)}h`, 17) +
      pad(ok ? "OK" : "—", 10),
    );
  }
  rule();
}

function reportSolver() {
  heading("SOLVER");
  for (const target of [140, ANCHOR_HOURS, 175]) {
    const a = solveCoefficient("fishing", target);
    console.log(`  gathering max at ${pad(String(target), 3)} h  →  CURVE.coefficient = ${a.toFixed(4)}`);
  }
  console.log(`  currently configured     →  CURVE.coefficient = ${CURVE.coefficient} (exponent ${CURVE.exponent}, floor ${CURVE.floor})`);
}

/* ── self check ─────────────────────────────────────────────────
   The pacing numbers are only worth anything if the runtime agrees
   with the tables, so the sim drives the real ProgressionSystem
   through a real EventBus and asserts the round trip. */

function reportSelfCheck() {
  heading("SELF CHECK");
  const fails: string[] = [];
  const ok = (label: string, cond: boolean, detail = "") => {
    if (!cond) fails.push(label);
    console.log(`${cond ? "PASS" : "FAIL"}  ${padR(label, 44)} ${detail}`);
  };

  // curve tables
  let walked = 0;
  for (let l = 1; l < MAX_LEVEL; l++) walked += xpForLevel(l);
  ok("Σ xpForLevel == totalXpForLevel(100)", walked === totalXpForLevel(MAX_LEVEL), int(walked));

  let monotonic = true;
  let roundTrip = true;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (l > 1 && totalXpForLevel(l) <= totalXpForLevel(l - 1)) monotonic = false;
    if (levelFromTotalXp(totalXpForLevel(l)) !== l) roundTrip = false;
    if (l < MAX_LEVEL && levelFromTotalXp(totalXpForLevel(l + 1) - 1) !== l) roundTrip = false;
  }
  ok("cumulative XP strictly increasing", monotonic);
  ok("levelFromTotalXp round-trips 1..100", roundTrip);
  ok("levelFromTotalXp clamps", levelFromTotalXp(-5) === 1 && levelFromTotalXp(1e12) === MAX_LEVEL);
  ok("progressAt(cap).progress == 1", progressAt(TOTAL_XP_TO_MAX).progress === 1);

  // content integrity
  ok("content entries", CONTENT.length === 96, `${CONTENT.length} (12 skills × 8 tiers)`);
  const badInputs = CONTENT.filter((e) => e.inputs.some((i) => !CONTENT.some((c) => c.id === i.id)));
  ok("every recipe input resolves", badInputs.length === 0, badInputs.map((e) => e.id).join(","));
  const rateRising = SKILL_IDS.every((s) => {
    const rows = CONTENT_BY_SKILL[s];
    return rows.every((e, i) => i === 0 || xpPerHour(e, e.level) > xpPerHour(rows[i - 1], rows[i - 1].level));
  });
  ok("xp/hr strictly rises with tier", rateRising);

  // unlock cadence — the "always something next" promise
  let worstGap = 0;
  let worstSkill: SkillId = "fishing";
  for (const s of SKILL_IDS) {
    const levels = [...new Set(skillLadder(s).map((u) => u.level))].sort((a, b) => a - b);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > worstGap) { worstGap = levels[i] - levels[i - 1]; worstSkill = s; }
    }
  }
  ok("longest gap between unlocks ≤ 12 levels", worstGap <= 12, `${worstGap} (${SKILLS[worstSkill].name})`);

  // live system round trip
  const bus = new EventBus();
  const sys = new ProgressionSystem();
  sys.init({ bus, now: () => 0 } as unknown as GameContext);

  const levelUps: SkillLevelUpEvent[] = [];
  bus.on<SkillLevelUpEvent>(PROGRESSION_EVENTS.levelUp, (e) => levelUps.push(e));

  // One fat offline payout must fire every crossed level, in order.
  sys.grant("fishing", totalXpForLevel(24) + 5, "sim.idle");
  const ordered = levelUps.every((e, i) => e.level === i + 2);
  ok("one grant emits every crossed level-up", levelUps.length === 23 && ordered, `${levelUps.length} events`);
  ok("level derived from banked xp", sys.levelOf("fishing") === 24);
  ok("canGather gates on tier", sys.canGather("fishing_spot", 4) && !sys.canGather("fishing_spot", 5));
  ok("unlockedContent tracks level", sys.unlockedContent("fishing").length === 4);
  ok("nextUnlock points forward", (sys.nextUnlock("fishing")?.level ?? 0) === 25);

  const save = sys.serialize();
  const restored = new ProgressionSystem(save);
  ok("save round-trips", restored.levelOf("fishing") === 24 && restored.totalLevel() === sys.totalLevel());

  sys.grant("fishing", 1e12, "sim.overflow");
  ok("cap clamps at 100", sys.levelOf("fishing") === MAX_LEVEL && sys.xpOf("fishing") === TOTAL_XP_TO_MAX);
  ok("granting at cap is a no-op", sys.grant("fishing", 1000) === 0);

  console.log("");
  console.log(fails.length === 0 ? "All self checks passed." : `${fails.length} FAILED: ${fails.join(" | ")}`);
}

/* ── main ───────────────────────────────────────────────────── */

function main() {
  const table = buildCurveTable(CURVE);
  const results: SkillResult[] = SKILL_IDS.map((skill) => ({
    skill,
    firstLevelSeconds: secondsToFirstLevel(skill, table),
    hours: timeline(skill, table),
  }));

  console.log("");
  console.log("TIDEFALL — progression balance simulation");

  reportCurve(table, CURVE);
  reportTiers();
  reportMilestones(results);
  reportTotals(results);
  reportTargets(results);
  reportSweep();
  reportSolver();
  reportSelfCheck();
  console.log("");
}

main();
