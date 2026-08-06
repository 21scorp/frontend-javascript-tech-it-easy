/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — progression/content.ts
   Every gatherable, craftable, killable and buildable thing, as
   data. Eight tiers per skill so the next unlock is never more
   than ~15 levels away, and — once tools, stations, zones and
   perks are merged in by `skillLadder()` — something new lands
   roughly every 4-6 levels for the whole 1-100 run.

   WHY THE NUMBERS LOOK LIKE THIS:

   Pacing has exactly two dials: xp-per-action (TIER_XP_SCALE, in
   curve.ts) and seconds-per-action (CATEGORY_RATES below). Every
   skill reuses the same tier xp ladder and only swaps a category
   factor, so a skill's whole throughput curve is one number:

     gathering    1.00×   the baseline the curve was solved on
     production   1.19×   you already paid for the inputs
     combat       0.95×   kills are slower but drop loot
     construction 0.92×   long projects, big chunks
     slayer       0.88×   task-gated, pays in rare drops
     trading      0.87×   slowest xp, best coin

   That 1.19/0.87 spread is deliberately narrow — 1.37× end to
   end. The level-50 window (15-25 h) is only 1.67× wide, so a
   wider skill spread would push the fastest skill out of the
   bottom of the window while the slowest fell out of the top.
   Value tables are free to be wild
   (trading contracts are worth 70× a fish) because coin is a
   separate economy from xp.
   ═══════════════════════════════════════════════════════════════ */

import {
  SKILL_IDS, SKILLS, TOOL_STEPS, toolSpeedAt,
  type SkillId, type UnlockEntry,
} from "./skills.ts";
import { TIER_COUNT, TIER_LEVELS, TIER_XP_SCALE } from "./curve.ts";

/* ── zones ──────────────────────────────────────────────────── */

export type ZoneId =
  | "z_shallows" | "z_cove" | "z_fen" | "z_quarry"
  | "z_mistvale" | "z_terrace" | "z_stormreach" | "z_deepshelf"
  | "z_home";

export interface ZoneDef {
  readonly id: ZoneId;
  readonly name: string;
  /** Skill level in the relevant skill that opens the zone.
      Set 2-3 levels below the tier it hosts so the map opens
      *before* the resource does — you can see the next thing. */
  readonly level: number;
  readonly flavour: string;
}

/** Index = tier - 1 for the eight field zones. */
export const FIELD_ZONES: readonly ZoneDef[] = [
  { id: "z_shallows",   name: "Tidepool Shallows",  level: 1,  flavour: "Warm rock pools where the island first fed you." },
  { id: "z_cove",       name: "Driftwood Cove",     level: 4,  flavour: "A crescent of pale sand and wrecked hulls." },
  { id: "z_fen",        name: "Saltmarsh Fen",      level: 10, flavour: "Brackish channels, reed islands, things that watch." },
  { id: "z_quarry",     name: "Emberstone Quarry",  level: 20, flavour: "Cut terraces still warm from the old firings." },
  { id: "z_mistvale",   name: "Mistvale Woods",     level: 32, flavour: "Fog that never lifts and trees that lean in." },
  { id: "z_terrace",    name: "Coral Terraces",     level: 47, flavour: "Drowned garden steps, bright as a spilled paintbox." },
  { id: "z_stormreach",name: "Stormreach Cliffs",   level: 64, flavour: "Wind that takes your voice before your footing." },
  { id: "z_deepshelf",  name: "The Deepshelf",      level: 82, flavour: "Past the drop-off. Lantern light and old hunger." },
];

export const HOME_ZONE: ZoneDef = {
  id: "z_home", name: "Tidefall Hearth", level: 1,
  flavour: "Your camp, then your workshop, then your town.",
};

export const ZONES: Record<ZoneId, ZoneDef> = (() => {
  const out = {} as Record<ZoneId, ZoneDef>;
  for (const z of FIELD_ZONES) out[z.id] = z;
  out[HOME_ZONE.id] = HOME_ZONE;
  return out;
})();

