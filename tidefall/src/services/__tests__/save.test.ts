import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANITIZE_LIMITS,
  SAVE_MAGIC,
  SaveService,
  checksum,
  encodeSaveCode,
  runMigrations,
  sanitizeDeep,
  sanitizeText,
} from "../save";
import type { Migration, SaveConfig } from "../save";
import { MemoryBackend } from "../storage";
import { BusRecorder, FakeTimers, FlakyBackend, fakeClock, newBus, settle } from "./harness";

interface Profile {
  name: string;
  gold: number;
  inventory: { id: string; qty: number }[];
  version?: number;
}

const config = (over: Partial<SaveConfig<Profile>> = {}): SaveConfig<Profile> => ({
  version: 1,
  createDefault: () => ({ name: "Castaway", gold: 0, inventory: [] }),
  ...over,
});

function rawEnvelopeText(version: number, d: string, counter = 1): string {
  return JSON.stringify({ m: SAVE_MAGIC, v: version, t: 0, n: counter, c: checksum(d), d });
}

function rawEnvelope(version: number, payload: unknown, counter = 1): string {
  return rawEnvelopeText(version, JSON.stringify(payload), counter);
}

describe("save · round trip", () => {
  it("persists and reloads through a fresh service instance", async () => {
    const backend = new MemoryBackend();
    const a = new SaveService<Profile>({ backend, config: config() });
    const first = await a.load();
    expect(first.source).toBe("fresh");

    first.data.name = "Wren";
    first.data.gold = 1234;
    first.data.inventory.push({ id: "item_oak", qty: 7 });
    await a.flush();

    const b = new SaveService<Profile>({ backend, config: config() });
    const second = await b.load();
    expect(second.source).toBe("primary");
    expect(second.data).toEqual({
      name: "Wren",
      gold: 1234,
      inventory: [{ id: "item_oak", qty: 7 }],
    });
  });

  it("leaves no staging slot behind after a clean write", async () => {
    const backend = new MemoryBackend();
    const s = new SaveService<Profile>({ backend, config: config() });
    await s.load();
    await s.flush();
    expect(backend.peek("save:staging")).toBeNull();
    expect(backend.peek("save:main")).not.toBeNull();
  });

  it("namespaces keys so profiles never collide", async () => {
    const backend = new MemoryBackend();
    const s = new SaveService<Profile>({ backend, config: config({ namespace: "slot2" }) });
    await s.load();
    await s.flush();
    expect(backend.peek("slot2:save:main")).not.toBeNull();
    expect(backend.peek("save:main")).toBeNull();
  });
});

