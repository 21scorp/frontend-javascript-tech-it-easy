/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/placeholder.ts
   Convincing fake data for every panel.

   WHY it is a real module and not inline junk: the shells have to be
   reviewable and screenshot-able before the systems that feed them
   exist, and "Lorem ipsum 1 / Lorem ipsum 2" hides layout problems
   that real strings expose (long skill names, five-digit stacks,
   two-line unlock hints). It also doubles as the reference shape of
   each panel's props for the agents wiring the real data in.

   Nothing here is imported by the UI at runtime unless the caller
   asks for it (UISystem `demo: true`), so it tree-shakes away.
   ═══════════════════════════════════════════════════════════════ */

import type { SkillsProps, SkillCard } from "./panels/skills";
import type { BagProps, BagItem } from "./panels/bag";
import type { BaseProps } from "./panels/base";
import type { ShopProps } from "./panels/shop";
import type { CharacterProps } from "./panels/character";
import type { HudActivity } from "./hud";

/** Assets live in /public, so respect Vite's base at runtime. */
const A = (p: string) => `${import.meta.env.BASE_URL}${p}`;

/* ── skills ─────────────────────────────────────────────────── */

const SKILLS: SkillCard[] = [
  { id: "fishing",     name: "Fishing",     icon: "fish",      level: 42, xpInLevel: 3120, xpForLevel: 5400, unlockHint: "Tuna at 45",         active: true,  tint: "#4aa8ff" },
  { id: "woodcutting", name: "Woodcutting", icon: "axe",       level: 38, xpInLevel: 1980, xpForLevel: 4200, unlockHint: "Maple logs at 40",                  tint: "#8bd46a" },
  { id: "mining",      name: "Mining",      icon: "pickaxe",   level: 31, xpInLevel: 2440, xpForLevel: 3100, unlockHint: "Coal seams at 33",                  tint: "#c2b09a" },
  { id: "combat",      name: "Combat",      icon: "sword",     level: 27, xpInLevel: 640,  xpForLevel: 2600, unlockHint: "Tide Wraiths at 30",                tint: "#ff8b7f" },
  { id: "cooking",     name: "Cooking",     icon: "flame",     level: 24, xpInLevel: 1810, xpForLevel: 2200, unlockHint: "Salmon steaks at 25",               tint: "#ffb454" },
  { id: "smithing",    name: "Smithing",    icon: "anvil",     level: 19, xpInLevel: 420,  xpForLevel: 1700, unlockHint: "Iron gear at 20",                   tint: "#9fb3c8" },
  { id: "farming",     name: "Farming",     icon: "sprout",    level: 16, xpInLevel: 900,  xpForLevel: 1400, unlockHint: "Herb patch at 18",                  tint: "#59d38a" },
  { id: "foraging",    name: "Foraging",    icon: "mushroom",  level: 14, xpInLevel: 240,  xpForLevel: 1200, unlockHint: "Glowcaps at 15",                    tint: "#b878ff" },
  { id: "hunting",     name: "Hunting",     icon: "bow",       level: 11, xpInLevel: 760,  xpForLevel: 980,  unlockHint: "Snare traps at 12",                 tint: "#e0a86a" },
  { id: "crafting",    name: "Crafting",    icon: "gear",      level: 9,  xpInLevel: 120,  xpForLevel: 820,  unlockHint: "Rope & sails at 10",                tint: "#7cf0e2" },
  { id: "sailing",     name: "Sailing",     icon: "anchor",    level: 0,  xpInLevel: 0,    xpForLevel: 600,  unlockHint: "Needs a dock",  locked: true },
  { id: "alchemy",     name: "Alchemy",     icon: "flask",     level: 0,  xpInLevel: 0,    xpForLevel: 600,  unlockHint: "Foraging 20 required", locked: true },
];

export const demoSkills: SkillsProps = {
  skills: SKILLS,
  totalLevel: SKILLS.reduce((a, s) => a + s.level, 0),
  totalXp: 1_284_400,
  bestSkill: "Fishing",
};

/* ── bag ────────────────────────────────────────────────────── */

