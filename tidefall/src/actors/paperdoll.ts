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

/** Multiply factor that turns the art's painted skin into `target`. */
function skinTint(target: number): number {
  const [tr, tg, tb] = rgb(target);
  const [br, bg, bb] = rgb(ART_BASE_SKIN);
  return pack(Math.min(255, (tr / br) * 255), Math.min(255, (tg / bg) * 255), Math.min(255, (tb / bb) * 255));
}

/** Multiply factor that reads as "this garment is now that colour":
    the hue at full strength, darkened only as far as the colour is. */
function clothTint(color: number): number {
  const [r, g, b] = rgb(color);
  const max = Math.max(r, g, b, 1);
  const luma = (0.3 * r + 0.6 * g + 0.1 * b) / 255;
  const k = (0.42 + 0.58 * luma) * (255 / max);
  return pack(r * k, g * k, b * k);
}

function mixColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
  return pack(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

const shade = (c: number, t: number) => mixColor(c, 0x000000, t);
const lift = (c: number, t: number) => mixColor(c, 0xffffff, t);

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

    this.tintHead = skinTint(skin);
    this.tintTorso = chest ? clothTint(chest.primary) : 0xffffff;
    this.tintLegs = legs ? clothTint(legs.primary) : 0xffffff;
    this.tintFeet = feet ? clothTint(feet.primary) : 0xffffff;
    this.bands.torso.visible = !!chest;
    this.bands.legs.visible = !!legs;
    this.bands.feet.visible = !!feet;
    this.lastFlash = -1;

    drawHair(this.hairG, getHairStyle(a).shape, hair, skin, body.shoulder);
    drawHeadgear(this.headG, head, hair);
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
    const a = sheet.heads[frame];
    const lx = (px: number) => (px - sheet.anchorX) * s * sgn;
    const ly = (py: number) => (py - sheet.feetY) * s;

    const hw = a.headW * s;
    const hx = lx(a.headCx);
    const hy = ly(a.headTop) + hw * HEAD_ASPECT * 0.5;
    const neckY = ly(a.neckY);
    const hipY = ly(a.hipY);
    const torsoH = Math.max(1, hipY - neckY);
    const shoulderW = hw * 1.62 * this.bodyWidth;

    this.hairG.position.set(hx, hy);
    this.hairG.scale.set(hw);
    this.hairG.alpha = alpha;
    this.headG.position.set(hx, hy);
    this.headG.scale.set(hw);
    this.headG.alpha = alpha;

    const torsoX = hx * 0.5;
    this.chestG.position.set(torsoX, neckY);
    this.chestG.scale.set(shoulderW, torsoH);
    this.chestG.alpha = alpha;
    this.backG.position.set(torsoX, neckY);
    this.backG.scale.set(shoulderW, torsoH);
    this.backG.alpha = alpha;

    const legH = Math.max(1, -hipY);
    this.legsG.position.set(0, hipY);
    this.legsG.scale.set(hw * 1.5 * this.bodyWidth, legH);
    this.legsG.alpha = alpha;

    // Held gear only when the sheet has not already painted a tool in.
    const holdable = !sheet.def.toolBaked;
    const handY = neckY + torsoH * 0.66;
    this.mainG.visible = holdable && this.hasMain;
    this.offG.visible = holdable && this.hasOff;
    this.mainG.position.set(torsoX + hw * 0.66, handY);
    this.mainG.scale.set(hw);
    this.mainG.alpha = alpha;
    this.offG.position.set(torsoX - hw * 0.52, handY);
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
   ═══════════════════════════════════════════════════════ */

function drawHair(g: Graphics, shape: string, color: number, skin: number, shoulder: number): void {
  g.clear();
  const dark = shade(color, 0.28);
  const glow = lift(color, 0.22);

  if (shape === "shaved") {
    // No hair to hide the painted hair behind — repaint the skull in skin.
    g.ellipse(0, -0.26, 0.50, 0.36).fill(skin);
    g.ellipse(-0.06, -0.34, 0.30, 0.18).fill(lift(skin, 0.10));
    g.ellipse(0, -0.30, 0.50, 0.30).fill({ color, alpha: 0.20 });
    return;
  }

  // the cap every style shares: covers the painted hair, tufts included
  const puff = shape === "curls" ? 0.07 : shape === "wave" || shape === "long" ? 0.04 : 0.01;
  g.ellipse(0, -0.30 - puff * 0.5, 0.53 + puff, 0.38 + puff).fill(color);
  g.moveTo(-0.53, -0.16);
  g.quadraticCurveTo(-0.30, -0.02, 0.02, -0.06);
  g.quadraticCurveTo(0.34, -0.10, 0.52, -0.24);
  g.lineTo(0.52, -0.40); g.lineTo(-0.53, -0.40); g.closePath();
  g.fill(color);

  switch (shape) {
    case "crop":
      g.ellipse(-0.10, -0.44, 0.26, 0.12).fill(glow);
      break;
    case "wave":
      g.moveTo(0.10, -0.20);
      g.quadraticCurveTo(0.44, -0.30, 0.56, -0.52);
      g.quadraticCurveTo(0.30, -0.44, 0.12, -0.36);
      g.closePath().fill(glow);
      break;
    case "curls":
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI * (0.08 + (i / 6) * 0.84);
        g.circle(-Math.cos(ang) * 0.48, -0.30 - Math.sin(ang) * 0.30, 0.13)
          .fill(i % 2 ? color : glow);
      }
      break;
    case "ponytail":
      g.ellipse(-0.46, -0.02, 0.15, 0.30).fill(dark);
      g.ellipse(-0.44, -0.26, 0.11, 0.10).fill(color);
      break;
    case "braids":
      for (const sx of [-1, 1]) {
        g.roundRect(sx * 0.40 - 0.07, -0.24, 0.14, 0.62, 0.07).fill(dark);
        g.circle(sx * 0.40, 0.36, 0.08).fill(glow);
      }
      break;
    case "long":
      g.moveTo(-0.54, -0.32);
      g.quadraticCurveTo(-0.66, 0.30, -0.46, 0.76);
      g.lineTo(0.46, 0.76);
      g.quadraticCurveTo(0.64, 0.26, 0.52, -0.32);
      g.lineTo(0.52, -0.10);
      g.quadraticCurveTo(0.10, 0.06, -0.54, -0.10);
      g.closePath().fill(dark);
      g.ellipse(-0.12, -0.44, 0.24, 0.10).fill(glow);
      break;
    case "topknot":
      g.circle(0.02, -0.62, 0.17).fill(color);
      g.circle(0.02, -0.62, 0.10).fill(glow);
      break;
  }
  // a broad shoulder reads as a heavier hairline
  if (shoulder > 0.7) g.ellipse(0, -0.14, 0.50, 0.09).fill(dark);
}

