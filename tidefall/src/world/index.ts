/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — world/index.ts
   The world system: camera, terrain, resource nodes, atmosphere.

   Owns everything you can see standing on the island and nothing
   you can do to it. Harvest rules, inventory and combat live in
   other systems and talk to this one over the bus:

     emits   node:tap        { id, kind, tier }
             node:depleted   { id, kind, tier }
             node:respawn    { id, kind, tier }
             world:tap       { x, y, zone }
             world:phase     { phase, t }
             world:weather   { weather }
     listens world:setWeather   "clear" | "rain" | "fog"
             world:setTime      0..1  (0 = midnight)
             world:setDayLength seconds per day
   ═══════════════════════════════════════════════════════════════ */

import { Container, Sprite, Texture } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { GameContext, SceneLayers, System, QualityTier } from "../core/contracts";
import { Camera } from "./camera";
import { Terrain } from "./terrain";
import { NodeField } from "./nodes";
import { Atmosphere } from "./atmosphere";
import type { Weather } from "./atmosphere";
import { WORLD, zoneAt, anchor } from "./worldmap";
import type { AnchorId } from "./worldmap";
import type { Vec2 } from "./camera";

export interface WorldSystemOptions {
  /** The scene layers built by game.ts. */
  layers: SceneLayers;
  /** The container those layers live in — the camera transforms it. */
  world: Container;
  quality: QualityTier;
  /** Seconds of real time per in-game day. */
  dayLength?: number;
  /** 0 = midnight, 0.5 = noon. */
  startTime?: number;
  startWeather?: Weather;
}

export class WorldSystem implements System {
  readonly id = "world";

  camera!: Camera;
  readonly terrain: Terrain;
  nodes!: NodeField;
  atmosphere!: Atmosphere;

  private layers: SceneLayers;
  private worldRoot: Container;
  private quality: QualityTier;
  private opts: WorldSystemOptions;
  private groundTap: Sprite | null = null;
  private ctx!: GameContext;

  constructor(opts: WorldSystemOptions) {
    this.opts = opts;
    this.layers = opts.layers;
    this.worldRoot = opts.world;
    this.quality = opts.quality;
    this.terrain = new Terrain(this.quality);
  }

  async init(ctx: GameContext): Promise<void> {
    this.ctx = ctx;
    // Depth sorting is the contract every actor in the game relies on.
    this.layers.actors.sortableChildren = true;

    this.camera = new Camera({
      world: this.worldRoot,
      viewport: ctx.viewport,
      worldW: WORLD.width,
      worldH: WORLD.height,
    }, ctx.app.canvas as HTMLCanvasElement);

    // Ground taps: a world-sized invisible plate under the terrain art.
    // Nodes stop propagation, so this only fires on empty ground.
    const plate = new Sprite(Texture.WHITE);
    plate.width = WORLD.width;
    plate.height = WORLD.height;
    plate.alpha = 0;
    plate.eventMode = "static";
    plate.on("pointertap", (e: FederatedPointerEvent) => {
      if (this.camera.gestureWasPan) return;
      // The plate sits at the world origin, so its local space IS
      // world space — no manual un-projecting of the camera needed.
      const p = e.getLocalPosition(plate);
      ctx.bus.emit("world:tap", { x: p.x, y: p.y, zone: zoneAt(p.x, p.y) });
    });
    this.layers.terrain.addChild(plate);
    this.groundTap = plate;

    await this.terrain.build(this.layers.terrain);

    this.nodes = new NodeField(ctx.bus, this.quality);
    this.nodes.tapGuard = () => this.camera.gestureWasPan;
    await this.nodes.build(this.layers.actors);

    this.atmosphere = new Atmosphere(ctx.bus, this.quality, this.camera);
    this.atmosphere.dayLength = this.opts.dayLength ?? 720;
    this.atmosphere.setTimeOfDay(this.opts.startTime ?? 0.36);
    this.atmosphere.build(this.layers.fx);
    if (this.opts.startWeather) this.atmosphere.setWeather(this.opts.startWeather);

    // Open on the holding, framed, before anything asks to be followed.
    const home = anchor("spawn");
    this.camera.snapTo(home.x, home.y);
  }

  update(dt: number, t: number): void {
    this.camera.update(dt);
    this.atmosphere.update(dt);
    // Particles are stepped on the fixed clock so they stay
    // deterministic and frame-rate independent.
    this.atmosphere.render(t, dt);
    this.nodes.update(dt, t);
  }

  render(t: number): void {
    const view = this.camera.visibleRect(0);
    const top = view.y, bottom = view.y + view.h;
    this.terrain.update(t);
    this.terrain.cull(top, bottom);
    this.nodes.render(t, top, bottom);
  }

  /* ── the surface other systems drive ──────────────────────── */

  /** Attach the camera to a live position (usually the player). */
  follow(target: Vec2 | null) { this.camera.follow(target); }

  /** Frame a named place immediately. */
  goTo(id: AnchorId) {
    const a = anchor(id);
    this.camera.snapTo(a.x, a.y);
  }

  setWeather(w: Weather) { this.atmosphere.setWeather(w); }
  setTimeOfDay(t01: number) { this.atmosphere.setTimeOfDay(t01); }

  /** Harvest bookkeeping lives in the skills system; it calls this
      when a node runs out. */
  deplete(id: string) { return this.nodes.deplete(id, this.ctx.now()); }

  destroy(): void {
    this.camera.destroy();
    this.nodes.destroy();
    this.atmosphere.destroy();
    this.terrain.destroy();
    this.groundTap?.destroy();
    this.groundTap = null;
  }
}

export { Camera } from "./camera";
export { Terrain } from "./terrain";
export { NodeField } from "./nodes";
export { Atmosphere } from "./atmosphere";
export type { Weather, Phase } from "./atmosphere";
export type { ResourceNode, NodeTapEvent } from "./nodes";
export {
  WORLD, ISLAND, zoneAt, zoneDef, anchor, isWalkable, clampToWalkable, pathAt,
} from "./worldmap";
export type { ZoneId, ZoneDef, NodeKind, NodeSpawn, AnchorId, Rect } from "./worldmap";
