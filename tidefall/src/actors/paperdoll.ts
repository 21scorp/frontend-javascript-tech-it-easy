/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/paperdoll.ts
   THE DRESSED CHARACTER. A real layer pipeline (back → body →
   legs → chest → head/hair → held items), built so it can swap to
   per-layer art the day an artist ships it — see the manifest at
   the bottom of this file for the exact filenames.

   Until then it runs in FALLBACK mode on the full-character sheets
   we already have, and still shows the player's choices:
     • band tints — a multiply-blended sprite cut to one body region
       (head / torso / legs / feet). Clipped by its own alpha, so it
       recolours the painted art and nothing else. Skin, shirt,
       trousers and boots all recolour and keep their shading.
     • procedural pieces — hair, hats, tabards, capes, packs and
       held gear drawn with Graphics, riding the per-frame head box
       from sheets.ts so they follow the animation instead of
       floating.

   Everything is drawn once per appearance change. Per frame we only
   move and scale — no allocation in the hot path.
   ═══════════════════════════════════════════════════════════════ */

import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Animator } from "./animation";
import { motionFlash } from "./animation";
import { HEAD_ASPECT } from "./sheets";
import type { BandId, LoadedSheet, SheetId, SheetPack } from "./sheets";
import {
  ART_BASE_SKIN, EQUIPMENT, EQUIP_SLOTS, HAIR_STYLES, BODY_TYPES, FACE_SHAPES,
  defaultAppearance, getBodyType, getEquipped, getEyeColor, getFaceShape,
  getHairColor, getHairStyle, getSkinTone,
} from "./character";
import type { CharacterAppearance, EquipItem } from "./character";

/** Draw order, back to front. A slot is *what* you wear; this is *when*. */
export const PAPERDOLL_LAYERS = [
  "back",     // cloak, pack, quiver — behind everything
  "offhand",  // far hand: shield, lantern
  "body",     // skin + silhouette
  "legs",     // trousers, skirts, greaves
  "feet",     // boots
  "chest",    // shirt, vest, mail, plate
  "face",     // skin tone, eyes
  "hair",     // hair, under the hat
  "headgear", // hat, hood, helm
  "mainhand", // near hand: axe, rod, sword
] as const;

export type PaperdollLayer = typeof PAPERDOLL_LAYERS[number];

export interface PaperdollOptions {
  sheets: SheetPack;
  /** On-screen height in design units for the reference pose. */
  height?: number;
  /** Soft ground ellipse under the feet. */
  shadow?: boolean;
}

/* ─────────────── colour maths ─────────────── */

const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n | 0);

