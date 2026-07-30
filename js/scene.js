/* ═══════════════════════════════════════════════════════════════
   WISP — scene.js
   The living meadow. Everything is drawn procedurally — sky,
   hills, moon, and every building you own appears in the world.
   (Renderer is isolated here so sprites can replace pieces later.)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  let canvas, ctx;
  let width = 0, height = 0, dpr = 1;

  /* ─────────────── palettes (real time of day) ───────────────
     The meadow lives in eternal twilight, but it breathes with
     your real clock — deep night, blue dawn, soft day, warm dusk. */
  const PALETTES = {
    night: { top: [8, 10, 32],    mid: [15, 19, 52],   hor: [30, 32, 74],   stars: 1.0, ground: [14, 16, 40] },
    dawn:  { top: [22, 20, 58],   mid: [52, 38, 92],   hor: [154, 92, 110], stars: 0.5, ground: [24, 20, 52] },
    day:   { top: [38, 46, 96],   mid: [64, 74, 140],  hor: [110, 116, 92], stars: 0.15, ground: [30, 34, 66] },
    dusk:  { top: [16, 12, 44],   mid: [58, 30, 84],   hor: [172, 84, 70],  stars: 0.7, ground: [22, 16, 46] },
  };

  function paletteNow() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    // keyframes: 0h night, 6h dawn, 12h day, 19h dusk, 24h night
    const frames = [
      [0, PALETTES.night], [4.5, PALETTES.night], [7, PALETTES.dawn],
      [11, PALETTES.day], [16, PALETTES.day], [20, PALETTES.dusk],
      [22.5, PALETTES.night], [24, PALETTES.night],
    ];
    for (let i = 0; i < frames.length - 1; i++) {
      const [h0, p0] = frames[i];
      const [h1, p1] = frames[i + 1];
      if (h >= h0 && h <= h1) {
        const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
        return blendPalette(p0, p1, U.easeInOut(t));
      }
    }
    return PALETTES.night;
  }

  function blendPalette(a, b, t) {
    const mix = (x, y) => x.map((v, i) => Math.round(U.lerp(v, y[i], t)));
    return {
      top: mix(a.top, b.top), mid: mix(a.mid, b.mid), hor: mix(a.hor, b.hor),
      stars: U.lerp(a.stars, b.stars, t), ground: mix(a.ground, b.ground),
    };
  }

  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /* ─────────────── world geometry ─────────────── */

  let rng;             // seeded — the meadow is *yours*, stable forever
  let stars = [];      // {x,y,size,phase,speed}
  let hillParams = []; // per layer: array of {amp, freq, phase}
  let fireflies = [];  // live agents
  let comets = [];     // active comets
  let cometTimer = 0;

  function buildWorld(seed) {
    rng = U.mulberry32(seed);
    stars = [];
    const n = 90;
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rng(), y: rng() * 0.55,
        size: 0.6 + rng() * 1.6,
        phase: rng() * Math.PI * 2,
        speed: 0.4 + rng() * 1.2,
      });
    }
    hillParams = [];
    for (let layer = 0; layer < 3; layer++) {
      const waves = [];
      for (let k = 0; k < 3; k++) {
        waves.push({
          amp: (0.015 + rng() * 0.03) * (1 + layer * 0.4),
          freq: 1.5 + rng() * 3.5,
          phase: rng() * Math.PI * 2,
        });
      }
      hillParams.push(waves);
    }
  }

  /** Hill surface Y (px) for layer 0(back)..2(front) at normalized x. */
  function hillY(layer, xn) {
    const bases = [0.62, 0.72, 0.84];
    let y = bases[layer];
    for (const w of hillParams[layer]) {
      y += Math.sin(xn * w.freq * Math.PI * 2 + w.phase) * w.amp;
    }
    return y * height;
  }

  /* ─────────────── resize ─────────────── */

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ─────────────── sky ─────────────── */

  function drawSky(pal, t) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, rgb(pal.top));
    g.addColorStop(0.55, rgb(pal.mid));
    g.addColorStop(0.8, rgb(pal.hor));
    g.addColorStop(1, rgb(pal.ground));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    // stars
    const vis = pal.stars;
    if (vis > 0.05) {
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
        ctx.globalAlpha = vis * tw * 0.9;
        ctx.fillStyle = "#e8eeff";
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawMoon(pal, t) {
    const mx = width * 0.82, my = height * 0.16;
    const r = Math.min(width, height) * 0.045;
    // halo
    const halo = ctx.createRadialGradient(mx, my, r * 0.4, mx, my, r * 4);
    halo.addColorStop(0, "rgba(235,240,255,0.25)");
    halo.addColorStop(1, "rgba(235,240,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(mx - r * 4, my - r * 4, r * 8, r * 8);
    // body with crescent shadow (clipped so the shadow stays on the moon)
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#f2f2e6";
    ctx.fillRect(mx - r, my - r, r * 2, r * 2);
    ctx.fillStyle = rgb(pal.top, 0.9);
    ctx.beginPath();
    ctx.arc(mx - r * 0.42, my - r * 0.14, r * 0.94, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ─────────────── hills ─────────────── */

  function drawHill(layer, pal) {
    const shades = [
      rgb(pal.ground.map((v) => Math.round(v * 1.15))),
      rgb(pal.ground.map((v) => Math.round(v * 0.8))),
      rgb(pal.ground.map((v) => Math.round(v * 0.5))),
    ];
    ctx.fillStyle = shades[layer];
    ctx.beginPath();
    ctx.moveTo(0, height);
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const xn = i / steps;
      ctx.lineTo(xn * width, hillY(layer, xn));
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  /* ─────────────── buildings ─────────────── */

  function glow(x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace("ALPHA", String(alpha)));
    g.addColorStop(1, color.replace("ALPHA", "0"));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const GOLD = "rgba(255,214,120,ALPHA)";
  const PINK = "rgba(255,170,220,ALPHA)";
  const CYAN = "rgba(150,230,255,ALPHA)";

  /* — fireflies (live agents) — */
  function syncFireflies(count) {
    const target = Math.min(count, 24);
    while (fireflies.length < target) {
      fireflies.push({
        x: U.rand(0.05, 0.95), y: U.rand(0.55, 0.8),
        a: U.rand(0, Math.PI * 2), phase: U.rand(0, Math.PI * 2),
        speed: U.rand(0.008, 0.02),
      });
    }
    fireflies.length = target;
  }

  function drawFireflies(t, dt) {
    for (const f of fireflies) {
      f.a += U.rand(-1.5, 1.5) * dt;
      f.x += Math.cos(f.a) * f.speed * dt;
      f.y += Math.sin(f.a) * f.speed * dt * 0.6;
      f.x = U.clamp(f.x, 0.03, 0.97);
      f.y = U.clamp(f.y, 0.5, 0.86);
      const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(t * 1.4 + f.phase));
      const x = f.x * width, y = f.y * height;
      glow(x, y, 12, GOLD, 0.35 * pulse);
      ctx.fillStyle = `rgba(255,240,170,${0.9 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* — glowshrooms — */
  function drawGlowshrooms(count, t) {
    const n = Math.min(count, 12);
    const r2 = U.mulberry32(W.state.S.seed + 7);
    for (let i = 0; i < n; i++) {
      const xn = 0.06 + r2() * 0.88;
      const scale = 0.7 + r2() * 0.7;
      const y = hillY(2, xn) + 6;
      const x = xn * width;
      const h = 16 * scale, cw = 14 * scale;
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.2 + i * 1.7);
      glow(x, y - h * 0.6, 26 * scale, CYAN, 0.22 * pulse);
      // stem
      ctx.fillStyle = "#cfd8e8";
      ctx.beginPath();
      ctx.roundRect(x - 2.2 * scale, y - h * 0.55, 4.4 * scale, h * 0.55, 2);
      ctx.fill();
      // cap
      ctx.fillStyle = `rgba(140,220,255,${0.85 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y - h * 0.55, cw / 2, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* — lantern string — */
  function drawLanterns(count, t) {
    if (count <= 0) return;
    const n = Math.min(count, 9);
    const x0 = width * 0.08, x1 = width * 0.55;
    const y0 = hillY(1, 0.08) - 40, y1 = hillY(1, 0.55) - 46;
    // posts
    ctx.strokeStyle = "rgba(40,40,70,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 40); ctx.lineTo(x0, y0);
    ctx.moveTo(x1, y1 + 46); ctx.lineTo(x1, y1);
    ctx.stroke();
    // rope (sagging curve)
    ctx.strokeStyle = "rgba(120,120,160,0.5)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + 26, x1, y1);
    ctx.stroke();
    // lanterns hang along the rope
    for (let i = 0; i < n; i++) {
      const tt = (i + 1) / (n + 1);
      const lx = U.lerp(x0, x1, tt) + Math.sin(t * 0.8 + i) * 2;
      const sag = 26 * 4 * tt * (1 - tt);
      const ly = U.lerp(y0, y1, tt) + sag + 7;
      const pulse = 0.8 + 0.2 * Math.sin(t * 1.1 + i * 2.2);
      glow(lx, ly, 20, GOLD, 0.3 * pulse);
      ctx.fillStyle = `rgba(255,190,110,${0.95 * pulse})`;
      ctx.beginPath();
      ctx.roundRect(lx - 5, ly - 7, 10, 14, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(90,50,20,0.9)";
      ctx.fillRect(lx - 3, ly - 9, 6, 2.5);
    }
  }

  /* — moonflowers — */
  function drawMoonflowers(count, t) {
    const n = Math.min(count, 8);
    const r2 = U.mulberry32(W.state.S.seed + 13);
    for (let i = 0; i < n; i++) {
      const xn = 0.6 + r2() * 0.34;
      const y = hillY(1, xn) + 4;
      const x = xn * width;
      const scale = 0.8 + r2() * 0.5;
      const sway = Math.sin(t * 0.9 + i * 1.3) * 2;
      const hx = x + sway, hy = y - 26 * scale;
      // stem
      ctx.strokeStyle = "rgba(90,140,110,0.85)";
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway * 0.5, y - 14 * scale, hx, hy);
      ctx.stroke();
      // petals
      const open = 0.75 + 0.25 * Math.sin(t * 0.7 + i);
      glow(hx, hy, 22 * scale, PINK, 0.25 * open);
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2 + t * 0.1;
        ctx.fillStyle = `rgba(255,185,235,${0.8 * open})`;
        ctx.beginPath();
        ctx.ellipse(
          hx + Math.cos(a) * 6 * scale * open,
          hy + Math.sin(a) * 6 * scale * open,
          4.5 * scale, 2.6 * scale, a, 0, Math.PI * 2
        );
        ctx.fill();
      }
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath();
      ctx.arc(hx, hy, 2.6 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* — beacon — */
  function drawBeacon(count, t) {
    const xn = 0.72;
    const x = xn * width, y = hillY(1, xn) + 2;
    const h = 64 + Math.min(count, 20) * 2;
    const pulse = 0.75 + 0.25 * Math.sin(t * 1.6);
    // beam
    const beam = ctx.createLinearGradient(x, y - h, x, y - h - 130);
    beam.addColorStop(0, `rgba(255,220,140,${0.28 * pulse})`);
    beam.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - h);
    ctx.lineTo(x - 26, y - h - 130);
    ctx.lineTo(x + 26, y - h - 130);
    ctx.lineTo(x + 6, y - h);
    ctx.closePath();
    ctx.fill();
    // tower
    ctx.fillStyle = "rgba(36,38,72,0.95)";
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x - 4.5, y - h);
    ctx.lineTo(x + 4.5, y - h);
    ctx.lineTo(x + 10, y);
    ctx.closePath();
    ctx.fill();
    // window lights
    ctx.fillStyle = `rgba(255,214,120,${0.8 * pulse})`;
    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(x - 1.5, y - (h * i) / 4, 3, 4);
    }
    // top orb
    glow(x, y - h - 4, 26, GOLD, 0.5 * pulse);
    ctx.fillStyle = "#ffe9b0";
    ctx.beginPath();
    ctx.arc(x, y - h - 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* — ember owl — */
  function drawOwls(count, t) {
    const n = Math.min(count, 3);
    const spots = [0.88, 0.03, 0.45];
    for (let i = 0; i < n; i++) {
      const xn = spots[i];
      const x = xn * width;
      const gy = hillY(1, xn);
      const py = gy - 34;
      // post
      ctx.strokeStyle = "rgba(40,40,70,0.9)";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x, gy); ctx.lineTo(x, py);
      ctx.stroke();
      // body
      const breathe = 1 + Math.sin(t * 0.9 + i * 2) * 0.02;
      ctx.fillStyle = "rgba(30,28,56,0.98)";
      ctx.beginPath();
      ctx.ellipse(x, py - 13, 11 * breathe, 14 * breathe, 0, 0, Math.PI * 2);
      ctx.fill();
      // ear tufts
      ctx.beginPath();
      ctx.moveTo(x - 8, py - 24); ctx.lineTo(x - 4, py - 31); ctx.lineTo(x - 1, py - 25);
      ctx.moveTo(x + 8, py - 24); ctx.lineTo(x + 4, py - 31); ctx.lineTo(x + 1, py - 25);
      ctx.fill();
      // eyes (blink every few seconds)
      const blink = Math.sin(t * 0.7 + i * 3.1) > 0.97 ? 0.1 : 1;
      glow(x, py - 16, 14, GOLD, 0.2);
      ctx.fillStyle = "#ffb24d";
      ctx.beginPath();
      ctx.ellipse(x - 4, py - 16, 2.4, 2.4 * blink, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 4, py - 16, 2.4, 2.4 * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* — aurora — */
  function drawAurora(count, t) {
    if (count <= 0) return;
    const bands = Math.min(1 + Math.floor(count / 5), 3);
    const strength = Math.min(0.1 + count * 0.02, 0.32);
    for (let b = 0; b < bands; b++) {
      const baseY = height * (0.14 + b * 0.07);
      const hue = (140 + b * 60 + t * 4) % 360;
      ctx.beginPath();
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const xn = i / steps;
        const y = baseY + Math.sin(xn * 4 + t * 0.3 + b * 2) * 18 + Math.sin(xn * 9 - t * 0.2) * 8;
        i === 0 ? ctx.moveTo(xn * width, y) : ctx.lineTo(xn * width, y);
      }
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${strength})`;
      ctx.lineWidth = 26;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  /* — fallen star — */
  function drawFallenStars(count, t) {
    const n = Math.min(count, 2);
    const spots = [0.18, 0.92];
    for (let i = 0; i < n; i++) {
      const xn = spots[i];
      const x = xn * width;
      const y = hillY(0, xn) - 6;
      const breathe = 1 + Math.sin(t * 1.1 + i * 2.4) * 0.08;
      glow(x, y, 34 * breathe, GOLD, 0.4);
      drawStarShape(x, y, 11 * breathe, "#ffe9a8");
    }
  }

  function drawStarShape(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* — moon well — */
  function drawMoonwell(count, t) {
    if (count <= 0) return;
    const xn = 0.3;
    const x = xn * width, y = hillY(2, xn) + 18;
    const rx = 44, ry = 13;
    glow(x, y, 60, CYAN, 0.18);
    // pool
    const pool = ctx.createRadialGradient(x, y, 2, x, y, rx);
    pool.addColorStop(0, "rgba(190,220,255,0.85)");
    pool.addColorStop(1, "rgba(60,90,160,0.5)");
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // stone rim
    ctx.strokeStyle = "rgba(150,160,200,0.5)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // shimmer lines
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const ly = y - 4 + i * 4;
      const off = Math.sin(t * 1.8 + i * 2) * 5;
      ctx.beginPath();
      ctx.moveTo(x - 18 + off, ly);
      ctx.lineTo(x + 2 + off, ly);
      ctx.stroke();
    }
  }

  /* — comets — */
  function updateComets(count, dt) {
    if (count > 0) {
      cometTimer -= dt;
      if (cometTimer <= 0) {
        cometTimer = Math.max(2.5, 14 - count * 0.8) + U.rand(0, 3);
        const fromLeft = Math.random() < 0.5;
        comets.push({
          x: fromLeft ? -0.05 : 1.05,
          y: U.rand(0.05, 0.3),
          vx: (fromLeft ? 1 : -1) * U.rand(0.14, 0.24),
          vy: U.rand(0.02, 0.05),
          life: 0,
        });
      }
    }
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life += dt;
      if (c.x < -0.15 || c.x > 1.15 || c.y > 0.6) comets.splice(i, 1);
    }
  }

  function drawComets() {
    for (const c of comets) {
      const x = c.x * width, y = c.y * height;
      const tailX = x - c.vx * width * 0.55, tailY = y - c.vy * height * 0.55;
      const grad = ctx.createLinearGradient(x, y, tailX, tailY);
      grad.addColorStop(0, "rgba(255,240,200,0.95)");
      grad.addColorStop(1, "rgba(255,240,200,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      glow(x, y, 10, GOLD, 0.5);
    }
  }

  /* ─────────────── main draw ─────────────── */

  function draw(t, dt) {
    const S = W.state.S;
    const pal = paletteNow();
    const own = (id) => S.buildings[id] || 0;

    drawSky(pal, t);
    drawMoon(pal, t);
    drawAurora(own("aurora"), t);
    updateComets(own("comet"), dt);
    drawComets();

    drawHill(0, pal);
    drawFallenStars(own("fallenstar"), t);
    drawHill(1, pal);
    drawLanterns(own("lantern"), t);
    drawMoonflowers(own("moonflower"), t);
    if (own("beacon") > 0) drawBeacon(own("beacon"), t);
    drawOwls(own("owl"), t);
    drawHill(2, pal);
    drawGlowshrooms(own("glowshroom"), t);
    drawMoonwell(own("moonwell"), t);
    syncFireflies(own("firefly"));
    drawFireflies(t, dt);

    // wisp lives between world and particles
    W.wisp.draw(ctx, t, dt);
    W.particles.update(dt);
    W.particles.draw(ctx);
  }

  W.scene = {
    init(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext("2d");
      buildWorld(W.state.S.seed);
      resize();
      window.addEventListener("resize", resize);
    },
    rebuild() { buildWorld(W.state.S.seed); },
    draw,
    get width() { return width; },
    get height() { return height; },
    hillY,
    /** Where the wisp floats. */
    wispPos() { return { x: width / 2, y: height * 0.42 }; },
  };
})();
