/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/assets.ts
   Manifest-driven loading over Pixi's Assets.

   WHY not just `Assets.load(url)` wherever a sprite is needed:
     • Boot time is the retention cliff. Only the `boot` bundle blocks
       first paint; world/actors/ui stream in behind the splash and
       zone bundles load lazily when the player walks in.
     • A texture that fails on a flaky mobile connection must not take
       the game down. Every lookup falls back to a loud magenta
       placeholder and logs once — the artist sees it immediately, the
       player still gets a playable game.
     • Aliases, not paths. Systems ask for "tree_oak"; where the file
       lives, and whether it later becomes an atlas frame, is this
       file's problem alone.

   Pixi is behind AssetsApi so bundle logic is testable headless.
   ═══════════════════════════════════════════════════════════════ */

import { Assets, Texture } from "pixi.js";

export type BundleName = "boot" | "world" | "actors" | "items" | "ui" | "audio";

export interface AssetEntry {
  alias: string;
  src: string;
}

export interface BundleSpec {
  name: BundleName;
  /** Boot blocks first paint; the rest stream behind the splash. */
  required: boolean;
  assets: AssetEntry[];
}

/** Minimal slice of Pixi's Assets we depend on — the whole seam. */
export interface AssetsApi {
  init(options: { manifest: { bundles: { name: string; assets: AssetEntry[] }[] } }): Promise<void>;
  loadBundle(name: string, onProgress?: (progress: number) => void): Promise<unknown>;
  unloadBundle(name: string): Promise<void>;
  get(alias: string): unknown;
}

export function pixiAssetsApi(): AssetsApi {
  return {
    init: (options) => Assets.init(options),
    loadBundle: (name, onProgress) => Assets.loadBundle(name, onProgress),
    unloadBundle: (name) => Assets.unloadBundle(name),
    get: (alias) => Assets.cache.has(alias) ? Assets.cache.get(alias) : undefined,
  };
}

/* ── the manifest ────────────────────────────────────────────── */

const world = (n: string): AssetEntry => ({ alias: n, src: `assets/world/${n}.png` });
const actor = (n: string): AssetEntry => ({ alias: n, src: `assets/actors/${n}.png` });
const item = (n: string): AssetEntry => ({ alias: n, src: `assets/items/${n}.png` });

/**
 * Only files that exist on disk today. Adding art = adding a line here;
 * nothing else in the codebase learns about file paths.
 */
export const TIDEFALL_BUNDLES: BundleSpec[] = [
  {
    name: "boot",
    required: true,
    // The island alone proves the portrait frame and covers the splash.
    assets: [world("bg_island")],
  },
  {
    name: "world",
    required: true,
    assets: [
      world("stall"), world("mine"),
      world("tree_oak"), world("tree_oak_stump"),
      world("tree_birch"), world("tree_birch_stump"),
      world("tree_maple"), world("tree_maple_stump"),
      world("tree_yew"), world("tree_yew_stump"),
      world("tree_elder"), world("tree_elder_stump"),
    ],
  },
  {
    name: "actors",
    required: true,
    assets: [
      actor("char_idle"), actor("char_idle_anim"),
      actor("char_walk_anim"),
      actor("char_chop"), actor("char_chop_anim"),
      actor("char_fish"), actor("char_fish_anim"),
      actor("cust_bram"), actor("cust_bram_anim"),
      actor("cust_fien"), actor("cust_fien_anim"),
      actor("cust_kas"), actor("cust_kas_anim"),
      actor("cust_milo"), actor("cust_milo_anim"),
      actor("cust_noor"), actor("cust_noor_anim"),
      actor("cust_saar"), actor("cust_saar_anim"),
      actor("cust_ted"), actor("cust_ted_anim"),
      actor("cust_vera"), actor("cust_vera_anim"),
    ],
  },
  {
    name: "items",
    required: false,
    assets: [
      item("item_oak"), item("item_birch"), item("item_maple"),
      item("item_yew"), item("item_elder"), item("item_sword"),
      item("item_salmon"), item("item_koi"), item("item_trout"),
      item("item_sardine"), item("item_tuna"), item("item_herring"),
    ],
  },
  // Declared so callers can already ask for them; empty until the art
  // and audio land. Loading an empty bundle is a no-op, not a crash.
  { name: "ui", required: false, assets: [] },
  { name: "audio", required: false, assets: [] },
];

/** Which bundles a zone needs before it can be entered. */
export const ZONE_BUNDLES: Record<string, BundleName[]> = {
  isle: ["world", "actors", "items"],
  mine: ["world", "actors", "items"],
  depths: ["world", "actors", "items"],
};

/* ── service ─────────────────────────────────────────────────── */

export interface AssetServiceOptions {
  api?: AssetsApi;
  bundles?: BundleSpec[];
  /** Injected in tests; the real one needs a canvas. */
  makePlaceholder?: () => Texture;
  logger?: Pick<Console, "warn" | "error" | "info">;
}

export interface BundleProgress {
  bundle: BundleName;
  /** 0..1 for this bundle. */
  progress: number;
  /** 0..1 across the whole request. */
  overall: number;
}

export class AssetService {
  private readonly api: AssetsApi;
  private readonly specs: Map<BundleName, BundleSpec>;
  private readonly log: Pick<Console, "warn" | "error" | "info">;
  private readonly makePlaceholder: () => Texture;

