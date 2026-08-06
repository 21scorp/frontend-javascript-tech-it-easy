/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/atmosphere.ts
   Time of day and weather.

   The tint is a single world-sized multiply sprite plus a warm wash
   — two draw calls for the entire lighting mood, which is what lets
   this run on a low-tier phone at all. Lanterns are additive pools
   at named anchors, so lighting the base is a data change.

   Weather particles are pooled once at the tier budget and never
   allocated again; they are recycled inside the camera's visible
   rect, so a bigger world costs nothing extra.
   ═══════════════════════════════════════════════════════════════ */

import { Container, Sprite, Texture } from "pixi.js";
import type { EventBus, QualityTier } from "../core/contracts";
import { WORLD } from "./worldmap";
import type { AnchorId } from "./worldmap";
import { Rng, clamp, smoothstep } from "./rng";
import { makeCanvas, css, rgb, mix } from "./paint";
import type { Rgb } from "./paint";
import type { Camera } from "./camera";

export type Weather = "clear" | "rain" | "fog";
export type Phase = "night" | "dawn" | "day" | "dusk";

interface Budget { rain: number; splash: number; fog: number; clouds: number }

/** Particle counts per tier. "low" drops hard on purpose: rain is the
    single most expensive thing we draw and the least load-bearing. */
const BUDGET: Record<QualityTier, Budget> = {
  low: { rain: 80, splash: 6, fog: 4, clouds: 0 },
  mid: { rain: 170, splash: 18, fog: 10, clouds: 5 },
  high: { rain: 340, splash: 32, fog: 16, clouds: 7 },
};

/** Lit places. Adding a lantern is adding a line here. */
const LANTERNS: Array<{ at: AnchorId; radius: number; color: Rgb }> = [
  { at: "base.home", radius: 320, color: rgb(255, 206, 142) },
  { at: "base.stall", radius: 250, color: rgb(255, 194, 132) },
  { at: "mine.entrance", radius: 240, color: rgb(255, 186, 126) },
  { at: "coast.jetty", radius: 260, color: rgb(255, 214, 158) },
  { at: "wilds.camp", radius: 210, color: rgb(158, 208, 244) },
];

interface Key { t: number; tint: Rgb; alpha: number; warm: Rgb; warmA: number }

/** One full day, keyed at 0 = midnight. Interpolated, wrapping. */
const DAY: Key[] = [
  { t: 0.00, tint: rgb(38, 54, 108), alpha: 0.74, warm: rgb(84, 116, 206), warmA: 0.05 },
  { t: 0.20, tint: rgb(48, 64, 118), alpha: 0.68, warm: rgb(116, 138, 218), warmA: 0.05 },
  { t: 0.27, tint: rgb(158, 122, 132), alpha: 0.32, warm: rgb(255, 156, 92), warmA: 0.18 },
  { t: 0.34, tint: rgb(252, 238, 214), alpha: 0.10, warm: rgb(255, 214, 158), warmA: 0.08 },
  { t: 0.50, tint: rgb(255, 255, 255), alpha: 0.00, warm: rgb(255, 246, 226), warmA: 0.03 },
  { t: 0.68, tint: rgb(255, 236, 200), alpha: 0.07, warm: rgb(255, 206, 142), warmA: 0.07 },
  { t: 0.77, tint: rgb(196, 128, 104), alpha: 0.30, warm: rgb(255, 132, 66), warmA: 0.20 },
  { t: 0.85, tint: rgb(72, 70, 132), alpha: 0.60, warm: rgb(140, 120, 200), warmA: 0.08 },
  { t: 1.00, tint: rgb(38, 54, 108), alpha: 0.74, warm: rgb(84, 116, 206), warmA: 0.05 },
];

interface Drop { s: Sprite; vx: number; vy: number; depth: number }

export class Atmosphere {
  private root = new Container();
  private tint!: Sprite;
  private warm!: Sprite;
  private haze!: Sprite;
  private lanternLayer = new Container();
  private lanterns: Array<{ s: Sprite; phase: number }> = [];
  private cloudLayer = new Container();
  private clouds: Array<{ s: Sprite; vx: number }> = [];
  private rainLayer = new Container();
  private drops: Drop[] = [];
  private splashes: Array<{ s: Sprite; life: number }> = [];
  private fogLayer = new Container();
  private fogs: Array<{ s: Sprite; vx: number; phase: number }> = [];
  private textures: Texture[] = [];
  private budget: Budget;

