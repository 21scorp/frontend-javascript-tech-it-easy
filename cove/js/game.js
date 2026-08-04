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
  let combo = 0;           // consecutive bite taps
  let questTimer = 0;
  let giftBoat = null;     // {x, phase: "in"|"docked"|"out", flip}

  const todayStr = () => new Date(Date.now()).toLocaleDateString("en-CA");
  const yesterdayStr = () => new Date(Date.now() - 864e5).toLocaleDateString("en-CA");

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
      // splash where the bobber sits
      W.particles.splash(W.actor.x + (W.actor.flip ? -70 : 70), W.actor.y + 6, 7);
    } else {
      spec = C.TREES.find((t) => t.id === S.activity.tree);
      skill = "woodcutting";
      S.totals.chops++;
      W.audio.play("chop");
      if (choppingAt) W.particles.chips(choppingAt.x, choppingAt.y, 6);
      W.scene.kick(2);
    }
    W.state.addItem(spec.id, 1 * (mult > 1 ? 2 : 1));

    // album: discoveries pay a bonus
    // golden find: a tiny lottery on every cycle
    const shiny = Math.random() < C.SHINY.chance;
    const first = W.state.albumAdd(spec.id, shiny);
    if (first) {
      const bonus = spec.price * C.ALBUM.firstMult;
      S.coins += bonus;
      S.totals.earned += bonus;
      W.audio.play("bonus");
      W.ui.toast("📖 New in your album: " + spec.name, "First find bonus: +" + U.fmt(bonus) + " coins");
      W.ui.markBagDirty();
    }
    if (shiny) {
      const bonus = spec.price * C.SHINY.coinMult;
      S.coins += bonus;
      S.totals.earned += bonus;
      S.totals.shinies++;
      W.audio.play("level");
      W.particles.shine(W.actor.x, W.actor.y);
      W.scene.kick(4);
      W.ui.worldFloater(W.actor.x, W.actor.y - 150, "✨ GOLDEN " + spec.name + "!", "coin");
      W.ui.coinFly(W.actor.x, W.actor.y - 80, bonus);
    }

    const xp = Math.round(spec.xp * mult);
    const ups = W.state.gainXp(skill, xp);
    W.ui.worldFloater(W.actor.x, W.actor.y - 120, "+" + xp + " xp", "xp");
    W.ui.skillPulse(skill);
    if (mult > 1) W.ui.worldFloater(W.actor.x + 40, W.actor.y - 90, "2× " + spec.name + "!", "coin");
    if (ups > 0) W.ui.skillUp(skill, ups);
    W.ui.markBagDirty();
  }

  /* ─────────────── the bite ("!") moment ─────────────── */

  function tryBiteTap() {
    if (!bite) return false;
    bite = null;
    biteTimer = U.rand(C.GATHER.biteGapMin, C.GATHER.biteGapMax);
    combo++;
    const S = W.state.S;
    if (combo > (S.totals.bestCombo || 0)) S.totals.bestCombo = combo;
    W.audio.play("bonus");
    W.scene.kick(3.5);
    if (combo >= 2) {
      W.ui.worldFloater(W.actor.x - 50, W.actor.y - 160, "COMBO ×" + combo, "coin");
    }
    const mult = C.GATHER.biteBonusXp * (1 + C.SHINY.comboStep * Math.min(combo, C.SHINY.comboCap));
    completeCycle(mult);
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
    // gift bubble over the docked supply boat
    if (giftBoat && giftBoat.phase === "docked") {
      const gs = C.WORLD.giftSpot;
      const bobble = Math.sin(t * 3) * 5;
      ctx.fillStyle = "#f3c54a";
      ctx.beginPath();
      ctx.arc(gs.x, gs.y - 120 + bobble, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5a4630";
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🎁", gs.x, gs.y - 112 + bobble);
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
        if (Date.now() > bite.until) {
          bite = null;
          if (combo > 0) {
            combo = 0;
            W.ui.worldFloater(W.actor.x, W.actor.y - 150, "combo lost…", "");
          }
        }
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

    // the goal ladder nudges when a quest turns ready
    questTimer += dt;
    if (questTimer >= 0.5) { questTimer = 0; W.quests.check(); }

    // the daily supply boat sails in, waits, sails off
    tickGiftBoat(dt);

    saveTimer += dt;
    if (saveTimer >= 10) { saveTimer = 0; W.state.save(); }
  }

  /* ─────────────── the daily supply boat ─────────────── */

  function giftPending() { return W.state.S.daily.lastClaim !== todayStr(); }

  function tickGiftBoat(dt) {
    const gs = C.WORLD.giftSpot;
    if (giftPending() && W.state.S.flags.introDone) {
      if (!giftBoat) giftBoat = { x: -140, phase: "in", flip: false };
      if (giftBoat.phase === "in") {
        giftBoat.x = Math.min(gs.x, giftBoat.x + 150 * dt);
        if (giftBoat.x >= gs.x) giftBoat.phase = "docked";
      }
    } else if (giftBoat) {
      giftBoat.phase = "out";
      giftBoat.flip = true;
      giftBoat.x += 170 * dt;
      if (giftBoat.x > C.WORLD.w + 160) giftBoat = null;
    }
  }

  function tryGiftTap(wx, wy) {
    const gs = C.WORLD.giftSpot;
    if (!giftBoat || giftBoat.phase !== "docked" || !giftPending()) return false;
    if (Math.hypot(wx - gs.x, wy - (gs.y - 30)) > 120) return false;
    const S = W.state.S;
    S.daily.streak = S.daily.lastClaim === yesterdayStr() ? S.daily.streak + 1 : 1;
    S.daily.lastClaim = todayStr();
    const coins = C.DAILY.baseCoins * Math.min(S.daily.streak, C.DAILY.streakCap);
    S.coins += coins;
    S.totals.earned += coins;
    W.audio.play("bonus");
    W.particles.confetti(gs.x, gs.y - 20, 20);
    W.ui.coinFly(gs.x, gs.y - 60, coins);
    W.scene.kick(3);
    W.ui.modal("⛵ The supply boat!",
      `<p>Fresh from the mainland, just for you.</p>
       <span class="big-num">+${U.fmt(coins)} ●</span>
       <p class="muted">Day ${S.daily.streak} in a row — come back tomorrow for more.</p>`,
      [{ label: "Wave it goodbye", cls: "btn-primary" }]);
    W.state.save();
    return true;
  }

  /** Deterministic customer of the day (pays double). */
  function cotdId() {
    const s = todayStr();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const pool = C.CUSTOMERS.filter((c) => !c.needsDock || W.state.S.projects.dock >= c.needsDock);
    return pool[h % pool.length].id;
  }

  W.game = {
    tick, startFish, startChop, tryBiteTap,
    computeOffline, applyOffline, grantRested, drawOverlays,
    tryGiftTap, cotdId,
    get bite() { return bite; },
    get combo() { return combo; },
    get giftBoat() { return giftBoat; },
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
