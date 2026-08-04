/* ═══════════════════════════════════════════════════════════════
   COVE — main.js
   Boot, intro, input routing, the loop.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;
  const $ = (id) => document.getElementById(id);

  /* ─────────────── boot ─────────────── */

  W.state.load();
  W.audio.setEnabled(W.state.S.settings.sound);
  // older saves join the quest ladder from zero, not mid-way
  if (Object.keys(W.state.S.quest.start).length === 0) W.quests.rebase();
  W.ui.init();
  W.scene.init($("world"));
  W.ui.updateHud();

  function begin() {
    W.ui.show();
    W.game.restoreActivity();

    if (W.state.restoredFromBackup) {
      setTimeout(() => W.ui.toast("🕯 Restored from backup", "Your save looked damaged — the stall found its way back."), 1500);
    }

    // house perk: coming home rested after a real break
    if (W.game.grantRested()) {
      const mult = W.state.projectTier("house") >= 2 ? "2×" : "1.5×";
      setTimeout(() => W.ui.toast("☕ Rested", "Home does you good — " + mult + " gathering speed for a bit."), 2400);
    }

    // offline progress
    const off = W.game.computeOffline();
    if (off) {
      const res = W.game.applyOffline(off);
      const lines = Object.keys(res.gained)
        .map((id) => res.gained[id] + "× " + W.state.item(id).name).join(", ");
      W.ui.modal(
        "While you were away",
        `<p>You kept working for <b>${U.fmtDuration(Math.min(off.away, off.capped))}</b>.</p>
         <span class="big-num">${lines || "…"}</span>
         <p class="muted">+${U.fmt(res.xpSum)} ${res.skill} xp${res.ups ? " · " + res.ups + " level" + (res.ups > 1 ? "s" : "") + " up!" : ""}</p>`,
        [{ label: "Back to work", cls: "btn-primary" }]
      );
      W.ui.markBagDirty();
      W.state.save();
    } else if (!W.state.S.activity) {
      setTimeout(() => W.ui.toast("☀️ A calm morning at the cove", "Tap the pond to fish, or a tree to chop."), 900);
    }

    // customer of the day
    const star = C.CUSTOMERS.find((c) => c.id === W.game.cotdId());
    setTimeout(() => W.ui.toast("⭐ " + star.name + " pays double today", "Serve them fast for the tip on top."), 4200);
  }

  if (!W.state.S.flags.introDone) {
    const input = $("name-input");
    const go = () => {
      const name = U.sanitizeName(input.value) || "Keeper";
      W.state.S.playerName = name;
      W.state.S.flags.introDone = true;
      W.state.S.nextSpawnAt = Date.now() + 20000; // first customer comes quickly
      W.state.save();
      W.audio.unlock();
      $("intro").classList.add("fading");
      setTimeout(() => $("intro").remove(), 1000);
      begin();
      setTimeout(() => W.ui.toast("👋 Welcome, " + name, "Tap the pond to catch your first fish."), 700);
    };
    $("name-ok").addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  } else {
    $("intro").remove();
    begin();
  }

  /* ─────────────── input ─────────────── */

  const canvas = $("world");
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ── camera gestures: drag pans, pinch zooms, a tap acts ── */
  const pointers = new Map();   // pointerId -> {x, y}
  let tapCandidate = null;      // {x, y} while a press might be a tap
  let pinch0 = null;            // {d, zoom} at pinch start

  const pDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const pMid = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  canvas.addEventListener("pointerdown", (e) => {
    W.audio.unlock();
    if (W.boss.active) { W.boss.pointerDown(); return; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      tapCandidate = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      tapCandidate = null;
      pinch0 = { d: pDist(), zoom: W.scene.zoom };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (W.boss.active || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch0) {
      const mid = pMid();
      W.scene.zoomTo(pinch0.zoom * (pDist() / pinch0.d), mid.x, mid.y);
    } else if (pointers.size === 1) {
      if (tapCandidate &&
          Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y) > 9) {
        tapCandidate = null;   // it's a drag now
      }
      if (!tapCandidate) W.scene.panBy(e.clientX - prev.x, e.clientY - prev.y);
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
  };
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", (e) => {
    W.scene.zoomTo(W.scene.zoom * (e.deltaY < 0 ? 1.12 : 0.9), e.clientX, e.clientY);
  }, { passive: true });

  canvas.addEventListener("pointerup", (e) => {
    W.audio.unlock();
    if (W.boss.active) { W.boss.pointerUp(); return; }
    const wasTap = !!tapCandidate;
    endPointer(e);
    if (!wasTap) return;
    tapCandidate = null;
    if (!W.state.S.flags.introDone) return;
    const wpt = W.scene.toWorld(e.clientX, e.clientY);
    const wx = wpt.x, wy = wpt.y;

    // 1. the "!" bite moment (tap anywhere near the character)
    if (W.game.bite && W.actor.hitTest(wx, wy + 40)) {
      W.game.tryBiteTap();
      return;
    }
    // 1b. the supply boat's daily gift
    if (W.game.tryGiftTap(wx, wy)) return;
    // 2. serve a customer
    const order = W.customers.hitTest(wx, wy);
    if (order) {
      if (W.customers.canServe(order)) {
        W.customers.serve(order);
        W.ui.markBagDirty();
      } else {
        W.audio.play("denied");
        W.ui.toast("Still needed: " + W.customers.missing(order).join(", "),
          "Fish and wood come from the pond and the forest.");
      }
      return;
    }
    // 3. pond → fish
    const p = C.WORLD.pond;
    if (Math.pow((wx - p.x) / (p.rx + 40), 2) + Math.pow((wy - p.y) / (p.ry + 40), 2) <= 1) {
      W.game.startFish();
      return;
    }
    // 4. trees → chop
    for (const spot of C.WORLD.treeSpots) {
      if (Math.hypot(wx - spot.x, wy - (spot.y - 60)) < 95) {
        W.game.startChop(spot);
        return;
      }
    }
    // 5. the boarded mine
    if (Math.hypot(wx - C.WORLD.mine.x, wy - (C.WORLD.mine.y - 30)) < 130) {
      W.audio.play("denied");
      W.ui.toast("⛏️ The mine is boarded up", "Bronze, silver, gold… someday. Something rumbles below.");
      return;
    }
    // 6. the harbor cat purrs
    const catDeco = C.DECO.find((d) => d.id === "cat");
    if (W.state.S.deco.cat && Math.hypot(wx - catDeco.x, wy - (catDeco.y - 20)) < 55) {
      W.audio.play("bonus");
      W.ui.worldFloater(catDeco.x, catDeco.y - 70, "♥", "coin");
      W.ui.toast("🐈 prrrr", "The cat approves of your stall.");
      return;
    }
    // 7. the row boat → the deep water
    if (Math.hypot(wx - C.WORLD.boat.x, wy - (C.WORLD.boat.y - 20)) < 110) {
      if (W.state.S.projects.boat >= 1) {
        W.boss.openDeepWater();
      } else {
        W.audio.play("denied");
        W.ui.toast("🛶 The deep water calls", "Build a row boat first — check the Build tab.");
      }
      return;
    }
    // 8. house & dock open the build tab
    if (Math.hypot(wx - C.WORLD.house.x, wy - (C.WORLD.house.y - 50)) < 110 ||
        Math.hypot(wx - C.WORLD.dock.x, wy - (C.WORLD.dock.y - 20)) < 130) {
      document.querySelector('.tab[data-tab="build"]').click();
      return;
    }
    // 9. the stall opens the gear tab
    if (Math.hypot(wx - C.WORLD.stall.x, wy - (C.WORLD.stall.y - 60)) < 140) {
      document.querySelector('.tab[data-tab="gear"]').click();
      return;
    }
  });

  /* ─────────────── save on leave ─────────────── */

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") W.state.save();
  });
  window.addEventListener("beforeunload", () => W.state.save());

  /* ─────────────── loop ─────────────── */

  let last = performance.now();
  let t = 0;
  let uiTimer = 0;

  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    t += dt;

    W.game.tick(dt);
    W.scene.draw(t, dt);

    uiTimer += dt;
    if (uiTimer >= 0.15) {
      uiTimer = 0;
      W.ui.updateHud();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
