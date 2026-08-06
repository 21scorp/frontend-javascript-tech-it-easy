/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — progression/skills.ts
   The twelve skills, and the *non-content* half of every unlock
   ladder: tools, workstations and perks.

   WHY split the ladder? Resource tiers, recipes and zones live in
   content.ts because they carry balance numbers (xp, seconds,
   value). Tools/stations/perks are pure progression furniture, so
   they live next to the skill definitions. content.ts owns the
   merge (`skillLadder`) — this file never imports it, which keeps
   the dependency arrow one-way: skills → content → progression.

   TUNING NOTE: only TOOL_STEPS.speed feeds the xp-rate model.
   Stations and perks are deliberately economy/flavour bonuses so
   that pacing has exactly two dials (resource tier + tool tier)
   and the simulation in sim.ts stays honest.
   ═══════════════════════════════════════════════════════════════ */

export type SkillId =
  | "fishing" | "woodcutting" | "mining" | "foraging"
  | "smithing" | "cooking" | "crafting" | "alchemy"
  | "combat" | "slayer"
  | "construction" | "trading";

export type SkillCategory = "gathering" | "production" | "combat" | "support";

/** What kind of thing an unlock hands the player. */
export type UnlockKind =
  | "resource" | "recipe" | "monster" | "project" | "contract"
  | "tool" | "station" | "zone" | "perk";

export interface UnlockEntry {
  /** Skill level at which this becomes available. */
  readonly level: number;
  readonly kind: UnlockKind;
  readonly id: string;
  readonly name: string;
  /** One-line "what this actually does" for the level-up toast. */
  readonly note: string;
}

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  readonly category: SkillCategory;
  /** Cozy-island-fantasy one-liner for the skill sheet. */
  readonly flavour: string;
  /** Production skills consume the output of this skill. */
  readonly feeder?: SkillId;
  /** Tools + stations + perks, ascending by level. Content is merged
      in by `skillLadder()` in content.ts. */
  readonly ladder: readonly UnlockEntry[];
}

/* ── tool ladder ────────────────────────────────────────────────
   Seven steps. `speed` divides the base action time, so the top
   tool is a 1.57× throughput gain across a full skill. That is a
   deliberate second growth axis on top of resource tiers: it keeps
   levels 40-90 rewarding even when the next resource tier is 15
   levels away, and the simulation folds it into every xp/hr. */
export interface ToolStep {
  readonly level: number;
  readonly speed: number;
}

export const TOOL_STEPS: readonly ToolStep[] = [
  { level: 1,  speed: 1.00 },
  { level: 10, speed: 1.07 },
  { level: 25, speed: 1.15 },
  { level: 40, speed: 1.24 },
  { level: 55, speed: 1.34 },
  { level: 70, speed: 1.45 },
  { level: 85, speed: 1.57 },
];

/** Workstation upgrades — value/yield only, never speed. */
export const STATION_STEPS: readonly number[] = [15, 30, 45, 60, 75, 90];

