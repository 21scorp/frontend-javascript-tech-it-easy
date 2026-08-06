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

   Everything static is baked into chunk textures (one draw call
   each, culled when off screen). Only the sea moves at runtime.
   ═══════════════════════════════════════════════════════════════ */

import { Container, Sprite, Texture, TilingSprite } from "pixi.js";
import type { QualityTier } from "../core/contracts";
import { WORLD, ISLAND } from "./worldmap";
import { Rng, smoothstep } from "./rng";
import {
  makeCanvas, blotch, stroke, organicPath, grain, sampleBand, mix, shade, css, rgb,
} from "./paint";
import type { Ctx2D, Rgb } from "./paint";

/** Texture pixels per design unit. Below 1 on purpose: the softness
    reads as brushwork, and it keeps four chunk textures inside the
    2048px limit that the oldest mobile GPUs still enforce. */
const RES: Record<QualityTier, number> = { low: 0.5, mid: 0.75, high: 0.9 };
const CHUNK_H = 1050;
/** Bake margin so props straddling a chunk edge are drawn into both. */
const BLEED = 200;

interface Palette {
  rock: Rgb; rockLit: Rgb; rockDark: Rgb;
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

    // Chunks first (back), then the painting, then live water.
    const chunkCount = Math.ceil(WORLD.height / CHUNK_H);
    for (let i = 0; i < chunkCount; i++) {
      const top = i * CHUNK_H;
      const h = Math.min(CHUNK_H, WORLD.height - top);
      const sprite = this.bakeChunk(top, h);
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

  private bakeChunk(top: number, h: number): Sprite {
    const { cv, ctx } = makeCanvas(WORLD.width * this.res, h * this.res);
    // Draw in world units; the transform carries the chunk offset so
    // every band gradient and scatter is a pure function of world y.
    ctx.setTransform(this.res, 0, 0, this.res, 0, -top * this.res);

    const y0 = top - BLEED;
    const y1 = top + h + BLEED;

    this.paintBase(ctx, top, h);
    this.paintMountain(ctx, y0, y1);
    this.paintForest(ctx, y0, y1);
    this.paintMeadow(ctx, y0, y1);
    this.paintShore(ctx, y0, y1);
    this.paintWilds(ctx, y0, y1);
    // Grain last so it unifies every band under one paper texture.
    grain(ctx, 0, top, WORLD.width, h, 0.13, 1 / this.res);

    const tex = Texture.from(cv);
    this.textures.push(tex);
    const s = new Sprite(tex);
    s.width = WORLD.width;
    s.height = h;
    s.position.set(0, top);
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

    at(0, p.rockDark);
    at(150, shade(p.rock, 0.86));
    at(360, p.rock);
    at(b.rockToScree, shade(p.rock, 0.94));
    at(880, mix(p.rock, p.soil, 0.62));
    at(b.screeToForest, mix(p.soil, p.forestDark, 0.7));
    at(1260, p.forestDark);
    at(1700, p.forest);
    at(2050, mix(p.forest, p.grass, 0.34));
    at(b.forestToMeadow, mix(p.forest, p.grass, 0.62));
    at(2520, p.grass);
    at(3150, p.grassLit);
    at(b.meadowToSand, mix(p.grass, p.sand, 0.55));
    at(3520, p.sand);
    at(3790, shade(p.sand, 0.97));
    at(b.sandToShallow, p.sandWet);
    at(3930, p.shallow);
    at(b.shallowToDeep, mix(p.shallow, p.deep, 0.55));
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
      const c = r.bool(0.5) ? shade(base, r.range(1.02, 1.12)) : shade(base, r.range(0.86, 0.97));
      blotch(ctx, x, y, r.range(90, 300), r.range(50, 160), c, r.range(0.05, 0.14));
    }
  }

  /** Approximate ground colour at a world y — used to keep scatter
      tints inside the local band instead of a global average. */
  private groundAt(y: number): Rgb {
    const p = this.pal;
    const b = WORLD.bands;
    if (y < b.rockToScree) return p.rock;
    if (y < b.screeToForest) return mix(p.rock, p.soil, smoothstep(b.rockToScree, b.screeToForest, y));
    if (y < b.forestToMeadow) return mix(p.forestDark, p.forest, smoothstep(b.screeToForest, 1800, y));
    if (y < b.meadowToSand) return p.grass;
    if (y < b.sandToShallow) return p.sand;
    if (y < b.shallowToDeep) return p.shallow;
    return p.deep;
  }

