/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/terrain.ts
   Paints the full 1080×4200 strip.

   We own one piece of real art (bg_island.png) and four screens of
   world. The strategy:

     1. Sample the painting's own rock / grass / sand / sea colours.
     2. Grow the mountain, forest floor, beach and open sea from
        THOSE colours, so the procedural ground is literally in the
        artist's palette rather than a guess next to it.
     3. Drop the painting in on top with its top and bottom edges
        feathered to alpha 0, so there is no boundary to see — the
        art dissolves into ground of the same hue.

   Ground is never a gradient with speckles on it: each band is
   built from structure first (stone plates, humus mottling, tidal
   pools) and only then tinted, which is the difference between
   "painted" and "shaded rectangle".

   Everything static is baked into chunk textures (one draw call
   each, culled when off screen). Only the sea moves at runtime.
   ═══════════════════════════════════════════════════════════════ */

import { Container, Sprite, Texture, TilingSprite } from "pixi.js";
import type { QualityTier } from "../core/contracts";
import { WORLD, ISLAND } from "./worldmap";
import { Rng, smoothstep } from "./rng";
import {
  makeCanvas, blotch, stroke, organicPath, grain, sampleBand, mix, shade, css, rgb, desaturate,
} from "./paint";
import type { Ctx2D, Rgb } from "./paint";

/** Texture pixels per design unit. Below 1 on purpose: the softness
    reads as brushwork, and it keeps chunk textures well inside the
    2048px limit that the oldest mobile GPUs still enforce. */
const RES: Record<QualityTier, number> = { low: 0.5, mid: 0.78, high: 0.95 };
const CHUNK_H = 1050;
/** Bake margin so props straddling a chunk edge are drawn into both. */
const BLEED = 260;
/** How far each chunk reaches up into the one above it.

    Abutting textures are not seamless even with identical content:
    bilinear sampling clamps at a texture's edge, so the outermost
    texel row stretches flat across ~1.3 screen pixels instead of
    blending into its neighbour. On a strong vertical gradient that
    flat band reads as a hairline. Overlapping and feathering the top
    edge to alpha 0 hands those pixels back to the chunk underneath. */
const OVERLAP = 32;

export interface Palette {
  rock: Rgb; stone: Rgb; stoneLit: Rgb; stoneDark: Rgb; lichen: Rgb;
  soil: Rgb; forest: Rgb; forestDark: Rgb; moss: Rgb;
  grass: Rgb; grassLit: Rgb;
  sand: Rgb; sandWet: Rgb;
  shallow: Rgb; deep: Rgb; foam: Rgb;
}

export class Terrain {
  private root = new Container();
  private chunks: Sprite[] = [];
  private foam: TilingSprite[] = [];
  private foamPhase: number[] = [];
  private shoreFoam: TilingSprite[] = [];
  private island: Sprite | null = null;
  private pal!: Palette;
  private res: number;
  private textures: Texture[] = [];

  constructor(private quality: QualityTier) {
    this.res = RES[quality];
  }

  get view() { return this.root; }
  /** Exposed so nodes and atmosphere can match the ground colours. */
  get palette(): Palette { return this.pal; }

  async build(parent: Container): Promise<void> {
    const img = await loadImage(ISLAND.src);
    this.pal = derivePalette(img);

    const chunkCount = Math.ceil(WORLD.height / CHUNK_H);
    for (let i = 0; i < chunkCount; i++) {
      const top = i * CHUNK_H;
      const h = Math.min(CHUNK_H, WORLD.height - top);
      const sprite = this.bakeChunk(i, top, h);
      this.chunks.push(sprite);
      this.root.addChild(sprite);
      // Yield between chunks so the boot splash keeps animating.
      if (i < chunkCount - 1) await nextFrame();
    }

    this.island = this.buildIsland(img);
    this.root.addChild(this.island);

    this.buildSea();
    parent.addChild(this.root);
  }

  /* ── the painted island ───────────────────────────────────── */

  /** Crop off the cliff strip and the wet sand, then feather both cut
      edges to zero alpha. Baking the feather into the texture beats a
      runtime mask: one sprite, one draw call, no filter pass. */
  private buildIsland(img: HTMLImageElement): Sprite {
    const sx = ISLAND.srcW;
    const cropY = ISLAND.v.grassTop * ISLAND.srcH;
    const cropH = (ISLAND.v.cropBottom - ISLAND.v.grassTop) * ISLAND.srcH;
    const { cv, ctx } = makeCanvas(sx, cropH);
    ctx.drawImage(img, 0, cropY, sx, cropH, 0, 0, sx, cropH);

    const k = ISLAND.srcW / ISLAND.width;       // design units → source px
    const fadeT = ISLAND.fadeTop * k;
    const fadeB = ISLAND.fadeBottom * k;
    const g = ctx.createLinearGradient(0, 0, 0, cropH);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(fadeT / cropH, "rgba(0,0,0,1)");
    g.addColorStop(1 - fadeB / cropH, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sx, cropH);

    const tex = Texture.from(cv);
    this.textures.push(tex);
    const s = new Sprite(tex);
    s.width = ISLAND.width;
    s.height = ISLAND.height;
    s.position.set(0, ISLAND.top);
    return s;
  }

  /* ── procedural ground ────────────────────────────────────── */

  private bakeChunk(index: number, top: number, h: number): Sprite {
    // Chunk 0's top is the world edge — nothing underneath to blend
    // with, so it gets no overlap.
    const lift = index === 0 ? 0 : OVERLAP;
    const drawTop = top - lift;
    const drawH = h + lift;
    const { cv, ctx } = makeCanvas(WORLD.width * this.res, drawH * this.res);
    // Draw in world units; the transform carries the chunk offset so
    // every band gradient and scatter is a pure function of world y.
    ctx.setTransform(this.res, 0, 0, this.res, 0, -drawTop * this.res);

    const y0 = drawTop - BLEED;
    const y1 = top + h + BLEED;

    this.paintBase(ctx, drawTop, drawH);
    this.paintMountain(ctx, y0, y1);
    this.paintForest(ctx, y0, y1);
    this.paintMeadow(ctx, y0, y1);
    this.paintShore(ctx, y0, y1);
    this.paintWilds(ctx, y0, y1);
    // Grain last so it unifies every band under one paper texture.
    grain(ctx, 0, drawTop, WORLD.width, drawH, 0.12, 1 / this.res);

    if (lift > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const fade = lift * this.res;
      const g = ctx.createLinearGradient(0, 0, 0, fade);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = g;
      // Must cover the WHOLE canvas: destination-in clears every pixel
      // the source does not touch, so filling only the fade band would
      // erase the chunk body. The gradient clamps to its last stop, so
      // everything below the band stays fully opaque.
      ctx.fillRect(0, 0, cv.width, cv.height);
    }

    const tex = Texture.from(cv);
    this.textures.push(tex);
    const s = new Sprite(tex);
    s.width = WORLD.width;
    s.height = drawH;
    s.position.set(0, drawTop);
    return s;
  }

