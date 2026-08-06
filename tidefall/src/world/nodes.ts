/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/nodes.ts
   Everything you can tap and harvest.

   Trees use the shipped art. Ore has no art yet, so rocks are baked
   from the same painting toolkit as the terrain — faceted, lit from
   above, with a contact shadow — and swapped out for real sprites
   later by changing one factory. Fishing spots are pure motion:
   ripple rings over a darker patch of water.

   Every node lives in layers.actors with zIndex = its feet, so it
   depth-sorts against the player for free.
   ═══════════════════════════════════════════════════════════════ */

import { Assets, Container, Sprite, Texture, Rectangle } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { EventBus, QualityTier } from "../core/contracts";
import { WORLD, isWalkable, pathAt } from "./worldmap";
import type { NodeKind, NodeSpawn, ZoneId } from "./worldmap";
import { Rng } from "./rng";
import { makeCanvas, organicPath, blotch, stroke, css, mix, shade, rgb } from "./paint";
import type { Rgb } from "./paint";

export interface NodeTapEvent { id: string; kind: NodeKind; tier: number }

export interface ResourceNode {
  id: string;
  kind: NodeKind;
  zone: ZoneId;
  variant: string;
  x: number;
  y: number;
  tier: number;
  reqLevel: number;
  /** Seconds to regrow after being emptied. */
  respawn: number;
  /** Seconds of work per yield. Read by the skills system. */
  cycle: number;
  depleted: boolean;
  /** World clock at which it comes back; -1 when alive. */
  respawnAt: number;
}

const TREE_SRC: Record<string, [string, string]> = {
  oak: ["assets/world/tree_oak.png", "assets/world/tree_oak_stump.png"],
  birch: ["assets/world/tree_birch.png", "assets/world/tree_birch_stump.png"],
  maple: ["assets/world/tree_maple.png", "assets/world/tree_maple_stump.png"],
  yew: ["assets/world/tree_yew.png", "assets/world/tree_yew_stump.png"],
  elder: ["assets/world/tree_elder.png", "assets/world/tree_elder_stump.png"],
};

/** Base draw height in design units, before per-node scale. A grown
    oak is roughly two and a half player-heights. */
const TREE_H = 430;
/** The trunk meets the ground here in the source art, not at 1.0 —
    anchoring at the true foot is what makes y-sorting look right. */
const TREE_FOOT = 0.955;
const STUMP_FOOT = 0.80;
const STUMP_H = 150;

const ORE_COLOR: Record<string, { core: Rgb; lit: Rgb }> = {
  copper: { core: rgb(190, 106, 52), lit: rgb(238, 158, 92) },
  iron: { core: rgb(158, 156, 150), lit: rgb(226, 224, 216) },
  coal: { core: rgb(44, 46, 54), lit: rgb(110, 116, 128) },
  mithril: { core: rgb(72, 116, 206), lit: rgb(146, 190, 246) },
};

const WATER_COLOR: Record<string, Rgb> = {
  pond: rgb(38, 112, 176),
  shallows: rgb(46, 168, 178),
  deep: rgb(26, 118, 142),
};

interface NodeView {
  node: ResourceNode;
  root: Container;
  alive: Container;
  dead: Container;
  /** Sway phase so a stand of trees does not move in lockstep. */
  phase: number;
  ripples?: Sprite[];
}

export class NodeField {
  private views: NodeView[] = [];
  private byId = new Map<string, NodeView>();
  private textures: Texture[] = [];
  private shadowTex!: Texture;
  private ringTex!: Texture;
  private parent!: Container;
  /** Set by WorldSystem each frame; a pan must never harvest. */
  tapGuard: () => boolean = () => false;

  constructor(private bus: EventBus, private quality: QualityTier) {}

  get all(): readonly ResourceNode[] { return this.views.map((v) => v.node); }

  async build(parent: Container): Promise<void> {
    this.parent = parent;
    const species = new Set<string>();
    for (const s of WORLD.spawns) if (s.kind === "tree") species.add(s.variant);
    const urls: string[] = [];
    for (const sp of species) {
      const pair = TREE_SRC[sp];
      if (pair) urls.push(pair[0], pair[1]);
    }
    await Assets.load(urls);

    this.shadowTex = makeShadowTexture();
    this.ringTex = makeRingTexture();
    this.textures.push(this.shadowTex, this.ringTex);

    for (const spawn of WORLD.spawns) this.spawnGroup(spawn);
  }

  /* ── placement ────────────────────────────────────────────── */