  /** 0 = midnight, 0.5 = noon. */
  timeOfDay = 0.34;
  /** Seconds of real time per in-game day. */
  dayLength = 720;
  paused = false;

  private weather: Weather = "clear";
  private wet = 0;       // eased 0..1 rain presence
  private foggy = 0;     // eased 0..1 fog presence
  private phase: Phase = "day";
  private night = 0;
  private rainSeeded = false;
  private offBus: Array<() => void> = [];

  constructor(private bus: EventBus, quality: QualityTier, private camera: Camera) {
    this.budget = BUDGET[quality];
  }

  get view() { return this.root; }
  /** 0 by day, 1 at deep night. Combat/spawn systems read this. */
  get nightFactor() { return this.night; }
  get currentPhase() { return this.phase; }
  get currentWeather() { return this.weather; }

  build(parent: Container) {
    const glow = makeGlowTexture();
    const drop = makeDropTexture();
    const puff = makePuffTexture();
    const ring = makeSplashTexture();
    this.textures.push(glow, drop, puff, ring);

    // Cloud shadows sit under the tint: they darken ground, not sky.
    this.root.addChild(this.cloudLayer);
    this.tint = worldQuad();
    this.tint.blendMode = "multiply";
    this.tint.alpha = 0;
    this.root.addChild(this.tint);

    this.warm = worldQuad();
    this.warm.blendMode = "add";
    this.warm.alpha = 0;
    this.root.addChild(this.warm);

    // Lanterns must beat the tint, so they come after it.
    this.root.addChild(this.lanternLayer);
    for (const l of LANTERNS) {
      const a = WORLD.anchors[l.at];
      const s = new Sprite(glow);
      s.anchor.set(0.5);
      s.width = l.radius * 2;
      s.height = l.radius * 1.5;   // squashed: light pools on the ground
      s.position.set(a.x, a.y - 10);
      s.tint = toHexRgb(l.color);
      s.blendMode = "add";
      s.alpha = 0;
      this.lanternLayer.addChild(s);
      this.lanterns.push({ s, phase: this.lanterns.length * 1.7 });
    }

    this.haze = worldQuad();
    this.haze.tint = 0xc9d8e2;
    this.haze.alpha = 0;
    this.root.addChild(this.haze, this.fogLayer, this.rainLayer);

    const r = new Rng(WORLD.seed ^ 0xa17);
    for (let i = 0; i < this.budget.clouds; i++) {
      const s = new Sprite(puff);
      s.anchor.set(0.5);
      s.width = r.range(500, 950);
      s.height = r.range(280, 520);
      s.position.set(r.range(0, WORLD.width), r.range(0, WORLD.height));
      s.tint = 0x22314a;
      s.blendMode = "multiply";
      s.alpha = 0.12;
      this.cloudLayer.addChild(s);
      this.clouds.push({ s, vx: r.range(9, 20) });
    }

    for (let i = 0; i < this.budget.rain; i++) {
      const s = new Sprite(drop);
      s.anchor.set(0.5);
      // Three depth bands: near drops are longer, faster and brighter.
      const depth = 0.45 + (i % 3) * 0.3;
      // At 1080 design units across, a 3px streak is a scratch on the
      // lens. Rain has to be fat and long to read on a phone.
      s.width = 5.4 * depth;
      s.height = r.range(52, 88) * depth;
      s.tint = 0xd8ecff;
      s.alpha = 0;
      s.rotation = 0.16;
      this.rainLayer.addChild(s);
      this.drops.push({ s, vx: 260, vy: r.range(1500, 1900) * depth, depth });
    }

    for (let i = 0; i < this.budget.splash; i++) {
      const s = new Sprite(ring);
      s.anchor.set(0.5);
      s.alpha = 0;
      s.tint = 0xdff2ff;
      this.rainLayer.addChild(s);
      this.splashes.push({ s, life: r.next() });
    }

    for (let i = 0; i < this.budget.fog; i++) {
      const s = new Sprite(puff);
      s.anchor.set(0.5);
      s.width = r.range(700, 1300);
      s.height = r.range(320, 620);
      s.tint = 0xe4eef4;
      s.alpha = 0;
      this.fogLayer.addChild(s);
      this.fogs.push({ s, vx: r.range(-26, 26) || 14, phase: r.range(0, 6.28) });
    }

    parent.addChild(this.root);

    // External control: any system can drive the sky.
    this.offBus.push(
      this.bus.on<Weather>("world:setWeather", (w) => this.setWeather(w)),
      this.bus.on<number>("world:setTime", (t) => this.setTimeOfDay(t)),
      this.bus.on<number>("world:setDayLength", (s) => { if (s > 0) this.dayLength = s; }),
    );
  }

