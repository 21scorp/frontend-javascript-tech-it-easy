/* ═══════════════════════════════════════════════════════════════
   COVE — audio.js — tiny WebAudio synth, no files.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  let ctx = null, master = null, enabled = true;

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

  function tone(freq, { dur = 0.16, type = "sine", vol = 0.14, delay = 0, slide = 0 } = {}) {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const sfx = {
    catch() { tone(660, { dur: 0.1, vol: 0.1, type: "triangle", slide: 160 }); },
    chop() { tone(180, { dur: 0.08, vol: 0.14, type: "square", slide: -60 }); },
    sell() { tone(523, { dur: 0.14, vol: 0.12, type: "triangle" }); tone(784, { dur: 0.22, vol: 0.12, type: "triangle", delay: 0.08 }); },
    level() { [523, 659, 784, 1046].forEach((f, i) => tone(f, { dur: 0.3, vol: 0.12, type: "triangle", delay: i * 0.09 })); },
    bite() { tone(1100, { dur: 0.1, vol: 0.12, type: "sine", slide: 260 }); },
    bonus() { tone(880, { dur: 0.12, vol: 0.13, type: "triangle" }); tone(1318, { dur: 0.2, vol: 0.11, type: "triangle", delay: 0.07 }); },
    buy() { tone(392, { dur: 0.14, vol: 0.11 }); tone(523, { dur: 0.2, vol: 0.11, delay: 0.07 }); },
    denied() { tone(180, { dur: 0.12, vol: 0.08, slide: -40 }); },
  };

  W.audio = {
    play(n) { if (sfx[n]) sfx[n](); },
    setEnabled(on) { enabled = on; },
    get enabled() { return enabled; },
    unlock() { ensure(); },
  };
})();