function rgb(c: number) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function pack(r: number, g: number, b: number) {
  return (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
}

/** Multiply factor that turns the art's painted skin into `target`.
    Pulled back toward white and floored: a straight ratio crushes the
    painted line work at the dark end and the face becomes a hole. */
function skinTint(target: number): number {
  const [tr, tg, tb] = rgb(target);
  const [br, bg, bb] = rgb(ART_BASE_SKIN);
  const f = (t: number, base: number) => Math.max(88, Math.min(255, (t / base) * 255));
  return mixColor(0xffffff, pack(f(tr, br), f(tg, bg), f(tb, bb)), 0.90);
}

/** Multiply factor that reads as "this garment is now that colour".
    Deliberately gentle: the tint carries the hue across the whole
    painted garment while the drawn piece on top carries the shape. */
function clothTint(color: number, strength: number): number {
  const [r, g, b] = rgb(color);
  // Take the hue at full brightness first: multiplying by the raw
  // colour would drag every garment toward mud, because multiply can
  // only ever darken what the painter already lit.
  const k = 255 / Math.max(r, g, b, 1);
  const nr = r * k, ng = g * k, nb = b * k;
  const luma = (0.3 * nr + 0.6 * ng + 0.1 * nb) / 255;
  const value = 0.58 + 0.42 * luma;
  return mixColor(0xffffff, pack(nr * value, ng * value, nb * value), strength);
}

function mixColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
  return pack(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

const shade = (c: number, t: number) => mixColor(c, 0x000000, t);
const lift = (c: number, t: number) => mixColor(c, 0xffffff, t);
const clampAbs = (v: number, m: number) => (v > m ? m : v < -m ? -m : v);

/* ─────────────── the paperdoll ─────────────── */

interface Bands {
  head: Sprite; torso: Sprite; legs: Sprite; feet: Sprite;
}

export class Paperdoll {
  /** Origin sits on the ground, between the feet. Parent this. */
  readonly root = new Container();

  readonly heightUnits: number;

  private sheets: SheetPack;
  private appearance: CharacterAppearance = defaultAppearance();

  private shadow: Graphics | null = null;
  private flip = new Container();

  private backG = new Graphics();
  private offG = new Graphics();
  private prevSprite = new Sprite();
  private baseSprite = new Sprite();
  private procBody = new Graphics();
  private bands: Bands;
  private legsG = new Graphics();
  private chestG = new Graphics();
  private hairG = new Graphics();
  private headG = new Graphics();
  private mainG = new Graphics();

  /** Cached tints so a hit-flash can modulate them without a rebuild. */
  private tintHead = 0xffffff;
  private tintTorso = 0xffffff;
  private tintLegs = 0xffffff;
  private tintFeet = 0xffffff;
  private lastFlash = -1;

  private bodyWidth = 1;
  private hasMain = false;
  private hasOff = false;

  constructor(opts: PaperdollOptions) {
    this.sheets = opts.sheets;
    this.heightUnits = opts.height ?? 300;

    if (opts.shadow !== false) {
      this.shadow = new Graphics();
      this.root.addChild(this.shadow);
      this.drawShadow();
    }

    const mkBand = () => {
      const s = new Sprite();
      s.blendMode = "multiply";
      s.visible = false;
      return s;
    };
    this.bands = { head: mkBand(), torso: mkBand(), legs: mkBand(), feet: mkBand() };

    this.prevSprite.visible = false;
    this.procBody.visible = false;

    this.flip.addChild(
      this.backG, this.offG,
      this.prevSprite, this.baseSprite, this.procBody,
      this.bands.legs, this.bands.feet, this.bands.torso, this.bands.head,
      this.legsG, this.chestG, this.hairG, this.headG, this.mainG,
    );
    this.root.addChild(this.flip);
    this.setAppearance(this.appearance);
  }

  /* ─────────────── appearance ─────────────── */

  getAppearance(): CharacterAppearance { return this.appearance; }

  setAppearance(a: CharacterAppearance): void {
    this.appearance = a;
    const body = getBodyType(a);
    this.bodyWidth = body.widthScale;

    const skin = getSkinTone(a).color;
    const hair = getHairColor(a).color;
    const chest = getEquipped(a, "chest");
    const legs = getEquipped(a, "legs");
    const feet = getEquipped(a, "feet");
    const back = getEquipped(a, "back");
    const head = getEquipped(a, "head");
    const main = getEquipped(a, "mainHand");
    const off = getEquipped(a, "offHand");

    // The torso band also covers bare arms, so it stays a whisper;
    // legs and boots are all garment, so they take the full colour.
    this.tintHead = skinTint(skin);
    // A shirt draws no panel, so its tint has to carry the whole
    // change; armour draws a panel, so its tint stays out of the way.
    this.tintTorso = chest ? clothTint(chest.primary, chest.shape === "tunic" ? 0.80 : 0.45) : 0xffffff;
    this.tintLegs = legs ? clothTint(legs.primary, 0.88) : 0xffffff;
    this.tintFeet = feet ? clothTint(feet.primary, 0.88) : 0xffffff;
    this.bands.head.visible = true;          // skin always recolours
    this.bands.torso.visible = !!chest;
    this.bands.legs.visible = !!legs;
    this.bands.feet.visible = !!feet;
    this.lastFlash = -1;

    drawHair(this.hairG, getHairStyle(a).shape, hair, skin, body.shoulder);
    drawHeadgear(this.headG, head);
    drawChest(this.chestG, chest, body.shoulder);
    drawLegs(this.legsG, legs);
    drawBack(this.backG, back);
    drawHand(this.mainG, main, true);
    drawHand(this.offG, off, false);
    this.hasMain = !!main;
    this.hasOff = !!off;
    this.drawProcBody(skin, chest, legs, feet, hair);
  }

  /* ─────────────── per-frame pose ─────────────── */

  /** Procedural bob/hop/recoil, applied to the BODY only — the ground
      shadow stays on the ground and just tightens as the actor lifts. */
  setMotion(dx: number, dy: number): void {
    this.flip.position.set(dx, dy);
    const g = this.shadow;
    if (!g) return;
    const lift = Math.min(0.45, Math.max(0, -dy) / this.heightUnits * 1.8);
    g.scale.set(1 - lift, 1 - lift * 0.6);
    g.alpha = 1 - lift * 0.8;
  }

  /** Drive the doll from an animator. Allocation-free. */
  apply(anim: Animator, facing: number): void {
    this.flip.scale.x = facing >= 0 ? 1 : -1;

    const sheet = anim.sheet;
    if (!sheet) { this.poseProcedural(); return; }

    const flash = motionFlash(anim);
    if (flash !== this.lastFlash) { this.applyFlash(flash); this.lastFlash = flash; }

    const frame = Math.min(anim.frame, sheet.def.frames - 1);
    const s = this.heightUnits / sheet.refPx;
    const sgn = sheet.def.mirror ? -1 : 1;

    this.procBody.visible = false;
    this.baseSprite.visible = true;
    this.baseSprite.texture = sheet.textures[frame];
    this.baseSprite.anchor.set(sheet.anchorX / sheet.frameW, sheet.feetY / sheet.frameH);
    this.baseSprite.scale.set(s * sgn, s);
    this.baseSprite.alpha = anim.blend;

    // outgoing pose, held underneath while the new one fades in
    const from = anim.fromSheet;
    if (from && anim.blend < 1) {
      const fs = this.heightUnits / from.refPx;
      const fi = Math.min(anim.fromFrame, from.def.frames - 1);
      this.prevSprite.visible = true;
      this.prevSprite.texture = from.textures[fi];
      this.prevSprite.anchor.set(from.anchorX / from.frameW, from.feetY / from.frameH);
      this.prevSprite.scale.set(fs * (from.def.mirror ? -1 : 1), fs);
      this.prevSprite.tint = this.baseSprite.tint;
    } else if (this.prevSprite.visible) {
      this.prevSprite.visible = false;
      this.prevSprite.texture = Texture.EMPTY;
    }

    this.placeBand("head", sheet, frame, s, sgn);
    this.placeBand("torso", sheet, frame, s, sgn);
    this.placeBand("legs", sheet, frame, s, sgn);
    this.placeBand("feet", sheet, frame, s, sgn);

    this.placeOverlays(sheet, frame, s, sgn, anim.blend);
  }

  private placeBand(id: BandId, sheet: LoadedSheet, frame: number, s: number, sgn: number): void {
    const sprite = this.bands[id];
    if (!sprite.visible) return;
    const b = sheet.bands[id][frame];
    sprite.texture = b.texture;
    sprite.anchor.set(b.ax, b.ay);
    sprite.scale.set(s * sgn, s);
  }

  private placeOverlays(sheet: LoadedSheet, frame: number, s: number, sgn: number, alpha: number): void {
    // Source pixels → local design units. Written out rather than
    // wrapped in helpers: this runs for every actor, every frame.
    const a = sheet.heads[frame];
    const kx = s * sgn, ax = sheet.anchorX, fy = sheet.feetY;

    const hw = a.headW * s;
    const hx = (a.headCx - ax) * kx;
    const hy = (a.headTop - fy) * s + hw * HEAD_ASPECT * 0.5;
    const neckY = (a.neckY - fy) * s;
    const hipY = (a.hipY - fy) * s;
    const torsoH = Math.max(1, hipY - neckY);
    const shoulderW = hw * 1.15 * this.bodyWidth;

    this.hairG.position.set(hx, hy);
    this.hairG.scale.set(hw);
    this.hairG.alpha = alpha;
    this.headG.position.set(hx, hy);
    this.headG.scale.set(hw);
    this.headG.alpha = alpha;

    // The torso axis runs neck → hip. When a pose leans (chopping,
    // casting) the head drifts off the ground anchor, and tilting by
    // that drift keeps a tabard on the chest instead of in mid-air.
    const lean = clampAbs(Math.atan2(-hx * 1.45, torsoH), 0.55);
    const torsoX = hx * 0.55;
    // Cloth pieces sit just under full opacity so the painted folds
    // and pocket shadows still read through the flat colour.
    this.chestG.position.set(torsoX, neckY);
    this.chestG.scale.set(shoulderW, torsoH);
    this.chestG.rotation = lean;
    this.chestG.alpha = alpha * 0.84;
    this.backG.position.set(torsoX, neckY);
    this.backG.scale.set(shoulderW, torsoH);
    this.backG.rotation = lean;
    this.backG.alpha = alpha * 0.95;

    const legH = Math.max(1, -hipY);
    this.legsG.position.set(torsoX * 0.4, hipY);
    this.legsG.scale.set(hw * 1.02 * this.bodyWidth, legH);
    this.legsG.alpha = alpha * 0.90;

    // Held gear only when the sheet has not already painted a tool in.
    const holdable = !sheet.def.toolBaked;
    const handY = neckY + torsoH * 0.70;
    this.mainG.visible = holdable && this.hasMain;
    this.offG.visible = holdable && this.hasOff;
    this.mainG.position.set(torsoX + hw * 0.54, handY);
    this.mainG.scale.set(hw);
    this.mainG.alpha = alpha;
    this.offG.position.set(torsoX - hw * 0.50, handY);
    this.offG.scale.set(hw);
    this.offG.alpha = alpha;
  }

  private applyFlash(flash: number): void {
    const hit = 0xff5a48;
    const t = flash * 0.85;
    this.baseSprite.tint = t > 0 ? mixColor(0xffffff, hit, t) : 0xffffff;
    this.bands.head.tint = t > 0 ? mixColor(this.tintHead, hit, t) : this.tintHead;
    this.bands.torso.tint = t > 0 ? mixColor(this.tintTorso, hit, t) : this.tintTorso;
    this.bands.legs.tint = t > 0 ? mixColor(this.tintLegs, hit, t) : this.tintLegs;
    this.bands.feet.tint = t > 0 ? mixColor(this.tintFeet, hit, t) : this.tintFeet;
  }

  /* ─────────────── no-art fallback ─────────────── */

  private drawProcBody(skin: number, chest: EquipItem | null, legs: EquipItem | null,
                       feet: EquipItem | null, hair: number): void {
    const g = this.procBody;
    const H = this.heightUnits;
    const w = this.bodyWidth;
    g.clear();
    const shirt = chest?.primary ?? 0xf0e2c4;
    const pants = legs?.primary ?? 0x6d7245;
    const boot = feet?.primary ?? 0x7d4f2c;
    // legs
    g.roundRect(-0.14 * H * w, -0.46 * H, 0.11 * H * w, 0.40 * H, 0.05 * H).fill(pants);
    g.roundRect(0.03 * H * w, -0.46 * H, 0.11 * H * w, 0.40 * H, 0.05 * H).fill(pants);
    g.roundRect(-0.16 * H * w, -0.09 * H, 0.14 * H * w, 0.09 * H, 0.03 * H).fill(boot);
    g.roundRect(0.02 * H * w, -0.09 * H, 0.14 * H * w, 0.09 * H, 0.03 * H).fill(boot);
    // torso
    g.roundRect(-0.17 * H * w, -0.74 * H, 0.34 * H * w, 0.32 * H, 0.08 * H).fill(shirt);
    // arms
    g.roundRect(-0.24 * H * w, -0.71 * H, 0.08 * H * w, 0.26 * H, 0.04 * H).fill(skin);
    g.roundRect(0.16 * H * w, -0.71 * H, 0.08 * H * w, 0.26 * H, 0.04 * H).fill(skin);
    // head
    g.circle(0, -0.83 * H, 0.11 * H).fill(skin);
    g.ellipse(0, -0.87 * H, 0.115 * H, 0.075 * H).fill(hair);
  }

  private poseProcedural(): void {
    this.baseSprite.visible = false;
    this.prevSprite.visible = false;
    this.procBody.visible = true;
    for (const id of ["head", "torso", "legs", "feet"] as const) this.bands[id].visible = false;

    const H = this.heightUnits;
    const hw = 0.22 * H;
    this.hairG.position.set(0, -0.85 * H);
    this.hairG.scale.set(hw);
    this.headG.position.set(0, -0.85 * H);
    this.headG.scale.set(hw);
    this.chestG.position.set(0, -0.74 * H);
    this.chestG.scale.set(hw * 1.62 * this.bodyWidth, 0.30 * H);
    this.backG.position.set(0, -0.74 * H);
    this.backG.scale.set(hw * 1.62 * this.bodyWidth, 0.30 * H);
    this.legsG.position.set(0, -0.44 * H);
    this.legsG.scale.set(hw * 1.5 * this.bodyWidth, 0.44 * H);
    this.mainG.visible = this.hasMain;
    this.offG.visible = this.hasOff;
    this.mainG.position.set(hw * 0.66, -0.54 * H);
    this.mainG.scale.set(hw);
    this.offG.position.set(-hw * 0.52, -0.54 * H);
    this.offG.scale.set(hw);
  }

  private drawShadow(): void {
    const g = this.shadow;
    if (!g) return;
    const r = this.heightUnits * 0.16;
    g.clear();
    g.ellipse(0, -2, r, r * 0.30).fill({ color: 0x1e2a1a, alpha: 0.22 });
    g.ellipse(0, -2, r * 0.62, r * 0.19).fill({ color: 0x1e2a1a, alpha: 0.16 });
  }

  /** Sheet a state would use — handy for tools and the creator. */
  hasSheet(id: SheetId): boolean { return this.sheets.has(id); }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/* ═══════════════ procedural layer pieces ═══════════════
   All shapes are authored FACING RIGHT in a unit box, so the doll's
   single facing flip handles both handednesses:
     hair / headgear / hands → 1 unit = head width, origin = head centre
     chest / back            → x: 1 unit = shoulder width, y: neck→hip
     legs                    → x: 1 unit = hip width,      y: hip→floor

   Landmarks inside the head box, measured off the placeholder art:
     crown -0.53 · hairline -0.20 · brow -0.14 · eyes -0.05 ·
     chin +0.31 · shoulders +0.58
   Nothing may reach below -0.02 across the middle of the face, or
   the character ends up wearing a bucket.
   ═══════════════════════════════════════════════════════ */

/** Skull cap sized to hide the painted hair without eating the face. */
function hairCap(g: Graphics, color: number, puff: number): void {
  g.ellipse(0, -0.33, 0.50 + puff, 0.24 + puff).fill(color);
  // temples/sideburns, kept clear of the eye line at ±0.19
  for (const sx of [-1, 1]) g.ellipse(sx * 0.40, -0.14, 0.12, 0.13).fill(color);
  // a fringe that dips over the forehead only
  g.moveTo(-0.44, -0.30);
  g.quadraticCurveTo(-0.10, -0.12, 0.30, -0.19);
  g.quadraticCurveTo(0.46, -0.24, 0.48, -0.34);
  g.closePath().fill(color);
}

function drawHair(g: Graphics, shape: string, color: number, skin: number, shoulder: number): void {
  g.clear();
  const dark = shade(color, 0.30);
  const glow = lift(color, 0.24);

  if (shape === "shaved") {
    // Nothing to hide behind — repaint the skull in skin instead.
    g.ellipse(0, -0.31, 0.47, 0.23).fill(skin);
    for (const sx of [-1, 1]) g.ellipse(sx * 0.39, -0.15, 0.10, 0.12).fill(skin);
    g.ellipse(0, -0.33, 0.44, 0.19).fill({ color, alpha: 0.22 });
    return;
  }

  // long styles fall behind the shoulders, so they go down first
  if (shape === "long") {
    for (const sx of [-1, 1]) {
      g.moveTo(sx * 0.44, -0.34);
      g.quadraticCurveTo(sx * 0.50, 0.06, sx * 0.42, 0.36);
      g.lineTo(sx * 0.26, 0.34);
      g.quadraticCurveTo(sx * 0.34, 0.04, sx * 0.32, -0.28);
      g.closePath().fill(dark);
    }
  }
  if (shape === "ponytail") {
    g.ellipse(-0.46, 0.06, 0.13, 0.28).fill(dark);
    g.ellipse(-0.45, -0.16, 0.10, 0.10).fill(color);
  }
  if (shape === "braids") {
    for (const sx of [-1, 1]) {
      g.roundRect(sx * 0.42 - 0.055, -0.18, 0.11, 0.52, 0.055).fill(dark);
      g.circle(sx * 0.42, 0.32, 0.065).fill(glow);
    }
  }

  hairCap(g, color, shape === "curls" ? 0.05 : shape === "wave" ? 0.02 : 0);

  switch (shape) {
    case "crop":
      g.ellipse(-0.12, -0.42, 0.20, 0.07).fill(glow);
      break;
    case "wave":
      g.moveTo(0.06, -0.24);
      g.quadraticCurveTo(0.36, -0.32, 0.50, -0.48);
      g.quadraticCurveTo(0.28, -0.42, 0.08, -0.36);
      g.closePath().fill(glow);
      break;
    case "curls":
      for (let i = 0; i < 6; i++) {
        const ang = Math.PI * (0.12 + (i / 5) * 0.76);
        g.circle(-Math.cos(ang) * 0.44, -0.33 - Math.sin(ang) * 0.18, 0.10)
          .fill(i % 2 ? color : glow);
      }
      break;
    case "topknot":
      g.roundRect(-0.07, -0.56, 0.14, 0.12, 0.05).fill(dark);
      g.circle(0.0, -0.62, 0.14).fill(color);
      g.circle(-0.03, -0.65, 0.07).fill(glow);
      break;
    case "long":
      g.ellipse(-0.14, -0.42, 0.20, 0.07).fill(glow);
      break;
  }
  // a heavier build carries a heavier hairline
  if (shoulder > 0.7) g.ellipse(0, -0.31, 0.46, 0.10).fill({ color: dark, alpha: 0.5 });
}

function drawHeadgear(g: Graphics, item: EquipItem | null): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  switch (item.shape) {
    case "straw":
      g.ellipse(0, -0.25, 0.84, 0.16).fill(p);
      g.ellipse(0, -0.29, 0.84, 0.13).fill(lift(p, 0.14));
      g.ellipse(0.01, -0.43, 0.33, 0.18).fill(p);
      g.ellipse(0.01, -0.33, 0.34, 0.07).fill(s);
      break;
    case "cap":
      g.ellipse(0, -0.36, 0.46, 0.21).fill(p);
      g.moveTo(0.08, -0.32); g.quadraticCurveTo(0.52, -0.34, 0.62, -0.25);
      g.quadraticCurveTo(0.42, -0.22, 0.08, -0.24); g.closePath().fill(s);
      g.ellipse(-0.12, -0.45, 0.18, 0.06).fill(lift(p, 0.20));
      g.circle(0.26, -0.36, 0.045).fill(a);
      break;
    case "hood":
      g.moveTo(-0.52, 0.30);
      g.quadraticCurveTo(-0.62, -0.44, 0.02, -0.56);
      g.quadraticCurveTo(0.58, -0.46, 0.54, 0.10);
      g.lineTo(0.36, 0.10);
      g.quadraticCurveTo(0.40, -0.30, 0.00, -0.36);
      g.quadraticCurveTo(-0.34, -0.30, -0.30, 0.30);
      g.closePath().fill(p);
      g.moveTo(-0.30, 0.30); g.quadraticCurveTo(-0.36, -0.22, 0.00, -0.34);
      g.quadraticCurveTo(-0.14, -0.04, -0.12, 0.32); g.closePath().fill(s);
      g.ellipse(-0.30, -0.40, 0.16, 0.07).fill(lift(p, 0.16));
      break;
    case "helm":
      g.moveTo(-0.48, -0.14);
      g.quadraticCurveTo(-0.50, -0.58, 0.02, -0.60);
      g.quadraticCurveTo(0.52, -0.58, 0.50, -0.14);
      g.closePath().fill(p);
      g.roundRect(-0.50, -0.20, 1.00, 0.10, 0.05).fill(s);
      g.roundRect(0.10, -0.20, 0.09, 0.22, 0.04).fill(lift(p, 0.06));
      g.ellipse(-0.14, -0.46, 0.18, 0.07).fill(a);
      break;
    case "circlet":
      g.roundRect(-0.44, -0.28, 0.88, 0.09, 0.04).fill(p);
      g.roundRect(-0.44, -0.25, 0.88, 0.03, 0.015).fill(s);
      g.circle(0.04, -0.25, 0.09).fill(a);
      g.circle(0.04, -0.25, 0.04).fill(lift(a, 0.5));
      break;
    default:
      g.ellipse(0, -0.34, 0.46, 0.21).fill(p);
      g.ellipse(-0.10, -0.44, 0.18, 0.06).fill(lift(p, 0.2));
      break;
  }
}

/** Shoulder-to-hem body of a garment: rounded shoulders, a waisted
    middle, a hem. Shared by every chest shape so they read as one set. */
function garmentBody(g: Graphics, w: number, top: number, hem: number, flare: number): void {
  g.moveTo(-w * 0.86, top);
  g.quadraticCurveTo(-w, top + 0.06, -w * 0.94, top + 0.30);
  g.quadraticCurveTo(-w * 0.86, hem * 0.62, -w * (0.92 + flare), hem);
  g.lineTo(w * (0.92 + flare), hem);
  g.quadraticCurveTo(w * 0.86, hem * 0.62, w * 0.94, top + 0.30);
  g.quadraticCurveTo(w, top + 0.06, w * 0.86, top);
  g.closePath();
}

function drawChest(g: Graphics, item: EquipItem | null, shoulder: number): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  // Narrow on purpose: the painted shirt and both arms stay visible
  // down the sides, which is what stops this reading as a signboard.
  const w = 0.29 + shoulder * 0.05;
  const hi = lift(p, 0.18), lo = shade(p, 0.22);
  const ink = { width: 0.035, color: shade(p, 0.55), alpha: 0.85 } as const;

  switch (item.shape) {
    case "vest":
      for (const sx of [-1, 1]) {
        g.moveTo(sx * w * 0.92, 0.06);
        g.quadraticCurveTo(sx * w, 0.36, sx * w * 0.86, 0.74);
        g.lineTo(sx * 0.10, 0.76);
        g.quadraticCurveTo(sx * 0.16, 0.36, sx * 0.09, 0.14);
        g.closePath().fill(sx < 0 ? p : hi);
      }
      g.roundRect(-w * 0.94, 0.50, w * 1.88, 0.10, 0.04).fill(s);
      g.circle(w * 0.44, 0.55, 0.038).fill(a);
      break;
    case "robe":
      garmentBody(g, w, 0.04, 1.16, 0.22);
      g.fill(p); g.stroke(ink);
      g.moveTo(-0.08, 0.06); g.lineTo(0.08, 0.06); g.lineTo(0.05, 1.14); g.lineTo(-0.05, 1.14);
      g.closePath().fill(hi);
      g.roundRect(-w * 0.95, 0.54, w * 1.90, 0.08, 0.035).fill(a);
      g.moveTo(-0.19, 0.02); g.lineTo(0.19, 0.02); g.lineTo(0, 0.26); g.closePath().fill(s);
      break;
    case "mail":
      garmentBody(g, w, 0.04, 0.86, 0.02);
      g.fill(p); g.stroke(ink);
      for (let i = 0; i < 4; i++) {
        g.roundRect(-w * 0.82, 0.16 + i * 0.16, w * 1.64, 0.04, 0.02).fill({ color: s, alpha: 0.7 });
      }
      g.roundRect(-0.12, -0.02, 0.24, 0.11, 0.05).fill(s);
      break;
    case "plate":
      garmentBody(g, w, 0.02, 0.84, 0.04);
      g.fill(p); g.stroke(ink);
      g.moveTo(-w * 0.90, 0.04);
      g.quadraticCurveTo(0, 0.34, w * 0.90, 0.04);
      g.quadraticCurveTo(0, 0.16, -w * 0.90, 0.04);
      g.closePath().fill(hi);
      for (const sx of [-1, 1]) g.ellipse(sx * w * 0.92, 0.13, 0.13, 0.12).fill(hi);
      g.moveTo(-0.045, 0.12); g.lineTo(0.045, 0.12); g.lineTo(0.03, 0.76); g.lineTo(-0.03, 0.76);
      g.closePath().fill({ color: lo, alpha: 0.8 });
      g.circle(0, 0.28, 0.075).fill(a);
      g.roundRect(-w * 0.9, 0.68, w * 1.8, 0.12, 0.05).fill(s);
      break;
    default:
      // Shirts and aprons: the art already paints one, so the band
      // tint carries the colour and we only add the trim that tells
      // two shirts apart. Panels are for things worn OVER a shirt.
      g.moveTo(-w * 0.92, 0.00);
      g.quadraticCurveTo(-w * 0.34, 0.10, -0.15, 0.04);
      g.lineTo(0, 0.28); g.lineTo(0.15, 0.04);
      g.quadraticCurveTo(w * 0.34, 0.10, w * 0.92, 0.00);
      g.quadraticCurveTo(w * 0.60, 0.24, w * 0.52, 0.30);
      g.lineTo(-w * 0.52, 0.30);
      g.quadraticCurveTo(-w * 0.60, 0.24, -w * 0.92, 0.00);
      g.closePath().fill(p).stroke(ink);
      g.moveTo(-0.14, 0.05); g.lineTo(0.14, 0.05); g.lineTo(0, 0.27);
      g.closePath().fill(s);
      g.roundRect(-w * 0.95, 0.54, w * 1.90, 0.10, 0.04).fill(s).stroke(ink);
      g.circle(w * 0.40, 0.59, 0.04).fill(a);
      g.roundRect(-w * 0.30, 0.56, w * 0.60, 0.06, 0.02).fill({ color: lo, alpha: 0.6 });
      break;
  }
}

function drawLegs(g: Graphics, item: EquipItem | null): void {
  g.clear();
  if (!item) return;
  // Only hip-hung pieces are safe over animated legs; trousers and
  // greaves recolour through the leg band tint instead.
  if (item.shape === "skirt") {
    g.moveTo(-0.38, 0.00); g.lineTo(0.38, 0.00);
    g.lineTo(0.50, 0.44); g.lineTo(-0.50, 0.44);
    g.closePath().fill(item.primary);
    g.roundRect(-0.40, -0.03, 0.80, 0.08, 0.035).fill(item.secondary);
  } else if (item.shape === "platelegs" || item.shape === "greaves") {
    for (const sx of [-1, 1]) {
      g.moveTo(sx * 0.07, -0.01); g.lineTo(sx * 0.32, -0.01);
      g.lineTo(sx * 0.28, 0.15); g.lineTo(sx * 0.10, 0.15);
      g.closePath().fill(item.primary);
    }
    g.roundRect(-0.34, -0.05, 0.68, 0.08, 0.035).fill(item.secondary);
    g.circle(0, -0.01, 0.055).fill(item.accent);
  } else {
    g.roundRect(-0.34, -0.04, 0.68, 0.075, 0.035).fill(item.secondary);
    g.circle(0, 0.0, 0.05).fill(item.accent);
  }
}

function drawBack(g: Graphics, item: EquipItem | null): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  switch (item.shape) {
    case "pack":
      g.roundRect(-0.30, 0.12, 0.52, 0.66, 0.11).fill(p);
      g.roundRect(-0.26, 0.34, 0.44, 0.18, 0.06).fill(s);
      g.roundRect(-0.28, 0.04, 0.09, 0.78, 0.04).fill(s);
      g.circle(-0.04, 0.43, 0.05).fill(a);
      break;
    case "quiver":
      g.roundRect(-0.40, 0.08, 0.22, 0.74, 0.09).fill(p);
      for (let i = 0; i < 3; i++) g.roundRect(-0.36 + i * 0.06, -0.18, 0.035, 0.30, 0.017).fill(a);
      g.roundRect(-0.42, 0.36, 0.26, 0.09, 0.04).fill(s);
      break;
    case "cloak":
      g.moveTo(-0.46, 0.02);
      g.quadraticCurveTo(-0.70, 0.80, -0.58, 1.56);
      g.lineTo(0.58, 1.56);
      g.quadraticCurveTo(0.70, 0.80, 0.46, 0.02);
      g.closePath().fill(p);
      g.moveTo(-0.46, 0.02); g.quadraticCurveTo(0, 0.30, 0.46, 0.02);
      g.quadraticCurveTo(0.26, -0.14, -0.46, 0.02);
      g.closePath().fill(s);
      g.circle(0, 0.04, 0.06).fill(a);
      break;
    default: // cape
      g.moveTo(-0.40, 0.04);
      g.quadraticCurveTo(-0.58, 0.70, -0.48, 1.30);
      g.lineTo(0.48, 1.30);
      g.quadraticCurveTo(0.58, 0.70, 0.40, 0.04);
      g.closePath().fill(p);
      g.roundRect(-0.42, -0.05, 0.84, 0.12, 0.05).fill(s);
      g.circle(0, 0.01, 0.055).fill(a);
      break;
  }
}