function drawHeadgear(g: Graphics, item: EquipItem | null, hairColor: number): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  switch (item.shape) {
    case "straw":
      g.ellipse(0, -0.26, 0.92, 0.22).fill(p);
      g.ellipse(0, -0.30, 0.92, 0.18).fill(lift(p, 0.12));
      g.ellipse(0.02, -0.46, 0.40, 0.24).fill(p);
      g.ellipse(0.02, -0.34, 0.42, 0.10).fill(s);
      break;
    case "cap":
      g.ellipse(0, -0.36, 0.52, 0.30).fill(p);
      g.moveTo(0.10, -0.32); g.quadraticCurveTo(0.62, -0.36, 0.72, -0.24);
      g.quadraticCurveTo(0.50, -0.20, 0.10, -0.22); g.closePath().fill(s);
      g.ellipse(-0.12, -0.48, 0.24, 0.09).fill(lift(p, 0.18));
      g.circle(0.34, -0.34, 0.05).fill(a);
      break;
    case "hood":
      g.moveTo(-0.60, 0.16);
      g.quadraticCurveTo(-0.72, -0.62, 0.06, -0.66);
      g.quadraticCurveTo(0.68, -0.62, 0.60, 0.10);
      g.quadraticCurveTo(0.44, 0.22, 0.34, 0.06);
      g.quadraticCurveTo(0.40, -0.34, 0.02, -0.38);
      g.quadraticCurveTo(-0.34, -0.34, -0.30, 0.16);
      g.closePath().fill(p);
      g.moveTo(-0.30, 0.16); g.quadraticCurveTo(-0.34, -0.30, 0.02, -0.36);
      g.quadraticCurveTo(-0.12, -0.10, -0.10, 0.20); g.closePath().fill(s);
      g.ellipse(-0.34, -0.48, 0.20, 0.10).fill(lift(p, 0.14));
      break;
    case "helm":
      g.moveTo(-0.54, -0.10);
      g.quadraticCurveTo(-0.56, -0.66, 0.02, -0.68);
      g.quadraticCurveTo(0.58, -0.66, 0.56, -0.10);
      g.lineTo(0.44, -0.10);
      g.quadraticCurveTo(0.46, -0.44, 0.02, -0.48);
      g.quadraticCurveTo(-0.44, -0.44, -0.42, -0.10);
      g.closePath().fill(p);
      g.roundRect(-0.56, -0.16, 1.12, 0.12, 0.06).fill(s);
      g.roundRect(0.16, -0.30, 0.10, 0.34, 0.04).fill(p);
      g.ellipse(-0.16, -0.54, 0.22, 0.08).fill(a);
      break;
    case "circlet":
      g.roundRect(-0.50, -0.34, 1.00, 0.11, 0.05).fill(p);
      g.roundRect(-0.50, -0.30, 1.00, 0.04, 0.02).fill(s);
      g.circle(0.06, -0.30, 0.11).fill(a);
      g.circle(0.06, -0.30, 0.05).fill(lift(a, 0.5));
      break;
    default:
      g.ellipse(0, -0.34, 0.52, 0.28).fill(p);
      g.ellipse(-0.10, -0.46, 0.22, 0.08).fill(lift(p, 0.2));
      break;
  }
  // a whisper of the hair colour so hats never look pasted on
  g.ellipse(0, -0.08, 0.46, 0.10).fill({ color: shade(hairColor, 0.25), alpha: 0.35 });
}

