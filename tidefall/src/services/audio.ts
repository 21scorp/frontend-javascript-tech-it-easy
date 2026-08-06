/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/audio.ts
   Mobile audio is mostly a list of platform bugs. This file is the
   list, handled once:

     • iOS/Android will not start an AudioContext outside a real user
       gesture, and the gesture you get is the *first* one — miss it
       and the game is silent for the whole session. So we arm a
       one-shot unlock on every plausible first-gesture event, and
       re-resume on visibility return (backgrounding suspends it).
     • A tycoon game plays the same "coin" sample hundreds of times a
       minute. Played identically it becomes a machine gun, so every
       one-shot gets deterministic-but-varied pitch and gain, plus a
       retrigger throttle and a voice cap per sound.
     • Music that hard-cuts between zones feels cheap. We run a bed
       plus stems, all started together and volume-crossfaded, so
       intensity/zone changes are seamless and always in phase.
     • A modal opening over loud music is unreadable, so the mixer
       has a duck bus that everything routes through.

   NO AUDIO FILES EXIST YET. Rather than ship silence, every SFX has
   a synth spec and the service falls back to generating the sound
   with WebAudio. Drop the real files in (see AUDIO_ASSET_MANIFEST at
   the bottom) and they take over with no code change.

   Howler is used for file playback because it handles the sprite/
   pooling/format-fallback mess; the synth path is plain WebAudio.
   ═══════════════════════════════════════════════════════════════ */

import { Howl, Howler } from "howler";
import type { EventBus } from "../core/contracts";
import { clamp, makeRng, realTimers, smoothstep } from "./timing";
import type { TimerApi } from "./timing";

/* ── mixer ───────────────────────────────────────────────────── */

export type AudioCategory = "music" | "sfx" | "ui";
export const AUDIO_CATEGORIES: readonly AudioCategory[] = ["music", "sfx", "ui"];

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 1,
  music: 0.55,
  sfx: 0.8,
  ui: 0.7,
  muted: false,
};

/** Tiny persistence seam — localStorage by default, SaveService later. */
export interface SettingsStore {
  read(): Partial<AudioSettings> | null;
  write(v: AudioSettings): void;
}

export function localSettingsStore(key = "tidefall:audio"): SettingsStore {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as Partial<AudioSettings>) : null;
      } catch {
        return null;
      }
    },
    write(v) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* private mode — volume just won't persist */
      }
    },
  };
}

export function memorySettingsStore(seed?: Partial<AudioSettings>): SettingsStore {
  let held: Partial<AudioSettings> | null = seed ?? null;
  return {
    read: () => held,
    write: (v) => {
      held = v;
    },
  };
}

/**
 * The whole volume rule in one pure function, so it can be tested and
 * so nothing anywhere else multiplies gains ad hoc.
 */
export function resolveGain(
  settings: AudioSettings,
  category: AudioCategory,
  base: number,
  duck: number,
): number {
  if (settings.muted) return 0;
  // UI stays audible under a duck — it is the feedback for the very
  // action that caused the duck.
  const ducked = category === "ui" ? 1 : duck;
  return clamp(settings.master * settings[category] * base * ducked, 0, 1);
}

/* ── sfx + music definitions ─────────────────────────────────── */

export interface SynthSpec {
  wave?: OscillatorType;
  /** Start frequency in Hz. */
  freq: number;
  /** Glide target; omit for a steady tone. */
  freqEnd?: number;
  /** Seconds. */
  dur: number;
  attack?: number;
  release?: number;
  gain?: number;
  /** 0..1 white-noise blend — the difference between a "ping" and a "chop". */
  noise?: number;
  /** Adds an octave-ish partial for a chime/coin character. */
  harmonic?: number;
  /** Low-pass cutoff in Hz; keeps square/saw from being ice picks. */
  lowpass?: number;
}

export interface SfxDef {
  /** Basename under assets/audio/sfx/. Absent = synth only, for now. */
  file?: string;
  category?: AudioCategory;
  /** Base gain before the mixer. */
  volume?: number;
  /** ± playback-rate wobble. 0.08 = ±8%. */
  rateJitter?: number;
  /** ± gain wobble. */
  volumeJitter?: number;
  /** Max simultaneous voices; older voices are dropped, not queued. */
  poolSize?: number;
  /** Minimum ms between retriggers of this exact sound. */
  throttleMs?: number;
  synth?: SynthSpec;
}