function drawHand(g: Graphics, item: EquipItem | null, main: boolean): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  const dir = main ? 1 : -1;
  // A dark keyline is what makes a 40-pixel-tall prop readable.
  const ink = (c: number) => ({ width: 0.05, color: shade(c, 0.6), alpha: 0.9 }) as const;

  switch (item.shape) {
    case "axe":
      g.roundRect(-0.07, -0.62, 0.14, 1.22, 0.06).fill(p).stroke(ink(p));
      g.moveTo(0.02, -0.74); g.quadraticCurveTo(0.46, -0.66, 0.52, -0.40);
      g.quadraticCurveTo(0.42, -0.16, 0.02, -0.20);
      g.closePath().fill(a).stroke(ink(a));
      g.roundRect(-0.09, -0.76, 0.18, 0.14, 0.05).fill(s);
      break;
    case "pick":
      g.roundRect(-0.07, -0.56, 0.14, 1.16, 0.06).fill(p).stroke(ink(p));
      g.moveTo(-0.50, -0.74); g.quadraticCurveTo(0, -0.50, 0.50, -0.74);
      g.quadraticCurveTo(0, -0.30, -0.50, -0.74);
      g.closePath().fill(a).stroke(ink(a));
      break;
    case "rod":
      // carried at rest: butt at the hand, tip up and forward
      g.moveTo(-0.10, 0.26); g.lineTo(0.04, 0.30);
      g.quadraticCurveTo(0.44, -0.60, 0.66, -1.34);
      g.quadraticCurveTo(0.34, -0.62, -0.04, 0.22);
      g.closePath().fill(p).stroke(ink(p));
      g.roundRect(-0.11, 0.12, 0.20, 0.26, 0.07).fill(s);
      g.circle(0.14, 0.26, 0.08).fill(a);
      break;
    case "sword":
      g.moveTo(-0.09, -0.34); g.lineTo(0.09, -0.34); g.lineTo(0.06, -1.16);
      g.lineTo(0, -1.34); g.lineTo(-0.06, -1.16);
      g.closePath().fill(p).stroke(ink(p));
      g.roundRect(-0.28, -0.40, 0.56, 0.11, 0.05).fill(s).stroke(ink(s));
      g.roundRect(-0.07, -0.30, 0.14, 0.34, 0.05).fill(shade(s, 0.35));
      g.circle(0, 0.10, 0.09).fill(a);
      break;
    case "hammer":
      g.roundRect(-0.07, -0.50, 0.14, 1.10, 0.06).fill(p).stroke(ink(p));
      g.roundRect(-0.30, -0.84, 0.60, 0.34, 0.08).fill(s).stroke(ink(s));
      g.circle(0.17, -0.67, 0.08).fill(a);
      break;
    case "shield":
      g.moveTo(dir * -0.40, -0.54); g.lineTo(dir * 0.40, -0.54);
      g.lineTo(dir * 0.35, 0.22); g.lineTo(0, 0.54); g.lineTo(dir * -0.35, 0.22);
      g.closePath().fill(p).stroke(ink(p));
      g.moveTo(dir * -0.27, -0.42); g.lineTo(dir * 0.27, -0.42);
      g.lineTo(dir * 0.24, 0.16); g.lineTo(0, 0.40); g.lineTo(dir * -0.24, 0.16);
      g.closePath().fill(s);
      g.circle(0, -0.08, 0.10).fill(a);
      break;
    case "buckler":
      g.circle(0, -0.08, 0.36).fill(p).stroke(ink(p));
      g.circle(0, -0.08, 0.24).fill(s);
      g.circle(0, -0.08, 0.09).fill(a);
      break;
    case "lantern":
      g.roundRect(-0.04, -0.70, 0.08, 0.32, 0.03).fill(p);
      g.roundRect(-0.20, -0.42, 0.40, 0.44, 0.09).fill(p).stroke(ink(p));
      g.roundRect(-0.13, -0.35, 0.26, 0.30, 0.05).fill(s);
      g.circle(0, -0.20, 0.34).fill({ color: a, alpha: 0.24 });
      break;
    case "torch":
      g.roundRect(-0.07, -0.34, 0.14, 0.80, 0.05).fill(p).stroke(ink(p));
      g.moveTo(-0.18, -0.34); g.quadraticCurveTo(0, -0.98, 0.18, -0.34);
      g.closePath().fill(s);
      g.moveTo(-0.09, -0.36); g.quadraticCurveTo(0, -0.74, 0.09, -0.36);
      g.closePath().fill(a);
      break;
    default:
      break;
  }
}