  /* ── mountain: cliff wall, then a cracked stone plateau ───── */

  private paintMountain(ctx: Ctx2D, y0: number, y1: number) {
    const p = this.pal;
    const b = WORLD.bands;
    if (y0 > b.screeToForest) return;
    const wallH = WORLD.obstacles.cliffTop + 78;

    // North wall — the impassable top edge, blocky like the painting.
    if (y0 < wallH + 60) {
      let rowY = -30;
      let row = 0;
      while (rowY < wallH) {
        const rh = 46 + ((row * 37) % 22);
        let x = -40 - ((row * 53) % 70);
        let col = 0;
        while (x < WORLD.width + 40) {
          const r = new Rng(WORLD.seed + row * 977 + col * 31 + 5);
          const w = r.range(74, 132);
          const depth = 1 - rowY / (wallH + 40);
          const face = shade(mix(p.rock, p.rockDark, depth * 0.45), r.range(0.9, 1.12));
          // One path, reused for fill / clip / stroke: re-rolling it
          // would desync the outline from the block it outlines.
          organicPath(ctx, x + w / 2, rowY + rh / 2, w / 2, rh / 2, r, 0.1, 8);
          ctx.fillStyle = css(face);
          ctx.fill();
          // Lit top bevel + shadowed underside give the blocks mass.
          ctx.save();
          ctx.clip();
          ctx.fillStyle = css(shade(face, 1.16), 0.55);
          ctx.fillRect(x, rowY, w, rh * 0.3);
          ctx.fillStyle = css(p.rockDark, 0.42);
          ctx.fillRect(x, rowY + rh * 0.74, w, rh * 0.3);
          ctx.restore();
          ctx.strokeStyle = css(shade(p.rockDark, 0.7), 0.55);
          ctx.lineWidth = 2.4;
          ctx.stroke();
          x += w - r.range(4, 12);
          col++;
        }
        rowY += rh - 8;
        row++;
      }
      // Grass fringe where the wall meets walkable ground.
      const fr = new Rng(WORLD.seed ^ 0x9a1);
      for (let i = 0; i < 260; i++) {
        const x = fr.range(-20, WORLD.width + 20);
        const y = wallH + fr.range(-22, 16);
        stroke(ctx, x, y, fr.jitter(6), -fr.range(8, 20), fr.range(2, 3.6),
          mix(p.moss, p.grass, fr.next()), fr.range(0.4, 0.85));
      }
    }

    // Plateau: cracked flagstone, gravel, moss, boulders.
    const top = Math.max(y0, wallH - 40);
    const bot = Math.min(y1, b.screeToForest + 60);
    if (bot <= top) return;

    const cracks = new Rng(WORLD.seed ^ 0x2c0de);
    for (let i = 0; i < 520; i++) {
      const x = cracks.range(-40, WORLD.width + 40);
      const y = cracks.range(wallH - 60, b.screeToForest + 80);
      const len = cracks.range(30, 130);
      const ang = cracks.range(-0.6, 0.6) + (cracks.bool(0.5) ? 0 : Math.PI / 2);
      if (y < top - 40 || y > bot + 40) continue;
      const fade = 1 - smoothstep(b.rockToScree, b.screeToForest, y);
      stroke(ctx, x, y, Math.cos(ang) * len, Math.sin(ang) * len, cracks.range(1.6, 3.4),
        shade(p.rockDark, 0.75), 0.22 * fade + 0.05);
    }

    const gravel = new Rng(WORLD.seed ^ 0x6b17);
    for (let i = 0; i < 900; i++) {
      const x = gravel.range(-20, WORLD.width + 20);
      const y = gravel.range(wallH - 40, b.screeToForest + 140);
      const rr = gravel.range(2, 7);
      if (y < top - 20 || y > bot + 40) continue;
      const lit = gravel.bool(0.55);
      ctx.fillStyle = css(shade(p.rock, lit ? gravel.range(1.1, 1.3) : gravel.range(0.62, 0.8)),
        gravel.range(0.3, 0.75));
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.72, gravel.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }

    // Boulders read as depth cues and hide the flatness of a plateau.
    for (let i = 0; i < 22; i++) {
      const r = new Rng(WORLD.seed + 4400 + i * 131);
      const x = r.range(40, WORLD.width - 40);
      const y = r.range(wallH + 30, b.rockToScree + 190);
      if (y < top - 90 || y > bot + 90) continue;
      this.drawBoulder(ctx, x, y, r.range(26, 62), r);
    }

    // Moss creeping up from the forest — pre-selling the next band.
    const m = new Rng(WORLD.seed ^ 0x4055);
    for (let i = 0; i < 240; i++) {
      const y = m.range(b.rockToScree - 120, b.screeToForest + 120);
      const x = m.range(-40, WORLD.width + 40);
      if (y < top - 60 || y > bot + 60) continue;
      const t = smoothstep(b.rockToScree - 120, b.screeToForest, y);
      blotch(ctx, x, y, m.range(30, 90), m.range(16, 44), p.moss, 0.05 + t * 0.3);
    }
  }

