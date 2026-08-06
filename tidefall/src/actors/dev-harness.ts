/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/dev-harness.ts
   DEV ONLY. Mounts the actor system on its own, with a backdrop, a
   row of state demos, walk targets and a live creator preview, so
   the paperdoll and the animation machine can be eyeballed without
   the rest of the game existing yet.

   From the browser console (or a Playwright script):
     const h = await import("/src/actors/dev-harness.ts");
     const tf = h.startActorHarness();
     tf.step(1.5); tf.setState(2, "gather_chop"); tf.randomize();

   Nothing here is imported by the game. Delete it any time.
   ═══════════════════════════════════════════════════════════════ */

import { Application, Container, Graphics, Text } from "pixi.js";
import { EventBus } from "../core/contracts";
import type { GameContext } from "../core/contracts";
import type { Viewport } from "../core/viewport";
import { DESIGN_W } from "../core/viewport";
import { ActorSystem } from "./actor-system";
import type { Actor } from "./actor";
import type { AnimStateId } from "./animation";
import { ANIM_STATE_IDS } from "./animation";
import type { CharacterCreator, CreatorCategoryId, PreviewHandle } from "./creator";
import { randomAppearance, seededRng } from "./character";

const DEMO_STATES: AnimStateId[] = ["idle", "walk", "gather_chop", "gather_fish"];

export interface HarnessHandle {
  system: ActorSystem;
  creator: CharacterCreator;
  demos: Actor[];
  player: Actor;
  /** Advance the fixed-step sim by `seconds` and redraw once. */
  step(seconds: number): void;
  pause(): void;
  resume(): void;
  setState(index: number, state: AnimStateId): void;
  setAllStates(state: AnimStateId): void;
  playerWalkTo(x: number, y: number): void;
  playerWorkAt(x: number, y: number, state: AnimStateId): void;
  randomize(seed?: number): void;
  apply(category: CreatorCategoryId, optionId: string): void;
  cycle(category: CreatorCategoryId, dir?: 1 | -1): void;
  states: readonly AnimStateId[];
  destroy(): void;
}

interface TidefallGlobals { app?: Application; viewport?: Viewport }

export function startActorHarness(app?: Application, viewport?: Viewport): Promise<HarnessHandle> {
  const g = (window as unknown as { TIDEFALL?: TidefallGlobals }).TIDEFALL;
  const theApp = app ?? g?.app;
  const theViewport = viewport ?? g?.viewport;
  if (!theApp || !theViewport) throw new Error("[harness] no Application/Viewport — boot the game first");
  return mount(theApp, theViewport);
}