/* ── content shape ──────────────────────────────────────────── */

export type NodeKind =
  | "fishing_spot" | "tree" | "vein" | "patch"
  | "forge" | "hearth" | "workbench" | "alembic"
  | "monster" | "lair"
  | "plot" | "market";

export interface ContentInput {
  readonly id: string;
  readonly qty: number;
}

export interface ContentEntry {
  readonly id: string;
  readonly name: string;
  readonly skill: SkillId;
  /** 1-8. */
  readonly tier: number;
  readonly level: number;
  /** XP for one completed action. */
  readonly xp: number;
  /** Base seconds for one action, before tool speed. */
  readonly seconds: number;
  /** Base sale value in shells (the island's coin). */
  readonly value: number;
  readonly node: NodeKind;
  readonly zone: ZoneId;
  readonly inputs: readonly ContentInput[];
  readonly flavour: string;
}

/* ── category rate tables ───────────────────────────────────────
   `xpFactor` scales TIER_XP_SCALE; `seconds` is the action time
   per tier. rate = xp / seconds. Nothing else touches pacing. */

export type RateCategory = "gathering" | "production" | "combat" | "slayer" | "construction" | "trading";

export interface CategoryRate {
  readonly xpFactor: number;
  readonly seconds: readonly number[];
  readonly values: readonly number[];
}

export const CATEGORY_RATES: Record<RateCategory, CategoryRate> = {
  gathering: {
    xpFactor: 1.0,
    seconds: [3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2, 4.5],
    values:  [3, 7, 16, 36, 80, 175, 380, 820],
  },
  production: {
    xpFactor: 1.824,
    seconds: [4.6, 4.9, 5.2, 5.5, 5.8, 6.1, 6.4, 6.8],
    values:  [12, 28, 62, 140, 310, 680, 1480, 3200],
  },
  combat: {
    xpFactor: 2.5,
    seconds: [7.9, 8.4, 8.9, 9.5, 10.0, 10.5, 11.0, 11.8],
    values:  [8, 19, 44, 100, 225, 500, 1100, 2400],
  },
  slayer: {
    xpFactor: 2.3,
    seconds: [7.8, 8.4, 8.9, 9.4, 9.9, 10.4, 11.0, 11.8],
    values:  [14, 33, 76, 175, 390, 860, 1900, 4200],
  },
  construction: {
    xpFactor: 13.8,
    seconds: [45, 48, 51, 54, 57, 60, 63, 67.5],
    values:  [260, 620, 1450, 3300, 7400, 16000, 35000, 76000],
  },
  trading: {
    xpFactor: 11.6,
    seconds: [40, 43, 45, 48, 51, 53, 56, 60],
    values:  [200, 470, 1100, 2500, 5600, 12000, 27000, 58000],
  },
};

/* ── the tables ─────────────────────────────────────────────── */

type Row = readonly [slug: string, name: string, flavour: string];

interface SkillContentSpec {
  readonly skill: SkillId;
  readonly rate: RateCategory;
  readonly node: NodeKind;
  readonly prefix: string;
  /** Home-island skills never leave z_home. */
  readonly homebound: boolean;
  /** Per-tier inputs pulled from other skills' tables. */
  readonly inputsFrom: readonly (readonly [prefix: string, qty: number])[];
  readonly rows: readonly Row[];
}

