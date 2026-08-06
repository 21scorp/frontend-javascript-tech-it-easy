import { beforeEach, describe, expect, it } from "vitest";
import { INPUT_EVENTS, InputService } from "../input";
import type {
  DesignSpace,
  DragEndEvent,
  DragEvent,
  DragStartEvent,
  LongPressEvent,
  PinchEvent,
  TapEvent,
} from "../input";
import { BusRecorder, FakePointerSource, FakeTimers, newBus } from "./harness";

const ALL = Object.values(INPUT_EVENTS);

/** Design space at 0.5× — proves screen-px slop and design-unit output
    really are different spaces and neither leaks into the other. */
const HALF_SCALE: DesignSpace = { toDesign: (x, y) => ({ x: x * 2, y: y * 2 }) };

interface Rig {
  src: FakePointerSource;
  timers: FakeTimers;
  rec: BusRecorder;
  input: InputService;
}

function rig(space: DesignSpace = HALF_SCALE, over: Partial<{ longPressMs: number }> = {}): Rig {
  const bus = newBus();
  const src = new FakePointerSource();
  const timers = new FakeTimers();
  const rec = new BusRecorder(bus, ALL);
  const input = new InputService({
    bus,
    source: src,
    space,
    timers,
    tapSlopPx: 9,
    longPressMs: over.longPressMs ?? 450,
  });
  input.start();
  return { src, timers, rec, input };
}

let r: Rig;
beforeEach(() => {
  r = rig();
});

describe("input · tap", () => {
  it("classifies a still down+up as a tap, in design units", () => {
    r.src.down(1, 100, 200);
    r.src.up(1, 102, 201, 60);

    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(1);
    const tap = r.rec.of<TapEvent>(INPUT_EVENTS.tap)[0]!;
    expect(tap.x).toBe(204); // 102 screen px → 204 design units
    expect(tap.y).toBe(402);
    expect(tap.duration).toBe(60);
    expect(r.rec.count(INPUT_EVENTS.dragStart)).toBe(0);
  });

  it("still taps after jitter inside the slop radius", () => {
    r.src.down(1, 500, 500);
    r.src.move(1, 504, 503);
    r.src.move(1, 501, 498);
    r.src.up(1, 500, 500, 40);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(1);
    expect(r.rec.count(INPUT_EVENTS.dragStart)).toBe(0);
  });

  it("does not tap when the press outlasts tapMaxMs", () => {
    r.src.down(1, 100, 100);
    r.src.up(1, 100, 100, 900);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(0);
  });

  it("captures and releases the pointer", () => {
    r.src.down(1, 10, 10);
    expect(r.src.captured).toEqual([1]);
    r.src.up(1, 10, 10, 20);
    expect(r.src.released).toEqual([1]);
  });
});

describe("input · drag", () => {
  it("emits dragstart → drag… → dragend and NEVER a tap", () => {
    r.src.down(1, 100, 100);
    r.src.move(1, 106, 100); // 6px — still inside slop, no dragstart yet
    expect(r.rec.count(INPUT_EVENTS.dragStart)).toBe(0);

    r.src.move(1, 130, 100); // 30px — drag begins
    r.src.move(1, 160, 120);
    r.src.move(1, 200, 160);
    r.src.up(1, 200, 160, 10);

    expect(r.rec.count(INPUT_EVENTS.dragStart)).toBe(1);
    expect(r.rec.count(INPUT_EVENTS.drag)).toBe(2);
    expect(r.rec.count(INPUT_EVENTS.dragEnd)).toBe(1);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(0); // the whole point
  });

  it("reports incremental and cumulative deltas in design units", () => {
    r.src.down(1, 100, 100);
    r.src.move(1, 140, 100); // dragstart at design (280,200)
    r.src.move(1, 160, 110);

    const start = r.rec.of<DragStartEvent>(INPUT_EVENTS.dragStart)[0]!;
    expect(start.originX).toBe(200);
    expect(start.originY).toBe(200);

    const d = r.rec.of<DragEvent>(INPUT_EVENTS.drag)[0]!;
    expect(d.dx).toBe(40); // (160-140) screen → 40 design
    expect(d.dy).toBe(20);
    expect(d.totalDx).toBe(120); // (160-100) screen → 120 design
    expect(d.totalDy).toBe(20);
  });

  it("reports a flick velocity on dragend", () => {
    r.src.down(1, 0, 0);
    r.src.move(1, 100, 0, 50);
    r.src.up(1, 200, 0, 50);
    const end = r.rec.of<DragEndEvent>(INPUT_EVENTS.dragEnd)[0]!;
    expect(end.totalDx).toBe(400); // 200 screen px → 400 design
    expect(end.duration).toBe(100);
    expect(end.vx).toBe(4000); // 400 design units / 0.1s
    expect(end.cancelled).toBe(false);
  });

  it("treats pointercancel as an aborted drag, with no tap", () => {
    r.src.down(1, 100, 100);
    r.src.move(1, 160, 100);
    r.src.cancel(1, 160, 100);

    const end = r.rec.of<DragEndEvent>(INPUT_EVENTS.dragEnd)[0]!;
    expect(end.cancelled).toBe(true);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(0);
    expect(r.input.isDragging()).toBe(false);
    expect(r.input.activePointerCount).toBe(0);
  });

  it("swallows a cancel with no matching down instead of throwing", () => {
    expect(() => r.src.cancel(42, 0, 0)).not.toThrow();
    expect(r.rec.events).toHaveLength(0);
  });
});