  private spawnGroup(spawn: NodeSpawn) {
    const region = spawn.region ?? findZoneBounds(spawn.zone);
    const rng = new Rng(WORLD.seed + hashStr(spawn.kind + spawn.variant));
    const minGap = spawn.kind === "tree" ? 150 : spawn.kind === "ore" ? 110 : 90;
    let placed = 0;
    // Bounded rejection sampling: a hard cap keeps a badly-shaped
    // region from spinning forever, and short-placing is harmless.
    for (let attempt = 0; attempt < spawn.count * 60 && placed < spawn.count; attempt++) {
      const x = rng.range(region.x, region.x + region.w);
      const y = rng.range(region.y, region.y + region.h);
      if (spawn.kind !== "fish") {
        if (!isWalkable(x, y)) continue;
        // Keep the painted path clear — it is the player's route.
        if (Math.abs(x - pathAt(y).x) < 78) continue;
      }
      let clash = false;
      for (const v of this.views) {
        if (Math.hypot(v.node.x - x, v.node.y - y) < minGap) { clash = true; break; }
      }
      if (clash) continue;

      const scale = spawn.scale ? rng.range(spawn.scale[0], spawn.scale[1]) : 1;
      this.create(spawn, `${spawn.variant}_${placed}`, x, y, scale, rng);
      placed++;
    }
  }

  private create(spawn: NodeSpawn, id: string, x: number, y: number, scale: number, rng: Rng) {
    const node: ResourceNode = {
      id, kind: spawn.kind, zone: spawn.zone, variant: spawn.variant,
      x, y, tier: spawn.tier, reqLevel: spawn.reqLevel,
      respawn: spawn.respawn, cycle: spawn.cycle,
      depleted: false, respawnAt: -1,
    };

    const root = new Container();
    root.position.set(x, y);
    // Feet-anchored y-sort. Fish spots sit slightly behind actors so a
    // player standing in the shallows is not hidden by their own ripple.
    root.zIndex = spawn.kind === "fish" ? y - 6 : y;

    const alive = new Container();
    const dead = new Container();
    dead.visible = false;
    root.addChild(alive, dead);

    let hit: Rectangle;
    let ripples: Sprite[] | undefined;

    if (spawn.kind === "tree") {
      const pair = TREE_SRC[spawn.variant];
      const h = TREE_H * scale;
      const shadow = new Sprite(this.shadowTex);
      shadow.anchor.set(0.5);
      shadow.width = h * 0.62;
      shadow.height = h * 0.2;
      shadow.position.set(0, -h * 0.01);
      shadow.alpha = 0.42;
      alive.addChild(shadow);

      const tree = new Sprite(Assets.get<Texture>(pair[0]));
      tree.anchor.set(0.5, TREE_FOOT);
      tree.width = h; tree.height = h;
      alive.addChild(tree);

      const sh = STUMP_H * scale;
      const stumpShadow = new Sprite(this.shadowTex);
      stumpShadow.anchor.set(0.5);
      stumpShadow.width = sh * 1.1; stumpShadow.height = sh * 0.34;
      stumpShadow.alpha = 0.4;
      dead.addChild(stumpShadow);
      const stump = new Sprite(Assets.get<Texture>(pair[1]));
      stump.anchor.set(0.5, STUMP_FOOT);
      stump.width = sh * 1.5; stump.height = sh * 1.5;
      dead.addChild(stump);

      // Hit the trunk and lower canopy, not the full sprite square —
      // otherwise neighbouring canopies steal each other's taps.
      hit = new Rectangle(-h * 0.26, -h * 0.72, h * 0.52, h * 0.74);
    } else if (spawn.kind === "ore") {
      const size = 168 * scale;
      const full = this.oreTexture(spawn.variant, rng.int(0, 2), false);
      const spent = this.oreTexture(spawn.variant, rng.int(0, 2), true);
      const a = new Sprite(full);
      a.anchor.set(0.5, 0.86);
      a.width = size; a.height = size;
      alive.addChild(a);
      const d = new Sprite(spent);
      d.anchor.set(0.5, 0.86);
      d.width = size * 0.86; d.height = size * 0.86;
      dead.addChild(d);
      hit = new Rectangle(-size * 0.34, -size * 0.5, size * 0.68, size * 0.56);
    } else {
      const size = spawn.variant === "pond" ? 96 : 116;
      const patch = new Sprite(this.shadowTex);
      patch.anchor.set(0.5);
      patch.width = size * 2.1; patch.height = size * 1.15;
      patch.tint = shadeHex(WATER_COLOR[spawn.variant] ?? WATER_COLOR.shallows, 0.6);
      patch.alpha = 0.5;
      alive.addChild(patch);

      ripples = [];
      const ringCount = this.quality === "low" ? 2 : 3;
      for (let i = 0; i < ringCount; i++) {
        const ring = new Sprite(this.ringTex);
        ring.anchor.set(0.5);
        ring.width = size; ring.height = size * 0.55;
        alive.addChild(ring);
        ripples.push(ring);
      }
      // Depleted water: just the patch, no rings — reads as "fished out".
      const spent = new Sprite(this.shadowTex);
      spent.anchor.set(0.5);
      spent.width = size * 1.5; spent.height = size * 0.82;
      spent.tint = shadeHex(WATER_COLOR[spawn.variant] ?? WATER_COLOR.shallows, 0.45);
      spent.alpha = 0.32;
      dead.addChild(spent);
      hit = new Rectangle(-size * 0.8, -size * 0.5, size * 1.6, size);
    }

    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = hit;
    root.on("pointertap", (e: FederatedPointerEvent) => {
      if (this.tapGuard()) return;   // the gesture was a camera pan
      e.stopPropagation();
      const payload: NodeTapEvent = { id: node.id, kind: node.kind, tier: node.tier };
      this.bus.emit("node:tap", payload);
    });

    const view: NodeView = { node, root, alive, dead, phase: rng.range(0, Math.PI * 2), ripples };
    this.views.push(view);
    this.byId.set(id, view);
    this.parent.addChild(root);
  }