  setWeather(w: Weather) {
    if (w === this.weather) return;
    this.weather = w;
    this.bus.emit("world:weather", { weather: w });
  }

  setTimeOfDay(t01: number) {
    this.timeOfDay = ((t01 % 1) + 1) % 1;
  }

  update(dt: number) {
    if (!this.paused) this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;

    const k = sampleDay(this.timeOfDay);
    // Rain flattens and cools the light; fog lifts and greys it.
    const rainDim = this.wet * 0.30;
    this.tint.tint = toHexRgb(this.wet > 0.01 ? mix(k.tint, rgb(104, 122, 142), this.wet * 0.66) : k.tint);
    this.tint.alpha = clamp(k.alpha + rainDim, 0, 0.9);
    this.warm.tint = toHexRgb(k.warm);
    this.warm.alpha = k.warmA * (1 - this.wet * 0.7) * (1 - this.foggy * 0.5);

    // Night runs from dusk to dawn; the curve is what lanterns follow.
    this.night = clamp(
      Math.max(
        1 - smoothstep(0.20, 0.33, this.timeOfDay),
        smoothstep(0.72, 0.86, this.timeOfDay),
      ), 0, 1,
    );
    const nextPhase = phaseFor(this.timeOfDay);
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.bus.emit("world:phase", { phase: nextPhase, t: this.timeOfDay });
    }

    // Ease weather so it arrives and leaves rather than snapping.
    const targetWet = this.weather === "rain" ? 1 : 0;
    const targetFog = this.weather === "fog" ? 1 : 0;
    const ease = 1 - Math.exp(-dt / 1.6);
    this.wet += (targetWet - this.wet) * ease;
    this.foggy += (targetFog - this.foggy) * ease;
  }

  /** Everything that has to track the camera happens here. */
  render(t: number, dt: number) {
    const view = this.camera.visibleRect(120);
    const vx = view.x, vy = view.y, vw = view.w, vh = view.h;

    // Fit the full-screen washes to the camera rather than the world.
    // A world-sized quad is roughly four screens of overdraw at
    // cover-fit zoom, and there are three of them — the single
    // cheapest fill-rate saving available on a phone.
    for (const q of [this.tint, this.warm, this.haze]) {
      q.position.set(vx, vy);
      q.width = vw;
      q.height = vh;
    }

    for (const l of this.lanterns) {
      // Slow flicker — two out-of-phase sines never look periodic.
      const flick = 0.9 + 0.06 * Math.sin(t * 3.1 + l.phase) + 0.04 * Math.sin(t * 7.7 + l.phase * 2);
      l.s.alpha = this.night * 0.52 * flick;
      l.s.visible = l.s.alpha > 0.01;
    }

    if (this.clouds.length) {
      const show = (1 - this.foggy) * (1 - this.night * 0.7);
      for (const c of this.clouds) {
        c.s.x += c.vx * dt;
        if (c.s.x - c.s.width > WORLD.width) c.s.x = -c.s.width;
        c.s.alpha = 0.13 * show;
        c.s.visible = c.s.alpha > 0.01;
      }
    }

    // Rain.
    const rainOn = this.wet > 0.01;
    this.rainLayer.visible = rainOn;
    if (!rainOn) this.rainSeeded = false;
    if (rainOn) {
      if (!this.rainSeeded) {
        // Seed the whole field across the view the moment rain starts.
        // Feeding drops in from the top edge alone leaves a second and
        // a half of empty sky, and the pool starts life at the world
        // origin — four screens from wherever the player is standing.
        for (const d of this.drops) {
          d.s.x = vx + Math.random() * vw;
          d.s.y = vy + Math.random() * vh;
        }
        this.rainSeeded = true;
      }
      for (const d of this.drops) {
        const s = d.s;
        s.x += d.vx * dt;
        s.y += d.vy * dt;
        // Recycle past the bottom or the sides, and after a big camera
        // jump. The respawn band must sit INSIDE the "too far above"
        // bound or drops teleport above the view every frame and never
        // fall into it.
        if (s.y > vy + vh || s.y < vy - 900 || s.x < vx - 500 || s.x > vx + vw + 500) {
          s.x = vx + Math.random() * (vw + 500) - 250;
          s.y = vy - Math.random() * 240;
        }
        s.alpha = 0.62 * this.wet * d.depth;
      }
      for (const sp of this.splashes) {
        sp.life -= dt * 2.6;
        if (sp.life <= 0) {
          sp.life = 1;
          sp.s.x = vx + Math.random() * vw;
          sp.s.y = vy + Math.random() * vh;
        }
        const g = 1 - sp.life;
        sp.s.width = 14 + g * 62;
        sp.s.height = (14 + g * 62) * 0.45;
        sp.s.alpha = sp.life * 0.6 * this.wet;
      }
    }

    // Fog.
    const fogOn = this.foggy > 0.01;
    this.fogLayer.visible = fogOn;
    this.haze.alpha = this.foggy * 0.20;
    if (fogOn) {
      for (let i = 0; i < this.fogs.length; i++) {
        const f = this.fogs[i];
        f.s.x += f.vx * dt;
        f.s.y = vy + ((i + 0.5) / this.fogs.length) * vh + Math.sin(t * 0.18 + f.phase) * 60;
        if (f.s.x - f.s.width > vx + vw) f.s.x = vx - f.s.width;
        if (f.s.x + f.s.width < vx) f.s.x = vx + vw + f.s.width;
        f.s.alpha = this.foggy * (0.16 + 0.1 * Math.sin(t * 0.3 + f.phase));
      }
    }
  }

  destroy() {
    for (const off of this.offBus) off();
    this.offBus.length = 0;
    this.root.destroy({ children: true });
    for (const t of this.textures) t.destroy(true);
    this.textures.length = 0;
    this.drops.length = 0;
    this.fogs.length = 0;
    this.clouds.length = 0;
    this.splashes.length = 0;
    this.lanterns.length = 0;
  }
}

