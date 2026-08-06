/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/worldmap.ts
   The single source of truth for world geometry.

   The island is a PORTRAIT STRIP: one screen wide, many screens
   tall. You walk down it from the mountain to the sea, and every
   skill lives in its own vertical band. Nothing in this file is
   rendering — terrain, nodes and atmosphere all read from WORLD so
   that moving a zone boundary moves the art, the spawns and the
   walkable mask together.
   ═══════════════════════════════════════════════════════════════ */

import { DESIGN_W } from "../core/viewport";

export type ZoneId = "mountain" | "forest" | "wilds" | "meadow" | "coast" | "sea";
export type NodeKind = "ore" | "tree" | "fish";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Ellipse { x: number; y: number; rx: number; ry: number }

export interface ZoneDef {
  id: ZoneId;
  label: string;
  /** Vertical band, full width unless `pocket` narrows it. */
  bounds: Rect;
  /** Pockets are tested before bands, so an inset region can override. */
  pocket?: boolean;
  walkable: boolean;
  /** Skill this zone trains, if any. */
  skill?: "mining" | "woodcutting" | "fishing" | "combat";
}

export interface NodeSpawn {
  kind: NodeKind;
  zone: ZoneId;
  /** Art / behaviour variant: tree species, ore type, water type. */
  variant: string;
  tier: number;
  reqLevel: number;
  /** Seconds to regrow once emptied. */
  respawn: number;
  /** Seconds of work per yield — read by the skills system. */
  cycle: number;
  /** How many to scatter. */
  count: number;
  /** Region the scatter is confined to; defaults to the zone bounds. */
  region?: Rect;
  scale?: readonly [number, number];
}

/* ── the painted island ──────────────────────────────────────────
   bg_island.png is 1024×1536 of hand-painted ground. We crop the
   cliff strip off the top (we grow our own mountain above it) and
   cut just below the dry sand at the bottom (we grow our own beach
   and sea below it), then drop it in at native width so the pond
   and the path keep the artist's proportions. */
const ISLAND_SRC_W = 1024;
const ISLAND_SRC_H = 1536;
const ISLAND_SCALE = DESIGN_W / ISLAND_SRC_W;          // 1.0547
const ISLAND_FULL_H = ISLAND_SRC_H * ISLAND_SCALE;     // 1620

/** v-coordinates inside the source art. Measured off the painting. */
const ISLAND_V = {
  grassTop: 0.106,   // first row of grass under the cliff
  sandTop: 0.803,    // grass gives way to dry sand
  cropBottom: 0.868, // last row we keep: dry sand, above the wet line
} as const;

export const ISLAND = {
  src: "assets/world/bg_island.png",
  srcW: ISLAND_SRC_W,
  srcH: ISLAND_SRC_H,
  v: ISLAND_V,
  /** World y of the first kept row. */
  top: 2280,
  /** Drawn size of the kept crop, in design units. */
  width: DESIGN_W,
  height: (ISLAND_V.cropBottom - ISLAND_V.grassTop) * ISLAND_FULL_H,
  /** Where the artist's sand starts, in world y. */
  sandY: 2280 + (ISLAND_V.sandTop - ISLAND_V.grassTop) * ISLAND_FULL_H,
  /** Feather distances: the art dissolves into procedural ground. */
  fadeTop: 210,
  fadeBottom: 74,
} as const;

/** Declared as ZoneDef[] rather than const-asserted: `pocket` is
    optional, and a literal tuple drops the key from the union for
    every zone that omits it. */
const ZONES: readonly ZoneDef[] = [
  // Pockets first: `zoneAt` returns the first hit.
  {
    id: "wilds", label: "The Wilds", pocket: true, walkable: true, skill: "combat",
    bounds: { x: 596, y: 1520, w: 484, h: 740 },
  },
  {
    id: "mountain", label: "Cairnfell", walkable: true, skill: "mining",
    bounds: { x: 0, y: 0, w: DESIGN_W, h: 980 },
  },
  {
    id: "forest", label: "Hollowpine", walkable: true, skill: "woodcutting",
    bounds: { x: 0, y: 980, w: DESIGN_W, h: 1340 },
  },
  {
    id: "meadow", label: "Tidefall Holding", walkable: true,
    bounds: { x: 0, y: 2320, w: DESIGN_W, h: 1080 },
  },
  {
    id: "coast", label: "Saltmere Shore", walkable: true, skill: "fishing",
    bounds: { x: 0, y: 3400, w: DESIGN_W, h: 500 },
  },
  {
    id: "sea", label: "The Tidefall", walkable: false,
    bounds: { x: 0, y: 3900, w: DESIGN_W, h: 300 },
  },
];

