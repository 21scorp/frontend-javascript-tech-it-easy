/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — progression/index.ts
   One import site for the rest of the game. Wire it with:

     import { ProgressionSystem } from "../progression";
     systems.push(new ProgressionSystem(save?.progression));
   ═══════════════════════════════════════════════════════════════ */

export {
  ProgressionSystem, PROGRESSION_EVENTS,
  type SkillXpEvent, type SkillLevelUpEvent, type SkillUnlockEvent,
  type ProgressionSave, type SkillSnapshot,
} from "./progression.ts";

export {
  SKILLS, SKILL_IDS, SKILLS_BY_CATEGORY, TOOL_STEPS, STATION_STEPS,
  isSkillId, toolSpeedAt,
  type SkillId, type SkillCategory, type SkillDef,
  type UnlockKind, type UnlockEntry, type ToolStep,
} from "./skills.ts";

export {
  MAX_LEVEL, CURVE, TOTAL_XP_TO_MAX, TIER_COUNT, TIER_LEVELS, TIER_XP_SCALE,
  xpForLevel, totalXpForLevel, levelFromTotalXp, progressAt, xpRemainingTo,
  tierAtLevel, tierXpMultiplier, buildCurveTable,
  type CurveParams, type CurveTable, type LevelProgress,
} from "./curve.ts";

export {
  CONTENT, CONTENT_BY_ID, CONTENT_BY_SKILL, CATEGORY_RATES,
  ZONES, FIELD_ZONES, HOME_ZONE, NODE_KIND_SKILL,
  entriesFor, bestEntryFor, nextEntryFor, xpPerHour, bestXpPerHour, skillLadder,
  type ZoneId, type ZoneDef, type NodeKind, type ContentEntry, type ContentInput,
  type RateCategory, type CategoryRate,
} from "./content.ts";