function drawChest(g: Graphics, item: EquipItem | null, shoulder: number): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  const w = 0.34 + shoulder * 0.07;

  switch (item.shape) {
    case "vest":
      g.moveTo(-w, 0.02); g.lineTo(-0.12, 0.02); g.lineTo(-0.18, 1.02); g.lineTo(-w - 0.02, 1.00);
      g.closePath().fill(p);
      g.moveTo(w, 0.02); g.lineTo(0.12, 0.02); g.lineTo(0.18, 1.02); g.lineTo(w + 0.02, 1.00);
      g.closePath().fill(p);
      g.roundRect(-w - 0.02, 0.62, w * 2 + 0.04, 0.14, 0.05).fill(s);
      g.circle(0.0, 0.69, 0.05).fill(a);
      break;
    case "robe":
      g.moveTo(-w, 0.00);
      g.quadraticCurveTo(-w - 0.16, 0.70, -w - 0.24, 1.55);
      g.lineTo(w + 0.24, 1.55);
      g.quadraticCurveTo(w + 0.16, 0.70, w, 0.00);
      g.closePath().fill(p);
      g.moveTo(-0.10, 0.00); g.lineTo(0.10, 0.00); g.lineTo(0.06, 1.52); g.lineTo(-0.06, 1.52);
      g.closePath().fill(s);
      g.roundRect(-w - 0.04, 0.60, w * 2 + 0.08, 0.10, 0.04).fill(a);
      break;
    case "mail":
      g.roundRect(-w, 0.00, w * 2, 1.08, 0.12).fill(p);
      for (let i = 0; i < 5; i++) {
        g.roundRect(-w + 0.02, 0.12 + i * 0.19, w * 2 - 0.04, 0.06, 0.03).fill({ color: s, alpha: 0.8 });
      }
      g.roundRect(-0.14, -0.04, 0.28, 0.16, 0.07).fill(s);
      break;
    case "plate":
      g.roundRect(-w, -0.02, w * 2, 1.06, 0.14).fill(p);
      g.ellipse(-w, 0.14, 0.20, 0.20).fill(lift(p, 0.10));
      g.ellipse(w, 0.14, 0.20, 0.20).fill(lift(p, 0.10));
      g.moveTo(-0.06, 0.06); g.lineTo(0.06, 0.06); g.lineTo(0.04, 1.00); g.lineTo(-0.04, 1.00);
      g.closePath().fill(s);
      g.circle(0.0, 0.34, 0.10).fill(a);
      g.roundRect(-w, 0.86, w * 2, 0.16, 0.06).fill(s);
      break;
    default: // tunic
      g.moveTo(-w, 0.02);
      g.quadraticCurveTo(-w - 0.05, 0.55, -w + 0.02, 1.06);
      g.lineTo(w - 0.02, 1.06);
      g.quadraticCurveTo(w + 0.05, 0.55, w, 0.02);
      g.closePath().fill(p);
      g.moveTo(-0.16, 0.00); g.lineTo(0.16, 0.00); g.lineTo(0.0, 0.30);
      g.closePath().fill(s);
      g.roundRect(-w, 0.70, w * 2, 0.11, 0.05).fill(s);
      g.circle(w * 0.45, 0.755, 0.045).fill(a);
      break;
  }
}