describe("input · long press", () => {
  it("fires after the hold and suppresses the tap on release", () => {
    r.src.down(1, 300, 400);
    r.timers.advance(449);
    expect(r.rec.count(INPUT_EVENTS.longPress)).toBe(0);

    r.timers.advance(2);
    expect(r.rec.count(INPUT_EVENTS.longPress)).toBe(1);
    const lp = r.rec.of<LongPressEvent>(INPUT_EVENTS.longPress)[0]!;
    expect(lp.x).toBe(600);
    expect(lp.y).toBe(800);

    r.src.up(1, 300, 400, 20);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(0);
  });

  it("is cancelled by moving beyond the hold slop", () => {
    r.src.down(1, 300, 400);
    r.src.move(1, 340, 400);
    r.timers.advance(1000);
    expect(r.rec.count(INPUT_EVENTS.longPress)).toBe(0);
    expect(r.rec.count(INPUT_EVENTS.dragStart)).toBe(1);
  });

  it("is cancelled by lifting early", () => {
    r.src.down(1, 300, 400);
    r.src.up(1, 300, 400, 100);
    r.timers.advance(1000);
    expect(r.rec.count(INPUT_EVENTS.longPress)).toBe(0);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(1);
  });

  it("never arms for a second finger", () => {
    r.src.down(1, 100, 100);
    r.src.down(2, 300, 100);
    r.timers.advance(2000);
    expect(r.rec.count(INPUT_EVENTS.longPress)).toBe(0);
  });
});

describe("input · pinch", () => {
  it("reports scale and midpoint, and pans do not leak as taps", () => {
    r.src.down(1, 100, 100);
    r.src.down(2, 200, 100); // start distance 100 screen px

    const start = r.rec.of<PinchEvent>(INPUT_EVENTS.pinch)[0]!;
    expect(start.phase).toBe("start");
    expect(start.scale).toBe(1);
    expect(start.midX).toBe(300); // (100+200)/2 = 150 screen → 300 design
    expect(start.midY).toBe(200);

    r.src.move(2, 300, 100); // distance 200 → 2×
    const move = r.rec.of<PinchEvent>(INPUT_EVENTS.pinch)[1]!;
    expect(move.phase).toBe("move");
    expect(move.scale).toBeCloseTo(2, 6);
    expect(move.midX).toBe(400);
    expect(move.midDx).toBe(100);

    r.src.up(2, 300, 100, 10);
    const end = r.rec.of<PinchEvent>(INPUT_EVENTS.pinch)[2]!;
    expect(end.phase).toBe("end");

    r.src.up(1, 100, 100, 10);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(0);
    expect(r.input.isPinching()).toBe(false);
  });

  it("pinching out reports a scale below 1", () => {
    r.src.down(1, 100, 100);
    r.src.down(2, 300, 100); // 200 apart
    r.src.move(2, 200, 100); // 100 apart → 0.5×
    const move = r.rec.of<PinchEvent>(INPUT_EVENTS.pinch)[1]!;
    expect(move.scale).toBeCloseTo(0.5, 6);
    expect(move.deltaScale).toBeCloseTo(-0.5, 6);
  });

  it("converts an in-flight drag into a pinch, closing the drag first", () => {
    r.src.down(1, 100, 100);
    r.src.move(1, 200, 100); // real drag underway
    expect(r.rec.count(INPUT_EVENTS.dragStart)).toBe(1);

    r.src.down(2, 400, 100);
    const end = r.rec.of<DragEndEvent>(INPUT_EVENTS.dragEnd)[0]!;
    expect(end.cancelled).toBe(true);
    expect(r.input.isPinching()).toBe(true);

    // Further movement must drive the pinch, not the dead drag.
    r.src.move(1, 150, 100);
    expect(r.rec.count(INPUT_EVENTS.drag)).toBe(0);
    expect(r.rec.count(INPUT_EVENTS.pinch)).toBe(2);
  });

  it("treats a tiny two-finger wobble as a pan, not a zoom", () => {
    r.src.down(1, 100, 100);
    r.src.down(2, 300, 100);
    r.src.move(2, 301, 100); // 200 → 201, a 0.5% change
    const move = r.rec.of<PinchEvent>(INPUT_EVENTS.pinch)[1]!;
    expect(move.scale).toBe(1); // inside the dead zone
    expect(move.midDx).toBeCloseTo(1, 6);
  });

  it("ignores a third finger entirely", () => {
    r.src.down(1, 100, 100);
    r.src.down(2, 300, 100);
    r.rec.clear();
    r.src.down(3, 500, 500);
    r.src.up(3, 500, 500, 10);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(0);
    expect(r.input.isPinching()).toBe(true);
  });
});

describe("input · lifecycle", () => {
  it("setEnabled(false) cancels everything in flight and stops routing", () => {
    r.src.down(1, 100, 100);
    r.src.move(1, 200, 100);
    r.input.setEnabled(false);

    expect(r.rec.of<DragEndEvent>(INPUT_EVENTS.dragEnd)[0]?.cancelled).toBe(true);
    r.rec.clear();
    r.src.down(2, 10, 10);
    r.src.up(2, 10, 10, 20);
    expect(r.rec.events).toHaveLength(0);

    r.input.setEnabled(true);
    r.src.down(3, 10, 10);
    r.src.up(3, 10, 10, 20);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(1);
  });

  it("recovers from a duplicate down (a missed up)", () => {
    r.src.down(1, 100, 100);
    r.src.down(1, 400, 400); // browser lost the up
    expect(r.input.activePointerCount).toBe(1);
    r.src.up(1, 400, 400, 20);
    expect(r.rec.count(INPUT_EVENTS.tap)).toBe(1);
  });

  it("destroy() detaches from the source", () => {
    r.input.destroy();
    r.src.down(1, 10, 10);
    r.src.up(1, 10, 10, 20);
    expect(r.rec.events).toHaveLength(0);
  });
});