  /** One gradient spanning the whole world, so band edges are
      continuous across chunk boundaries by construction. */
  private paintBase(ctx: Ctx2D, top: number, h: number) {
    const p = this.pal;
    const b = WORLD.bands;
    const H = WORLD.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const at = (y: number, c: Rgb) => g.addColorStop(Math.min(1, Math.max(0, y / H)), css(c));

    at(0, shade(p.stone, 0.72));
    at(180, shade(p.stone, 0.9));
    at(300, p.stone);
    at(620, shade(p.stone, 1.04));
    at(b.rockToScree, mix(p.stone, p.soil, 0.28));
    at(980, mix(p.soil, p.forestDark, 0.45));
    at(b.screeToForest, mix(p.soil, p.forestDark, 0.86));
    at(1360, p.forestDark);
    at(1760, p.forest);
    at(2010, mix(p.forest, p.grass, 0.3));
    at(b.forestToMeadow, mix(p.forest, p.grass, 0.56));
    at(2400, p.grass);
    at(3020, p.grassLit);
    at(b.meadowToSand, mix(p.grass, p.sand, 0.6));
    at(3390, p.sand);
    at(3600, shade(p.sand, 0.98));
    at(b.sandToShallow, p.sandWet);
    at(3740, p.shallow);
    at(b.shallowToDeep, mix(p.shallow, p.deep, 0.6));
    at(H, p.deep);

    ctx.fillStyle = g;
    ctx.fillRect(0, top, WORLD.width, h);

    // Broad tonal drift: the difference between "a gradient" and
    // "painted ground" is mostly this pass.
    const r = new Rng(WORLD.seed ^ 0x51ed);
    for (let i = 0; i < 900; i++) {
      const y = r.range(-BLEED, H + BLEED);
      if (y < top - BLEED || y > top + h + BLEED) continue;
      const x = r.range(-120, WORLD.width + 120);
      const base = this.groundAt(y);
      const c = r.bool(0.5) ? shade(base, r.range(1.03, 1.14)) : shade(base, r.range(0.84, 0.96));
      blotch(ctx, x, y, r.range(90, 300), r.range(50, 160), c, r.range(0.06, 0.16));
    }
  }

  /** Approximate ground colour at a world y — used to keep scatter
      tints inside the local band instead of a global average. */
  private groundAt(y: number): Rgb {
    const p = this.pal;
    const b = WORLD.bands;
    if (y < b.rockToScree) return p.stone;
    if (y < b.screeToForest) return mix(p.stone, p.soil, smoothstep(b.rockToScree, b.screeToForest, y));
    if (y < b.forestToMeadow) return mix(p.forestDark, p.forest, smoothstep(b.screeToForest, 1800, y));
    if (y < b.meadowToSand) return p.grass;
    if (y < b.sandToShallow) return p.sand;
    if (y < b.shallowToDeep) return p.shallow;
    return p.deep;
  }

  /* ── mountain: cliff wall over a plated stone shelf ───────── */

  private paintMountain(ctx: Ctx2D, y0: number, y1: number) {
    const b = WORLD.bands;
    if (y0 > b.screeToForest + 80) return;
    const wallBase = WORLD.obstacles.cliffTop;

    if (y0 < wallBase + 200) this.paintCliffWall(ctx, wallBase);
    this.paintStoneShelf(ctx, Math.max(y0, wallBase - 80), Math.min(y1, b.screeToForest + 120), wallBase);
  }

  /** The north wall. Irregular courses of blocks, deep shadow in the
      joints, rubble piling at the foot — never a brick pattern. */
  private paintCliffWall(ctx: Ctx2D, base: number) {
    const p = this.pal;
    let rowY = -70;
    let row = 0;
    while (rowY < base) {
      const rr = new Rng(WORLD.seed + row * 7717);
      const rh = rr.range(44, 82);
      let x = -60 - rr.range(0, 120);
      let col = 0;
      while (x < WORLD.width + 60) {
        const r = new Rng(WORLD.seed + row * 977 + col * 31 + 5);
        const w = r.range(70, 190);
        // Blocks lighten as they come forward toward the shelf.
        const depth = 1 - Math.min(1, (rowY + rh) / (base + 40));
        const face = shade(mix(p.stone, p.stoneDark, depth * 0.5), r.range(0.84, 1.16));
        // One path, reused for fill / clip / stroke: re-rolling it
        // would desync the outline from the block it outlines.
        organicPath(ctx, x + w / 2, rowY + rh / 2, w / 2, rh / 2, r, 0.13, 8);
        ctx.fillStyle = css(face);
        ctx.fill();
        ctx.save();
        ctx.clip();
        // Lit top bevel + shadowed underside give the blocks mass.
        ctx.fillStyle = css(shade(face, 1.22), 0.6);
        ctx.fillRect(x, rowY, w, rh * 0.26);
        ctx.fillStyle = css(p.stoneDark, 0.5);
        ctx.fillRect(x, rowY + rh * 0.72, w, rh * 0.34);
        // A fracture or two across the face.
        for (let i = 0; i < 2; i++) {
          stroke(ctx, x + r.range(0, w), rowY, r.jitter(w * 0.3), rh, r.range(1.2, 2.4),
            shade(p.stoneDark, 0.7), 0.3);
        }
        ctx.restore();
        ctx.strokeStyle = css(shade(p.stoneDark, 0.62), 0.62);
        ctx.lineWidth = 3;
        ctx.stroke();
        x += w - r.range(2, 10);
        col++;
      }
      rowY += rh - r0jitter(rr);
      row++;
    }

    // Rubble skirt: hides the wall's bottom edge and explains how the
    // shelf below is made of the same stone.
    const rb = new Rng(WORLD.seed ^ 0x9a1);
    for (let i = 0; i < 150; i++) {
      const x = rb.range(-30, WORLD.width + 30);
      const t = rb.next() * rb.next();               // biased to the wall foot
      const y = base - 46 + t * 150;
      const s = rb.range(9, 26) * (1 - t * 0.4);
      this.drawStoneChip(ctx, x, y, s, rb);
    }
    // Lichen clinging where the wall meets ground.
    for (let i = 0; i < 90; i++) {
      const x = rb.range(-20, WORLD.width + 20);
      const y = base + rb.jitter(60);
      blotch(ctx, x, y, rb.range(18, 52), rb.range(8, 22), p.lichen, rb.range(0.12, 0.4));
    }
  }