/** Everything that can be harvested, and where. Typed rather than
    const-asserted for the same reason as ZONES. */
const SPAWNS: readonly NodeSpawn[] = [
  {
    kind: "ore", zone: "mountain", variant: "copper", tier: 1, reqLevel: 1,
    respawn: 12, cycle: 2.4, count: 6,
    region: { x: 90, y: 250, w: 900, h: 620 }, scale: [0.9, 1.15],
  },
  {
    kind: "ore", zone: "mountain", variant: "iron", tier: 2, reqLevel: 15,
    respawn: 20, cycle: 3.2, count: 5,
    region: { x: 110, y: 170, w: 860, h: 560 }, scale: [0.95, 1.2],
  },
  {
    kind: "ore", zone: "mountain", variant: "coal", tier: 3, reqLevel: 30,
    respawn: 26, cycle: 3.6, count: 4,
    region: { x: 140, y: 200, w: 800, h: 430 }, scale: [0.9, 1.1],
  },
  {
    kind: "ore", zone: "mountain", variant: "mithril", tier: 4, reqLevel: 55,
    respawn: 46, cycle: 5.0, count: 2,
    region: { x: 210, y: 210, w: 660, h: 300 }, scale: [1.0, 1.25],
  },
  {
    kind: "tree", zone: "forest", variant: "oak", tier: 1, reqLevel: 1,
    respawn: 14, cycle: 2.2, count: 7,
    region: { x: 90, y: 1080, w: 900, h: 1120 }, scale: [0.92, 1.14],
  },
  {
    kind: "tree", zone: "forest", variant: "birch", tier: 2, reqLevel: 12,
    respawn: 18, cycle: 2.8, count: 5,
    region: { x: 80, y: 1120, w: 620, h: 1040 }, scale: [0.9, 1.06],
  },
  {
    kind: "tree", zone: "forest", variant: "maple", tier: 3, reqLevel: 28,
    respawn: 24, cycle: 3.4, count: 4,
    region: { x: 120, y: 1180, w: 860, h: 900 }, scale: [0.95, 1.12],
  },
  {
    kind: "tree", zone: "wilds", variant: "yew", tier: 4, reqLevel: 45,
    respawn: 38, cycle: 4.4, count: 3,
    region: { x: 630, y: 1580, w: 410, h: 640 }, scale: [1.0, 1.18],
  },
  {
    kind: "tree", zone: "wilds", variant: "elder", tier: 5, reqLevel: 70,
    respawn: 62, cycle: 6.0, count: 1,
    region: { x: 700, y: 1720, w: 300, h: 340 }, scale: [1.15, 1.25],
  },
  {
    kind: "fish", zone: "meadow", variant: "pond", tier: 1, reqLevel: 1,
    respawn: 9, cycle: 2.0, count: 2,
    region: { x: 150, y: 2740, w: 210, h: 130 },
  },
  {
    kind: "fish", zone: "coast", variant: "shallows", tier: 2, reqLevel: 8,
    respawn: 11, cycle: 2.6, count: 4,
    region: { x: 110, y: 3720, w: 860, h: 110 },
  },
  {
    kind: "fish", zone: "coast", variant: "deep", tier: 3, reqLevel: 32,
    respawn: 17, cycle: 3.4, count: 3,
    region: { x: 150, y: 3900, w: 790, h: 80 },
  },
];