function drawLegs(g: Graphics, item: EquipItem | null): void {
  g.clear();
  if (!item) return;
  // Only hip-hung pieces are safe over animated legs; trousers and
  // greaves recolour through the leg band tint instead.
  if (item.shape === "skirt") {
    g.moveTo(-0.46, 0.00); g.lineTo(0.46, 0.00);
    g.lineTo(0.62, 0.52); g.lineTo(-0.62, 0.52);
    g.closePath().fill(item.primary);
    g.roundRect(-0.48, -0.03, 0.96, 0.09, 0.04).fill(item.secondary);
  } else if (item.shape === "platelegs" || item.shape === "greaves") {
    for (const sx of [-1, 1]) {
      g.moveTo(sx * 0.06, 0.00); g.lineTo(sx * 0.46, 0.00);
      g.lineTo(sx * 0.40, 0.30); g.lineTo(sx * 0.10, 0.30);
      g.closePath().fill(item.primary);
    }
    g.roundRect(-0.44, -0.05, 0.88, 0.10, 0.04).fill(item.secondary);
    g.circle(0, 0.00, 0.07).fill(item.accent);
  } else {
    g.roundRect(-0.42, -0.04, 0.84, 0.09, 0.04).fill(item.secondary);
    g.circle(0, 0.005, 0.06).fill(item.accent);
  }
}

