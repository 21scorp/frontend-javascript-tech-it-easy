/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — main.ts
   Boot: viewport → renderer → game. Nothing else lives here.
   ═══════════════════════════════════════════════════════════════ */

import "./style.css";
import { Application } from "pixi.js";
import { Viewport, DESIGN_W } from "./core/viewport";

const frame = document.getElementById("stage-frame") as HTMLElement;
const guard = document.getElementById("rotate-guard") as HTMLElement;
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const splash = document.getElementById("boot-splash") as HTMLElement;
const bootFill = document.getElementById("boot-fill") as HTMLElement;

const progress = (pct: number) => { bootFill.style.width = `${pct}%`; };

async function boot() {
  progress(10);
  const viewport = new Viewport(frame, guard);

  const app = new Application();
  await app.init({
    canvas,
    preference: "webgl",
    antialias: false,
    powerPreference: "high-performance",
    backgroundColor: 0x0d1b2a,
    resolution: viewport.metrics.dpr,
    autoDensity: true,
    width: viewport.metrics.frameW,
    height: viewport.metrics.frameH,
  });
  progress(45);

  // The whole scene is authored in design units; one root scale
  // converts to device pixels, so gameplay code never sees DPR.
  const applyMetrics = () => {
    const m = viewport.metrics;
    app.renderer.resolution = m.dpr;
    app.renderer.resize(m.frameW, m.frameH);
    app.stage.scale.set(m.scale);
  };
  viewport.onChange(applyMetrics);
  applyMetrics();
  progress(70);

  const { startGame } = await import("./game/game");
  const game = await startGame({ app, viewport });
  progress(100);

  splash.classList.add("gone");
  setTimeout(() => splash.remove(), 600);

  // The handle automated visual QA drives the game through.
  (window as unknown as Record<string, unknown>).TIDEFALL =
    { app, viewport, DESIGN_W, game, bus: game.ctx.bus };
}

boot().catch((err) => {
  console.error(err);
  splash.innerHTML =
    `<div class="boot-mark">TIDEFALL</div>
     <p class="rotate-sub" style="max-width:280px;text-align:center">
       Something went wrong while loading. Pull to refresh and try again.
     </p>`;
});
