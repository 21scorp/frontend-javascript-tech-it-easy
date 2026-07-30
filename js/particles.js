/* ═══════════════════════════════════════════════════════════════
   WISP — particles.js
   One lightweight pooled particle system for sparks, motes,
   hearts and stardust.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const MAX = 400;
  const pool = [];

  /** Expanding celebration ring (evolutions, big moments). */
  function ring(x, y, size, hue) {
    spawn({ x, y, size: size || 40, hue: hue == null ? 48 : hue, life: 1.1, shape: "ring", force: true });
  }

  function spawn(opts) {
    if (!W.state.S.settings.particles && !opts.force) return;
    if (pool.length >= MAX) pool.shift();
    pool.push({
      x: opts.x, y: opts.y,
      vx: opts.vx || 0, vy: opts.vy || 0,
      g: opts.g || 0,                    // gravity
      drag: opts.drag == null ? 0.99 : opts.drag,
      life: opts.life || 1,              // seconds
      age: 0,
      size: opts.size || 3,
      hue: opts.hue == null ? 45 : opts.hue,
      sat: opts.sat == null ? 95 : opts.sat,
      lum: opts.lum == null ? 75 : opts.lum,
      alpha: opts.alpha == null ? 1 : opts.alpha,
      twinkle: opts.twinkle || 0,
      shape: opts.shape || "dot",        // dot | heart | star
    });
  }

  /** Burst of golden sparks (tap feedback). */
  function burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, Math.PI * 2);
      const sp = U.rand(40, opts.speed || 160);
      spawn({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        g: 60,
        drag: 0.96,
        life: U.rand(0.5, 1.1),
        size: U.rand(1.5, 3.5),
        hue: opts.hue == null ? U.rand(38, 52) : opts.hue,
        shape: opts.shape || "dot",
      });
    }
  }

  /** Gentle upward drift (ambient, level-ups). */
  function rise(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      spawn({
        x: x + U.rand(-40, 40),
        y: y + U.rand(-10, 10),
        vx: U.rand(-12, 12),
        vy: U.rand(-70, -30),
        drag: 0.995,
        life: U.rand(1.2, 2.4),
        size: U.rand(1.5, 3),
        hue: opts.hue == null ? 48 : opts.hue,
        twinkle: 3,
        shape: opts.shape || "dot",
      });
    }
  }

  function heart(x, y) {
    spawn({
      x, y,
      vx: U.rand(-10, 10),
      vy: -55,
      drag: 0.99,
      life: 1.4,
      size: 7,
      hue: 340, sat: 80, lum: 72,
      shape: "heart",
      force: true,
    });
  }

  function update(dt) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.age += dt;
      if (p.age >= p.life) { pool.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function draw(ctx) {
    for (const p of pool) {
      const t = U.clamp(p.age / p.life, 0, 1);
      let a = p.alpha * (1 - t);
      if (p.twinkle) a *= 0.6 + 0.4 * Math.sin(p.age * p.twinkle * Math.PI * 2);
      ctx.globalAlpha = Math.max(0, a);
      const col = `hsl(${p.hue} ${p.sat}% ${p.lum}%)`;
      if (p.shape === "heart") {
        drawHeart(ctx, p.x, p.y, p.size, col);
      } else if (p.shape === "ring") {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, p.size * 0.35 * (1 - t));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3 * U.easeOutCubic(t) + 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHeart(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 10, s / 10);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-10, -4, -5, -12, 0, -6);
    ctx.bezierCurveTo(5, -12, 10, -4, 0, 4);
    ctx.fill();
    ctx.restore();
  }

  W.particles = { spawn, burst, rise, heart, ring, update, draw, get count() { return pool.length; } };
})();
