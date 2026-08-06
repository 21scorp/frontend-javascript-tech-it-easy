/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/storage.ts
   The one seam the save system talks through.

   WHY a key/value interface and not "just use IndexedDB":
     • Safari private mode and some in-app webviews hand you an
       IndexedDB that opens and then never fires an event. We need
       to be able to fall back without the save logic knowing.
     • A future cloud-sync layer is *also* just a key/value store.
       It implements this same interface and slots in as `remote`
       on SaveService — no rewrite of the save logic.
     • Tests need a synchronous, inspectable, corruptible store.

   Everything is async and string-valued. Keys are opaque.
   ═══════════════════════════════════════════════════════════════ */

export interface SaveBackend {
  /** Human name, surfaced in diagnostics ("indexeddb", "localstorage", …). */
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys beginning with `prefix`. Used to prune daily snapshots. */
  list(prefix: string): Promise<string[]>;
}

/* ── memory ──────────────────────────────────────────────────── */

/** Last-resort backend. Also the test double. Never persists. */
export class MemoryBackend implements SaveBackend {
  readonly name = "memory";
  private map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }

  /* — test/diagnostic affordances — */
  /** Raw peek without going through the async path. */
  peek(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  /** Deliberately damage a slot, to prove recovery works. */
  poke(key: string, value: string): void {
    this.map.set(key, value);
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}

/* ── localStorage ────────────────────────────────────────────── */

/**
 * Synchronous under the hood, so a big save blocks the main thread —
 * acceptable as a fallback, never as the primary on a 60fps game.
 */
export class LocalStorageBackend implements SaveBackend {
  readonly name = "localstorage";
  constructor(private readonly store: Storage) {}

  static isAvailable(): boolean {
    try {
      const probe = "__tidefall_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return this.store.getItem(key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    this.store.setItem(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.removeItem(key);
  }
  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < this.store.length; i++) {
      const k = this.store.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
    return out;
  }
}

/* ── IndexedDB ───────────────────────────────────────────────── */

const IDB_OPEN_TIMEOUT_MS = 2500;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb request failed"));
  });
}

export class IndexedDbBackend implements SaveBackend {
  readonly name = "indexeddb";
  private db: IDBDatabase | null = null;

  private constructor(db: IDBDatabase, private readonly storeName: string) {
    this.db = db;
    // A version change from another tab invalidates our handle; drop it
    // rather than writing into a closing database.
    db.onversionchange = () => {
      db.close();
      this.db = null;
    };
  }

  /**
   * Resolves null instead of throwing — callers pick the next backend.
   * The timeout exists because private-mode webviews can hang `open()`
   * forever with neither success nor error.
   */
  static async open(dbName = "tidefall", storeName = "kv"): Promise<IndexedDbBackend | null> {
    if (typeof indexedDB === "undefined") return null;
    try {
      const db = await new Promise<IDBDatabase | null>((resolve) => {
        let settled = false;
        const done = (v: IDBDatabase | null) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };
        const timer = globalThis.setTimeout(() => done(null), IDB_OPEN_TIMEOUT_MS);
        let req: IDBOpenDBRequest;
        try {
          req = indexedDB.open(dbName, 1);
        } catch {
          globalThis.clearTimeout(timer);
          done(null);
          return;
        }
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(storeName)) d.createObjectStore(storeName);
        };
        req.onsuccess = () => {
          globalThis.clearTimeout(timer);
          done(req.result);
        };
        req.onerror = () => {
          globalThis.clearTimeout(timer);
          done(null);
        };
        req.onblocked = () => {
          globalThis.clearTimeout(timer);
          done(null);
        };
      });
      if (!db) return null;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return null;
      }
      return new IndexedDbBackend(db, storeName);
    } catch {
      return null;
    }
  }

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error("indexeddb handle closed");
    return this.db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get(key: string): Promise<string | null> {
    const v = await request<unknown>(this.tx("readonly").get(key));
    return typeof v === "string" ? v : null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = this.tx("readwrite");
    await new Promise<void>((resolve, reject) => {
      const t = store.transaction;
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error("idb write failed"));
      t.onabort = () => reject(t.error ?? new Error("idb write aborted"));
      store.put(value, key);
    });
  }

  async delete(key: string): Promise<void> {
    const store = this.tx("readwrite");
    await new Promise<void>((resolve, reject) => {
      const t = store.transaction;
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error("idb delete failed"));
      store.delete(key);
    });
  }

  async list(prefix: string): Promise<string[]> {
    const keys = await request<IDBValidKey[]>(this.tx("readonly").getAllKeys());
    return keys.filter((k): k is string => typeof k === "string" && k.startsWith(prefix));
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

/* ── picker ──────────────────────────────────────────────────── */

/**
 * IndexedDB → localStorage → memory. Runs once at boot; the chosen
 * backend is then a plain value you hand to SaveService.
 */
export async function openBestBackend(dbName = "tidefall"): Promise<SaveBackend> {
  const idb = await IndexedDbBackend.open(dbName);
  if (idb) return idb;
  if (typeof localStorage !== "undefined" && LocalStorageBackend.isAvailable()) {
    return new LocalStorageBackend(localStorage);
  }
  return new MemoryBackend();
}
