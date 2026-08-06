/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/character.ts
   THE CHARACTER MODEL. A CharacterAppearance is plain JSON: ids
   only, never colours or textures, so a save file written today
   still loads once real paperdoll art lands.

   Everything a creator UI needs to draw its option rows lives in
   the catalogues below (id + display name + swatch colours). The
   UI never has to know how a piece is rendered.
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────── ids ─────────────── */

export type BodyTypeId = "slim" | "athletic" | "sturdy" | "willowy";

/** Paperdoll equipment slots, in no particular order (z-order lives
    in paperdoll.ts — a slot is *what* you wear, not *when* it draws). */
export type EquipSlot =
  | "head" | "chest" | "legs" | "feet" | "mainHand" | "offHand" | "back";

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  "back", "legs", "feet", "chest", "head", "mainHand", "offHand",
];

/** slot → item id (null = nothing worn). JSON-safe. */
export type EquipmentSet = Record<EquipSlot, string | null>;

/* ─────────────── option shapes ─────────────── */

/** Everything a UI row needs: a stable id, a label, chips to paint. */
export interface AppearanceOption {
  readonly id: string;
  readonly name: string;
  /** 1–3 colours the UI can paint as a swatch chip. */
  readonly swatch: readonly number[];
}

export interface ColorOption extends AppearanceOption {
  readonly color: number;
}

export interface BodyTypeOption extends AppearanceOption {
  /** Multipliers applied to the paperdoll silhouette. */
  readonly widthScale: number;
  readonly heightScale: number;
  /** 0..1 — how square the shoulders read. */
  readonly shoulder: number;
}

export type HairShape =
  | "shaved" | "crop" | "wave" | "curls" | "ponytail" | "braids" | "long" | "topknot";

export interface HairStyleOption extends AppearanceOption {
  readonly shape: HairShape;
  /** 0..1 — how far the silhouette puffs past the skull. */
  readonly volume: number;
}

export type FaceShape = "oval" | "round" | "square" | "heart" | "long";

export interface FaceShapeOption extends AppearanceOption {
  readonly shape: FaceShape;
  /** 0.85..1.15 — width of the jaw relative to the skull. */
  readonly jaw: number;
  /** 0.85..1.15 — height of the face oval. */
  readonly length: number;
}

export type EquipShape =
  // head
  | "cap" | "straw" | "hood" | "helm" | "circlet"
  // chest
  | "tunic" | "vest" | "robe" | "mail" | "plate"
  // legs
  | "trousers" | "greaves" | "skirt" | "platelegs"
  // feet
  | "boots" | "sandals" | "sabatons"
  // hands
  | "axe" | "pick" | "rod" | "sword" | "hammer"
  | "shield" | "buckler" | "lantern" | "torch"
  // back
  | "cloak" | "cape" | "pack" | "quiver";

export interface EquipItem extends AppearanceOption {
  readonly slot: EquipSlot;
  readonly shape: EquipShape;
  /** Main cloth/metal colour. */
  readonly primary: number;
  /** Trim, straps, lining. */
  readonly secondary: number;
  /** Buckles, gems, blade. */
  readonly accent: number;
  /** 0 = starter rags, 4 = late game. Purely for UI sorting. */
  readonly tier: number;
}

/* ─────────────── catalogues ───────────────
   NOTE ON SKIN: the placeholder art is painted with a light skin
   (~#F6D8B4). The renderer reaches other tones by MULTIPLYING, so
   the lightest entry here must stay at/above the art's own tone —
   multiply can darken, never lighten. Real per-layer art removes
   this constraint (see paperdoll.ts art manifest).                */

/** The tone the placeholder sheets are painted with. */
export const ART_BASE_SKIN = 0xf6d8b4;

