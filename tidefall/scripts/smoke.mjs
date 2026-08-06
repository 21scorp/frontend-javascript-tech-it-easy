/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — smoke test
   Serves the PRODUCTION build and plays it in a real browser.

   Why this exists: type-checks, unit tests and the balance sim all
   run headless and none of them render a frame. A render-pipe
   registration bug shipped past every one of them and produced a
   blank world in production while dev looked perfect — because dev
   does not code-split, so lazily-imported Pixi pipes still arrived
   in time. Only opening the built bundle catches that class of bug.
   ═══════════════════════════════════════════════════════════════ */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const DIST = new URL("../dist/", import.meta.url).pathname;
const PORT = Number(process.env.SMOKE_PORT ?? 5199);
const VIEWPORT = { width: 390, height: 844 };

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
};

if (!existsSync(join(DIST, "index.html"))) {
  console.error("smoke: dist/index.html missing — run `npm run build` first");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = normalize(url === "/" ? "/index.html" : url).replace(/^(\.\.[/\\])+/, "");
  const file = join(DIST, rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const fail = [];
const note = (m) => console.log("  " + m);

await new Promise((r) => server.listen(PORT, r));
// CI installs its own chromium; a dev box may point at a preinstalled one.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 3 });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url().slice(0, 100)}`));

try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.TIDEFALL?.game, null, { timeout: 45000 });
  await page.waitForTimeout(4000);

  // 1. every render pipe the scene needs must exist on the renderer.
  //    Keep this list in step with REQUIRED_PIPES in src/core/pixi-pipes.ts.
  const REQUIRED_PIPES = ["graphics", "tilingSprite", "sprite"];
  const pipes = await page.evaluate(() =>
    Object.keys(window.TIDEFALL.app.renderer.renderPipes));
  const missing = REQUIRED_PIPES.filter((p) => !pipes.includes(p));
  if (missing.length) fail.push(`render pipes missing: ${missing.join(", ")}`);
  else note(`render pipes ok (${pipes.length} registered)`);

  // 2. the world actually built something to look at
  const world = await page.evaluate(() => {
    const w = window.TIDEFALL.game.systems.find((s) => s.id === "world");
    return { nodes: w?.nodes?.all?.length ?? 0 };
  });
  if (world.nodes < 1) fail.push("world has no resource nodes");
  else note(`world ok (${world.nodes} nodes)`);

  // 3. the core loop pays out: tap a tree, earn xp and loot
  const played = await page.evaluate(async () => {
    const { game, bus } = window.TIDEFALL;
    const w = game.systems.find((s) => s.id === "world");
    const p = game.systems.find((s) => s.id === "progression");
    const tree = w.nodes.all.find((n) => n.kind === "tree" && n.tier === 1);
    if (!tree) return { err: "no tier-1 tree" };
    bus.emit("node:tap", { id: tree.id, kind: tree.kind, tier: tree.tier });
    await new Promise((r) => setTimeout(r, 8000));
    return { xp: p.xpOf("woodcutting"), items: Object.keys(game.state.inventory).length };
  });
  if (played.err || !(played.xp > 0) || !(played.items > 0)) {
    fail.push(`gather loop paid nothing: ${JSON.stringify(played)}`);
  } else note(`gather loop ok (+${played.xp} xp, ${played.items} item type)`);

  // 4. portrait is enforced when the device turns
  const guard = await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "width", { value: 844, configurable: true });
    Object.defineProperty(window.visualViewport, "height", { value: 390, configurable: true });
    window.dispatchEvent(new Event("resize"));
    return new Promise((res) => setTimeout(() => res({
      guardShown: !document.getElementById("rotate-guard").hidden,
      blocked: !!window.TIDEFALL.viewport.metrics.blocked,
    }), 300));
  });
  if (!guard.guardShown || !guard.blocked) fail.push("landscape did not raise the rotate guard");
  else note("portrait guard ok");

  // 5. nothing may have gone wrong along the way
  const unique = [...new Set(errors)];
  if (unique.length) fail.push(`console/network errors:\n    ${unique.slice(0, 6).join("\n    ")}`);
  else note("no console or network errors");
} catch (e) {
  fail.push(`smoke run threw: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}

if (fail.length) {
  console.error("\nSMOKE FAILED:");
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("\nsmoke passed");