  /** Top-down bedrock: large irregular plates split by dark fissures.
      Plates are what make it read as stone; speckle alone reads as
      dirt, which is exactly the trap this replaced. */
  private paintStoneShelf(ctx: Ctx2D, top: number, bottom: number, wallBase: number) {
    if (bottom <= top) return;
    const p = this.pal;
    const b = WORLD.bands;

    let rowY = wallBase - 120;
    let row = 0;
    // Plates continue well past the treeline, going soil-coloured as
    // they go: a band edge you can point at is a band edge that failed.
    while (rowY < b.screeToForest + 260) {
      const rr = new Rng(WORLD.seed + 3300 + row * 613);
      const rh = rr.range(150, 250);
      if (rowY + rh < top - 60 || rowY > bottom + 60) { rowY += rh * 0.86; row++; continue; }
      let x = -90 - rr.range(0, 160);
      let col = 0;
      while (x < WORLD.width + 90) {
        const r = new Rng(WORLD.seed + 3300 + row * 613 + col * 149);
        const w = r.range(170, 330);
        const cx = x + w / 2, cy = rowY + rh / 2;
        // Soil creeps over the stone as we approach the treeline.
        const deep = smoothstep(b.rockToScree - 60, b.screeToForest + 170, cy);
        const face = shade(mix(p.stone, p.forestDark, deep), r.range(0.9, 1.1));

        organicPath(ctx, cx, cy, w / 2, rh / 2, r, 0.15, 7);
        ctx.fillStyle = css(face);
        ctx.fill();
        ctx.save();
        ctx.clip();
        // Light from the north-west, shadow pooling in the fissure.
        const lg = ctx.createLinearGradient(cx - w / 2, cy - rh / 2, cx + w / 2, cy + rh / 2);
        lg.addColorStop(0, css(shade(face, 1.16), 0.7 * (1 - deep)));
        lg.addColorStop(0.55, css(face, 0));
        lg.addColorStop(1, css(shade(face, 0.72), 0.6 * (1 - deep)));
        ctx.fillStyle = lg;
        ctx.fillRect(cx - w, cy - rh, w * 2, rh * 2);
        // Fractures: short straight segments, not long curves. Curves
        // read as hair on a flat fill; angles read as broken stone.
        for (let i = 0; i < 4; i++) {
          let px = cx + r.jitter(w * 0.42), py = cy + r.jitter(rh * 0.42);
          let ang = r.range(0, Math.PI * 2);
          for (let s = 0; s < 3; s++) {
            const len = r.range(26, 74);
            const nx = px + Math.cos(ang) * len, ny = py + Math.sin(ang) * len;
            ctx.strokeStyle = css(shade(p.stoneDark, 0.72), r.range(0.16, 0.34) * (1 - deep));
            ctx.lineWidth = r.range(1.6, 3.4);
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
            ctx.strokeStyle = css(shade(face, 1.3), 0.2 * (1 - deep));
            ctx.beginPath(); ctx.moveTo(px, py - 2); ctx.lineTo(nx, ny - 2); ctx.stroke();
            px = nx; py = ny; ang += r.jitter(1.1);
          }
        }
        ctx.restore();
        // The fissure itself, drawn as a dark rim.
        ctx.strokeStyle = css(shade(p.stoneDark, 0.55), 0.55 * (1 - deep));
        ctx.lineWidth = 5;
        ctx.stroke();
        x += w - r.range(4, 16);
        col++;
      }
      rowY += rh * 0.86;
      row++;
    }

    // Scree collecting in the fissures and drifting downhill.
    const sc = new Rng(WORLD.seed ^ 0x6b17);
    for (let i = 0; i < 260; i++) {
      const y = sc.range(wallBase - 80, b.screeToForest + 120);
      const x = sc.range(-20, WORLD.width + 20);
      if (y < top - 40 || y > bottom + 60) continue;
      // Bias small: a few readable chips beat a field of confetti.
      const k = sc.next();
      this.drawStoneChip(ctx, x, y, 6 + k * k * 22, sc);
    }

    // Boulders: the only tall silhouettes up here, so they carry the
    // depth read for the whole band.
    for (let i = 0; i < 20; i++) {
      const r = new Rng(WORLD.seed + 4400 + i * 131);
      const x = r.range(50, WORLD.width - 50);
      const y = r.range(wallBase + 40, b.rockToScree + 210);
      if (y < top - 110 || y > bottom + 110) continue;
      this.drawBoulder(ctx, x, y, r.range(28, 66), r);
    }

    // Lichen and the first moss, thickening toward the trees.
    const m = new Rng(WORLD.seed ^ 0x4055);
    for (let i = 0; i < 340; i++) {
      const y = m.range(wallBase, b.screeToForest + 160);
      const x = m.range(-40, WORLD.width + 40);
      if (y < top - 60 || y > bottom + 60) continue;
      const t = smoothstep(b.rockToScree - 200, b.screeToForest, y);
      const c = mix(p.lichen, p.moss, t);
      blotch(ctx, x, y, m.range(24, 88), m.range(12, 40), c, 0.08 + t * 0.34);
    }

    // Sun pooling on the open rock.
    const sun = new Rng(WORLD.seed ^ 0x50f);
    for (let i = 0; i < 14; i++) {
      const y = sun.range(wallBase, b.rockToScree + 120);
      if (y < top - 200 || y > bottom + 200) continue;
      blotch(ctx, sun.range(0, WORLD.width), y, sun.range(160, 320), sun.range(110, 240),
        rgb(255, 246, 214), sun.range(0.05, 0.1));
    }
  }