export const SKIN_TONES: readonly ColorOption[] = [
  { id: "porcelain", name: "Porcelain", color: 0xf6d8b4, swatch: [0xf6d8b4] },
  { id: "fair",      name: "Fair",      color: 0xefc79b, swatch: [0xefc79b] },
  { id: "sand",      name: "Sand",      color: 0xe0ae7e, swatch: [0xe0ae7e] },
  { id: "olive",     name: "Olive",     color: 0xc68a5c, swatch: [0xc68a5c] },
  { id: "tan",       name: "Tan",       color: 0xb4784e, swatch: [0xb4784e] },
  { id: "bronze",    name: "Bronze",    color: 0x96603c, swatch: [0x96603c] },
  { id: "umber",     name: "Umber",     color: 0x74472c, swatch: [0x74472c] },
  { id: "ebony",     name: "Ebony",     color: 0x52301e, swatch: [0x52301e] },
];

export const HAIR_COLORS: readonly ColorOption[] = [
  { id: "flax",     name: "Flax",     color: 0xe8ce96, swatch: [0xe8ce96] },
  { id: "honey",    name: "Honey",    color: 0xc99a50, swatch: [0xc99a50] },
  { id: "auburn",   name: "Auburn",   color: 0xa9542c, swatch: [0xa9542c] },
  { id: "chestnut", name: "Chestnut", color: 0x6e4527, swatch: [0x6e4527] },
  { id: "jet",      name: "Jet",      color: 0x2e2622, swatch: [0x2e2622] },
  { id: "ash",      name: "Ash",      color: 0x9aa4ad, swatch: [0x9aa4ad] },
  { id: "tide",     name: "Tide",     color: 0x3f8c8a, swatch: [0x3f8c8a] },
  { id: "plum",     name: "Plum",     color: 0x7a4a73, swatch: [0x7a4a73] },
];

export const EYE_COLORS: readonly ColorOption[] = [
  { id: "amber",   name: "Amber",   color: 0xc88a2e, swatch: [0xc88a2e] },
  { id: "hazel",   name: "Hazel",   color: 0x8a6234, swatch: [0x8a6234] },
  { id: "emerald", name: "Emerald", color: 0x3e8c5a, swatch: [0x3e8c5a] },
  { id: "sky",     name: "Sky",     color: 0x4e86c0, swatch: [0x4e86c0] },
  { id: "storm",   name: "Storm",   color: 0x6f7c86, swatch: [0x6f7c86] },
  { id: "violet",  name: "Violet",  color: 0x7a5aa8, swatch: [0x7a5aa8] },
];

export const BODY_TYPES: readonly BodyTypeOption[] = [
  { id: "slim",     name: "Slim",     widthScale: 0.92, heightScale: 1.00, shoulder: 0.35, swatch: [0xd9c3a0] },
  { id: "athletic", name: "Athletic", widthScale: 1.00, heightScale: 1.02, shoulder: 0.60, swatch: [0xd9c3a0] },
  { id: "sturdy",   name: "Sturdy",   widthScale: 1.12, heightScale: 0.98, shoulder: 0.80, swatch: [0xd9c3a0] },
  { id: "willowy",  name: "Willowy",  widthScale: 0.88, heightScale: 1.05, shoulder: 0.28, swatch: [0xd9c3a0] },
];

export const HAIR_STYLES: readonly HairStyleOption[] = [
  { id: "shaved",   name: "Shaved",    shape: "shaved",   volume: 0.02, swatch: [0x6e4527] },
  { id: "crop",     name: "Crop",      shape: "crop",     volume: 0.16, swatch: [0x6e4527] },
  { id: "wave",     name: "Wave",      shape: "wave",     volume: 0.28, swatch: [0x6e4527] },
  { id: "curls",    name: "Curls",     shape: "curls",    volume: 0.38, swatch: [0x6e4527] },
  { id: "ponytail", name: "Ponytail",  shape: "ponytail", volume: 0.24, swatch: [0x6e4527] },
  { id: "braids",   name: "Braids",    shape: "braids",   volume: 0.26, swatch: [0x6e4527] },
  { id: "long",     name: "Long",      shape: "long",     volume: 0.34, swatch: [0x6e4527] },
  { id: "topknot",  name: "Topknot",   shape: "topknot",  volume: 0.20, swatch: [0x6e4527] },
];

