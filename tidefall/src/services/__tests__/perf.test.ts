import { describe, expect, it } from "vitest";
import { PERF_EVENTS, PerfService } from "../perf";
import type { PerfDegradeEvent, PerfOptions, PerfRecoverEvent } from "../perf";
import { BusRecorder, newBus } from "./harness";

/** Feeds `count` frames of `ms` each, advancing the injected clock with them. */
function run(perf: PerfService, clock: { t: number }, ms: number, count: number) {
  for (let i = 0; i < count; i++) {
    clock.t += ms;
    perf.frame(ms);
  }
}

function rig(over: Partial<PerfOptions> = {}) {
  const bus = newBus();
  const rec = new BusRecorder(bus, [PERF_EVENTS.degrade, PERF_EVENTS.recover, PERF_EVENTS.stats]);
  const clock = { t: 0 };
  const perf = new PerfService({
    bus,
    tier: "high",
    windowSize: 60,
    warmupFrames: 30,
    sustainMs: 2000,
    recoverMs: 5000,
    now: () => clock.t,
    ...over,
  });
  return { perf, rec, clock };
}

describe("perf · measurement", () => {
  it("reports a rolling average and derived fps", () => {
    const { perf, clock } = rig();
    run(perf, clock, 16.67, 120);
    expect(perf.avgFrameMs).toBeCloseTo(16.67, 2);
    expect(perf.fps).toBeCloseTo(60, 1);
    expect(perf.stats().samples).toBe(60);
  });

  it("rolls old samples out of the window", () => {
    const { perf, clock } = rig();
    run(perf, clock, 33, 60); // fill with slow frames
    expect(perf.fps).toBeCloseTo(30.3, 1);
    run(perf, clock, 16, 60); // completely replace them
    expect(perf.fps).toBeCloseTo(62.5, 1);
  });

  it("counts hitches and tracks p95 separately from the mean", () => {
    const { perf, clock } = rig({ hitchMs: 30 });
    run(perf, clock, 16, 55);
    run(perf, clock, 120, 5); // five nasty spikes
    expect(perf.stats().hitches).toBe(5);
    expect(perf.stats().p95FrameMs).toBeGreaterThan(perf.stats().avgFrameMs);
  });

  it("ignores a backgrounded-tab mega-frame instead of panicking", () => {
    const { perf, clock } = rig();
    run(perf, clock, 16, 60);
    clock.t += 30_000;
    perf.frame(30_000); // clamped to 1000ms, one sample only
    expect(perf.stats().worstFrameMs).toBe(1000);
    expect(perf.tier).toBe("high");
  });
});

describe("perf · auto-degrade", () => {
  it("stays quiet during warmup even at terrible fps", () => {
    const { perf, rec, clock } = rig();
    run(perf, clock, 100, 30);
    expect(rec.count(PERF_EVENTS.degrade)).toBe(0);
    expect(perf.tier).toBe("high");
  });

  it("degrades one tier after sustained low fps, not on a single spike", () => {
    const { perf, rec, clock } = rig();
    run(perf, clock, 16, 60); // warm and healthy
    clock.t += 500;
    perf.frame(200); // one spike — average still fine
    expect(rec.count(PERF_EVENTS.degrade)).toBe(0);

    run(perf, clock, 33, 200); // ~30fps for well over sustainMs
    expect(rec.count(PERF_EVENTS.degrade)).toBeGreaterThanOrEqual(1);
    const first = rec.of<PerfDegradeEvent>(PERF_EVENTS.degrade)[0]!;
    expect(first.tier).toBe("mid");
    expect(first.level).toBe(1);
    expect(first.reason).toBe("sustained-low-fps");
  });

  it("steps down progressively and stops at maxLevel", () => {
    const { perf, rec, clock } = rig({ maxLevel: 3 });
    run(perf, clock, 16, 60);
    run(perf, clock, 50, 2000); // 20fps forever
    const events = rec.of<PerfDegradeEvent>(PERF_EVENTS.degrade);
    expect(events.map((e) => e.level)).toEqual([1, 2, 3]);
    expect(perf.tier).toBe("low");
    expect(perf.degradeLevel).toBe(3);
  });

  it("recovers a tier only after a long clean window", () => {
    const { perf, rec, clock } = rig();
    run(perf, clock, 16, 60);
    run(perf, clock, 33, 120); // just long enough for exactly one degrade
    expect(perf.tier).toBe("mid");
    expect(rec.count(PERF_EVENTS.degrade)).toBe(1);
    rec.clear();

    run(perf, clock, 16, 100); // ~62fps but not yet 5s of it
    expect(rec.count(PERF_EVENTS.recover)).toBe(0);

    run(perf, clock, 16, 400); // now well past recoverMs
    expect(rec.count(PERF_EVENTS.recover)).toBeGreaterThanOrEqual(1);
    const ev = rec.of<PerfRecoverEvent>(PERF_EVENTS.recover)[0]!;
    expect(ev.tier).toBe("high");
    expect(ev.level).toBe(0);
  });

  it("does not oscillate while fps sits between the two thresholds", () => {
    const { perf, rec, clock } = rig();
    run(perf, clock, 16, 60);
    run(perf, clock, 20, 3000); // 50fps: above degrade, below recover
    expect(rec.count(PERF_EVENTS.degrade)).toBe(0);
    expect(rec.count(PERF_EVENTS.recover)).toBe(0);
    expect(perf.tier).toBe("high");
  });

  it("setTier(lock) pins quality — the watchdog stops fighting the player", () => {
    const { perf, rec, clock } = rig();
    perf.setTier("low", true);
    run(perf, clock, 16, 2000); // silky smooth, but the player asked for Low
    expect(rec.count(PERF_EVENTS.recover)).toBe(0);
    expect(perf.tier).toBe("low");

    perf.setTier("high", true);
    run(perf, clock, 100, 2000); // dreadful, but they asked for High
    expect(rec.count(PERF_EVENTS.degrade)).toBe(0);
    expect(perf.tier).toBe("high");

    perf.setAuto(); // …until they hand control back
    run(perf, clock, 100, 2000);
    expect(rec.count(PERF_EVENTS.degrade)).toBeGreaterThan(0);
  });

  it("emits stats roughly once per second", () => {
    const { perf, rec, clock } = rig();
    run(perf, clock, 16, 60);
    rec.clear();
    run(perf, clock, 16, 625); // ~10 seconds of frames
    const n = rec.count(PERF_EVENTS.stats);
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(11);
  });
});