function drawBack(g: Graphics, item: EquipItem | null): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  switch (item.shape) {
    case "pack":
      g.roundRect(-0.34, 0.10, 0.62, 0.78, 0.14).fill(p);
      g.roundRect(-0.30, 0.36, 0.54, 0.22, 0.07).fill(s);
      g.roundRect(-0.30, 0.02, 0.10, 0.92, 0.04).fill(s);
      g.circle(-0.02, 0.47, 0.06).fill(a);
      break;
    case "quiver":
      g.roundRect(-0.44, 0.06, 0.26, 0.92, 0.10).fill(p);
      for (let i = 0; i < 3; i++) g.roundRect(-0.40 + i * 0.07, -0.24, 0.04, 0.34, 0.02).fill(a);
      g.roundRect(-0.46, 0.40, 0.30, 0.10, 0.04).fill(s);
      break;
    case "cloak":
      g.moveTo(-0.52, 0.00);
      g.quadraticCurveTo(-0.94, 0.90, -0.72, 1.92);
      g.lineTo(0.72, 1.92);
      g.quadraticCurveTo(0.94, 0.90, 0.52, 0.00);
      g.closePath().fill(p);
      g.moveTo(-0.52, 0.00); g.quadraticCurveTo(0, 0.34, 0.52, 0.00);
      g.quadraticCurveTo(0.30, -0.18, -0.52, 0.00);
      g.closePath().fill(s);
      g.circle(0, 0.05, 0.08).fill(a);
      break;
    default: // cape
      g.moveTo(-0.44, 0.02);
      g.quadraticCurveTo(-0.74, 0.80, -0.58, 1.62);
      g.lineTo(0.58, 1.62);
      g.quadraticCurveTo(0.74, 0.80, 0.44, 0.02);
      g.closePath().fill(p);
      g.roundRect(-0.46, -0.06, 0.92, 0.14, 0.06).fill(s);
      g.circle(0, 0.01, 0.07).fill(a);
      break;
  }
}