export interface MusicStemDef {
  id: string;
  file?: string;
  /** Intensity at which this stem is fully in. Fades over ±0.15. */
  at: number;
  synth?: SynthSpec;
}

export interface MusicTrackDef {
  id: string;
  bed?: string;
  bedSynth?: SynthSpec;
  stems: MusicStemDef[];
}

export interface AudioManifest {
  sfx: Record<string, SfxDef>;
  music: Record<string, MusicTrackDef>;
  /** Zone id → track id. */
  zones?: Record<string, string>;
}

/* ── the placeholder soundtrack ──────────────────────────────── */

/**
 * Every sound the game currently asks for, as a synth recipe. These are
 * intentionally short and dry — they should read as "temp audio", never
 * be mistaken for final, and never mask a missing file.
 */
export const PLACEHOLDER_MANIFEST: AudioManifest = {
  sfx: {
    "ui.tap":       { category: "ui",  volume: 0.5, throttleMs: 30, synth: { wave: "sine", freq: 880, freqEnd: 1180, dur: 0.06, gain: 0.5, attack: 0.002, release: 0.05 } },
    "ui.back":      { category: "ui",  volume: 0.5, synth: { wave: "sine", freq: 660, freqEnd: 420, dur: 0.09, gain: 0.5 } },
    "ui.open":      { category: "ui",  volume: 0.55, synth: { wave: "triangle", freq: 520, freqEnd: 900, dur: 0.14, gain: 0.5, harmonic: 1.5 } },
    "ui.close":     { category: "ui",  volume: 0.55, synth: { wave: "triangle", freq: 900, freqEnd: 480, dur: 0.12, gain: 0.5 } },
    "ui.error":     { category: "ui",  volume: 0.6, synth: { wave: "square", freq: 200, freqEnd: 140, dur: 0.18, gain: 0.35, lowpass: 1400 } },
    "ui.purchase":  { category: "ui",  volume: 0.7, synth: { wave: "sine", freq: 740, freqEnd: 1320, dur: 0.22, gain: 0.55, harmonic: 2 } },

    "gather.chop":  { volume: 0.8, rateJitter: 0.12, poolSize: 4, throttleMs: 60, synth: { wave: "square", freq: 180, freqEnd: 90, dur: 0.13, noise: 0.7, gain: 0.6, lowpass: 2200 } },
    "gather.mine":  { volume: 0.85, rateJitter: 0.14, poolSize: 4, throttleMs: 60, synth: { wave: "square", freq: 260, freqEnd: 110, dur: 0.15, noise: 0.55, gain: 0.6, lowpass: 3000 } },
    "gather.fish":  { volume: 0.7, rateJitter: 0.1, poolSize: 3, synth: { wave: "sine", freq: 420, freqEnd: 220, dur: 0.25, noise: 0.35, gain: 0.5, lowpass: 1800 } },
    "gather.catch": { volume: 0.85, synth: { wave: "sine", freq: 520, freqEnd: 980, dur: 0.3, gain: 0.6, harmonic: 1.5 } },
    "gather.fail":  { volume: 0.6, synth: { wave: "triangle", freq: 300, freqEnd: 180, dur: 0.16, noise: 0.2, gain: 0.4 } },

    "item.pickup":  { volume: 0.6, rateJitter: 0.18, poolSize: 6, throttleMs: 40, synth: { wave: "sine", freq: 980, freqEnd: 1460, dur: 0.09, gain: 0.45, harmonic: 2 } },
    "item.coin":    { volume: 0.65, rateJitter: 0.16, poolSize: 6, throttleMs: 40, synth: { wave: "sine", freq: 1180, freqEnd: 1760, dur: 0.11, gain: 0.45, harmonic: 2.02 } },
    "item.craft":   { volume: 0.8, synth: { wave: "triangle", freq: 340, freqEnd: 720, dur: 0.34, gain: 0.55, harmonic: 1.5 } },
    "item.equip":   { volume: 0.7, synth: { wave: "square", freq: 620, freqEnd: 420, dur: 0.1, noise: 0.3, gain: 0.4, lowpass: 3200 } },

    "combat.hit":   { volume: 0.85, rateJitter: 0.15, poolSize: 5, throttleMs: 40, synth: { wave: "square", freq: 220, freqEnd: 80, dur: 0.12, noise: 0.6, gain: 0.6, lowpass: 2400 } },
    "combat.crit":  { volume: 0.95, rateJitter: 0.08, poolSize: 3, synth: { wave: "sawtooth", freq: 320, freqEnd: 90, dur: 0.2, noise: 0.5, gain: 0.7, lowpass: 2800 } },
    "combat.block": { volume: 0.8, rateJitter: 0.12, poolSize: 4, synth: { wave: "square", freq: 900, freqEnd: 500, dur: 0.09, noise: 0.45, gain: 0.5, lowpass: 5000 } },
    "combat.death": { volume: 0.9, synth: { wave: "sawtooth", freq: 260, freqEnd: 60, dur: 0.5, noise: 0.4, gain: 0.6, lowpass: 1600 } },

    "build.place":  { volume: 0.8, rateJitter: 0.1, synth: { wave: "square", freq: 150, freqEnd: 70, dur: 0.16, noise: 0.5, gain: 0.55, lowpass: 1200 } },
    "build.upgrade":{ volume: 0.9, synth: { wave: "sine", freq: 420, freqEnd: 1120, dur: 0.45, gain: 0.6, harmonic: 1.5 } },

    "reward.levelup": { volume: 1, synth: { wave: "sine", freq: 523, freqEnd: 1568, dur: 0.6, gain: 0.65, harmonic: 2 } },
    "reward.quest":   { volume: 0.9, synth: { wave: "triangle", freq: 660, freqEnd: 1320, dur: 0.5, gain: 0.6, harmonic: 1.5 } },
  },
  music: {
    "isle.day": {
      bedSynth: { wave: "sine", freq: 110, dur: 4, gain: 0.18, lowpass: 700 },
      stems: [
        { id: "warmth", at: 0.3, synth: { wave: "triangle", freq: 220, dur: 4, gain: 0.14, lowpass: 1200 } },
        { id: "drive", at: 0.65, synth: { wave: "sawtooth", freq: 165, dur: 4, gain: 0.1, lowpass: 900 } },
        { id: "shimmer", at: 0.9, synth: { wave: "sine", freq: 440, dur: 4, gain: 0.08, harmonic: 1.5 } },
      ],
      id: "isle.day",
    },
    "isle.night": {
      id: "isle.night",
      bedSynth: { wave: "sine", freq: 82, dur: 4, gain: 0.16, lowpass: 500 },
      stems: [
        { id: "warmth", at: 0.35, synth: { wave: "triangle", freq: 165, dur: 4, gain: 0.12, lowpass: 900 } },
        { id: "drive", at: 0.7, synth: { wave: "sawtooth", freq: 123, dur: 4, gain: 0.09, lowpass: 800 } },
      ],
    },
    "depths": {
      id: "depths",
      bedSynth: { wave: "sine", freq: 65, dur: 4, gain: 0.2, lowpass: 400 },
      stems: [
        { id: "tension", at: 0.4, synth: { wave: "sawtooth", freq: 98, dur: 4, gain: 0.12, lowpass: 700 } },
        { id: "danger", at: 0.75, synth: { wave: "square", freq: 147, dur: 4, gain: 0.08, lowpass: 600 } },
      ],
    },
  },
  zones: {
    isle: "isle.day",
    isle_night: "isle.night",
    mine: "depths",
    depths: "depths",
  },
};