describe("save · corruption recovery", () => {
  it("restores from the backup slot when the primary is garbage", async () => {
    const backend = new MemoryBackend();
    const bus = newBus();
    const rec = new BusRecorder(bus, ["save:corrupt", "save:recovered"]);

    const a = new SaveService<Profile>({ backend, config: config(), bus });
    const st = (await a.load()).data;
    st.gold = 100;
    await a.flush(); // write #1 → primary
    st.gold = 200;
    await a.flush(); // write #2 → primary, #1 demoted to backup

    backend.poke("save:main", '{"m":"TIDEFALL","v":1,"t":0,"n":9,"c":"deadbeef","d":"{oh no');

    const b = new SaveService<Profile>({ backend, config: config(), bus });
    const loaded = await b.load();

    expect(loaded.source).toBe("backup");
    expect(loaded.data.gold).toBe(100);
    expect(rec.count("save:corrupt")).toBeGreaterThan(0);
    expect(rec.count("save:recovered")).toBe(1);

    // …and the healthy copy is immediately re-promoted, so the next
    // crash has a good primary to find.
    const c = new SaveService<Profile>({ backend, config: config() });
    expect((await c.load()).source).toBe("primary");
    rec.dispose();
  });

  it("detects a silently tampered payload via the checksum", async () => {
    const backend = new MemoryBackend();
    const a = new SaveService<Profile>({ backend, config: config() });
    const st = (await a.load()).data;
    st.gold = 10;
    await a.flush();

    const env = JSON.parse(backend.peek("save:main") as string) as Record<string, unknown>;
    env.d = JSON.stringify({ name: "Wren", gold: 99999999, inventory: [] }); // checksum untouched
    backend.poke("save:main", JSON.stringify(env));

    const b = new SaveService<Profile>({ backend, config: config() });
    const loaded = await b.load();
    expect(loaded.source).not.toBe("primary");
    expect(loaded.rejected.some((r) => r.reason === "checksum mismatch")).toBe(true);
  });

  it("rejects a foreign blob rather than adopting it", async () => {
    const backend = new MemoryBackend();
    backend.poke("save:main", JSON.stringify({ m: "SOMEOTHERGAME", v: 1, c: "0", d: "{}" }));
    const s = new SaveService<Profile>({ backend, config: config() });
    const loaded = await s.load();
    expect(loaded.source).toBe("fresh");
    expect(loaded.rejected[0]?.reason).toBe("bad magic");
  });

  it("falls through to a daily snapshot when primary AND backup are dead", async () => {
    const backend = new MemoryBackend();
    const clock = fakeClock("2026-03-01T09:00:00Z");
    const a = new SaveService<Profile>({ backend, config: config(), now: clock.now });
    const st = (await a.load()).data;
    st.gold = 42;
    await a.flush(); // also lays down daily:2026-03-01

    backend.poke("save:main", "not json at all");
    backend.poke("save:backup", "also not json");

    const b = new SaveService<Profile>({ backend, config: config(), now: clock.now });
    const loaded = await b.load();
    expect(loaded.source).toBe("daily");
    expect(loaded.data.gold).toBe(42);
  });

  it("keeps the live slot intact when the promotion write fails", async () => {
    const inner = new MemoryBackend();
    const backend = new FlakyBackend(inner);
    const a = new SaveService<Profile>({ backend, config: config() });
    const st = (await a.load()).data;
    st.gold = 7;
    await a.flush();
    const good = inner.peek("save:main");

    backend.failWritesTo = "save:main";
    st.gold = 999;
    await a.flush(); // rejects internally, must not corrupt anything

    expect(inner.peek("save:main")).toBe(good);
    const b = new SaveService<Profile>({ backend, config: config() });
    expect((await b.load()).data.gold).toBe(7);
  });
});

describe("save · migrations", () => {
  const buildChain = (log: number[]): Migration[] => [
    // Deliberately supplied out of order — the service must sort them.
    {
      to: 3,
      up(d) {
        log.push(3);
        return { ...d, inventory: [{ id: String(d.item ?? "none"), qty: 1 }], item: undefined };
      },
    },
    {
      to: 2,
      up(d) {
        log.push(2);
        return { ...d, gold: Number(d.coins ?? 0) * 10, coins: undefined };
      },
    },
  ];

  it("runs the chain in ascending order, exactly once each", async () => {
    const log: number[] = [];
    const backend = new MemoryBackend();
    backend.poke("save:main", rawEnvelope(1, { name: "Old", coins: 5, item: "item_yew" }));

    const s = new SaveService<Profile>({
      backend,
      config: config({ version: 3, migrations: buildChain(log) }),
    });
    const loaded = await s.load();

    expect(log).toEqual([2, 3]);
    expect(loaded.migrated).toEqual([2, 3]);
    expect(loaded.foundVersion).toBe(1);
    expect(loaded.data.gold).toBe(50);
    expect(loaded.data.inventory).toEqual([{ id: "item_yew", qty: 1 }]);
  });

  it("re-writes the migrated save at the new version so it only runs once", async () => {
    const log: number[] = [];
    const backend = new MemoryBackend();
    backend.poke("save:main", rawEnvelope(1, { name: "Old", coins: 5, item: "item_yew" }));

    const a = new SaveService<Profile>({
      backend,
      config: config({ version: 3, migrations: buildChain(log) }),
    });
    await a.load();
    const b = new SaveService<Profile>({
      backend,
      config: config({ version: 3, migrations: buildChain(log) }),
    });
    const second = await b.load();
    expect(second.migrated).toEqual([]);
    expect(log).toEqual([2, 3]); // not re-run
  });

  it("refuses a chain with a gap instead of eating the data", () => {
    expect(() => runMigrations({ a: 1 }, 1, 3, [{ to: 3, up: (d) => d }])).toThrow(/gap/);
  });

  it("refuses a save from a newer build", async () => {
    const backend = new MemoryBackend();
    backend.poke("save:main", rawEnvelope(9, { name: "FromTheFuture", gold: 1 }));
    const s = new SaveService<Profile>({ backend, config: config({ version: 1 }) });
    const loaded = await s.load();
    expect(loaded.source).toBe("fresh");
    expect(loaded.rejected[0]?.reason).toMatch(/newer build/);
  });

  it("runMigrations is pure and ordered", () => {
    const seen: number[] = [];
    const out = runMigrations({ n: 0 }, 1, 4, [
      { to: 4, up: (d) => (seen.push(4), { ...d, n: Number(d.n) + 4 }) },
      { to: 2, up: (d) => (seen.push(2), { ...d, n: Number(d.n) + 2 }) },
      { to: 3, up: (d) => (seen.push(3), { ...d, n: Number(d.n) + 3 }) },
    ]);
    expect(seen).toEqual([2, 3, 4]);
    expect(out.data.n).toBe(9);
    expect(out.applied).toEqual([2, 3, 4]);
  });
});