function drawHand(g: Graphics, item: EquipItem | null, main: boolean): void {
  g.clear();
  if (!item) return;
  const p = item.primary, s = item.secondary, a = item.accent;
  const dir = main ? 1 : -1;
  switch (item.shape) {
    case "axe":
      g.roundRect(-0.05, -0.55, 0.10, 1.15, 0.05).fill(p);
      g.moveTo(0.02, -0.62); g.lineTo(0.50, -0.46); g.lineTo(0.34, -0.14); g.lineTo(0.02, -0.24);
      g.closePath().fill(a);
      g.roundRect(-0.06, -0.66, 0.12, 0.14, 0.04).fill(s);
      break;
    case "pick":
      g.roundRect(-0.05, -0.50, 0.10, 1.10, 0.05).fill(p);
      g.moveTo(-0.44, -0.62); g.quadraticCurveTo(0, -0.44, 0.44, -0.62);
      g.quadraticCurveTo(0, -0.30, -0.44, -0.62); g.closePath().fill(a);
      break;
    case "rod":
      g.moveTo(-0.06, 0.16); g.lineTo(0.06, 0.16);
      g.quadraticCurveTo(0.70, -0.60, 1.50, -0.95);
      g.quadraticCurveTo(0.70, -0.48, 0.02, 0.10); g.closePath().fill(p);
      g.roundRect(-0.07, 0.02, 0.14, 0.22, 0.06).fill(s);
      g.circle(0.10, 0.16, 0.07).fill(a);
      break;
    case "sword":
      g.moveTo(-0.05, -0.30); g.lineTo(0.05, -0.30); g.lineTo(0.03, -1.15);
      g.lineTo(0, -1.28); g.lineTo(-0.03, -1.15); g.closePath().fill(p);
      g.roundRect(-0.22, -0.34, 0.44, 0.09, 0.04).fill(s);
      g.roundRect(-0.05, -0.26, 0.10, 0.30, 0.04).fill(shade(s, 0.3));
      g.circle(0, 0.08, 0.07).fill(a);
      break;
    case "hammer":
      g.roundRect(-0.05, -0.45, 0.10, 1.05, 0.05).fill(p);
      g.roundRect(-0.26, -0.72, 0.52, 0.30, 0.07).fill(s);
      g.circle(0.16, -0.57, 0.07).fill(a);
      break;
    case "shield":
      g.moveTo(dir * -0.34, -0.46); g.lineTo(dir * 0.34, -0.46);
      g.lineTo(dir * 0.30, 0.20); g.lineTo(0, 0.48); g.lineTo(dir * -0.30, 0.20);
      g.closePath().fill(p);
      g.moveTo(dir * -0.24, -0.36); g.lineTo(dir * 0.24, -0.36);
      g.lineTo(dir * 0.21, 0.14); g.lineTo(0, 0.36); g.lineTo(dir * -0.21, 0.14);
      g.closePath().fill(s);
      g.circle(0, -0.06, 0.09).fill(a);
      break;
    case "buckler":
      g.circle(0, -0.06, 0.32).fill(p);
      g.circle(0, -0.06, 0.22).fill(s);
      g.circle(0, -0.06, 0.08).fill(a);
      break;
    case "lantern":
      g.roundRect(-0.03, -0.62, 0.06, 0.30, 0.03).fill(p);
      g.roundRect(-0.17, -0.36, 0.34, 0.38, 0.08).fill(p);
      g.roundRect(-0.11, -0.30, 0.22, 0.26, 0.05).fill(s);
      g.circle(0, -0.17, 0.30).fill({ color: a, alpha: 0.22 });
      break;
    case "torch":
      g.roundRect(-0.05, -0.30, 0.10, 0.72, 0.04).fill(p);
      g.moveTo(-0.15, -0.30); g.quadraticCurveTo(0, -0.86, 0.15, -0.30);
      g.closePath().fill(s);
      g.moveTo(-0.08, -0.32); g.quadraticCurveTo(0, -0.66, 0.08, -0.32);
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

  // shoulders
  const shirt = chest?.primary ?? 0xf0e2c4;
  g.moveTo(-1.15 * S * body.widthScale, 1.55 * S);
  g.quadraticCurveTo(-0.72 * S, 0.62 * S, -0.26 * S, 0.56 * S);
  g.lineTo(0.26 * S, 0.56 * S);
  g.quadraticCurveTo(0.72 * S, 0.62 * S, 1.15 * S * body.widthScale, 1.55 * S);
  g.closePath().fill(shirt);
  g.roundRect(-0.18 * S, 0.30 * S, 0.36 * S, 0.34 * S, 0.10 * S).fill(shade(skin, 0.12));

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
    g.ellipse(sx * 0.19 * S, -0.02 * S, 0.11 * S, 0.09 * S).fill(0xfdf6ea);
    g.circle(sx * 0.19 * S + 0.012 * S, -0.02 * S, 0.062 * S).fill(eye);
    g.circle(sx * 0.19 * S + 0.012 * S, -0.02 * S, 0.030 * S).fill(0x241c18);
    g.circle(sx * 0.19 * S - 0.020 * S, -0.05 * S, 0.016 * S).fill(0xffffff);
    g.moveTo(sx * 0.30 * S, -0.17 * S);
    g.quadraticCurveTo(sx * 0.18 * S, -0.24 * S, sx * 0.08 * S, -0.17 * S);
    g.stroke({ width: 0.035 * S, color: shade(hair, 0.25), cap: "round" });
  }
  // nose + mouth
  g.moveTo(0, 0.06 * S); g.quadraticCurveTo(0.05 * S, 0.16 * S, -0.01 * S, 0.18 * S);
  g.stroke({ width: 0.024 * S, color: shade(skin, 0.28), cap: "round" });
  g.moveTo(-0.11 * S, 0.30 * S); g.quadraticCurveTo(0, 0.38 * S, 0.11 * S, 0.30 * S);
  g.stroke({ width: 0.032 * S, color: shade(skin, 0.42), cap: "round" });

  // hair + hat reuse the body pieces, scaled to the portrait head
  const hairG = new Graphics();
  drawHair(hairG, getHairStyle(a).shape, hair, skin, body.shoulder);
  hairG.scale.set(S * 1.06);
  hairG.position.set(0, -0.06 * S);
  const headG = new Graphics();
  drawHeadgear(headG, head, hair);
  headG.scale.set(S * 1.06);
  headG.position.set(0, -0.06 * S);
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
