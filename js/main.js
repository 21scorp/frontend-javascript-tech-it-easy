/* ═══════════════════════════════════════════════════════════════
   WISP — main.js
   Boot, intro & naming, input handling, the render loop.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;
  const $ = (id) => document.getElementById(id);

  /* ─────────────── boot ─────────────── */

  const hadSave = W.state.load();
  W.audio.setEnabled(W.state.S.settings.sound);

  W.ui.init();
  W.scene.init($("world"));
  W.ui.renderBuildTab();
  W.ui.renderBoostsTab();
  W.ui.renderWispTab();
  W.ui.updateCounters();

  /* ─────────────── intro / naming ─────────────── */

  const INTRO_LINES = [
    "In the dark between the hills,\nsomething small is falling…",
    "It lands softly in your hands.\nWarm. Barely glowing.",
    "It looks up at you.",
  ];

  function runIntro() {
    const intro = $("intro");
    const line = $("intro-line");
    const form = $("name-form");
    const skip = $("intro-skip");
    let step = 0;
    let naming = false;

    function showStep() {
      if (step < INTRO_LINES.length) {
        line.classList.remove("show");
        setTimeout(() => {
          line.textContent = INTRO_LINES[step];
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
          $("name-input").focus();
        }, 350);
      }
    }

    intro.addEventListener("click", (e) => {
      if (naming) return;
      if (e.target.closest("#name-form")) return;
      step++;
      showStep();
    });

    function confirmName() {
      const raw = $("name-input").value.trim();
      const name = raw.length ? raw : U.pick(["Lumi", "Pip", "Glow", "Nova", "Mo"]);
      W.state.S.wispName = name;
      W.state.S.flags.introDone = true;
      W.state.save();
      W.audio.unlock();
      W.audio.play("levelUp");
      endIntro(true);
    }

    $("name-ok").addEventListener("click", confirmName);
    $("name-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmName();
    });

    showStep();
  }

  function endIntro(celebrate) {
    const intro = $("intro");
    intro.classList.add("fading");
    setTimeout(() => intro.remove(), 1300);
    W.ui.show();
    W.ui.updateCounters();
    if (celebrate) {
      const p = W.scene.wispPos();
      W.particles.burst(p.x, p.y, 40, { speed: 220 });
      setTimeout(() => {
        W.ui.bubble(W.state.S.wispName + "… I like it.", 3600);
      }, 900);
    }
  }

  if (!W.state.S.flags.introDone) {
    runIntro();
  } else {
    $("intro").remove();
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
         ${off.cappedSeconds < off.seconds ? `<p class="muted" style="margin-top:8px">(it dozed off after ${C.OFFLINE.capHours} hours)</p>` : ""}`,
        [{ label: "I'm home", cls: "btn-primary", fn: () => W.game.greet() }]
      );
    } else {
      setTimeout(() => W.game.greet(), 800);
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
    if (petting) {
      W.wisp.setPetting(false);
      petting = false;
    } else if (downOnWisp) {
      W.game.tap(e.clientX, e.clientY);
    } else {
      // A tap into the night — a shy sparkle, but light comes from *touch*.
      W.particles.burst(e.clientX, e.clientY, 3, { speed: 60 });
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
