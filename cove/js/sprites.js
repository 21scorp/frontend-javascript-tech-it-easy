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

  /* `w`/`h` = on-screen size in world units, applied to the artwork's
     TRIMMED bounds (transparent padding is cropped automatically at
     load). Give `h` where vertical presence matters (people, trees),
     `w` where width does (items); the other side follows the aspect. */
  const DEFS = {
    char_idle: { h: 118 }, char_fish: { h: 122 }, char_chop: { h: 122 },
    char_walk: { h: 118 },
    stall: { h: 235 },     mine: { h: 175 },
    tree_oak: { h: 165 },  tree_birch: { h: 150 }, tree_maple: { h: 175 },
    tree_yew: { h: 190 },  tree_elder: { h: 210 },
    tree_oak_stump: { w: 64 }, tree_birch_stump: { w: 56 }, tree_maple_stump: { w: 68 },
    tree_yew_stump: { w: 74 }, tree_elder_stump: { w: 80 },
    dock_1: { w: 250 }, dock_2: { w: 250 }, dock_3: { w: 320 },
    house_1: { h: 130 }, house_2: { h: 150 }, house_3: { h: 170 },
    deco_lantern: { h: 84 }, deco_flowers: { w: 92 }, deco_bench: { w: 112 },
    cat: { h: 38 },
    boat: { w: 150 },
    trophy_koi: { h: 112 }, trophy_pike: { h: 112 },
    cust_fien: { h: 96 },  cust_bram: { h: 98 },  cust_saar: { h: 80 },
    cust_milo: { h: 78 },  cust_vera: { h: 96 },  cust_ted: { h: 96 },
    cust_noor: { h: 96 },  cust_kas: { h: 98 },
    cust_jip: { h: 92 },   cust_lena: { h: 96 },
    item_sardine: { w: 34 }, item_herring: { w: 34 }, item_trout: { w: 34 },
    item_salmon: { w: 34 },  item_tuna: { w: 34 },    item_sword: { w: 34 },
    item_koi: { w: 34 },
    item_oak: { w: 34 }, item_birch: { w: 34 }, item_maple: { w: 34 },
    item_yew: { w: 34 }, item_elder: { w: 34 },
  };

  /* Keys that may also ship an animation sheet: <key>_anim.png —
     one horizontal row of SQUARE frames (frame count auto-detected
     from width/height), played as a seamless loop at `fps`.        */
  const ANIM = {
    char_idle: { fps: 6 }, char_walk: { fps: 12 },
    char_fish: { fps: 8 }, char_chop: { fps: 12 },
    stall: { fps: 6 },
    cust_fien: { fps: 5 }, cust_bram: { fps: 5 }, cust_saar: { fps: 5 },
    cust_milo: { fps: 5 }, cust_vera: { fps: 5 }, cust_ted: { fps: 5 },
    cust_noor: { fps: 5 }, cust_kas: { fps: 5 },
    cust_jip: { fps: 5 }, cust_lena: { fps: 5 },
    cat: { fps: 4 },
  };

  const IMG = {};   // slot -> { img, sx, sy, sw, sh } (only when loaded OK)

  /** Opaque bounding box, so generator padding never affects scale or
      the feet anchor. Sampled every 2px; alpha > 24 counts as art.   */
  function opaqueBounds(img) {
    const cvs = document.createElement("canvas");
    cvs.width = img.width; cvs.height = img.height;
    const c = cvs.getContext("2d", { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, cvs.width, cvs.height).data;
    const iw = cvs.width, ih = cvs.height;
    let minX = iw, maxX = 0, minY = ih, maxY = 0;
    for (let y = 0; y < ih; y += 2) {
      for (let x = 0; x < iw; x += 2) {
        if (d[(y * iw + x) * 4 + 3] > 24) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX) return { sx: 0, sy: 0, sw: iw, sh: ih };
    return { sx: minX, sy: minY, sw: maxX - minX + 2, sh: maxY - minY + 2 };
  }

  /** Sheet variant of opaqueBounds: ONE shared frame-local crop
      (the union over all frames), so playback never jitters and
      generator padding inside frames doesn't affect scale/anchor.  */
  function sheetBounds(img) {
    const cvs = document.createElement("canvas");
    cvs.width = img.width; cvs.height = img.height;
    const c = cvs.getContext("2d", { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, cvs.width, cvs.height).data;
    const iw = cvs.width, ih = cvs.height;
    const frames = Math.max(1, Math.round(iw / ih));
    const fw = iw / frames;
    let minX = fw, maxX = 0, minY = ih, maxY = 0;
    for (let y = 0; y < ih; y += 2) {
      for (let x = 0; x < iw; x += 2) {
        if (d[(y * iw + x) * 4 + 3] > 24) {
          const lx = x % fw;
          if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX) return { sx: 0, sy: 0, sw: fw, sh: ih };
    return { sx: minX, sy: minY, sw: maxX - minX + 2, sh: maxY - minY + 2 };
  }

  function loadOne(slot, src) {
    const img = new Image();
    // bundled builds inline the art as data URIs on W.ART
    if (W.ART && W.ART[slot]) src = W.ART[slot];
    img.onload = () => {
      let rect = { sx: 0, sy: 0, sw: img.width, sh: img.height };
      try {
        rect = slot.endsWith("_anim") ? sheetBounds(img) : opaqueBounds(img);
      } catch (e) {}   // tainted canvas → untrimmed
      IMG[slot] = { img, sx: rect.sx, sy: rect.sy, sw: rect.sw, sh: rect.sh };
    };
    img.onerror = () => {};   // no file → placeholder stays
    img.src = src;
  }

  (function loadArt() {
    for (const key of Object.keys(DEFS)) {
      loadOne(key, "assets/sprites/" + key + ".png");
      if (ANIM[key]) loadOne(key + "_anim", "assets/sprites/" + key + "_anim.png");
    }
  })();

  /** Draw a loaded sprite anchored at its feet; true if drawn.
      When opts.t is given and <key>_anim.png loaded, the sheet's
      current frame is drawn instead of the static image.           */
  function art(ctx, key, x, y, opts) {
    const o = opts || {};
    const sheetRec = o.t !== undefined ? IMG[key + "_anim"] : null;
    const rec = sheetRec || IMG[key];
    if (!rec) return false;
    let { sx, sy, sw, sh } = rec;
    if (sheetRec) {
      const frames = Math.max(1, Math.round(rec.img.width / rec.img.height));
      const fw = rec.img.width / frames;
      const fps = (ANIM[key] && ANIM[key].fps) || 8;
      const fi = Math.floor(o.t * fps + (o.seed || 0) * 7) % frames;
      sx = fi * fw + rec.sx;   // rec holds the frame-local union crop
    }
    const def = DEFS[key];
    const s = o.scale || 1;
    let w, h;
    if (def.h) { h = def.h * s; w = h * (sw / sh); }
    else       { w = def.w * s; h = w * (sh / sw); }
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    if (o.rot) ctx.rotate(o.rot);
    ctx.drawImage(rec.img, sx, sy, sw, sh, -w / 2, -h, w, h);
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

    // real art? pose sprite/sheet + procedural motion on top of it
    const poseKey = state === "fish" ? "char_fish" : state === "chop" ? "char_chop"
                  : state === "walk" ? "char_walk" : "char_idle";
    const key = (IMG[poseKey] || IMG[poseKey + "_anim"]) ? poseKey : "char_idle";
    const rot = IMG[key + "_anim"] ? 0   // the sheet animates itself
              : state === "chop" ? Math.sin(t * 6) * 0.09
              : state === "walk" ? Math.sin(t * 9) * 0.05 : 0;
    if (art(ctx, key, x, y - bob, { flip: o.flip, rot, t })) return;
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
    if (art(ctx, "cust_" + c.id, x, y - bob, { t, seed: o.seed })) return;
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
    if (art(ctx, "stall", x, y, { t })) return;
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

  /* ─────────────── the dock (bottom beach, tiers 0–3) ─────────────── */

  function drawDock(ctx, x, y, o) {
    const tier = o.tier || 0;
    const t = o.t || 0;
    if (tier >= 1 && art(ctx, "dock_" + Math.min(tier, 3), x, y, { t })) return;
    ctx.save();
    ctx.translate(x, y);

    if (tier === 0) {
      // wrecked: tilted grey planks and post stubs poking from the water
      ctx.fillStyle = "#8a8070";
      ctx.save(); ctx.rotate(0.14);
      ctx.fillRect(-60, -34, 96, 14); ctx.restore();
      ctx.save(); ctx.rotate(-0.1);
      ctx.fillRect(-30, -12, 80, 13); ctx.restore();
      ctx.fillStyle = "#6a6152";
      ctx.fillRect(-66, -20, 11, 26);
      ctx.fillRect(52, -8, 11, 18);
      ctx.restore();
      return;
    }

    // planked pier running down into the water
    const pw = 118;
    ctx.fillStyle = "#a8784a";
    ctx.beginPath();
    ctx.roundRect(-pw / 2, -70, pw, 130, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 60, 30, 0.35)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const py = -58 + i * 21;
      ctx.beginPath(); ctx.moveTo(-pw / 2 + 6, py); ctx.lineTo(pw / 2 - 6, py); ctx.stroke();
    }
    // posts
    ctx.fillStyle = "#7a5a34";
    for (const [px, py] of [[-pw / 2 - 4, -60], [pw / 2 - 8, -60], [-pw / 2 - 4, 30], [pw / 2 - 8, 30]]) {
      ctx.fillRect(px, py, 12, 26);
    }
    if (tier >= 2) {
      // rope between the front posts + a warm lantern
      ctx.strokeStyle = "#c8a068";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-pw / 2 + 2, -56);
      ctx.quadraticCurveTo(0, -42, pw / 2 - 2, -56);
      ctx.stroke();
      const glow = 0.5 + Math.sin(t * 2.4) * 0.15;
      ctx.fillStyle = `rgba(255, 200, 90, ${glow * 0.35})`;
      ctx.beginPath(); ctx.arc(0, -44, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f3c54a";
      ctx.beginPath(); ctx.arc(0, -44, 7, 0, Math.PI * 2); ctx.fill();
    }
    if (tier >= 3) {
      // the ferry, moored on the right
      ctx.save();
      ctx.translate(pw / 2 + 78, Math.sin(t * 1.1) * 3 + 6);
      ctx.fillStyle = "#c85a40";
      ctx.beginPath();
      ctx.moveTo(-64, -14); ctx.lineTo(64, -14); ctx.lineTo(46, 18); ctx.lineTo(-46, 18);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff3da";
      ctx.beginPath(); ctx.roundRect(-34, -40, 68, 28, 6); ctx.fill();
      ctx.fillStyle = "#5a4630";
      ctx.fillRect(-6, -58, 9, 20);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ─────────────── your house (tiers 0–3) ─────────────── */

  function drawHouse(ctx, x, y, o) {
    const tier = o.tier || 0;
    const t = o.t || 0;
    shadow(ctx, x, y + 2, tier === 0 ? 48 : 66, 12);
    if (tier >= 1 && art(ctx, "house_" + Math.min(tier, 3), x, y, { t })) return;
    ctx.save();
    ctx.translate(x, y);

    if (tier === 0) {
      // a humble tent
      ctx.fillStyle = "#e8dcc0";
      ctx.beginPath();
      ctx.moveTo(-52, 0); ctx.lineTo(0, -72); ctx.lineTo(52, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#c8b896";
      ctx.beginPath();
      ctx.moveTo(-18, 0); ctx.lineTo(0, -44); ctx.lineTo(18, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }

    const wHalf = tier >= 2 ? 74 : 60;
    const wallH = tier >= 2 ? 62 : 52;
    // walls
    ctx.fillStyle = "#b08454";
    ctx.beginPath();
    ctx.roundRect(-wHalf, -wallH, wHalf * 2, wallH, 6);
    ctx.fill();
    // roof
    ctx.fillStyle = "#c8442e";
    ctx.beginPath();
    ctx.moveTo(-wHalf - 12, -wallH + 4);
    ctx.lineTo(0, -wallH - 46);
    ctx.lineTo(wHalf + 12, -wallH + 4);
    ctx.closePath(); ctx.fill();
    // door
    ctx.fillStyle = "#6a4a2e";
    ctx.beginPath();
    ctx.roundRect(-14, -40, 28, 40, 5);
    ctx.fill();
    if (tier >= 2) {
      // window + chimney
      ctx.fillStyle = "#8ad4e4";
      ctx.beginPath(); ctx.roundRect(28, -46, 26, 22, 4); ctx.fill();
      ctx.strokeStyle = "#6a4a2e"; ctx.lineWidth = 3;
      ctx.strokeRect(28, -46, 26, 22);
      ctx.fillStyle = "#8a7a66";
      ctx.fillRect(30, -wallH - 64, 16, 30);
    }
    if (tier >= 3) {
      // garden flowers + drifting chimney smoke
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ["#e0688a", "#f3d54a", "#9a6ac8", "#e8823f"][i];
        ctx.beginPath();
        ctx.arc(-wHalf + 14 + i * 18, -4, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.35 + i / 3) % 1);
        ctx.fillStyle = `rgba(240, 240, 235, ${(1 - k) * 0.5})`;
        ctx.beginPath();
        ctx.arc(38 + Math.sin(k * 5) * 6, -wallH - 70 - k * 42, 7 + k * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ─────────────── decorations & the cat ─────────────── */

  function drawDeco(ctx, x, y, o) {
    const kind = o.kind;
    const t = o.t || 0;
    if (art(ctx, "deco_" + kind, x, y, { t })) return;
    ctx.save();
    ctx.translate(x, y);
    if (kind === "lantern") {
      ctx.fillStyle = "#5a4630";
      ctx.fillRect(-4, -64, 8, 64);
      const glow = 0.5 + Math.sin(t * 2.1) * 0.18;
      ctx.fillStyle = `rgba(255, 200, 90, ${glow * 0.4})`;
      ctx.beginPath(); ctx.arc(0, -70, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e8563f";
      ctx.beginPath(); ctx.roundRect(-10, -84, 20, 26, 6); ctx.fill();
      ctx.fillStyle = "#f3c54a";
      ctx.beginPath(); ctx.arc(0, -70, 6, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "flowers") {
      ctx.fillStyle = "#8a5a34";
      ctx.beginPath(); ctx.roundRect(-42, -18, 84, 18, 5); ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = ["#e0688a", "#f3d54a", "#9a6ac8", "#e8823f", "#e0688a"][i];
        ctx.beginPath();
        ctx.arc(-32 + i * 16, -24 + Math.sin(t * 1.6 + i) * 1.5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "bench") {
      ctx.fillStyle = "#9a7048";
      ctx.fillRect(-46, -16, 10, 16);
      ctx.fillRect(36, -16, 10, 16);
      ctx.beginPath(); ctx.roundRect(-52, -30, 104, 12, 5); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-52, -52, 104, 9, 5); ctx.fill();
    }
    ctx.restore();
  }

  function drawCat(ctx, x, y, o) {
    const t = o.t || 0;
    shadow(ctx, x, y, 16, 5);
    if (art(ctx, "cat", x, y, { t })) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#e8964a";
    // sitting body
    ctx.beginPath();
    ctx.ellipse(0, -14, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // tail sways
    ctx.strokeStyle = "#e8964a";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(10, -6);
    ctx.quadraticCurveTo(24, -8 + Math.sin(t * 1.4) * 5, 22, -24 + Math.sin(t * 1.4) * 6);
    ctx.stroke();
    // head + ears
    ctx.fillStyle = "#e8964a";
    ctx.beginPath(); ctx.arc(0, -32, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9, -38); ctx.lineTo(-6, -48); ctx.lineTo(-1, -40);
    ctx.moveTo(9, -38); ctx.lineTo(6, -48); ctx.lineTo(1, -40);
    ctx.fill();
    // eyes blink every few seconds
    const blink = (t % 4) > 3.85;
    ctx.fillStyle = "#3c2c1c";
    if (blink) {
      ctx.fillRect(-6, -33, 4, 1.6); ctx.fillRect(2, -33, 4, 1.6);
    } else {
      ctx.beginPath();
      ctx.arc(-4, -33, 1.7, 0, Math.PI * 2);
      ctx.arc(4, -33, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ─────────────── the row boat & boss trophies ─────────────── */

  function drawBoat(ctx, x, y, o) {
    const t = o.t || 0;
    const bob = Math.sin(t * 1.2) * 2;
    if (art(ctx, "boat", x, y - bob, { t })) return;
    ctx.save();
    ctx.translate(x, y - bob);
    // hull
    ctx.fillStyle = "#9a6a3e";
    ctx.beginPath();
    ctx.moveTo(-64, -26);
    ctx.quadraticCurveTo(0, 8, 64, -26);
    ctx.lineTo(48, -2);
    ctx.quadraticCurveTo(0, 18, -48, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b8845a";
    ctx.beginPath();
    ctx.ellipse(0, -22, 58, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a5230";
    ctx.beginPath();
    ctx.ellipse(0, -22, 44, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // bench + oar
    ctx.fillStyle = "#b8845a";
    ctx.fillRect(-24, -28, 48, 7);
    ctx.strokeStyle = "#8a6a42";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(20, -24); ctx.lineTo(58, -58);
    ctx.stroke();
    ctx.fillStyle = "#8a6a42";
    ctx.beginPath();
    ctx.ellipse(62, -64, 7, 11, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTrophy(ctx, x, y, o) {
    const boss = o.boss;
    const t = o.t || 0;
    shadow(ctx, x, y, 18, 6);
    if (art(ctx, "trophy_" + boss.id, x, y, { t })) return;
    ctx.save();
    ctx.translate(x, y);
    // post + shield
    ctx.fillStyle = "#7a5a34";
    ctx.fillRect(-5, -58, 10, 58);
    ctx.fillStyle = "#a8784a";
    ctx.beginPath();
    ctx.roundRect(-30, -104, 60, 52, 10);
    ctx.fill();
    ctx.strokeStyle = "#e8c878";
    ctx.lineWidth = 3;
    ctx.strokeRect(-25, -99, 50, 42);
    // the fish, mounted mid-flex
    ctx.fillStyle = `hsl(${boss.hue}, 60%, 55%)`;
    ctx.save();
    ctx.translate(0, -78);
    ctx.rotate(-0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, 0); ctx.lineTo(24, -7); ctx.lineTo(24, 7);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-8, -2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // a proud sparkle
    const tw = 0.5 + Math.sin(t * 3 + boss.hue) * 0.5;
    ctx.fillStyle = `rgba(255, 230, 140, ${tw})`;
    ctx.beginPath();
    ctx.arc(22, -100, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ─────────────── a build in progress ─────────────── */

  function drawBuildSite(ctx, x, y, o) {
    const t = o.t || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#b08a5a";
    ctx.beginPath(); ctx.roundRect(-38, -26, 30, 26, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(4, -20, 34, 20, 4); ctx.fill();
    // leaning planks
    ctx.strokeStyle = "#8a6a42";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(20, -46);
    ctx.moveTo(6, 0); ctx.lineTo(-16, -44);
    ctx.stroke();
    // bobbing hammer to show the crew at work
    ctx.save();
    ctx.translate(-28, -46);
    ctx.rotate(Math.sin(t * 5) * 0.5 - 0.3);
    ctx.fillStyle = "#8a6a42";
    ctx.fillRect(-3, -18, 6, 22);
    ctx.fillStyle = "#b8c4cc";
    ctx.beginPath(); ctx.roundRect(-10, -26, 20, 10, 3); ctx.fill();
    ctx.restore();
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

  function hasArt(key) { return !!(IMG[key] || IMG[key + "_anim"]); }

  W.sprites = { drawChar, drawCustomer, drawStall, drawTree, drawMine,
    drawDock, drawHouse, drawDeco, drawCat, drawBuildSite,
    drawBoat, drawTrophy,
    drawItemDot, shadow, hasArt };
})();
