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
  let ambience = null;      // {windGain, cricketTimer, nodes[]}
  let ambienceWanted = false;
  let musicTimer = null;    // music box scheduler
  let musicWanted = false;
  let musicStep = 2;        // random-walk position in the scale

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
    evolve() {
      // a longer fanfare: rise, shimmer, settle
      [392, 523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
        tone(f, { dur: 0.4, vol: 0.12, type: "triangle", delay: i * 0.11 })
      );
      [2093, 2637, 3136].forEach((f, i) =>
        tone(f, { dur: 0.5, vol: 0.05, type: "sine", delay: 0.8 + i * 0.07 })
      );
      tone(523.25, { dur: 1.2, vol: 0.08, type: "sine", delay: 1.1 });
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

  /* ─────────────── night ambience ───────────────
     A whisper of wind and the occasional cricket. All synthesized. */

  function startAmbience() {
    if (ambience || !enabled || !ensure()) return;
    // wind: looped noise through a slow-breathing lowpass
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 240;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.018;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain).connect(windGain.gain);
    src.connect(lp).connect(windGain).connect(master);
    src.start();
    lfo.start();

    // crickets: soft, sparse chirps
    const cricketTimer = setInterval(() => {
      if (!enabled || document.visibilityState !== "visible") return;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        tone(4200 + Math.random() * 400, { dur: 0.045, vol: 0.012, type: "sine", delay: i * 0.09 });
      }
    }, 4000 + Math.random() * 5000);

    ambience = { cricketTimer, nodes: [src, lfo] };
  }

  function stopAmbience() {
    if (!ambience) return;
    clearInterval(ambience.cricketTimer);
    for (const n of ambience.nodes) { try { n.stop(); } catch (e) {} }
    ambience = null;
  }

  /* ─────────────── music box ───────────────
     A slow generative lullaby: a random walk over the pentatonic
     scale, sparse enough to stay behind the game, never repeat.     */

  function startMusicBox() {
    if (musicTimer || !enabled || !ensure()) return;
    const step = () => {
      if (enabled && document.visibilityState === "visible") {
        // wander the scale, leaning back toward the middle
        const drift = W.util.pick([-2, -1, -1, 1, 1, 2]) + (musicStep > 4 ? -1 : musicStep < 2 ? 1 : 0);
        musicStep = Math.max(0, Math.min(SCALE.length - 1, musicStep + drift));
        const f = SCALE[musicStep] / 2; // an octave down: soft and low
        tone(f, { dur: 1.6, vol: 0.05, type: "sine" });
        tone(f * 2, { dur: 1.2, vol: 0.018, type: "sine", delay: 0.02 });
        // occasional gentle third
        if (Math.random() < 0.3) {
          const h = SCALE[Math.min(musicStep + 2, SCALE.length - 1)] / 2;
          tone(h, { dur: 1.5, vol: 0.03, type: "sine", delay: 0.4 });
        }
      }
      musicTimer = setTimeout(step, 1400 + Math.random() * 1800);
    };
    musicTimer = setTimeout(step, 600);
  }

  function stopMusicBox() {
    clearTimeout(musicTimer);
    musicTimer = null;
  }

  W.audio = {
    play(name) { if (sfx[name]) sfx[name](); },
    setEnabled(on) {
      enabled = on;
      if (!on) { stopAmbience(); stopMusicBox(); }
      else {
        if (ambienceWanted) startAmbience();
        if (musicWanted) startMusicBox();
      }
    },
    get enabled() { return enabled; },
    setAmbience(on) {
      ambienceWanted = on;
      if (on) startAmbience(); else stopAmbience();
    },
    setMusic(on) {
      musicWanted = on;
      if (on) startMusicBox(); else stopMusicBox();
    },
    /** Must be called from a user gesture once to unlock audio on mobile. */
    unlock() {
      ensure();
      if (ambienceWanted && !ambience) startAmbience();
      if (musicWanted && !musicTimer) startMusicBox();
    },
  };
})();