  private placeholderTex: Texture | null = null;
  private readonly loaded = new Set<BundleName>();
  private readonly inflight = new Map<BundleName, Promise<void>>();
  private readonly missingWarned = new Set<string>();
  private readonly failedBundles = new Set<BundleName>();
  private initialised = false;

  constructor(opts: AssetServiceOptions = {}) {
    this.api = opts.api ?? pixiAssetsApi();
    const specs = opts.bundles ?? TIDEFALL_BUNDLES;
    this.specs = new Map(specs.map((s) => [s.name, s]));
    this.log = opts.logger ?? console;
    this.makePlaceholder = opts.makePlaceholder ?? createMagentaTexture;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.api.init({
      manifest: {
        bundles: [...this.specs.values()].map((s) => ({ name: s.name, assets: s.assets })),
      },
    });
    this.initialised = true;
  }

  isLoaded(name: BundleName): boolean {
    return this.loaded.has(name);
  }

  loadedBundles(): BundleName[] {
    return [...this.loaded];
  }

  /**
   * Loads a set of bundles, reporting a single monotonic 0..1 across all
   * of them — the splash bar must never jump backwards when the second
   * bundle starts.
   */
  async load(
    names: BundleName[],
    onProgress?: (p: BundleProgress) => void,
  ): Promise<void> {
    await this.init();
    const todo = names.filter((n) => !this.loaded.has(n) && this.specs.has(n));
    if (todo.length === 0) {
      onProgress?.({ bundle: names[0] ?? "boot", progress: 1, overall: 1 });
      return;
    }
    const per = 1 / todo.length;
    let done = 0;
    for (const name of todo) {
      const at = done;
      await this.loadOne(name, (p) => {
        onProgress?.({ bundle: name, progress: p, overall: at * per + p * per });
      });
      done++;
      onProgress?.({ bundle: name, progress: 1, overall: done * per });
    }
  }

  /** Boot bundle only — what the splash waits on. */
  async loadBoot(onProgress?: (p: BundleProgress) => void): Promise<void> {
    await this.load(["boot"], onProgress);
  }

  /** Lazy per-zone load. Idempotent and safe to call every zone change. */
  async ensureZone(zoneId: string, onProgress?: (p: BundleProgress) => void): Promise<void> {
    const needed = ZONE_BUNDLES[zoneId] ?? [];
    if (!needed.length) this.log.warn(`[assets] zone "${zoneId}" has no bundle mapping`);
    await this.load(needed, onProgress);
  }

  private loadOne(name: BundleName, onProgress: (p: number) => void): Promise<void> {
    const existing = this.inflight.get(name);
    if (existing) return existing;
    const spec = this.specs.get(name);
    if (!spec) return Promise.resolve();
    if (spec.assets.length === 0) {
      this.loaded.add(name);
      onProgress(1);
      return Promise.resolve();
    }

    const p = this.api
      .loadBundle(name, onProgress)
      .then(() => {
        this.loaded.add(name);
        this.failedBundles.delete(name);
      })
      .catch((err: unknown) => {
        // A required bundle failing is fatal for the caller to decide on;
        // an optional one degrades to placeholders and the game runs.
        this.failedBundles.add(name);
        this.log.error(`[assets] bundle "${name}" failed to load`, err);
        if (spec.required) throw err;
      })
      .finally(() => {
        this.inflight.delete(name);
      });
    this.inflight.set(name, p);
    return p;
  }

  async unload(name: BundleName): Promise<void> {
    if (!this.loaded.has(name)) return;
    this.loaded.delete(name);
    try {
      await this.api.unloadBundle(name);
    } catch (err) {
      this.log.warn(`[assets] unload "${name}" failed`, err);
    }
  }

  /**
   * The only way sprites should obtain a texture. Never throws, never
   * returns undefined — a missing alias yields the magenta placeholder
   * so the frame still renders and the gap is obvious on screen.
   */
  texture(alias: string): Texture {
    const got = this.api.get(alias);
    if (got) return got as Texture;
    if (!this.missingWarned.has(alias)) {
      this.missingWarned.add(alias);
      this.log.warn(`[assets] missing texture "${alias}" — using placeholder`);
    }
    return this.placeholder();
  }

  /** True when `alias` resolved for real (no placeholder substituted). */
  has(alias: string): boolean {
    return this.api.get(alias) != null;
  }

  placeholder(): Texture {
    if (!this.placeholderTex) this.placeholderTex = this.makePlaceholder();
    return this.placeholderTex;
  }

  /** Aliases that had to be faked. Surface this in a dev overlay. */
  missingAliases(): string[] {
    return [...this.missingWarned];
  }

  failed(): BundleName[] {
    return [...this.failedBundles];
  }
}

/**
 * Magenta with a black X — reads as "asset missing" at any size and
 * survives being tinted or scaled, unlike a plain flat square.
 */
export function createMagentaTexture(size = 64): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#ff00ff";
    g.fillRect(0, 0, size, size);
    g.strokeStyle = "#000000";
    g.lineWidth = Math.max(2, size / 16);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(size, size);
    g.moveTo(size, 0);
    g.lineTo(0, size);
    g.stroke();
    g.strokeRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}
