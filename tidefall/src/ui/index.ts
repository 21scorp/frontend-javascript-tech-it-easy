/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/index.ts
   UISystem: the one thing game.ts registers, and the only public
   door into src/ui.

   WHY a single system object: every other agent's code should be
   able to move the UI without importing a component. Two seams are
   offered and they are equivalent —

     • direct   : ui.hud.setCoins(n), ui.panels.skills.setProps(…)
     • decoupled: ctx.bus.emit("hud:currency", { coins: n })

   Systems that already hold a reference use the first; systems that
   should not know the UI exists use the second. The bus keys are
   listed in UI_EVENTS below and are the contract.

   The UI owns nothing about the game. It renders props and emits
   intent. If a panel ever needs to *ask* the simulation something,
   that is a bug in the seam, not a missing method.
   ═══════════════════════════════════════════════════════════════ */

import "./ui.css";

import type { GameContext, System } from "../core/contracts";
import { el, on } from "./dom";
import { applyMetrics } from "./theme";
import { Hud, type HudActivity, type HudProps } from "./hud";
import { Nav, NAV_ITEMS, type NavDest } from "./nav";
import { Sheet, type Detent } from "./sheet";
import { Feedback, type ToastSpec, type FloatSpec, type LevelUpSpec, type DialogSpec } from "./feedback";
import { SkillsPanel, type SkillsProps } from "./panels/skills";
import { BagPanel, type BagProps } from "./panels/bag";
import { BaseHomePanel, type BaseProps } from "./panels/base";
import { ShopPanel, type ShopProps } from "./panels/shop";
import { CharacterPanel, type CharacterProps } from "./panels/character";
import type { Panel } from "./panels/panel";

export * from "./theme";
export * from "./icons";
export * from "./motion";
export * from "./transitions";
export { Hud } from "./hud";
export { Nav, NAV_ITEMS } from "./nav";
export { Sheet } from "./sheet";
export { Feedback } from "./feedback";
export { SkillsPanel } from "./panels/skills";
export { BagPanel } from "./panels/bag";
export { BaseHomePanel } from "./panels/base";
export { ShopPanel } from "./panels/shop";
export { CharacterPanel } from "./panels/character";
export type { Panel } from "./panels/panel";
export type { HudActivity, HudProps } from "./hud";
export type { NavDest, NavItem } from "./nav";
export type { Detent } from "./sheet";
export type { ToastSpec, FloatSpec, LevelUpSpec, DialogSpec, DialogAction, ToastKind, FloatKind } from "./feedback";
export type { SkillsProps, SkillCard } from "./panels/skills";
export type { BagProps, BagItem, BagFilter, BagItemAction } from "./panels/bag";
export type { BaseProps, BasePlot, PlotState } from "./panels/base";
export type { ShopProps, ShopOffer, ShopTab, ShopFeature } from "./panels/shop";
export type { CharacterProps, CharCategory, CharOption, CharSwatch } from "./panels/character";

/** Bus keys the UI listens on. Payload types are in the map below. */
export const UI_EVENTS = {
  toast: "ui:toast",
  float: "ui:float",
  levelUp: "ui:levelup",
  open: "ui:open",
  close: "ui:close",
  currency: "hud:currency",
  activity: "hud:activity",
  skills: "ui:skills",
  bag: "ui:bag",
  base: "ui:base",
  shop: "ui:shop",
  character: "ui:character",
} as const;

/** Keys the UI emits back out, so gameplay can react to intent. */
export const UI_INTENTS = {
  /** { dest } — a nav destination was opened. */
  navigate: "ui:navigate",
  /** { skillId } — a skill card was tapped. */
  skillPick: "ui:skill-pick",
  /** { itemId, actionId } — a bag item action was chosen. */
  itemAction: "ui:item-action",
  /** { plotId } — a base plot was tapped. */
  plotPick: "ui:plot-pick",
  /** { offerId } — a shop offer was tapped. Nothing is charged. */
  buy: "ui:buy",
  /** { kind, id } — character creator selection changed. */
  appearance: "ui:appearance",
  /** {} — save was pressed in the creator. */
  appearanceSave: "ui:appearance-save",
} as const;