export const FACE_SHAPES: readonly FaceShapeOption[] = [
  { id: "oval",   name: "Oval",   shape: "oval",   jaw: 1.00, length: 1.00, swatch: [0xefc79b] },
  { id: "round",  name: "Round",  shape: "round",  jaw: 1.10, length: 0.92, swatch: [0xefc79b] },
  { id: "square", name: "Square", shape: "square", jaw: 1.14, length: 0.98, swatch: [0xefc79b] },
  { id: "heart",  name: "Heart",  shape: "heart",  jaw: 0.86, length: 1.00, swatch: [0xefc79b] },
  { id: "long",   name: "Long",   shape: "long",   jaw: 0.92, length: 1.12, swatch: [0xefc79b] },
];

/** Every wearable in the game, flat. Filter by slot for a UI row. */
export const EQUIPMENT: readonly EquipItem[] = [
  /* ── head ── */
  { id: "head_none",     name: "Bare",          slot: "head",  shape: "cap",      primary: 0x000000, secondary: 0x000000, accent: 0x000000, tier: 0, swatch: [0x2b3a46] },
  { id: "head_kerchief", name: "Kerchief",      slot: "head",  shape: "cap",      primary: 0xd2604a, secondary: 0xf0d8b0, accent: 0xf0d8b0, tier: 0, swatch: [0xd2604a, 0xf0d8b0] },
  { id: "head_straw",    name: "Straw Hat",     slot: "head",  shape: "straw",    primary: 0xe6c079, secondary: 0xb88a44, accent: 0x8a6a3a, tier: 1, swatch: [0xe6c079, 0xb88a44] },
  { id: "head_hood",     name: "Traveller Hood",slot: "head",  shape: "hood",     primary: 0x4a6552, secondary: 0x2f4438, accent: 0xc9b48a, tier: 1, swatch: [0x4a6552, 0x2f4438] },
  { id: "head_cap",      name: "Leather Cap",   slot: "head",  shape: "cap",      primary: 0x8a5a34, secondary: 0x5f3c22, accent: 0xd8b06a, tier: 2, swatch: [0x8a5a34, 0xd8b06a] },
  { id: "head_helm",     name: "Iron Helm",     slot: "head",  shape: "helm",     primary: 0x9aa6b0, secondary: 0x646f79, accent: 0xd8dee4, tier: 3, swatch: [0x9aa6b0, 0x646f79] },
  { id: "head_circlet",  name: "Tide Circlet",  slot: "head",  shape: "circlet",  primary: 0xd9c069, secondary: 0xa88f38, accent: 0x63d2d8, tier: 4, swatch: [0xd9c069, 0x63d2d8] },

  /* ── chest ── */
  { id: "chest_none",    name: "Bare",          slot: "chest", shape: "tunic",    primary: 0x000000, secondary: 0x000000, accent: 0x000000, tier: 0, swatch: [0x2b3a46] },
  { id: "chest_linen",   name: "Linen Shirt",   slot: "chest", shape: "tunic",    primary: 0xf0e2c4, secondary: 0xd6c39c, accent: 0xb9a276, tier: 0, swatch: [0xf0e2c4, 0xd6c39c] },
  { id: "chest_apron",   name: "Work Apron",    slot: "chest", shape: "tunic",    primary: 0x9a5f33, secondary: 0x6f4021, accent: 0xd8b06a, tier: 0, swatch: [0x9a5f33, 0xd8b06a] },
  { id: "chest_vest",    name: "Leather Vest",  slot: "chest", shape: "vest",     primary: 0x8a5a34, secondary: 0x5f3c22, accent: 0xd8b06a, tier: 1, swatch: [0x8a5a34, 0x5f3c22] },
  { id: "chest_robe",    name: "Tidecaller Robe",slot:"chest", shape: "robe",     primary: 0x3d6f8e, secondary: 0x27506b, accent: 0x8fd6e0, tier: 2, swatch: [0x3d6f8e, 0x8fd6e0] },
  { id: "chest_mail",    name: "Chain Mail",    slot: "chest", shape: "mail",     primary: 0x98a4ae, secondary: 0x66717b, accent: 0xd8dee4, tier: 3, swatch: [0x98a4ae, 0x66717b] },
  { id: "chest_plate",   name: "Deepsteel Plate",slot:"chest", shape: "plate",    primary: 0x6f8ea0, secondary: 0x3f5b6b, accent: 0xe4d283, tier: 4, swatch: [0x6f8ea0, 0xe4d283] },

  /* ── legs ── */
  { id: "legs_none",     name: "Bare",          slot: "legs",  shape: "trousers", primary: 0x000000, secondary: 0x000000, accent: 0x000000, tier: 0, swatch: [0x2b3a46] },
  { id: "legs_canvas",   name: "Canvas Trousers",slot:"legs",  shape: "trousers", primary: 0x6d7245, secondary: 0x4e5231, accent: 0xa9ac7e, tier: 0, swatch: [0x6d7245, 0x4e5231] },
  { id: "legs_skirt",    name: "Sailcloth Skirt",slot:"legs",  shape: "skirt",    primary: 0xd8cbae, secondary: 0xab9c7c, accent: 0x8a7a58, tier: 1, swatch: [0xd8cbae, 0xab9c7c] },
  { id: "legs_greaves",  name: "Leather Greaves",slot:"legs",  shape: "greaves",  primary: 0x7a4e2e, secondary: 0x543320, accent: 0xd8b06a, tier: 2, swatch: [0x7a4e2e, 0xd8b06a] },
  { id: "legs_plate",    name: "Deepsteel Legs",slot: "legs",  shape: "platelegs",primary: 0x6f8ea0, secondary: 0x3f5b6b, accent: 0xe4d283, tier: 4, swatch: [0x6f8ea0, 0xe4d283] },

  /* ── feet ── */
  { id: "feet_none",     name: "Barefoot",      slot: "feet",  shape: "sandals",  primary: 0x000000, secondary: 0x000000, accent: 0x000000, tier: 0, swatch: [0x2b3a46] },
  { id: "feet_sandals",  name: "Rope Sandals",  slot: "feet",  shape: "sandals",  primary: 0xc9ab77, secondary: 0x9a8253, accent: 0x6f5c39, tier: 0, swatch: [0xc9ab77] },
  { id: "feet_boots",    name: "Field Boots",   slot: "feet",  shape: "boots",    primary: 0x7d4f2c, secondary: 0x54341c, accent: 0xd8b06a, tier: 1, swatch: [0x7d4f2c, 0xd8b06a] },
  { id: "feet_sabatons", name: "Iron Sabatons", slot: "feet",  shape: "sabatons", primary: 0x8f9aa4, secondary: 0x5c666f, accent: 0xd8dee4, tier: 3, swatch: [0x8f9aa4] },

  /* ── main hand ── */
  { id: "main_none",     name: "Empty",         slot: "mainHand", shape: "axe",   primary: 0x000000, secondary: 0x000000, accent: 0x000000, tier: 0, swatch: [0x2b3a46] },
  { id: "main_axe",      name: "Felling Axe",   slot: "mainHand", shape: "axe",   primary: 0x8a6a42, secondary: 0x5f4728, accent: 0xc3ccd4, tier: 1, swatch: [0x8a6a42, 0xc3ccd4] },
  { id: "main_pick",     name: "Miner's Pick",  slot: "mainHand", shape: "pick",  primary: 0x8a6a42, secondary: 0x5f4728, accent: 0xa8b3bb, tier: 1, swatch: [0x8a6a42, 0xa8b3bb] },
  { id: "main_rod",      name: "Cane Rod",      slot: "mainHand", shape: "rod",   primary: 0xb98b4e, secondary: 0x7e5c2f, accent: 0xf0e6d0, tier: 1, swatch: [0xb98b4e] },
  { id: "main_sword",    name: "Tideiron Sword",slot: "mainHand", shape: "sword", primary: 0xc3ccd4, secondary: 0x6b757e, accent: 0xd2604a, tier: 3, swatch: [0xc3ccd4, 0xd2604a] },
  { id: "main_hammer",   name: "Reef Hammer",   slot: "mainHand", shape: "hammer",primary: 0x8a6a42, secondary: 0x59616a, accent: 0x8fd6e0, tier: 4, swatch: [0x59616a, 0x8fd6e0] },

  /* ── off hand ── */
  { id: "off_none",      name: "Empty",         slot: "offHand", shape: "shield", primary: 0x000000, secondary: 0x000000, accent: 0x000000, tier: 0, swatch: [0x2b3a46] },
  { id: "off_lantern",   name: "Deck Lantern",  slot: "offHand", shape: "lantern",primary: 0x5f4728, secondary: 0xf3c54a, accent: 0xffe9a8, tier: 1, swatch: [0xf3c54a] },
  { id: "off_torch",     name: "Pitch Torch",   slot: "offHand", shape: "torch",  primary: 0x6f4a2a, secondary: 0xe8823f, accent: 0xffd88a, tier: 1, swatch: [0xe8823f] },
  { id: "off_buckler",   name: "Oak Buckler",   slot: "offHand", shape: "buckler",primary: 0x9a6a3e, secondary: 0x6a4526, accent: 0xc3ccd4, tier: 2, swatch: [0x9a6a3e] },
  { id: "off_shield",    name: "Harbour Shield",slot: "offHand", shape: "shield", primary: 0x3d6f8e, secondary: 0x27506b, accent: 0xe4d283, tier: 3, swatch: [0x3d6f8e, 0xe4d283] },

  /* ── back ── */
  { id: "back_none",     name: "Nothing",       slot: "back",  shape: "cape",     primary: 0x000000, secondary: 0x000000, accent: 0x000000, tier: 0, swatch: [0x2b3a46] },
  { id: "back_pack",     name: "Forager Pack",  slot: "back",  shape: "pack",     primary: 0x8a5a34, secondary: 0x5f3c22, accent: 0xd8b06a, tier: 0, swatch: [0x8a5a34] },
  { id: "back_quiver",   name: "Reed Quiver",   slot: "back",  shape: "quiver",   primary: 0x7a6a3a, secondary: 0x54492a, accent: 0xd8cbae, tier: 1, swatch: [0x7a6a3a] },
  { id: "back_cape",     name: "Harbour Cape",  slot: "back",  shape: "cape",     primary: 0xc2513c, secondary: 0x8d3527, accent: 0xe4d283, tier: 2, swatch: [0xc2513c] },
  { id: "back_cloak",    name: "Tidewatch Cloak",slot:"back",  shape: "cloak",    primary: 0x2f4c66, secondary: 0x1d3145, accent: 0x8fd6e0, tier: 3, swatch: [0x2f4c66, 0x8fd6e0] },
];

