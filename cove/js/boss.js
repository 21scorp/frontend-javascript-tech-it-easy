/* ═══════════════════════════════════════════════════════════════
   COVE — boss.js
   The Deep Water: boss-fish duels. Hold to reel, release when it
   dives, tap the jumps. Tension maxed = line snaps (bait lost).
   Stamina emptied = caught → trophy, reward, permanent perk.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;
  const F = () => C.BOSSFIGHT;

  let fight = null;
  /* fight = { boss, first, stamina, tension, reeling,
               phase: "calm"|"warn"|"dive"|"jump", phaseT, phaseDur,
               wander, t, done: null|"win"|"lose", doneT, hint } */

  /* ─────────────── entry: the deep-water menu ─────────────── */

  function openDeepWater() {
    const S = W.state.S;
    let html = `<p class="muted">The row boat rocks against the buoys. Out there, the water turns dark.</p>`;
    for (const boss of C.BOSSES) {
      const caught = !!S.trophies[boss.id];
      const lvlOk = S.skills.fishing.level >= boss.lvl;
      const bait = W.state.baitCheck(boss);
      const cd = S.bossCooldowns[boss.id] || 0;
      const cooling = caught && cd > Date.now();

      let status, btn = "";
      if (!lvlOk) {
        status = `🔒 Fishing ${boss.lvl} required`;
      } else if (cooling) {
        status = `✓ Caught · returns in ${U.fmtDuration((cd - Date.now()) / 1000)}`;
      } else {
        const baitLine = Object.entries(boss.bait)
          .map(([mid, n]) => `${n}× ${W.state.item(mid).name}`).join(" + ");
        status = (caught ? "Again, for coins · " : "") + "Bait: " + baitLine;
        btn = `<button class="btn ${bait.ok ? "btn-primary" : "btn-ghost"}" data-boss="${boss.id}"
          style="padding:8px 14px;font-size:0.8rem">${bait.ok ? "Row out" : "No bait"}</button>`;
      }
      html += `<div class="setting-row"><span><b>${boss.name}</b><br>
        <span class="muted" style="font-size:0.78rem">${boss.intro}<br>${status}</span></span>${btn}</div>`;
    }
    W.ui.modal("🌊 The Deep Water", html, [{ label: "Back to shore", cls: "btn-ghost" }]);
    document.querySelectorAll("[data-boss]").forEach((b) => {
      b.addEventListener("click", () => {
        const boss = C.BOSSES.find((x) => x.id === b.dataset.boss);
        if (!W.state.baitCheck(boss).ok) { W.audio.play("denied"); return; }
        W.ui.closeModal();
        start(boss.id);
      });
    });
  }

  /* ─────────────── the duel ─────────────── */

  function start(bossId) {
    const S = W.state.S;
    const boss = C.BOSSES.find((b) => b.id === bossId);
    if (!boss || fight) return false;
    if (S.skills.fishing.level < boss.lvl) return false;
    if (!W.state.takeBait(boss)) return false;
    W.ui.markBagDirty();
    fight = {
      boss,
      first: !S.trophies[boss.id],
      stamina: boss.stamina,
      maxStamina: boss.stamina,
      tension: F().startTension,
      reeling: false,
      phase: "calm",
      phaseT: 0,
      phaseDur: U.rand(F().phaseCalm[0], F().phaseCalm[1]),
      wander: Math.random() * 10,
      t: 0,
      done: null,
      doneT: 0,
      hint: true,
    };
    W.audio.play("bite");
    W.ui.toast("🌊 " + boss.name, boss.taunt);
    W.state.save();
    return true;
  }

  function nextPhase() {
    const f = fight;
    if (f.phase === "calm") {
      if (Math.random() < 0.58) {
        f.phase = "warn";
        f.phaseDur = F().telegraph;
        W.audio.play("bite");
      } else {
        f.phase = "jump";
        f.phaseDur = F().jumpWindow;
        f.jumpHitDone = false;
        W.audio.play("bite");
      }
    } else if (f.phase === "warn") {
      f.phase = "dive";
      f.phaseDur = U.rand(F().phaseDive[0], F().phaseDive[1]);
    } else if (f.phase === "dive") {
      f.phase = "calm";
      f.phaseDur = U.rand(F().phaseCalm[0], F().phaseCalm[1]);
    } else if (f.phase === "jump") {
      if (!f.jumpHitDone) f.stamina = Math.min(f.maxStamina, f.stamina + F().jumpMissRecover);
      f.phase = "calm";
      f.phaseDur = U.rand(F().phaseCalm[0], F().phaseCalm[1]);
    }
    f.phaseT = 0;
  }

  function pointerDown() {
    if (!fight || fight.done) return;
    const f = fight;
    if (f.phase === "jump" && !f.jumpHitDone) {
      f.jumpHitDone = true;
      f.stamina -= F().jumpHit;
      f.tension = Math.max(0, f.tension - 0.1);
      W.audio.play("bonus");
    }
    f.reeling = true;
    f.hint = false;
  }

  function pointerUp() {
    if (!fight) return;
    fight.reeling = false;
  }

  function tick(dt) {
    if (!fight) return;
    const f = fight;
    f.t += dt;

    if (f.done) {
      f.doneT += dt;
      if (f.doneT > 1.4) finish();
      return;
    }

    f.phaseT += dt;
    if (f.phaseT >= f.phaseDur) nextPhase();

    const b = f.boss;
    if (f.reeling) {
      f.stamina -= F().reelDrain * b.drainMult * dt;
      const mult = f.phase === "dive" ? F().diveTensionMult : 1;
      f.tension += F().reelTension * b.tensionMult * mult * dt;
    } else {
      f.tension -= F().relax * dt;
      f.stamina = Math.min(f.maxStamina, f.stamina + F().recover * dt);
    }
    // a dive strains the line a little even when released
    if (f.phase === "dive" && !f.reeling) f.tension += 0.05 * dt;
    f.tension = Math.max(0, f.tension);

    if (f.tension >= 1) {
      f.done = "lose";
      f.doneT = 0;
      W.audio.play("denied");
    } else if (f.stamina <= 0) {
      f.stamina = 0;
      f.done = "win";
      f.doneT = 0;
      W.audio.play("level");
    }
  }

  function finish() {
    const f = fight;
    const S = W.state.S;
    const boss = f.boss;
    fight = null;

    if (f.done === "lose") {
      W.ui.toast("💔 The line snapped", boss.name + " sinks back into the dark. The bait is gone — but so is the mystery.");
      W.state.save();
      return;
    }

    // the catch
    S.bossCooldowns[boss.id] = Date.now() + F().recatchDays * 86400e3;
    if (f.first) {
      S.trophies[boss.id] = true;
      S.coins += boss.reward.coins;
      S.totals.earned += boss.reward.coins;
      const ups = W.state.gainXp("fishing", boss.reward.xp);
      if (ups > 0) W.ui.skillUp("fishing", ups);
      W.ui.modal("🏆 " + boss.name + " — caught!",
        `<p>The whole cove will hear about this.</p>
         <span class="big-num">+${U.fmt(boss.reward.coins)} ●</span>
         <p class="muted">+${U.fmt(boss.reward.xp)} fishing xp</p>
         <p><b>Trophy mounted at your stall.</b><br>${boss.perkDesc}</p>`,
        [{ label: "Hang it up", cls: "btn-primary" }]);
    } else {
      S.coins += boss.recatchCoins;
      S.totals.earned += boss.recatchCoins;
      W.ui.modal("🎣 " + boss.name + " — again!",
        `<p>It remembers you. You remember it.</p>
         <span class="big-num">+${U.fmt(boss.recatchCoins)} ●</span>`,
        [{ label: "Release it", cls: "btn-primary" }]);
    }
    W.audio.play("sell");
    W.state.save();
  }

  /* ─────────────── drawing (screen space) ─────────────── */

  function bar(ctx, x, y, w, h, k, fill) {
    ctx.fillStyle = "rgba(10, 26, 38, 0.75)";
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.roundRect(x + 3, y + 3, Math.max(0, (w - 6) * k), h - 6, (h - 6) / 2); ctx.fill();
  }

  function drawFish(ctx, x, y, boss, f) {
    const s = boss.size;
    ctx.save();
    ctx.translate(x, y);
    const lean = f.phase === "dive" ? 0.5 : f.phase === "jump" ? -0.6 : Math.sin(f.t * 1.3) * 0.08;
    ctx.rotate(lean);
    // body
    ctx.fillStyle = `hsl(${boss.hue}, 55%, 52%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 74 * s, 34 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // belly
    ctx.fillStyle = `hsl(${boss.hue}, 40%, 68%)`;
    ctx.beginPath();
    ctx.ellipse(4 * s, 10 * s, 58 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // tail (beats faster when diving)
    const beat = Math.sin(f.t * (f.phase === "dive" ? 16 : 7)) * 12;
    ctx.fillStyle = `hsl(${boss.hue}, 55%, 45%)`;
    ctx.beginPath();
    ctx.moveTo(66 * s, 0);
    ctx.lineTo(102 * s, -26 * s + beat);
    ctx.lineTo(102 * s, 26 * s + beat);
    ctx.closePath();
    ctx.fill();
    // dorsal fin
    ctx.beginPath();
    ctx.moveTo(-16 * s, -30 * s);
    ctx.quadraticCurveTo(6 * s, -58 * s, 26 * s, -30 * s);
    ctx.closePath();
    ctx.fill();
    // markings: koi spots / pike stripes
    if (boss.id === "koi") {
      ctx.fillStyle = "rgba(220, 90, 60, 0.7)";
      ctx.beginPath();
      ctx.ellipse(-20 * s, -8 * s, 14 * s, 9 * s, 0.3, 0, Math.PI * 2);
      ctx.ellipse(26 * s, 2 * s, 10 * s, 7 * s, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 20 * s, -26 * s);
        ctx.lineTo(i * 20 * s - 8, 22 * s);
        ctx.stroke();
      }
    }
    // eye
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-48 * s, -8 * s, 8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#20303c";
    ctx.beginPath(); ctx.arc(-50 * s, -8 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw(ctx, vw, vh, t) {
    if (!fight) return;
    const f = fight;
    const b = f.boss;

    // deep water
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, "rgba(14, 58, 82, 0.96)");
    g.addColorStop(1, "rgba(6, 26, 40, 0.98)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // drifting light shafts
    for (let i = 0; i < 3; i++) {
      const lx = ((t * 12 + i * vw / 3) % (vw + 200)) - 100;
      ctx.fillStyle = "rgba(140, 200, 220, 0.05)";
      ctx.beginPath();
      ctx.moveTo(lx, 0); ctx.lineTo(lx + 80, 0);
      ctx.lineTo(lx - 40, vh); ctx.lineTo(lx - 120, vh);
      ctx.closePath(); ctx.fill();
    }

    // the fish
    const cx = vw / 2 + Math.sin(f.t * 0.8 + f.wander) * vw * 0.16;
    let cy = vh * 0.44;
    if (f.phase === "dive") cy += Math.min(1, f.phaseT / 0.5) * 120;
    if (f.phase === "warn") cy += Math.sin(f.phaseT * 30) * 4;
    if (f.phase === "jump") cy -= Math.sin(Math.min(1, f.phaseT / F().jumpWindow) * Math.PI) * 150;

    // the line, from your rod at the bottom
    ctx.strokeStyle = f.tension > 0.75 ? "rgba(255, 120, 90, 0.9)" : "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = f.tension > 0.75 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(vw / 2, vh - 108);
    const sag = f.reeling ? 6 : 46;
    ctx.quadraticCurveTo((vw / 2 + cx) / 2, (vh - 108 + cy) / 2 + sag, cx - 60 * b.size, cy);
    ctx.stroke();

    drawFish(ctx, cx, cy, b, f);

    // telegraphs
    ctx.textAlign = "center";
    if (f.phase === "warn") {
      ctx.fillStyle = "#ff6a50";
      ctx.font = "800 40px system-ui, sans-serif";
      ctx.fillText("!!", cx, cy - 80 * b.size);
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText("LET GO!", cx, cy - 56 * b.size);
    } else if (f.phase === "jump" && !f.jumpHitDone) {
      const pulse = 1 + Math.sin(t * 12) * 0.15;
      ctx.strokeStyle = "#f3c54a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 66 * b.size * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#f3c54a";
      ctx.font = "800 40px system-ui, sans-serif";
      ctx.fillText("!", cx, cy - 80 * b.size);
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText("TAP!", cx, cy - 58 * b.size);
    }

    // stamina (top)
    const bw = Math.min(420, vw * 0.78);
    ctx.fillStyle = "#fff8ea";
    ctx.font = "800 17px system-ui, sans-serif";
    ctx.fillText(b.name, vw / 2, 86);
    bar(ctx, (vw - bw) / 2, 96, bw, 20, f.stamina / f.maxStamina, `hsl(${b.hue}, 60%, 55%)`);

    // tension (bottom)
    const tCol = f.tension < 0.55 ? "#57a05b" : f.tension < 0.8 ? "#e8b23f" : "#e8563f";
    bar(ctx, (vw - bw) / 2, vh - 96, bw, 20, f.tension, tCol);
    ctx.fillStyle = "rgba(255, 248, 234, 0.85)";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillText("line tension", vw / 2, vh - 104);
    if (f.tension > 0.8 && !f.done) {
      ctx.fillStyle = "#ff6a50";
      ctx.font = "800 15px system-ui, sans-serif";
      ctx.fillText("IT'S GOING TO SNAP — LET GO!", vw / 2, vh - 128);
    }

    // first-time hint
    if (f.hint && f.t < 7 && !f.done) {
      ctx.fillStyle = "rgba(255, 248, 234, 0.9)";
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText("HOLD to reel it in — RELEASE when it dives", vw / 2, vh - 150);
    }

    // outcome flash
    if (f.done === "win") {
      ctx.fillStyle = `rgba(243, 197, 74, ${Math.max(0, 0.45 - f.doneT * 0.3)})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = "#fff8ea";
      ctx.font = "800 34px system-ui, sans-serif";
      ctx.fillText("CAUGHT!", vw / 2, vh / 2 - 140);
    } else if (f.done === "lose") {
      ctx.fillStyle = `rgba(232, 86, 63, ${Math.max(0, 0.4 - f.doneT * 0.28)})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = "#fff8ea";
      ctx.font = "800 30px system-ui, sans-serif";
      ctx.fillText("the line snaps…", vw / 2, vh / 2 - 140);
    }
  }

  W.boss = {
    openDeepWater, start, tick, draw, pointerDown, pointerUp,
    get active() { return !!fight; },
    get fight() { return fight; },
  };
})();
