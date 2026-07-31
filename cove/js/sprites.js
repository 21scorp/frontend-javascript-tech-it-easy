/* ═══════════════════════════════════════════════════════════════
   COVE — sprites.js
   THE ART SEAM. Every drawable has a key; today each key paints
   placeholder art with canvas, later each key maps to an atlas
   region (see SPRITES.md). All sprites anchor at their FEET (x,y
   = ground contact) so 3/4 depth-sorting by y just works.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;

  /* ─────────────── real art loader ───────────────
     Drop PNGs into assets/sprites/<key>.png (transparent, feet at
     the bottom edge) and they replace the placeholder painters
     automatically. `w` is the on-screen width in world units.       */

  const DEFS = {
    char_idle: { w: 95 },  char_fish: { w: 130 }, char_chop: { w: 130 },
    stall: { w: 230 },     mine: { w: 300 },
    tree_oak: { w: 150 },  tree_birch: { w: 130 }, tree_maple: { w: 160 },
    tree_yew: { w: 175 },  tree_elder: { w: 190 },
    cust_fien: { w: 78 },  cust_bram: { w: 78 },  cust_saar: { w: 78 },
    cust_milo: { w: 78 },  cust_vera: { w: 78 },  cust_ted: { w: 78 },
    cust_noor: { w: 78 },  cust_kas: { w: 78 },
    item_sardine: { w: 34 }, item_herring: { w: 34 }, item_trout: { w: 34 },
    item_salmon: { w: 34 },  item_tuna: { w: 34 },    item_sword: { w: 34 },
    item_koi: { w: 34 },
    item_oak: { w: 34 }, item_birch: { w: 34 }, item_maple: { w: 34 },
    item_yew: { w: 34 }, item_elder: { w: 34 },
  };

  const IMG = {};   // key -> HTMLImageElement (only when loaded OK)

  (function loadArt() {
    for (const key of Object.keys(DEFS)) {
      const img = new Image();
      img.onload = () => { IMG[key] = img; };
      img.onerror = () => {};   // no file → placeholder stays
      img.src = "assets/sprites/" + key + ".png";
    }
  })();

  /** Draw a loaded sprite anchored at its feet; true if drawn. */
  function art(ctx, key, x, y, opts) {
    const img = IMG[key];
    if (!img) return false;
    const o = opts || {};
    const w = DEFS[key].w * (o.scale || 1);
    const h = w * (img.height / img.width);
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    if (o.rot) ctx.rotate(o.rot);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }

  /* small helpers */
  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = "rgba(60, 80, 40, 0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ─────────────── character ─────────────── */

  function drawChar(ctx, x, y, o) {
    const t = o.t || 0;
    const state = o.state || "idle";
    const flip = o.flip ? -1 : 1;
    const bob = state === "walk" ? Math.abs(Math.sin(t * 9)) * 5
              : Math.sin(t * 2.2) * 2;

    shadow(ctx, x, y, 24, 8);

    // real art? pose sprite + procedural motion on top of it
    const poseKey = state === "fish" ? "char_fish" : state === "chop" ? "char_chop" : "char_idle";
    const rot = state === "chop" ? Math.sin(t * 6) * 0.09
              : state === "walk" ? Math.sin(t * 9) * 0.05 : 0;
    if (art(ctx, IMG[poseKey] ? poseKey : "char_idle", x, y - bob, { flip: o.flip, rot })) return;
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.scale(flip, 1);

    // legs
    const step = state === "walk" ? Math.sin(t * 9) * 7 : 0;
    ctx.strokeStyle = "#5d4a92";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-7, -26); ctx.lineTo(-7 + step, -4);
    ctx.moveTo(7, -26); ctx.lineTo(7 - step, -4);
    ctx.stroke();

    // body (apron over shirt)
    ctx.fillStyle = "#e8965a";
    ctx.beginPath();
    ctx.roundRect(-16, -62, 32, 40, 12);
    ctx.fill();
    ctx.fillStyle = "#f3e7d0";
    ctx.beginPath();
    ctx.roundRect(-11, -50, 22, 27, 8);
    ctx.fill();

    // arms + tool
    const swing = state === "chop" ? Math.sin(t * 6) * 1.1
                : state === "fish" ? 0.5 + Math.sin(t * 1.6) * 0.12
                : Math.sin(t * 2.2) * 0.08;
    ctx.strokeStyle = "#e8965a";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-14, -52); ctx.lineTo(-20, -36 + step * 0.4);
    ctx.stroke();
    ctx.save();
    ctx.translate(14, -52);
    ctx.rotate(state === "chop" ? -0.9 + swing : state === "fish" ? -1.15 : 0.35);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(16, 8);
    ctx.stroke();
    if (state === "chop") {
      // axe
      ctx.strokeStyle = "#8a6a42";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(16, 8); ctx.lineTo(34, 14); ctx.stroke();
      ctx.fillStyle = "#b8c4cc";
      ctx.beginPath();
      ctx.moveTo(30, 6); ctx.lineTo(44, 12); ctx.lineTo(34, 22); ctx.closePath();
      ctx.fill();
    } else if (state === "fish") {
      // rod + line
      ctx.strokeStyle = "#8a6a42";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(16, 8); ctx.lineTo(52, -18); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(52, -18);
      ctx.quadraticCurveTo(56, 6, 50 + Math.sin(t * 2) * 3, 26);
      ctx.stroke();
    }
    ctx.restore();

    // head
    ctx.fillStyle = "#f4c89a";
    ctx.beginPath();
    ctx.arc(0, -76, 17, 0, Math.PI * 2);
    ctx.fill();
    // hair
    ctx.fillStyle = "#6a4a2e";
    ctx.beginPath();
    ctx.arc(0, -80, 17, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    // face
    ctx.fillStyle = "#3c2c1c";
    ctx.beginPath();
    ctx.arc(-5 * flip >= 0 ? -5 : -5, -76, 2, 0, Math.PI * 2);
    ctx.arc(5, -76, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3c2c1c";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -71, 4.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    ctx.restore();
  }

  /* ─────────────── customer ─────────────── */

  function drawCustomer(ctx, x, y, o) {
    const c = o.customer;
    const t = o.t || 0;
    const bob = Math.sin(t * 1.8 + (o.seed || 0)) * 2;
    shadow(ctx, x, y, 20, 7);
    if (art(ctx, "cust_" + c.id, x, y - bob, {})) return;
    ctx.save();
    ctx.translate(x, y - bob);

    // body
    ctx.fillStyle = `hsl(${c.hue}, 45%, 55%)`;
    ctx.beginPath();
    ctx.roundRect(-14, -54, 28, 34, 11);
    ctx.fill();
    // legs
    ctx.strokeStyle = `hsl(${c.hue}, 30%, 35%)`;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -22); ctx.lineTo(-6, -3);
    ctx.moveTo(6, -22); ctx.lineTo(6, -3);
    ctx.stroke();
    // head
    ctx.fillStyle = "#f4c89a";
    ctx.beginPath();
    ctx.arc(0, -66, 14, 0, Math.PI * 2);
    ctx.fill();
    // hat variants
    if (c.hat === "straw") {
      ctx.fillStyle = "#e8c878";
      ctx.beginPath();
      ctx.ellipse(0, -74, 19, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -78, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.hat === "beanie") {
      ctx.fillStyle = `hsl(${c.hue}, 55%, 40%)`;
      ctx.beginPath();
      ctx.arc(0, -70, 14, Math.PI, 0);
      ctx.fill();
    } else if (c.hat === "flower") {
      ctx.fillStyle = "#e0688a";
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(10 + Math.cos(a) * 4, -76 + Math.sin(a) * 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f3d54a";
      ctx.beginPath(); ctx.arc(10, -76, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (c.hat === "cap") {
      ctx.fillStyle = `hsl(${c.hue}, 55%, 42%)`;
      ctx.beginPath();
      ctx.arc(0, -70, 14, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-2, -74, 18, 5);
    } else if (c.hat === "beret") {
      ctx.fillStyle = `hsl(${c.hue}, 50%, 45%)`;
      ctx.beginPath();
      ctx.ellipse(-3, -76, 13, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.hat === "scarf") {
      ctx.fillStyle = `hsl(${c.hue}, 55%, 45%)`;
      ctx.beginPath();
      ctx.roundRect(-13, -58, 26, 8, 4);
      ctx.fill();
    }
    // face
    ctx.fillStyle = "#3c2c1c";
    ctx.beginPath();
    ctx.arc(-4, -66, 1.8, 0, Math.PI * 2);
    ctx.arc(4, -66, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3c2c1c";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -62, 3.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    ctx.restore();
  }

  /* ─────────────── stall ─────────────── */

  function drawStall(ctx, x, y, o) {
    const t = o.t || 0;
    shadow(ctx, x, y + 4, 95, 16);
    if (art(ctx, "stall", x, y, {})) return;
    ctx.save();
    ctx.translate(x, y);

    // counter
    ctx.fillStyle = "#9a6a3e";
    ctx.beginPath();
    ctx.roundRect(-85, -58, 170, 58, 8);
    ctx.fill();
    ctx.fillStyle = "#b07a4a";
    ctx.beginPath();
    ctx.roundRect(-85, -58, 170, 16, 8);
    ctx.fill();
    // goods on the counter
    ctx.fillStyle = "#7ec8d8";
    ctx.beginPath(); ctx.roundRect(-66, -54, 34, 12, 4); ctx.fill();
    ctx.fillStyle = "#c8a068";
    ctx.beginPath(); ctx.roundRect(-18, -54, 34, 12, 4); ctx.fill();
    ctx.fillStyle = "#e0688a";
    ctx.beginPath(); ctx.roundRect(30, -54, 34, 12, 4); ctx.fill();

    // posts
    ctx.fillStyle = "#8a5a34";
    ctx.fillRect(-82, -128, 9, 72);
    ctx.fillRect(73, -128, 9, 72);

    // awning (stripes, gentle flutter)
    const flutter = Math.sin(t * 1.8) * 2;
    ctx.save();
    ctx.translate(0, -128);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#e8563f" : "#fff3da";
      const x0 = -96 + i * 32;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + 32, 0);
      ctx.lineTo(x0 + 32 - 6, 26 + flutter);
      ctx.lineTo(x0 - 6, 26 + flutter);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#c8442e";
    ctx.beginPath();
    ctx.roundRect(-98, -8, 196, 10, 5);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /* ─────────────── trees ─────────────── */

  function drawTree(ctx, x, y, o) {
    const spec = o.spec;
    const t = o.t || 0;
    const shake = o.shake ? Math.sin(t * 28) * 3 : 0;
    const sway = Math.sin(t * 0.9 + x) * 2;
    const r = spec.canopy * 0.42;
    shadow(ctx, x, y, r * 0.9, 12);
    if (art(ctx, "tree_" + spec.id, x + shake, y, { rot: sway * 0.01 + shake * 0.008 })) return;
    ctx.save();
    ctx.translate(x + shake, y);
    // trunk
    ctx.fillStyle = spec.id === "birch" ? "#e8e0d0" : "#8a5f3a";
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.quadraticCurveTo(-6, -40, -4, -58);
    ctx.lineTo(4, -58);
    ctx.quadraticCurveTo(6, -40, 9, 0);
    ctx.closePath();
    ctx.fill();
    if (spec.id === "birch") {
      ctx.fillStyle = "#5a5248";
      ctx.fillRect(-6, -26, 5, 3);
      ctx.fillRect(1, -42, 5, 3);
    }
    // canopy: three blobs
    const base = `hsl(${spec.hue}, 42%, 42%)`;
    const light = `hsl(${spec.hue}, 48%, 52%)`;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(sway - r * 0.45, -58 - r * 0.5, r * 0.62, 0, Math.PI * 2);
    ctx.arc(sway + r * 0.45, -58 - r * 0.5, r * 0.62, 0, Math.PI * 2);
    ctx.arc(sway, -58 - r * 0.95, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(sway - r * 0.2, -58 - r * 1.05, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ─────────────── boarded mine ─────────────── */

  function drawMine(ctx, x, y, o) {
    if (art(ctx, "mine", x, y, {})) return;
    ctx.save();
    ctx.translate(x, y);
    // cliff face
    ctx.fillStyle = "#9a8a76";
    ctx.beginPath();
    ctx.roundRect(-120, -95, 240, 95, 14);
    ctx.fill();
    ctx.fillStyle = "#8a7a66";
    ctx.beginPath();
    ctx.roundRect(-120, -95, 240, 24, 14);
    ctx.fill();
    // dark entrance
    ctx.fillStyle = "#3c3228";
    ctx.beginPath();
    ctx.arc(0, 0, 46, Math.PI, 0);
    ctx.lineTo(46, 0);
    ctx.closePath();
    ctx.fill();
    // boards
    ctx.strokeStyle = "#b08a5a";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-38, -8); ctx.lineTo(40, -34);
    ctx.moveTo(-40, -32); ctx.lineTo(38, -6);
    ctx.stroke();
    // sign
    ctx.fillStyle = "#c8a068";
    ctx.beginPath();
    ctx.roundRect(52, -34, 58, 30, 5);
    ctx.fill();
    ctx.fillStyle = "#5a4630";
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SOON", 81, -15);
    ctx.restore();
  }

  /* ─────────────── item glyphs (for bubbles/chips) ─────────────── */

  function drawItemDot(ctx, x, y, hue, kind, id) {
    if (id && art(ctx, "item_" + id, x, y + 15, {})) return;
    if (kind === "fish") {
      ctx.fillStyle = `hsl(${hue}, 60%, 55%)`;
      ctx.beginPath();
      ctx.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 8, y); ctx.lineTo(x + 14, y - 5); ctx.lineTo(x + 14, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x - 4, y - 1, 1.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // log
      ctx.fillStyle = `hsl(${hue}, 35%, 42%)`;
      ctx.beginPath();
      ctx.roundRect(x - 10, y - 5, 20, 10, 5);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue}, 40%, 62%)`;
      ctx.beginPath();
      ctx.ellipse(x + 10, y, 3.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function hasArt(key) { return !!IMG[key]; }

  W.sprites = { drawChar, drawCustomer, drawStall, drawTree, drawMine, drawItemDot, shadow, hasArt };
})();
