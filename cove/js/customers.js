/* ═══════════════════════════════════════════════════════════════
   COVE — customers.js
   The queue at your stall: spawning, orders, affinity, serving.
   Orders persist in state so a reload never loses a customer.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;

  function ordersLive() { return W.state.S.orders; }

  /* ─────────────── order generation ─────────────── */

  function pickItems(cust) {
    const S = W.state.S;
    // pools: items the player has already unlocked
    const fish = C.FISH.filter((f) => f.lvl <= S.skills.fishing.level);
    const wood = C.TREES.filter((t) => t.lvl <= S.skills.woodcutting.level);
    let pool;
    if (cust.likes === "fish") pool = fish.length ? fish : wood;
    else if (cust.likes === "wood") pool = wood.length ? wood : fish;
    else pool = fish.concat(wood);
    // favor the top tiers of the pool
    pool = pool.slice(-3);
    const kinds = U.randInt(1, Math.min(2, pool.length));
    const chosen = [];
    for (let i = 0; i < kinds; i++) {
      const spec = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const base = 2 + Math.floor(S.skills.trading.level / 12);
      chosen.push({ id: spec.id, n: U.randInt(base, base + 2) });
    }
    return chosen;
  }

  function trySpawn(now) {
    const S = W.state.S;
    if (ordersLive().length >= W.state.queueSize()) return;
    if (now < S.nextSpawnAt) return;
    const queued = new Set(ordersLive().map((o) => o.cid));
    const free = C.CUSTOMERS.filter((c) => !queued.has(c.id));
    if (!free.length) return;
    const cust = U.pick(free);
    const items = pickItems(cust);
    ordersLive().push({
      cid: cust.id,
      items,
      value: W.state.orderValue(items),
      createdAt: now,
    });
    const gapMult = S.stallUpgrades.bell ? 0.8 : 1;
    S.nextSpawnAt = now + U.rand(C.STALL.spawnMinSec, C.STALL.spawnMaxSec) * 1000 * gapMult;
    W.ui.toast("👋 " + cust.name + " joins the queue", cust.line);
  }

  /* ─────────────── serving ─────────────── */

  function canServe(order) {
    return order.items.every((it) => W.state.invCount(it.id) >= it.n);
  }

  function missing(order) {
    return order.items
      .filter((it) => W.state.invCount(it.id) < it.n)
      .map((it) => (it.n - W.state.invCount(it.id)) + "× " + W.state.item(it.id).name);
  }

  function serve(order) {
    const S = W.state.S;
    if (!canServe(order)) return false;
    for (const it of order.items) W.state.takeItem(it.id, it.n);

    let value = order.value;
    const cust = C.CUSTOMERS.find((c) => c.id === order.cid);
    const tipWindow = C.STALL.tipWindowSec * (S.stallUpgrades.awning ? 1.5 : 1) * 1000;
    const tipped = Date.now() - order.createdAt < tipWindow;
    if (tipped) value = Math.round(value * (1 + C.STALL.tipPct));

    S.coins += value;
    S.totals.served++;
    S.totals.earned += value;
    const ups = W.state.gainXp("trading", Math.round(order.value * 0.6));
    if (ups > 0) W.ui.skillUp("trading", ups);

    // affinity
    S.affinity[order.cid] = (S.affinity[order.cid] || 0) + 1;
    const serves = S.affinity[order.cid];
    const mi = C.AFFINITY.milestones.indexOf(serves);
    if (mi >= 0) {
      const gift = C.AFFINITY.giftCoins[mi];
      S.coins += gift;
      W.ui.toast("💛 " + cust.name + " — " + C.AFFINITY.lines[mi], "+" + U.fmt(gift) + " coins");
    }

    const idx = ordersLive().indexOf(order);
    if (idx >= 0) ordersLive().splice(idx, 1);

    const spot = spotFor(0);
    const sp = { x: C.WORLD.stall.x - 120, y: C.WORLD.stall.y + 60 };
    W.ui.worldFloater(sp.x, sp.y - 90, "+" + U.fmt(value), "coin");
    if (tipped) W.ui.worldFloater(sp.x + 60, sp.y - 60, "tip!", "coin");
    W.audio.play("sell");
    W.state.save();
    return true;
  }

  /* ─────────────── drawing ─────────────── */

  function spotFor(i) { return C.WORLD.queueSpots[Math.min(i, C.WORLD.queueSpots.length - 1)]; }

  function collectDrawables(items, t) {
    ordersLive().forEach((order, i) => {
      const cust = C.CUSTOMERS.find((c) => c.id === order.cid);
      const spot = spotFor(i);
      items.push({
        y: spot.y,
        fn: () => W.sprites.drawCustomer(ctxRef, spot.x, spot.y, { customer: cust, t, seed: i * 2.1 }),
      });
    });
  }

  let ctxRef = null;

  function drawBubbles(ctx, t) {
    ctxRef = ctx;
    ordersLive().forEach((order, i) => {
      const spot = spotFor(i);
      const bx = spot.x;
      const by = spot.y - 150;
      const wCount = order.items.length;
      const bw = 60 + wCount * 66;
      // bubble
      ctx.fillStyle = "rgba(255, 250, 238, 0.96)";
      ctx.strokeStyle = "rgba(160, 120, 70, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx - bw / 2, by - 34, bw, 62, 14);
      ctx.fill();
      ctx.stroke();
      // tail
      ctx.beginPath();
      ctx.moveTo(bx - 8, by + 27);
      ctx.lineTo(bx + 8, by + 27);
      ctx.lineTo(bx, by + 40);
      ctx.closePath();
      ctx.fill();

      // items with have/need
      order.items.forEach((it, k) => {
        const spec = W.state.item(it.id);
        const ix = bx - bw / 2 + 40 + k * 66;
        W.sprites.drawItemDot(ctx, ix - 10, by - 12, spec.hue, spec.kind);
        const have = W.state.invCount(it.id);
        ctx.font = "700 15px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = have >= it.n ? "#57a05b" : "#cf5d4e";
        ctx.fillText(Math.min(have, it.n) + "/" + it.n, ix + 8, by - 7);
      });
      // price
      ctx.font = "800 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#c89020";
      ctx.fillText(U.fmt(order.value) + " ●", bx, by + 17);

      // ready glow
      if (canServe(order)) {
        ctx.strokeStyle = "rgba(87, 160, 91, " + (0.5 + 0.3 * Math.sin(t * 5)) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2 - 3, by - 37, bw + 6, 68, 16);
        ctx.stroke();
      }
    });
  }

  function hitTest(wx, wy) {
    for (let i = 0; i < ordersLive().length; i++) {
      const spot = spotFor(i);
      if (wx > spot.x - 80 && wx < spot.x + 80 && wy > spot.y - 200 && wy < spot.y + 20) {
        return ordersLive()[i];
      }
    }
    return null;
  }

  W.customers = { trySpawn, serve, canServe, missing, collectDrawables, drawBubbles, hitTest };
})();
