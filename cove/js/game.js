/* ═══════════════════════════════════════════════════════════════
   COVE — game.js
   The tick: gathering cycles, bites, xp, offline, spawning.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;

  let cycleT = 0;          // progress through the current gather cycle
  let biteTimer = U.rand(C.GATHER.biteGapMin, C.GATHER.biteGapMax);
  let bite = null;         // {until} while the "!" is up
  let saveTimer = 0;
  let choppingAt = null;   // world tree spot being chopped (for shake)

  /* ─────────────── activities ─────────────── */

  function startFish() {
    const S = W.state.S;
    const p = C.WORLD.pond;
    choppingAt = null;
    S.activity = null;
    W.actor.walkTo(p.x + p.rx + 28, p.y + 30, () => {
      W.actor.setState("fish");
      W.actor.face(p.x);              // cast toward the water
      S.activity = { type: "fish" };
      cycleT = 0;
      W.state.save();
    });
  }

  function startChop(spot) {
    const S = W.state.S;
    const spec = C.TREES.find((t) => t.id === spot.tree);
    if (S.skills.woodcutting.level < spec.lvl) {
      W.audio.play("denied");
      W.ui.toast("🪓 " + spec.name + " needs level " + spec.lvl, "Keep chopping lighter trees to get there.");
      return;
    }
    choppingAt = null;
    S.activity = null;
    W.actor.walkTo(spot.x - 55, spot.y + 12, () => {
      W.actor.setState("chop");
      W.actor.face(spot.x);           // swing toward the trunk
      S.activity = { type: "chop", tree: spot.tree };
      choppingAt = spot;
      cycleT = 0;
      W.state.save();
    });
  }

  function cycleTime() {
    const S = W.state.S;
    if (!S.activity) return Infinity;
    return S.activity.type === "fish" ? W.state.fishTime() : W.state.chopTime();
  }

  /** Which fish does one cast catch? Skews to the top tier. */
  function rollFish() {
    const pool = W.state.unlockedFish();
    let top = C.GATHER.topWeight;
    // Zilverrug's trophy: your casts find the best fish more often
    if (W.state.S.trophies.pike) top = Math.min(0.85, top + 0.1);
    if (Math.random() < top) return pool[pool.length - 1];
    return U.pick(pool);
  }

  function completeCycle(bonusMult) {
    const S = W.state.S;
    const mult = bonusMult || 1;
    let spec, skill;
    if (S.activity.type === "fish") {
      spec = rollFish();
      skill = "fishing";
      S.totals.catches++;
      W.audio.play("catch");
    } else {
      spec = C.TREES.find((t) => t.id === S.activity.tree);
      skill = "woodcutting";
      S.totals.chops++;
      W.audio.play("chop");
    }
    W.state.addItem(spec.id, 1 * (mult > 1 ? 2 : 1));
    const xp = Math.round(spec.xp * mult);
    const ups = W.state.gainXp(skill, xp);
    W.ui.worldFloater(W.actor.x, W.actor.y - 120, "+" + xp + " xp", "xp");
    if (mult > 1) W.ui.worldFloater(W.actor.x + 40, W.actor.y - 90, "2× " + spec.name + "!", "coin");
    if (ups > 0) W.ui.skillUp(skill, ups);
    W.ui.markBagDirty();
  }

  /* ─────────────── the bite ("!") moment ─────────────── */

  function tryBiteTap() {
    if (!bite) return false;
    bite = null;
    biteTimer = U.rand(C.GATHER.biteGapMin, C.GATHER.biteGapMax);
    W.audio.play("bonus");
    completeCycle(C.GATHER.biteBonusXp);
    return true;
  }

  /* ─────────────── offline ─────────────── */

  function computeOffline() {
    const S = W.state.S;
    const away = (Date.now() - S.lastSeen) / 1000;
    if (away < C.OFFLINE.minSeconds || !S.activity) return null;
    const capped = Math.min(away, W.state.offlineCapHours() * 3600);
    const cycles = Math.floor((capped / cycleTime()) * C.OFFLINE.rate);
    if (cycles < 1) return null;
    return { away, capped, cycles };
  }

  /** House perk: coming back rested after a real break. */
  function grantRested() {
    const S = W.state.S;
    if (W.state.projectTier("house") < 1) return false;
    if ((Date.now() - S.lastSeen) / 1000 < C.RESTED.minAwaySec) return false;
    const minutes = W.state.projectTier("house") >= 3 ? 10 : 5;
    S.restedUntil = Date.now() + minutes * 60000;
    return true;
  }

  function applyOffline(off) {
    const S = W.state.S;
    const gained = {};
    let xpSum = 0;
    let skill = S.activity.type === "fish" ? "fishing" : "woodcutting";
    const n = Math.min(off.cycles, 6000);
    for (let i = 0; i < n; i++) {
      let spec;
      if (S.activity.type === "fish") spec = rollFish();
      else spec = C.TREES.find((t) => t.id === S.activity.tree);
      W.state.addItem(spec.id, 1);
      gained[spec.id] = (gained[spec.id] || 0) + 1;
      xpSum += spec.xp;
    }
    const ups = W.state.gainXp(skill, xpSum);
    if (S.activity.type === "fish") S.totals.catches += n; else S.totals.chops += n;
    return { gained, xpSum, ups, skill };
  }

  /* ─────────────── overlays (progress ring, bite) ─────────────── */

  function drawOverlays(ctx, t) {
    const S = W.state.S;
    if (S.activity && W.actor.state !== "walk") {
      // progress ring above the character
      const k = cycleT / cycleTime();
      const x = W.actor.x, y = W.actor.y - 128;
      ctx.strokeStyle = "rgba(255, 250, 238, 0.5)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#f3c54a";
      ctx.beginPath();
      ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      ctx.stroke();
    }
    if (bite) {
      const left = (bite.until - Date.now()) / 1000;
      const pulse = 1 + Math.sin(t * 10) * 0.12;
      const x = W.actor.x, y = W.actor.y - 170;
      ctx.fillStyle = "#e8563f";
      ctx.beginPath();
      ctx.arc(x, y, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", x, y + 9);
      // shrinking timer ring
      ctx.strokeStyle = "rgba(232, 86, 63, 0.6)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + (left / C.GATHER.biteWindow) * Math.PI * 2);
      ctx.stroke();
    }
  }

  /* ─────────────── tick ─────────────── */

  function tick(dt) {
    const S = W.state.S;
    W.actor.update(dt);
    W.boss.tick(dt);

    if (S.activity && W.actor.state !== "walk") {
      cycleT += dt;
      const ct = cycleTime();
      if (cycleT >= ct) {
        cycleT -= ct;
        completeCycle();
      }
      // bites only while actively gathering, tab visible, no duel on
      if (bite) {
        if (Date.now() > bite.until) bite = null;
      } else if (document.visibilityState === "visible" && !W.boss.active) {
        biteTimer -= dt;
        if (biteTimer <= 0) {
          biteTimer = U.rand(C.GATHER.biteGapMin, C.GATHER.biteGapMax);
          bite = { until: Date.now() + C.GATHER.biteWindow * 1000 };
          W.audio.play("bite");
        }
      }
    }

    if (S.flags.introDone && document.visibilityState === "visible") {
      W.customers.trySpawn(Date.now());
    }

    // the crew finishes a build (also catches builds finished offline)
    const done = W.state.completeBuilding(Date.now());
    if (done) {
      const proj = C.PROJECTS[done.id];
      const tierSpec = proj.tiers[done.tier - 1];
      W.audio.play("level");
      W.ui.toast(proj.glyph + " " + tierSpec.name + " — finished!", tierSpec.desc);
      W.ui.markBuildDirty();
    }

    saveTimer += dt;
    if (saveTimer >= 10) { saveTimer = 0; W.state.save(); }
  }

  W.game = {
    tick, startFish, startChop, tryBiteTap,
    computeOffline, applyOffline, grantRested, drawOverlays,
    get bite() { return bite; },
    get choppingAt() { return choppingAt; },
    restoreActivity() {
      // resume the saved activity after a reload
      const S = W.state.S;
      if (!S.activity) return;
      if (S.activity.type === "fish") startFish();
      else {
        const spot = C.WORLD.treeSpots.find((sp) => sp.tree === S.activity.tree);
        if (spot) startChop(spot);
      }
    },
  };
})();
