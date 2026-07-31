/* ═══════════════════════════════════════════════════════════════
   WISP — main.js
   Boot, intro & naming ceremonies (first life and every rebirth),
   input handling, the render loop.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;
  const $ = (id) => document.getElementById(id);

  /* ─────────────── boot ─────────────── */

  W.state.load();
  W.audio.setEnabled(W.state.S.settings.sound);
  W.audio.setAmbience(W.state.S.settings.ambience); // starts on first gesture
  W.audio.setMusic(W.state.S.settings.music);

  W.ui.init();
  W.scene.init($("world"));
  W.ui.renderBuildTab();
  W.ui.renderBoostsTab();
  W.ui.renderWispTab();
  W.ui.updateCounters();

  /* ─────────────── naming ceremony (reusable) ─────────────── */

  const FIRST_LINES = [
    "In the dark between the hills,\nsomething small is falling…",
    "It lands softly in your hands.\nWarm. Barely glowing.",
    "It looks up at you.",
  ];

  function rebirthLines(star) {
    const gen = W.state.S.generation;
    if (gen >= 5) {
      return [
        `${star.name} settles into the sky,\namong everyone who came before.`,
        "The meadow knows this dance now.\nIt barely holds its breath.",
        "Still — when the shimmer comes,\nyour heart does the same small jump.",
        "A new light. Your hands. The old promise.",
      ];
    }
    return [
      `The meadow is quiet without ${star.name}.`,
      "Then — a shimmer,\nbetween the hills you built.",
      "Another small light lands in your hands.\nIt seems to already know them.",
    ];
  }

  let ceremonyActive = false;

  /** Show the intro overlay with the given lines, then the name form. */
  function namingCeremony(lines, onNamed) {
    ceremonyActive = true;
    const intro = $("intro");
    const line = $("intro-line");
    const form = $("name-form");
    const skip = $("intro-skip");
    const input = $("name-input");

    intro.classList.remove("hidden", "fading");
    intro.style.opacity = "";
    form.classList.add("hidden");
    form.classList.remove("show");
    skip.classList.remove("hidden");
    input.value = "";

    let step = 0;
    let naming = false;

    function showStep() {
      if (step < lines.length) {
        line.classList.remove("show");
        setTimeout(() => {
          line.textContent = lines[step];
          line.classList.add("show");
        }, 350);
      } else {
        naming = true;
        skip.classList.add("hidden");
        line.classList.remove("show");
        setTimeout(() => {
          line.textContent = "Give it a name.";
          line.classList.add("show");
          form.classList.remove("hidden");
          requestAnimationFrame(() => form.classList.add("show"));
          input.focus();
        }, 350);
      }
    }

    function onClick(e) {
      if (naming) return;
      if (e.target.closest("#name-form")) return;
      step++;
      showStep();
    }

    function confirmName() {
      const name = U.sanitizeName(input.value) || U.pick(["Lumi", "Pip", "Glow", "Nova", "Mo"]);
      cleanup();
      onNamed(name);
    }

    function onKey(e) {
      if (e.key === "Enter") confirmName();
    }

    function cleanup() {
      intro.removeEventListener("click", onClick);
      $("name-ok").removeEventListener("click", confirmName);
      input.removeEventListener("keydown", onKey);
      intro.classList.add("fading");
      setTimeout(() => intro.classList.add("hidden"), 1300);
      ceremonyActive = false;
    }

    intro.addEventListener("click", onClick);
    $("name-ok").addEventListener("click", confirmName);
    input.addEventListener("keydown", onKey);

    // the placeholder shyly suggests names until you start typing
    const suggestions = ["give it a name…", "Lumi?", "Pip?", "Nova?", "Fonkel?", "Momo?", "Glim?", "give it a name…"];
    let sug = 0;
    const sugTimer = setInterval(() => {
      if (!ceremonyActive) { clearInterval(sugTimer); return; }
      if (document.activeElement === input && input.value) return;
      sug = (sug + 1) % suggestions.length;
      input.placeholder = suggestions[sug];
    }, 2200);

    showStep();
  }

  function celebrateNaming(name) {
    W.audio.unlock();
    W.audio.play("levelUp");
    W.ui.setPanelLocked(false);
    W.ui.show();
    W.ui.updateCounters();
    const p = W.scene.wispPos();
    W.particles.burst(p.x, p.y, 40, { speed: 220 });
    W.particles.ring(p.x, p.y, 45, 48);
    setTimeout(() => W.ui.bubble(name + "… I like it.", 3600), 900);
  }

  /** A dream assembled from the things this player actually built. */
  function dreamLine() {
    const S = W.state.S;
    const owned = Object.keys(S.buildings).filter((id) => S.buildings[id] > 0);
    const pool = C.DREAMS.filter((d) => {
      if (d.includes("{b2}") && owned.length < 2) return false;
      if (d.includes("{b1}") && owned.length < 1) return false;
      if (d.includes("{star}") && S.stars.length < 1) return false;
      return true;
    });
    if (pool.length === 0) return null;
    let line = U.pick(pool);
    if (line.includes("{b1}")) {
      const b1 = U.pick(owned);
      line = line.replace("{b1}", C.PLURALS[b1] || b1);
      if (line.includes("{b2}")) {
        const rest = owned.filter((id) => id !== b1);
        line = line.replace("{b2}", C.PLURALS[U.pick(rest)] || "others");
      }
    }
    if (line.includes("{star}")) line = line.replace("{star}", U.pick(S.stars).name);
    return line;
  }

  W.flow = {
    /** After an ascension: welcome the next generation. */
    rebirth(star) {
      setTimeout(() => {
        namingCeremony(rebirthLines(star), (name) => {
          W.state.S.wispName = name;
          W.state.save();
          celebrateNaming(name);
          W.ui.toast("🌠 Generation " + W.state.S.generation, star.name + " is watching from the sky");
          W.ui.renderWispTab();
        });
      }, 1400);
    },
  };

  if (!W.state.S.flags.introDone) {
    namingCeremony(FIRST_LINES, (name) => {
      W.state.S.wispName = name;
      W.state.S.flags.introDone = true;
      W.state.save();
      celebrateNaming(name);
      W.game.maybeDailyGift(); // day 1 starts quietly
    });
  } else {
    $("intro").classList.add("hidden");
    W.ui.show();
    if (W.state.restoredFromBackup) {
      setTimeout(() => {
        W.ui.toast("🕯 Restored from yesterday's backup", "Your save looked damaged — " + (W.state.S.wispName || "your wisp") + " found the way home.");
      }, 1600);
    }
    // gentle note when the game itself has grown since last visit
    if (W.state.S.lastBuild && W.state.S.lastBuild !== C.BUILD) {
      setTimeout(() => W.ui.toast("🌱 The meadow grew while you were away", "WISP " + C.BUILD), 2500);
    }
    W.state.S.lastBuild = C.BUILD;
    // Offline progress
    const off = W.game.computeOffline();
    if (off) {
      W.game.applyOffline(off);
      const name = W.state.S.wispName || "Your wisp";
      const dream = Math.random() < 0.45 ? dreamLine() : null;
      const flavor = dream ? "“" + dream + "”" : U.pick(C.OFFLINE_FLAVOR);
      W.ui.modal(
        "Welcome back",
        `<p>You were away for <b>${U.fmtDuration(off.seconds)}</b>.</p>
         <span class="big-num">+${U.fmt(off.gained)} ✦</span>
         <p>${name} kept gathering light while thinking of you.</p>
         <p class="muted" style="margin-top:8px;font-style:italic">${flavor}</p>
         ${off.cappedSeconds < off.seconds ? `<p class="muted" style="margin-top:8px">(it dozed off after ${off.capHours} hours)</p>` : ""}`,
        [{ label: "I'm home", cls: "btn-primary", fn: () => { W.game.greet(); setTimeout(() => W.game.maybeDailyGift(), 600); } }]
      );
      // long trips earn a burst of saved-up excitement
      if (off.seconds > 12 * 3600) {
        W.state.addBuff("rested", "saved-up excitement", 3, 5 * 60);
      }
    } else {
      setTimeout(() => { W.game.greet(); W.game.maybeDailyGift(); }, 800);
    }
  }

  /* ─────────────── input ─────────────── */

  const canvas = $("world");
  let pressTimer = null;
  let petting = false;
  let downOnWisp = false;
  let lastT = 0; // running time, shared with render loop

  canvas.addEventListener("pointerdown", (e) => {
    W.audio.unlock();
    if (ceremonyActive || W.game.ceremony) return;
    const x = e.clientX, y = e.clientY;
    downOnWisp = W.wisp.hitTest(x, y, lastT);
    petting = false;
    if (downOnWisp) {
      pressTimer = setTimeout(() => {
        petting = true;
        W.wisp.setPetting(true);
      }, 340);
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointerup", (e) => {
    clearTimeout(pressTimer);
    if (ceremonyActive || W.game.ceremony) return;
    if (petting) {
      W.wisp.setPetting(false);
      petting = false;
    } else if (W.game.pendingAscension && e.clientY < window.innerHeight * 0.42) {
      W.game.placeAscension(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    } else if (W.scene.dewHit(e.clientX, e.clientY, lastT)) {
      W.game.catchDew(e.clientX, e.clientY);
    } else if (W.scene.visitorHit(e.clientX, e.clientY, lastT)) {
      W.game.greetVisitor();
    } else if (W.scene.owlHit(e.clientX, e.clientY)) {
      W.game.owlTouched();
    } else if (W.scene.moonHit(e.clientX, e.clientY)) {
      W.game.moonTouched();
    } else if (downOnWisp) {
      W.game.tap(e.clientX, e.clientY);
    } else {
      const star = W.scene.starHit(e.clientX, e.clientY);
      if (star) {
        W.game.starTouched(star);
      } else if (W.scene.cometHit(e.clientX, e.clientY)) {
        W.game.cometWish(e.clientX, e.clientY);
      } else {
        // A tap into the night — a shy sparkle, but light comes from *touch*.
        W.particles.burst(e.clientX, e.clientY, 3, { speed: 60 });
      }
    }
    downOnWisp = false;
  });

  // long-press must pet, not open a context menu
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointercancel", () => {
    clearTimeout(pressTimer);
    if (petting) W.wisp.setPetting(false);
    petting = false;
    downOnWisp = false;
  });

  window.addEventListener("pointermove", (e) => {
    W.wisp.pointerMoved(e.clientX, e.clientY);
  });

  // keyboard: space/enter boops the wisp
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key !== " " && e.key !== "Enter") return;
    if (ceremonyActive || W.game.ceremony) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA") return;
    e.preventDefault();
    const p = W.wisp.pos(lastT);
    W.audio.unlock();
    W.game.tap(p.x, p.y);
  });

  /* ─────────────── debug panel (?debug=1) ───────────────
     For development and for capturing trailer footage. Hidden
     unless explicitly asked for; touches no balance when unused.  */

  if (new URLSearchParams(location.search).has("debug")) {
    const bar = document.createElement("div");
    bar.style.cssText =
      "position:fixed;bottom:0;left:0;z-index:40;display:flex;flex-wrap:wrap;gap:4px;" +
      "padding:6px;background:rgba(10,14,34,0.9);border-top-right-radius:10px;max-width:60vw";
    const tools = {
      "+1h": () => W.game.earn(W.state.lightPerSec() * 3600 + W.state.tapValue() * 500),
      "lvl+5": () => { W.state.S.xp += W.state.xpForLevel(W.state.S.level) * 6; W.game.earn(1); },
      dew: () => W.game.spawnDew(),
      shower: () => W.scene.startShower(20),
      petal: () => W.scene.startPetal(),
      hedgehog: () => W.game.spawnVisitor("hedgehog"),
      fox: () => W.game.spawnVisitor("smokefox"),
      sheep: () => W.game.spawnVisitor("cloudsheep"),
      boat: () => W.game.spawnVisitor("boat"),
      mist: () => W.scene.setWeather("mist"),
      breeze: () => W.scene.setWeather("breeze"),
      snow: () => W.scene.setSeason("winter"),
    };
    for (const [label, fn] of Object.entries(tools)) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "font:11px monospace;padding:4px 7px;background:#232a52;color:#cdd6ff;border:0;border-radius:6px;cursor:pointer";
      b.addEventListener("click", fn);
      bar.appendChild(b);
    }
    document.body.appendChild(bar);
  }

  /* ─────────────── PWA ─────────────── */

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ─────────────── save on leave ─────────────── */

  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      W.state.save();
    } else if (hiddenAt) {
      // rAF sleeps in hidden tabs — pay out the missed passive income
      const sec = (Date.now() - hiddenAt) / 1000;
      hiddenAt = null;
      if (sec > 5) {
        const gained = W.state.lightPerSec() * sec;
        if (gained > 0) {
          W.game.earn(gained);
          if (sec > 60) {
            W.ui.toast("✦ +" + U.fmt(gained), "gathered while this tab dozed (" + U.fmtDuration(sec) + ")");
          }
        }
      }
    }
  });
  window.addEventListener("beforeunload", () => W.state.save());

  /* ─────────────── loop ─────────────── */

  let last = performance.now();
  let uiTimer = 0;

  function frame(now) {
    // clamp both ways: timer anomalies must never produce negative dt
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    lastT += dt;

    W.game.tick(dt);
    W.scene.draw(lastT, dt);

    uiTimer += dt;
    if (uiTimer >= 0.15) {
      uiTimer = 0;
      W.ui.updateCounters();
      W.ui.updateShop();
      W.ui.updateBoosts();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
