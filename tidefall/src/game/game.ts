/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — game.ts
   The orchestrator: builds layers, owns the fixed-step loop, and
   runs whatever systems are registered. Systems live elsewhere.
   ═══════════════════════════════════════════════════════════════ */

import { Application, Container, Assets, Sprite, Text } from "pixi.js";
import type { Viewport } from "../core/viewport";
import { DESIGN_W } from "../core/viewport";
import { EventBus, detectQuality } from "../core/contracts";
import type { GameContext, SceneLayers, System } from "../core/contracts";

const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;

export async function startGame(opts: { app: Application; viewport: Viewport }) {
  const { app, viewport } = opts;
  const bus = new EventBus();
  let clock = 0;

  const ctx: GameContext = { app, viewport, now: () => clock, bus };
  const quality = detectQuality(viewport.metrics.dpr);

  // ── layers ──
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

  // ── first light: the island, so the portrait frame is provable ──
  const islandTex = await Assets.load("assets/world/bg_island.png");
  const island = new Sprite(islandTex);
  island.width = DESIGN_W;
  island.height = DESIGN_W * (islandTex.height / islandTex.width);
  layers.terrain.addChild(island);

  const stamp = new Text({
    text: `TIDEFALL · portrait ${Math.round(viewport.metrics.frameW)}×${Math.round(viewport.metrics.frameH)} · ${quality}`,
    style: { fill: 0xf3ead6, fontSize: 26, fontFamily: "system-ui", fontWeight: "700" },
  });
  stamp.position.set(24, 24);
  layers.worldUi.addChild(stamp);

  // ── systems (filled in by the specialist agents) ──
  const systems: System[] = [];
  for (const s of systems) await s.init(ctx);

  // ── fixed-step loop ──
  let acc = 0;
  app.ticker.add((ticker) => {
    const frame = Math.min(ticker.deltaMS / 1000, MAX_FRAME);
    acc += frame;
    while (acc >= FIXED_DT) {
      clock += FIXED_DT;
      for (const s of systems) s.update?.(FIXED_DT, clock);
      acc -= FIXED_DT;
    }
    const alpha = acc / FIXED_DT;
    for (const s of systems) s.render?.(clock, alpha);
  });

  return { ctx, layers, world, systems, quality };
}
