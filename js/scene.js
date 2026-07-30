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

  /* ─────────────── weather (cosmetic only) ─────────────── */
  let weather = { type: "clear", k: 0 };  // k = 0..1 intensity
  let weatherTimer = 300;                  // first change after ~5 min
  let weatherTarget = 0;
  let petalTimer = 0;

  function updateWeather(dt, t) {
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      weatherTimer = U.rand(360, 720);
      const roll = Math.random();
      const next = roll < 0.4 ? "clear" : roll < 0.6 ? "mist" : roll < 0.8 ? "breeze" : "shimmer";
      if (next !== weather.type) {
        weather = { type: next, k: weather.type === "clear" ? 0 : weather.k };
        weatherTarget = next === "clear" ? 0 : 1;
        if (next !== "clear" && W.state.S.flags.introDone) {
          const msg = { mist: "Mist settles between the hills…", breeze: "A soft breeze wanders in…", shimmer: "The stars are extra talkative tonight…" }[next];
          W.ui.toast("🌫 " + msg, "");
        }
      }
    }
    weather.k += (weatherTarget - weather.k) * Math.min(dt * 0.3, 1);

    // breeze: loose petals drift across
    if (weather.type === "breeze" && weather.k > 0.3) {
      petalTimer -= dt;
      if (petalTimer <= 0) {
        petalTimer = U.rand(0.4, 1.2);
        W.particles.spawn({
          x: -10, y: U.rand(height * 0.3, height * 0.75),
          vx: U.rand(35, 70), vy: U.rand(-6, 14),
          drag: 1, life: U.rand(8, 14),
          size: U.rand(2, 3.5), hue: U.pick([330, 45, 200]),
          sat: 70, lum: 80, alpha: 0.7, twinkle: 1.2,
        });
      }
    }
  }

  /** Wind multiplier for swaying things (lanterns, flowers). */
  function windFactor() {
    return 1 + (weather.type === "breeze" ? weather.k * 2.2 : 0);
  }

  /* ─────────────── seasonal touches (real calendar) ─────────────── */
  let seasonOverride = null;
  let seasonTimer = 0;

  function currentSeason() {
    if (seasonOverride) return seasonOverride;
    const d = new Date();
    const m = d.getMonth() + 1, day = d.getDate();
    if ((m === 12 && day === 31) || (m === 1 && day === 1)) return "newyear";
    if (m === 2 && day === 14) return "valentine";
    if (m === 12 || m === 1 || (m === 2 && day <= 15)) return "winter";
    return null;
  }

  function updateSeason(dt) {
    const season = currentSeason();
    if (!season) return;
    seasonTimer -= dt;
    if (seasonTimer > 0) return;
    if (season === "winter") {
      seasonTimer = 0.25;
      W.particles.spawn({
        x: U.rand(0, width), y: -6,
        vx: U.rand(-8, 8), vy: U.rand(18, 34),
        drag: 1, life: U.rand(8, 14), size: U.rand(1.5, 2.8),
        hue: 220, sat: 30, lum: 92, alpha: 0.8, twinkle: 0.8,
      });
    } else if (season === "valentine") {
      seasonTimer = 2.5;
      W.particles.heart(U.rand(width * 0.1, width * 0.9), U.rand(height * 0.3, height * 0.7));
    } else if (season === "newyear") {
      seasonTimer = 20;
      // the sky celebrates
      showerUntil = Math.max(showerUntil, Date.now() + 8000);
    }
  }

  function drawMist(t) {
    if (weather.type !== "mist" || weather.k < 0.02) return;
    for (let b = 0; b < 3; b++) {
      const y = height * (0.58 + b * 0.12);
      const drift = ((t * (4 + b * 2)) % (width * 1.6)) - width * 0.3;
      const g = ctx.createRadialGradient(drift, y, 10, drift, y, width * 0.45);
      g.addColorStop(0, `rgba(190,200,235,${0.05 * weather.k})`);
      g.addColorStop(1, "rgba(190,200,235,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 90, width, 180);
      const g2 = ctx.createRadialGradient(width - drift, y + 40, 10, width - drift, y + 40, width * 0.4);
      g2.addColorStop(0, `rgba(170,185,225,${0.04 * weather.k})`);
      g2.addColorStop(1, "rgba(170,185,225,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, y - 50, width, 180);
    }
  }

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
      const shimmer = weather.type === "shimmer" ? weather.k : 0;
      for (const s of stars) {
        const tw = (0.55 - 0.2 * shimmer) + (0.45 + 0.4 * shimmer) * Math.sin(t * s.speed * (1 + shimmer * 1.5) + s.phase);
        ctx.globalAlpha = Math.max(0, vis * tw * 0.9);
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

  /* ─────────────── memorial stars (ascended wisps) ─────────────── */

  function drawMemorialStars(t) {
    const list = W.state.S.stars;
    const bless = W.game && W.game.blessing;
    // your own constellation — faint lines joining the family
    if (list.length >= 2) {
      ctx.strokeStyle = `rgba(200,215,255,${0.10 + 0.05 * Math.sin(t * 0.7)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < list.length; i++) {
        const x = list[i].x * width, y = list[i].y * height;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      // …and its name, if you've given it one
      const cname = W.state.S.constellation;
      if (cname && list.length >= 3) {
        let cx = 0, cy = 0;
        for (const s of list) { cx += s.x; cy += s.y; }
        cx = (cx / list.length) * width;
        cy = (cy / list.length) * height + 34;
        ctx.font = `italic 500 ${Math.max(12, Math.round(Math.min(width, height) * 0.022))}px Georgia, serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(205,218,255,${0.32 + 0.08 * Math.sin(t * 0.5)})`;
        ctx.fillText(cname, cx, cy);
      }
    }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const x = s.x * width, y = s.y * height;
      const blessed = bless && bless.idx === i;
      let tw = 0.82 + 0.18 * Math.sin(t * 1.1 + i * 2.3);
      let haloR = 26;
      if (blessed) {
        tw = 1.1 + 0.35 * Math.sin(t * 6);
        haloR = 46;
        // a gentle ring, calling you
        ctx.strokeStyle = `hsla(${s.hue}, 100%, 85%, ${0.4 + 0.3 * Math.sin(t * 5)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -t * 25;
        ctx.beginPath();
        ctx.arc(x, y, 24 + Math.sin(t * 3) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const halo = ctx.createRadialGradient(x, y, 1, x, y, haloR);
      halo.addColorStop(0, `hsla(${s.hue}, 95%, 78%, ${0.5 * tw})`);
      halo.addColorStop(1, `hsla(${s.hue}, 95%, 78%, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(x - haloR, y - haloR, haloR * 2, haloR * 2);
      drawStarShape(x, y, 7 * tw, `hsl(${s.hue}, 100%, 88%)`);
    }
  }

  /** Which memorial star (if any) is at screen point x,y? */
  function starHit(x, y) {
    const list = W.state.S.stars;
    for (const s of list) {
      if (Math.hypot(s.x * width - x, s.y * height - y) < 24) return s;
    }
    return null;
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
      const lx = U.lerp(x0, x1, tt) + Math.sin(t * 0.8 + i) * 2 * windFactor();
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
      const sway = Math.sin(t * 0.9 + i * 1.3) * 2 * windFactor();
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

  /* — star anvil — */
  function drawAnvil(count, t) {
    if (count <= 0) return;
    const xn = 0.86; // clear of the centred panel

    const x = xn * width, y = hillY(2, xn) + 8;
    const s = 1 + Math.min(count, 20) * 0.012;
    // block + horn silhouette
    ctx.fillStyle = "rgba(28,26,52,0.98)";
    ctx.beginPath();
    ctx.roundRect(x - 16 * s, y - 18 * s, 32 * s, 8 * s, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 16 * s, y - 14 * s);
    ctx.quadraticCurveTo(x + 30 * s, y - 16 * s, x + 26 * s, y - 10 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 7 * s, y - 10 * s, 14 * s, 10 * s);
    // the little star being forged — pulses with each "clink"
    const cycle = (t % 2.2) / 2.2;
    const hit = cycle < 0.12 ? 1 - cycle / 0.12 : 0;
    glow(x, y - 22 * s, 18 * s * (1 + hit), GOLD, 0.35 + hit * 0.35);
    drawStarShape(x, y - 22 * s, (5 + hit * 2.5) * s, "#ffe9a8");
    // sparks right after the clink
    if (hit > 0) {
      ctx.strokeStyle = `rgba(255,220,140,${hit * 0.9})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI - Math.PI * 0.1 + Math.sin(i * 7) * 0.2;
        const d = (1 - hit) * 22 * s + 6;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * d, y - 22 * s - Math.sin(a) * d);
        ctx.lineTo(x + Math.cos(a) * (d + 5), y - 22 * s - Math.sin(a) * (d + 5));
        ctx.stroke();
      }
    }
  }

  /* — cloud shepherd — */
  function drawShepherdClouds(count, t) {
    if (count <= 0) return;
    const n = Math.min(1 + Math.floor(count / 4), 4);
    for (let i = 0; i < n; i++) {
      const drift = ((t * 0.008 * (1 + i * 0.3) + i * 0.31) % 1.2) - 0.1;
      const x = drift * width;
      const y = height * (0.30 + (i % 2) * 0.06);
      const s = 0.8 + (i % 3) * 0.25;
      // fluffy body: overlapping soft blobs
      for (let b = 0; b < 4; b++) {
        const bx = x + (b - 1.5) * 20 * s;
        const by = y + Math.sin(b * 2.4) * 5 * s;
        const g = ctx.createRadialGradient(bx, by, 2, bx, by, 22 * s);
        g.addColorStop(0, "rgba(210,220,255,0.22)");
        g.addColorStop(1, "rgba(210,220,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(bx - 22 * s, by - 22 * s, 44 * s, 44 * s);
      }
      // starlight rain
      ctx.strokeStyle = "rgba(220,230,255,0.35)";
      ctx.lineWidth = 1;
      for (let r = 0; r < 3; r++) {
        const rx = x + (r - 1) * 16 * s;
        const fall = ((t * 0.5 + r * 0.37 + i) % 1);
        const ry = y + 18 * s + fall * 30;
        ctx.globalAlpha = 1 - fall;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx, ry + 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* — moon garden — */
  function drawMoonGarden(count, t) {
    if (count <= 0) return;
    const mx = width * 0.82, my = height * 0.16;
    const r = Math.min(width, height) * 0.045;
    const n = Math.min(count, 10);
    for (let i = 0; i < n; i++) {
      // tulips stand along the moon's lower rim
      const a = Math.PI * (0.25 + (i / Math.max(n - 1, 1)) * 0.5);
      const fx = mx + Math.cos(a) * r * 0.98;
      const fy = my + Math.sin(a) * r * 0.98;
      const sway = Math.sin(t * 1.4 + i) * 0.06;
      const hue = (i * 47) % 360;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(a - Math.PI / 2 + sway);
      // stem
      ctx.strokeStyle = "rgba(110,160,120,0.9)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, r * 0.28);
      ctx.stroke();
      // tulip head
      ctx.fillStyle = `hsla(${hue}, 75%, 70%, 0.95)`;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 0.075, r * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* — sun seed — */
  function drawSunSeed(count, t) {
    if (count <= 0) return;
    const xn = 0.12;
    const x = xn * width, y = hillY(2, xn) + 10;
    const s = 1 + Math.min(count, 10) * 0.05;
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.9);
    // warm light seeping from under the soil
    glow(x, y, 40 * s, GOLD, 0.28 * pulse);
    // the seed: a dark teardrop, half-buried
    ctx.fillStyle = "rgba(46,36,60,0.98)";
    ctx.beginPath();
    ctx.moveTo(x, y - 30 * s);
    ctx.bezierCurveTo(x + 18 * s, y - 22 * s, x + 15 * s, y + 2, x, y + 4);
    ctx.bezierCurveTo(x - 15 * s, y + 2, x - 18 * s, y - 22 * s, x, y - 30 * s);
    ctx.fill();
    // glowing crack — the dream leaking out
    ctx.strokeStyle = `rgba(255,214,120,${0.65 + 0.35 * pulse})`;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 2 * s, y - 26 * s);
    ctx.lineTo(x + 3 * s, y - 18 * s);
    ctx.lineTo(x - 2 * s, y - 11 * s);
    ctx.stroke();
    if (count >= 5) {
      ctx.beginPath();
      ctx.moveTo(x + 6 * s, y - 22 * s);
      ctx.lineTo(x + 3 * s, y - 14 * s);
      ctx.stroke();
    }
    // when the sky is full enough (10 raised stars), the seed stirs…
    if ((W.state.S.stars || []).length >= 10) {
      const sway = Math.sin(t * 1.1) * 0.05;
      glow(x, y - 34 * s, 30 * s, GOLD, 0.4 + 0.15 * Math.sin(t * 1.3));
      ctx.save();
      ctx.translate(x, y - 28 * s);
      ctx.rotate(sway);
      ctx.strokeStyle = "#9fdd8f";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(2 * s, -8 * s, 0, -14 * s);
      ctx.stroke();
      ctx.fillStyle = "#b5eaa2";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 4 * s, -13 * s, 5 * s, 2.6 * s, side * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* — comets — */
  let showerUntil = 0;

  function updateComets(count, dt) {
    const shower = Date.now() < showerUntil;
    if (count > 0 || shower) {
      cometTimer -= dt;
      if (cometTimer <= 0) {
        cometTimer = shower
          ? U.rand(0.35, 0.9)
          : Math.max(2.5, 14 - count * 0.8) + U.rand(0, 3);
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

  /** Remove and return true if a comet is near screen point x,y. */
  function cometHit(x, y) {
    for (let i = 0; i < comets.length; i++) {
      const c = comets[i];
      if (Math.hypot(c.x * width - x, c.y * height - y) < 30) {
        comets.splice(i, 1);
        return true;
      }
    }
    return false;
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

  /* — visitors — */
  function visitorScreenPos(t) {
    const v = W.game && W.game.visitor;
    if (!v) return null;
    const age = (Date.now() - v.born) / 1000;
    const k = U.clamp(age / v.type.dur, 0, 1);
    if (v.type.id === "hedgehog") {
      const ltr = v.born % 2 === 0;
      const xn = ltr ? 0.02 + k * 0.96 : 0.98 - k * 0.96;
      return { x: xn * width, y: hillY(2, xn) + 2, k, age, dir: ltr ? 1 : -1 };
    }
    if (v.type.id === "boat") {
      const x = 0.3 * width + Math.sin(age * 0.5) * 26;
      return { x, y: hillY(2, 0.3) + 15 + Math.sin(age * 1.3) * 2, k, age, dir: 1 };
    }
    // cloudsheep
    const xn = 0.05 + k * 0.9;
    return { x: xn * width, y: height * 0.34 + Math.sin(age * 0.8) * 10, k, age, dir: 1 };
  }

  function drawVisitor(t) {
    const v = W.game && W.game.visitor;
    const p = visitorScreenPos(t);
    if (!v || !p) return;
    const fade = p.k > 0.9 ? 1 - (p.k - 0.9) / 0.1 : p.k < 0.04 ? p.k / 0.04 : 1;
    ctx.globalAlpha = fade;

    if (v.type.id === "hedgehog") {
      const step = Math.sin(p.age * 10) * 1.2;
      // spikes
      ctx.fillStyle = "#3a3050";
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1 + i / 7);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 10, p.y - 6 + Math.sin(a) * 8);
        ctx.lineTo(p.x + Math.cos(a) * 16, p.y - 7 + Math.sin(a) * 13);
        ctx.lineTo(p.x + Math.cos(a + 0.35) * 10, p.y - 6 + Math.sin(a + 0.35) * 8);
        ctx.fill();
      }
      // body + snout
      ctx.fillStyle = "#5a4a6e";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 6, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x + p.dir * 10, p.y - 3.5, 4.5, 3, p.dir * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2c2440";
      ctx.beginPath();
      ctx.arc(p.x + p.dir * 14, p.y - 3.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
      // legs
      ctx.strokeStyle = "#4a3c5e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y + 1); ctx.lineTo(p.x - 4 + step, p.y + 4);
      ctx.moveTo(p.x + 4, p.y + 1); ctx.lineTo(p.x + 4 - step, p.y + 4);
      ctx.stroke();
      // tiny lantern on a stick
      const lx = p.x + p.dir * 6, ly = p.y - 18 + Math.sin(p.age * 3) * 1.5;
      ctx.strokeStyle = "#7a6a8e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x + p.dir * 2, p.y - 8);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      glow(lx, ly + 3, 14, GOLD, 0.5);
      ctx.fillStyle = "#ffd97a";
      ctx.beginPath();
      ctx.roundRect(lx - 3, ly, 6, 8, 2);
      ctx.fill();
    } else if (v.type.id === "boat") {
      glow(p.x, p.y, 18, CYAN, 0.15);
      ctx.fillStyle = "#f2f4ff";
      ctx.beginPath();
      ctx.moveTo(p.x - 12, p.y);
      ctx.lineTo(p.x + 12, p.y);
      ctx.lineTo(p.x + 7, p.y - 5);
      ctx.lineTo(p.x - 7, p.y - 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x, p.y - 14);
      ctx.lineTo(p.x + 7, p.y - 6);
      ctx.closePath();
      ctx.fill();
    } else if (v.type.id === "cloudsheep") {
      // fluffy body
      for (let i = 0; i < 4; i++) {
        const bx = p.x + (i - 1.5) * 8;
        const by = p.y + Math.sin(i * 2.1) * 3;
        const g = ctx.createRadialGradient(bx, by, 1, bx, by, 11);
        g.addColorStop(0, "rgba(235,240,255,0.95)");
        g.addColorStop(1, "rgba(235,240,255,0.25)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      // face
      ctx.fillStyle = "#8a90b8";
      ctx.beginPath();
      ctx.ellipse(p.x + 15, p.y - 2, 6, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2e2a4a";
      ctx.beginPath();
      ctx.arc(p.x + 17, p.y - 3, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // stubby legs dangling
      ctx.strokeStyle = "rgba(180,188,220,0.9)";
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const lx = p.x + (i - 1) * 8;
        ctx.beginPath();
        ctx.moveTo(lx, p.y + 8);
        ctx.lineTo(lx, p.y + 13 + Math.sin(p.age * 2 + i) * 1.5);
        ctx.stroke();
      }
      // it leaks a little light
      if (Math.random() < 0.05) {
        W.particles.spawn({ x: p.x + U.rand(-10, 10), y: p.y + 14, vy: 30, g: 20, life: 1.2, size: 1.8, hue: 48 });
      }
    }

    // a small heart if already greeted
    if (v.greeted && Math.sin(t * 4) > 0) {
      ctx.fillStyle = "rgba(255,140,170,0.8)";
      ctx.font = "10px sans-serif";
      ctx.fillText("♥", p.x - 3, p.y - 24);
    }
    ctx.globalAlpha = 1;
  }

  function visitorHit(x, y, t) {
    const p = visitorScreenPos(t);
    if (!p) return false;
    return Math.hypot(p.x - x, p.y - y) < 34;
  }

  /* — living moments: a petal drifts to the wisp — */
  let petalMoment = null; // {t, dur, from:{x,y}}
  let petalTimer2 = U.rand(420, 900);

  function updatePetalMoment(dt) {
    const own = W.state.S.buildings.moonflower || 0;
    if (petalMoment) {
      petalMoment.t += dt;
      if (petalMoment.t >= petalMoment.dur) {
        petalMoment = null;
        if (W.game && W.game.petalArrived) W.game.petalArrived();
      }
      return;
    }
    if (own <= 0 || (W.game && W.game.ceremony)) return;
    petalTimer2 -= dt;
    if (petalTimer2 <= 0) {
      petalTimer2 = U.rand(420, 900);
      if (document.visibilityState !== "visible") return;
      startPetal();
    }
  }

  function startPetal() {
    // same seeded position as the first drawn moonflower
    const r2 = U.mulberry32(W.state.S.seed + 13);
    const xn = 0.6 + r2() * 0.34;
    const scale = 0.8 + r2() * 0.5;
    petalMoment = {
      t: 0, dur: 7,
      from: { x: xn * width, y: hillY(1, xn) + 4 - 26 * scale },
    };
  }

  function drawPetalMoment(t) {
    if (!petalMoment) return;
    const k = U.easeInOut(U.clamp(petalMoment.t / petalMoment.dur, 0, 1));
    const to = W.scene.wispPos();
    const x = U.lerp(petalMoment.from.x, to.x, k) + Math.sin(petalMoment.t * 2.2) * 14 * (1 - k);
    const y = U.lerp(petalMoment.from.y, to.y, k) - Math.sin(k * Math.PI) * 40;
    glow(x, y, 12, PINK, 0.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(petalMoment.t * 1.5);
    ctx.fillStyle = "rgba(255,185,235,0.95)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* — golden dewdrop — */
  function dewScreenPos(t) {
    const dew = W.game && W.game.dew;
    if (!dew) return null;
    const k = (Date.now() - dew.born) / 1000 / W.config.DEW.fallSec;
    const x = (dew.x + Math.sin(t * 1.6) * 0.02) * width;
    const y = (-0.06 + k * 0.8) * height;
    return { x, y, k };
  }

  function drawDew(t) {
    const p = dewScreenPos(t);
    if (!p) return;
    const s = 1 + Math.sin(t * 4) * 0.08;
    const fade = p.k > 0.85 ? 1 - (p.k - 0.85) / 0.15 : 1;
    ctx.globalAlpha = fade;
    glow(p.x, p.y, 44 * s, GOLD, 0.55);
    // teardrop body
    const g = ctx.createRadialGradient(p.x - 3, p.y - 4, 1, p.x, p.y, 14 * s);
    g.addColorStop(0, "#fffdf0");
    g.addColorStop(0.6, "#ffe9a0");
    g.addColorStop(1, "#ffc24d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 17 * s);
    ctx.bezierCurveTo(p.x + 11 * s, p.y - 5 * s, p.x + 10 * s, p.y + 9 * s, p.x, p.y + 11 * s);
    ctx.bezierCurveTo(p.x - 10 * s, p.y + 9 * s, p.x - 11 * s, p.y - 5 * s, p.x, p.y - 17 * s);
    ctx.fill();
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(p.x - 4 * s, p.y - 3 * s, 2.5 * s, 4 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function dewHit(x, y, t) {
    const p = dewScreenPos(t);
    if (!p) return false;
    return Math.hypot(p.x - x, p.y - y) < 38;
  }

  /* ─────────────── main draw ─────────────── */

  function draw(t, dt) {
    const S = W.state.S;
    const pal = paletteNow();
    const own = (id) => S.buildings[id] || 0;

    updateWeather(dt, t);
    updateSeason(dt);
    drawSky(pal, t);
    drawMoon(pal, t);
    drawMoonGarden(own("moongarden"), t);
    drawMemorialStars(t);
    drawAurora(own("aurora"), t);
    drawShepherdClouds(own("shepherd"), t);
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
    drawMist(t);
    drawGlowshrooms(own("glowshroom"), t);
    drawMoonwell(own("moonwell"), t);
    drawAnvil(own("anvil"), t);
    drawSunSeed(own("sunseed"), t);
    syncFireflies(own("firefly"));
    drawFireflies(t, dt);

    drawVisitor(t);
    drawDew(t);
    updatePetalMoment(dt);
    drawPetalMoment(t);

    // wisp lives between world and particles
    W.wisp.draw(ctx, t, dt);
    W.particles.update(dt);
    W.particles.draw(ctx);

    // dewdrop frenzy bathes the whole meadow in gold
    const frenzy = S.buffs && S.buffs.some((b) => b.id === "dew" && b.until > Date.now());
    if (frenzy) {
      const a = 0.05 + 0.025 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(255,205,110,${a})`;
      ctx.fillRect(0, 0, width, height);
    }
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
    draw, starHit, cometHit, dewHit, visitorHit,
    startShower(seconds) { showerUntil = Date.now() + seconds * 1000; },
    setWeather(type) { weather = { type, k: weather.k }; weatherTarget = type === "clear" ? 0 : 1; },
    setSeason(name) { seasonOverride = name; },
    startPetal,
    get width() { return width; },
    get height() { return height; },
    hillY,
    /** Where the wisp floats. */
    wispPos() { return { x: width / 2, y: height * 0.42 }; },
  };
})();