async function mount(app: Application, viewport: Viewport): Promise<HarnessHandle> {
  const bus = new EventBus();
  let clock = 0;
  const ctx: GameContext = { app, viewport, now: () => clock, bus };

  const root = new Container();
  root.sortableChildren = false;
  app.stage.addChild(root);

  // backdrop so the silhouettes read against something flat
  const bg = new Graphics();
  bg.rect(0, 0, DESIGN_W, 2400).fill(0x1b2a38);
  bg.rect(0, 0, DESIGN_W, 2400).fill({ color: 0x2a3f52, alpha: 0.0 });
  for (let y = 0; y < 2400; y += 120) {
    bg.rect(0, y, DESIGN_W, 1).fill({ color: 0xffffff, alpha: 0.05 });
  }
  // ground lines: every actor's feet must sit exactly on one
  for (const gy of [760, 1180, 1560, 2240]) {
    bg.rect(0, gy - 1, DESIGN_W, 2).fill({ color: 0x63d2d8, alpha: 0.55 });
  }
  root.addChild(bg);

  const label = (text: string, x: number, y: number, size = 26, color = 0xdfe9f2) => {
    const t = new Text({ text, style: { fill: color, fontSize: size, fontFamily: "system-ui", fontWeight: "700" } });
    t.anchor.set(0.5, 1);
    t.position.set(x, y);
    root.addChild(t);
    return t;
  };

  const actorLayer = new Container();
  actorLayer.sortableChildren = true;
  root.addChild(actorLayer);

  const system = new ActorSystem({
    parent: actorLayer,
    playerHeight: 300,
    spawn: { x: DESIGN_W * 0.5, y: 1560 },
  });
  await system.init(ctx);
  const player = system.player!;

  /* ── row of state demos ── */
  const demoY = 760;
  const demos: Actor[] = [];
  const cols = [150, 400, 675, 930];
  for (let i = 0; i < 4; i++) {
    const a = system.spawn({
      id: `demo${i}`,
      appearance: randomAppearance(seededRng(11 + i * 7)),
      height: 250,
      x: cols[i],
      y: demoY,
    });
    a.play(DEMO_STATES[i], { force: true });
    demos.push(a);
  }
  label("idle", cols[0], demoY + 52, 24);
  label("walk", cols[1], demoY + 52, 24);
  label("chop", cols[2], demoY + 52, 24);
  label("fish", cols[3], demoY + 52, 24);
  label("STATE SHEETS · four looks, four states", DESIGN_W / 2, 470, 30, 0x8fd6e0);

  /* ── facing proof: two choppers, targets on opposite sides ── */
  const faceY = 1180;
  const stumps = new Graphics();
  for (const [tx, ty] of [[150, faceY], [930, faceY]] as const) {
    stumps.roundRect(tx - 34, ty - 96, 68, 96, 14).fill(0x6c4626);
    stumps.ellipse(tx, ty - 96, 40, 15).fill(0x9a6a3e);
    stumps.ellipse(tx, ty - 96, 20, 8).fill(0xc08a54);
  }
  root.addChild(stumps);
  const facers: Actor[] = [];
  for (let i = 0; i < 2; i++) {
    const a = system.spawn({
      id: `face${i}`,
      appearance: randomAppearance(seededRng(101 + i * 13)),
      height: 250,
      x: i === 0 ? 330 : 750,
      y: faceY,
    });
    a.workAt(i === 0 ? 150 : 930, faceY, "gather_chop");
    facers.push(a);
  }
  label("FACING · each swings AT the stump", DESIGN_W / 2, 900, 30, 0x8fd6e0);

  /* ── the player, walking ── */
  label("PLAYER · walkTo + gather", DESIGN_W / 2, 1238, 30, 0x8fd6e0);
  const marks = new Graphics();
  marks.circle(200, 1560, 14).fill({ color: 0xf3c54a, alpha: 0.5 });
  marks.circle(880, 1560, 14).fill({ color: 0xf3c54a, alpha: 0.5 });
  root.addChild(marks);

  /* ── creator preview ── */
  label("CREATOR · live preview + portrait", DESIGN_W / 2, 1760, 30, 0x8fd6e0);
  const creator = system.createCreator();
  const previewCt = new Container();
  previewCt.position.set(DESIGN_W * 0.5, 2240);
  root.addChild(previewCt);
  const preview: PreviewHandle = creator.mountPreview(previewCt, {
    height: 330,
    portrait: true,
    portraitSize: 78,
    portraitX: 300,
    portraitY: -230,
  });
  creator.onChange((a) => system.setPlayerAppearance(a));

  /* ── loop ── */
  let paused = false;
  const FIXED = 1 / 60;
  let acc = 0;
  const tick = (dtSec: number) => {
    acc += dtSec;
    let guard = 0;
    while (acc >= FIXED && guard++ < 12) {
      clock += FIXED;
      system.update(FIXED, clock);
      preview.update(FIXED);
      acc -= FIXED;
    }
    system.render(clock, acc / FIXED);
  };
  const onTicker = () => { if (!paused) tick(Math.min(app.ticker.deltaMS / 1000, 0.25)); };
  app.ticker.add(onTicker);

  const handle: HarnessHandle = {
    system, creator, demos, player,
    states: ANIM_STATE_IDS,
    step(seconds) {
      const was = paused;
      paused = true;
      let left = seconds;
      while (left > 0) { tick(Math.min(FIXED, left)); left -= FIXED; }
      system.render(clock, 0);
      app.renderer.render(app.stage);
      paused = was;
    },
    pause() { paused = true; },
    resume() { paused = false; },
    setState(i, state) { demos[i]?.play(state, { force: true }); },
    setAllStates(state) { for (const d of demos) d.play(state, { force: true }); },
    playerWalkTo(x, y) { player.walkTo(x, y); },
    playerWorkAt(x, y, state) { player.workAt(x, y, state); },
    randomize(seed) {
      creator.load(randomAppearance(seed === undefined ? Math.random : seededRng(seed)));
    },
    apply(category, optionId) { creator.apply(category, optionId); },
    cycle(category, dir = 1) { creator.cycle(category, dir); },
    destroy() {
      app.ticker.remove(onTicker);
      preview.destroy();
      creator.destroy();
      system.destroy();
      root.destroy({ children: true });
    },
  };

  (window as unknown as Record<string, unknown>).TF_ACTORS = handle;
  return handle;
}