const TOOL_NAMES: Record<SkillId, readonly string[]> = {
  fishing:      ["Driftwood Rod", "Palmfiber Rod", "Saltcedar Rod", "Ironbark Rod", "Tidesteel Rod", "Stormcore Rod", "Abyssite Rod"],
  woodcutting:  ["Chipped Hatchet", "Bronze Axe", "Iron Axe", "Emberforged Axe", "Tidesteel Axe", "Stormcore Axe", "Abyssite Axe"],
  mining:       ["Beachstone Pick", "Bronze Pick", "Iron Pick", "Emberforged Pick", "Tidesteel Pick", "Stormcore Pick", "Abyssite Pick"],
  foraging:     ["Bare Hands", "Woven Basket", "Herbalist's Knife", "Dewsilk Gloves", "Moonsilk Satchel", "Stormglass Shears", "Abyssal Reliquary"],
  smithing:     ["Field Anvil", "Bronze Anvil", "Iron Anvil", "Emberforged Anvil", "Tidesteel Anvil", "Stormcore Anvil", "Abyssite Anvil"],
  cooking:      ["Beach Spit", "Clay Oven", "Iron Skillet", "Ember Range", "Tidesteel Cauldron", "Storm Kettle", "Abyssal Brazier"],
  crafting:     ["Whittling Knife", "Bone Awl", "Iron Chisel", "Ember Lathe", "Tidesteel Loom", "Storm Etcher", "Moonwood Bench"],
  alchemy:      ["Cracked Mortar", "Clay Alembic", "Glass Retort", "Ember Crucible", "Silverglass Still", "Stormglass Condenser", "Abyssal Athanor"],
  combat:       ["Driftwood Club", "Bronze Blade", "Iron Blade", "Emberforged Blade", "Tidesteel Blade", "Stormcore Blade", "Abyssite Blade"],
  slayer:       ["Frayed Snare", "Bronze Trap", "Iron Manacles", "Ember Brand", "Tidesteel Harpoon", "Storm Lance", "Abyssal Sigil"],
  construction: ["Hand Saw", "Bronze Saw", "Iron Saw", "Ember Toolbelt", "Tidesteel Crane", "Storm Scaffold", "Abyssite Rig"],
  trading:      ["Tally Stick", "Cove Ledger", "Fen Abacus", "Quarry Seal", "Mistvale Charter", "Storm Manifest", "Abyssal Contract"],
};

const STATION_NAMES: Record<SkillId, readonly string[]> = {
  fishing:      ["Bait Shack", "Crab Trap Line", "Netting Rack", "Salt Cellar", "Deep Winch", "Tidewatch Pier"],
  woodcutting:  ["Log Sled", "Splitting Stump", "Sawpit", "Drying Rack", "Timber Hoist", "Grove Shrine"],
  mining:       ["Ore Cart", "Sorting Table", "Shaft Props", "Blast Cache", "Vein Compass", "Deep Elevator"],
  foraging:     ["Drying Line", "Seed Trays", "Herb Press", "Glasshouse", "Moonlit Bed", "Bloom Vault"],
  smithing:     ["Bellows", "Charcoal Pit", "Quench Trough", "Ember Furnace", "Twin Hammers", "Tidesteel Crucible"],
  cooking:      ["Spice Rack", "Smokehouse", "Cold Larder", "Banquet Table", "Stock Pot Row", "Feast Hall"],
  crafting:     ["Tool Rack", "Glue Pot", "Dye Vats", "Gem Setter", "Loom Frame", "Reliquary Bench"],
  alchemy:      ["Vial Shelf", "Cooling Coil", "Reagent Press", "Catalyst Font", "Twin Retorts", "Starlight Still"],
  combat:       ["Sparring Post", "Armour Stand", "Whetstone", "Drill Yard", "War Table", "Champion's Ring"],
  slayer:       ["Bounty Board", "Trophy Wall", "Trap Bench", "Bane Library", "Tracking Kennel", "Tyrant's Reliquary"],
  construction: ["Plank Pile", "Nail Bin", "Mortar Mixer", "Crane Post", "Blueprint Desk", "Grand Scaffold"],
  trading:      ["Market Stall", "Weigh Scales", "Strongbox", "Warehouse", "Signal Flags", "Counting House"],
};

/* ── perks ──────────────────────────────────────────────────────
   Four per skill at 20 / 45 / 70 / 100. The level-100 perk is the
   capstone the whole long tail is selling. */
const PERK_LEVELS: readonly number[] = [20, 45, 70, 100];