/* ── synth engine ────────────────────────────────────────────── */

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
  createBuffer(channels: number, length: number, rate: number): AudioBuffer;
  createBiquadFilter(): BiquadFilterNode;
  readonly sampleRate: number;
  resume(): Promise<void>;
}

/**
 * Builds a short one-shot out of oscillators + noise. Cheap enough to
 * fire dozens of times a second; every voice tears itself down on end.
 */
export class SynthEngine {
  private noiseBuffer: AudioBuffer | null = null;
  private live = 0;

  constructor(
    private readonly ctx: AudioContextLike,
    private readonly out: AudioNode,
    /** Hard cap so a runaway emitter can't stall the audio thread. */
    private readonly maxVoices = 24,
  ) {}

  get liveVoices(): number {
    return this.live;
  }

  private noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rng = makeRng(0x71de5a11);
    for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  play(spec: SynthSpec, gain: number, rate = 1): void {
    if (this.live >= this.maxVoices) return;
    const t0 = this.ctx.currentTime;
    const dur = Math.max(0.02, spec.dur / Math.max(0.1, rate));
    const attack = Math.min(spec.attack ?? 0.005, dur * 0.5);
    const release = Math.min(spec.release ?? dur * 0.7, dur);
    const peak = clamp(gain * (spec.gain ?? 0.5), 0, 1);
    if (peak <= 0) return;

    // Exponential ramps only — a linear fade to zero on a short one-shot
    // clicks audibly on phone speakers.
    const env = this.ctx.createGain();
    const top = Math.max(peak, 0.0002);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(top, t0 + attack);
    env.gain.setValueAtTime(top, t0 + Math.max(attack, dur - release));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let tail: AudioNode = env;
    if (spec.lowpass) {
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(spec.lowpass, t0);
      env.connect(filt);
      tail = filt;
    }
    tail.connect(this.out);

    const stops: AudioScheduledSourceNode[] = [];
    const noiseMix = clamp(spec.noise ?? 0, 0, 1);

    if (noiseMix < 1) {
      const osc = this.ctx.createOscillator();
      osc.type = spec.wave ?? "sine";
      const f0 = Math.max(20, spec.freq * rate);
      osc.frequency.setValueAtTime(f0, t0);
      if (spec.freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd * rate), t0 + dur);
      }
      const g = this.ctx.createGain();
      g.gain.value = 1 - noiseMix;
      osc.connect(g).connect(env);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      stops.push(osc);

