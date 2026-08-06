/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — progression/progression.ts
   The one System that owns "how good are you at things".

   Design rules it obeys:
   • Total XP is the only stored number. Level is always derived
     from the curve table, so re-tuning curve.ts re-levels every
     save consistently instead of stranding players mid-level.
   • Multi-level grants are handled in one pass — an 8h idle
     payout can cross ten levels and must emit ten level-ups in
     order, each with the unlocks that landed on it.
   • Nothing here renders, allocates per-frame, or reaches into
     another system. It emits and it answers questions.

   Bus contract:
     skill:xp       every grant (including capped no-ops)
     skill:levelup  once per level crossed, in ascending order
     skill:unlock   once per ladder entry revealed
   ═══════════════════════════════════════════════════════════════ */

import type { GameContext, System } from "../core/contracts";
import {
  MAX_LEVEL, TOTAL_XP_TO_MAX,
  levelFromTotalXp, progressAt, totalXpForLevel, xpForLevel, xpRemainingTo,
  type LevelProgress,
} from "./curve.ts";
import { SKILL_IDS, SKILLS, isSkillId, type SkillId, type UnlockEntry } from "./skills.ts";
import {
  CONTENT_BY_ID, NODE_KIND_SKILL, bestEntryFor, entriesFor, nextEntryFor, skillLadder,
  type ContentEntry, type NodeKind,
} from "./content.ts";

export const PROGRESSION_EVENTS = {
  xp: "skill:xp",
  levelUp: "skill:levelup",
  unlock: "skill:unlock",
} as const;

export interface SkillXpEvent {
  readonly skill: SkillId;
  /** XP actually banked after boost and cap clamping. */
  readonly amount: number;
  readonly totalXp: number;
  readonly level: number;
  /** 0..1 into the current level. */
  readonly progress: number;
  readonly source: string;
}

export interface SkillLevelUpEvent {
  readonly skill: SkillId;
  readonly level: number;
  readonly previousLevel: number;
  readonly unlocks: readonly UnlockEntry[];
  readonly atCap: boolean;
}

export interface SkillUnlockEvent {
  readonly skill: SkillId;
  readonly level: number;
  readonly unlock: UnlockEntry;
}

export interface ProgressionSave {
  readonly v: 1;
  /** skill id → total xp. Missing keys are treated as 0. */
  readonly xp: Partial<Record<SkillId, number>>;
}

export interface SkillSnapshot extends LevelProgress {
  readonly skill: SkillId;
  readonly name: string;
}

const SAVE_VERSION = 1 as const;

export class ProgressionSystem implements System {
  readonly id = "progression";

  private bus: GameContext["bus"] | null = null;
  private readonly xp: Record<SkillId, number>;
  private readonly level: Record<SkillId, number>;
  /** Per-skill XP multiplier — events, gear, premium boosts. */
  private readonly boost: Record<SkillId, number>;
  /** Ladder entries already announced, so hydrate() stays quiet. */
  private readonly announced = new Set<string>();

  constructor(initial?: ProgressionSave) {
    this.xp = {} as Record<SkillId, number>;
    this.level = {} as Record<SkillId, number>;
    this.boost = {} as Record<SkillId, number>;
    for (const id of SKILL_IDS) {
      this.xp[id] = 0;
      this.level[id] = 1;
      this.boost[id] = 1;
    }
    if (initial) this.hydrate(initial, { silent: true });
    else this.seedAnnounced();
  }

  init(ctx: GameContext): void {
    this.bus = ctx.bus;
  }

  destroy(): void {
    this.bus = null;
  }

  /* ── granting ─────────────────────────────────────────────── */

  /**
   * Bank XP. Returns the amount actually credited (0 at the cap).
   * `amount` is pre-boost; fractional input is accumulated by
   * rounding at the total, so 0.4 xp ticks are not lost.
   */
  grant(skill: SkillId, amount: number, source = "unknown"): number {
    if (!(skill in this.xp) || !(amount > 0)) return 0;

    const before = this.xp[skill];
    if (before >= TOTAL_XP_TO_MAX) {
      this.emitXp(skill, 0, source);
      return 0;
    }

    const boosted = amount * this.boost[skill];
    const after = Math.min(TOTAL_XP_TO_MAX, before + boosted);
    const credited = after - before;
    this.xp[skill] = after;

    const previousLevel = this.level[skill];
    const nextLevel = levelFromTotalXp(after);

    this.emitXp(skill, credited, source);

    if (nextLevel > previousLevel) {
      this.level[skill] = nextLevel;
      for (let l = previousLevel + 1; l <= nextLevel; l++) {
        const unlocks = this.unlocksAt(skill, l);
        for (const u of unlocks) {
          this.announced.add(u.id);
          this.bus?.emit<SkillUnlockEvent>(PROGRESSION_EVENTS.unlock, { skill, level: l, unlock: u });
        }
        this.bus?.emit<SkillLevelUpEvent>(PROGRESSION_EVENTS.levelUp, {
          skill, level: l, previousLevel: l - 1, unlocks, atCap: l >= MAX_LEVEL,
        });
      }
    }
    return credited;
  }