/** Items grouped by slot, built once. */
export const EQUIPMENT_BY_SLOT: Readonly<Record<EquipSlot, readonly EquipItem[]>> =
  (() => {
    const out = {
      head: [], chest: [], legs: [], feet: [], mainHand: [], offHand: [], back: [],
    } as Record<EquipSlot, EquipItem[]>;
    for (const item of EQUIPMENT) out[item.slot].push(item);
    return out;
  })();

const EQUIP_INDEX: ReadonlyMap<string, EquipItem> =
  new Map(EQUIPMENT.map((i) => [i.id, i]));

/* ─────────────── the serializable model ─────────────── */

export const APPEARANCE_VERSION = 1;

/** Pure data. Safe to JSON.stringify straight into a save slot. */
export interface CharacterAppearance {
  /** Schema version — bump only with a migration in normalizeAppearance. */
  v: number;
  name: string;
  bodyType: BodyTypeId;
  /** ids into SKIN_TONES / HAIR_STYLES / … */
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  eyeColor: string;
  faceShape: string;
  equipment: EquipmentSet;
}

export const DEFAULT_EQUIPMENT: Readonly<EquipmentSet> = {
  head: "head_none",
  chest: "chest_apron",
  legs: "legs_canvas",
  feet: "feet_boots",
  mainHand: "main_none",
  offHand: "off_none",
  back: "back_none",
};