  /** A small angular chip of the local stone. */
  private drawStoneChip(ctx: Ctx2D, x: number, y: number, s: number, r: Rng) {
    const p = this.pal;
    const c = shade(p.stone, r.range(0.66, 1.2));
    blotch(ctx, x, y + s * 0.3, s * 1.15, s * 0.45, rgb(22, 19, 16), 0.28);
    organicPath(ctx, x, y, s, s * 0.74, r, 0.3, 6);
    ctx.fillStyle = css(c, 0.95);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = css(shade(c, 1.28), 0.6);
    ctx.fillRect(x - s, y - s, s * 2, s * 0.7);
    ctx.restore();
    ctx.strokeStyle = css(shade(p.stoneDark, 0.7), 0.4);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  private drawBoulder(ctx: Ctx2D, x: number, y: number, r0: number, r: Rng) {
    const p = this.pal;
    // Contact shadow first — a rock without one floats.
    blotch(ctx, x, y + r0 * 0.22, r0 * 1.4, r0 * 0.55, rgb(24, 20, 16), 0.42);
    const body = shade(p.stone, r.range(0.9, 1.08));
    organicPath(ctx, x, y - r0 * 0.2, r0, r0 * 0.8, r, 0.2, 8);
    const g = ctx.createLinearGradient(0, y - r0, 0, y + r0 * 0.6);
    g.addColorStop(0, css(shade(body, 1.3)));
    g.addColorStop(0.5, css(body));
    g.addColorStop(1, css(shade(body, 0.6)));
    ctx.fillStyle = g;
    ctx.fill();
    // Clip BEFORE the detail so no highlight ever escapes the rock.
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 3; i++) {
      const px = x + r.jitter(r0 * 0.6), py = y - r0 * 0.55 + r.jitter(r0 * 0.3);
      const nx = px + r.jitter(r0 * 0.9), ny = py + r.range(r0 * 0.4, r0 * 0.9);
      ctx.strokeStyle = css(shade(p.stoneDark, 0.75), 0.34);
      ctx.lineWidth = r.range(1.8, 3);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
    }
    if (r.bool(0.55)) blotch(ctx, x + r.jitter(r0 * 0.5), y - r0 * 0.7, r0 * 0.6, r0 * 0.26, p.lichen, 0.45);
    ctx.restore();
    ctx.strokeStyle = css(shade(p.stoneDark, 0.6), 0.55);
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }

  /* ── forest floor ─────────────────────────────────────────── */

  private paintForest(ctx: Ctx2D, y0: number, y1: number) {
    const p = this.pal;
    const b = WORLD.bands;
    const top = Math.max(y0, b.rockToScree);
    const bot = Math.min(y1, b.forestToMeadow + 320);
    if (bot <= top) return;

    /* Coverage budget matters more than colour choice here. Soft
       blotches stack multiplicatively: 700 of them at 150px across a
       1080-wide band repaints the floor several times over, and the
       average of the stack becomes the ground colour no matter what
       the base gradient said. That is exactly how the first pass
       turned a dark forest into a lawn. So: few large shade pools,
       many small high-contrast marks, and every mottle centred on the
       local ground colour rather than biased light. */

    const inForest = (y: number) =>
      smoothstep(b.screeToForest - 220, b.screeToForest + 260, y) *
      (1 - smoothstep(b.forestToMeadow - 120, b.forestToMeadow + 300, y));

    // Canopy shade: the structure pass. Big, soft, and the only thing
    // allowed to move the overall value much.
    const cs = new Rng(WORLD.seed ^ 0xc0d0);
    for (let i = 0; i < 90; i++) {
      const y = cs.range(b.screeToForest - 160, b.forestToMeadow + 220);
      const x = cs.range(-200, WORLD.width + 200);
      if (y < top - 260 || y > bot + 260) continue;
      blotch(ctx, x, y, cs.range(200, 420), cs.range(120, 250),
        mix(p.forestDark, rgb(14, 22, 14), 0.6), cs.range(0.14, 0.3) * inForest(y));
    }

    // Mottling: symmetric around the local ground, so it adds grain
    // without shifting the band's value.
    const h = new Rng(WORLD.seed ^ 0x1eaf);
    for (let i = 0; i < 420; i++) {
      const y = h.range(b.rockToScree, b.forestToMeadow + 320);
      const x = h.range(-80, WORLD.width + 80);
      if (y < top - 80 || y > bot + 80) continue;
      const base = this.groundAt(y);
      const c = h.bool(0.5)
        ? mix(base, p.moss, h.range(0.15, 0.6))
        : mix(base, p.soil, h.range(0.2, 0.75));
      blotch(ctx, x, y, h.range(50, 140), h.range(26, 70), c, h.range(0.05, 0.13));
    }

    // Leaf litter — small marks, strong contrast. High-frequency
    // detail costs almost no coverage, so it can be as loud as it
    // needs to be.
    const l = new Rng(WORLD.seed ^ 0x7ea7);
    const litter = this.quality === "low" ? 2000 : 4200;
    for (let i = 0; i < litter; i++) {
      const y = l.range(b.screeToForest - 200, b.forestToMeadow + 260);
      const x = l.range(-30, WORLD.width + 30);
      const a = l.range(0, Math.PI);
      const len = l.range(8, 22);
      if (y < top - 30 || y > bot + 30) continue;
      const k = inForest(y);
      const warm = l.bool(0.5);
      const c = warm
        ? mix(p.soil, rgb(198, 128, 52), l.range(0.3, 1))
        : mix(p.forestDark, p.moss, l.range(0, 1));
      stroke(ctx, x, y, Math.cos(a) * len, Math.sin(a) * len * 0.5, l.range(2.2, 4.6),
        c, l.range(0.25, 0.6) * k);
    }

    // Undergrowth. Bare ground between trunks is what reads as lawn;
    // low mounds of leaf are what read as forest.
    const bushCount = this.quality === "low" ? 46 : 96;
    for (let i = 0; i < bushCount; i++) {
      const r = new Rng(WORLD.seed + 17000 + i * 251);
      const y = r.range(b.screeToForest - 40, b.forestToMeadow + 140);
      if (y < top - 120 || y > bot + 120) continue;
      const x = r.range(-30, WORLD.width + 30);
      this.drawBush(ctx, x, y, r.range(38, 96), inForest(y), r);
    }

    // Fallen logs: mossed and low-contrast. Dark bars on open ground
    // read as fence rails, which is what the first attempt looked like.
    for (let i = 0; i < 22; i++) {
      const r = new Rng(WORLD.seed + 9100 + i * 197);
      const y = r.range(b.screeToForest + 60, b.forestToMeadow - 180);
      if (y < top - 140 || y > bot + 140) continue;
      const x = r.range(-20, WORLD.width + 20);
      const len = r.range(110, 220);
      const a = r.range(-0.42, 0.42);
      const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
      const k = inForest(y);
      const bark = mix(p.soil, p.forestDark, 0.34);
      blotch(ctx, x + dx / 2, y + dy / 2 + 9, len * 0.55, 15, rgb(12, 18, 11), 0.34 * k);
      ctx.lineCap = "round";
      ctx.strokeStyle = css(bark, 0.9 * k);
      ctx.lineWidth = r.range(17, 27);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      ctx.strokeStyle = css(shade(bark, 1.35), 0.4 * k);
      ctx.lineWidth = r.range(4, 7);
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + dx, y + dy - 6); ctx.stroke();
      for (let m = 0; m < 3; m++) {
        const t = r.next();
        blotch(ctx, x + dx * t, y + dy * t - 4, r.range(16, 34), 8, p.moss, 0.55 * k);
      }
    }

