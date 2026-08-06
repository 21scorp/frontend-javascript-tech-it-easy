/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — services/bootstrap.ts
   One call that builds the whole plumbing layer with production
   defaults, so main.ts/game.ts stay three lines long.

   This is a FACTORY, not a singleton: it returns a fresh, fully
   independent bundle every time it is called. Tests build the same
   services by hand with fakes; nothing here is reachable globally.
   ═══════════════════════════════════════════════════════════════ */

import type { EventBus } from "../core/contracts";
import type { Viewport } from "../core/viewport";
import { AssetService } from "./assets";
import { AudioService, localSettingsStore } from "./audio";
import { HapticsService } from "./haptics";
import { InputService, domPointerSource } from "./input";
import { PerfService } from "./perf";
import { SaveService } from "./save";
import type { SaveConfig } from "./save";
import { openBestBackend } from "./storage";
import type { SaveBackend } from "./storage";

export interface ServicesOptions<TSave extends object> {
  bus: EventBus;
  viewport: Viewport;
  /** The portrait frame element — the only surface that takes input. */
  frame: HTMLElement;
  save: SaveConfig<TSave>;
  /** Pre-opened backend; otherwise IndexedDB → localStorage → memory. */
  backend?: SaveBackend;
  /** Cloud mirror, when there is one. */
  remote?: SaveBackend;
  /** Skip DOM/audio wiring — used by headless tools. */
  headless?: boolean;
}

export interface Services<TSave extends object> {
  save: SaveService<TSave>;
  input: InputService;
  audio: AudioService;
  haptics: HapticsService;
  assets: AssetService;
  perf: PerfService;
  /** Tear every listener down, in dependency order. */
  destroy(): void;
}

export async function createServices<TSave extends object>(
  opts: ServicesOptions<TSave>,
): Promise<Services<TSave>> {
  const backend = opts.backend ?? (await openBestBackend());

  const save = new SaveService<TSave>({
    backend,
    remote: opts.remote,
    config: opts.save,
    bus: opts.bus,
  });

  const input = new InputService({
    bus: opts.bus,
    source: domPointerSource({ element: opts.frame }),
    space: opts.viewport,
  });

  const audio = new AudioService({
    bus: opts.bus,
    store: localSettingsStore(),
  });

  const haptics = new HapticsService();
  const assets = new AssetService();
  const perf = new PerfService({ bus: opts.bus, dpr: opts.viewport.metrics.dpr });

  if (!opts.headless) {
    save.bindLifecycle();
    input.start();
    audio.armUnlock();
    audio.bindBus(opts.bus);
    // The rotate guard owning the screen must also own the fingers.
    opts.viewport.onChange((m) => input.setEnabled(!m.blocked));
  }

  return {
    save,
    input,
    audio,
    haptics,
    assets,
    perf,
    destroy() {
      input.destroy();
      audio.destroy();
      save.destroy();
    },
  };
}
