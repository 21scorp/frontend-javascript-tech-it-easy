import { describe, expect, it, vi } from "vitest";
import { AssetService, TIDEFALL_BUNDLES, ZONE_BUNDLES } from "../assets";
import type { AssetsApi, BundleProgress } from "../assets";
import type { Texture } from "pixi.js";

const PLACEHOLDER = { __placeholder: true } as unknown as Texture;

interface FakeApi extends AssetsApi {
  loadedBundles: string[];
  failBundles: Set<string>;
  cache: Map<string, unknown>;
}

function fakeApi(): FakeApi {
  const cache = new Map<string, unknown>();
  const loadedBundles: string[] = [];
  const failBundles = new Set<string>();
  let manifest: { bundles: { name: string; assets: { alias: string }[] }[] } = { bundles: [] };

  return {
    cache,
    loadedBundles,
    failBundles,
    async init(options) {
      manifest = options.manifest;
    },
    async loadBundle(name, onProgress) {
      if (failBundles.has(name)) throw new Error(`network died loading ${name}`);
      const spec = manifest.bundles.find((b) => b.name === name);
      const assets = spec?.assets ?? [];
      for (let i = 0; i < assets.length; i++) {
        cache.set(assets[i]!.alias, { alias: assets[i]!.alias });
        onProgress?.((i + 1) / assets.length);
      }
      loadedBundles.push(name);
      return {};
    },
    async unloadBundle(name) {
      const spec = manifest.bundles.find((b) => b.name === name);
      for (const a of spec?.assets ?? []) cache.delete(a.alias);
      const i = loadedBundles.indexOf(name);
      if (i >= 0) loadedBundles.splice(i, 1);
    },
    get(alias) {
      return cache.get(alias);
    },
  };
}

const svc = (api: AssetsApi, logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }) => ({
  service: new AssetService({ api, makePlaceholder: () => PLACEHOLDER, logger }),
  logger,
});

describe("assets · manifest", () => {
  it("declares every bundle the zones reference", () => {
    const names = new Set(TIDEFALL_BUNDLES.map((b) => b.name));
    for (const bundles of Object.values(ZONE_BUNDLES)) {
      for (const b of bundles) expect(names.has(b)).toBe(true);
    }
  });

  it("keeps boot tiny — it blocks first paint", () => {
    const boot = TIDEFALL_BUNDLES.find((b) => b.name === "boot")!;
    expect(boot.required).toBe(true);
    expect(boot.assets.length).toBeLessThanOrEqual(3);
  });

  it("has no duplicate aliases across bundles", () => {
    const seen = new Set<string>();
    for (const b of TIDEFALL_BUNDLES) {
      for (const a of b.assets) {
        expect(seen.has(a.alias)).toBe(false);
        seen.add(a.alias);
      }
    }
  });
});

describe("assets · loading", () => {
  it("loads the boot bundle and reports monotonic progress ending at 1", async () => {
    const api = fakeApi();
    const { service } = svc(api);
    const seen: number[] = [];
    await service.loadBoot((p: BundleProgress) => seen.push(p.overall));

    expect(api.loadedBundles).toEqual(["boot"]);
    expect(service.isLoaded("boot")).toBe(true);
    expect(seen.at(-1)).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
  });

  it("spreads overall progress across several bundles without going backwards", async () => {
    const api = fakeApi();
    const { service } = svc(api);
    const seen: number[] = [];
    await service.load(["boot", "world", "actors"], (p) => seen.push(p.overall));
    expect(seen.at(-1)).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(api.loadedBundles).toEqual(["boot", "world", "actors"]);
  });

  it("is idempotent — a second load of the same bundle does no work", async () => {
    const api = fakeApi();
    const { service } = svc(api);
    await service.ensureZone("isle");
    const first = [...api.loadedBundles];
    await service.ensureZone("isle");
    expect(api.loadedBundles).toEqual(first);
  });

  it("loads only what a zone needs, lazily", async () => {
    const api = fakeApi();
    const { service } = svc(api);
    await service.loadBoot();
    expect(service.isLoaded("world")).toBe(false);
    await service.ensureZone("mine");
    expect(service.loadedBundles().sort()).toEqual(["actors", "boot", "items", "world"]);
  });

  it("treats an empty declared bundle as instantly loaded", async () => {
    const api = fakeApi();
    const { service } = svc(api);
    await service.load(["ui"]);
    expect(service.isLoaded("ui")).toBe(true);
    expect(api.loadedBundles).not.toContain("ui");
  });

  it("unloads a bundle and forgets its textures", async () => {
    const api = fakeApi();
    const { service } = svc(api);
    await service.load(["items"]);
    expect(service.has("item_oak")).toBe(true);
    await service.unload("items");
    expect(service.isLoaded("items")).toBe(false);
    expect(service.has("item_oak")).toBe(false);
  });
});

describe("assets · failure handling", () => {
  it("returns a magenta placeholder for a missing texture and logs once", async () => {
    const api = fakeApi();
    const { service, logger } = svc(api);
    await service.loadBoot();

    const a = service.texture("tree_does_not_exist");
    const b = service.texture("tree_does_not_exist");
    expect(a).toBe(PLACEHOLDER);
    expect(b).toBe(PLACEHOLDER);
    expect(logger.warn).toHaveBeenCalledTimes(1); // once, not once per frame
    expect(service.missingAliases()).toEqual(["tree_does_not_exist"]);
  });

  it("returns the real texture when it is present", async () => {
    const api = fakeApi();
    const { service } = svc(api);
    await service.load(["world"]);
    expect(service.texture("tree_oak")).toEqual({ alias: "tree_oak" });
    expect(service.has("tree_oak")).toBe(true);
  });

  it("keeps running when an OPTIONAL bundle fails", async () => {
    const api = fakeApi();
    api.failBundles.add("items");
    const { service, logger } = svc(api);
    await expect(service.load(["items"])).resolves.toBeUndefined();
    expect(service.failed()).toEqual(["items"]);
    expect(logger.error).toHaveBeenCalled();
    // …and gameplay still gets something to draw.
    expect(service.texture("item_oak")).toBe(PLACEHOLDER);
  });

  it("propagates a REQUIRED bundle failure so boot can show an error", async () => {
    const api = fakeApi();
    api.failBundles.add("boot");
    const { service } = svc(api);
    await expect(service.loadBoot()).rejects.toThrow(/network died/);
  });

  it("warns on an unknown zone instead of throwing", async () => {
    const api = fakeApi();
    const { service, logger } = svc(api);
    await expect(service.ensureZone("atlantis")).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("reuses one placeholder texture rather than allocating per lookup", async () => {
    let made = 0;
    const service = new AssetService({
      api: fakeApi(),
      makePlaceholder: () => {
        made++;
        return PLACEHOLDER;
      },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    });
    await service.init();
    for (let i = 0; i < 50; i++) service.texture(`missing_${i}`);
    expect(made).toBe(1);
  });
});