      if (spec.harmonic) {
        const h = this.ctx.createOscillator();
        h.type = spec.wave ?? "sine";
        h.frequency.setValueAtTime(f0 * spec.harmonic, t0);
        if (spec.freqEnd) {
          h.frequency.exponentialRampToValueAtTime(
            Math.max(20, spec.freqEnd * rate * spec.harmonic),
            t0 + dur,
          );
        }
        const hg = this.ctx.createGain();
        hg.gain.value = (1 - noiseMix) * 0.35;
        h.connect(hg).connect(env);
        h.start(t0);
        h.stop(t0 + dur + 0.02);
        stops.push(h);
      }
    }

    if (noiseMix > 0) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise();
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = noiseMix;
      src.connect(g).connect(env);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
      stops.push(src);
    }

    this.live++;
    const last: AudioScheduledSourceNode | undefined = stops[stops.length - 1];
    if (last) {
      last.onended = () => {
        this.live = Math.max(0, this.live - 1);
        try {
          tail.disconnect();
          env.disconnect();
        } catch {
          /* already torn down */
        }
      };
    } else {
      this.live = Math.max(0, this.live - 1);
    }
  }
}

/* ── service ─────────────────────────────────────────────────── */

export interface AudioServiceOptions {
  manifest?: AudioManifest;
  bus?: EventBus;
  store?: SettingsStore;
  timers?: TimerApi;
  now?: () => number;
  /** Where SFX files live. */
  sfxBase?: string;
  musicBase?: string;
  /** File extensions offered to Howler, best first. */
  formats?: string[];
  /** Injected for tests / to force the synth path. */
  createContext?: () => AudioContextLike | null;
  createHowl?: (src: string[], loop: boolean, volume: number) => Howl | null;
  /** Force placeholders even if files exist. Handy for audio review. */
  forceSynth?: boolean;
  logger?: Pick<Console, "warn" | "info">;
  /** Seed for the pitch/gain variation RNG — fixed makes tests exact. */
  seed?: number;
}

interface Voice {
  howl: Howl;
  id: number;
}

interface SfxRuntime {
  def: SfxDef;
  howl: Howl | null;
  voices: Voice[];
  lastPlayed: number;
}

