/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/__tests__/harness.ts
   Test doubles. Every service takes its clock, timers and I/O as
   constructor arguments precisely so these can exist: no jsdom, no
   real browser, no wall-clock sleeps, no flaky CI.
   ═══════════════════════════════════════════════════════════════ */

import { EventBus } from "../../core/contracts";
import type { PointerPhase, PointerSample, PointerSource } from "../input";
import { MemoryBackend } from "../storage";
import type { SaveBackend } from "../storage";
import type { TimerApi } from "../timing";

/* ── deterministic timers ────────────────────────────────────── */

export class FakeTimers implements TimerApi {
  private seq = 1;
  private queue = new Map<number, { at: number; fn: () => void }>();
  time = 0;

  setTimeout(fn: () => void, ms: number): number {
    const id = this.seq++;
    this.queue.set(id, { at: this.time + ms, fn });
    return id;
  }

  clearTimeout(handle: number): void {
    this.queue.delete(handle);
  }

  /** Runs every callback due within `ms`, in chronological order. */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      let nextId = -1;
      let nextAt = Infinity;
      for (const [id, entry] of this.queue) {
        if (entry.at <= target && entry.at < nextAt) {
          nextAt = entry.at;
          nextId = id;
        }
      }
      if (nextId === -1) break;
      const entry = this.queue.get(nextId);
      this.queue.delete(nextId);
      this.time = nextAt;
      entry?.fn();
    }
    this.time = target;
  }

  get pending(): number {
    return this.queue.size;
  }
}

/** Lets queued promise callbacks run without sleeping. */
export async function settle(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
  await new Promise<void>((r) => setTimeout(r, 0));
}

/* ── event capture ───────────────────────────────────────────── */

export interface Captured {
  key: string;
  payload: unknown;
}

export class BusRecorder {
  readonly events: Captured[] = [];
  private offs: (() => void)[] = [];

  constructor(readonly bus: EventBus, keys: string[]) {
    for (const k of keys) {
      this.offs.push(bus.on(k, (payload) => this.events.push({ key: k, payload })));
    }
  }

  keys(): string[] {
    return this.events.map((e) => e.key);
  }

  of<T>(key: string): T[] {
    return this.events.filter((e) => e.key === key).map((e) => e.payload as T);
  }

  count(key: string): number {
    return this.events.filter((e) => e.key === key).length;
  }

  clear(): void {
    this.events.length = 0;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}

export function newBus(): EventBus {
  return new EventBus();
}

/* ── synthetic pointers ──────────────────────────────────────── */

export class FakePointerSource implements PointerSource {
  private listeners = new Set<(p: PointerPhase, s: PointerSample) => void>();
  captured: number[] = [];
  released: number[] = [];
  time = 0;

  subscribe(fn: (p: PointerPhase, s: PointerSample) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  capture(id: number): void {
    this.captured.push(id);
  }

  release(id: number): void {
    this.released.push(id);
  }

  /** Emit a raw phase. `dt` advances the synthetic event clock first. */
  emit(phase: PointerPhase, id: number, x: number, y: number, dt = 0): void {
    this.time += dt;
    const sample: PointerSample = {
      pointerId: id,
      x,
      y,
      pointerType: "touch",
      time: this.time,
    };
    for (const fn of [...this.listeners]) fn(phase, sample);
  }

  down(id: number, x: number, y: number, dt = 0): void {
    this.emit("down", id, x, y, dt);
  }
  move(id: number, x: number, y: number, dt = 8): void {
    this.emit("move", id, x, y, dt);
  }
  up(id: number, x: number, y: number, dt = 8): void {
    this.emit("up", id, x, y, dt);
  }
  cancel(id: number, x: number, y: number, dt = 0): void {
    this.emit("cancel", id, x, y, dt);
  }
}

/* ── storage doubles ─────────────────────────────────────────── */

/** Wraps a backend and fails the Nth write to a given key. */
export class FlakyBackend implements SaveBackend {
  readonly name = "flaky";
  failWritesTo: string | null = null;

  constructor(private readonly inner: MemoryBackend) {}

  get(key: string): Promise<string | null> {
    return this.inner.get(key);
  }
  set(key: string, value: string): Promise<void> {
    if (this.failWritesTo !== null && key.endsWith(this.failWritesTo)) {
      return Promise.reject(new Error(`simulated write failure on ${key}`));
    }
    return this.inner.set(key, value);
  }
  delete(key: string): Promise<void> {
    return this.inner.delete(key);
  }
  list(prefix: string): Promise<string[]> {
    return this.inner.list(prefix);
  }
  peek(key: string): string | null {
    return this.inner.peek(key);
  }
}

/** Advancing wall clock, so daily-snapshot logic can be exercised. */
export function fakeClock(startIso: string): { now: () => number; addDays(n: number): void } {
  let t = Date.parse(startIso);
  return {
    now: () => t,
    addDays(n) {
      t += n * 86_400_000;
    },
  };
}
