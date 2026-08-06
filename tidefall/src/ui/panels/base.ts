/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/panels/base.ts
   The holding: a hero banner and a grid of building plots.

   WHY plots and not a list: the base is the tycoon half of the game,
   and the fantasy is spatial — "my island fills up". Even as a flat
   grid, drawing empty and locked plots alongside built ones shows
   the shape of the whole holding, so the player can see what they
   are working toward. The real isometric plot view mounts into the
   hero banner later; this shell keeps the same information design.
   ═══════════════════════════════════════════════════════════════ */

import { el, on, setText, fill } from "./../dom";
import { icon, coinMedal, type IconName } from "./../icons";
import { makeBar, sectionHead } from "./../widgets";
import { skelBlock, skelGrid, cascade } from "./../transitions";
import { compact } from "./../theme";
import { BasePanel } from "./panel";

export type PlotState = "built" | "empty" | "locked" | "building";

export interface BasePlot {
  id: string;
  state: PlotState;
  /** Required for built/building. */
  name?: string;
  icon?: IconName;
  level?: number;
  /** "12 logs/hr" — the reason this plot exists. */
  yield?: string;
  /** 0..1 construction or production progress. */
  progress?: number;
  /** Collectable right now — draws the pulsing READY flag. */
  ready?: boolean;
  /** Shown on locked plots: "Base level 4". */
  requirement?: string;
  tint?: string;
}

export interface BaseProps {
  baseName: string;
  baseLevel: number;
  /** Optional wide image behind the header (island art, screenshot). */
  heroArt?: string;
  /** Storage meter. */
  storageUsed?: number;
  storageTotal?: number;
  /** Idle income headline, e.g. 1240 (coins/hr). */
  incomePerHour?: number;
  plots: BasePlot[];
  loading?: boolean;
  onPlot?: (id: string) => void;
  onCollectAll?: () => void;
}

export class BasePanel_ extends BasePanel<BaseProps> {
  readonly eyebrow = "Your holding";
  readonly title = "Base";
  readonly node: HTMLElement;

  private readonly heroImg = el("img", { alt: "", hidden: true }) as HTMLImageElement;
  private readonly heroName = el("div.tf-basehero__name");
  private readonly heroMeta = el("div.tf-basehero__meta");
  private readonly hero: HTMLElement;
  private readonly storeBar = makeBar("aqua", true);
  private readonly storeNum = el("span.tf-cap__n");
  private readonly grid = el("div.tf-grid.tf-grid--2");
  // The flat coin glyph goes muddy on a gold face, so the CTA carries
  // the full medallion instead.
  private readonly collect = el("button.tf-btn.tf-btn--gold.tf-btn--block", { type: "button" },
    coinMedal(22), el("span", { text: "Collect all" }));
  private readonly skeleton: HTMLElement;
  private didCascade = false;

  constructor(initial: Partial<BaseProps> = {}) {
    super({ baseName: "Tidefall Holding", baseLevel: 1, plots: [], loading: false, ...initial });

    this.hero = el("div.tf-basehero", {},
      this.heroImg,
      el("div.tf-basehero__txt", {}, this.heroName, this.heroMeta),
    );

    on(this.collect, "click", () => this.state.onCollectAll?.());

    this.skeleton = el("div", {},
      skelBlock("calc(132 * var(--tf-u))", "var(--r-5)"),
      el("div", { style: "height:var(--sp-4)" }),
      skelGrid(4, 2),
    );

    this.node = el("div.tf-pan.tf-screen", {},
      this.hero,
      el("div.tf-cap", { style: "margin-top:var(--sp-3)" }, this.storeBar.node, this.storeNum),
      sectionHead("Plots"),
      this.grid,
      el("div", { style: "height:var(--sp-4)" }),
      this.collect,
      this.skeleton,
    );
    this.render();
  }

  protected render(): void {
    const p = this.state;
    const loading = !!p.loading;
    this.skeleton.hidden = !loading;
    for (const n of [this.hero, this.grid, this.collect]) n.hidden = loading;
    if (loading) return;

    setText(this.heroName, p.baseName);
    fill(this.heroMeta,
      el("span.tf-tagline", { text: `Level ${p.baseLevel}` }),
      p.incomePerHour
        ? el("span.tf-tagline", { text: `+${compact(p.incomePerHour)} / hr` })
        : null,
    );

    if (p.heroArt) { this.heroImg.src = p.heroArt; this.heroImg.hidden = false; }
    else this.heroImg.hidden = true;

    const used = p.storageUsed ?? 0;
    const total = p.storageTotal ?? 0;
    this.storeBar.set(total ? used / total : 0);
    fill(this.storeNum, el("b", { text: compact(used) }), ` / ${compact(total)}`);
    this.storeBar.node.setAttribute("aria-label", `Storage ${used} of ${total}`);

    fill(this.grid, ...p.plots.map((plot) => this.buildPlot(plot)));

    const ready = p.plots.some((x) => x.ready);
    this.collect.toggleAttribute("disabled", !ready);

    if (!this.didCascade && p.plots.length) { this.didCascade = true; cascade(this.grid, 30); }
  }

  private buildPlot(plot: BasePlot): HTMLElement {
    if (plot.state === "empty") {
      const n = el("button.tf-plot.tf-plot--empty", { type: "button", "aria-label": "Empty plot — build here" },
        el("span.tf-plot__ic", {}, icon("plus", { size: "1em" })),
        el("span.tf-plot__name", { text: "Build" }),
        el("span.tf-plot__sub", { text: "Empty plot" }),
      );
      on(n, "click", () => this.state.onPlot?.(plot.id));
      return n;
    }

    if (plot.state === "locked") {
      return el("div.tf-plot.tf-plot--locked", { "aria-label": `Locked plot. ${plot.requirement ?? ""}` },
        el("span.tf-plot__ic", {}, icon("lock", { size: "1em" })),
        el("span.tf-plot__name", { text: "Locked" }),
        el("span.tf-plot__sub", { text: plot.requirement ?? "" }),
      );
    }

    const bar = makeBar(plot.state === "building" ? "gold" : "aqua", true);
    bar.set(plot.progress ?? 0);

    const n = el("button.tf-plot", { type: "button" },
      plot.level ? el("span.tf-plot__lv", { text: `Lv ${plot.level}` }) : null,
      plot.ready ? el("span.tf-plot__ready", { text: "Ready" }) : null,
      el("span.tf-plot__ic", {}, icon(plot.icon ?? "house", { size: "1em" })),
      el("span.tf-plot__name", { text: plot.name ?? "Building" }),
      el("span.tf-plot__sub", { text: plot.state === "building" ? "Under construction" : plot.yield ?? "" }),
      el("span.tf-plot__bar", {}, bar.node),
    );
    if (plot.tint) n.style.setProperty("--tint", plot.tint);
    n.setAttribute("aria-label",
      `${plot.name ?? "Building"}${plot.level ? `, level ${plot.level}` : ""}${plot.ready ? ", ready to collect" : ""}`);
    on(n, "click", () => this.state.onPlot?.(plot.id));
    return n;
  }

  destroy(): void { this.node.remove(); }
}

export { BasePanel_ as BaseHomePanel };
