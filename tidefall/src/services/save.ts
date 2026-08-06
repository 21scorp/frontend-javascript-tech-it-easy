/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/save.ts
   Losing a player's progress is the one bug you never recover from.
   Everything here exists because of a specific way saves die:

     • Half-written blob (browser killed mid-write on backgrounding)
         → we never overwrite the live slot. Write to STAGING, read
           it back, verify, copy the old live slot to BACKUP, then
           promote. A kill at any point leaves one intact slot.
     • Silent bit-rot / a tab writing garbage
         → every envelope carries a checksum of its payload text.
           Mismatch = corrupt, and corrupt = fall through to BACKUP,
           then to the newest DAILY snapshot, then to a fresh profile.
     • "I got greedy and edited my save"
         → import sanitises every string in the tree. A save code is
           untrusted input from the internet, full stop. Names get
           markup-stripped so a crafted code can never inject.
     • Schema drift across releases
         → an ordered migration chain, v1→v2→v3…, replayed on load.

   The payload is stored as a JSON *string* inside the envelope, not
   as a nested object: that makes the checksum byte-exact and immune
   to JSON key-reordering on reparse.

   CLOUD: SaveBackend (storage.ts) is the whole seam. A cloud store
   implements it and is passed as `remote`; writes mirror to it
   best-effort and `pull()` compares write counters to decide winner.
   ═══════════════════════════════════════════════════════════════ */

import type { EventBus } from "../core/contracts";
import type { SaveBackend } from "./storage";
import { realTimers, wallClock } from "./timing";
import type { Clock, TimerApi } from "./timing";

/* ── envelope ────────────────────────────────────────────────── */

export const SAVE_MAGIC = "TIDEFALL";

export interface SaveEnvelope {
  /** Format marker — refuses foreign blobs pasted into the import box. */
  m: typeof SAVE_MAGIC;
  /** Schema version of the payload. */
  v: number;
  /** Wall-clock ms at write. Informational; `n` decides conflicts. */
  t: number;
  /** Monotonic write counter. Newest wins on cloud conflict. */
  n: number;
  /** Checksum of `d` exactly as stored. */
  c: string;
  /** JSON text of the game state. */
  d: string;
}

export type SaveSource = "primary" | "backup" | "daily" | "remote" | "fresh";

export interface LoadResult<T> {
  data: T;
  source: SaveSource;
  /** Version found on disk before migrations, when there was one. */
  foundVersion?: number;
  /** Migration `to` values that actually ran, in order. */
  migrated: number[];
  /** Slots we had to skip because they failed verification. */
  rejected: { slot: string; reason: string }[];
}

/* ── checksum ────────────────────────────────────────────────── */

/** FNV-1a 32-bit. Integrity, not security — cheap and dependency free. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* ── base64 (unicode safe) ───────────────────────────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSaveCode(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function decodeSaveCode(code: string): string {
  return new TextDecoder().decode(base64ToBytes(code.replace(/\s+/g, "")));
}

/* ── sanitising ──────────────────────────────────────────────── */

/**
 * Characters that let a string escape its container once rendered, plus
 * the invisible ones used for bidi/homoglyph spoofing in player names.
 */
