/* ═══════════════════════════════════════════════════════════════
   COVE — scene.js
   3/4 world: camera, ground, pond, path — then depth-sorted
   sprites. World coordinates are fixed units (config.WORLD).
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;
  const WD = C.WORLD;

  let canvas, ctx;
  let vw = 0, vh = 0, dpr = 1;
  let scale = 1, offX = 0, offY = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    scale = Math.min(vw / WD.w, vh / WD.h);
    offX = (vw - WD.w * scale) / 2;
    offY = (vh - WD.h * scale) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const toScreen = (x, y) => ({ x: offX + x * scale, y: offY + y * scale });
  const toWorld = (sx, sy) => ({ x: (sx - offX) / scale, y: (sy - offY) / scale });

  /* ─────────────── ground ─────────────── */

  function drawGround(t) {
    // outside-the-world letterbox: deep water
    ctx.fillStyle = "#5cb4c8";
    ctx.fillRect(0, 0, vw, vh);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // island of grass
    ctx.fillStyle = "#9ed08a";
    ctx.beginPath();
    ctx.roundRect(-40, 60, WD.w + 80, WD.h - 20, 60);
    ctx.fill();
    // beach rim at the bottom
    ctx.fillStyle = "#e8d8a8";
    ctx.beginPath();
    ctx.roundRect(-40, WD.h - 80, WD.w + 80, 120, 40);
    ctx.fill();

    // cliff band top (mine lives here)
    ctx.fillStyle = "#b0a088";
    ctx.beginPath();
    ctx.roundRect(-40, 40, WD.w + 80, 190, 40);
    ctx.fill();
    ctx.fillStyle = "#c0b098";
    ctx.beginPath();
    ctx.roundRect(-40, 40, WD.w + 80, 60, 40);
    ctx.fill();

    // grass texture dots
    const rng = U.mulberry32(7);
    ctx.fillStyle = "rgba(90, 140, 70, 0.35)";
    for (let i = 0; i < 70; i++) {
      const gx = rng() * WD.w;
      const gy = 260 + rng() * (WD.h - 420);
      ctx.beginPath();
      ctx.ellipse(gx, gy, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // path from mine to stall
    ctx.strokeStyle = "#d8c49a";
    ctx.lineWidth = 56;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(WD.mine.x, WD.mine.y + 40);
    ctx.quadraticCurveTo(520, 640, WD.stall.x, WD.stall.y - 40);
    ctx.stroke();

    // pond
    const p = WD.pond;
    ctx.fillStyle = "#d8c49a";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx + 14, p.ry + 12, 0, 0, Math.PI * 2);
    ctx.fill();
    const water = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.rx);
    water.addColorStop(0, "#8ad4e4");
    water.addColorStop(1, "#5cb4c8");
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // ripples
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.25 + i / 3) % 1);
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx * 0.25 + k * p.rx * 0.6, (p.ry * 0.25 + k * p.ry * 0.6), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /* ─────────────── frame ─────────────── */

  function draw(t, dt) {
    drawGround(t);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // depth-sorted drawables
    const items = [];
    items.push({ y: WD.mine.y, fn: () => W.sprites.drawMine(ctx, WD.mine.x, WD.mine.y, {}) });
    for (const spot of WD.treeSpots) {
      const spec = C.TREES.find((x) => x.id === spot.tree);
      const shaking = W.game.choppingAt === spot;
      items.push({ y: spot.y, fn: () => W.sprites.drawTree(ctx, spot.x, spot.y, { spec, t, shake: shaking }) });
    }
    items.push({ y: WD.stall.y, fn: () => W.sprites.drawStall(ctx, WD.stall.x, WD.stall.y, { t }) });
    items.push({ y: W.actor.y, fn: () => W.actor.draw(ctx, t) });
    W.customers.collectDrawables(items, t);

    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.fn();

    // top layer: order bubbles, gather progress, bite indicator
    W.customers.drawBubbles(ctx, t);
    W.game.drawOverlays(ctx, t);

    ctx.restore();
  }

  W.scene = {
    init(el) {
      canvas = el;
      ctx = el.getContext("2d");
      resize();
      window.addEventListener("resize", resize);
    },
    draw, toScreen, toWorld,
    get scale() { return scale; },
  };
})();