    // Ferns and tufts — the read-at-a-glance signal for "forest".
    const fernCount = this.quality === "low" ? 150 : 330;
    for (let i = 0; i < fernCount; i++) {
      const r = new Rng(WORLD.seed + 12000 + i * 313);
      const y = r.range(b.screeToForest - 60, b.forestToMeadow + 200);
      if (y < top - 70 || y > bot + 70) continue;
      const x = r.range(4, WORLD.width - 4);
      const size = r.range(16, 38);
      const k = inForest(y);
      if (k < 0.05) continue;
      const c = mix(p.moss, p.grass, r.range(0.05, 0.7));
      blotch(ctx, x, y + size * 0.14, size * 1.15, size * 0.4, rgb(12, 20, 11), 0.34 * k);
      const blades = r.int(7, 12);
      for (let bl = 0; bl < blades; bl++) {
        const a = -Math.PI / 2 + ((bl / (blades - 1)) - 0.5) * 2.3 + r.jitter(0.14);
        const len = size * r.range(0.7, 1.3);
        stroke(ctx, x, y, Math.cos(a) * len, Math.sin(a) * len, r.range(2.4, 4),
          mix(shade(c, r.range(0.7, 1.0)), rgb(170, 205, 100), r.range(0, 0.45)),
          r.range(0.6, 0.95) * k);
      }
    }