  private drawBoulder(ctx: Ctx2D, x: number, y: number, r0: number, r: Rng) {
    const p = this.pal;
    // Contact shadow first — a rock without one floats.
    blotch(ctx, x, y + r0 * 0.28, r0 * 1.25, r0 * 0.5, rgb(24, 20, 16), 0.34);
    const body = shade(p.rock, r.range(0.86, 1.06));
    organicPath(ctx, x, y - r0 * 0.18, r0, r0 * 0.78, r, 0.18, 9);
    const g = ctx.createLinearGradient(0, y - r0, 0, y + r0 * 0.6);
    g.addColorStop(0, css(shade(body, 1.24)));
    g.addColorStop(0.55, css(body));
    g.addColorStop(1, css(shade(body, 0.66)));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = css(shade(p.rockDark, 0.72), 0.5);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // A couple of facet lines sell "carved by hand" over "blobby".
    for (let i = 0; i < 3; i++) {
      stroke(ctx, x + r.jitter(r0 * 0.6), y - r0 * 0.5 + r.jitter(r0 * 0.3),
        r.jitter(r0 * 0.8), r.range(r0 * 0.3, r0 * 0.7), 1.8, shade(p.rockDark, 0.8), 0.3);
    }
    if (r.bool(0.5)) blotch(ctx, x + r.jitter(r0 * 0.5), y - r0 * 0.6, r0 * 0.5, r0 * 0.22, p.moss, 0.4);
  }

  /* ── forest floor ─────────────────────────────────────────── */