interface MusicLayer {
  id: string;
  howl: Howl | null;
  synth: SynthSpec | null;
  /** 0..1 target within the music bus. */
  target: number;
  current: number;
  at: number;
}

export class AudioService {
  private readonly manifest: AudioManifest;
  private readonly bus?: EventBus;
  private readonly store: SettingsStore;
  private readonly timers: TimerApi;
  private readonly now: () => number;
  private readonly sfxBase: string;
  private readonly musicBase: string;
  private readonly formats: string[];
  private readonly log: Pick<Console, "warn" | "info">;
  private readonly forceSynth: boolean;
  private readonly createContext: () => AudioContextLike | null;
  private readonly createHowl: (src: string[], loop: boolean, volume: number) => Howl | null;
  private readonly rng: () => number;

  private settings: AudioSettings;
  private duck = 1;
  private duckDepth = 0.3;
  private modalDepth = 0;
  private unlocked = false;
  private ctx: AudioContextLike | null = null;
  private synth: SynthEngine | null = null;
  private synthBus: GainNode | null = null;

  private readonly sfx = new Map<string, SfxRuntime>();
  private layers: MusicLayer[] = [];
  private currentTrack: string | null = null;
  private intensity = 0;
  private fadeHandle: number | null = null;
  private disposers: (() => void)[] = [];
  private missingWarned = new Set<string>();