const ITEMS: BagItem[] = [
  { id: "sword",   name: "Tidewrought Blade", rarity: "legend", qty: 1,    art: A("assets/items/item_sword.png"),   equipped: true,
    subtitle: "A cutlass forged in the drowned smithy. Hums near salt water.",
    stats: [{ label: "Attack", value: "+42" }, { label: "Speed", value: "1.4/s" }, { label: "Value", value: "18,400g" }],
    actions: [{ id: "unequip", label: "Unequip", variant: "ghost" }, { id: "inspect", label: "Inspect", variant: "gold" }] },
  { id: "koi",     name: "Moonlit Koi",   rarity: "mythic", qty: 2,    art: A("assets/items/item_koi.png"),     isNew: true,
    subtitle: "Only rises on the third night of a spring tide.",
    stats: [{ label: "Cooking XP", value: "820" }, { label: "Value", value: "6,200g" }] },
  { id: "tuna",    name: "Bluefin Tuna",  rarity: "epic",   qty: 14,   art: A("assets/items/item_tuna.png"),
    stats: [{ label: "Cooking XP", value: "210" }, { label: "Value", value: "940g" }] },
  { id: "salmon",  name: "Salmon",        rarity: "rare",   qty: 63,   art: A("assets/items/item_salmon.png"),
    stats: [{ label: "Cooking XP", value: "90" }, { label: "Value", value: "180g" }] },
  { id: "trout",   name: "Trout",         rarity: "fine",   qty: 128,  art: A("assets/items/item_trout.png") },
  { id: "herring", name: "Herring",       rarity: "common", qty: 341,  art: A("assets/items/item_herring.png") },
  { id: "sardine", name: "Sardine",       rarity: "common", qty: 1204, art: A("assets/items/item_sardine.png") },
  { id: "elder",   name: "Elder Logs",    rarity: "legend", qty: 6,    art: A("assets/items/item_elder.png"),
    subtitle: "Cut from a tree that was old when the tide first fell.",
    stats: [{ label: "Woodcutting XP", value: "600" }, { label: "Value", value: "2,800g" }] },
  { id: "yew",     name: "Yew Logs",      rarity: "epic",   qty: 22,   art: A("assets/items/item_yew.png") },
  { id: "maple",   name: "Maple Logs",    rarity: "rare",   qty: 74,   art: A("assets/items/item_maple.png") },
  { id: "birch",   name: "Birch Logs",    rarity: "fine",   qty: 189,  art: A("assets/items/item_birch.png") },
  { id: "oak",     name: "Oak Logs",      rarity: "common", qty: 502,  art: A("assets/items/item_oak.png") },
];

export const demoBag: BagProps = {
  items: ITEMS,
  slotsUsed: ITEMS.length,
  slotsTotal: 40,
  activeFilter: "all",
  filters: [
    { id: "all",   label: "All" },
    { id: "gear",  label: "Gear",      icon: "sword" },
    { id: "fish",  label: "Fish",      icon: "fish" },
    { id: "logs",  label: "Logs",      icon: "axe" },
    { id: "ore",   label: "Ore",       icon: "pickaxe" },
    { id: "misc",  label: "Materials", icon: "gear" },
  ],
};

/* ── base ───────────────────────────────────────────────────── */

export const demoBase: BaseProps = {
  baseName: "Cormorant Point",
  baseLevel: 7,
  heroArt: A("assets/world/bg_island.png"),
  storageUsed: 8420,
  storageTotal: 12000,
  incomePerHour: 4260,
  plots: [
    { id: "dock",   state: "built", name: "Fishing Dock", icon: "fish",   level: 4, yield: "180 fish / hr", progress: 0.72, ready: true,  tint: "#4aa8ff" },
    { id: "lodge",  state: "built", name: "Timber Lodge", icon: "axe",    level: 3, yield: "120 logs / hr", progress: 0.41,               tint: "#8bd46a" },
    { id: "forge",  state: "building", name: "Forge",     icon: "anvil",  level: 1, progress: 0.63,                                       tint: "#ffb454" },
    { id: "kitchen",state: "built", name: "Smokehouse",   icon: "flame",  level: 2, yield: "60 meals / hr", progress: 0.18,               tint: "#ff8b7f" },
    { id: "p5",     state: "empty" },
    { id: "p6",     state: "locked", requirement: "Base level 9" },
  ],
};