/* ═══════════════ portrait bust ═══════════════
   Fully procedural, so every choice — including eye colour, which
   the sheets cannot show — is visible in the creator and in any UI
   avatar chip. `size` is the head width in design units.          */

export function drawPortrait(g: Graphics, a: CharacterAppearance, size: number): void {
  g.clear();
  const skin = getSkinTone(a).color;
  const hair = getHairColor(a).color;
  const eye = getEyeColor(a).color;
  const face = getFaceShape(a);
  const body = getBodyType(a);
  const chest = getEquipped(a, "chest");
  const head = getEquipped(a, "head");

  const S = size;
  const jaw = face.jaw, len = face.length;

  // neck first, then the shoulders that sit in front of it
  g.roundRect(-0.17 * S, 0.22 * S, 0.34 * S, 0.46 * S, 0.09 * S).fill(shade(skin, 0.14));
  const shirt = chest?.primary ?? 0xf0e2c4;
  const trim = chest?.secondary ?? 0xd6c39c;
  const bw = body.widthScale;
  g.moveTo(-1.12 * S * bw, 1.55 * S);
  g.quadraticCurveTo(-1.00 * S * bw, 0.80 * S, -0.40 * S, 0.66 * S);
  g.lineTo(0, 0.98 * S);
  g.lineTo(0.40 * S, 0.66 * S);
  g.quadraticCurveTo(1.00 * S * bw, 0.80 * S, 1.12 * S * bw, 1.55 * S);
  g.closePath().fill(shirt);
  g.moveTo(-0.42 * S, 0.64 * S); g.lineTo(0, 1.02 * S); g.lineTo(0.42 * S, 0.64 * S);
  g.lineTo(0.30 * S, 0.60 * S); g.lineTo(0, 0.86 * S); g.lineTo(-0.30 * S, 0.60 * S);
  g.closePath().fill(trim);
  g.roundRect(-1.06 * S * bw, 1.34 * S, 2.12 * S * bw, 0.22 * S, 0.06 * S)
    .fill({ color: shade(shirt, 0.22), alpha: 0.45 });

  // head
  const hh = 0.62 * S * len;
  if (face.shape === "square") {
    g.roundRect(-0.46 * S * jaw, -hh, 0.92 * S * jaw, hh * 1.86, 0.22 * S).fill(skin);
  } else if (face.shape === "heart") {
    g.moveTo(-0.48 * S, -0.34 * S);
    g.quadraticCurveTo(-0.52 * S, 0.34 * S, 0, 0.62 * S * len);
    g.quadraticCurveTo(0.52 * S, 0.34 * S, 0.48 * S, -0.34 * S);
    g.quadraticCurveTo(0, -0.78 * S, -0.48 * S, -0.34 * S);
    g.closePath().fill(skin);
  } else {
    g.ellipse(0, 0, 0.47 * S * jaw, hh).fill(skin);
  }
  g.ellipse(-0.14 * S, -0.16 * S, 0.22 * S, 0.20 * S).fill({ color: lift(skin, 0.16), alpha: 0.55 });
  // ears
  g.circle(-0.46 * S * jaw, 0.02 * S, 0.09 * S).fill(shade(skin, 0.06));
  g.circle(0.46 * S * jaw, 0.02 * S, 0.09 * S).fill(shade(skin, 0.06));

  // eyes
  for (const sx of [-1, 1]) {
    g.ellipse(sx * 0.19 * S, -0.015 * S, 0.095 * S, 0.072 * S).fill(0xfdf6ea);
    g.circle(sx * 0.19 * S + 0.010 * S, -0.010 * S, 0.066 * S).fill(eye);
    g.circle(sx * 0.19 * S + 0.010 * S, -0.010 * S, 0.030 * S).fill(0x241c18);
    g.circle(sx * 0.19 * S - 0.022 * S, -0.042 * S, 0.015 * S).fill(0xffffff);
    // upper lid, then brow
    g.moveTo(sx * 0.285 * S, -0.055 * S);
    g.quadraticCurveTo(sx * 0.19 * S, -0.105 * S, sx * 0.095 * S, -0.055 * S);
    g.stroke({ width: 0.026 * S, color: shade(skin, 0.55), cap: "round" });
    g.moveTo(sx * 0.30 * S, -0.16 * S);
    g.quadraticCurveTo(sx * 0.18 * S, -0.225 * S, sx * 0.08 * S, -0.16 * S);
    g.stroke({ width: 0.033 * S, color: shade(hair, 0.25), cap: "round" });
  }
  // nose + mouth
  g.moveTo(0, 0.06 * S); g.quadraticCurveTo(0.05 * S, 0.16 * S, -0.01 * S, 0.18 * S);
  g.stroke({ width: 0.024 * S, color: shade(skin, 0.28), cap: "round" });
  g.moveTo(-0.11 * S, 0.30 * S); g.quadraticCurveTo(0, 0.38 * S, 0.11 * S, 0.30 * S);
  g.stroke({ width: 0.032 * S, color: shade(skin, 0.42), cap: "round" });

  // hair + hat reuse the body pieces, scaled to the portrait head
  // Hair and hats reuse the body pieces: one set of shapes, so the
  // bust can never disagree with the character in the world.
  const hairG = new Graphics();
  drawHair(hairG, getHairStyle(a).shape, hair, skin, body.shoulder);
  hairG.scale.set(S * 0.95);
  hairG.position.set(0, -0.10 * S);
  const headG = new Graphics();
  drawHeadgear(headG, head);
  headG.scale.set(S * 0.95);
  headG.position.set(0, -0.10 * S);
  g.addChild(hairG, headG);
}

