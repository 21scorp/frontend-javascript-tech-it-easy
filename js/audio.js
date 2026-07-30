/* ═══════════════════════════════════════════════════════════════
   WISP — audio.js
   All sound is synthesized with WebAudio. No files, no sprites,
   just warm little tones.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  let ctx = null;
  let master = null;
  let enabled = true;
  let tapStep = 0;
  let tapStepResetTimer = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  /** One soft synthesized note. */
  function tone(freq, { dur = 0.18, type = "sine", vol = 0.18, delay = 0, slide = 0 } = {}) {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* Pentatonic scale keeps every combination of notes pleasant. */
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5];

  const sfx = {
    /** Tap: rises through a pentatonic run as you tap quickly. */
    tap() {
      const note = SCALE[Math.min(tapStep, SCALE.length - 1)];
      tone(note, { dur: 0.12, vol: 0.1, type: "triangle" });
      tapStep = Math.min(tapStep + 1, SCALE.length - 1);
      clearTimeout(tapStepResetTimer);
      tapStepResetTimer = setTimeout(() => { tapStep = 0; }, 700);
    },
    crit() {
      tone(1046.5, { dur: 0.3, vol: 0.16, type: "triangle" });
      tone(1318.5, { dur: 0.34, vol: 0.12, type: "sine", delay: 0.05 });
      tone(1568.0, { dur: 0.4, vol: 0.1, type: "sine", delay: 0.1 });
    },
    buy() {
      tone(392.0, { dur: 0.16, vol: 0.12, type: "sine" });
      tone(523.25, { dur: 0.22, vol: 0.12, type: "sine", delay: 0.07 });
    },
    upgrade() {
      tone(523.25, { dur: 0.15, vol: 0.13, type: "triangle" });
      tone(659.25, { dur: 0.15, vol: 0.13, type: "triangle", delay: 0.08 });
      tone(783.99, { dur: 0.3, vol: 0.13, type: "triangle", delay: 0.16 });
    },
    levelUp() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone(f, { dur: 0.34, vol: 0.13, type: "triangle", delay: i * 0.09 })
      );
    },
    achievement() {
      tone(880, { dur: 0.14, vol: 0.11, type: "sine" });
      tone(1174.7, { dur: 0.3, vol: 0.11, type: "sine", delay: 0.09 });
    },
    denied() {
      tone(196, { dur: 0.12, vol: 0.07, type: "sine", slide: -40 });
    },
    chirp() {
      // Little wisp voice — a happy warble.
      tone(W.util.rand(900, 1200), { dur: 0.1, vol: 0.07, type: "sine", slide: 220 });
      tone(W.util.rand(1100, 1400), { dur: 0.12, vol: 0.06, type: "sine", slide: 180, delay: 0.09 });
    },
  };

  W.audio = {
    play(name) { if (sfx[name]) sfx[name](); },
    setEnabled(on) { enabled = on; },
    get enabled() { return enabled; },
    /** Must be called from a user gesture once to unlock audio on mobile. */
    unlock() { ensure(); },
  };
})();