    // Light breaking the canopy. Kept scarce — it is the counterpoint
    // to the shade pools, not a second ambient.
    if (this.quality !== "low") {
      const sh = new Rng(WORLD.seed ^ 0x5417);
      for (let i = 0; i < 18; i++) {
        const y = sh.range(b.screeToForest, b.forestToMeadow - 100);
        if (y < top - 220 || y > bot + 220) continue;
        blotch(ctx, sh.range(0, WORLD.width), y, sh.range(90, 180), sh.range(120, 260),
          rgb(255, 248, 206), sh.range(0.08, 0.16) * inForest(y));
      }
    }
  }

  /** A mound of undergrowth: overlapping leaf lobes, dark at the base
      and catching light on top. Round lobes matter — the first pass
      used the angular rock silhouette and the forest filled up with
      what looked like mossy boulders. */
  private drawBush(ctx: Ctx2D, x: number, y: number, size: number, k: number, r: Rng) {
    if (k < 0.04) return;
    const p = this.pal;
    const tone = mix(p.forest, p.moss, r.range(0.25, 0.9));
    // Light the foliage by mixing toward a LEAF green, not toward
    // white. shade() above 1.0 washes to white, and a bush lit that
    // way turns into a pale grey lump that reads as mist or lichen.
    const dark = shade(tone, 0.52);
    const lit = mix(tone, rgb(158, 196, 92), 0.6);
    blotch(ctx, x, y + size * 0.1, size * 1.15, size * 0.34, rgb(8, 14, 8), 0.5 * k);

    const lobes = r.int(9, 14);
    for (let i = 0; i < lobes; i++) {
      const t = i / (lobes - 1);
      const lx = x + r.jitter(size * 0.5);
      // Later lobes ride higher, so the last ones drawn are the lit ones.
      const ly = y - size * (0.1 + t * 0.42) + r.jitter(size * 0.12);
      const lr = size * r.range(0.2, 0.34);
      ctx.beginPath();
      ctx.ellipse(lx, ly, lr, lr * 0.82, r.jitter(0.4), 0, Math.PI * 2);
      ctx.fillStyle = css(mix(dark, lit, t * t), (0.86 + r.next() * 0.14) * k);
      ctx.fill();
    }
    // Blades escaping the mass keep the silhouette from reading as a blob.
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + r.jitter(1.2);
      const len = size * r.range(0.45, 0.85);
      stroke(ctx, x + r.jitter(size * 0.42), y - size * 0.12,
        Math.cos(a) * len, Math.sin(a) * len, r.range(2.2, 3.6),
        mix(lit, rgb(196, 224, 128), r.range(0, 0.5)), 0.75 * k);
    }
  }

  /* ── meadow fringe (the art covers the middle) ───────────── */

  private paintMeadow(ctx: Ctx2D, y0: number, y1: number) {
    const p = this.pal;
    const b = WORLD.bands;
    const top = Math.max(y0, b.forestToMeadow - 260);
    const bot = Math.min(y1, b.meadowToSand + 220);
    if (bot <= top) return;

    // Grass strokes across the blend zone; they cross the island's
    // feathered edge in both directions so the eye finds no line.
    const g = new Rng(WORLD.seed ^ 0x6a55);
    const count = this.quality === "low" ? 1800 : 3400;
    for (let i = 0; i < count; i++) {
      const y = g.range(b.forestToMeadow - 280, b.meadowToSand + 180);
      const x = g.range(-20, WORLD.width + 20);
      if (y < top - 30 || y > bot + 30) continue;
      const t = smoothstep(b.forestToMeadow - 240, b.forestToMeadow + 300, y);
      const c = mix(mix(p.forest, p.moss, g.next()), mix(p.grass, p.grassLit, g.next()), t);
      const len = g.range(10, 22);
      stroke(ctx, x, y, g.jitter(5), -len, g.range(2.2, 4), c, g.range(0.24, 0.62));
    }

    // A few flowers so the fringe matches the painted meadow.
    const f = new Rng(WORLD.seed ^ 0xf10a);
    for (let i = 0; i < 240; i++) {
      const y = f.range(b.forestToMeadow - 40, b.forestToMeadow + 320);
      const x = f.range(0, WORLD.width);
      if (y < top || y > bot) continue;
      const c = f.pick([rgb(248, 240, 214), rgb(244, 196, 214), rgb(250, 228, 128), rgb(206, 214, 246)]);
      ctx.fillStyle = css(c, f.range(0.6, 0.95));
      ctx.beginPath();
      ctx.arc(x, y, f.range(2, 3.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── beach and open sea ───────────────────────────────────── */

  private paintShore(ctx: Ctx2D, y0: number, y1: number) {
    const p = this.pal;
    const b = WORLD.bands;
    const top = Math.max(y0, ISLAND.sandY - 220);
    if (y1 <= top) return;

    // Dry sand: tonal pools + pebbles, matched to the painting's sand
    // because that is where the island's bottom feather lands.
    const s = new Rng(WORLD.seed ^ 0x5a4d);
    for (let i = 0; i < 460; i++) {
      const y = s.range(ISLAND.sandY - 140, b.sandToShallow + 40);
      const x = s.range(-60, WORLD.width + 60);
      if (y < top - 60 || y > y1 + 60) continue;
      blotch(ctx, x, y, s.range(60, 210), s.range(20, 64),
        shade(p.sand, s.bool(0.5) ? s.range(1.03, 1.11) : s.range(0.88, 0.97)), s.range(0.08, 0.22));
    }
    // Wind ripples in the dry sand.
    const rp = new Rng(WORLD.seed ^ 0x2211);
    for (let i = 0; i < 260; i++) {
      const y = rp.range(ISLAND.sandY - 40, b.sandToShallow - 30);
      const x = rp.range(-60, WORLD.width + 60);
      if (y < top || y > y1) continue;
      stroke(ctx, x, y, rp.range(60, 160), rp.jitter(6), rp.range(2, 4),
        shade(p.sand, rp.bool(0.5) ? 0.9 : 1.1), rp.range(0.08, 0.2));
    }
    const peb = new Rng(WORLD.seed ^ 0x9eb1);
    for (let i = 0; i < 300; i++) {
      const y = peb.range(ISLAND.sandY - 40, b.sandToShallow);
      const x = peb.range(0, WORLD.width);
      if (y < top || y > y1) continue;
      const rr = peb.range(1.8, 5);
      ctx.fillStyle = css(shade(p.sand, peb.range(0.58, 0.8)), peb.range(0.3, 0.62));
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shells and driftwood — fewer and larger than a litter scatter,
    // so each one reads as a placed prop.
    for (let i = 0; i < 11; i++) {
      const r = new Rng(WORLD.seed + 21000 + i * 271);
      const y = r.range(ISLAND.sandY + 40, b.sandToShallow - 50);
      const x = r.range(70, WORLD.width - 70);
      if (y < top || y > y1) continue;
      // Weighted so driftwood is rare and big rather than common and
      // uniform — nine identical logs read as litter, not as a beach.
      const roll = r.next();
      if (roll < 0.5) this.drawShell(ctx, x, y, r.range(10, 17), r);
      else if (roll < 0.78) this.drawSeaweed(ctx, x, y, r.range(30, 58), r);
      else this.drawDriftwood(ctx, x, y, r.range(120, 210), r);
    }
    // Damp hollows where the last high tide sat.
    const damp = new Rng(WORLD.seed ^ 0xda11);
    for (let i = 0; i < 40; i++) {
      const y = damp.range(b.sandToShallow - 210, b.sandToShallow - 20);
      const x = damp.range(-60, WORLD.width + 60);
      if (y < top || y > y1) continue;
      blotch(ctx, x, y, damp.range(80, 240), damp.range(20, 56), p.sandWet,
        damp.range(0.08, 0.24));
    }

    // Wet sand and water, cut by an irregular waterline.
    const w = new Rng(WORLD.seed ^ 0x111e);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-20, WORLD.height + 40);
    ctx.lineTo(-20, b.sandToShallow);
    for (let x = -20; x <= WORLD.width + 20; x += 24) {
      const wob = Math.sin(x * 0.0121) * 15 + Math.sin(x * 0.0337 + 2.1) * 9 + w.jitter(3);
      ctx.lineTo(x, b.sandToShallow + wob);
    }
    ctx.lineTo(WORLD.width + 20, WORLD.height + 40);
    ctx.closePath();
    ctx.clip();
    const wg = ctx.createLinearGradient(0, b.sandToShallow - 40, 0, WORLD.height);
    wg.addColorStop(0, css(p.sandWet, 0));
    wg.addColorStop(0.1, css(p.sandWet, 0.92));
    wg.addColorStop(0.3, css(p.shallow, 0.95));
    wg.addColorStop(1, css(p.deep, 1));
    ctx.fillStyle = wg;
    ctx.fillRect(-20, b.sandToShallow - 60, WORLD.width + 40, WORLD.height);
    ctx.restore();

    // Open water: long horizontal streaks give the sea a surface even
    // before the animated foam rides over it.
    const sea = new Rng(WORLD.seed ^ 0x5ea0);
    for (let i = 0; i < 520; i++) {
      const y = sea.range(b.sandToShallow - 10, WORLD.height + 60);
      const x = sea.range(-140, WORLD.width + 140);
      if (y < top || y > y1 + 40) continue;
      const t = smoothstep(b.sandToShallow, WORLD.height, y);
      const c = mix(p.shallow, p.foam, sea.range(0.15, 0.75));
      stroke(ctx, x, y, sea.range(70, 240), sea.jitter(4), sea.range(2.4, 7), c,
        sea.range(0.07, 0.24) * (1 - t * 0.35));
    }
    // Sandbars showing through the shallows.
    const bar = new Rng(WORLD.seed ^ 0xba12);
    for (let i = 0; i < 26; i++) {
      const y = bar.range(b.sandToShallow + 10, b.shallowToDeep + 40);
      const x = bar.range(-80, WORLD.width + 80);
      if (y < top || y > y1) continue;
      blotch(ctx, x, y, bar.range(120, 280), bar.range(14, 34), p.sand, bar.range(0.06, 0.16));
    }
    // Deep-water shadow so the sea has a bottom, not just a colour.
    const dg = ctx.createLinearGradient(0, b.shallowToDeep, 0, WORLD.height);
    dg.addColorStop(0, css(p.deep, 0));
    dg.addColorStop(1, css(shade(p.deep, 0.58), 0.8));
    ctx.fillStyle = dg;
    ctx.fillRect(0, b.shallowToDeep, WORLD.width, WORLD.height - b.shallowToDeep);
  }

  private drawShell(ctx: Ctx2D, x: number, y: number, r0: number, r: Rng) {
    const c = r.pick([rgb(246, 228, 216), rgb(240, 206, 196), rgb(232, 224, 200)]);
    blotch(ctx, x, y + r0 * 0.24, r0 * 1.2, r0 * 0.5, rgb(90, 70, 40), 0.34);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r.range(-0.6, 0.6));
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.ellipse(0, 0, r0, r0 * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = css(shade(c, 0.7), 0.6);
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, r0 * 0.8);
      ctx.quadraticCurveTo(i * r0 * 0.35, 0, i * r0 * 0.55, -r0 * 0.8);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  private drawDriftwood(ctx: Ctx2D, x: number, y: number, len: number, r: Rng) {
    const c = rgb(184, 154, 114);
    const a = r.range(-0.55, 0.55);
    const w = len * r.range(0.11, 0.16);
    blotch(ctx, x, y + w * 0.6, len * 0.55, w * 0.9, rgb(90, 70, 40), 0.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = css(shade(c, 0.84));
    ctx.beginPath();
    ctx.roundRect(-len / 2, -w / 2, len, w, w / 2);
    ctx.fill();
    ctx.fillStyle = css(shade(c, 1.2), 0.8);
    ctx.beginPath();
    ctx.roundRect(-len / 2 + 4, -w / 2 + 1, len - 8, w * 0.34, w * 0.17);
    ctx.fill();
    ctx.strokeStyle = css(shade(c, 0.58), 0.5);
    ctx.lineWidth = 1.6;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-len / 2 + 8, i * w * 0.24);
      ctx.lineTo(len / 2 - 8, i * w * 0.24 + r.jitter(3));
      ctx.stroke();
    }
    // A broken stub or two: a plain capsule reads as a chocolate bar.
    for (let i = 0; i < 2; i++) {
      if (!r.bool(0.6)) continue;
      const bx = r.range(-len * 0.35, len * 0.35);
      const ba = r.range(-1.1, 1.1);
      const bl = len * r.range(0.16, 0.3);
      ctx.strokeStyle = css(shade(c, 0.9));
      ctx.lineCap = "round";
      ctx.lineWidth = w * 0.5;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + Math.cos(ba) * bl, Math.sin(ba) * bl - w * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A tangle of weed dropped by the tide. Cheap, and it breaks up a
      flat expanse of sand better than another shell would. */
  private drawSeaweed(ctx: Ctx2D, x: number, y: number, size: number, r: Rng) {
    const c = r.pick([rgb(74, 96, 58), rgb(96, 84, 46), rgb(62, 82, 70)]);
    blotch(ctx, x, y + 3, size * 0.7, size * 0.24, rgb(80, 64, 36), 0.34);
    ctx.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      let px = x + r.jitter(size * 0.3), py = y + r.jitter(size * 0.12);
      let ang = r.range(0, Math.PI * 2);
      ctx.strokeStyle = css(shade(c, r.range(0.8, 1.25)), r.range(0.5, 0.85));
      ctx.lineWidth = r.range(2.4, 4.4);
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let k = 0; k < 3; k++) {
        ang += r.jitter(1.3);
        px += Math.cos(ang) * size * 0.22;
        py += Math.sin(ang) * size * 0.1;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  /* ── the wilds pocket ─────────────────────────────────────── */

  /** A mood change, not a different tileset: colder, darker, with
      dead wood and pale mushrooms. Cheap way to say "danger here". */
  private paintWilds(ctx: Ctx2D, y0: number, y1: number) {
    const z = WORLD.zones.find((v) => v.id === "wilds");
    if (!z) return;
    const bnd = z.bounds;
    if (y1 < bnd.y - 220 || y0 > bnd.y + bnd.h + 220) return;
    const p = this.pal;
    const w = new Rng(WORLD.seed ^ 0x5711);

    for (let i = 0; i < 300; i++) {
      const x = w.range(bnd.x - 110, bnd.x + bnd.w + 40);
      const y = w.range(bnd.y - 110, bnd.y + bnd.h + 110);
      // Feather the pocket so it has no border, just a gradient of dread.
      const edge = Math.min(
        smoothstep(bnd.x - 120, bnd.x + 150, x),
        smoothstep(bnd.y - 120, bnd.y + 160, y),
        1 - smoothstep(bnd.y + bnd.h - 160, bnd.y + bnd.h + 110, y),
      );
      if (edge <= 0.02) continue;
      blotch(ctx, x, y, w.range(80, 220), w.range(44, 120),
        mix(p.forestDark, rgb(24, 30, 40), 0.6), w.range(0.06, 0.18) * edge);
    }
    for (let i = 0; i < 30; i++) {
      const sr = new Rng(WORLD.seed + 31000 + i * 419);
      const x = sr.range(bnd.x + 30, bnd.x + bnd.w - 30);
      const y = sr.range(bnd.y + 80, bnd.y + bnd.h - 70);
      if (y < y0 || y > y1) continue;
      const cap = sr.range(5, 9);
      blotch(ctx, x, y + 2, cap * 1.5, cap * 0.5, rgb(10, 14, 12), 0.4);
      ctx.strokeStyle = css(rgb(226, 220, 196), 0.85);
      ctx.lineWidth = cap * 0.42;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + sr.jitter(2), y - cap * 1.2);
      ctx.stroke();
      ctx.fillStyle = css(sr.pick([rgb(232, 226, 202), rgb(196, 208, 214), rgb(212, 176, 196)]), 0.92);
      ctx.beginPath();
      ctx.ellipse(x + sr.jitter(2), y - cap * 1.3, cap, cap * 0.62, 0, Math.PI, 0);
      ctx.fill();
    }
  }

  /* ── animated water ───────────────────────────────────────── */

  private buildSea() {
    const p = this.pal;
    const layers = this.quality === "low" ? 3 : this.quality === "mid" ? 5 : 7;
    const b = WORLD.bands;
    const seaTop = b.sandToShallow + 60;
    const seaH = WORLD.height - seaTop;

    // Swell lines drifting across the open sea.
    for (let i = 0; i < layers; i++) {
      const tex = foamTexture(p.foam, 1024, 64, i, 0.85 - i * 0.04);
      this.textures.push(tex);
      const t = new TilingSprite({ texture: tex, width: WORLD.width + 240, height: 64 });
      t.position.set(-120, seaTop + (i + 0.4) * (seaH / layers));
      t.tileScale.set(0.85 + i * 0.07);
      this.foam.push(t);
      this.foamPhase.push(i * 1.37);
      this.root.addChild(t);
    }

    // Shore break: three offset strips at the waterline, pulsing up
    // the sand. This is the motion the eye actually reads as "sea".
    for (let i = 0; i < 3; i++) {
      const tex = foamTexture(p.foam, 1024, 88, 90 + i, 1.15);
      this.textures.push(tex);
      const t = new TilingSprite({ texture: tex, width: WORLD.width + 240, height: 88 });
      t.position.set(-120, b.sandToShallow - 34 + i * 12);
      t.tileScale.set(1.15 - i * 0.16);
      this.shoreFoam.push(t);
      this.root.addChild(t);
    }
  }

  /** Only the water animates; the ground is baked. */
  update(t: number) {
    for (let i = 0; i < this.foam.length; i++) {
      const f = this.foam[i];
      const ph = this.foamPhase[i];
      f.tilePosition.x = Math.sin(t * (0.14 + i * 0.02) + ph) * 100 + t * (6 + i * 2);
      f.tilePosition.y = Math.sin(t * 0.5 + ph) * 6;
      f.alpha = 0.4 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.62 + ph));
    }
    for (let i = 0; i < this.shoreFoam.length; i++) {
      const s = this.shoreFoam[i];
      const ph = i * 1.7;
      // Surf runs up the beach then drains: squaring the sine makes
      // the rush fast and the retreat slow, which is what water does.
      const w = 0.5 + 0.5 * Math.sin(t * 0.74 + ph);
      const run = w * w;
      s.position.y = WORLD.bands.sandToShallow - 30 - run * 46 + i * 14;
      s.alpha = 0.3 + run * 0.62;
      s.tilePosition.x = Math.sin(t * 0.21 + ph) * 70;
    }
  }

  /** Skip chunk draw calls that cannot be on screen. */
  cull(viewTop: number, viewBottom: number) {
    for (const c of this.chunks) {
      const top = c.position.y;
      c.renderable = top + c.height > viewTop - 60 && top < viewBottom + 60;
    }
  }

  destroy() {
    this.root.destroy({ children: true });
    for (const t of this.textures) t.destroy(true);
    this.textures.length = 0;
    this.chunks.length = 0;
    this.foam.length = 0;
    this.shoreFoam.length = 0;
  }
}

/* ── helpers ─────────────────────────────────────────────────── */

/** Row overlap for the cliff courses, pulled out to keep the loop
    readable. Courses must overlap or the wall shows through. */
function r0jitter(r: Rng): number { return r.range(6, 16); }

function nextFrame(): Promise<void> {
  return new Promise((res) => requestAnimationFrame(() => res()));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`terrain: cannot load ${src}`));
    img.src = src;
  });
}