const SPECS: readonly SkillContentSpec[] = [
  {
    skill: "fishing", rate: "gathering", node: "fishing_spot", prefix: "fish",
    homebound: false, inputsFrom: [],
    rows: [
      ["shrimp",      "Tidepool Shrimp",       "Sweet, tiny, and everywhere at low tide."],
      ["sardine",     "Silverfin Sardine",     "They turn as one flashing sheet."],
      ["eel",         "Saltmarsh Eel",         "Bites the bucket, bites you, worth it."],
      ["trout",       "Bluecap Trout",         "Runs the brook where the fen goes fresh."],
      ["snapper",     "Coral Snapper",         "Guards the terrace steps like it owns them."],
      ["tuna",        "Stormfin Tuna",         "Only surfaces when the cliffs are roaring."],
      ["lanternfish", "Deepshelf Lanternfish", "Its light is the only light down there."],
      ["tidewyrm",    "Tidewyrm Elver",        "A hatchling. The mother is still down there."],
    ],
  },
  {
    skill: "woodcutting", rate: "gathering", node: "tree", prefix: "wood",
    homebound: false, inputsFrom: [],
    rows: [
      ["driftwood",  "Driftwood Bundle", "Salt-cured and free for the taking."],
      ["palmwood",   "Palmwood Log",     "Light, springy, splits along the grain."],
      ["saltcedar",  "Saltcedar Log",    "Grows crooked out of brine and spite."],
      ["mistoak",    "Mistoak Log",      "Rings so tight you can barely count them."],
      ["ironbark",   "Ironbark Log",     "Dulls two axes before it falls."],
      ["bloomwillow","Bloomwillow Log",  "Flowers even after it's cut."],
      ["stormpine",  "Stormpine Log",    "Struck so often it hums in the hand."],
      ["moonwood",   "Moonwood Log",     "Pale as bone, cool as the sea at night."],
    ],
  },
  {
    skill: "mining", rate: "gathering", node: "vein", prefix: "ore",
    homebound: false, inputsFrom: [],
    rows: [
      ["copper",      "Copper Ore",        "Green-veined and soft enough to start on."],
      ["tin",         "Tin Ore",           "Dull grey, but copper's other half."],
      ["iron",        "Iron Ore",          "The honest backbone of every tool."],
      ["emberstone",  "Emberstone",        "Still warm. Always still warm."],
      ["silverglass", "Silverglass Shard", "Cuts light into colours that aren't there."],
      ["tidesteel",   "Tidesteel Ore",     "Rings like a bell when the tide turns."],
      ["stormcore",   "Stormcore Ore",     "Holds a charge. Mind your gloves."],
      ["abyssite",    "Abyssite Ore",      "Black, and somehow deeper than black."],
    ],
  },
  {
    skill: "foraging", rate: "gathering", node: "patch", prefix: "herb",
    homebound: false, inputsFrom: [],
    rows: [
      ["saltweed",   "Saltweed",         "Bitter, common, stops a wound going bad."],
      ["sunfern",    "Sunfern Frond",    "Curls toward whatever light it can find."],
      ["dewpetal",   "Dewpetal",         "Holds a bead of water all day long."],
      ["marshbloom", "Marshbloom",       "Opens once, at dusk, in the fen."],
      ["emberroot",  "Emberroot",        "Peppery enough to make your eyes run."],
      ["moonleaf",   "Moonleaf",         "Silver underside; only picks clean at night."],
      ["stormpetal", "Stormpetal",       "Grows where lightning has already been."],
      ["tidelotus",  "Tidelotus",        "Blooms on the drop-off, once a season."],
    ],
  },
  {
    skill: "smithing", rate: "production", node: "forge", prefix: "bar",
    homebound: true, inputsFrom: [["ore", 2]],
    rows: [
      ["copper",     "Copper Bar",             "Your first honest ingot."],
      ["bronze",     "Bronze Bar",             "Two soft metals, one hard result."],
      ["iron",       "Iron Bar",               "Grey, heavy, endlessly useful."],
      ["steel",      "Emberforged Steel Bar",  "Quenched in quarry runoff."],
      ["silverglass","Silverglass Ingot",      "Half metal, half window."],
      ["tidesteel",  "Tidesteel Bar",          "Cools to the rhythm of the tide."],
      ["stormcore",  "Stormcore Bar",          "Sparks jump between the tongs."],
      ["abyssite",   "Abyssite Bar",           "Drinks the forge light and gives none back."],
    ],
  },
  {
    skill: "cooking", rate: "production", node: "hearth", prefix: "meal",
    homebound: true, inputsFrom: [["fish", 1]],
    rows: [
      ["shrimp",   "Grilled Shrimp",      "Three minutes on a hot stone."],
      ["sardine",  "Sardine Skewer",      "Salt, smoke, done."],
      ["eel",      "Smoked Eel",          "Worth the fight it put up."],
      ["trout",    "Herbed Trout",        "Dewpetal in the cavity. Trust it."],
      ["snapper",  "Snapper Chowder",     "The bowl everyone comes back for."],
      ["tuna",     "Stormfin Steak",      "Seared black outside, ruby within."],
      ["lantern",  "Lanternfish Broth",   "Glows faintly. That's fine. Probably."],
      ["tidewyrm", "Tidewyrm Feast",      "Feeds the whole harbour for a night."],
    ],
  },
  {
    skill: "crafting", rate: "production", node: "workbench", prefix: "craft",
    homebound: true, inputsFrom: [["wood", 2]],
    rows: [
      ["charm",   "Driftwood Charm",     "For luck. It has never once worked."],
      ["rope",    "Palmfiber Rope",      "The island runs on rope."],
      ["bow",     "Saltcedar Longbow",   "Crooked wood, straight arrows."],
      ["buckler", "Mistoak Buckler",     "Takes a hit and asks for another."],
      ["totem",   "Ironbark Totem",      "Planted at the treeline. Things stay out."],
      ["regalia", "Bloomwillow Regalia", "Still flowering when you wear it."],
      ["talisman","Stormpine Talisman",  "Warms just before the weather turns."],
      ["crown",   "Moonwood Crown",      "Worn by whoever the tide chooses."],
    ],
  },
  {
    skill: "alchemy", rate: "production", node: "alembic", prefix: "potion",
    homebound: true, inputsFrom: [["herb", 2]],
    rows: [
      ["tonic",     "Saltweed Tonic",       "Tastes like the harbour. Works anyway."],
      ["draught",   "Sunfern Draught",      "Warmth from the inside out."],
      ["elixir",    "Dewpetal Elixir",      "Clears the head and the eyes."],
      ["philtre",   "Marshbloom Philtre",   "Dusk in a bottle."],
      ["brew",      "Emberroot Brew",       "Drink it and you will not feel the cold."],
      ["infusion",  "Moonleaf Infusion",    "Silver, and cold to the tongue."],
      ["distillate","Stormpetal Distillate","The vial hums between your fingers."],
      ["ambrosia",  "Tidelotus Ambrosia",   "One sip. That is the whole dose."],
    ],
  },
  {
    skill: "combat", rate: "combat", node: "monster", prefix: "mob",
    homebound: false, inputsFrom: [],
    rows: [
      ["shorecrab", "Shorecrab",          "Sideways, stubborn, mostly harmless."],
      ["sprite",    "Kelp Sprite",        "A tangle of weed with opinions."],
      ["lurker",    "Fen Lurker",         "You hear it leave, never arrive."],
      ["golem",     "Emberstone Golem",   "Quarry stone that got up and kept going."],
      ["wolf",      "Mistvale Wolf",      "Hunts the fog line in threes."],
      ["revenant",  "Coral Revenant",     "Drowned, and it took the reef with it."],
      ["wyvern",    "Stormreach Wyvern",  "Rides the updraft, drops like a stone."],
      ["herald",    "Abyssal Herald",     "It was announcing something. To whom?"],
    ],
  },
  {
    skill: "slayer", rate: "slayer", node: "lair", prefix: "slay",
    homebound: false, inputsFrom: [],
    rows: [
      ["skitterer", "Sand Skitterer",   "A starter contract from the Tidewatch."],
      ["brinehound","Brinehound",       "Follows scent through salt water. Somehow."],
      ["wraith",    "Fen Wraith",       "Reed-shaped, and it remembers your name."],
      ["imp",       "Cinder Imp",       "Sets the quarry alight for fun."],
      ["stalker",   "Mistvale Stalker", "Matches your pace exactly. Always."],
      ["warden",    "Drowned Warden",   "Still guarding a gate that is gone."],
      ["harbinger", "Gale Harbinger",   "Arrives with the storm, or brings it."],
      ["tyrant",    "Abyss Tyrant",     "The contract has no reward listed. Only a name."],
    ],
  },
  {
    skill: "construction", rate: "construction", node: "plot", prefix: "build",
    homebound: true, inputsFrom: [["wood", 4], ["bar", 2]],
    rows: [
      ["hut",       "Driftwood Hut",     "A roof. Everything starts with a roof."],
      ["dock",      "Fishing Dock",      "Now the boats can come to you."],
      ["hearth",    "Smoke Hearth",      "The first building that smells like home."],
      ["forge",     "Tidefall Forge",    "Chimney up, sparks out, town on the map."],
      ["hall",      "Artisan Hall",      "Benches, light, and people arguing over grain."],
      ["tower",     "Alembic Tower",     "Glassware all the way to the rafters."],
      ["lighthouse","Storm Lighthouse",  "Ships stop breaking on the reach."],
      ["sanctum",   "Tidefall Sanctum",  "The spire the whole island can see."],
    ],
  },
  {
    skill: "trading", rate: "trading", node: "market", prefix: "trade",
    homebound: true, inputsFrom: [["craft", 4]],
    rows: [
      ["peddler",   "Shore Peddler Contract",  "One cart, one road, one honest margin."],
      ["skiff",     "Cove Skiff Route",        "Four crates a run, weather permitting."],
      ["caravan",   "Fen Caravan Route",       "Long way round, but it always arrives."],
      ["consortium","Quarry Consortium Deal",  "They want stone. You want the rates."],
      ["exchange",  "Mistvale Exchange Seat",  "A chair at the table nobody offers twice."],
      ["guild",     "Coral Guild Charter",     "Signed in ink that doesn't run underwater."],
      ["convoy",    "Storm Convoy Contract",   "Six hulls out, five back, still profitable."],
      ["charter",   "Abyssal Charter",         "Nobody will say who countersigned it."],
    ],
  },
];

