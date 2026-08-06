/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — game.ts
   The orchestrator. Builds services and layers, registers systems,
   owns the fixed-step loop, and wires the seams between systems —
   which is the one job no specialist system may do for itself.
   ═══════════════════════════════════════════════════════════════ */

import { Application, Container } from "pixi.js";
import type { Viewport } from "../core/viewport";
import { EventBus, detectQuality } from "../core/contracts";
import type { GameContext, SceneLayers, System } from "../core/contracts";

import { createServices } from "../services";
import type { Services } from "../services";
import { WorldSystem } from "../world";
import type { NodeTapEvent, ResourceNode } from "../world";
import { ActorSystem } from "../actors";
import type { CharacterAppearance } from "../actors";
import { ProgressionSystem } from "../progression";
import type { ProgressionSave } from "../progression";
import { NODE_KIND_SKILL, CONTENT_BY_SKILL } from "../progression";
import type { SkillId } from "../progression";
import { UISystem } from "../ui";
import type { IconName } from "../ui";

const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;
/** Actions before a node is spent. Keeps a tap meaningful but a node finite. */
const ACTIONS_PER_NODE = 3;

export interface TidefallSave {
  version: number;
  coins: number;
  gems: number;
  inventory: Record<string, number>;
  progression: ProgressionSave | null;
  appearance: CharacterAppearance | null;
  lastSeen: number;
}

function freshSave(): TidefallSave {
  return {
    version: 1, coins: 0, gems: 0, inventory: {},
    progression: null, appearance: null, lastSeen: Date.now(),
  };
}