const PERKS: Record<SkillId, readonly (readonly [string, string])[]> = {
  fishing: [
    ["Patient Cast", "Spots take 8% longer to deplete."],
    ["Chum Line", "5% chance to land a second fish."],
    ["Tidereader", "+25% rare catch weight at high tide."],
    ["Master Angler", "Tidewyrm spots never deplete."],
  ],
  woodcutting: [
    ["Clean Swing", "8% chance to keep the tree standing."],
    ["Splitter", "Logs sometimes yield a second bundle."],
    ["Grovewarden", "Mistvale and beyond regrow 30% faster."],
    ["Master Feller", "Moonwood drops a Heartwood core."],
  ],
  mining: [
    ["Ore Sense", "Veins glow through fog at any range."],
    ["Deep Seam", "10% chance of a doubled ore strike."],
    ["Stonebreaker", "Ignore the hardness gate on one tier up."],
    ["Master Prospector", "Abyssite veins are inexhaustible."],
  ],
  foraging: [
    ["Green Thumb", "Patches regrow while you are away."],
    ["Second Harvest", "10% chance to pick twice."],
    ["Moonbloom Sense", "Night patches show on the map."],
    ["Master Forager", "Tidelotus never wilts on the vine."],
  ],
  smithing: [
    ["Even Heat", "Bars never fail on the anvil."],
    ["Ingot Saver", "12% chance to refund one ore."],
    ["Tempered Hand", "Bars carry a quality stamp (+20% value)."],
    ["Master Smith", "Abyssite bars can be double-forged."],
  ],
  cooking: [
    ["Steady Flame", "Burn chance halved."],
    ["Never Burn", "Nothing you cook can burn."],
    ["Feast Portions", "Meals heal 25% more."],
    ["Master Cook", "Tidewyrm Feast buffs the whole island."],
  ],
  crafting: [
    ["Tight Weave", "Crafted gear gains +1 durability tier."],
    ["Material Sense", "12% chance to refund one log."],
    ["Artisan's Eye", "Crafted goods roll a bonus affix."],
    ["Master Crafter", "Moonwood Crowns can be re-enchanted."],
  ],
  alchemy: [
    ["Clean Distillate", "Potions never spoil in storage."],
    ["Twin Vials", "10% chance to brew a second flask."],
    ["Catalyst Bloom", "Potion durations +30%."],
    ["Master Alchemist", "Tidelotus Ambrosia stacks with itself."],
  ],
  combat: [
    ["Footwork", "+8% dodge against melee."],
    ["Riposte", "Counter-attack after a perfect block."],
    ["Tidal Fury", "Kill streaks build a damage surge."],
    ["Master at Arms", "Abyssal Heralds drop Herald sigils."],
  ],
  slayer: [
    ["Tracker's Mark", "Tasks show the nearest spawn."],
    ["Task Streak", "Every 5th task pays double."],
    ["Bane Lore", "+20% damage to your current task."],
    ["Master Slayer", "Choose your own task target."],
  ],
  construction: [
    ["Salvage", "Demolition refunds 50% of materials."],
    ["Prefab Frames", "Projects start 20% complete."],
    ["Master Plan", "Two projects can run at once."],
    ["Master Builder", "Unlocks the Tidefall Sanctum spire."],
  ],
  trading: [
    ["Haggler", "+6% sale price island-wide."],
    ["Bulk Terms", "Stack sizes on contracts doubled."],
    ["Insider Routes", "See tomorrow's price swings."],
    ["Master Merchant", "Abyssal Charter never expires."],
  ],
};

function buildLadder(id: SkillId): readonly UnlockEntry[] {
  const out: UnlockEntry[] = [];

  const tools = TOOL_NAMES[id];
  TOOL_STEPS.forEach((step, i) => {
    out.push({
      level: step.level,
      kind: "tool",
      id: `${id}.tool.${i + 1}`,
      name: tools[i],
      note: `×${step.speed.toFixed(2)} action speed`,
    });
  });

  const stations = STATION_NAMES[id];
  STATION_STEPS.forEach((level, i) => {
    out.push({
      level,
      kind: "station",
      id: `${id}.station.${i + 1}`,
      name: stations[i],
      note: "Workstation upgrade — yield and value",
    });
  });

  PERKS[id].forEach((perk, i) => {
    out.push({
      level: PERK_LEVELS[i],
      kind: "perk",
      id: `${id}.perk.${i + 1}`,
      name: perk[0],
      note: perk[1],
    });
  });

  return out.sort((a, b) => a.level - b.level || a.kind.localeCompare(b.kind));
}