function buildContent(): ContentEntry[] {
  const out: ContentEntry[] = [];
  for (const spec of SPECS) {
    const rate = CATEGORY_RATES[spec.rate];
    for (let i = 0; i < TIER_COUNT; i++) {
      const row = spec.rows[i];
      const inputs: ContentInput[] = spec.inputsFrom.map(([prefix, qty]) => ({
        id: `${prefix}_${SPECS.find((s) => s.prefix === prefix)!.rows[i][0]}`,
        qty,
      }));
      out.push({
        id: `${spec.prefix}_${row[0]}`,
        name: row[1],
        skill: spec.skill,
        tier: i + 1,
        level: TIER_LEVELS[i],
        xp: Math.round(TIER_XP_SCALE[i] * rate.xpFactor),
        seconds: rate.seconds[i],
        value: rate.values[i],
        node: spec.node,
        zone: spec.homebound ? HOME_ZONE.id : FIELD_ZONES[i].id,
        inputs,
        flavour: row[2],
      });
    }
  }
  return out;
}

export const CONTENT: readonly ContentEntry[] = buildContent();

export const CONTENT_BY_ID: ReadonlyMap<string, ContentEntry> =
  new Map(CONTENT.map((e) => [e.id, e]));

export const CONTENT_BY_SKILL: Record<SkillId, readonly ContentEntry[]> = (() => {
  const out = {} as Record<SkillId, ContentEntry[]>;
  for (const id of SKILL_IDS) out[id] = [];
  for (const e of CONTENT) out[e.skill].push(e);
  for (const id of SKILL_IDS) out[id].sort((a, b) => a.tier - b.tier);
  return out;
})();