  private paintForest(ctx: Ctx2D, y0: number, y1: number) {
    const p = this.pal;
    const b = WORLD.bands;
    const top = Math.max(y0, b.rockToScree);
    const bot = Math.min(y1, b.forestToMeadow + 260);
    if (bot <= top) return;

    // Humus mottling.
    const h = new Rng(WORLD.seed ^ 0x1eaf);
    for (let i = 0; i < 700; i++) {
      const y = h.range(b.rockToScree, b.forestToMeadow + 300);
      const x = h.range(-80, WORLD.width + 80);
      if (y < top - 80 || y > bot + 80) continue;
      const t = smoothstep(b.screeToForest, 1500, y);
      const c = h.bool(0.5)
        ? mix(p.forestDark, p.moss, h.range(0.2, 0.8))
        : mix(p.soil, p.forest, h.range(0, 0.7));
      blotch(ctx, x, y, h.range(40, 150), h.range(22, 70), c, (0.06 + h.next() * 0.16) * (0.35 + t * 0.65));
    }

    // Leaf litter — short strokes, warm on cool, is what makes a
    // brown gradient read as a forest floor.
    const l = new Rng(WORLD.seed ^ 0x7ea7);
    const litter = this.quality === "low" ? 1400 : 2600;
    for (let i = 0; i < litter; i++) {
      const y = l.range(b.screeToForest - 120, b.forestToMeadow + 220);
      const x = l.range(-30, WORLD.width + 30);
      const a = l.range(0, Math.PI);
      const len = l.range(6, 16);
      if (y < top - 30 || y > bot + 30) continue;
      const warm = l.bool(0.42);
      const c = warm
        ? mix(p.soil, rgb(196, 128, 52), l.range(0.2, 0.9))
        : mix(p.forest, p.moss, l.range(0, 1));
      stroke(ctx, x, y, Math.cos(a) * len, Math.sin(a) * len * 0.5, l.range(2, 4.2), c, l.range(0.16, 0.5));
    }

    // Roots crossing the ground.
    for (let i = 0; i < 46; i++) {
      const r = new Rng(WORLD.seed + 9100 + i * 197);
      const y = r.range(b.screeToForest, b.forestToMeadow + 120);
      if (y < top - 120 || y > bot + 120) continue;
      const x = r.range(-60, WORLD.width + 60);
      let px = x, py = y;
      const dir = r.range(0, Math.PI * 2);
      for (let s = 0; s < 5; s++) {
        const len = r.range(30, 70);
        const a = dir + r.jitter(0.7);
        const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len * 0.55;
        stroke(ctx, px, py, nx - px, ny - py, r.range(4, 8), shade(p.soil, 0.72), 0.4);
        stroke(ctx, px, py - 2, nx - px, ny - py, r.range(1.4, 3), shade(p.soil, 1.25), 0.22);
        px = nx; py = ny;
      }
    }

    // Ferns and grass tufts.
    const fernCount = this.quality === "low" ? 90 : 190;
    for (let i = 0; i < fernCount; i++) {
      const r = new Rng(WORLD.seed + 12000 + i * 313);
      const y = r.range(b.screeToForest + 40, b.forestToMeadow + 200);
      if (y < top - 60 || y > bot + 60) continue;
      const x = r.range(10, WORLD.width - 10);
      const size = r.range(14, 30);
      const c = mix(p.moss, p.grass, r.range(0.1, 0.85));
      blotch(ctx, x, y + size * 0.15, size * 1.1, size * 0.4, rgb(18, 26, 14), 0.25);
      const blades = r.int(6, 11);
      for (let bl = 0; bl < blades; bl++) {
        const a = -Math.PI / 2 + ((bl / (blades - 1)) - 0.5) * 2.2 + r.jitter(0.14);
        const len = size * r.range(0.7, 1.25);
        stroke(ctx, x, y, Math.cos(a) * len, Math.sin(a) * len, r.range(2.2, 3.6),
          shade(c, r.range(0.85, 1.2)), r.range(0.5, 0.9));
      }
    }

    // Soft light shafts breaking the canopy — cheap, high impact.
    if (this.quality !== "low") {
      const sh = new Rng(WORLD.seed ^ 0x5417);
      for (let i = 0; i < 16; i++) {
        const y = sh.range(b.screeToForest, b.forestToMeadow);
        if (y < top - 200 || y > bot + 200) continue;
        blotch(ctx, sh.range(0, WORLD.width), y, sh.range(90, 190), sh.range(120, 260),
          rgb(255, 244, 190), sh.range(0.05, 0.11));
      }
    }
  }

  /* ── meadow fringe (the art covers the middle) ───────────── */

