/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/sheets.ts
   THE ART SEAM for full-character animation sheets.

   Each sheet is one horizontal row of square frames. Because the
   frames are hand-painted (not rigged), every sheet is calibrated
   by hand so the character keeps ONE size and ONE ground point no
   matter which state is playing:

     anchorX / feetY  where the boots touch the ground, in source px
     refPx            source px that map to the actor's height
     heads[]          per-frame head box — drives the paperdoll
                      overlays so hair and hats ride the animation
     mirror           true when the art was authored facing LEFT

   All calibration numbers are in `calibFrame` pixels and rescale
   automatically if the artist re-exports at another resolution.
   ═══════════════════════════════════════════════════════════════ */

import { Assets, Rectangle, Texture } from "pixi.js";

export type SheetId = "idle" | "walk" | "fish" | "chop";

/** Head box for one frame, in calibration pixels. */
export type HeadCalib = readonly [top: number, cx: number, width: number];

export interface SheetDef {
  readonly id: SheetId;
  readonly src: string;
  readonly frames: number;
  /** Frame edge the numbers below were measured against. */
  readonly calibFrame: number;
  /** Art authored facing LEFT (screen convention is "unflipped = right"). */
  readonly mirror: boolean;
  /** Ground contact point, calibration px. */
  readonly anchorX: number;
  readonly feetY: number;
  /** Calibration px that map to Actor.heightUnits — chosen so the
      head reads the same size in every state, not so bounding boxes
      match (a crouched chop pose is legitimately shorter). */
  readonly refPx: number;
  /** The art already holds a tool, so held-item overlays stay hidden. */
  readonly toolBaked: boolean;
  readonly heads: readonly HeadCalib[];
}

/* ─────────────── the placeholder set we actually ship today ───────────────
   Measured from public/assets/actors/*.png (512px frames):
     idle  6 frames, front-facing, blinks
     walk  8 frames, faces LEFT
     chop  8 frames, faces LEFT, axe painted in
     fish  6 frames, faces RIGHT, rod painted in, body sits left of centre */

export const SHEET_DEFS: readonly SheetDef[] = [
  {
    id: "idle", src: "assets/actors/char_idle_anim.png", frames: 6, calibFrame: 512,
    mirror: false, anchorX: 246, feetY: 499, refPx: 472, toolBaked: false,
    heads: [[33, 230, 120], [34, 230, 120], [35, 231, 119], [28, 230, 116], [28, 230, 116], [28, 230, 117]],
  },
  {
    id: "walk", src: "assets/actors/char_walk_anim.png", frames: 8, calibFrame: 512,
    mirror: true, anchorX: 246, feetY: 454, refPx: 476, toolBaked: false,
    heads: [[47, 256, 120], [47, 258, 119], [47, 258, 119], [47, 258, 119],
            [44, 261, 119], [45, 257, 119], [45, 254, 119], [44, 259, 119]],
  },
  {
    id: "chop", src: "assets/actors/char_chop_anim.png", frames: 8, calibFrame: 512,
    mirror: true, anchorX: 252, feetY: 469, refPx: 448, toolBaked: true,
    heads: [[57, 257, 113], [63, 241, 107], [74, 232, 108], [80, 228, 109],
            [85, 224, 110], [110, 229, 115], [124, 234, 113], [81, 256, 112]],
  },
  {
    id: "fish", src: "assets/actors/char_fish_anim.png", frames: 6, calibFrame: 512,
    mirror: false, anchorX: 136, feetY: 412, refPx: 320, toolBaked: true,
    heads: [[86, 126, 80], [97, 140, 82], [97, 139, 81], [74, 126, 80], [87, 124, 80], [95, 132, 80]],
  },
];

/** Head box for one frame, in the sheet's real source pixels. */
export interface FrameAnchor {
  headCx: number;
  headTop: number;
  headW: number;
  /** Derived body landmarks, source px. */
  neckY: number;
  hipY: number;
  footTop: number;
}

/** Sub-rects of a frame, used to recolour one body region without
    masks: a multiply-tinted sprite is clipped by its own alpha, so
    a band sprite only ever paints where the character is painted. */
export type BandId = "head" | "torso" | "legs" | "feet";

export const BAND_IDS: readonly BandId[] = ["head", "torso", "legs", "feet"];

/** A band texture plus the anchor that keeps it registered with the
    full-frame sprite (both sit at the actor's ground point). */
export interface BandPlacement {
  readonly texture: Texture;
  readonly ax: number;
  readonly ay: number;
}

export interface LoadedSheet {
  readonly def: SheetDef;
  readonly textures: readonly Texture[];
  readonly frameW: number;
  readonly frameH: number;
  /** Calibration, rescaled to the real frame size. */
  readonly anchorX: number;
  readonly feetY: number;
  readonly refPx: number;
  readonly heads: readonly FrameAnchor[];
  /** bands[band][frame] */
  readonly bands: Readonly<Record<BandId, readonly BandPlacement[]>>;
}