/** A self-contained bust. Call setAppearance to repaint. */
export class PortraitView {
  readonly root = new Container();
  private g = new Graphics();
  private size: number;

  constructor(size = 120) {
    this.size = size;
    this.root.addChild(this.g);
  }

  setAppearance(a: CharacterAppearance): void {
    this.g.removeChildren().forEach((c) => c.destroy());
    drawPortrait(this.g, a, this.size);
  }

  destroy(): void { this.root.destroy({ children: true }); }
}

/* ═══════════════ the art request for a real paperdoll ═══════════════
   Filenames a future artist delivers to retire fallback mode. One
   horizontal row of square frames per file, matching the base sheet
   for that state exactly: same frame count, same frame size, same
   feet position, transparent background, no baked shadow.          */

export const PAPERDOLL_ART_ROOT = "assets/actors/paperdoll";

/** `<root>/<state>/<layer>__<optionId>.png` */
export const PAPERDOLL_ART_PATTERN = `${PAPERDOLL_ART_ROOT}/<state>/<layer>__<optionId>.png`;

export interface ArtRequest {
  file: string;
  layer: PaperdollLayer | "body" | "face";
  state: SheetId;
  frames: number;
  frameSize: number;
  /** Which appearance field recolours this file at runtime. */
  tintedBy: "skin" | "hair" | "item" | "none";
}

