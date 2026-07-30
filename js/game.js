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
  let showerTimer = U.rand(1100, 2200);
  let combo = 0;
  let lastTapAt = 0;
  let sessionT = 0;      // seconds since boot (for first-time hints)
  let visitor = null;    // {type, born, greeted} a wanderer in the meadow
  let visitTimer = U.rand(C.VISITOR_GAP[0], C.VISITOR_GAP[1]);

  /* ─────────────── earning ─────────────── */

  function earn(amount) {
    const S = W.state.S;
    S.light += amount;
    S.totalLight += amount;
    S.xp += amount;
    levelCheck();
  }

  let lastLevelFxAt = 0;

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
    // when income is huge, levels chain every frame — celebrate at
    // most ~once a second (evolutions always celebrate)
    const now = performance.now();
    if (stageAfter === stageBefore && now - lastLevelFxAt < 1100) return;
    lastLevelFxAt = now;
    const p = W.scene.wispPos();
    W.audio.play("levelUp");
    W.particles.rise(p.x, p.y, 26);

    if (stageAfter !== stageBefore) {
      // Evolution! A big moment.
      W.particles.burst(p.x, p.y, 60, { speed: 260 });
      W.particles.ring(p.x, p.y, 40, stageAfter.hue);
      setTimeout(() => W.particles.ring(p.x, p.y, 60, stageAfter.hue), 220);
      setTimeout(() => W.particles.ring(p.x, p.y, 85, 48), 440);
      W.audio.play("evolve");
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

    // rhythm combo — keep tapping to warm up (max +100% at 50)
    const now = performance.now();
    combo = now - lastTapAt < 900 ? combo + 1 : 1;
    lastTapAt = now;

    let v = W.state.tapValue() * (1 + Math.min(combo, 50) * 0.02);
    const crit = Math.random() < C.TAP.critChance;
    if (crit) v *= C.TAP.critMult;
    earn(v);

    progressWish("tap");
    progressWish("combo", combo);

    W.wisp.poke();
    W.audio.play(crit ? "crit" : "tap");
    const comboTag = combo >= 10 ? "  ‹" + combo + "›" : "";
    W.ui.floater(x, y - 20, "+" + U.fmt(v) + comboTag, crit);
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

  /* ─────────────── tonight's wishes ─────────────── */

  function ensureWishes() {
    const S = W.state.S;
    const today = todayStr();
    if (S.wishes && S.wishes.date === today) return;
    const pool = [...C.WISHES];
    const list = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const tpl = pool.splice(idx, 1)[0];
      list.push({ id: tpl.id, target: tpl.count, n: 0, claimed: false, told: false });
    }
    S.wishes = { date: today, list, allDone: false };
  }

  function wishTemplate(id) {
    return C.WISHES.find((w) => w.id === id);
  }

  function progressWish(track, amount) {
    const S = W.state.S;
    if (!S.wishes) return;
    for (const w of S.wishes.list) {
      if (w.claimed || w.id !== track) continue;
      const tpl = wishTemplate(w.id);
      w.n = tpl.max ? Math.max(w.n, amount || 1) : w.n + (amount || 1);
      if (w.n > w.target) w.n = w.target;
      if (w.n >= w.target && !w.told) {
        w.told = true;
        W.ui.toast("🌙 A wish came true", "Claim it in the Wisp tab");
        W.audio.play("achievement");
      }
    }
  }

  function claimWish(i) {
    const S = W.state.S;
    if (!S.wishes || !S.wishes.list[i]) return;
    const w = S.wishes.list[i];
    if (w.claimed || w.n < w.target) return;
    w.claimed = true;
    const reward = Math.max(300, W.state.lightPerSec() * 60 * C.WISH_REWARD_MINUTES);
    earn(reward);
    const deepened = W.state.gainBond(C.WISH_BOND);
    const p = W.scene.wispPos();
    W.particles.rise(p.x, p.y, 16);
    W.audio.play("upgrade");
    W.ui.floater(p.x, p.y - 60, "+" + U.fmt(reward), true);
    if (deepened) announceBond();

    if (S.wishes.list.every((x) => x.claimed) && !S.wishes.allDone) {
      S.wishes.allDone = true;
      S.stardust += C.WISH_ALL_STARDUST;
      W.particles.burst(p.x, p.y, 40, { speed: 240 });
      W.particles.ring(p.x, p.y, 55, 48);
      W.audio.play("evolve");
      W.ui.toast("🌌 Every wish came true tonight", "+1 ✨ stardust from a grateful sky");
      W.ui.bubble(U.pick(["the meadow is humming!!", "we did all of them. ALL of them.", "tonight was a good night."]), 3400);
    }
    W.state.save();
    W.ui.renderWispTab();
  }

  /** Called on boot (after modals) and on day rollover while playing. */
  function maybeDailyGift() {
    const S = W.state.S;
    const today = todayStr();
    ensureWishes();
    if (S.streak.last === today) return;
    W.state.rotateBackup(); // yesterday's save becomes the safety net
    const firstEver = !S.streak.last;
    S.streak.count = S.streak.last === yesterdayStr() ? S.streak.count + 1 : 1;
    S.streak.last = today;
    // the owl shares one more tale with every new day
    const newTale = S.tales < C.TALES.length;
    if (newTale) S.tales++;
    if (firstEver) { W.state.save(); return; } // day 1 happens quietly, inside the naming

    const name = S.wispName || "Your wisp";
    const gift = Math.max(500, W.state.lightPerSec() * 60 * C.DAILY.prodMinutes);
    const bondXp = C.DAILY.bondBase + C.DAILY.bondPerDay * Math.min(S.streak.count, 30);
    earn(gift);
    const deepened = W.state.gainBond(bondXp);
    W.state.addBuff("daily", "morning warmth", C.DAILY.buffMult, C.DAILY.buffMinutes * 60);

    const moonLetter = S.streak.count > 0 && S.streak.count % 7 === 0;
    W.ui.modal(
      S.streak.count > 1 ? "Day " + S.streak.count + " together" : "A new day together",
      `<p>${U.pick(C.VOICE.daily)}</p>
       <span class="big-num">+${U.fmt(gift)} ✦</span>
       <p><b>×${C.DAILY.buffMult} light</b> for ${C.DAILY.buffMinutes} minutes · <b>+${bondXp}</b> bond</p>
       ${S.streak.count > 1 ? `<p class="muted" style="margin-top:8px">🔥 ${S.streak.count} days in a row — don't break the little one's heart.</p>` : ""}`,
      [{ label: "Good morning, " + name, cls: "btn-primary", fn: moonLetter ? showMoonLetter : null }]
    );
    W.audio.play("levelUp");
    if (deepened) setTimeout(announceBond, 1200);
    if (newTale) {
      setTimeout(() => {
        W.ui.toast("🦉 The owl remembers…", "A new tale waits in " + name + "'s journal.");
      }, 2400);
    }
    // once, after a few loyal days: gently suggest a backup
    if (S.streak.count >= 5 && !S.flags.backupReminded) {
      S.flags.backupReminded = true;
      setTimeout(() => {
        W.ui.toast("💾 Keep " + name + " safe", "Copy a save code in Settings — browsers sometimes forget.");
        W.ui.bubble("if this window ever loses me… the code brings me home. okay?", 4600);
      }, 6000);
    }
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
    progressWish("pet");
    const deepened = W.state.gainBond(C.BOND.petXp);
    const p = W.scene.wispPos();
    W.ui.floater(p.x + U.rand(-30, 30), p.y - 60, "+" + U.fmt(v));
    W.audio.play("chirp");
    if (Math.random() < 0.1) {
      const h = new Date().getHours();
      const pool = h >= 0 && h < 6 ? C.VOICE.petSleepy : C.VOICE.petThanks;
      W.ui.bubble(U.pick(pool), 1800);
    }
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
    progressWish("build", n);

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
    progressWish("boost");
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
    const offRate = S.upgrades.pillow ? 0.75 : C.OFFLINE.rate;
    const capHours = S.upgrades.longdream ? 16 : C.OFFLINE.capHours;
    const capped = Math.min(away, capHours * 3600);
    const gained = rate * capped * offRate;
    return { seconds: away, cappedSeconds: capped, gained, capHours };
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
    W.particles.ring(px, py, 50, star.hue);
    W.audio.play("evolve");
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
    const px = star.x * W.scene.width, py = star.y * W.scene.height;
    W.particles.rise(px, py, 8, { hue: 48 });
    W.audio.play("chirp");

    const days = Math.max(1, Math.ceil((star.ascended - star.born) / 86400000));
    const fmtDate = (ts) => new Date(ts).toLocaleDateString();
    W.ui.modal(
      "🌟 " + star.name,
      `<p style="color:hsl(${star.hue}, 90%, 80%)"><b>${star.stage}</b> · level ${star.level} · generation ${idx + 1}</p>
       <div class="stat-line" style="margin-top:10px"><span>Together</span><b>${days} day${days > 1 ? "s" : ""}</b></div>
       <div class="stat-line"><span>Light gathered</span><b>${U.fmt(star.totalLight)} ✦</b></div>
       <div class="stat-line"><span>Named</span><b>${fmtDate(star.born)}</b></div>
       <div class="stat-line"><span>Rose to the sky</span><b>${fmtDate(star.ascended)}</b></div>
       <p class="muted" style="margin-top:12px;font-style:italic">It's up there right now. Still watching. Still yours.</p>`,
      [
        { label: "We miss you", cls: "btn-ghost", fn: () => {
          if (S.wispName) {
            W.ui.bubble(U.pick([
              `${star.name} says hi back.`,
              `I can feel ${star.name} glowing warmer.`,
              "one day I'll be up there too, right? …right?",
            ]), 3400);
          }
          const px2 = star.x * W.scene.width, py2 = star.y * W.scene.height;
          W.particles.heart(px2, py2 + 14);
        } },
        { label: "Close", cls: "btn-primary" },
      ]
    );
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
    progressWish("dew");
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

  /* ─────────────── visitors ─────────────── */

  function greetVisitor() {
    if (!visitor || visitor.greeted) return;
    visitor.greeted = true;
    const S = W.state.S;
    S.visitors = (S.visitors || 0) + 1;
    progressWish("visitor");
    const reward = Math.max(W.state.lightPerSec() * 60 * 3, W.state.tapValue() * 30);
    earn(reward);
    W.state.gainBond(5);
    W.audio.play("upgrade");
    W.ui.toast("💛 " + visitor.type.greet, "+" + U.fmt(reward) + " light · +5 bond");
    if (Math.random() < 0.7) W.ui.bubble(U.pick(visitor.type.lines), 3200);
    W.state.save();
  }

  /* ─────────────── the owl murmurs ─────────────── */

  let owlMurmurAt = 0;

  function owlTouched() {
    const S = W.state.S;
    const now = Date.now();
    if (now - owlMurmurAt < 8000) return; // it needs a moment between tales
    owlMurmurAt = now;
    const heard = Math.min(S.tales || 0, C.TALES.length);
    W.audio.play("chirp");
    if (heard > 0) {
      const tale = C.TALES[heard - 1];
      W.ui.toast("🦉 the owl murmurs…", tale.length > 90 ? tale.slice(0, 87) + "…" : tale);
      if (tale.length > 90) W.ui.bubble("(read the whole tale in my journal)", 2400);
    } else {
      W.ui.toast("🦉 …", "The owl looks at you. Not yet, it seems to say.");
    }
  }

  /* ─────────────── living moments ─────────────── */

  function petalArrived() {
    const S = W.state.S;
    const reward = Math.max(W.state.lightPerSec() * 60 * 2, W.state.tapValue() * 15);
    earn(reward);
    W.state.gainBond(2);
    const p = W.scene.wispPos();
    W.wisp.poke();
    W.particles.heart(p.x, p.y - 40);
    W.particles.rise(p.x, p.y, 8, { hue: 330 });
    W.ui.floater(p.x, p.y - 50, "+" + U.fmt(reward));
    W.audio.play("chirp");
    if (Math.random() < 0.6) {
      W.ui.bubble(U.pick(["a petal! for me??", "it flew all this way…", "I'm keeping it forever."]), 2800);
    }
  }

  /* ─────────────── comet wishes ─────────────── */

  function cometWish(x, y) {
    const reward = Math.max(W.state.lightPerSec() * 60 * 8, W.state.tapValue() * 60);
    earn(reward);
    progressWish("comet");
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

  /** Every 7th streak day, the moon writes. Enclosed: stardust. */
  function showMoonLetter() {
    const S = W.state.S;
    const week = Math.floor(S.streak.count / 7);
    const letter = C.MOON_LETTERS[Math.min(week - 1, C.MOON_LETTERS.length - 1)];
    S.stardust += C.MOON_LETTER_STARDUST;
    W.state.save();
    W.ui.modal(
      "🌕 A letter from the Moon",
      `<p style="white-space:pre-line;text-align:left;font-style:italic">${letter}</p>
       <span class="big-num">+${C.MOON_LETTER_STARDUST} ✨</span>
       <p class="muted">stardust — every future wisp shines ${Math.round(C.PRESTIGE.perStardust * 100)}% brighter</p>`,
      [{ label: "Write back someday", cls: "btn-primary" }]
    );
    W.audio.play("achievement");
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

  /** Lines that only exist because of what YOU built. */
  function contextLines() {
    const S = W.state.S;
    const own = (id) => (S.buildings[id] || 0);
    const lines = [];
    if (own("owl") > 0) lines.push("the owl blinked at me. twice. that means it likes you.");
    if (own("lantern") > 0) lines.push("I count the lanterns before I sleep. they're all still here.");
    if (own("moonwell") > 0) lines.push("the well showed me your face today. I waved.");
    if (own("aurora") > 0) lines.push("the aurora wore your colour tonight.");
    if (own("firefly") >= 10) lines.push("the fireflies voted. you're their favourite.");
    if (own("comet") > 0) lines.push("a comet waved at me!! I waved back!!");
    if (own("sunseed") > 0) lines.push("sometimes I press my glow against the seed. so it knows someone's here.");
    if (own("glowshroom") >= 5) lines.push("the mushrooms hum louder when you're around. it's true.");
    if (S.stars.length > 0) {
      const star = U.pick(S.stars);
      lines.push(star.name + " twinkled at me today. I twinkled back.");
      lines.push("do you think " + star.name + " would be proud of me?");
    }
    return lines;
  }

  function idleVoice() {
    const ctxLines = contextLines();
    const roll = Math.random();
    const pool = roll < 0.12 ? C.VOICE.rare
      : roll < 0.45 && ctxLines.length > 0 ? ctxLines
      : C.VOICE.idleSoft;
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

    // starfall shower — the sky rains catchable wishes
    showerTimer -= dt;
    if (showerTimer <= 0) {
      showerTimer = U.rand(1100, 2200);
      if (document.visibilityState === "visible" && S.flags.introDone && !ceremony) {
        W.scene.startShower(22);
        W.ui.toast("🌠 Starfall!", "The sky is raining wishes — tap the comets!");
        W.ui.bubble(U.pick(C.VOICE.shower), 3000);
        W.audio.play("levelUp");
      }
    }

    // attention moments
    if (attention) {
      if (Date.now() > attention.until) {
        attention = null; // no punishment — it just settles
        if (Math.random() < 0.25) W.ui.bubble(U.pick(C.VOICE.attnMissed), 2600);
      }
    } else if (!ceremony) {
      attnTimer -= dt;
      if (attnTimer <= 0) {
        attnTimer = U.rand(C.ATTENTION.minGap, C.ATTENTION.maxGap);
        if (document.visibilityState === "visible" && S.flags.introDone) startAttention();
      }
    }

    // gentle first-time hints — the wisp asks, no tutorial boxes
    sessionT += dt;
    if (S.flags.introDone) {
      const H = S.flags.hints || (S.flags.hints = {});
      if (!H.touch && sessionT > 5 && S.taps === 0) {
        H.touch = true;
        W.ui.bubble("touch me? gently?", 4000);
      }
      if (!H.build && S.light >= 15 && W.state.totalBuildings() === 0) {
        H.build = true;
        W.ui.toast("✨ You have enough light to build something", "Open Build, below");
      }
      if (!H.pet && sessionT > 100 && S.bond.xp === 0 && S.bond.level === 1) {
        H.pet = true;
        W.ui.bubble("you can hold me, you know. press and stay.", 4600);
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

    // visitors — rare wanderers
    if (visitor) {
      if ((Date.now() - visitor.born) / 1000 > visitor.type.dur) visitor = null;
    } else if (!ceremony) {
      visitTimer -= dt;
      if (visitTimer <= 0) {
        visitTimer = U.rand(C.VISITOR_GAP[0], C.VISITOR_GAP[1]);
        if (document.visibilityState === "visible" && S.flags.introDone) {
          const options = C.VISITORS.filter((v) => !v.needs || (S.buildings[v.needs] || 0) > 0);
          visitor = { type: U.pick(options), born: Date.now(), greeted: false };
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
    maybeDailyGift, greetVisitor, claimWish, ensureWishes, petalArrived, owlTouched,
    spawnVisitor(id) { const t = C.VISITORS.find((v) => v.id === id); if (t) visitor = { type: t, born: Date.now(), greeted: false }; },
    get ceremony() { return ceremony; },
    get attention() { return attention; },
    get blessing() { return blessing; },
    get dew() { return dew; },
    get visitor() { return visitor; },
  };
})();