export async function startGame(opts: { app: Application; viewport: Viewport }) {
  const { app, viewport } = opts;
  const bus = new EventBus();
  let clock = 0;

  const ctx: GameContext = { app, viewport, now: () => clock, bus };
  const quality = detectQuality(viewport.metrics.dpr);

  // ── services first: everything else may depend on them ──
  const services: Services<TidefallSave> = await createServices<TidefallSave>({
    bus, viewport,
    frame: document.getElementById("stage-frame") as HTMLElement,
    save: {
      version: 1,
      createDefault: freshSave,
      validate: (d) => !!d && typeof (d as TidefallSave).coins === "number",
      namespace: "tidefall",
    },
  });
  const loaded = await services.save.load();
  const state = loaded.data;

  // ── scene graph ──
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
  world.addChild(layers.terrain, layers.ground, layers.actors,
    layers.overhead, layers.fx, layers.worldUi);
  app.stage.addChild(world);

  // ── systems ──
  const worldSystem = new WorldSystem({ layers, world, quality });
  const actorSystem = new ActorSystem({
    layers, appearance: state.appearance ?? undefined,
  });
  const progression = new ProgressionSystem(state.progression ?? undefined);
  const ui = new UISystem();

  const systems: System[] = [worldSystem, actorSystem, progression, ui];
  for (const s of systems) await s.init(ctx);

  wireGameplay({ bus, state, services, viewport, worldSystem, actorSystem, progression, ui });

  // The camera follows the player once the actor system has built them.
  if (actorSystem.player) worldSystem.follow(actorSystem.player);
  bus.on<{ player: unknown }>("actors:ready", () => {
    if (actorSystem.player) worldSystem.follow(actorSystem.player);
  });

  services.save.bindLifecycle();

  // ── fixed-step loop ──
  let acc = 0;
  app.ticker.add((ticker) => {
    services.perf.frame(ticker.deltaMS);
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

  return { ctx, layers, world, systems, services, quality, state };
}

/* ─────────────── the seams between systems ───────────────
   Tap a node -> walk there -> swing -> earn xp and loot ->
   the node runs dry. Every step is a different system, so the
   choreography lives here rather than inside any one of them.  */

function wireGameplay(dep: {
  bus: EventBus;
  state: TidefallSave;
  services: Services<TidefallSave>;
  viewport: Viewport;
  worldSystem: WorldSystem;
  actorSystem: ActorSystem;
  progression: ProgressionSystem;
  ui: UISystem;
}) {
  const { bus, state, services, viewport, worldSystem, actorSystem, progression, ui } = dep;

  /* The world names nodes by what they physically are; progression
     names them by what you do there. Neither is wrong, so the
     translation lives here at the seam rather than in either system. */
  const NODE_TO_CONTENT = {
    fish: "fishing_spot", tree: "tree", ore: "vein",
  } as const;
  const GATHER_STATE = {
    fish: "gather_fish", tree: "gather_chop", ore: "gather_mine",
  } as const;
  const SFX = {
    fish: "gather_catch", tree: "gather_chop", ore: "gather_mine",
  } as const;
  const SKILL_ICON: Record<SkillId, IconName> = {
    fishing: "fish", woodcutting: "log", mining: "pickaxe", foraging: "mushroom",
    smithing: "anvil", cooking: "flame", crafting: "gear", alchemy: "flask",
    combat: "sword", slayer: "bow", construction: "house", trading: "tag",
  };
  const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  /** World point → CSS px inside the portrait frame, for floating text. */
  const toFramePx = (wx: number, wy: number) => {
    const p = worldSystem.camera.toScreen(wx, wy);
    const k = viewport.metrics.scale;
    return { x: p.x * k, y: p.y * k };
  };

  /** The node currently being worked, and how many swings are left. */
  let working: { node: ResourceNode; left: number } | null = null;

  const skillFor = (kind: keyof typeof NODE_TO_CONTENT) =>
    NODE_KIND_SKILL[NODE_TO_CONTENT[kind]];

  const pushHud = () => {
    const active = working ? progression.progressOf(skillFor(working.node.kind)) : null;
    ui.setHud({
      coins: state.coins,
      gems: state.gems,
      activity: active ? {
        skillId: active.skill,
        name: title(active.skill),
        icon: SKILL_ICON[active.skill],
        level: active.level,
        xpInLevel: active.xpIntoLevel,
        xpForLevel: active.xpForNext,
        active: true,
      } : null,
    });
  };

  // 1. tapping a node starts a job — if the skill is high enough
  bus.on<NodeTapEvent>("node:tap", (e) => {
    const node = worldSystem.nodes.get(e.id);
    if (!node) return;
    const skill = skillFor(e.kind);
    if (!progression.canGather(NODE_TO_CONTENT[e.kind], e.tier)) {
      services.audio.playSfx("gather_fail");
      services.haptics.notify("warning");
      const need = CONTENT_BY_SKILL[skill].find((c) => c.tier === e.tier);
      ui.toast({
        title: `${title(skill)} ${need?.level ?? "?"} needed`,
        sub: "Work the easier ones first — they build up faster than you think.",
        icon: SKILL_ICON[skill],
        kind: "bad",
      });
      return;
    }
    working = { node, left: ACTIONS_PER_NODE };
    bus.emit("player:work", { x: node.x, y: node.y, state: GATHER_STATE[e.kind] });
    pushHud();
  });

  // 2. tapping open ground just walks there, and cancels the job
  bus.on<{ x: number; y: number }>("world:tap", (p) => {
    working = null;
    bus.emit("player:walkTo", { x: p.x, y: p.y });
    pushHud();
  });

  // 3. every swing that lands pays out
  bus.on<{ state: string }>("actor:impact", () => {
    if (!working) return;
    const { node } = working;
    const skill = skillFor(node.kind);
    const level = progression.levelOf(skill);
    // Best thing this node can give that the player is trained for.
    const pool = CONTENT_BY_SKILL[skill].filter(
      (c) => c.tier <= node.tier && c.level <= level);
    const entry = pool[pool.length - 1] ?? CONTENT_BY_SKILL[skill][0];
    if (!entry) return;

    progression.grantFor(entry.id);
    state.inventory[entry.id] = (state.inventory[entry.id] ?? 0) + 1;
    state.coins += entry.value;

    services.audio.playSfx(SFX[node.kind]);
    services.haptics.impact("light");
    const at = toFramePx(node.x, node.y - 60);
    ui.float({ x: at.x, y: at.y, text: `+1 ${entry.name}`, kind: "plain" });
    ui.float({ x: at.x, y: at.y, text: `+${entry.xp} xp`, kind: "xp", spread: 26 });
    services.save.markDirty();
    pushHud();

    if (--working.left <= 0) {
      worldSystem.deplete(node.id);
      working = null;
      bus.emit("player:play", { state: "idle" });
      pushHud();
    }
  });

  // 4. progression feedback surfaces in the UI
  bus.on<{ skill: SkillId; level: number }>("skill:levelup", (p) => {
    services.audio.playSfx("reward_levelup");
    services.haptics.notify("success");
    ui.levelUp({ skill: title(p.skill), level: p.level, icon: SKILL_ICON[p.skill] });
    services.save.markDirty();
  });

  // 5. the save mirrors live state whenever it is written
  services.save.commit({
    ...state,
    progression: progression.serialize(),
    appearance: actorSystem.getPlayerAppearance?.() ?? state.appearance,
    lastSeen: Date.now(),
  });

  bus.on("save:flush", () => {
    services.save.commit({
      ...state,
      progression: progression.serialize(),
      appearance: actorSystem.getPlayerAppearance?.() ?? state.appearance,
      lastSeen: Date.now(),
    });
  });

  pushHud();
}
