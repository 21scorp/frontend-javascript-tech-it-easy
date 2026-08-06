/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — pixi-pipes.ts
   IMPORT THIS BEFORE THE RENDERER IS CREATED.

   PixiJS 8 snapshots its render pipes when the renderer is built.
   A pipe whose init module runs after `app.init()` never lands in
   `renderer.renderPipes`, and the first frame containing such a
   renderable dies on `renderPipes[id].validateRenderable()`.

   That is easy to hit here: the game is behind a dynamic import, so
   in a production build Rollup puts Graphics and TilingSprite in a
   lazy chunk that loads *after* the renderer exists. Dev never shows
   it — vite serves unsplit modules, so every init runs in time.

   Listing the pipes here as static side-effect imports hoists them
   above `app.init()` and keeps the reason in one place. Add a line
   whenever the scene starts using a new Pixi renderable: mesh,
   text, text-bitmap, text-html, sprite-nine-slice, particle-container.
   `npm run test:smoke` fails the build if one is ever missing.
   ═══════════════════════════════════════════════════════════════ */

// world/terrain.ts, world/paint.ts, actors/paperdoll.ts, services/perf.ts
import "pixi.js/graphics";
// world/terrain.ts — the repeating ground and water bands
import "pixi.js/sprite-tiling";

/** Pipes the game cannot render without. The smoke test asserts these. */
export const REQUIRED_PIPES = ["graphics", "tilingSprite", "sprite"] as const;