export interface UIOptions {
  /** Override the mount element. Defaults to #ui-root. */
  mount?: HTMLElement;
  /** Fill panels with placeholder content — dev harness and demos. */
  demo?: boolean;
  /** Detent a nav tap opens at. Default "half". */
  defaultDetent?: Detent;
}

interface PanelMap {
  skills: SkillsPanel;
  bag: BagPanel;
  base: BaseHomePanel;
  shop: ShopPanel;
  character: CharacterPanel;
}

export class UISystem implements System {
  readonly id = "ui";

  readonly root: HTMLElement;
  readonly hud: Hud;
  readonly nav: Nav;
  readonly sheet: Sheet;
  readonly feedback: Feedback;
  readonly panels: PanelMap;

  private ctx: GameContext | null = null;
  private disposers: Array<() => void> = [];
  private current: NavDest | null = null;
  private readonly opts: UIOptions;

  constructor(opts: UIOptions = {}) {
    this.opts = opts;
    this.root = el("div.tf-ui", { "data-tf-ui": "1" });

    this.hud = new Hud({ onActivity: () => this.open("skills", "half") });

    this.sheet = new Sheet({
      onClose: () => { this.current = null; this.nav.setActive(null); this.currentPanel()?.onHide?.(); },
      onOpen: () => { /* panel already installed by open() */ },
    });

    this.nav = new Nav({
      onSelect: (dest, reselect) => {
        if (reselect) {
          // Second tap on the open tab promotes the sheet, or closes it
          // once it is already full — a fast in-and-out with one thumb.
          this.sheet.setDetent(this.sheet.currentDetent === "full" ? "half" : "full");
          return;
        }
        this.open(dest);
      },
    });

    this.panels = {
      skills: new SkillsPanel({ onSelect: (id) => this.emit(UI_INTENTS.skillPick, { skillId: id }) }),
      bag: new BagPanel({ onItemAction: (itemId, actionId) => this.emit(UI_INTENTS.itemAction, { itemId, actionId }) }),
      base: new BaseHomePanel({ onPlot: (plotId) => this.emit(UI_INTENTS.plotPick, { plotId }) }),
      shop: new ShopPanel({ onBuy: (offerId) => this.emit(UI_INTENTS.buy, { offerId }) }),
      character: new CharacterPanel({
        onSave: () => this.emit(UI_INTENTS.appearanceSave, {}),
      }),
    };

    this.feedback = new Feedback(this.root);
    this.root.append(this.sheet.backdrop, this.sheet.node, this.hud.node, this.nav.node);
  }

  /* ── lifecycle ──────────────────────────────────────────────── */

  init(ctx: GameContext): void {
    this.ctx = ctx;
    const host = this.opts.mount ?? document.getElementById("ui-root");
    if (!host) throw new Error("[ui] no #ui-root to mount into");
    this.attach(host);

    const sync = () => {
      applyMetrics(this.root, ctx.viewport.metrics);
      this.sheet.measure();
    };
    this.disposers.push(ctx.viewport.onChange(sync));
    sync();

    this.bindBus(ctx);
  }

  /**
   * Mount without a GameContext — the dev harness and visual tests.
   * `frameW` drives --tf-scale exactly as the viewport would.
   */
  attachStandalone(host: HTMLElement, frameW = host.clientWidth): void {
    this.attach(host);
    applyMetrics(this.root, { frameW, scale: 1, safeTop: 0, safeBottom: 0 });
    this.sheet.measure();
    this.disposers.push(on(window, "resize", () => {
      applyMetrics(this.root, { frameW: host.clientWidth, scale: 1, safeTop: 0, safeBottom: 0 });
      this.sheet.measure();
    }));
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    for (const p of Object.values(this.panels)) (p as Panel<unknown>).destroy?.();
    this.feedback.destroy();
    this.sheet.destroy();
    this.nav.destroy();
    this.hud.destroy();
    this.root.remove();
    this.ctx = null;
  }

  /* ── navigation ─────────────────────────────────────────────── */