export function defaultAppearance(): CharacterAppearance {
  return {
    v: APPEARANCE_VERSION,
    name: "Wren",
    bodyType: "athletic",
    skinTone: "fair",
    hairStyle: "wave",
    hairColor: "chestnut",
    eyeColor: "hazel",
    faceShape: "oval",
    equipment: { ...DEFAULT_EQUIPMENT },
  };
}

/* ─────────────── lookups (never throw, always land somewhere) ─────────────── */

function pick<T extends AppearanceOption>(list: readonly T[], id: string): T {
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return list[0];
}

export const getBodyType = (a: CharacterAppearance): BodyTypeOption => pick(BODY_TYPES, a.bodyType);
export const getSkinTone = (a: CharacterAppearance): ColorOption => pick(SKIN_TONES, a.skinTone);
export const getHairStyle = (a: CharacterAppearance): HairStyleOption => pick(HAIR_STYLES, a.hairStyle);
export const getHairColor = (a: CharacterAppearance): ColorOption => pick(HAIR_COLORS, a.hairColor);
export const getEyeColor = (a: CharacterAppearance): ColorOption => pick(EYE_COLORS, a.eyeColor);
export const getFaceShape = (a: CharacterAppearance): FaceShapeOption => pick(FACE_SHAPES, a.faceShape);

