import { describe, expect, it } from "vitest";
import { LocalStorageBackend, MemoryBackend } from "../storage";
import type { SaveBackend } from "../storage";

/** Minimal Storage stand-in — no jsdom needed to exercise the fallback. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

/** Both backends must behave identically — that is what makes them swappable. */
function contract(name: string, make: () => SaveBackend) {
  describe(`storage · ${name}`, () => {
    it("round-trips a value", async () => {
      const b = make();
      expect(await b.get("a")).toBeNull();
      await b.set("a", "hello");
      expect(await b.get("a")).toBe("hello");
    });

    it("deletes", async () => {
      const b = make();
      await b.set("a", "1");
      await b.delete("a");
      expect(await b.get("a")).toBeNull();
    });

    it("lists by prefix only", async () => {
      const b = make();
      await b.set("save:daily:2026-01-01", "x");
      await b.set("save:daily:2026-01-02", "y");
      await b.set("save:main", "z");
      expect((await b.list("save:daily:")).sort()).toEqual([
        "save:daily:2026-01-01",
        "save:daily:2026-01-02",
      ]);
    });

    it("overwrites rather than appending", async () => {
      const b = make();
      await b.set("k", "one");
      await b.set("k", "two");
      expect(await b.get("k")).toBe("two");
    });

    it("survives an empty string value", async () => {
      const b = make();
      await b.set("k", "");
      expect(await b.get("k")).toBe("");
    });
  });
}

contract("memory", () => new MemoryBackend());
contract("localStorage", () => new LocalStorageBackend(fakeStorage()));

describe("storage · localStorage resilience", () => {
  it("returns null instead of throwing when the store is hostile", async () => {
    const hostile = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    } as unknown as Storage;
    const b = new LocalStorageBackend(hostile);
    expect(await b.get("anything")).toBeNull();
  });
});