  /* ── procedural ore ───────────────────────────────────────── */

  private oreCache = new Map<string, Texture>();

  /** Faceted rock in the painting's language: warm lit top, cool
      shadowed base, hard outline, ore showing in cracked faces. */
  private oreTexture(variant: string, seed: number, spent: boolean): Texture {
    const key = `${variant}:${seed}:${spent ? 1 : 0}`;
    const cached = this.oreCache.get(key);
    if (cached) return cached;

    const S = 256;
    const { cv, ctx } = makeCanvas(S, S);
    const r = new Rng(9001 + hashStr(key));
    const ore = ORE_COLOR[variant] ?? ORE_COLOR.iron;
    const stone = mix(rgb(148, 138, 122), ore.core, 0.16);
    const cx = S * 0.5, cy = S * 0.58;
    const rx = S * (spent ? 0.32 : 0.4), ry = S * (spent ? 0.24 : 0.32);

    blotch(ctx, cx, cy + ry * 0.7, rx * 1.35, ry * 0.5, rgb(18, 16, 14), 0.42);

    // Body.
    organicPath(ctx, cx, cy, rx, ry, r, 0.2, 8);
    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, css(shade(stone, 1.3)));
    g.addColorStop(0.5, css(stone));
    g.addColorStop(1, css(shade(stone, 0.56)));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();

