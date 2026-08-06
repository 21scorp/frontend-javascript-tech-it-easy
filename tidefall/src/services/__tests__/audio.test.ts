import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_ASSET_MANIFEST,
  AudioService,
  DEFAULT_AUDIO_SETTINGS,
  PLACEHOLDER_MANIFEST,
  memorySettingsStore,
  resolveGain,
} from "../audio";
import type { AudioServiceOptions, SynthSpec } from "../audio";
import { BusRecorder, FakeTimers, newBus } from "./harness";

/** Records what the synth was asked to play instead of making noise. */
function rig(over: Partial<AudioServiceOptions> = {}) {
  const played: { spec: SynthSpec; gain: number; rate: number }[] = [];
  const clock = { t: 0 };
  const timers = new FakeTimers();
  const bus = newBus();
  const audio = new AudioService({
    bus,
    store: memorySettingsStore(),
    timers,
    now: () => clock.t,
    forceSynth: true,
    logger: { warn: vi.fn(), info: vi.fn() },
    createContext: () => null, // no WebAudio in node
    ...over,
  });
  // Intercept at the boundary the service uses when a context exists.
  const anyAudio = audio as unknown as {
    ensureContext(): { play(spec: SynthSpec, gain: number, rate: number): void } | null;
  };
  anyAudio.ensureContext = () => ({
    play: (spec, gain, rate) => played.push({ spec, gain, rate }),
  });
  return { audio, played, clock, timers, bus };
}

describe("audio · mixer maths", () => {
  const s = { ...DEFAULT_AUDIO_SETTINGS, master: 1, music: 0.5, sfx: 0.8, ui: 0.6 };

  it("multiplies master × category × base × duck", () => {
    expect(resolveGain(s, "sfx", 1, 1)).toBeCloseTo(0.8, 6);
    expect(resolveGain(s, "music", 1, 0.3)).toBeCloseTo(0.15, 6);
    expect(resolveGain({ ...s, master: 0.5 }, "sfx", 0.5, 1)).toBeCloseTo(0.2, 6);
  });

  it("keeps UI audible under a duck — it is the feedback for the duck", () => {
    expect(resolveGain(s, "ui", 1, 0.2)).toBeCloseTo(0.6, 6);
  });

  it("mute wins over everything and gain is clamped to 0..1", () => {
    expect(resolveGain({ ...s, muted: true }, "sfx", 1, 1)).toBe(0);
    expect(resolveGain({ ...s, master: 5, sfx: 5 }, "sfx", 5, 1)).toBe(1);
  });
});

describe("audio · settings", () => {
  it("persists category volumes through the store", () => {
    const store = memorySettingsStore();
    const a = new AudioService({ store, createContext: () => null });
    a.setVolume("music", 0.25);
    a.setMuted(true);

    const b = new AudioService({ store, createContext: () => null });
    expect(b.getSettings().music).toBe(0.25);
    expect(b.getSettings().muted).toBe(true);
  });

  it("clamps out-of-range volumes", () => {
    const a = new AudioService({ store: memorySettingsStore(), createContext: () => null });
    a.setVolume("sfx", 4);
    a.setVolume("ui", -3);
    expect(a.getSettings().sfx).toBe(1);
    expect(a.getSettings().ui).toBe(0);
  });
});