  constructor(opts: AudioServiceOptions = {}) {
    this.manifest = opts.manifest ?? PLACEHOLDER_MANIFEST;
    this.bus = opts.bus;
    this.store = opts.store ?? memorySettingsStore();
    this.timers = opts.timers ?? realTimers;
    this.now = opts.now ?? (() => Date.now());
    this.sfxBase = opts.sfxBase ?? "assets/audio/sfx/";
    this.musicBase = opts.musicBase ?? "assets/audio/music/";
    this.formats = opts.formats ?? ["webm", "mp3"];
    this.log = opts.logger ?? console;
    this.forceSynth = opts.forceSynth ?? false;
    this.rng = makeRng(opts.seed ?? 0x71defa11);
    this.createContext = opts.createContext ?? defaultContextFactory;
    this.createHowl =
      opts.createHowl ??
      ((src, loop, volume) => {
        try {
          return new Howl({ src, loop, volume, html5: false, preload: true });
        } catch {
          return null;
        }
      });

    this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...(this.store.read() ?? {}) };
    this.applyMasterToHowler();
  }

  /* ── settings ───────────────────────────────────────────────── */

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setVolume(category: AudioCategory | "master", value: number): void {
    const next: AudioSettings = { ...this.settings };
    next[category] = clamp(value, 0, 1);
    this.settings = next;
    this.store.write(this.settings);
    this.applyMasterToHowler();
    this.refreshMusicGains(0);
    this.bus?.emit("audio:settings", this.getSettings());
  }

  setMuted(muted: boolean): void {
    this.settings = { ...this.settings, muted };
    this.store.write(this.settings);
    this.applyMasterToHowler();
    this.refreshMusicGains(0);
    this.bus?.emit("audio:settings", this.getSettings());
  }

  private applyMasterToHowler(): void {
    try {
      Howler.volume(this.settings.muted ? 0 : this.settings.master);
    } catch {
      /* Howler not initialised in this environment */
    }
    if (this.synthBus) {
      this.synthBus.gain.value = this.settings.muted ? 0 : this.settings.master;
    }
  }

  /* ── unlock ─────────────────────────────────────────────────── */

  /**
   * Arms the one-shot gesture unlock. Safe to call before the first
   * frame; resolves the moment the player touches anything.
   */
  armUnlock(target: EventTarget = window): void {
    if (this.unlocked) return;
    const events = ["pointerdown", "touchend", "click", "keydown"];
    const fire = () => {
      void this.unlock();
      for (const e of events) target.removeEventListener(e, fire);
    };
    for (const e of events) target.addEventListener(e, fire, { once: true, passive: true });
    this.disposers.push(() => {
      for (const e of events) target.removeEventListener(e, fire);
    });

    // Backgrounding suspends the context on iOS; resume on the way back.
    if (typeof document !== "undefined") {
      const onVis = () => {
        if (document.visibilityState === "visible" && this.unlocked) void this.resume();
      };
      document.addEventListener("visibilitychange", onVis);
      this.disposers.push(() => document.removeEventListener("visibilitychange", onVis));
    }
  }

  async unlock(): Promise<boolean> {
    if (this.unlocked) return true;
    this.ensureContext();
    await this.resume();
    this.unlocked = true;
    this.bus?.emit("audio:unlocked", { synth: this.usingSynth() });
    return true;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** True when placeholder tones are in play because no files shipped. */
  usingSynth(): boolean {
    return this.forceSynth || this.synth !== null;
  }

  private async resume(): Promise<void> {
    try {
      const hctx = (Howler as unknown as { ctx?: { state: string; resume(): Promise<void> } }).ctx;
      if (hctx && hctx.state !== "running") await hctx.resume();
    } catch {
      /* nothing to resume */
    }
    try {
      if (this.ctx && this.ctx.state !== "running") await this.ctx.resume();
    } catch {
      /* nothing to resume */
    }
  }

  private ensureContext(): SynthEngine | null {
    if (this.synth) return this.synth;
    const ctx = this.createContext();
    if (!ctx) return null;
    this.ctx = ctx;
    const bus = ctx.createGain();
    bus.gain.value = this.settings.muted ? 0 : this.settings.master;
    bus.connect(ctx.destination);
    this.synthBus = bus;
    this.synth = new SynthEngine(ctx, bus);
    return this.synth;
  }

  /* ── sfx ────────────────────────────────────────────────────── */

  private runtime(name: string): SfxRuntime | null {
    const cached = this.sfx.get(name);
    if (cached) return cached;
    const def = this.manifest.sfx[name];
    if (!def) {
      if (!this.missingWarned.has(name)) {
        this.missingWarned.add(name);
        this.log.warn(`[audio] unknown sfx "${name}" — nothing will play`);
      }
      return null;
    }
    let howl: Howl | null = null;
    if (def.file && !this.forceSynth) {
      howl = this.createHowl(
        this.formats.map((f) => `${this.sfxBase}${def.file}.${f}`),
        false,
        1,
      );
    }
    const rt: SfxRuntime = { def, howl, voices: [], lastPlayed: -Infinity };
    this.sfx.set(name, rt);
    return rt;
  }

  /**
   * Fire-and-forget one-shot. Returns false when it was throttled,
   * voice-capped or muted — callers can use that to skip a particle
   * burst too, keeping audio and VFX in agreement.
   */
  playSfx(name: string, opts: { volume?: number; rate?: number } = {}): boolean {
    const rt = this.runtime(name);
    if (!rt) return false;
    const def = rt.def;
    const t = this.now();
    const throttle = def.throttleMs ?? 0;
    if (throttle > 0 && t - rt.lastPlayed < throttle) return false;

    const category = def.category ?? "sfx";
    const rateJitter = def.rateJitter ?? 0.08;
    const volJitter = def.volumeJitter ?? 0.1;
    // Deterministic wobble: same seed → same sequence, so a test can
    // assert "no two consecutive plays are identical".
    const rate = (opts.rate ?? 1) * (1 + (this.rng() * 2 - 1) * rateJitter);
    const varyVol = (def.volume ?? 1) * (1 + (this.rng() * 2 - 1) * volJitter);
    const gain = resolveGain(this.settings, category, (opts.volume ?? 1) * varyVol, this.duck);
    if (gain <= 0) return false;

    rt.lastPlayed = t;

    if (rt.howl) {
      const cap = def.poolSize ?? 4;
      rt.voices = rt.voices.filter((v) => v.howl.playing(v.id));
      if (rt.voices.length >= cap) {
        const oldest = rt.voices.shift();
        if (oldest) oldest.howl.stop(oldest.id);
      }
      const id = rt.howl.play();
      rt.howl.volume(gain, id);
      rt.howl.rate(clamp(rate, 0.5, 2), id);
      rt.voices.push({ howl: rt.howl, id });
      return true;
    }

    const synth = this.ensureContext();
    if (!synth || !def.synth) return false;
    synth.play(def.synth, gain, clamp(rate, 0.5, 2));
    return true;
  }

  /** Convenience for the UI layer, which always wants the "ui" bus. */
  playUi(name: string): boolean {
    return this.playSfx(name);
  }

  /* ── music ──────────────────────────────────────────────────── */

  /**
   * Starts a track: the bed plus every stem, all at once, stems at
   * zero. They stay sample-locked forever because nothing is ever
   * started or stopped independently — only faded.
   */
  playTrack(trackId: string, fadeMs = 800): void {
    if (this.currentTrack === trackId) return;
    const def = this.manifest.music[trackId];
    if (!def) {
      this.log.warn(`[audio] unknown music track "${trackId}"`);
      return;
    }
    this.stopMusic(fadeMs);
    this.currentTrack = trackId;

    const build = (id: string, file: string | undefined, synth: SynthSpec | undefined, at: number): MusicLayer => ({
      id,
      howl:
        file && !this.forceSynth
          ? this.createHowl(this.formats.map((f) => `${this.musicBase}${file}.${f}`), true, 0)
          : null,
      synth: synth ?? null,
      target: 0,
      current: 0,
      at,
    });

    this.layers = [
      build("bed", def.bed, def.bedSynth, 0),
      ...def.stems.map((s) => build(s.id, s.file, s.synth, s.at)),
    ];
    for (const l of this.layers) l.howl?.play();
    this.setIntensity(this.intensity, fadeMs);
    this.bus?.emit("audio:track", { track: trackId });
  }

  /** Zone → track lookup, so callers never learn track ids. */
  setZone(zoneId: string, fadeMs = 1200): void {
    const track = this.manifest.zones?.[zoneId];
    if (!track) {
      this.log.warn(`[audio] zone "${zoneId}" has no track mapping`);
      return;
    }
    this.playTrack(track, fadeMs);
  }

  /**
   * 0 = calm exploration, 1 = boss fight. Stems ramp in around their
   * `at` point with a soft shoulder so there is never a pop.
   */
  setIntensity(value: number, fadeMs = 600): void {
    this.intensity = clamp(value, 0, 1);
    for (const l of this.layers) {
      l.target = l.id === "bed" ? 1 : smoothstep(l.at - 0.15, l.at + 0.15, this.intensity);
    }
    this.refreshMusicGains(fadeMs);
  }

  getIntensity(): number {
    return this.intensity;
  }

  getActiveTrack(): string | null {
    return this.currentTrack;
  }

  /** Layer id → 0..1 target, for debug HUDs and tests. */
  getLayerTargets(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const l of this.layers) out[l.id] = l.target;
    return out;
  }

  private refreshMusicGains(fadeMs: number): void {
    for (const l of this.layers) {
      const gain = resolveGain(this.settings, "music", l.target, this.duck);
      l.current = gain;
      if (l.howl) {
        if (fadeMs > 0) l.howl.fade(l.howl.volume() as number, gain, fadeMs);
        else l.howl.volume(gain);
      }
    }
    // Synth beds are decorative placeholders; re-pulse them rather than
    // holding oscillators open for minutes at a time.
    this.schedulePlaceholderPulse();
  }

  private schedulePlaceholderPulse(): void {
    if (this.fadeHandle !== null) return;
    if (!this.layers.some((l) => l.synth && !l.howl)) return;
    const tick = () => {
      this.fadeHandle = null;
      if (!this.currentTrack) return;
      const synth = this.ensureContext();
      if (synth) {
        for (const l of this.layers) {
          if (!l.synth || l.howl) continue;
          const gain = resolveGain(this.settings, "music", l.target, this.duck);
          if (gain > 0.01) synth.play(l.synth, gain * 0.6, 1);
        }
      }
      this.fadeHandle = this.timers.setTimeout(tick, 3800);
    };
    this.fadeHandle = this.timers.setTimeout(tick, 0);
  }

  stopMusic(fadeMs = 600): void {
    for (const l of this.layers) {
      if (!l.howl) continue;
      if (fadeMs > 0) {
        l.howl.fade(l.howl.volume() as number, 0, fadeMs);
        const h = l.howl;
        this.timers.setTimeout(() => {
          h.stop();
          h.unload();
        }, fadeMs + 50);
      } else {
        l.howl.stop();
        l.howl.unload();
      }
    }
    this.layers = [];
    this.currentTrack = null;
    if (this.fadeHandle !== null) {
      this.timers.clearTimeout(this.fadeHandle);
      this.fadeHandle = null;
    }
  }

  /* ── ducking ────────────────────────────────────────────────── */

  /**
   * Reference-counted: two stacked modals duck once and undo once.
   * Anything else would leave the mix quiet forever after a race.
   */
  pushDuck(depth = this.duckDepth, fadeMs = 200): void {
    this.modalDepth++;
    this.duckDepth = depth;
    this.duck = depth;
    this.refreshMusicGains(fadeMs);
    this.bus?.emit("audio:duck", { duck: this.duck, depth: this.modalDepth });
  }

  popDuck(fadeMs = 300): void {
    this.modalDepth = Math.max(0, this.modalDepth - 1);
    if (this.modalDepth === 0) {
      this.duck = 1;
      this.refreshMusicGains(fadeMs);
      this.bus?.emit("audio:duck", { duck: this.duck, depth: 0 });
    }
  }

  getDuck(): number {
    return this.duck;
  }

  /** Wires the standard modal events. Returns an unbind. */
  bindBus(bus: EventBus): () => void {
    const offOpen = bus.on("ui:modal:open", () => this.pushDuck());
    const offClose = bus.on("ui:modal:close", () => this.popDuck());
    const offSfx = bus.on<{ name: string }>("audio:sfx", (p) => {
      if (p && typeof p.name === "string") this.playSfx(p.name);
    });
    const unbind = () => {
      offOpen();
      offClose();
      offSfx();
    };
    this.disposers.push(unbind);
    return unbind;
  }

  destroy(): void {
    this.stopMusic(0);
    for (const rt of this.sfx.values()) rt.howl?.unload();
    this.sfx.clear();
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}