describe("save · hostile import", () => {
  type Loose = Record<string, unknown>;

  /* Written as raw JSON text on purpose: an object literal's __proto__
     sets the prototype and would never survive JSON.stringify, so the
     attack we actually care about has to be spelled out here. */
  const HOSTILE_PAYLOAD = [
    "{",
    '  "name": "<img src=x onerror=\\"alert(1)\\">",',
    '  "gold": 5,',
    '  "inventory": [{ "id": "<script>fetch(\'//evil\')</script>", "qty": 1 }],',
    '  "nested": { "deep": { "note": "</div><iframe src=javascript:alert(1)>" } },',
    '  "__proto__": { "pwned": true },',
    '  "constructor": { "pwned": true },',
    '  " __proto__ ": { "pwned": true },',
    '  "bidi": "Wren\\u202Enimda\\u202C",',
    '  "bad": { "n": 1e999 }',
    "}",
  ].join("\n");

  const hostileCode = () => encodeSaveCode(rawEnvelopeText(1, HOSTILE_PAYLOAD));

  const looseService = (backend: MemoryBackend) =>
    new SaveService<Loose>({
      backend,
      config: { version: 1, createDefault: (): Loose => ({ name: "Castaway", gold: 0 }) },
    });

  it("strips every markup character from player-authored strings", async () => {
    const s = looseService(new MemoryBackend());
    await s.load();

    const data = await s.importCode(hostileCode());
    const asText = JSON.stringify(data);

    expect(data.name).toBe("img src=x onerror=alert(1)");
    // No character that can open a tag, close an attribute or start an
    // entity survives anywhere in the tree.
    expect(asText).not.toMatch(/[<>]/);
    expect(asText).not.toContain("&");
    expect(asText).not.toContain("'");
    expect(asText).not.toContain("`");
    expect(asText).not.toContain("<script");
    expect(asText).not.toContain("javascript:alert(1)>");

    const inv = data.inventory as { id: string }[];
    expect(inv[0]?.id).toBe("scriptfetch(//evil)/script");
  });

  it("cannot pollute Object.prototype through the save code", async () => {
    const s = looseService(new MemoryBackend());
    await s.load();
    const data = await s.importCode(hostileCode());

    expect((({}) as Record<string, unknown>).pwned).toBeUndefined();
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect(Object.keys(data)).not.toContain("__proto__");
    expect(Object.keys(data)).not.toContain("constructor");
    // " __proto__ " trims back to the dangerous form — must also be gone.
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
  });

  it("removes bidi/zero-width spoofing characters from names", () => {
    expect(sanitizeText("Wren\u202Enimda\u202C")).toBe("Wrennimda");
    expect(sanitizeText("a\u200Bb\uFEFFc")).toBe("abc");
    expect(sanitizeText("line\nbreak\ttab")).toBe("line break tab");
    expect(sanitizeText("x".repeat(200), 16)).toHaveLength(16);
  });

  it("rejects non-base64, oversized and truncated codes without throwing weirdly", async () => {
    const backend = new MemoryBackend();
    const s = new SaveService<Profile>({ backend, config: config(), maxImportBytes: 64 });
    await s.load();
    await expect(s.importCode("!!!not base64!!!")).rejects.toThrow(/base64/);
    await expect(s.importCode("")).rejects.toThrow(/empty/);
    await expect(s.importCode("A".repeat(200))).rejects.toThrow(/too large/);
    await expect(s.importCode(encodeSaveCode("{}"))).rejects.toThrow(/rejected/);
  });

  it("survives depth bombs and cycles", () => {
    let bomb: Record<string, unknown> = { end: true };
    for (let i = 0; i < 200; i++) bomb = { next: bomb };
    expect(() => sanitizeDeep(bomb, DEFAULT_SANITIZE_LIMITS)).not.toThrow();

    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const cleaned = sanitizeDeep(cyclic) as Record<string, unknown>;
    expect(cleaned.name).toBe("loop");
    expect(cleaned.self).toBeNull();
  });

  it("normalises NaN/Infinity so the save can never become unserialisable", () => {
    const out = sanitizeDeep({ a: NaN, b: Infinity, c: 3 }) as Record<string, number>;
    expect(out).toEqual({ a: 0, b: 0, c: 3 });
  });
});

