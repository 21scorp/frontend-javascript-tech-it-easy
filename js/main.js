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
      const raw = input.value.trim();
      const name = raw.length ? raw : U.pick(["Lumi", "Pip", "Glow", "Nova", "Mo"]);
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

    showStep();
  }

  function celebrateNaming(name) {
    W.audio.unlock();
    W.audio.play("levelUp");
    W.ui.show();
    W.ui.updateCounters();
    const p = W.scene.wispPos();
    W.particles.burst(p.x, p.y, 40, { speed: 220 });
    setTimeout(() => W.ui.bubble(name + "… I like it.", 3600), 900);
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
    // Offline progress
    const off = W.game.computeOffline();
    if (off) {
      W.game.applyOffline(off);
      const name = W.state.S.wispName || "Your wisp";
      W.ui.modal(
        "Welcome back",
        `<p>You were away for <b>${U.fmtDuration(off.seconds)}</b>.</p>
         <span class="big-num">+${U.fmt(off.gained)} ✦</span>
         <p>${name} kept gathering light while thinking of you.</p>
         <p class="muted" style="margin-top:8px;font-style:italic">${U.pick(C.OFFLINE_FLAVOR)}</p>
         ${off.cappedSeconds < off.seconds ? `<p class="muted" style="margin-top:8px">(it dozed off after ${C.OFFLINE.capHours} hours)</p>` : ""}`,
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
    } else if (W.scene.dewHit(e.clientX, e.clientY, lastT)) {
      W.game.catchDew(e.clientX, e.clientY);
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

  /* ─────────────── PWA ─────────────── */

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ─────────────── save on leave ─────────────── */

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") W.state.save();
  });
  window.addEventListener("beforeunload", () => W.state.save());

  /* ─────────────── loop ─────────────── */

  let last = performance.now();
  let uiTimer = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
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