function defaultContextFactory(): AudioContextLike | null {
  try {
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   FOR THE SOUND DESIGNER
   Drop files at these exact paths and set `file` on the matching
   entry in the manifest; the synth fallback then never runs.
   Deliver BOTH .webm (Opus, ~96kbps) and .mp3 (~128kbps) — Safari
   still needs the mp3. Mono for SFX, stereo for music.

   MUSIC — assets/audio/music/  (all stems the SAME length and BPM,
   seamlessly looping, so they stay phase-locked when crossfaded)
     isle_day_bed        isle_day_warmth     isle_day_drive
     isle_day_shimmer
     isle_night_bed      isle_night_warmth   isle_night_drive
     depths_bed          depths_tension      depths_danger

   SFX — assets/audio/sfx/   (trimmed to zero-crossing, no lead-in)
     ui_tap  ui_back  ui_open  ui_close  ui_error  ui_purchase
     gather_chop  gather_mine  gather_fish  gather_catch  gather_fail
     item_pickup  item_coin  item_craft  item_equip
     combat_hit  combat_crit  combat_block  combat_death
     build_place  build_upgrade
     reward_levelup  reward_quest
   ═══════════════════════════════════════════════════════════════ */

export const AUDIO_ASSET_MANIFEST = {
  musicDir: "assets/audio/music/",
  sfxDir: "assets/audio/sfx/",
  formats: ["webm", "mp3"] as const,
  music: [
    "isle_day_bed", "isle_day_warmth", "isle_day_drive", "isle_day_shimmer",
    "isle_night_bed", "isle_night_warmth", "isle_night_drive",
    "depths_bed", "depths_tension", "depths_danger",
  ],
  sfx: [
    "ui_tap", "ui_back", "ui_open", "ui_close", "ui_error", "ui_purchase",
    "gather_chop", "gather_mine", "gather_fish", "gather_catch", "gather_fail",
    "item_pickup", "item_coin", "item_craft", "item_equip",
    "combat_hit", "combat_crit", "combat_block", "combat_death",
    "build_place", "build_upgrade",
    "reward_levelup", "reward_quest",
  ],
} as const;