interface SkillSeed {
  readonly name: string;
  readonly category: SkillCategory;
  readonly flavour: string;
  readonly feeder?: SkillId;
}

const SEEDS: Record<SkillId, SkillSeed> = {
  fishing:      { name: "Fishing",      category: "gathering",  flavour: "Read the tide, know the fish. The sea pays the patient." },
  woodcutting:  { name: "Woodcutting",  category: "gathering",  flavour: "Every hull, hut and hearth on Tidefall started as a tree." },
  mining:       { name: "Mining",       category: "gathering",  flavour: "The island keeps its best colours underground." },
  foraging:     { name: "Foraging",     category: "gathering",  flavour: "Salt, dew and moonlight — the island grows its own medicine." },
  smithing:     { name: "Smithing",     category: "production", flavour: "Ore is a rumour until it has been through the fire.", feeder: "mining" },
  cooking:      { name: "Cooking",      category: "production", flavour: "A warm meal is the cheapest armour on the island.",   feeder: "fishing" },
  crafting:     { name: "Crafting",     category: "production", flavour: "Rope, bows, charms — the quiet trade that holds it together.", feeder: "woodcutting" },
  alchemy:      { name: "Alchemy",      category: "production", flavour: "Distil the tide down far enough and it starts to glow.", feeder: "foraging" },
  combat:       { name: "Combat",       category: "combat",     flavour: "Not everything washed ashore wants to be neighbours." },
  slayer:       { name: "Slayer",       category: "combat",     flavour: "Contracts from the Tidewatch. Some things need ending." },
  construction: { name: "Construction", category: "support",    flavour: "Turn a castaway camp into a harbour town, plank by plank." },
  trading:      { name: "Trading",      category: "support",    flavour: "The tide brings ships. Ships bring coin. Coin brings choices." },
};

export const SKILL_IDS: readonly SkillId[] = [
  "fishing", "woodcutting", "mining", "foraging",
  "smithing", "cooking", "crafting", "alchemy",
  "combat", "slayer",
  "construction", "trading",
];

function makeSkills(): Record<SkillId, SkillDef> {
  const out = {} as Record<SkillId, SkillDef>;
  for (const id of SKILL_IDS) {
    const seed = SEEDS[id];
    out[id] = {
      id,
      name: seed.name,
      category: seed.category,
      flavour: seed.flavour,
      ...(seed.feeder ? { feeder: seed.feeder } : {}),
      ladder: buildLadder(id),
    };
  }
  return out;
}

export const SKILLS: Record<SkillId, SkillDef> = makeSkills();

export const SKILLS_BY_CATEGORY: Record<SkillCategory, readonly SkillId[]> = {
  gathering:  SKILL_IDS.filter((id) => SKILLS[id].category === "gathering"),
  production: SKILL_IDS.filter((id) => SKILLS[id].category === "production"),
  combat:     SKILL_IDS.filter((id) => SKILLS[id].category === "combat"),
  support:    SKILL_IDS.filter((id) => SKILLS[id].category === "support"),
};

export function isSkillId(v: string): v is SkillId {
  return Object.prototype.hasOwnProperty.call(SEEDS, v);
}

/** Best tool step owned at `level` — the speed multiplier the
    rate model (and sim.ts) applies to every action. */
export function toolSpeedAt(level: number): number {
  let speed = TOOL_STEPS[0].speed;
  for (const step of TOOL_STEPS) {
    if (level >= step.level) speed = step.speed;
    else break;
  }
  return speed;
}