/* ── shop ───────────────────────────────────────────────────── */

export const demoShop: ShopProps = {
  activeTab: "boosts",
  refreshIn: "3h 12m",
  tabs: [
    { id: "cosmetics", label: "Cosmetics", icon: "shirt" },
    { id: "boosts",    label: "Boosts",    icon: "bolt" },
    { id: "gems",      label: "Gems",      icon: "gem" },
  ],
  feature: {
    offerId: "founders",
    name: "Founder's Cache",
    sub: "1,200 gems, the Tidewrought cloak, and 7 days of double XP.",
    icon: "sparkle",
    ribbon: "Best value",
    currency: "real",
    price: "$9.99",
  },
  offers: [
    { id: "xp2",    name: "Double XP",     sub: "24 hours",     icon: "bolt",   currency: "gem",  price: 120, tint: "#7cf0e2", flag: "Popular" },
    { id: "luck",   name: "Tide's Favour", sub: "+25% rare drops · 8h", icon: "sparkle", currency: "gem", price: 90, tint: "#b878ff" },
    { id: "haul",   name: "Bigger Bag",    sub: "+10 slots",    icon: "bag",    currency: "coin", price: 48000, wasPrice: 60000, tint: "#f6cd63" },
    { id: "speed",  name: "Swift Hands",   sub: "+15% speed · 4h", icon: "clock", currency: "coin", price: 12500, tint: "#4aa8ff" },
    { id: "refill", name: "Full Larder",   sub: "Restock the smokehouse", icon: "flame", currency: "coin", price: 8200, tint: "#ffb454" },
    { id: "cloak",  name: "Storm Cloak",   sub: "Cosmetic",     icon: "shirt",  currency: "gem",  price: 340, owned: true },
  ],
};

/* ── character ──────────────────────────────────────────────── */

export const demoCharacter: CharacterProps = {
  name: "Wren",
  activeCategory: "body",
  categories: [
    { id: "body",   label: "Body",  icon: "person" },
    { id: "hair",   label: "Hair",  icon: "sparkle" },
    { id: "face",   label: "Face",  icon: "star" },
    { id: "outfit", label: "Fit",   icon: "shirt" },
    { id: "gear",   label: "Gear",  icon: "sword" },
  ],
  selectedOption: "b2",
  options: [
    { id: "b1", label: "Slight", icon: "person" },
    { id: "b2", label: "Lean",   icon: "person" },
    { id: "b3", label: "Broad",  icon: "person" },
    { id: "b4", label: "Stout",  icon: "person" },
    { id: "b5", label: "Tall",   icon: "person" },
    { id: "b6", label: "Wiry",   icon: "person" },
    { id: "b7", label: "Rugged", icon: "person", locked: true, requirement: "Level 20" },
    { id: "b8", label: "Ancient", icon: "person", locked: true, requirement: "Story chapter 3" },
  ],
  selectedSwatch: "s3",
  swatches: [
    { id: "s1", color: "linear-gradient(160deg,#f7d9be,#dcae8a)", label: "Fair" },
    { id: "s2", color: "linear-gradient(160deg,#e8bd97,#c48a60)", label: "Warm" },
    { id: "s3", color: "linear-gradient(160deg,#c98d63,#96603c)", label: "Tan" },
    { id: "s4", color: "linear-gradient(160deg,#9a6540,#6b3f26)", label: "Deep" },
    { id: "s5", color: "linear-gradient(160deg,#6d452c,#402515)", label: "Rich" },
    { id: "s6", color: "linear-gradient(160deg,#4a2c1c,#28150c)", label: "Dark" },
  ],
};

/* ── hud ────────────────────────────────────────────────────── */

export const demoActivity: HudActivity = {
  skillId: "fishing",
  name: "Fishing",
  icon: "fish",
  level: 42,
  xpInLevel: 3120,
  xpForLevel: 5400,
  ratePerHour: 12400,
  active: true,
};

export const demoCoins = 184_920;
export const demoGems = 1_284;