/* ─────────────── loading ─────────────── */

async function loadSheet(def: SheetDef): Promise<LoadedSheet | null> {
  let base: Texture;
  try {
    base = await Assets.load<Texture>(def.src);
  } catch {
    console.warn(`[actors] sheet missing: ${def.src}`);
    return null;
  }
  const frameW = Math.round(base.width / def.frames);
  const frameH = base.height;
  const k = frameW / def.calibFrame;

  const textures: Texture[] = new Array(def.frames);
  for (let i = 0; i < def.frames; i++) {
    textures[i] = new Texture({
      source: base.source,
      frame: new Rectangle(i * frameW, 0, frameW, frameH),
      label: `${def.id}#${i}`,
    });
  }

  const anchorX = def.anchorX * k;
  const feetY = def.feetY * k;

  const heads: FrameAnchor[] = new Array(def.frames);
  for (let i = 0; i < def.frames; i++) {
    const h = def.heads[Math.min(i, def.heads.length - 1)];
    const headTop = h[0] * k, headCx = h[1] * k, headW = h[2] * k;
    const headH = headW * HEAD_ASPECT;
    const neckY = headTop + headH * 0.95;
    const trunk = Math.max(1, feetY - neckY);
    heads[i] = {
      headCx, headTop, headW, neckY,
      hipY: neckY + trunk * 0.46,
      footTop: feetY - trunk * 0.17,
    };
  }

  const bands = buildBands(heads, anchorX, feetY, frameW, frameH, base, def.frames);

  return { def, textures, frameW, frameH, anchorX, feetY, refPx: def.refPx * k, heads, bands };
}

/** Head height as a multiple of head width, hair included. */
export const HEAD_ASPECT = 1.16;

function bandRect(id: BandId, a: FrameAnchor, anchorX: number, feetY: number, frameH: number): Rectangle {
  const w = a.headW;
  switch (id) {
    case "head":
      return new Rectangle(a.headCx - w * 0.80, a.headTop - w * 0.22, w * 1.60, a.neckY - (a.headTop - w * 0.22));
    case "torso":
      return new Rectangle(a.headCx - w * 1.40, a.neckY, w * 2.80, a.hipY - a.neckY);
    case "legs":
      return new Rectangle(anchorX - w * 1.55, a.hipY, w * 3.10, a.footTop - a.hipY);
    case "feet":
      return new Rectangle(anchorX - w * 1.70, a.footTop, w * 3.40, Math.max(2, frameH - a.footTop));
  }
  return new Rectangle(0, 0, 1, frameH - feetY + 1);
}

function buildBands(
  heads: readonly FrameAnchor[], anchorX: number, feetY: number,
  frameW: number, frameH: number, base: Texture, frames: number,
): Record<BandId, BandPlacement[]> {
  const out = { head: [], torso: [], legs: [], feet: [] } as Record<BandId, BandPlacement[]>;
  for (const id of BAND_IDS) {
    for (let i = 0; i < frames; i++) {
      const r = bandRect(id, heads[i], anchorX, feetY, frameH);
      // clamp into the frame, then offset onto the sheet
      const x0 = Math.max(0, Math.min(frameW - 1, Math.floor(r.x)));
      const y0 = Math.max(0, Math.min(frameH - 1, Math.floor(r.y)));
      const x1 = Math.max(x0 + 1, Math.min(frameW, Math.ceil(r.x + r.width)));
      const y1 = Math.max(y0 + 1, Math.min(frameH, Math.ceil(r.y + r.height)));
      const texture = new Texture({
        source: base.source,
        frame: new Rectangle(i * frameW + x0, y0, x1 - x0, y1 - y0),
        label: `band:${id}#${i}`,
      });
      out[id].push({
        texture,
        ax: (anchorX - x0) / (x1 - x0),
        ay: (feetY - y0) / (y1 - y0),
      });
    }
  }
  return out;
}

/** Every sheet the actor system can draw. Missing files are simply
    absent — the paperdoll falls back on its procedural body. */
export class SheetPack {
  private map = new Map<SheetId, LoadedSheet>();

  static async load(defs: readonly SheetDef[] = SHEET_DEFS): Promise<SheetPack> {
    const pack = new SheetPack();
    const loaded = await Promise.all(defs.map(loadSheet));
    for (const sheet of loaded) if (sheet) pack.map.set(sheet.def.id, sheet);
    return pack;
  }

  get(id: SheetId): LoadedSheet | null { return this.map.get(id) ?? null; }
  has(id: SheetId): boolean { return this.map.has(id); }
  get size(): number { return this.map.size; }

  /** Frame textures are views on shared sources; the sources belong
      to Assets, so we only drop our slices. */
  destroy(): void {
    for (const sheet of this.map.values()) {
      for (const tex of sheet.textures) tex.destroy(false);
      for (const id of BAND_IDS) {
        for (const band of sheet.bands[id]) band.texture.destroy(false);
      }
    }
    this.map.clear();
  }
}