    // Facets: three angular slabs catching different light.
    for (let i = 0; i < 3; i++) {
      const fx = cx + r.jitter(rx * 0.5);
      const fy = cy + r.jitter(ry * 0.5);
      organicPath(ctx, fx, fy, rx * r.range(0.3, 0.55), ry * r.range(0.3, 0.6), r, 0.34, 6);
      ctx.fillStyle = css(shade(stone, r.bool(0.5) ? r.range(1.1, 1.28) : r.range(0.68, 0.85)), 0.55);
      ctx.fill();
    }
    if (spent) {
      // A dark bite taken out of the top — unmistakably mined.
      organicPath(ctx, cx + r.jitter(rx * 0.3), cy - ry * 0.3, rx * 0.45, ry * 0.4, r, 0.3, 7);
      ctx.fillStyle = css(rgb(30, 26, 24), 0.72);
      ctx.fill();
    } else {
      // Ore showing: a cluster of angular gems with a hot highlight.
      const gems = variant === "mithril" ? 5 : 7;
      for (let i = 0; i < gems; i++) {
        const gx = cx + r.jitter(rx * 0.62);
        const gy = cy + r.jitter(ry * 0.62);
        const gr = r.range(S * 0.022, S * 0.05);
        organicPath(ctx, gx, gy, gr, gr * 0.86, r, 0.4, 5);
        ctx.fillStyle = css(ore.core, 0.95);
        ctx.fill();
        ctx.fillStyle = css(ore.lit, 0.9);
        ctx.beginPath();
        ctx.ellipse(gx - gr * 0.22, gy - gr * 0.3, gr * 0.4, gr * 0.3, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Cracks.
    for (let i = 0; i < 5; i++) {
      stroke(ctx, cx + r.jitter(rx * 0.7), cy + r.jitter(ry * 0.7),
        r.jitter(rx * 0.6), r.range(ry * 0.2, ry * 0.7), r.range(1.4, 3),
        shade(stone, 0.44), r.range(0.25, 0.5));
    }
    ctx.restore();

    ctx.strokeStyle = css(shade(stone, 0.36), 0.7);
    ctx.lineWidth = 3;
    organicPath(ctx, cx, cy, rx, ry, new Rng(9001 + hashStr(key)), 0.2, 8);
    ctx.stroke();
    // Rim light along the top so it reads against dark rock ground.
    ctx.strokeStyle = css(shade(stone, 1.5), 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, Math.PI * 1.15, Math.PI * 1.9);
    ctx.stroke();

    const tex = Texture.from(cv);
    this.textures.push(tex);
    this.oreCache.set(key, tex);
    return tex;
  }

  /* ── state ────────────────────────────────────────────────── */

  get(id: string): ResourceNode | undefined { return this.byId.get(id)?.node; }

  byZone(zone: ZoneId): ResourceNode[] {
    return this.views.filter((v) => v.node.zone === zone).map((v) => v.node);
  }

  /** Closest live node of a kind. Used by auto-gather and by the
      "walk to the nearest tree" affordance. */
  nearest(x: number, y: number, kind?: NodeKind, maxLevel = Infinity): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestD = Infinity;
    for (const v of this.views) {
      const n = v.node;
      if (n.depleted) continue;
      if (kind && n.kind !== kind) continue;
      if (n.reqLevel > maxLevel) continue;
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /** Empty a node. Returns false if it was already spent. */
  deplete(id: string, now: number): boolean {
    const v = this.byId.get(id);
    if (!v || v.node.depleted) return false;
    v.node.depleted = true;
    v.node.respawnAt = now + v.node.respawn;
    v.alive.visible = false;
    v.dead.visible = true;
    this.bus.emit("node:depleted", { id, kind: v.node.kind, tier: v.node.tier });
    return true;
  }

  respawnNow(id: string) {
    const v = this.byId.get(id);
    if (!v || !v.node.depleted) return;
    v.node.depleted = false;
    v.node.respawnAt = -1;
    v.alive.visible = true;
    v.dead.visible = false;
    this.bus.emit("node:respawn", { id, kind: v.node.kind, tier: v.node.tier });
  }

  update(_dt: number, now: number) {
    for (const v of this.views) {
      if (v.node.depleted && now >= v.node.respawnAt) this.respawnNow(v.node.id);
    }
  }

  /** Sway + ripples, on-screen nodes only. */
  render(t: number, viewTop: number, viewBottom: number) {
    for (const v of this.views) {
      const y = v.node.y;
      const on = y > viewTop - 520 && y < viewBottom + 220;
      v.root.renderable = on;
      if (!on) continue;
      if (v.node.kind === "tree" && !v.node.depleted) {
        // Rotating about the feet turns a stiff sprite into a tree in
        // wind for one sin() per frame.
        v.alive.rotation = Math.sin(t * 0.55 + v.phase) * 0.011;
      } else if (v.ripples && !v.node.depleted) {
        for (let i = 0; i < v.ripples.length; i++) {
          const ring = v.ripples[i];
          const k = ((t * 0.42 + v.phase + i / v.ripples.length) % 1);
          const s = 0.25 + k * 0.95;
          ring.scale.set(s, s * 0.55);
          ring.alpha = (1 - k) * 0.55;
        }
      }
    }
  }

  destroy() {
    for (const v of this.views) v.root.destroy({ children: true });
    for (const t of this.textures) t.destroy(true);
    this.views.length = 0;
    this.byId.clear();
    this.oreCache.clear();
    this.textures.length = 0;
  }
}

/* ── helpers ─────────────────────────────────────────────────── */

function findZoneBounds(zone: ZoneId) {
  const z = WORLD.zones.find((v) => v.id === zone);
  return z ? z.bounds : { x: 0, y: 0, w: WORLD.width, h: WORLD.height };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function shadeHex(c: Rgb, k: number): number {
  const s = shade(c, k);
  return ((s.r & 255) << 16) | ((s.g & 255) << 8) | (s.b & 255);
}

/** One soft ellipse, tinted per use. Shared by every shadow and
    water patch in the world — one texture, endless reuse. */
function makeShadowTexture(): Texture {
  const S = 128;
  const { cv, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.72)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = Texture.from(cv);
  return tex;
}

/** Expanding ripple ring. */
function makeRingTexture(): Texture {
  const S = 128;
  const { cv, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.24, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.62, "rgba(236,252,255,0.85)");
  g.addColorStop(0.86, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(cv);
}
