/* ═══════════════════════════════════════════════════════════════
   WISP — game.js
   The heart: tick loop, economy, levels, achievements, offline.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;

  let saveTimer = 0;
  let achTimer = 0;
  let voiceTimer = U.rand(20, 40);
  let petRewardCooldown = 0;
  let ceremony = null; // {t, dur, to:{x,y}, gain} while a wisp ascends

  /* ─────────────── earning ─────────────── */

  function earn(amount) {
    const S = W.state.S;
    S.light += amount;
    S.totalLight += amount;
    S.xp += amount;
    levelCheck();
  }

  function levelCheck() {
    const S = W.state.S;
    let leveled = false;
    let stageBefore = W.state.stageFor(S.level);
    while (S.xp >= W.state.xpForLevel(S.level)) {
      S.xp -= W.state.xpForLevel(S.level);
      S.level++;
      leveled = true;
    }
    if (!leveled) return;

    const stageAfter = W.state.stageFor(S.level);
    const p = W.scene.wispPos();
    W.audio.play("levelUp");
    W.particles.rise(p.x, p.y, 26);

    if (stageAfter !== stageBefore) {
      // Evolution! A big moment.
      W.particles.burst(p.x, p.y, 60, { speed: 260 });
      W.ui.toast(`${S.wispName || "Your wisp"} became a ${stageAfter.name}!`, "It's growing because of you.");
      W.ui.bubble(U.pick(C.VOICE.levelUp), 4200);
    } else {
      W.ui.toast(`Level ${S.level}`, "+" + Math.round(C.LEVEL.prodPerLevel * 100) + "% light from everything");
      if (Math.random() < 0.4) W.ui.bubble(U.pick(C.VOICE.levelUp));
    }
    W.ui.renderWispTab();
  }

  /* ─────────────── tap ─────────────── */

  function tap(x, y) {
    const S = W.state.S;
    S.taps++;
    let v = W.state.tapValue();
    const crit = Math.random() < C.TAP.critChance;
    if (crit) v *= C.TAP.critMult;
    earn(v);

    W.wisp.poke();
    W.audio.play(crit ? "crit" : "tap");
    W.ui.floater(x, y - 20, "+" + U.fmt(v), crit);
    W.particles.burst(x, y, crit ? 26 : 8, crit ? { speed: 240 } : {});
    if (crit) W.ui.toast("✦ Sparkle burst! ✦", "+" + U.fmt(v) + " light");
    else if (Math.random() < 0.06) W.ui.bubble(U.pick(C.VOICE.tapHappy), 1200);
  }

  /* ─────────────── petting ─────────────── */

  function onPet() {
    // Called by wisp.js roughly every half second while petting.
    const S = W.state.S;
    if (petRewardCooldown > 0) return;
    const v = Math.max(W.state.tapValue() * 0.5, W.state.lightPerSec() * 0.25);
    earn(v);
    const p = W.scene.wispPos();
    W.ui.floater(p.x + U.rand(-30, 30), p.y - 60, "+" + U.fmt(v));
    W.audio.play("chirp");
  }

  /* ─────────────── shop ─────────────── */

  function buyBuilding(id) {
    const S = W.state.S;
    const b = C.BUILDINGS.find((x) => x.id === id);
    if (!b) return;
    const cost = W.state.buildingCost(b);
    if (S.light < cost) { W.audio.play("denied"); return; }

    S.light -= cost;
    const first = W.state.totalBuildings() === 0;
    const firstOfKind = (S.buildings[id] || 0) === 0;
    S.buildings[id] = (S.buildings[id] || 0) + 1;

    W.audio.play("buy");
    W.ui.updateShop();
    W.ui.updateBoosts();
    const p = W.scene.wispPos();
    W.particles.rise(p.x, p.y + 100, 10);

    if (first) W.ui.bubble(U.pick(C.VOICE.firstBuild), 3500);
    else if (firstOfKind) W.ui.bubble(U.pick(C.VOICE.build), 2500);
    else if (Math.random() < 0.12) W.ui.bubble(U.pick(C.VOICE.build), 2000);
  }

  function buyUpgrade(id) {
    const S = W.state.S;
    const u = C.UPGRADES.find((x) => x.id === id);
    if (!u || S.upgrades[id]) return;
    if (S.light < u.cost) { W.audio.play("denied"); return; }

    S.light -= u.cost;
    S.upgrades[id] = true;
    W.audio.play("upgrade");
    W.ui.renderBoostsTab();
    W.ui.updateShop();
    W.ui.toast(u.name, "woven into " + (S.wispName || "your wisp") + "'s light");
    const p = W.scene.wispPos();
    W.particles.burst(p.x, p.y, 24, { speed: 200 });
  }

  /* ─────────────── achievements ─────────────── */

  function checkAchievements() {
    const S = W.state.S;
    const helpers = { totalBuildings: (s) => W.state.totalBuildings(s) };
    for (const a of C.ACHIEVEMENTS) {
      if (S.achievements[a.id]) continue;
      let earned = false;
      try { earned = a.check(S, helpers); } catch (e) { /* never break the loop */ }
      if (earned) {
        S.achievements[a.id] = Date.now();
        W.audio.play("achievement");
        W.ui.toast(a.glyph + " " + a.name, a.desc + " · +1% light");
        const p = W.scene.wispPos();
        W.particles.rise(p.x, p.y, 14, { hue: 200 });
      }
    }
  }

  /* ─────────────── offline progress ─────────────── */

  function computeOffline() {
    const S = W.state.S;
    const away = (Date.now() - S.lastSeen) / 1000;
    if (away < C.OFFLINE.minSeconds) return null;
    const rate = W.state.lightPerSec();
    if (rate <= 0) return null;
    const capped = Math.min(away, C.OFFLINE.capHours * 3600);
    const gained = rate * capped * C.OFFLINE.rate;
    return { seconds: away, cappedSeconds: capped, gained };
  }

  function applyOffline(result) {
    const S = W.state.S;
    earn(result.gained);
    S.flags.returned = true;
  }

  /* ─────────────── ascension ─────────────── */

  function tryAscend() {
    const S = W.state.S;
    const gain = W.state.stardustGain();
    if (gain < 1) { W.audio.play("denied"); return; }
    const name = S.wispName || "Your wisp";
    W.ui.modal(
      "Ascension",
      `<p><b>${name}</b> has grown as far as this meadow can carry it.</p>
       <p style="margin-top:10px">It's ready to take its place in the sky — as a <b>star that will
       watch over every wisp that comes after</b>. Forever.</p>
       <span class="big-num">+${gain} ✨ stardust</span>
       <p class="muted">Each stardust makes all future light +${Math.round(C.PRESTIGE.perStardust * 100)}%.
       The meadow starts over. Your memories — and your stars — stay.</p>`,
      [
        { label: "Not yet", cls: "btn-ghost" },
        { label: "Let it shine", cls: "btn-primary", fn: () => startCeremony(gain) },
      ]
    );
  }

  function startCeremony(gain) {
    const S = W.state.S;
    W.wisp.setPetting(false);
    // Pick a free spot in the sky, away from the moon (top-right).
    let x, y, tries = 0;
    do {
      x = U.rand(0.08, 0.68);
      y = U.rand(0.06, 0.26);
      tries++;
    } while (tries < 20 && S.stars.some((s) => Math.hypot(s.x - x, s.y - y) < 0.07));
    ceremony = { t: 0, dur: C.PRESTIGE.ceremonySec, to: { x, y }, gain };
    W.ui.bubble(U.pick(["watch me.", "I'll be right here. every night.", "don't be sad — look up."]), 3000);
    W.audio.play("levelUp");
  }

  function finishCeremony() {
    const S = W.state.S;
    const to = ceremony.to;
    ceremony = null;
    const star = W.state.ascend(to);
    const px = to.x * W.scene.width, py = to.y * W.scene.height;
    W.particles.burst(px, py, 50, { speed: 200 });
    W.audio.play("achievement");
    checkAchievements();
    W.ui.renderBuildTab();
    W.ui.renderBoostsTab();
    W.ui.renderWispTab();
    W.flow.rebirth(star);
  }

  function starTouched(star) {
    const S = W.state.S;
    const days = Math.max(1, Math.ceil((star.ascended - star.born) / 86400000));
    W.ui.toast("🌠 " + star.name, star.stage + " · " + days + " day" + (days > 1 ? "s" : "") + " together · still watching");
    if (S.wispName && Math.random() < 0.4) {
      W.ui.bubble(U.pick([
        `is that… ${star.name}?`,
        `${star.name} says hi back.`,
        "one day I'll be up there too, right?",
      ]), 3200);
    }
    const px = star.x * W.scene.width, py = star.y * W.scene.height;
    W.particles.rise(px, py, 8, { hue: 48 });
  }

  /* ─────────────── wisp voice (idle) ─────────────── */

  function greet() {
    const h = new Date().getHours();
    let key = "greetDay";
    if (h >= 5 && h < 9) key = "greetDawn";
    else if (h >= 9 && h < 17) key = "greetDay";
    else if (h >= 17 && h < 22) key = "greetEvening";
    else key = "greetNight";
    W.ui.bubble(U.pick(C.VOICE[key]), 4000);
  }

  function idleVoice() {
    const pool = Math.random() < 0.12 ? C.VOICE.rare : C.VOICE.idleSoft;
    W.ui.bubble(U.pick(pool), 4200);
    if (Math.random() < 0.5) W.audio.play("chirp");
  }

  /* ─────────────── tick ─────────────── */

  function tick(dt) {
    const S = W.state.S;
    const rate = W.state.lightPerSec();
    if (rate > 0) earn(rate * dt);

    if (petRewardCooldown > 0) petRewardCooldown -= dt;

    if (ceremony) {
      ceremony.t += dt;
      // sparkle trail while rising
      const p = W.wisp.pos(ceremony.t);
      if (Math.random() < 0.6) W.particles.rise(p.x, p.y + 10, 2);
      if (ceremony.t >= ceremony.dur) finishCeremony();
    }

    achTimer += dt;
    if (achTimer >= 2) { achTimer = 0; checkAchievements(); }

    saveTimer += dt;
    if (saveTimer >= 10) { saveTimer = 0; W.state.save(); }

    voiceTimer -= dt;
    if (voiceTimer <= 0) {
      voiceTimer = U.rand(50, 130);
      if (document.visibilityState === "visible" && !ceremony) idleVoice();
    }
  }

  W.game = {
    tick, tap, onPet, earn,
    buyBuilding, buyUpgrade,
    computeOffline, applyOffline,
    checkAchievements, greet,
    tryAscend, starTouched,
    get ceremony() { return ceremony; },
  };
})();