const MARKUP = /[<>&"'`\\]/g;
const WHITESPACE_CONTROL = /[\t\n\v\f\r\u0085]/g;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * The single chokepoint for player-authored text. UI may render the
 * result of this into `textContent` *or* innerHTML and still be safe.
 */
export function sanitizeText(input: string, maxLen = 64): string {
  return input
    // Tabs/newlines become a space first: "Wren\nSmith" should read as
    // two words, not "WrenSmith". Only *then* are controls dropped.
    .replace(WHITESPACE_CONTROL, " ")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(MARKUP, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export interface SanitizeLimits {
  maxDepth: number;
  maxNodes: number;
  maxStringLen: number;
  maxArrayLen: number;
  maxKeys: number;
}

export const DEFAULT_SANITIZE_LIMITS: SanitizeLimits = {
  maxDepth: 16,
  maxNodes: 100_000,
  maxStringLen: 256,
  maxArrayLen: 10_000,
  maxKeys: 1024,
};

/** Keys that can poison Object.prototype if assigned blindly. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Deep-clones untrusted data into a value made only of plain objects,
 * arrays, finite numbers, booleans, null and sanitised strings.
 * Anything else (functions, symbols, NaN, cycles, prototype tricks,
 * absurd depth) is dropped rather than trusted.
 */
export function sanitizeDeep(
  value: unknown,
  limits: SanitizeLimits = DEFAULT_SANITIZE_LIMITS,
): unknown {
  let nodes = 0;
  const seen = new WeakSet<object>();

  const walk = (v: unknown, depth: number): unknown => {
    if (depth > limits.maxDepth) return null;
    if (++nodes > limits.maxNodes) return null;

    if (v === null) return null;
    const t = typeof v;
    if (t === "string") return sanitizeText(v as string, limits.maxStringLen);
    if (t === "number") return Number.isFinite(v) ? (v as number) : 0;
    if (t === "boolean") return v as boolean;
    if (t !== "object") return null; // function, symbol, bigint, undefined

    const obj = v as object;
    if (seen.has(obj)) return null; // cycle
    seen.add(obj);

    if (Array.isArray(obj)) {
      const src = obj.slice(0, limits.maxArrayLen);
      const out: unknown[] = [];
      for (const item of src) out.push(walk(item, depth + 1));
      return out;
    }

    const out: Record<string, unknown> = {};
    let kept = 0;
    for (const rawKey of Object.keys(obj)) {
      if (kept >= limits.maxKeys) break;
      // Checked before AND after sanitising: " __proto__ " trims back
      // into the dangerous form, and plain assignment would then hit
      // the prototype setter instead of creating a property.
      if (FORBIDDEN_KEYS.has(rawKey)) continue;
      const key = sanitizeText(rawKey, 64);
      if (!key || FORBIDDEN_KEYS.has(key)) continue;
      Object.defineProperty(out, key, {
        value: walk((obj as Record<string, unknown>)[rawKey], depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
      kept++;
    }
    return out;
  };

  return walk(value, 0);
}

/* ── migrations ──────────────────────────────────────────────── */

export type SaveData = Record<string, unknown>;

export interface Migration {
  /** Schema version this migration produces. Chain runs ascending. */
  readonly to: number;
  readonly note?: string;
  up(data: SaveData): SaveData;
}

export class SaveTooNewError extends Error {
  constructor(readonly found: number, readonly supported: number) {
    super(`save is from a newer build (v${found} > v${supported})`);
    this.name = "SaveTooNewError";
  }
}

/**
 * Replays the chain from `from` up to `target`. Ascending, exactly once
 * each, and a gap in the chain is a hard error — silently skipping a
 * migration is how you ship a build that eats inventories.
 */
export function runMigrations(
  data: SaveData,
  from: number,
  target: number,
  migrations: readonly Migration[],
): { data: SaveData; applied: number[] } {
  if (from > target) throw new SaveTooNewError(from, target);
  const chain = [...migrations].sort((a, b) => a.to - b.to);
  let cur = data;
  let version = from;
  const applied: number[] = [];
  for (const m of chain) {
    if (m.to <= version) continue;
    if (m.to > target) break;
    if (m.to !== version + 1) {
      throw new Error(`migration chain gap: v${version} → v${m.to}`);
    }
    cur = m.up(cur);
    version = m.to;
    applied.push(m.to);
  }
  if (version !== target) {
    throw new Error(`migration chain incomplete: stopped at v${version}, need v${target}`);
  }
  return { data: cur, applied };
}

/* ── service ─────────────────────────────────────────────────── */

export interface SaveConfig<T extends object> {
  /** Highest schema version this build understands. */
  version: number;
  /** Ordered v(n-1)→v(n) steps. Sorted defensively at load. */
  migrations?: readonly Migration[];
  /** Fresh profile when nothing recoverable exists. */
  createDefault(): T;
  /** Cheap structural check after migration; false = treat as corrupt. */
  validate?(data: unknown): boolean;
  /** Key namespace, so dev/test/prod profiles never collide. */
  namespace?: string;
}

export interface SaveServiceOptions<T extends object> {
  backend: SaveBackend;
  config: SaveConfig<T>;
  bus?: EventBus;
  /** Cloud mirror. Same interface — see storage.ts. */
  remote?: SaveBackend;
  /** Wall clock, injected for deterministic daily-snapshot tests. */
  now?: Clock;
  timers?: TimerApi;
  /** Debounce window for markDirty() → write. */
  autosaveMs?: number;
  maxDailySnapshots?: number;
  sanitizeLimits?: SanitizeLimits;
  /** Hard cap on an imported code, so paste-bombs can't OOM the tab. */
  maxImportBytes?: number;
  logger?: Pick<Console, "warn" | "error" | "info">;
}

export interface SaveDiagnostics {
  backend: string;
  writes: number;
  lastWriteAt: number | null;
  lastSource: SaveSource | null;
  dirty: boolean;
  counter: number;
}

export interface RemoteComparison {
  /** Which copy has the higher write counter. */
  winner: "local" | "remote" | "equal" | "none";
  localCounter: number;
  remoteCounter: number;
}

const K = {
  main: "save:main",
  backup: "save:backup",
  staging: "save:staging",
  meta: "save:meta",
  dailyPrefix: "save:daily:",
};

interface MetaRecord {
  lastDaily?: string;
  counter?: number;
}

export class SaveService<T extends object> {
  private readonly backend: SaveBackend;
  private readonly remote?: SaveBackend;
  private readonly cfg: SaveConfig<T>;
  private readonly bus?: EventBus;
  private readonly now: Clock;
  private readonly timers: TimerApi;
  private readonly autosaveMs: number;
  private readonly maxDaily: number;
  private readonly limits: SanitizeLimits;
  private readonly maxImportBytes: number;
  private readonly log: Pick<Console, "warn" | "error" | "info">;
  private readonly ns: string;

  private current: T | null = null;
  private counter = 0;
  private writes = 0;
  private lastWriteAt: number | null = null;
  private lastSource: SaveSource | null = null;
  private dirty = false;
  private debounceHandle: number | null = null;
  /** Serialises writes — two concurrent flushes must never interleave. */
  private chain: Promise<void> = Promise.resolve();
  private unbindLifecycle: (() => void) | null = null;

  constructor(opts: SaveServiceOptions<T>) {
    this.backend = opts.backend;
    this.remote = opts.remote;
    this.cfg = opts.config;
    this.bus = opts.bus;
    this.now = opts.now ?? wallClock;
    this.timers = opts.timers ?? realTimers;
    this.autosaveMs = opts.autosaveMs ?? 1500;
    this.maxDaily = opts.maxDailySnapshots ?? 3;
    this.limits = opts.sanitizeLimits ?? DEFAULT_SANITIZE_LIMITS;
    this.maxImportBytes = opts.maxImportBytes ?? 1_000_000;
    this.log = opts.logger ?? console;
    this.ns = opts.config.namespace ? `${opts.config.namespace}:` : "";
  }

  private key(k: string): string {
    return this.ns + k;
  }

  /* ── reading ──────────────────────────────────────────────── */

  /**
   * Tries primary → backup → newest daily → fresh. A slot that fails
   * verification is recorded and skipped, never thrown from.
   * On recovery the healthy copy is immediately re-promoted to primary
   * so the next crash has a good slot to find.
   */
  async load(): Promise<LoadResult<T>> {
    const rejected: { slot: string; reason: string }[] = [];
    const meta = await this.readMeta();
    this.counter = meta.counter ?? 0;

    const daily = await this.listDailyKeys();
    const order: { slot: SaveSource; key: string }[] = [
      { slot: "primary", key: this.key(K.main) },
      { slot: "backup", key: this.key(K.backup) },
      ...daily.reverse().map((k) => ({ slot: "daily" as SaveSource, key: k })),
    ];

    for (const { slot, key } of order) {
      let raw: string | null = null;
      try {
        raw = await this.backend.get(key);
      } catch (e) {
        rejected.push({ slot: key, reason: `read failed: ${String(e)}` });
        continue;
      }
      if (raw === null) continue;

      const parsed = this.decodeEnvelope(raw);
      if (!parsed.ok) {
        rejected.push({ slot: key, reason: parsed.reason });
        this.bus?.emit("save:corrupt", { slot: key, reason: parsed.reason });
        this.log.warn(`[save] rejecting ${key}: ${parsed.reason}`);
        continue;
      }

      const migrated = this.migrateAndValidate(parsed.env);
      if (!migrated.ok) {
        rejected.push({ slot: key, reason: migrated.reason });
        this.bus?.emit("save:corrupt", { slot: key, reason: migrated.reason });
        this.log.warn(`[save] rejecting ${key}: ${migrated.reason}`);
        continue;
      }

      this.current = migrated.data as T;
      this.counter = Math.max(this.counter, parsed.env.n);
      this.lastSource = slot;

      if (slot !== "primary") {
        this.log.warn(`[save] recovered from ${slot} (${key})`);
        this.bus?.emit("save:recovered", { source: slot, key });
        // Re-promote immediately; do not wait for the next autosave.
        await this.writeNow("recovery");
      } else if (migrated.applied.length) {
        await this.writeNow("migration");
      }

      const result: LoadResult<T> = {
        data: this.current,
        source: slot,
        foundVersion: parsed.env.v,
        migrated: migrated.applied,
        rejected,
      };
      this.bus?.emit("save:loaded", result);
      return result;
    }

    this.current = this.cfg.createDefault();
    this.lastSource = "fresh";
    const fresh: LoadResult<T> = { data: this.current, source: "fresh", migrated: [], rejected };
    this.bus?.emit("save:loaded", fresh);
    return fresh;
  }

  private decodeEnvelope(
    raw: string,
  ): { ok: true; env: SaveEnvelope } | { ok: false; reason: string } {
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "unparseable json" };
    }
    if (!obj || typeof obj !== "object") return { ok: false, reason: "not an object" };
    const e = obj as Partial<SaveEnvelope>;
    if (e.m !== SAVE_MAGIC) return { ok: false, reason: "bad magic" };
    if (typeof e.v !== "number" || !Number.isInteger(e.v) || e.v < 1) {
      return { ok: false, reason: "bad version" };
    }
    if (typeof e.d !== "string") return { ok: false, reason: "missing payload" };
    if (typeof e.c !== "string") return { ok: false, reason: "missing checksum" };
    if (checksum(e.d) !== e.c) return { ok: false, reason: "checksum mismatch" };
    return {
      ok: true,
      env: {
        m: SAVE_MAGIC,
        v: e.v,
        t: typeof e.t === "number" ? e.t : 0,
        n: typeof e.n === "number" ? e.n : 0,
        c: e.c,
        d: e.d,
      },
    };
  }

  private migrateAndValidate(
    env: SaveEnvelope,
  ): { ok: true; data: SaveData; applied: number[] } | { ok: false; reason: string } {
    let payload: unknown;
    try {
      payload = JSON.parse(env.d);
    } catch {
      return { ok: false, reason: "payload not json" };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, reason: "payload not an object" };
    }
    let migrated: { data: SaveData; applied: number[] };
    try {
      migrated = runMigrations(
        payload as SaveData,
        env.v,
        this.cfg.version,
        this.cfg.migrations ?? [],
      );
    } catch (e) {
      return { ok: false, reason: `migration failed: ${(e as Error).message}` };
    }
    if (this.cfg.validate && !this.cfg.validate(migrated.data)) {
      return { ok: false, reason: "failed validate()" };
    }
    return { ok: true, ...migrated };
  }

  /* ── writing ──────────────────────────────────────────────── */

  /** The live state object. Mutate it, then call markDirty(). */
  getState(): T {
    if (!this.current) throw new Error("SaveService.load() has not completed");
    return this.current;
  }

  /** Replace wholesale (e.g. after an import) and schedule a write. */
  commit(next: T): void {
    this.current = next;
    this.markDirty();
  }

  /** Debounced autosave. Cheap — call it from anywhere state changes. */
  markDirty(): void {
    this.dirty = true;
    if (this.debounceHandle !== null) this.timers.clearTimeout(this.debounceHandle);
    this.debounceHandle = this.timers.setTimeout(() => {
      this.debounceHandle = null;
      void this.flush("autosave");
    }, this.autosaveMs);
  }

  /** Force a write now (and drain any pending debounce). */
  flush(reason = "manual"): Promise<void> {
    if (this.debounceHandle !== null) {
      this.timers.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    if (!this.current) return Promise.resolve();
    return this.writeNow(reason);
  }

  private writeNow(reason: string): Promise<void> {
    // Chain rather than parallelise: staging→promote is not reentrant.
    this.chain = this.chain.then(() => this.performWrite(reason)).catch((e) => {
      this.log.error("[save] write failed", e);
      this.bus?.emit("save:error", { reason, error: String(e) });
    });
    return this.chain;
  }

  private async performWrite(reason: string): Promise<void> {
    const state = this.current;
    if (!state) return;

    const payload = JSON.stringify(state);
    this.counter += 1;
    const env: SaveEnvelope = {
      m: SAVE_MAGIC,
      v: this.cfg.version,
      t: this.now(),
      n: this.counter,
      c: checksum(payload),
      d: payload,
    };
    const text = JSON.stringify(env);

    // 1. staging — a torn write here costs nothing.
    await this.backend.set(this.key(K.staging), text);
    // 2. verify what actually landed on the device.
    const readback = await this.backend.get(this.key(K.staging));
    if (readback !== text) throw new Error("staging verification failed");
    // 3. demote the current live slot to backup (if it was healthy).
    const live = await this.backend.get(this.key(K.main));
    if (live !== null && this.decodeEnvelope(live).ok) {
      await this.backend.set(this.key(K.backup), live);
    }
    // 4. promote.
    await this.backend.set(this.key(K.main), text);
    await this.backend.delete(this.key(K.staging));

    this.dirty = false;
    this.writes += 1;
    this.lastWriteAt = env.t;

    await this.maybeDaily(text, env.t);
    await this.writeMeta({ counter: this.counter });

    this.bus?.emit("save:written", { reason, counter: env.n, bytes: text.length });

    if (this.remote) {
      // Best effort; never let the cloud break local persistence.
      try {
        await this.remote.set(this.key(K.main), text);
        this.bus?.emit("save:remote:pushed", { counter: env.n });
      } catch (e) {
        this.log.warn("[save] remote push failed", e);
        this.bus?.emit("save:remote:error", { error: String(e) });
      }
    }
  }

  /* ── daily snapshots ──────────────────────────────────────── */

  private dayStamp(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  /**
   * One immutable snapshot per calendar day, pruned to the newest few.
   * Catches the slow disasters: a bad migration or an exploit that
   * corrupts state gradually, where primary *and* backup are both wrong.
   */
  private async maybeDaily(text: string, at: number): Promise<void> {
    const today = this.dayStamp(at);
    const meta = await this.readMeta();
    if (meta.lastDaily === today) return;
    await this.backend.set(this.key(K.dailyPrefix + today), text);
    await this.writeMeta({ lastDaily: today });
    const keys = await this.listDailyKeys();
    const excess = keys.length - this.maxDaily;
    for (let i = 0; i < excess; i++) {
      const k = keys[i];
      if (k) await this.backend.delete(k);
    }
  }

  private async listDailyKeys(): Promise<string[]> {
    try {
      const keys = await this.backend.list(this.key(K.dailyPrefix));
      return keys.sort(); // ISO dates sort lexicographically = chronologically
    } catch {
      return [];
    }
  }

  private async readMeta(): Promise<MetaRecord> {
    try {
      const raw = await this.backend.get(this.key(K.meta));
      if (!raw) return {};
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" ? (v as MetaRecord) : {};
    } catch {
      return {};
    }
  }

  private async writeMeta(patch: MetaRecord): Promise<void> {
    const meta = { ...(await this.readMeta()), ...patch };
    await this.backend.set(this.key(K.meta), JSON.stringify(meta));
  }

  /* ── lifecycle ────────────────────────────────────────────── */

  /**
   * On mobile there is no reliable "app is closing" event. `pagehide`
   * and a `visibilitychange` to hidden are the last moments we are
   * guaranteed to run, so both force a synchronous-ish flush.
   */
  bindLifecycle(doc: Document = document, win: Window = window): () => void {
    const onHide = () => {
      if (this.dirty || this.debounceHandle !== null) void this.flush("lifecycle");
    };
    const onVis = () => {
      if (doc.visibilityState === "hidden") onHide();
    };
    doc.addEventListener("visibilitychange", onVis);
    win.addEventListener("pagehide", onHide);
    win.addEventListener("freeze", onHide);
    win.addEventListener("blur", onHide);
    this.unbindLifecycle = () => {
      doc.removeEventListener("visibilitychange", onVis);
      win.removeEventListener("pagehide", onHide);
      win.removeEventListener("freeze", onHide);
      win.removeEventListener("blur", onHide);
    };
    return this.unbindLifecycle;
  }

  destroy(): void {
    if (this.debounceHandle !== null) this.timers.clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    this.unbindLifecycle?.();
    this.unbindLifecycle = null;
  }

  /* ── export / import ──────────────────────────────────────── */

  /** Base64 of the current envelope. Safe to paste into a text field. */
  async exportCode(): Promise<string> {
    if (!this.current) throw new Error("nothing to export");
    const payload = JSON.stringify(this.current);
    const env: SaveEnvelope = {
      m: SAVE_MAGIC,
      v: this.cfg.version,
      t: this.now(),
      n: this.counter,
      c: checksum(payload),
      d: payload,
    };
    return encodeSaveCode(JSON.stringify(env));
  }

  /**
   * Untrusted input. Order matters: decode → shape-check → migrate →
   * SANITISE → validate. Sanitising after migration means old-format
   * strings are cleaned too, and a migration can never be handed a
   * hostile string it forwards verbatim into the new schema.
   */
  async importCode(code: string, opts: { persist?: boolean } = {}): Promise<T> {
    const trimmed = code.replace(/\s+/g, "");
    if (!trimmed) throw new Error("empty save code");
    if (trimmed.length > this.maxImportBytes) throw new Error("save code too large");
    if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) throw new Error("save code is not valid base64");

    let text: string;
    try {
      text = decodeSaveCode(trimmed);
    } catch {
      throw new Error("save code is not valid base64");
    }

    const parsed = this.decodeEnvelope(text);
    if (!parsed.ok) throw new Error(`save code rejected: ${parsed.reason}`);

    const migrated = this.migrateAndValidate(parsed.env);
    if (!migrated.ok) throw new Error(`save code rejected: ${migrated.reason}`);

    const clean = sanitizeDeep(migrated.data, this.limits);
    if (!clean || typeof clean !== "object" || Array.isArray(clean)) {
      throw new Error("save code rejected: sanitised to nothing");
    }
    if (this.cfg.validate && !this.cfg.validate(clean)) {
      throw new Error("save code rejected: failed validate()");
    }

    const data = clean as T;
    this.current = data;
    this.bus?.emit("save:imported", { version: parsed.env.v, migrated: migrated.applied });
    if (opts.persist !== false) await this.flush("import");
    return data;
  }

  /* ── cloud seam ───────────────────────────────────────────── */

  /** Which side is newer, without applying anything. */
  async compareRemote(): Promise<RemoteComparison> {
    const localCounter = this.counter;
    if (!this.remote) return { winner: "none", localCounter, remoteCounter: 0 };
    const raw = await this.remote.get(this.key(K.main));
    if (!raw) return { winner: "local", localCounter, remoteCounter: 0 };
    const parsed = this.decodeEnvelope(raw);
    if (!parsed.ok) return { winner: "local", localCounter, remoteCounter: 0 };
    const remoteCounter = parsed.env.n;
    return {
      winner:
        remoteCounter > localCounter ? "remote" : remoteCounter < localCounter ? "local" : "equal",
      localCounter,
      remoteCounter,
    };
  }

  /** Adopt the remote copy locally (after the player picks "use cloud"). */
  async pullRemote(): Promise<T | null> {
    if (!this.remote) return null;
    const raw = await this.remote.get(this.key(K.main));
    if (!raw) return null;
    const parsed = this.decodeEnvelope(raw);
    if (!parsed.ok) return null;
    const migrated = this.migrateAndValidate(parsed.env);
    if (!migrated.ok) return null;
    this.current = migrated.data as T;
    this.counter = Math.max(this.counter, parsed.env.n);
    this.lastSource = "remote";
    await this.flush("pull");
    return this.current;
  }

  /* ── diagnostics ──────────────────────────────────────────── */

  diagnostics(): SaveDiagnostics {
    return {
      backend: this.backend.name,
      writes: this.writes,
      lastWriteAt: this.lastWriteAt,
      lastSource: this.lastSource,
      dirty: this.dirty,
      counter: this.counter,
    };
  }

  /** Nuke every slot. Used by "delete my data" in settings. */
  async wipe(): Promise<void> {
    const daily = await this.listDailyKeys();
    for (const k of [this.key(K.main), this.key(K.backup), this.key(K.staging), this.key(K.meta), ...daily]) {
      await this.backend.delete(k);
    }
    this.current = this.cfg.createDefault();
    this.counter = 0;
  }
}
