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
  let shake = 0;

  /* ─────────────── camera ───────────────
     Zoomed in by default and glued to the character; drag to look
     around (follow pauses briefly), pinch or scroll to zoom.       */
  const ZOOM_MIN = 1, ZOOM_MAX = 2.6, ZOOM_DEFAULT = 1.6;
  const MARGIN = 40;
  let fitScale = 1;
  let zoom = ZOOM_DEFAULT;
  let camX = WD.home.x, camY = WD.home.y;
  let following = true;
  let freeUntil = 0;      // while exploring, the follow pauses

  /** Screen shake — a little thump on impacts. */
  function kick(mag) { shake = Math.min(8, Math.max(shake, mag)); }

  function applyCamera() {
    scale = fitScale * zoom;
    const visW = vw / scale, visH = vh / scale;
    camX = visW >= WD.w + MARGIN * 2 ? WD.w / 2
      : U.clamp(camX, visW / 2 - MARGIN, WD.w + MARGIN - visW / 2);
    camY = visH >= WD.h + MARGIN * 2 ? WD.h / 2
      : U.clamp(camY, visH / 2 - MARGIN, WD.h + MARGIN - visH / 2);
    offX = vw / 2 - camX * scale;
    offY = vh / 2 - camY * scale;
  }

  function panBy(dxPx, dyPx) {
    camX -= dxPx / scale;
    camY -= dyPx / scale;
    freeUntil = Date.now() + 3500;
    applyCamera();
  }

  /** Absolute zoom anchored at a screen point (pinch/wheel). */
  function zoomTo(z, sx, sy) {
    const before = toWorld(sx, sy);
    zoom = U.clamp(z, ZOOM_MIN, ZOOM_MAX);
    applyCamera();
    const after = toWorld(sx, sy);
    camX += before.x - after.x;
    camY += before.y - after.y;
    freeUntil = Date.now() + 3500;
    applyCamera();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    fitScale = Math.min(vw / WD.w, vh / WD.h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyCamera();
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

    // a painted island replaces everything below when present
    if (W.sprites.drawBackground(ctx)) {
      ctx.restore();
      return;
    }

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
    // soft-follow the character unless the player is looking around
    if (following && Date.now() > freeUntil) {
      const k = 1 - Math.pow(0.002, dt);
      camX += (W.actor.x - camX) * k;
      camY += (W.actor.y - 50 - camY) * k;
    }
    applyCamera();

    // decay the shake, jitter the camera
    let shx = 0, shy = 0;
    if (shake > 0.05) {
      shx = (Math.random() - 0.5) * shake * 2;
      shy = (Math.random() - 0.5) * shake * 2;
      shake *= Math.pow(0.0016, dt);   // fast decay
    } else shake = 0;
    ctx.save();
    ctx.translate(shx, shy);

    drawGround(t);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // depth-sorted drawables
    const S = W.state.S;
    const items = [];
    items.push({ y: WD.mine.y, fn: () => W.sprites.drawMine(ctx, WD.mine.x, WD.mine.y, {}) });
    for (const spot of WD.treeSpots) {
      const spec = C.TREES.find((x) => x.id === spot.tree);
      const shaking = W.game.choppingAt === spot;
      items.push({ y: spot.y, fn: () => W.sprites.drawTree(ctx, spot.x, spot.y, { spec, t, shake: shaking }) });
    }
    items.push({ y: WD.stall.y, fn: () => W.sprites.drawStall(ctx, WD.stall.x, WD.stall.y, { t }) });

    // the cove you build
    items.push({ y: WD.dock.y, fn: () => W.sprites.drawDock(ctx, WD.dock.x, WD.dock.y, { tier: S.projects.dock, t }) });
    items.push({ y: WD.house.y, fn: () => W.sprites.drawHouse(ctx, WD.house.x, WD.house.y, { tier: S.projects.house, t }) });
    if (S.projects.boat >= 1) {
      items.push({ y: WD.boat.y, fn: () => W.sprites.drawBoat(ctx, WD.boat.x, WD.boat.y, { t }) });
    }
    C.BOSSES.forEach((boss, i) => {
      if (!S.trophies[boss.id]) return;
      const tx = WD.stall.x + (i === 0 ? -150 : 150);
      items.push({ y: WD.stall.y + 8, fn: () => W.sprites.drawTrophy(ctx, tx, WD.stall.y + 8, { boss, t }) });
    });
    for (const d of C.DECO) {
      if (!S.deco[d.id]) continue;
      if (d.id === "cat") items.push({ y: d.y, fn: () => W.sprites.drawCat(ctx, d.x, d.y, { t }) });
      else items.push({ y: d.y, fn: () => W.sprites.drawDeco(ctx, d.x, d.y, { kind: d.id, t }) });
    }
    if (S.building) {
      const at = S.building.id === "dock" ? { x: WD.dock.x, y: WD.dock.y - 90 } : WD.house;
      items.push({ y: at.y + 1, fn: () => W.sprites.drawBuildSite(ctx, at.x + 70, at.y, { t }) });
    }
    const boat = W.game.giftBoat;
    if (boat) {
      items.push({ y: WD.giftSpot.y, fn: () => W.sprites.drawSupplyBoat(ctx, boat.x, WD.giftSpot.y, { t, flip: boat.flip }) });
    }

    items.push({ y: W.actor.y, fn: () => W.actor.draw(ctx, t) });
    W.customers.collectDrawables(items, t, ctx);

    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.fn();

    // juice + ambient life above the world
    W.particles.update(dt, t);
    W.particles.draw(ctx, t);

    // top layer: order bubbles, gather progress, bite indicator
    W.customers.drawBubbles(ctx, t);
    W.game.drawOverlays(ctx, t);

    ctx.restore();
    ctx.restore();   // shake

    // the deep-water duel covers everything (screen space)
    if (W.boss.active) W.boss.draw(ctx, vw, vh, t);
  }

  W.scene = {
    init(el) {
      canvas = el;
      ctx = el.getContext("2d");
      resize();
      window.addEventListener("resize", resize);
    },
    draw, toScreen, toWorld, kick,
    panBy, zoomTo,
    setZoom(z) { zoom = U.clamp(z, ZOOM_MIN, ZOOM_MAX); applyCamera(); },
    centerOn(x, y) { camX = x; camY = y; applyCamera(); },
    setFollow(on) { following = on; freeUntil = 0; },
    get zoom() { return zoom; },
    get scale() { return scale; },
  };
})();