/** Read the painting's own colours. Everything procedural is derived
    from these, which is why the bands meet without a seam. */
function derivePalette(img: HTMLImageElement): Palette {
  const w = 96, h = 144;
  const { ctx } = makeCanvas(w, h, true);
  ctx.drawImage(img, 0, 0, w, h);

  const rock = sampleBand(ctx, w, h, 0.01, 0.075);
  const grass = sampleBand(ctx, w, h, 0.22, 0.66);
  const sand = sampleBand(ctx, w, h, 0.815, 0.858);
  const water = sampleBand(ctx, w, h, 0.945, 1.0);

  // The cliff average is muddy because it includes its own shadows.
  // Pulling saturation out and value up recovers the stone the artist
  // actually painted, which is what the shelf needs to match.
  const stone = shade(desaturate(rock, 0.42), 1.16);
  // Forest floor is derived from the meadow grass but pushed dark,
  // brown and desaturated. Left near the grass hue it reads as a lawn
  // with trees standing on it — the failure mode this guards against.
  const duff = desaturate(grass, 0.5);

  return {
    rock,
    stone,
    stoneLit: shade(stone, 1.26),
    stoneDark: shade(desaturate(rock, 0.25), 0.46),
    lichen: mix(desaturate(grass, 0.4), rgb(168, 176, 120), 0.6),
    soil: mix(shade(rock, 0.74), rgb(92, 64, 36), 0.62),
    forest: mix(duff, rgb(46, 58, 28), 0.78),
    forestDark: mix(duff, rgb(26, 34, 20), 0.9),
    moss: mix(duff, rgb(70, 98, 40), 0.72),
    grass,
    grassLit: shade(grass, 1.1),
    sand,
    sandWet: mix(sand, water, 0.45),
    shallow: mix(water, rgb(120, 220, 214), 0.35),
    deep: shade(water, 0.62),
    foam: rgb(240, 252, 252),
  };
}