/** Which skill governs a node kind — powers `canGather`. */
export const NODE_KIND_SKILL: Record<NodeKind, SkillId> = {
  fishing_spot: "fishing",
  tree: "woodcutting",
  vein: "mining",
  patch: "foraging",
  forge: "smithing",
  hearth: "cooking",
  workbench: "crafting",
  alembic: "alchemy",
  monster: "combat",
  lair: "slayer",
  plot: "construction",
  market: "trading",
};

/* ── queries ────────────────────────────────────────────────── */

export function entriesFor(skill: SkillId, level: number): readonly ContentEntry[] {
  return CONTENT_BY_SKILL[skill].filter((e) => e.level <= level);
}

/** Highest-tier thing this skill can do right now. Always defined
    (tier 1 is level 1) so callers never branch on null. */
export function bestEntryFor(skill: SkillId, level: number): ContentEntry {
  const list = CONTENT_BY_SKILL[skill];
  let best = list[0];
  for (const e of list) if (e.level <= level) best = e;
  return best;
}

export function nextEntryFor(skill: SkillId, level: number): ContentEntry | null {
  for (const e of CONTENT_BY_SKILL[skill]) if (e.level > level) return e;
  return null;
}

/** Effective xp/hour for one entry at a given level (tool applied). */
export function xpPerHour(entry: ContentEntry, level: number): number {
  return (entry.xp / (entry.seconds / toolSpeedAt(level))) * 3600;
}