  open(dest: NavDest, detent: Detent = this.opts.defaultDetent ?? "half"): void {
    if (this.current === dest) { this.sheet.setDetent(detent); return; }
    const prev = this.currentPanel();
    prev?.onHide?.();

    const panel = this.panels[dest] as unknown as Panel<unknown>;
    this.current = dest;
    this.nav.setActive(dest);
    this.sheet.setHeader(panel.eyebrow, panel.title);
    this.sheet.setActions(...(panel.headerActions?.() ?? []));
    this.sheet.setContent(panel.node);
    this.sheet.show(detent);
    panel.onShow?.();
    this.emit(UI_INTENTS.navigate, { dest });
  }

  close(): void { this.sheet.hide(); }

  get openDest(): NavDest | null { return this.current; }

  /* ── convenience passthroughs ───────────────────────────────── */

  toast(spec: ToastSpec) { this.feedback.toast(spec); }
  float(spec: FloatSpec) { this.feedback.float(spec); }
  levelUp(spec: LevelUpSpec) { this.feedback.levelUp(spec); }
  confirm(spec: DialogSpec) { return this.feedback.confirm(spec); }
  setHud(p: Partial<HudProps>) { this.hud.setProps(p); }

  /** Load placeholder content into every panel (demo / QA only). */
  async loadDemo(): Promise<void> {
    const d = await import("./placeholder");
    this.hud.setCoins(d.demoCoins, false);
    this.hud.setGems(d.demoGems, false);
    this.hud.setActivity(d.demoActivity);
    this.panels.skills.setProps(d.demoSkills);
    this.panels.bag.setProps(d.demoBag);
    this.panels.base.setProps(d.demoBase);
    this.panels.shop.setProps(d.demoShop);
    this.panels.character.setProps(d.demoCharacter);
    this.nav.setBadge("bag", 3);
    this.nav.setBadge("shop", "!");
  }

  /* ── internals ──────────────────────────────────────────────── */

  private attach(host: HTMLElement): void {
    host.appendChild(this.root);
    // The sheet needs a laid-out parent before it can find its detents.
    requestAnimationFrame(() => this.sheet.measure());
  }

  private currentPanel(): Panel<unknown> | null {
    return this.current ? (this.panels[this.current] as unknown as Panel<unknown>) : null;
  }

  private emit(key: string, payload: unknown): void {
    this.ctx?.bus.emit(key, payload);
  }

  private bindBus(ctx: GameContext): void {
    const B = ctx.bus;
    const D = this.disposers;

    D.push(B.on<ToastSpec>(UI_EVENTS.toast, (p) => this.feedback.toast(p)));
    D.push(B.on<FloatSpec>(UI_EVENTS.float, (p) => this.feedback.float(p)));
    D.push(B.on<LevelUpSpec>(UI_EVENTS.levelUp, (p) => this.feedback.levelUp(p)));

    D.push(B.on<{ dest: NavDest; detent?: Detent }>(UI_EVENTS.open, (p) => this.open(p.dest, p.detent)));
    D.push(B.on(UI_EVENTS.close, () => this.close()));

    D.push(B.on<{ coins?: number; gems?: number; animate?: boolean }>(UI_EVENTS.currency, (p) => {
      if (p.coins !== undefined) this.hud.setCoins(p.coins, p.animate !== false);
      if (p.gems !== undefined) this.hud.setGems(p.gems, p.animate !== false);
    }));
    D.push(B.on<HudActivity | null>(UI_EVENTS.activity, (p) => this.hud.setActivity(p)));

    D.push(B.on<Partial<SkillsProps>>(UI_EVENTS.skills, (p) => this.panels.skills.setProps(p)));
    D.push(B.on<Partial<BagProps>>(UI_EVENTS.bag, (p) => this.panels.bag.setProps(p)));
    D.push(B.on<Partial<BaseProps>>(UI_EVENTS.base, (p) => this.panels.base.setProps(p)));
    D.push(B.on<Partial<ShopProps>>(UI_EVENTS.shop, (p) => this.panels.shop.setProps(p)));
    D.push(B.on<Partial<CharacterProps>>(UI_EVENTS.character, (p) => this.panels.character.setProps(p)));
  }
}

/** Destination ids in bar order — handy for tests and deep links. */
export const NAV_ORDER: readonly NavDest[] = NAV_ITEMS.map((i) => i.id);
