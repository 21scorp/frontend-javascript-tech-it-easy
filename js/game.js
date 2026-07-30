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
  let ceremony = null;   // {t, dur, to:{x,y}, gain} while a wisp ascends
  let attention = null;  // {until} while the wisp wants you
  let attnTimer = U.rand(C.ATTENTION.minGap, C.ATTENTION.maxGap);
  let dailyTimer = 0;
  let blessing = null;   // {idx, until} while an ancestor star calls
  let blessTimer = U.rand(180, 420);
  let dew = null;        // {x, y, born} a golden dewdrop falling
  let dewTimer = U.rand(90, 240); // first one comes fairly soon

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

    // Answering an attention moment is its own, bigger reward.
    if (attention) { answerAttention(); return; }

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

  /* ─────────────── attention moments ─────────────── */

  function startAttention() {
    attention = { until: Date.now() + C.ATTENTION.window * 1000 };
    W.ui.bubble(U.pick(C.VOICE.attention), C.ATTENTION.window * 1000);
    W.audio.play("chirp");
  }

  function answerAttention() {
    attention = null;
    const S = W.state.S;
    const reward = Math.max(
      W.state.tapValue() * C.ATTENTION.tapMult,
      W.state.lightPerSec() * 60 * C.ATTENTION.prodMinutes
    );
    earn(reward);
    const deepened = W.state.gainBond(C.ATTENTION.bondXp);
    const p = W.scene.wispPos();
    W.wisp.poke();
    W.audio.play("crit");
    W.particles.burst(p.x, p.y, 30, { speed: 220 });
    for (let i = 0; i < 5; i++) W.particles.heart(p.x + U.rand(-40, 40), p.y - 30);
    W.ui.floater(p.x, p.y - 60, "+" + U.fmt(reward), true);
    W.ui.bubble(U.pick(C.VOICE.attnThanks), 2600);
    if (deepened) announceBond();
    W.state.save();
  }

  function announceBond() {
    const S = W.state.S;
    W.ui.toast("💗 Bond deepened", "You are now “" + W.state.bondTitle(S.bond.level) + "” · +2% light, +5% touch");
    W.audio.play("achievement");
  }

  /* ─────────────── daily gift & streak ─────────────── */

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function yesterdayStr() {
    const d = new Date(Date.now() - 86400000);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** Called on boot (after modals) and on day rollover while playing. */
  function maybeDailyGift() {
    const S = W.state.S;
    const today = todayStr();
    if (S.streak.last === today) return;
    const firstEver = !S.streak.last;
    S.streak.count = S.streak.last === yesterdayStr() ? S.streak.count + 1 : 1;
    S.streak.last = today;
    if (firstEver) { W.state.save(); return; } // day 1 happens quietly, inside the naming

    const name = S.wispName || "Your wisp";
    const gift = Math.max(500, W.state.lightPerSec() * 60 * C.DAILY.prodMinutes);
    const bondXp = C.DAILY.bondBase + C.DAILY.bondPerDay * Math.min(S.streak.count, 30);
    earn(gift);
    const deepened = W.state.gainBond(bondXp);
    W.state.addBuff("daily", "morning warmth", C.DAILY.buffMult, C.DAILY.buffMinutes * 60);

    W.ui.modal(
      S.streak.count > 1 ? "Day " + S.streak.count + " together" : "A new day together",
      `<p>${U.pick(C.VOICE.daily)}</p>
       <span class="big-num">+${U.fmt(gift)} ✦</span>
       <p><b>×${C.DAILY.buffMult} light</b> for ${C.DAILY.buffMinutes} minutes · <b>+${bondXp}</b> bond</p>
       ${S.streak.count > 1 ? `<p class="muted" style="margin-top:8px">🔥 ${S.streak.count} days in a row — don't break the little one's heart.</p>` : ""}`,
      [{ label: "Good morning, " + name, cls: "btn-primary" }]
    );
    W.audio.play("levelUp");
    if (deepened) setTimeout(announceBond, 1200);
    W.state.save();
  }

  /* ─────────────── petting ─────────────── */

  function onPet() {
    // Called by wisp.js roughly every half second while petting.
    const S = W.state.S;
    if (petRewardCooldown > 0) return;
    if (attention) { answerAttention(); return; }
    const v = Math.max(W.state.tapValue() * 0.5, W.state.lightPerSec() * 0.25);
    earn(v);
    const deepened = W.state.gainBond(C.BOND.petXp);
    const p = W.scene.wispPos();
    W.ui.floater(p.x + U.rand(-30, 30), p.y - 60, "+" + U.fmt(v));
    W.audio.play("chirp");
    if (Math.random() < 0.1) W.ui.bubble(U.pick(C.VOICE.petThanks), 1500);
    if (deepened) announceBond();
  }

  /* ─────────────── shop ─────────────── */

  function buyBuilding(id, qty) {
    const S = W.state.S;
    const b = C.BUILDINGS.find((x) => x.id === id);
    if (!b) return;
    let n = qty === "max" ? W.state.maxAffordable(b) : (qty || 1);
    if (n < 1) { W.audio.play("denied"); return; }
    let cost = W.state.buildingCostN(b, n);
    if (S.light < cost) {
      if (n > 1) { n = W.state.maxAffordable(b); cost = W.state.buildingCostN(b, n); }
      if (n < 1 || S.light < cost) { W.audio.play("denied"); return; }
    }

    S.light -= cost;
    const first = W.state.totalBuildings() === 0;
    const firstOfKind = (S.buildings[id] || 0) === 0;
    S.buildings[id] = (S.buildings[id] || 0) + n;

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
    const idx = S.stars.indexOf(star);
    if (blessing && blessing.idx === idx) { answerBlessing(star); return; }
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

  /* ─────────────── star blessings ─────────────── */

  function answerBlessing(star) {
    blessing = null;
    const reward = Math.max(W.state.lightPerSec() * 60 * 10, W.state.tapValue() * 100);
    earn(reward);
    const deepened = W.state.gainBond(10);
    const px = star.x * W.scene.width, py = star.y * W.scene.height;
    W.particles.burst(px, py, 36, { speed: 240, hue: star.hue });
    W.ui.floater(px, py + 30, "+" + U.fmt(reward), true);
    W.audio.play("levelUp");
    W.ui.toast("💫 A blessing from " + star.name, "It still thinks of you.");
    if (W.state.S.wispName && Math.random() < 0.6) {
      W.ui.bubble(U.pick([
        `${star.name} is warm. like you said.`,
        "I felt that all the way down here!",
        `thank you, ${star.name}…`,
      ]), 3200);
    }
    if (deepened) announceBond();
    W.state.save();
  }

  /* ─────────────── golden dewdrop ─────────────── */

  function spawnDew() {
    dew = { x: U.rand(0.12, 0.88), born: Date.now() };
  }

  function catchDew(x, y) {
    dew = null;
    W.particles.burst(x, y, 34, { speed: 260 });
    W.audio.play("crit");
    if (Math.random() < C.DEW.luckyChance) {
      const reward = Math.max(W.state.lightPerSec() * 60 * C.DEW.luckyMinutes, W.state.tapValue() * 150);
      earn(reward);
      W.ui.floater(x, y, "+" + U.fmt(reward), true);
      W.ui.toast("💧 Lucky dew!", "+" + U.fmt(reward) + " light, all at once");
    } else {
      W.state.addBuff("dew", "dewdrop frenzy", C.DEW.frenzyMult, C.DEW.frenzySec);
      W.ui.toast("💧 Dewdrop frenzy!", "×" + C.DEW.frenzyMult + " light for " + C.DEW.frenzySec + " seconds — go go go!");
      W.ui.bubble(U.pick(["it tastes like morning!!", "quick — everything is brighter!", "WHOA."]), 2600);
    }
    W.state.save();
  }

  /* ─────────────── comet wishes ─────────────── */

  function cometWish(x, y) {
    const reward = Math.max(W.state.lightPerSec() * 60 * 8, W.state.tapValue() * 60);
    earn(reward);
    W.particles.burst(x, y, 30, { speed: 260 });
    W.ui.floater(x, y, "+" + U.fmt(reward), true);
    W.audio.play("crit");
    W.ui.toast("☄️ You caught a wish", "+" + U.fmt(reward) + " light");
    if (Math.random() < 0.5) {
      W.ui.bubble(U.pick([
        "what did you wish for? …me? really?",
        "I wished we could stay like this.",
        "quick, wish for something!",
      ]), 3000);
    }
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

    // attention moments
    if (attention) {
      if (Date.now() > attention.until) attention = null; // no punishment — it just settles
    } else if (!ceremony) {
      attnTimer -= dt;
      if (attnTimer <= 0) {
        attnTimer = U.rand(C.ATTENTION.minGap, C.ATTENTION.maxGap);
        if (document.visibilityState === "visible" && S.flags.introDone) startAttention();
      }
    }

    // star blessings — an ancestor sometimes calls
    if (blessing) {
      if (Date.now() > blessing.until) blessing = null;
    } else if (S.stars.length > 0 && !ceremony) {
      blessTimer -= dt;
      if (blessTimer <= 0) {
        blessTimer = U.rand(180, 420);
        if (document.visibilityState === "visible") {
          blessing = { idx: U.randInt(0, S.stars.length - 1), until: Date.now() + 18000 };
          W.audio.play("chirp");
        }
      }
    }

    // golden dewdrop
    if (dew) {
      if ((Date.now() - dew.born) / 1000 > C.DEW.fallSec) dew = null;
    } else if (!ceremony) {
      dewTimer -= dt;
      if (dewTimer <= 0) {
        dewTimer = U.rand(C.DEW.minGap, C.DEW.maxGap);
        if (document.visibilityState === "visible" && S.flags.introDone) {
          dew = { x: U.rand(0.12, 0.88), born: Date.now() };
          W.audio.play("chirp");
        }
      }
    }

    // day rollover while playing (checks every 30s)
    dailyTimer += dt;
    if (dailyTimer >= 30) {
      dailyTimer = 0;
      if (S.flags.introDone && !ceremony) maybeDailyGift();
    }

    // expire buffs
    if (S.buffs.length > 0) {
      const now = Date.now();
      const expired = S.buffs.filter((b) => b.until <= now);
      if (expired.length > 0) {
        S.buffs = S.buffs.filter((b) => b.until > now);
        W.ui.toast("The " + expired[0].label + " fades", "…but it was nice while it lasted.");
      }
    }

    voiceTimer -= dt;
    if (voiceTimer <= 0) {
      voiceTimer = U.rand(50, 130);
      if (document.visibilityState === "visible" && !ceremony && !attention) idleVoice();
    }
  }

  W.game = {
    tick, tap, onPet, earn,
    buyBuilding, buyUpgrade,
    computeOffline, applyOffline,
    checkAchievements, greet,
    tryAscend, starTouched, cometWish, catchDew, spawnDew,
    maybeDailyGift,
    get ceremony() { return ceremony; },
    get attention() { return attention; },
    get blessing() { return blessing; },
    get dew() { return dew; },
  };
})();