/** Peak xp/hour available to a skill at `level`. The sim's core. */
export function bestXpPerHour(skill: SkillId, level: number): number {
  return xpPerHour(bestEntryFor(skill, level), level);
}

/* ── the merged unlock ladder ───────────────────────────────── */

const CONTENT_UNLOCK_KIND: Record<SkillId, UnlockEntry["kind"]> = {
  fishing: "resource", woodcutting: "resource", mining: "resource", foraging: "resource",
  smithing: "recipe", cooking: "recipe", crafting: "recipe", alchemy: "recipe",
  combat: "monster", slayer: "monster",
  construction: "project", trading: "contract",
};

const LADDER_CACHE = new Map<SkillId, readonly UnlockEntry[]>();

/**
 * The full ladder for a skill: content + zones + tools + stations
 * + perks, ascending. This is what the level-up toast reads and
 * what `nextUnlock()` walks.
 */
export function skillLadder(skill: SkillId): readonly UnlockEntry[] {
  const cached = LADDER_CACHE.get(skill);
  if (cached) return cached;

  const kind = CONTENT_UNLOCK_KIND[skill];
  const out: UnlockEntry[] = SKILLS[skill].ladder.map((u) => u);

  for (const e of CONTENT_BY_SKILL[skill]) {
    out.push({
      level: e.level,
      kind,
      id: e.id,
      name: e.name,
      note: `${e.xp} xp · ${e.value} shells · ${ZONES[e.zone].name}`,
    });
    if (e.zone !== HOME_ZONE.id) {
      const zone = ZONES[e.zone];
      out.push({
        level: zone.level,
        kind: "zone",
        id: `${skill}.zone.${zone.id}`,
        name: zone.name,
        note: zone.flavour,
      });
    }
  }

  const seen = new Set<string>();
  const merged = out
    .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
    .sort((a, b) => a.level - b.level || a.kind.localeCompare(b.kind));

  LADDER_CACHE.set(skill, merged);
  return merged;
}

/** Sanity net: every tool step must have a name and every tier a row. */
export const CONTENT_INTEGRITY = {
  entries: CONTENT.length,
  expected: SPECS.length * TIER_COUNT,
  toolSteps: TOOL_STEPS.length,
};