describe("save · export / import round trip", () => {
  it("exports a base64 code that re-imports to identical state", async () => {
    const backend = new MemoryBackend();
    const a = new SaveService<Profile>({ backend, config: config() });
    const st = (await a.load()).data;
    st.name = "Wren";
    st.gold = 4242;
    st.inventory = [{ id: "item_tuna", qty: 3 }];
    await a.flush();

    const code = await a.exportCode();
    expect(code).toMatch(/^[A-Za-z0-9+/=]+$/);

    const fresh = new MemoryBackend();
    const b = new SaveService<Profile>({ backend: fresh, config: config() });
    await b.load();
    const imported = await b.importCode(code);

    expect(imported).toEqual({ name: "Wren", gold: 4242, inventory: [{ id: "item_tuna", qty: 3 }] });
    expect(fresh.peek("save:main")).not.toBeNull();
  });

  it("survives non-ASCII names through base64", async () => {
    const backend = new MemoryBackend();
    const a = new SaveService<Profile>({ backend, config: config() });
    const st = (await a.load()).data;
    st.name = "Ruõzhī 島 🐟";
    await a.flush();
    const code = await a.exportCode();

    const b = new SaveService<Profile>({ backend: new MemoryBackend(), config: config() });
    await b.load();
    const imported = await b.importCode(code);
    expect(imported.name).toBe("Ruõzhī 島 🐟");
  });
});