/* ── helpers ─────────────────────────────────────────────────── */

/** A white quad, resized to the camera rect every frame by render().
    Starts world-sized so the very first frame is covered even if
    render() has not run yet. */
function worldQuad(): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.width = WORLD.width;
  s.height = WORLD.height;
  s.position.set(0, 0);
  return s;
}

function toHexRgb(c: Rgb): number {
  return ((c.r & 255) << 16) | ((c.g & 255) << 8) | (c.b & 255);
}

function phaseFor(t: number): Phase {
  if (t < 0.22 || t >= 0.86) return "night";
  if (t < 0.33) return "dawn";
  if (t < 0.74) return "day";
  return "dusk";
}

function sampleDay(t: number): Key {
  let a = DAY[0], b = DAY[DAY.length - 1];
  for (let i = 1; i < DAY.length; i++) {
    if (t <= DAY[i].t) { a = DAY[i - 1]; b = DAY[i]; break; }
  }
  const span = b.t - a.t || 1;
  const k = clamp((t - a.t) / span, 0, 1);
  return {
    t,
    tint: mix(a.tint, b.tint, k),
    alpha: a.alpha + (b.alpha - a.alpha) * k,
    warm: mix(a.warm, b.warm, k),
    warmA: a.warmA + (b.warmA - a.warmA) * k,
  };
}

function makeGlowTexture(): Texture {
  const S = 256;
  const { cv, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(255,255,255,0.55)");
  g.addColorStop(0.62, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return Texture.from(cv);
}

function makeDropTexture(): Texture {
  const { cv, ctx } = makeCanvas(8, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(2.5, 0, 3, 64);
  return Texture.from(cv);
}

function makeSplashTexture(): Texture {
  const S = 64;
  const { cv, ctx } = makeCanvas(S, S);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(S / 2, S / 2, S * 0.38, S * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  return Texture.from(cv);
}

/** Soft irregular puff, shared by fog banks and cloud shadows. */
function makePuffTexture(): Texture {
  const S = 256;
  const { cv, ctx } = makeCanvas(S, S);
  const r = new Rng(4242);
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + r.jitter(S * 0.28);
    const y = S / 2 + r.jitter(S * 0.16);
    const rad = r.range(S * 0.14, S * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, css(rgb(255, 255, 255), 0.2));
    g.addColorStop(1, css(rgb(255, 255, 255), 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return Texture.from(cv);
}
