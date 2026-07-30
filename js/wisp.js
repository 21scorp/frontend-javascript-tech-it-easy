/* ═══════════════════════════════════════════════════════════════
   WISP — wisp.js
   The little creature itself. Procedurally drawn: layered glow,
   blinking eyes that follow your cursor, squish-springs on touch.
   Later, sprites can replace draw() without touching behaviour.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;

  const wisp = {
    // spring squish
    squish: 0, squishV: 0,
    // blinking
    blinkT: 0, nextBlink: 2.5, blink: 0,
    // pointer tracking (for pupils)
    lookX: 0, lookY: 0,
    // mood: "normal" | "happy" | "sleepy"
    happyTimer: 0,
    petting: false,
    petTimer: 0,
    bobPhase: U.rand(0, Math.PI * 2),
  };

  function stage() {
    return W.state.stageFor(W.state.S.level);
  }

  function radius() {
    const base = stage().radius;
    const scale = Math.min(W.scene.width, W.scene.height) / 700;
    return base * U.clamp(scale, 0.75, 1.4);
  }

  /** 0..1 while ascending, 0 otherwise. */
  function ceremonyK() {
    const c = W.game && W.game.ceremony;
    if (!c) return 0;
    return U.easeInOut(U.clamp(c.t / c.dur, 0, 1));
  }

  function pos(t) {
    const p = W.scene.wispPos();
    const home = { x: p.x, y: p.y + Math.sin(t * 1.3 + wisp.bobPhase) * 8 };
    const c = W.game && W.game.ceremony;
    if (!c) return home;
    const k = ceremonyK();
    return {
      x: U.lerp(home.x, c.to.x * W.scene.width, k),
      y: U.lerp(home.y, c.to.y * W.scene.height, k),
    };
  }

  function hitTest(x, y, t) {
    if (W.game && W.game.ceremony) return false;
    const p = pos(t);
    const r = radius() * 1.6; // generous — it's the whole point of the game
    const dx = x - p.x, dy = y - p.y;
    return dx * dx + dy * dy <= r * r;
  }

  function poke() {
    wisp.squishV = Math.max(wisp.squishV - 3.2, -5);
    wisp.happyTimer = 2.5;
  }

  function setPetting(on) {
    wisp.petting = on;
    if (on) wisp.happyTimer = Math.max(wisp.happyTimer, 1.5);
  }

  function pointerMoved(x, y) {
    wisp.lookX = x;
    wisp.lookY = y;
  }

  function isSleepy() {
    const h = new Date().getHours();
    return (h >= 0 && h < 6) && wisp.happyTimer <= 0;
  }

  /* ─────────────── drawing ─────────────── */

  function draw(ctx, t, dt) {
    // springs & timers
    const springK = 60, springD = 8;
    const a = -springK * wisp.squish - springD * wisp.squishV;
    wisp.squishV += a * dt;
    wisp.squish = U.clamp(wisp.squish + wisp.squishV * dt, -0.38, 0.38);

    wisp.blinkT += dt;
    if (wisp.blinkT > wisp.nextBlink) {
      wisp.blinkT = 0;
      wisp.nextBlink = U.rand(2.2, 6.5);
    }
    // blink shape: quick close+open in first 0.22s after trigger
    const bt = wisp.blinkT;
    wisp.blink = bt < 0.22 ? Math.sin((bt / 0.22) * Math.PI) : 0;

    if (wisp.happyTimer > 0) wisp.happyTimer -= dt;
    if (wisp.petting) {
      wisp.petTimer += dt;
      if (wisp.petTimer > 0.55) {
        wisp.petTimer = 0;
        const p = pos(t);
        W.particles.heart(p.x + U.rand(-20, 20), p.y - radius() * 0.9);
        W.game.onPet();
      }
    }

    const st = stage();
    const ck = ceremonyK();
    const r = radius() * (1 - ck * 0.7);
    const p = pos(t);
    const sleepy = isSleepy();
    const hue = st.hue;

    const sx = 1 - wisp.squish * 0.5;
    const sy = 1 + wisp.squish * 0.5;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(sx, sy);

    // ─ rays (higher stages) ─
    if (st.rays > 0) {
      ctx.save();
      ctx.rotate(t * 0.15);
      ctx.strokeStyle = `hsla(${hue}, 90%, 75%, 0.25)`;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < st.rays; i++) {
        const ang = (i / st.rays) * Math.PI * 2;
        const len = r * (1.45 + 0.12 * Math.sin(t * 2 + i));
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r * 1.2, Math.sin(ang) * r * 1.2);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ─ outer glow ─
    const breathe = 1 + Math.sin(t * 1.8) * 0.04;
    const glowR = r * 2.6 * breathe;
    const outer = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, glowR);
    outer.addColorStop(0, `hsla(${hue}, 100%, 80%, 0.55)`);
    outer.addColorStop(0.5, `hsla(${hue}, 95%, 70%, 0.18)`);
    outer.addColorStop(1, `hsla(${hue}, 95%, 70%, 0)`);
    ctx.fillStyle = outer;
    ctx.fillRect(-glowR, -glowR, glowR * 2, glowR * 2);

    // ─ body ─
    const body = ctx.createRadialGradient(0, -r * 0.25, r * 0.1, 0, 0, r);
    body.addColorStop(0, "#fffdf4");
    body.addColorStop(0.6, `hsl(${hue}, 100%, 86%)`);
    body.addColorStop(1, `hsl(${hue}, 96%, 72%)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // ─ face ─
    const happy = wisp.happyTimer > 0 || wisp.petting;
    drawFace(ctx, r, happy, sleepy, p, t);

    // ─ accessory (wardrobe) ─
    if (W.state.S.accessory) drawAccessory(ctx, W.state.S.accessory, r, t);

    ctx.restore();

    // ─ orbiting motes ─
    if (st.motes > 0) {
      for (let i = 0; i < st.motes; i++) {
        const ang = t * 0.8 + (i / st.motes) * Math.PI * 2;
        const orbR = r * 1.7 + Math.sin(t * 1.5 + i * 2) * r * 0.15;
        const mx = p.x + Math.cos(ang) * orbR;
        const my = p.y + Math.sin(ang) * orbR * 0.45 - r * 0.1;
        const behind = Math.sin(ang) < 0;
        ctx.globalAlpha = behind ? 0.45 : 0.9;
        ctx.fillStyle = `hsl(${hue + 10}, 100%, 85%)`;
        ctx.beginPath();
        ctx.arc(mx, my, 3 + Math.sin(t * 3 + i) * 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // attention moment — a soft ring of longing
    const attn = W.game && W.game.attention;
    if (attn) {
      const k = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.strokeStyle = `hsla(${hue}, 100%, 80%, ${0.35 + 0.3 * k})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([9, 11]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.7 + k * 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (Math.random() < 0.03) {
        W.particles.heart(p.x + U.rand(-r, r), p.y - r * 1.3);
      }
    }

    // sleepy "z z z"
    if (sleepy) {
      ctx.font = `600 ${Math.round(r * 0.35)}px system-ui, sans-serif`;
      ctx.fillStyle = "rgba(230,238,255,0.6)";
      for (let i = 0; i < 3; i++) {
        const zt = (t * 0.5 + i * 0.33) % 1;
        ctx.globalAlpha = (1 - zt) * 0.6;
        ctx.fillText("z", p.x + r * 0.9 + i * 10 + zt * 8, p.y - r - zt * 26);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawFace(ctx, r, happy, sleepy, worldPos, t) {
    const eyeY = -r * 0.12;
    const eyeDX = r * 0.34;
    const eyeR = r * 0.13;

    // pupils drift toward pointer
    let px = 0, py = 0;
    if (wisp.lookX || wisp.lookY) {
      const dx = wisp.lookX - worldPos.x;
      const dy = wisp.lookY - worldPos.y;
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(d / 200, 1) * eyeR * 0.5;
      px = (dx / d) * m;
      py = (dy / d) * m;
    }

    const closed = Math.max(wisp.blink, sleepy ? 0.92 : 0, happy ? 1 : 0);

    ctx.fillStyle = "#2e2a4a";
    if (happy) {
      // closed happy arcs ˘ ˘
      ctx.strokeStyle = "#2e2a4a";
      ctx.lineWidth = r * 0.06;
      ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * eyeDX, eyeY + eyeR * 0.2, eyeR, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    } else {
      const openness = 1 - closed;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * eyeDX, eyeY, eyeR, Math.max(eyeR * openness, r * 0.012), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (openness > 0.35) {
        ctx.fillStyle = "#ffffff";
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(side * eyeDX + px - eyeR * 0.25, eyeY + py - eyeR * 0.3, eyeR * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#2e2a4a";
      }
    }

    // mouth
    ctx.strokeStyle = "#2e2a4a";
    ctx.lineWidth = r * 0.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    const mouthY = r * 0.28;
    if (happy) {
      ctx.arc(0, mouthY - r * 0.06, r * 0.16, Math.PI * 0.15, Math.PI * 0.85);
    } else if (sleepy) {
      ctx.arc(0, mouthY + r * 0.02, r * 0.06, 0, Math.PI * 2);
    } else {
      ctx.arc(0, mouthY - r * 0.02, r * 0.1, Math.PI * 0.2, Math.PI * 0.8);
    }
    ctx.stroke();

    // blush
    ctx.fillStyle = `rgba(255,150,160,${happy ? 0.5 : 0.28})`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.55, r * 0.12, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* Accessories are drawn in wisp-local space (origin = centre, r = body radius). */
  function drawAccessory(ctx, id, r, t) {
    ctx.lineCap = "round";
    if (id === "leaf") {
      ctx.strokeStyle = "#7dbb7a";
      ctx.lineWidth = r * 0.06;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.96);
      ctx.quadraticCurveTo(r * 0.05, -r * 1.18, r * 0.02, -r * 1.28);
      ctx.stroke();
      ctx.fillStyle = "#8fd48b";
      ctx.save();
      ctx.translate(r * 0.02, -r * 1.28);
      ctx.rotate(-0.6 + Math.sin(t * 1.5) * 0.08);
      ctx.beginPath();
      ctx.ellipse(r * 0.14, 0, r * 0.17, r * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (id === "bow") {
      const bx = r * 0.5, by = -r * 0.82;
      ctx.fillStyle = "#ff9ec4";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + side * r * 0.3, by - r * 0.18);
        ctx.lineTo(bx + side * r * 0.3, by + r * 0.18);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#ff6f9c";
      ctx.beginPath();
      ctx.arc(bx, by, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "crown") {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.25 + i * 0.125);
        const fx = Math.cos(a) * r * 1.02;
        const fy = Math.sin(a) * r * 1.02;
        const hue = [340, 45, 200, 300, 20][i];
        for (let pmt = 0; pmt < 5; pmt++) {
          const pa = (pmt / 5) * Math.PI * 2 + t * 0.3;
          ctx.fillStyle = `hsla(${hue}, 85%, 78%, 0.95)`;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(pa) * r * 0.055, fy + Math.sin(pa) * r * 0.055, r * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath();
        ctx.arc(fx, fy, r * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === "scarf") {
      ctx.strokeStyle = "#5560a8";
      ctx.lineWidth = r * 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      // dangling tail with a star
      const tx = r * 0.42, ty = r * 0.86;
      ctx.fillStyle = "#5560a8";
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(0.35 + Math.sin(t * 1.8) * 0.06);
      ctx.beginPath();
      ctx.roundRect(-r * 0.09, 0, r * 0.18, r * 0.42, r * 0.05);
      ctx.fill();
      ctx.fillStyle = "#ffe9a8";
      ctx.font = `${Math.round(r * 0.16)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("✦", 0, r * 0.3);
      ctx.restore();
    } else if (id === "halo") {
      ctx.strokeStyle = "rgba(255,224,130,0.9)";
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.ellipse(0, -r * 1.32 + Math.sin(t * 1.7) * r * 0.04, r * 0.5, r * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (id === "glasses") {
      const eyeY = -r * 0.12, eyeDX = r * 0.34;
      ctx.strokeStyle = "#3a3456";
      ctx.lineWidth = r * 0.045;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * eyeDX, eyeY, r * 0.21, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-eyeDX + r * 0.21, eyeY);
      ctx.lineTo(eyeDX - r * 0.21, eyeY);
      ctx.stroke();
    }
  }

  W.wisp = { draw, hitTest, poke, setPetting, pointerMoved, pos, radius, get petting() { return wisp.petting; } };
})();
