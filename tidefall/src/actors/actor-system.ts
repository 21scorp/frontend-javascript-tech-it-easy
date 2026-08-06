/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/actor-system.ts
   The System wrapper: owns the sheet pack, the player, every NPC,
   and the bus wiring. Drop it in game.ts's systems array and hand
   it the scene layers; it never reaches for anything else.

     const actors = new ActorSystem({ layers });
     systems.push(actors);

   Bus in   player:walkTo {x,y} · player:work {x,y,state} ·
            player:stop · player:play {state} · player:appearance {appearance}
   Bus out  actors:ready · player:arrived {x,y} ·
            actor:impact {id,state,x,y,facing} · actor:anim {id,state}
   ═══════════════════════════════════════════════════════════════ */

import { Container } from "pixi.js";
import type { GameContext, SceneLayers, System } from "../core/contracts";
import { DESIGN_W } from "../core/viewport";
import { Actor } from "./actor";
import type { ActorOptions } from "./actor";
import type { AnimStateId } from "./animation";
import { CharacterCreator } from "./creator";
import { SheetPack } from "./sheets";
import {
  cloneAppearance, defaultAppearance, normalizeAppearance, randomAppearance, seededRng,
} from "./character";
import type { CharacterAppearance } from "./character";

export interface ActorSystemOptions {
  /** Preferred: actors are parented into layers.actors (y-sorted). */
  layers?: Pick<SceneLayers, "actors">;
  /** Fallback parent when there are no layers (tools, tests). */
  parent?: Container;
  /** Starting look for the player. */
  appearance?: CharacterAppearance;
  /** Player height in design units. */
  playerHeight?: number;
  /** Where the player stands on boot, design units. */
  spawn?: { x: number; y: number };
}

export type SpawnOptions = Omit<ActorOptions, "sheets">;

export interface WalkCommand { x: number; y: number }
export interface WorkCommand { x: number; y: number; state: AnimStateId }
export interface PlayCommand { state: AnimStateId }
export interface AppearanceCommand { appearance: CharacterAppearance }

export class ActorSystem implements System {
  readonly id = "actors";

  /** Null until init() resolves. */
  player: Actor | null = null;
  sheets: SheetPack | null = null;

  private opts: ActorSystemOptions;
  private ctx: GameContext | null = null;
  private root = new Container();
  private actors: Actor[] = [];
  private unsubs: (() => void)[] = [];

  constructor(opts: ActorSystemOptions = {}) {
    this.opts = opts;
  }

  async init(ctx: GameContext): Promise<void> {
    this.ctx = ctx;
    this.sheets = await SheetPack.load();

    const parent = this.opts.layers?.actors ?? this.opts.parent ?? ctx.app.stage;
    parent.addChild(this.root);
    this.root.sortableChildren = true;

    const spawn = this.opts.spawn ?? { x: DESIGN_W * 0.5, y: 1250 };
    this.player = this.spawn({
      id: "player",
      appearance: this.opts.appearance ? normalizeAppearance(this.opts.appearance) : defaultAppearance(),
      height: this.opts.playerHeight ?? 300,
      x: spawn.x,
      y: spawn.y,
    });

    this.wireBus(ctx);
    ctx.bus.emit("actors:ready", { player: this.player });
  }

  /* ─────────────── population ─────────────── */

  spawn(opts: SpawnOptions): Actor {
    if (!this.sheets) throw new Error("[actors] spawn() before init()");
    const actor = new Actor({ ...opts, sheets: this.sheets });
    actor.anim.onImpact = () => {
      this.ctx?.bus.emit("actor:impact", {
        id: actor.id, state: actor.anim.state,
        x: actor.x, y: actor.y, facing: actor.facing,
      });
    };
    this.actors.push(actor);
    this.root.addChild(actor.view);
    return actor;
  }

  /** An NPC whose look is stable for a given seed. */
  spawnNpc(seed: number, opts: Omit<SpawnOptions, "appearance"> = {}): Actor {
    return this.spawn({ ...opts, appearance: randomAppearance(seededRng(seed)) });
  }

  remove(actor: Actor): void {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
    if (this.player === actor) this.player = null;
    actor.destroy();
  }

  /** Topmost actor under a design-space point, or null. */
  actorAt(x: number, y: number): Actor | null {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      if (this.actors[i].hitTest(x, y)) return this.actors[i];
    }
    return null;
  }

  get all(): readonly Actor[] { return this.actors; }

  /* ─────────────── player helpers ─────────────── */

  setPlayerAppearance(a: CharacterAppearance): void {
    this.player?.setAppearance(normalizeAppearance(a));
  }

  getPlayerAppearance(): CharacterAppearance {
    return this.player ? cloneAppearance(this.player.getAppearance()) : defaultAppearance();
  }

  /** Headless creator bound to the same sheet pack. */
  createCreator(appearance?: CharacterAppearance): CharacterCreator {
    if (!this.sheets) throw new Error("[actors] createCreator() before init()");
    return new CharacterCreator({
      sheets: this.sheets,
      appearance: appearance ?? this.player?.getAppearance(),
    });
  }

  /* ─────────────── loop ─────────────── */

  update(dt: number, _t?: number): void {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) list[i].update(dt);
  }

  render(_t: number, alpha: number): void {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) list[i].render(alpha);
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    for (const a of this.actors) a.destroy();
    this.actors.length = 0;
    this.player = null;
    this.root.destroy({ children: true });
    this.sheets?.destroy();
    this.sheets = null;
  }

  /* ─────────────── bus ─────────────── */

  private wireBus(ctx: GameContext): void {
    const on = <T>(key: string, fn: (p: T) => void) => this.unsubs.push(ctx.bus.on<T>(key, fn));

    on<WalkCommand>("player:walkTo", (p) => {
      const player = this.player;
      if (!player || !p) return;
      player.walkTo(p.x, p.y, () => {
        ctx.bus.emit("player:arrived", { x: player.x, y: player.y });
      });
    });

    on<WorkCommand>("player:work", (p) => {
      if (!this.player || !p) return;
      this.player.workAt(p.x, p.y, p.state);
      ctx.bus.emit("actor:anim", { id: "player", state: p.state });
    });

    on<PlayCommand>("player:play", (p) => {
      if (!this.player || !p) return;
      this.player.play(p.state, { force: true });
      ctx.bus.emit("actor:anim", { id: "player", state: p.state });
    });

    on("player:stop", () => {
      this.player?.stop();
      this.player?.play("idle", { force: true });
    });

    on<AppearanceCommand>("player:appearance", (p) => {
      if (p?.appearance) this.setPlayerAppearance(p.appearance);
    });
  }
}
