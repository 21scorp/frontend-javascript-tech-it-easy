/* ═══════════════════════════════════════════════════════════════
   COVE — particles.js
   Juice + ambient life, all in world space. Chips fly, water
   splashes, hearts float, confetti rains — and the cove lives on
   its own: butterflies, birds, drifting leaves, pond sparkles.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;

  const ps = [];          // short-lived particles
  const flies = [];       // persistent butterflies
  let birdTimer = 8;
  let leafTimer = 3;
  let sparkTimer = 0.4;

  const CAP = 320;

  function push(p) {
    if (ps.length >= CAP) ps.shift();
    ps.push(p);
  }

  /* ─────────────── bursts ─────────────── */

  function chips(x, y, n) {
    for (let i = 0; i < (n || 6); i++) {
      push({ kind: "chip", x, y: y - 40 - U.rand(0, 30),
        vx: U.rand(-130, 130), vy: U.rand(-220, -60), g: 520,
        rot: U.rand(0, 6.3), vr: U.rand(-9, 9),
        life: U.rand(0.5, 0.8), t: 0,
        col: U.pick(["#a8784a", "#8a6a42", "#c8a068"]) });
    }
  }

  function splash(x, y, n) {
    for (let i = 0; i < (n || 8); i++) {
      push({ kind: "drop", x: x + U.rand(-14, 14), y,
        vx: U.rand(-90, 90), vy: U.rand(-240, -90), g: 620,
        life: U.rand(0.4, 0.65), t: 0 });
    }
  }

  function hearts(x, y, n) {
    for (let i = 0; i < (n || 3); i++) {
      push({ kind: "heart", x: x + U.rand(-24, 24), y: y - U.rand(60, 110),
        vx: U.rand(-16, 16), vy: U.rand(-58, -36), g: 0,
        life: U.rand(0.9, 1.3), t: 0 });
    }
  }

  function confetti(x, y, n) {
    for (let i = 0; i < (n || 22); i++) {
      push({ kind: "conf", x, y: y - U.rand(40, 110),
        vx: U.rand(-190, 190), vy: U.rand(-330, -120), g: 430,
        rot: U.rand(0, 6.3), vr: U.rand(-11, 11),
        life: U.rand(0.8, 1.4), t: 0,
        col: U.pick(["#e8823f", "#f3d54a", "#57a05b", "#e0688a", "#7ec8d8", "#9a6ac8"]) });
    }
  }

  function shine(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      push({ kind: "spark", x: x + Math.cos(a) * 12, y: y - 40 + Math.sin(a) * 12,
        vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 40, g: 60,
        life: 0.7, t: 0, gold: true });
    }
  }

  /* ─────────────── ambient life ─────────────── */

  function ensureFlies() {
    while (flies.length < 3) {
      flies.push({
        x: U.rand(100, 900), y: U.rand(350, 1150),
        a: U.rand(0, 6.3), seed: U.rand(0, 100),
        hue: U.pick([28, 350, 200]),
      });
    }
  }

  function ambient(dt, t) {
    ensureFlies();
    for (const f of flies) {
      // lazy wandering with flutter
      f.a += U.rand(-1.6, 1.6) * dt;
      f.x += Math.cos(f.a) * 34 * dt;
      f.y += Math.sin(f.a) * 26 * dt;
      if (f.x < 60 || f.x > 940) f.a = Math.PI - f.a;
      if (f.y < 300 || f.y > 1200) f.a = -f.a;
    }

    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = U.rand(16, 34);
      const ltr = Math.random() < 0.5;
      push({ kind: "bird", x: ltr ? -60 : 1060, y: U.rand(120, 420),
        vx: ltr ? U.rand(90, 130) : -U.rand(90, 130), vy: U.rand(-6, 6),
        g: 0, life: 12, t: 0, seed: U.rand(0, 9) });
    }

    leafTimer -= dt;
    if (leafTimer <= 0) {
      leafTimer = U.rand(2.2, 5);
      const spot = U.pick(C.WORLD.treeSpots);
      const spec = C.TREES.find((x) => x.id === spot.tree);
      push({ kind: "leaf", x: spot.x + U.rand(-55, 55), y: spot.y - U.rand(90, 150),
        vx: U.rand(-14, 14), vy: U.rand(26, 44), g: 0,
        rot: U.rand(0, 6.3), vr: U.rand(-3, 3),
        life: U.rand(2.4, 3.6), t: 0, hue: spec.hue });
    }

    sparkTimer -= dt;
    if (sparkTimer <= 0) {
      sparkTimer = U.rand(0.5, 1.1);
      const p = C.WORLD.pond;
      const a = U.rand(0, 6.3), r = U.rand(0.2, 0.85);
      push({ kind: "spark", x: p.x + Math.cos(a) * p.rx * r,
        y: p.y + Math.sin(a) * p.ry * r,
        vx: 0, vy: 0, g: 0, life: 0.9, t: 0 });
    }
  }

  /* ─────────────── sim + draw ─────────────── */

  function update(dt, t) {
    ambient(dt, t);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.g || 0) * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.kind === "leaf") p.x += Math.sin(p.t * 3 + p.rot) * 22 * dt;
    }
  }

  function draw(ctx, t) {
    for (const p of ps) {
      const k = p.t / p.life;
      const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.globalAlpha = fade;
      if (p.kind === "chip") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.fillRect(-5, -2.5, 10, 5);
        ctx.restore();
      } else if (p.kind === "drop") {
        ctx.fillStyle = "#bfe8f2";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "heart") {
        ctx.fillStyle = "#e0688a";
        ctx.save();
        ctx.translate(p.x, p.y);
        const s = 1 + Math.sin(p.t * 9) * 0.08;
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.arc(-3.4, -2, 3.6, 0, Math.PI * 2);
        ctx.arc(3.4, -2, 3.6, 0, Math.PI * 2);
        ctx.moveTo(-6.6, 0); ctx.lineTo(0, 8); ctx.lineTo(6.6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === "conf") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.fillRect(-4, -2.6, 8, 5.2);
        ctx.restore();
      } else if (p.kind === "spark") {
        const tw = Math.sin((p.t / p.life) * Math.PI);
        ctx.fillStyle = p.gold ? "rgba(255, 214, 90, 0.95)" : "rgba(255, 255, 255, 0.8)";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(tw, tw);
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(1.8, -1.8); ctx.lineTo(6, 0); ctx.lineTo(1.8, 1.8);
        ctx.lineTo(0, 6); ctx.lineTo(-1.8, 1.8); ctx.lineTo(-6, 0); ctx.lineTo(-1.8, -1.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === "leaf") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + Math.sin(p.t * 3) * 0.6);
        ctx.fillStyle = `hsl(${p.hue}, 45%, 48%)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === "bird") {
        ctx.strokeStyle = "rgba(70, 60, 50, 0.75)";
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        const flap = Math.sin(p.t * 11 + p.seed) * 6;
        const dir = p.vx > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(p.x - 8 * dir, p.y - flap);
        ctx.quadraticCurveTo(p.x, p.y + 3, p.x + 8 * dir, p.y - flap);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // butterflies on top — tiny, always around
    for (const f of flies) {
      const flap = Math.abs(Math.sin(t * 10 + f.seed));
      ctx.save();
      ctx.translate(f.x, f.y + Math.sin(t * 2.4 + f.seed) * 6);
      ctx.fillStyle = `hsla(${f.hue}, 70%, 62%, 0.92)`;
      ctx.beginPath();
      ctx.ellipse(-3.2, 0, 3.4, 5 * (0.35 + flap * 0.65), 0.35, 0, Math.PI * 2);
      ctx.ellipse(3.2, 0, 3.4, 5 * (0.35 + flap * 0.65), -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(60, 44, 28, 0.85)";
      ctx.fillRect(-0.9, -3.6, 1.8, 7.2);
      ctx.restore();
    }
  }

  W.particles = { update, draw, chips, splash, hearts, confetti, shine };
})();
