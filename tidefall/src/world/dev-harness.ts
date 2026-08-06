/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/dev-harness.ts
   Visual QA rig for the world system. NOT shipped in the game loop —
   it is imported by hand from the console or a Playwright script:

     await import("/src/world/dev-harness.ts").then(m => m.mountWorldDev())

   It builds its own layers over the running Application so the world
   can be inspected without touching game.ts or main.ts. It also drops
   in a stand-in player so depth sorting is provable.
   ═══════════════════════════════════════════════════════════════ */

import { Application, Assets, Container, Sprite, Texture } from "pixi.js";
import type { Viewport } from "../core/viewport";
import { EventBus, detectQuality } from "../core/contracts";
import type { GameContext, SceneLayers, QualityTier } from "../core/contracts";
import { WorldSystem } from "./index";
import { WORLD, anchor, clampToWalkable } from "./worldmap";
import type { AnchorId } from "./worldmap";
import type { Weather } from "./atmosphere";

interface Handle {
  system: WorldSystem;
  layers: SceneLayers;
  player: Container;
  bus: EventBus;
  taps: unknown[];
  goTo(id: AnchorId): void;
  movePlayer(x: number, y: number): void;
  step(seconds: number): void;
  setWeather(w: Weather): void;
  setTime(t: number): void;
  setZoom(z: number): void;
}

export async function mountWorldDev(opts: { quality?: QualityTier } = {}): Promise<Handle> {
  const g = (window as unknown as { TIDEFALL?: { app: Application; viewport: Viewport } }).TIDEFALL;
  if (!g) throw new Error("dev-harness: boot main.ts first");
  const { app, viewport } = g;

  // Take the stage; whatever game.ts drew for first light goes away.
  app.stage.removeChildren();

  const world = new Container();
  const layers: SceneLayers = {
    terrain: new Container(),
    ground: new Container(),
    actors: new Container(),
    overhead: new Container(),
    fx: new Container(),
    worldUi: new Container(),
  };
  layers.actors.sortableChildren = true;
  world.addChild(layers.terrain, layers.ground, layers.actors, layers.overhead, layers.fx, layers.worldUi);
  app.stage.addChild(world);

  const bus = new EventBus();
  let clock = 0;
  const ctx: GameContext = { app, viewport, now: () => clock, bus };
  const quality = opts.quality ?? detectQuality(viewport.metrics.dpr);

  const system = new WorldSystem({ layers, world, quality, dayLength: 240, startTime: 0.36 });
  await system.init(ctx);

  // Stand-in player: real art, feet-anchored, zIndex = y. If this ever
  // draws in front of a tree it is standing behind, sorting is broken.
  const tex = await Assets.load<Texture>("assets/actors/char_idle.png");
  const player = new Container();
  const body = new Sprite(tex);
  body.anchor.set(0.5, 0.94);
  body.height = 190;
  body.width = 190 * (tex.width / tex.height);
  player.addChild(body);
  const start = anchor("spawn");
  player.position.set(start.x, start.y);
  player.zIndex = start.y;
  layers.actors.addChild(player);
  system.follow(player.position);

  const taps: unknown[] = [];
  bus.on("node:tap", (p) => { taps.push(p); console.log("[node:tap]", p); });
  bus.on("world:tap", (p) => { taps.push(p); console.log("[world:tap]", p); });

  const FIXED = 1 / 60;
  let acc = 0;
  app.ticker.add((ticker) => {
    acc += Math.min(ticker.deltaMS / 1000, 0.25);
    while (acc >= FIXED) {
      clock += FIXED;
      system.update(FIXED, clock);
      acc -= FIXED;
    }
    system.render(clock);
  });

  const handle: Handle = {
    system, layers, player, bus, taps,
    goTo(id) {
      const a = anchor(id);
      handle.movePlayer(a.x, a.y);
      system.camera.snapTo(a.x, a.y);
    },
    movePlayer(x, y) {
      const p = clampToWalkable(x, y);
      player.position.set(p.x, p.y);
      player.zIndex = p.y;
    },
    step(seconds) {
      // Drive the simulation directly. Wall-clock waits are useless for
      // timing assertions under a software renderer running at 1 fps.
      const n = Math.round(seconds / FIXED);
      for (let i = 0; i < n; i++) { clock += FIXED; system.update(FIXED, clock); }
      system.render(clock);
      // Pixi only refreshes worldTransform during an actual render, and
      // hit testing reads it. Without this, a stepped camera move leaves
      // every node un-tappable until the next real frame.
      app.render();
    },
    setWeather: (w) => system.setWeather(w),
    setTime: (t) => { system.atmosphere.paused = true; system.setTimeOfDay(t); },
    setZoom: (z) => system.camera.setZoom(z),
  };

  (window as unknown as Record<string, unknown>).WORLD_DEV = handle;
  (window as unknown as Record<string, unknown>).WORLD_CFG = WORLD;
  (window as unknown as Record<string, unknown>).WORLD_QUALITY = quality;
  return handle;
}
