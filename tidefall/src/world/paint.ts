/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/paint.ts
   A tiny 2D painting toolkit. Terrain bands, rocks and props are
   all built from the same few strokes so they share a hand.

   WHY canvas and not Pixi Graphics: the painted look comes from
   soft radial blotches, overlay grain and hundreds of tiny strokes.
   Doing that with Graphics would mean thousands of live display
   objects; baking it into a texture once costs one draw call
   forever after. Graphics stays for things that must animate.
   ═══════════════════════════════════════════════════════════════ */

import { Rng, fbm } from "./rng";

export type Ctx2D = CanvasRenderingContext2D;
export interface Rgb { r: number; g: number; b: number }

export const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

export function css({ r, g, b }: Rgb, a = 1): string {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** Pull a colour toward its own luminance. Averaging a photographed
    or painted surface always over-saturates the shadows into it;
    desaturating recovers the material colour underneath. */
export function desaturate(c: Rgb, amount: number): Rgb {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return mix(c, rgb(l, l, l), amount);
}

/** Multiply-ish shade / tint. Keeps hue, moves value. */
export function shade(c: Rgb, k: number): Rgb {
  return k <= 1
    ? { r: c.r * k, g: c.g * k, b: c.b * k }
    : mix(c, rgb(255, 255, 255), Math.min(1, k - 1));
}

export function toHex(c: Rgb): number {
  return ((c.r & 255) << 16) | ((c.g & 255) << 8) | (c.b & 255);
}

/** Create a 2D canvas. `willReadFrequently` only where we sample. */
export function makeCanvas(w: number, h: number, readback = false) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const ctx = cv.getContext("2d", { willReadFrequently: readback }) as Ctx2D;
  return { cv, ctx };
}

/* ── strokes ─────────────────────────────────────────────────── */

/** Soft blotch. The backbone of the painted look: dozens of these in
    neighbouring hues read as brushwork rather than a flat fill. */
export function blotch(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, c: Rgb, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 1);
  g.addColorStop(0, css(c, a));
  g.addColorStop(0.55, css(c, a * 0.55));
  g.addColorStop(1, css(c, 0));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Short tapered stroke — grass blades, leaf litter, water streaks. */
export function stroke(
  ctx: Ctx2D, x: number, y: number, dx: number, dy: number, w: number, c: Rgb, a: number,
) {
  ctx.strokeStyle = css(c, a);
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dx * 0.5 - dy * 0.18, y + dy * 0.5 + dx * 0.18, x + dx, y + dy);
  ctx.stroke();
}

/** Irregular closed blob — rock faces, moss patches, sand pools. */
export function organicPath(
  ctx: Ctx2D, x: number, y: number, rx: number, ry: number, rng: Rng, wobble = 0.26, points = 9,
) {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 + rng.jitter(wobble);
    const px = x + Math.cos(a) * rx * k;
    const py = y + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The same silhouette as a flat [x,y,…] list. Anything that has to
    be filled AND clipped AND stroked must reuse one point list — a
    second call to organicPath re-rolls the rng and the outline stops
    matching the shape it is supposed to outline. */
export function organicPoints(
  x: number, y: number, rx: number, ry: number, rng: Rng, wobble = 0.26, points = 9,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 + rng.jitter(wobble);
    out.push(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k);
  }
  return out;
}

export function tracePoints(ctx: Ctx2D, pts: number[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    if (i === 0) ctx.moveTo(pts[0], pts[1]);
    else ctx.lineTo(pts[i], pts[i + 1]);
  }
  ctx.closePath();
}

/* ── grain ───────────────────────────────────────────────────── */

let grainTile: HTMLCanvasElement | null = null;

/** One 128px fbm tile, generated once and reused everywhere. Drawn
    with 'overlay' it breaks up every flat gradient in the game for
    ~0.3ms of setup. */
export function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const size = 128;
  const { cv, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sampled on a torus so the tile repeats without a hard edge.
      const n = fbm(7717, x / 11, y / 11, 3) * 0.6 + fbm(4421, x / 3.5, y / 3.5, 2) * 0.4;
      const v = Math.round(90 + n * 130);
      const i = (y * size + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  grainTile = cv;
  return cv;
}

/** Overlay grain across a rect in canvas space. */
export function grain(ctx: Ctx2D, x: number, y: number, w: number, h: number, alpha: number, scale = 1) {
  const tile = getGrainTile();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  const pat = ctx.createPattern(tile, "repeat");
  if (pat) {
    // Pattern space is canvas space; scaling the matrix keeps the tile
    // aligned to the world so chunk seams stay invisible.
    const m = new DOMMatrix();
    m.a = scale; m.d = scale;
    (pat as CanvasPattern).setTransform?.(m);
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/* ── palette sampling ────────────────────────────────────────── */

/** Average a horizontal slice of an image. We sample the painted
    island rather than hard-coding colours so the procedural bands
    above and below it start from the artist's exact palette — the
    single most effective trick for hiding the seam. */
export function sampleBand(
  ctx: Ctx2D, w: number, h: number, v0: number, v1: number,
): Rgb {
  const y0 = Math.max(0, Math.floor(v0 * h));
  const y1 = Math.min(h, Math.ceil(v1 * h));
  const data = ctx.getImageData(0, y0, w, Math.max(1, y1 - y0)).data;
  let r = 0, g = 0, b = 0, n = 0;
  // Step in 4px strides: we want a colour, not a census.
  for (let i = 0; i < data.length; i += 16) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return n ? rgb(r / n, g / n, b / n) : rgb(128, 128, 128);
}