  private paintMeadow(ctx: Ctx2D, y0: number, y1: number) {
    const p = this.pal;
    const b = WORLD.bands;
    const top = Math.max(y0, b.forestToMeadow - 200);
    const bot = Math.min(y1, b.meadowToSand + 200);
    if (bot <= top) return;

    // Grass strokes across the blend zone; they cross the island's
    // feathered edge in both directions so the eye finds no line.
    const g = new Rng(WORLD.seed ^ 0x6a55);
    const count = this.quality === "low" ? 1600 : 3200;
    for (let i = 0; i < count; i++) {
      const y = g.range(b.forestToMeadow - 220, b.meadowToSand + 160);
      const x = g.range(-20, WORLD.width + 20);
      if (y < top - 30 || y > bot + 30) continue;
      const t = smoothstep(b.forestToMeadow - 200, b.forestToMeadow + 320, y);
      const c = mix(mix(p.forest, p.moss, g.next()), mix(p.grass, p.grassLit, g.next()), t);
      const len = g.range(9, 20);
      stroke(ctx, x, y, g.jitter(5), -len, g.range(2, 3.8), c, g.range(0.22, 0.62));
    }

    // A few flowers so the fringe matches the painted meadow.
    const f = new Rng(WORLD.seed ^ 0xf10a);
    for (let i = 0; i < 220; i++) {
      const y = f.range(b.forestToMeadow - 60, b.forestToMeadow + 300);
      const x = f.range(0, WORLD.width);
      if (y < top || y > bot) continue;
      const c = f.pick([rgb(248, 240, 214), rgb(244, 196, 214), rgb(250, 228, 128), rgb(206, 214, 246)]);
      ctx.fillStyle = css(c, f.range(0.6, 0.95));
      ctx.beginPath();
      ctx.arc(x, y, f.range(2, 3.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── beach and open sea ───────────────────────────────────── */

  private paintShore(ctx: Ctx2D, y0: number, y1: number) {
    const p = this.pal;
    const b = WORLD.bands;
    const top = Math.max(y0, ISLAND.sandY - 200);
    if (y1 <= top) return;

    // Dry sand: tonal pools + pebbles, matched to the painting's sand
    // because that is where the island's bottom feather lands.
    const s = new Rng(WORLD.seed ^ 0x5a4d);
    for (let i = 0; i < 420; i++) {
      const y = s.range(ISLAND.sandY - 120, b.sandToShallow + 40);
      const x = s.range(-60, WORLD.width + 60);
      if (y < top - 60 || y > y1 + 60) continue;
      blotch(ctx, x, y, s.range(50, 190), s.range(18, 60),
        shade(p.sand, s.bool(0.5) ? s.range(1.03, 1.1) : s.range(0.9, 0.98)), s.range(0.08, 0.2));
    }
    const peb = new Rng(WORLD.seed ^ 0x9eb1);
    for (let i = 0; i < 340; i++) {
      const y = peb.range(ISLAND.sandY - 40, b.sandToShallow);
      const x = peb.range(0, WORLD.width);
      if (y < top || y > y1) continue;
      const rr = peb.range(1.6, 4.4);
      ctx.fillStyle = css(shade(p.sand, peb.range(0.6, 0.82)), peb.range(0.3, 0.6));
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shells and driftwood, echoing the painting's own beach props.
    for (let i = 0; i < 26; i++) {
      const r = new Rng(WORLD.seed + 21000 + i * 271);
      const y = r.range(ISLAND.sandY + 20, b.sandToShallow - 20);
      const x = r.range(40, WORLD.width - 40);
      if (y < top || y > y1) continue;
      if (r.bool(0.7)) this.drawShell(ctx, x, y, r.range(6, 11), r);
      else this.drawDriftwood(ctx, x, y, r.range(26, 46), r);
    }

    // Wet sand: an irregular waterline, darker and slightly glossy.
    const w = new Rng(WORLD.seed ^ 0x111e);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-20, WORLD.height + 40);
    ctx.lineTo(-20, b.sandToShallow);
    for (let x = -20; x <= WORLD.width + 20; x += 26) {
      const wob = Math.sin(x * 0.0121) * 13 + Math.sin(x * 0.0337 + 2.1) * 8 + w.jitter(3);
      ctx.lineTo(x, b.sandToShallow + wob);
    }
    ctx.lineTo(WORLD.width + 20, WORLD.height + 40);
    ctx.closePath();
    ctx.clip();
    const wg = ctx.createLinearGradient(0, b.sandToShallow - 40, 0, WORLD.height);
    wg.addColorStop(0, css(p.sandWet, 0.0));
    wg.addColorStop(0.12, css(p.sandWet, 0.9));
    wg.addColorStop(0.42, css(p.shallow, 0.95));
    wg.addColorStop(1, css(p.deep, 1));
    ctx.fillStyle = wg;
    ctx.fillRect(-20, b.sandToShallow - 60, WORLD.width + 40, WORLD.height);
    ctx.restore();

    // Open water: long horizontal streaks give the sea a surface
    // even before the animated foam rides over it.
    const sea = new Rng(WORLD.seed ^ 0x5ea0);
    for (let i = 0; i < 340; i++) {
      const y = sea.range(b.sandToShallow, WORLD.height + 60);
      const x = sea.range(-100, WORLD.width + 100);
      if (y < top || y > y1 + 40) continue;
      const t = smoothstep(b.sandToShallow, WORLD.height, y);
      const c = mix(p.shallow, p.foam, sea.range(0.1, 0.6));
      stroke(ctx, x, y, sea.range(50, 190), sea.jitter(3), sea.range(2, 5.5), c,
        sea.range(0.05, 0.2) * (1 - t * 0.4));
    }
    // Deep-water shadow so the sea has a bottom, not just a colour.
    const dg = ctx.createLinearGradient(0, b.shallowToDeep, 0, WORLD.height);
    dg.addColorStop(0, css(p.deep, 0));
    dg.addColorStop(1, css(shade(p.deep, 0.62), 0.75));
    ctx.fillStyle = dg;
    ctx.fillRect(0, b.shallowToDeep, WORLD.width, WORLD.height - b.shallowToDeep);
  }

  private drawShell(ctx: Ctx2D, x: number, y: number, r0: number, r: Rng) {
    const c = r.pick([rgb(246, 228, 216), rgb(240, 206, 196), rgb(232, 224, 200)]);
    blotch(ctx, x, y + r0 * 0.2, r0 * 1.1, r0 * 0.45, rgb(90, 70, 40), 0.3);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r.range(-0.6, 0.6));
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.ellipse(0, 0, r0, r0 * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = css(shade(c, 0.72), 0.6);
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, r0 * 0.7);
      ctx.quadraticCurveTo(i * r0 * 0.35, 0, i * r0 * 0.5, -r0 * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDriftwood(ctx: Ctx2D, x: number, y: number, len: number, r: Rng) {
    const c = rgb(178, 142, 96);
    const a = r.range(-0.5, 0.5);
    blotch(ctx, x, y + 4, len * 0.6, 6, rgb(90, 70, 40), 0.32);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = css(shade(c, 0.9));
    ctx.beginPath();
    ctx.roundRect(-len / 2, -5, len, 10, 5);
    ctx.fill();
    ctx.fillStyle = css(shade(c, 1.2), 0.7);
    ctx.beginPath();
    ctx.roundRect(-len / 2, -5, len, 4, 3);
    ctx.fill();
    ctx.restore();
  }

  /* ── the wilds pocket ─────────────────────────────────────── */

  /** A mood change, not a different tileset: colder, darker, with
      dead wood and pale mushrooms. Cheap way to say "danger here". */
  private paintWilds(ctx: Ctx2D, y0: number, y1: number) {
    const z = WORLD.zones.find((v) => v.id === "wilds");
    if (!z) return;
    const bnd = z.bounds;
    if (y1 < bnd.y - 200 || y0 > bnd.y + bnd.h + 200) return;
    const p = this.pal;
    const w = new Rng(WORLD.seed ^ 0x5711);

    for (let i = 0; i < 260; i++) {
      const x = w.range(bnd.x - 90, bnd.x + bnd.w + 40);
      const y = w.range(bnd.y - 90, bnd.y + bnd.h + 90);
      // Feather the pocket so it has no border, just a gradient of dread.
      const edge = Math.min(
        smoothstep(bnd.x - 100, bnd.x + 130, x),
        smoothstep(bnd.y - 100, bnd.y + 140, y),
        1 - smoothstep(bnd.y + bnd.h - 140, bnd.y + bnd.h + 100, y),
      );
      if (edge <= 0.02) continue;
      blotch(ctx, x, y, w.range(70, 200), w.range(40, 110),
        mix(p.forestDark, rgb(26, 32, 40), 0.55), w.range(0.05, 0.16) * edge);
    }
    for (let i = 0; i < 34; i++) {
      const sr = new Rng(WORLD.seed + 31000 + i * 419);
      const x = sr.range(bnd.x + 20, bnd.x + bnd.w - 20);
      const y = sr.range(bnd.y + 60, bnd.y + bnd.h - 40);
      if (y < y0 || y > y1) continue;
      const cap = sr.range(4, 8);
      blotch(ctx, x, y + 2, cap * 1.4, cap * 0.5, rgb(10, 14, 12), 0.35);
      ctx.strokeStyle = css(rgb(226, 220, 196), 0.85);
      ctx.lineWidth = cap * 0.4;
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
    const layers = this.quality === "low" ? 2 : this.quality === "mid" ? 4 : 6;
    const b = WORLD.bands;

    // Swell lines drifting across the open sea.
    for (let i = 0; i < layers; i++) {
      const tex = foamTexture(p.foam, 1024, 56, i, 0.55 - i * 0.06);
      this.textures.push(tex);
      const t = new TilingSprite({ texture: tex, width: WORLD.width + 200, height: 56 });
      t.position.set(-100, b.sandToShallow + 46 + i * ((WORLD.height - b.sandToShallow - 60) / layers));
      t.tileScale.set(0.9 + i * 0.08);
      t.alpha = 0.34 + i * 0.05;
      this.foam.push(t);
      this.foamPhase.push(i * 1.37);
      this.root.addChild(t);
    }

    // Shore break: two offset strips at the waterline, pulsing up the
    // sand. Two is enough to read as surf and costs nothing.
    for (let i = 0; i < 2; i++) {
      const tex = foamTexture(p.foam, 1024, 72, 90 + i, 0.9);
      this.textures.push(tex);
      const t = new TilingSprite({ texture: tex, width: WORLD.width + 200, height: 72 });
      t.position.set(-100, b.sandToShallow - 30 + i * 10);
      t.tileScale.set(1.05 - i * 0.15);
      t.alpha = 0.75;
      this.shoreFoam.push(t);
      this.root.addChild(t);
    }
  }

  /** Only the water animates; the ground is baked. */
  update(t: number) {
    for (let i = 0; i < this.foam.length; i++) {
      const f = this.foam[i];
      const ph = this.foamPhase[i];
      f.tilePosition.x = Math.sin(t * (0.14 + i * 0.02) + ph) * 90 + t * (5 + i * 2);
      f.tilePosition.y = Math.sin(t * 0.5 + ph) * 5;
      f.alpha = 0.26 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.62 + ph));
    }
    for (let i = 0; i < this.shoreFoam.length; i++) {
      const s = this.shoreFoam[i];
      const ph = i * 1.9;
      // Surf runs up the beach then drains: asymmetric ease reads far
      // more like water than a plain sine.
      const w = 0.5 + 0.5 * Math.sin(t * 0.78 + ph);
      const run = w * w;
      s.position.y = WORLD.bands.sandToShallow - 26 - run * 30 + i * 12;
      s.alpha = 0.35 + run * 0.5;
      s.tilePosition.x = Math.sin(t * 0.21 + ph) * 60;
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

  return {
    rock,
    rockLit: shade(rock, 1.2),
    rockDark: shade(rock, 0.5),
    soil: mix(shade(rock, 0.78), rgb(104, 72, 40), 0.62),
    forest: mix(grass, rgb(58, 74, 34), 0.66),
    forestDark: mix(grass, rgb(38, 46, 26), 0.82),
    moss: mix(grass, rgb(96, 132, 52), 0.55),
    grass,
    grassLit: shade(grass, 1.1),
    sand,
    sandWet: mix(sand, water, 0.42),
    shallow: mix(water, rgb(120, 220, 214), 0.35),
    deep: shade(water, 0.66),
    foam: rgb(238, 250, 250),
  };
}

/** Horizontally seamless foam strip. Built from summed sines so the
    left and right edges match exactly — required for TilingSprite. */
function foamTexture(color: Rgb, w: number, h: number, seed: number, strength: number): Texture {
  const { cv, ctx } = makeCanvas(w, h);
  const r = new Rng(1000 + seed * 77);
  const phases = [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)];
  const amps = [h * 0.16, h * 0.1, h * 0.06];
  const freqs = [2, 5, 9];

  const lineAt = (x: number) => {
    let y = h * 0.5;
    for (let i = 0; i < 3; i++) {
      y += Math.sin((x / w) * Math.PI * 2 * freqs[i] + phases[i]) * amps[i];
    }
    return y;
  };

  for (let pass = 0; pass < 3; pass++) {
    const off = (pass - 1) * h * 0.17;
    const thick = h * (0.2 - pass * 0.04);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = lineAt(x) + off;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = css(color, strength * (0.5 - pass * 0.12));
    ctx.lineWidth = thick;
    ctx.lineCap = "butt";
    ctx.stroke();
  }
  // Speckle so the crest is broken rather than a ribbon.
  for (let i = 0; i < 260; i++) {
    const x = r.range(0, w);
    const y = lineAt(x) + r.jitter(h * 0.22);
    ctx.fillStyle = css(color, r.range(0.1, strength));
    ctx.beginPath();
    ctx.arc(x, y, r.range(0.8, 2.6), 0, Math.PI * 2);
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