  /** Grant against a content entry — the normal gameplay path. */
  grantFor(entryId: string, multiplier = 1, source = "action"): number {
    const entry = CONTENT_BY_ID.get(entryId);
    if (!entry) return 0;
    return this.grant(entry.skill, entry.xp * multiplier, source);
  }

  private emitXp(skill: SkillId, amount: number, source: string) {
    const p = progressAt(this.xp[skill]);
    this.bus?.emit<SkillXpEvent>(PROGRESSION_EVENTS.xp, {
      skill, amount, totalXp: p.totalXp, level: p.level, progress: p.progress, source,
    });
  }

  /* ── queries ──────────────────────────────────────────────── */

  levelOf(skill: SkillId): number { return this.level[skill]; }
  xpOf(skill: SkillId): number { return this.xp[skill]; }
  boostOf(skill: SkillId): number { return this.boost[skill]; }

  setBoost(skill: SkillId, multiplier: number): void {
    this.boost[skill] = Math.max(0, multiplier);
  }

  progressOf(skill: SkillId): SkillSnapshot {
    return { ...progressAt(this.xp[skill]), skill, name: SKILLS[skill].name };
  }

  snapshot(): readonly SkillSnapshot[] {
    return SKILL_IDS.map((id) => this.progressOf(id));
  }

  /** Sum of every skill level — the classic "total level" flex. */
  totalLevel(): number {
    let n = 0;
    for (const id of SKILL_IDS) n += this.level[id];
    return n;
  }

  totalXp(): number {
    let n = 0;
    for (const id of SKILL_IDS) n += this.xp[id];
    return n;
  }

  /** Can the player work a node of this kind at this tier? */
  canGather(nodeKind: NodeKind, tier: number): boolean {
    const skill = NODE_KIND_SKILL[nodeKind];
    const entry = bestEntryFor(skill, this.level[skill]);
    return entry.tier >= tier;
  }

  /** Level gate only — inventory checks belong to the economy system. */
  canPerform(contentId: string): boolean {
    const entry = CONTENT_BY_ID.get(contentId);
    return !!entry && this.level[entry.skill] >= entry.level;
  }

  unlockedContent(skill: SkillId): readonly ContentEntry[] {
    return entriesFor(skill, this.level[skill]);
  }

  /** Best thing this skill can currently do. */
  bestContent(skill: SkillId): ContentEntry {
    return bestEntryFor(skill, this.level[skill]);
  }

  /** Next content tier — null at the top. */
  nextContent(skill: SkillId): ContentEntry | null {
    return nextEntryFor(skill, this.level[skill]);
  }

  /** Next thing of *any* kind on the ladder, with the XP owed. */
  nextUnlock(skill: SkillId): (UnlockEntry & { xpAway: number }) | null {
    const level = this.level[skill];
    for (const u of skillLadder(skill)) {
      if (u.level > level) return { ...u, xpAway: xpRemainingTo(this.xp[skill], u.level) };
    }
    return null;
  }

  unlocksAt(skill: SkillId, level: number): readonly UnlockEntry[] {
    return skillLadder(skill).filter((u) => u.level === level);
  }

  /** Everything already earned — the skill sheet's history list. */
  earnedUnlocks(skill: SkillId): readonly UnlockEntry[] {
    const level = this.level[skill];
    return skillLadder(skill).filter((u) => u.level <= level);
  }

  /* ── save / load ──────────────────────────────────────────── */

  serialize(): ProgressionSave {
    const xp: Partial<Record<SkillId, number>> = {};
    for (const id of SKILL_IDS) if (this.xp[id] > 0) xp[id] = Math.round(this.xp[id]);
    return { v: SAVE_VERSION, xp };
  }

  hydrate(save: ProgressionSave, opts: { silent?: boolean } = {}): void {
    for (const id of SKILL_IDS) {
      const raw = save.xp[id];
      const value = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
      this.xp[id] = Math.min(value, TOTAL_XP_TO_MAX);
      this.level[id] = levelFromTotalXp(this.xp[id]);
    }
    this.seedAnnounced();
    if (!opts.silent) for (const id of SKILL_IDS) this.emitXp(id, 0, "hydrate");
  }

  /** Mark everything already owned as announced so a load does not
      spam the toast queue with 400 unlocks. */
  private seedAnnounced(): void {
    this.announced.clear();
    for (const id of SKILL_IDS) {
      for (const u of skillLadder(id)) {
        if (u.level <= this.level[id]) this.announced.add(u.id);
      }
    }
  }

  /* ── static helpers callers find useful ───────────────────── */

  static isSkill(v: string): v is SkillId { return isSkillId(v); }
  static xpForLevel = xpForLevel;
  static totalXpForLevel = totalXpForLevel;
  static levelFromTotalXp = levelFromTotalXp;
  static readonly maxLevel = MAX_LEVEL;
  static readonly totalXpToMax = TOTAL_XP_TO_MAX;
}