/** Ids ending in `_none` are the catalogue's "wear nothing" entries:
    real options for a UI row, but nothing for the renderer to draw. */
export const isEmptyItem = (id: string | null | undefined): boolean =>
  !id || id.endsWith("_none");

/** The item worn in a slot, or null when the slot is empty. */
export function getEquipped(a: CharacterAppearance, slot: EquipSlot): EquipItem | null {
  const id = a.equipment[slot];
  if (isEmptyItem(id)) return null;
  const item = EQUIP_INDEX.get(id as string);
  return item && item.slot === slot ? item : null;
}

export function getItem(id: string | null | undefined): EquipItem | null {
  return id ? EQUIP_INDEX.get(id) ?? null : null;
}

/* ─────────────── (de)serialisation ─────────────── */

/** Repairs anything a save file throws at us: unknown ids fall back
    to the first catalogue entry, missing slots to the defaults. */
export function normalizeAppearance(raw: unknown): CharacterAppearance {
  const base = defaultAppearance();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<CharacterAppearance> & { equipment?: Partial<EquipmentSet> };

  const has = <T extends AppearanceOption>(list: readonly T[], id: unknown, fb: string) =>
    typeof id === "string" && list.some((o) => o.id === id) ? id : fb;

  const equipment = { ...DEFAULT_EQUIPMENT } as EquipmentSet;
  if (r.equipment && typeof r.equipment === "object") {
    for (const slot of EQUIP_SLOTS) {
      const id = r.equipment[slot];
      if (id === null) { equipment[slot] = null; continue; }
      const item = typeof id === "string" ? EQUIP_INDEX.get(id) : undefined;
      if (item && item.slot === slot) equipment[slot] = item.id;
    }
  }

  return {
    v: APPEARANCE_VERSION,
    name: typeof r.name === "string" && r.name.trim() ? r.name.slice(0, 24) : base.name,
    bodyType: has(BODY_TYPES, r.bodyType, base.bodyType) as BodyTypeId,
    skinTone: has(SKIN_TONES, r.skinTone, base.skinTone),
    hairStyle: has(HAIR_STYLES, r.hairStyle, base.hairStyle),
    hairColor: has(HAIR_COLORS, r.hairColor, base.hairColor),
    eyeColor: has(EYE_COLORS, r.eyeColor, base.eyeColor),
    faceShape: has(FACE_SHAPES, r.faceShape, base.faceShape),
    equipment,
  };
}