/** Horizontally seamless foam strip. Built from summed sines so the
    left and right edges match exactly — required for TilingSprite. */
function foamTexture(color: Rgb, w: number, h: number, seed: number, strength: number): Texture {
  const { cv, ctx } = makeCanvas(w, h);
  const r = new Rng(1000 + seed * 77);
  const phases = [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)];
  const amps = [h * 0.17, h * 0.1, h * 0.055];
  const freqs = [2, 5, 9];

  const lineAt = (x: number) => {
    let y = h * 0.5;
    for (let i = 0; i < 3; i++) {
      y += Math.sin((x / w) * Math.PI * 2 * freqs[i] + phases[i]) * amps[i];
    }
    return y;
  };

  for (let pass = 0; pass < 3; pass++) {
    const off = (pass - 1) * h * 0.15;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = lineAt(x) + off;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = css(color, Math.min(1, strength * (0.6 - pass * 0.13)));
    ctx.lineWidth = h * (0.22 - pass * 0.045);
    ctx.lineCap = "butt";
    ctx.stroke();
  }
  // Speckle so the crest is broken rather than a ribbon.
  for (let i = 0; i < 420; i++) {
    const x = r.range(0, w);
    const y = lineAt(x) + r.jitter(h * 0.24);
    ctx.fillStyle = css(color, Math.min(1, r.range(0.15, strength)));
    ctx.beginPath();
    ctx.arc(x, y, r.range(0.9, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Feather top and bottom so strips blend into open water.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.5, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  return Texture.from(cv);
}