describe("audio · sfx variation", () => {
  it("never plays the same sound identically twice in a row", () => {
    const { audio, played, clock } = rig();
    for (let i = 0; i < 12; i++) {
      clock.t += 100; // past the throttle window
      expect(audio.playSfx("item.coin")).toBe(true);
    }
    const rates = played.map((p) => p.rate);
    const gains = played.map((p) => p.gain);
    expect(new Set(rates).size).toBe(rates.length);
    expect(new Set(gains).size).toBe(gains.length);
    for (const r of rates) expect(Math.abs(r - 1)).toBeLessThanOrEqual(0.16);
  });

  it("is deterministic for a fixed seed, so audio bugs reproduce", () => {
    const a = rig({ seed: 42 });
    const b = rig({ seed: 42 });
    for (let i = 0; i < 5; i++) {
      a.clock.t += 100;
      b.clock.t += 100;
      a.audio.playSfx("gather.chop");
      b.audio.playSfx("gather.chop");
    }
    expect(a.played.map((p) => p.rate)).toEqual(b.played.map((p) => p.rate));
  });

  it("throttles machine-gun retriggers", () => {
    const { audio, played, clock } = rig();
    expect(audio.playSfx("ui.tap")).toBe(true); // throttleMs 30
    clock.t += 5;
    expect(audio.playSfx("ui.tap")).toBe(false);
    clock.t += 40;
    expect(audio.playSfx("ui.tap")).toBe(true);
    expect(played).toHaveLength(2);
  });

  it("returns false and stays silent when muted", () => {
    const { audio, played } = rig();
    audio.setMuted(true);
    expect(audio.playSfx("combat.hit")).toBe(false);
    expect(played).toHaveLength(0);
  });

  it("warns once for an unknown sfx and never throws", () => {
    const warn = vi.fn();
    const { audio } = rig({ logger: { warn, info: vi.fn() } });
    expect(audio.playSfx("does.not.exist")).toBe(false);
    expect(audio.playSfx("does.not.exist")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("routes ui sounds through the ui category", () => {
    const { audio, played } = rig();
    audio.setVolume("ui", 0);
    expect(audio.playUi("ui.open")).toBe(false);
    audio.setVolume("ui", 1);
    audio.setVolume("sfx", 0);
    expect(audio.playUi("ui.open")).toBe(true);
    expect(played).toHaveLength(1);
  });
});

describe("audio · layered music", () => {
  it("brings stems in as intensity rises, bed always full", () => {
    const { audio } = rig();
    audio.playTrack("isle.day", 0);
    audio.setIntensity(0, 0);
    let t = audio.getLayerTargets();
    expect(t.bed).toBe(1);
    expect(t.warmth).toBe(0);
    expect(t.drive).toBe(0);

    audio.setIntensity(0.3, 0);
    t = audio.getLayerTargets();
    expect(t.warmth).toBeCloseTo(0.5, 5); // exactly at its midpoint
    expect(t.drive).toBe(0);

    audio.setIntensity(1, 0);
    t = audio.getLayerTargets();
    expect(t.warmth).toBe(1);
    expect(t.drive).toBe(1);
    expect(t.shimmer).toBeGreaterThan(0.9);
  });

  it("maps zones to tracks and ignores unknown zones", () => {
    const warn = vi.fn();
    const { audio } = rig({ logger: { warn, info: vi.fn() } });
    audio.setZone("mine", 0);
    expect(audio.getActiveTrack()).toBe("depths");
    audio.setZone("nowhere", 0);
    expect(audio.getActiveTrack()).toBe("depths");
    expect(warn).toHaveBeenCalled();
  });

  it("keeps intensity across a track change", () => {
    const { audio } = rig();
    audio.playTrack("isle.day", 0);
    audio.setIntensity(0.8, 0);
    audio.playTrack("depths", 0);
    expect(audio.getIntensity()).toBe(0.8);
    expect(audio.getLayerTargets().tension).toBe(1);
  });
});

describe("audio · ducking", () => {
  it("is reference counted so stacked modals undo exactly once", () => {
    const { audio } = rig();
    expect(audio.getDuck()).toBe(1);
    audio.pushDuck(0.3, 0);
    audio.pushDuck(0.3, 0);
    expect(audio.getDuck()).toBe(0.3);
    audio.popDuck(0);
    expect(audio.getDuck()).toBe(0.3); // still one modal open
    audio.popDuck(0);
    expect(audio.getDuck()).toBe(1);
  });

  it("never goes negative if pop is called too often", () => {
    const { audio } = rig();
    audio.popDuck(0);
    audio.popDuck(0);
    audio.pushDuck(0.3, 0);
    expect(audio.getDuck()).toBe(0.3);
    audio.popDuck(0);
    expect(audio.getDuck()).toBe(1);
  });

  it("wires ui:modal:open / ui:modal:close through the bus", () => {
    const { audio, bus } = rig();
    const rec = new BusRecorder(bus, ["audio:duck"]);
    audio.bindBus(bus);
    bus.emit("ui:modal:open");
    expect(audio.getDuck()).toBeLessThan(1);
    bus.emit("ui:modal:close");
    expect(audio.getDuck()).toBe(1);
    expect(rec.count("audio:duck")).toBe(2);
    rec.dispose();
  });

  it("plays sfx requested over the bus", () => {
    const { audio, played, bus } = rig();
    audio.bindBus(bus);
    bus.emit("audio:sfx", { name: "combat.hit" });
    expect(played).toHaveLength(1);
  });
});

describe("audio · placeholder manifest", () => {
  it("gives every declared sfx a synth recipe, since no files exist yet", () => {
    for (const [name, def] of Object.entries(PLACEHOLDER_MANIFEST.sfx)) {
      expect(def.synth, `${name} has no synth fallback`).toBeDefined();
      expect(def.synth!.dur).toBeGreaterThan(0);
      expect(def.synth!.freq).toBeGreaterThan(20);
    }
  });

  it("gives every music track a bed and at least one stem", () => {
    for (const [id, track] of Object.entries(PLACEHOLDER_MANIFEST.music)) {
      expect(track.bedSynth, `${id} has no bed`).toBeDefined();
      expect(track.stems.length).toBeGreaterThan(0);
      for (const s of track.stems) expect(s.at).toBeGreaterThan(0);
    }
  });

  it("every zone mapping points at a real track", () => {
    for (const [zone, track] of Object.entries(PLACEHOLDER_MANIFEST.zones ?? {})) {
      expect(PLACEHOLDER_MANIFEST.music[track], `zone ${zone}`).toBeDefined();
    }
  });

  it("the deliverables list covers every sfx the game asks for", () => {
    expect(AUDIO_ASSET_MANIFEST.sfx.length).toBe(
      Object.keys(PLACEHOLDER_MANIFEST.sfx).length,
    );
    // "gather.chop" ⇢ "gather_chop"
    for (const name of Object.keys(PLACEHOLDER_MANIFEST.sfx)) {
      expect(AUDIO_ASSET_MANIFEST.sfx as readonly string[]).toContain(name.replace(".", "_"));
    }
  });
});