export function cloneAppearance(a: CharacterAppearance): CharacterAppearance {
  return { ...a, equipment: { ...a.equipment } };
}

export function serializeAppearance(a: CharacterAppearance): string {
  return JSON.stringify(a);
}

export function deserializeAppearance(json: string): CharacterAppearance {
  try { return normalizeAppearance(JSON.parse(json)); }
  catch { return defaultAppearance(); }
}

/** Cheap value equality — used to skip paperdoll rebuilds. */
export function appearanceEquals(a: CharacterAppearance, b: CharacterAppearance): boolean {
  if (a === b) return true;
  if (a.bodyType !== b.bodyType || a.skinTone !== b.skinTone || a.hairStyle !== b.hairStyle
    || a.hairColor !== b.hairColor || a.eyeColor !== b.eyeColor || a.faceShape !== b.faceShape) return false;
  for (const slot of EQUIP_SLOTS) if (a.equipment[slot] !== b.equipment[slot]) return false;
  return true;
}

/* ─────────────── randomiser ─────────────── */

export type Rng = () => number;

const NAMES = [
  "Wren", "Halden", "Mira", "Bramble", "Coen", "Isla", "Tobin", "Saffi",
  "Rook", "Nerie", "Ollan", "Vesk", "Pell", "Marrow", "Sylla", "Dunn",
];

function one<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** A complete, valid, wearable character. Gear stays plausible: no
    plate armour on a starter, and never two empty hands. */
export function randomAppearance(rng: Rng = Math.random, keepName?: string): CharacterAppearance {
  const startersOnly = (list: readonly EquipItem[]) => list.filter((i) => i.tier <= 2);
  const equipment: EquipmentSet = {
    head: one(startersOnly(EQUIPMENT_BY_SLOT.head), rng).id,
    chest: one(startersOnly(EQUIPMENT_BY_SLOT.chest).filter((i) => !isEmptyItem(i.id)), rng).id,
    legs: one(startersOnly(EQUIPMENT_BY_SLOT.legs).filter((i) => !isEmptyItem(i.id)), rng).id,
    feet: one(startersOnly(EQUIPMENT_BY_SLOT.feet), rng).id,
    mainHand: one(startersOnly(EQUIPMENT_BY_SLOT.mainHand), rng).id,
    offHand: one(startersOnly(EQUIPMENT_BY_SLOT.offHand), rng).id,
    back: one(startersOnly(EQUIPMENT_BY_SLOT.back), rng).id,
  };
  return {
    v: APPEARANCE_VERSION,
    name: keepName ?? one(NAMES, rng),
    bodyType: one(BODY_TYPES, rng).id as BodyTypeId,
    skinTone: one(SKIN_TONES, rng).id,
    hairStyle: one(HAIR_STYLES, rng).id,
    hairColor: one(HAIR_COLORS, rng).id,
    eyeColor: one(EYE_COLORS, rng).id,
    faceShape: one(FACE_SHAPES, rng).id,
    equipment,
  };
}

/** Deterministic 32-bit RNG, so an NPC id always yields the same face. */
export function seededRng(seed: number): Rng {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