describe("save · autosave scheduling", () => {
  it("debounces markDirty and coalesces a burst into one write", async () => {
    const timers = new FakeTimers();
    const backend = new MemoryBackend();
    const s = new SaveService<Profile>({ backend, config: config(), timers, autosaveMs: 1500 });
    await s.load();

    for (let i = 0; i < 20; i++) s.markDirty();
    expect(s.diagnostics().writes).toBe(0);

    timers.advance(1499);
    expect(s.diagnostics().writes).toBe(0);

    timers.advance(2);
    await settle();
    expect(s.diagnostics().writes).toBe(1);
    expect(s.diagnostics().dirty).toBe(false);
  });

  it("flush() pre-empts a pending debounce instead of writing twice", async () => {
    const timers = new FakeTimers();
    const backend = new MemoryBackend();
    const s = new SaveService<Profile>({ backend, config: config(), timers });
    await s.load();
    s.markDirty();
    await s.flush();
    timers.advance(10_000);
    await settle();
    expect(s.diagnostics().writes).toBe(1);
  });

  it("bindLifecycle flushes on visibilitychange→hidden and on pagehide", async () => {
    const timers = new FakeTimers();
    const backend = new MemoryBackend();
    const s = new SaveService<Profile>({ backend, config: config(), timers });
    await s.load();

    const handlers = new Map<string, () => void>();
    const fakeDoc = {
      visibilityState: "hidden",
      addEventListener: (t: string, fn: () => void) => handlers.set(`doc:${t}`, fn),
      removeEventListener: () => {},
    } as unknown as Document;
    const fakeWin = {
      addEventListener: (t: string, fn: () => void) => handlers.set(`win:${t}`, fn),
      removeEventListener: () => {},
    } as unknown as Window;

    const unbind = s.bindLifecycle(fakeDoc, fakeWin);
    s.markDirty();
    handlers.get("doc:visibilitychange")?.();
    await settle();
    expect(s.diagnostics().writes).toBe(1);

    s.markDirty();
    handlers.get("win:pagehide")?.();
    await settle();
    expect(s.diagnostics().writes).toBe(2);
    unbind();
  });
});

describe("save · daily snapshots", () => {
  it("writes one snapshot per calendar day and prunes to the cap", async () => {
    const backend = new MemoryBackend();
    const clock = fakeClock("2026-03-01T08:00:00Z");
    const s = new SaveService<Profile>({
      backend,
      config: config(),
      now: clock.now,
      maxDailySnapshots: 2,
    });
    await s.load();

    await s.flush();
    await s.flush(); // same day → still one snapshot
    expect((await backend.list("save:daily:")).length).toBe(1);

    clock.addDays(1);
    await s.flush();
    clock.addDays(1);
    await s.flush();
    clock.addDays(1);
    await s.flush();

    const keys = (await backend.list("save:daily:")).sort();
    expect(keys.length).toBe(2);
    expect(keys).toEqual(["save:daily:2026-03-03", "save:daily:2026-03-04"]);
  });
});

describe("save · cloud seam", () => {
  it("mirrors writes to the remote backend and reports the newer side", async () => {
    const local = new MemoryBackend();
    const remote = new MemoryBackend();
    const s = new SaveService<Profile>({ backend: local, remote, config: config() });
    const st = (await s.load()).data;
    st.gold = 5;
    await s.flush();

    expect(remote.peek("save:main")).toBe(local.peek("save:main"));
    expect((await s.compareRemote()).winner).toBe("equal");
  });

  it("adopts a newer remote save on pullRemote()", async () => {
    const local = new MemoryBackend();
    const remote = new MemoryBackend();
    remote.poke(
      "save:main",
      rawEnvelope(1, { name: "CloudWren", gold: 777, inventory: [] }, 99),
    );
    const s = new SaveService<Profile>({ backend: local, remote, config: config() });
    await s.load();
    expect((await s.compareRemote()).winner).toBe("remote");

    const pulled = await s.pullRemote();
    expect(pulled?.gold).toBe(777);
    const verify = new SaveService<Profile>({ backend: local, config: config() });
    expect((await verify.load()).data.gold).toBe(777);
  });

  it("a failing remote never breaks the local write", async () => {
    const local = new MemoryBackend();
    const remote = new FlakyBackend(new MemoryBackend());
    remote.failWritesTo = "save:main";
    const s = new SaveService<Profile>({
      backend: local,
      remote,
      config: config(),
      logger: { warn: () => {}, error: () => {}, info: () => {} },
    });
    const st = (await s.load()).data;
    st.gold = 3;
    await s.flush();
    expect(s.diagnostics().writes).toBe(1);
    expect(local.peek("save:main")).not.toBeNull();
  });
});

describe("save · wipe", () => {
  it("removes every slot", async () => {
    const backend = new MemoryBackend();
    const s = new SaveService<Profile>({ backend, config: config() });
    await s.load();
    await s.flush();
    await s.wipe();
    expect(Object.keys(backend.snapshot())).toEqual([]);
  });
});