const STATE_FRAMES: Readonly<Record<SheetId, number>> = {
  idle: 6, walk: 8, fish: 6, chop: 8,
};

/** The full delivery list, generated from the live catalogues so it
    can never drift from the options the creator actually offers. */
export function paperdollArtManifest(frameSize = 512): ArtRequest[] {
  const out: ArtRequest[] = [];
  const states = Object.keys(STATE_FRAMES) as SheetId[];
  const push = (state: SheetId, layer: ArtRequest["layer"], id: string, tintedBy: ArtRequest["tintedBy"]) => {
    out.push({
      file: `${PAPERDOLL_ART_ROOT}/${state}/${layer}__${id}.png`,
      layer, state, frames: STATE_FRAMES[state], frameSize, tintedBy,
    });
  };
  for (const state of states) {
    for (const b of BODY_TYPES) push(state, "body", b.id, "skin");
    for (const f of FACE_SHAPES) push(state, "face", f.id, "skin");
    for (const h of HAIR_STYLES) push(state, "hair", h.id, "hair");
    for (const item of EQUIPMENT) {
      if (item.id.endsWith("_none")) continue;
      const layer: ArtRequest["layer"] =
        item.slot === "head" ? "headgear"
        : item.slot === "mainHand" ? "mainhand"
        : item.slot === "offHand" ? "offhand"
        : item.slot;
      push(state, layer, item.id, "item");
    }
  }
  return out;
}

/** Smallest set that already looks like a paperdoll: idle + walk. */
export function paperdollArtManifestMinimal(frameSize = 512): ArtRequest[] {
  return paperdollArtManifest(frameSize).filter((r) => r.state === "idle" || r.state === "walk");
}

/** Slots the pipeline will read per-layer art for, in draw order. */
export const PAPERDOLL_LAYER_SLOTS: Readonly<Record<PaperdollLayer, string>> = {
  back: "equipment.back",
  offhand: "equipment.offHand",
  body: "bodyType (tinted by skinTone)",
  legs: "equipment.legs",
  feet: "equipment.feet",
  chest: "equipment.chest",
  face: "faceShape (tinted by skinTone; eyes tinted by eyeColor)",
  hair: "hairStyle (tinted by hairColor)",
  headgear: "equipment.head",
  mainhand: "equipment.mainHand",
};

/** Sanity check used by the dev harness. */
export const PAPERDOLL_SLOT_COUNT = EQUIP_SLOTS.length;