export const WORLD = {
  seed: 20260806,
  width: DESIGN_W,
  height: 4200,

  zones: ZONES,
  spawns: SPAWNS,

  /** Terrain band edges. Bands overlap on purpose — the blend range
      between two entries is what kills the seam. */
  bands: {
    rockTop: 0,
    rockToScree: 700,
    screeToForest: 1010,
    forestToMeadow: 2255,   // where the painted island fades in
    meadowToSand: 3380,
    sandToShallow: 3880,
    shallowToDeep: 3995,
  },

  /** Impassable water and rock. Kept tiny and analytic — a bitmap
      mask would be overkill for a strip this readable. */
  obstacles: {
    pond: { x: 254, y: 2805, rx: 214, ry: 148 } as Ellipse,
    /** Cliff face along the very top: you climb into the mine, not over it. */
    cliffTop: 176,
    /** Waterline: nothing walks past this. */
    shoreY: 3856,
  },

  /** Named places. Other systems should reference these, never raw
      numbers, so the map stays re-tunable. */
  anchors: {
    spawn: { x: 640, y: 2960 },
    "base.home": { x: 700, y: 2960 },
    "base.stall": { x: 372, y: 3120 },
    "base.pond": { x: 254, y: 2805 },
    "mine.entrance": { x: 318, y: 792 },
    "mine.deep": { x: 772, y: 380 },
    "forest.grove": { x: 306, y: 1712 },
    "forest.edge": { x: 560, y: 2210 },
    "wilds.camp": { x: 858, y: 1908 },
    "coast.jetty": { x: 726, y: 3540 },
    "coast.shallows": { x: 380, y: 3620 },
  },

  /** The sandy path the artist painted, extended up the mountain and
      down to the water. Traced off bg_island.png. */
  path: [
    { x: 330, y: 120 }, { x: 372, y: 470 }, { x: 470, y: 800 },
    { x: 528, y: 1180 }, { x: 470, y: 1600 }, { x: 512, y: 2010 },
    { x: 576, y: 2360 }, { x: 604, y: 2660 }, { x: 512, y: 2980 },
    { x: 486, y: 3230 }, { x: 508, y: 3470 }, { x: 520, y: 3700 },
  ],
} as const;

export type AnchorId = keyof typeof WORLD.anchors;

/** Zone at a world point, pockets winning over bands. */
export function zoneAt(x: number, y: number): ZoneId {
  for (const z of WORLD.zones) {
    if (!z.pocket) continue;
    const b = z.bounds;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return z.id;
  }
  for (const z of WORLD.zones) {
    if (z.pocket) continue;
    const b = z.bounds;
    if (y >= b.y && y < b.y + b.h) return z.id;
  }
  return y < 0 ? "mountain" : "sea";
}

export function zoneDef(id: ZoneId): ZoneDef | undefined {
  return WORLD.zones.find((z) => z.id === id);
}

export function anchor(id: AnchorId): { readonly x: number; readonly y: number } {
  return WORLD.anchors[id];
}

function inEllipse(e: Ellipse, x: number, y: number, pad = 0): boolean {
  const dx = (x - e.x) / (e.rx + pad);
  const dy = (y - e.y) / (e.ry + pad);
  return dx * dx + dy * dy <= 1;
}

/** Can an actor stand here? Analytic and allocation-free — this runs
    per actor per step. */
export function isWalkable(x: number, y: number): boolean {
  const o = WORLD.obstacles;
  if (x < 40 || x > WORLD.width - 40) return false;
  if (y < o.cliffTop || y > o.shoreY) return false;
  if (inEllipse(o.pond, x, y)) return false;
  return true;
}

/** Push a point to the nearest legal spot. Used by movement and by
    node scatter so nothing ever spawns in the pond. */
export function clampToWalkable(x: number, y: number): { x: number; y: number } {
  const o = WORLD.obstacles;
  let cx = Math.min(Math.max(x, 40), WORLD.width - 40);
  let cy = Math.min(Math.max(y, o.cliffTop), o.shoreY);
  if (inEllipse(o.pond, cx, cy)) {
    const dx = (cx - o.pond.x) / o.pond.rx;
    const dy = (cy - o.pond.y) / o.pond.ry;
    const len = Math.hypot(dx, dy) || 1;
    cx = o.pond.x + (dx / len) * (o.pond.rx + 14);
    cy = o.pond.y + (dy / len) * (o.pond.ry + 14);
  }
  return { x: cx, y: cy };
}

/** Point on the painted path closest to `y`. Handy for walk-to logic
    and for parking idle NPCs somewhere that reads as intentional. */
export function pathAt(y: number): { x: number; y: number } {
  const p = WORLD.path;
  const first = p[0];
  const last = p[p.length - 1];
  if (y <= first.y) return { x: first.x, y };
  if (y >= last.y) return { x: last.x, y };
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      return { x: a.x + (b.x - a.x) * t, y };
    }
  }
  return { x: last.x, y };
}
