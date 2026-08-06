import { describe, expect, it } from "vitest";
import { HAPTIC_PATTERNS, HapticsService, nullHapticsBackend } from "../haptics";
import type { HapticsBackend } from "../haptics";

function spyBackend(supported = true): HapticsBackend & { calls: number[][]; cancels: number } {
  const calls: number[][] = [];
  return {
    name: "spy",
    calls,
    cancels: 0,
    isSupported: () => supported,
    vibrate(pattern) {
      calls.push(pattern);
    },
    cancel() {
      this.cancels++;
    },
  };
}

describe("haptics · consent", () => {
  it("fires the mapped pattern when everything allows it", () => {
    const backend = spyBackend();
    const h = new HapticsService({ backend, prefersReducedMotion: () => false, now: () => 0 });
    expect(h.impact("medium")).toBe(true);
    expect(backend.calls[0]).toEqual(HAPTIC_PATTERNS.medium);
  });

  it("respects prefers-reduced-motion with no setting to find", () => {
    const backend = spyBackend();
    const h = new HapticsService({ backend, prefersReducedMotion: () => true });
    expect(h.isAvailable()).toBe(false);
    expect(h.impact("heavy")).toBe(false);
    expect(h.notify("success")).toBe(false);
    expect(h.selection()).toBe(false);
    expect(backend.calls).toHaveLength(0);
  });

  it("respects the player setting and cancels anything running", () => {
    const backend = spyBackend();
    const h = new HapticsService({ backend, prefersReducedMotion: () => false, now: () => 0 });
    h.setEnabled(false);
    expect(h.isEnabled()).toBe(false);
    expect(h.fire("light")).toBe(false);
    expect(backend.cancels).toBe(1);
  });

  it("no-ops on a device without vibration support", () => {
    const h = new HapticsService({
      backend: spyBackend(false),
      prefersReducedMotion: () => false,
    });
    expect(h.isAvailable()).toBe(false);
    expect(h.fire("success")).toBe(false);
  });

  it("the null backend is always safe", () => {
    const h = new HapticsService({
      backend: nullHapticsBackend(),
      prefersReducedMotion: () => false,
    });
    expect(() => h.notify("error")).not.toThrow();
    expect(h.backendName()).toBe("null");
  });
});

describe("haptics · rate limiting", () => {
  it("drops bursts inside the minimum interval", () => {
    const clock = { t: 0 };
    const backend = spyBackend();
    const h = new HapticsService({
      backend,
      prefersReducedMotion: () => false,
      now: () => clock.t,
      minIntervalMs: 40,
    });

    expect(h.selection()).toBe(true);
    clock.t += 10;
    expect(h.selection()).toBe(false);
    clock.t += 10;
    expect(h.selection()).toBe(false);
    clock.t += 30;
    expect(h.selection()).toBe(true);
    expect(backend.calls).toHaveLength(2);
  });
});

describe("haptics · patterns", () => {
  it("has a shape for every named pattern, all plausibly short", () => {
    for (const [name, shape] of Object.entries(HAPTIC_PATTERNS)) {
      expect(shape.length, name).toBeGreaterThan(0);
      for (const ms of shape) expect(ms).toBeGreaterThan(0);
      const total = shape.reduce((a, b) => a + b, 0);
      expect(total, `${name} is too long to feel like feedback`).toBeLessThan(400);
    }
  });

  it("hands the backend a copy, so a caller cannot mutate the table", () => {
    const backend = spyBackend();
    const h = new HapticsService({ backend, prefersReducedMotion: () => false, now: () => 0 });
    h.impact("light");
    backend.calls[0]![0] = 9999;
    expect(HAPTIC_PATTERNS.light[0]).toBe(12);
  });
});
