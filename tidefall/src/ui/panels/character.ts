/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/panels/character.ts
   The creator shell: category rail, a stage, option and colour grids.

   WHY the rail is vertical and left: the stage has to stay as tall
   as possible in portrait, and a horizontal category strip would eat
   the height the character needs. The rail also keeps every category
   one thumb-stretch from the option grid below it.

   THE MOUNT POINT: `.tf-char__mount` (also `[data-mount="paperdoll"]`)
   is left empty on purpose. Whoever owns the paperdoll renderer calls
   `panel.mount` and appends a canvas/Pixi view; the placeholder
   inside is removed automatically on first mount and restored on
   unmount, so the shell never renders an empty black box.
   ═══════════════════════════════════════════════════════════════ */

import { el, on, fill } from "./../dom";
import { icon, type IconName } from "./../icons";
import { sectionHead } from "./../widgets";
import { skelBlock, cascade } from "./../transitions";
import { BasePanel } from "./panel";

export interface CharCategory {
  id: string;
  label: string;
  icon: IconName;
}

export interface CharOption {
  id: string;
  /** Short label under the swatch/tile. */
  label?: string;
  icon?: IconName;
  art?: string;
  locked?: boolean;
  /** Requirement text shown in a toast on tapping a locked option. */
  requirement?: string;
}

export interface CharSwatch {
  id: string;
  /** Any CSS colour, including gradients. */
  color: string;
  label?: string;
  locked?: boolean;
}

export interface CharacterProps {
  categories: CharCategory[];
  activeCategory: string;
  /** Options for the active category. */
  options: CharOption[];
  selectedOption?: string;
  /** Colour ramp for the active category; omit to hide the row. */
  swatches?: CharSwatch[];
  selectedSwatch?: string;
  /** Hero name shown above the stage. */
  name?: string;
  loading?: boolean;
  onCategory?: (id: string) => void;
  onOption?: (id: string) => void;
  onSwatch?: (id: string) => void;
  onRotate?: (dir: -1 | 1) => void;
  onSave?: () => void;
  onRandomise?: () => void;
}

export class CharacterPanel extends BasePanel<CharacterProps> {
  readonly eyebrow = "Appearance";
  readonly title = "Hero";
  readonly node: HTMLElement;

  /** Append the paperdoll renderer here. See file header. */
  readonly mount: HTMLElement;

  private readonly rail = el("div.tf-char__rail", { role: "tablist", "aria-label": "Appearance categories" });
  private readonly stage: HTMLElement;
  private readonly placeholder: HTMLElement;
  private readonly optionsHead: HTMLElement;
  private readonly options = el("div.tf-optgrid", { role: "listbox", "aria-label": "Options" });
  private readonly swatchHead: HTMLElement;
  private readonly swatches = el("div.tf-swatches", { role: "listbox", "aria-label": "Colours" });
  private readonly skeleton: HTMLElement;
  private cascadedCat = "";

  constructor(initial: Partial<CharacterProps> = {}) {
    super({ categories: [], activeCategory: "", options: [], loading: false, ...initial });

    this.placeholder = el("div.tf-char__ph", {},
      icon("person", { size: 64 }),
      el("div.tf-char__phlabel", { text: "Paperdoll mount" }),
    );
    this.mount = el("div.tf-char__mount", { "data-mount": "paperdoll" }, this.placeholder);

    const turnL = el("button.tf-iconbtn", { type: "button", "aria-label": "Turn left" },
      icon("chevron", { size: "0.72em", cls: "tf-rot-l" }));
    const turnR = el("button.tf-iconbtn", { type: "button", "aria-label": "Turn right" },
      icon("chevron", { size: "0.72em", cls: "tf-rot-r" }));
    on(turnL, "click", () => this.state.onRotate?.(-1));
    on(turnR, "click", () => this.state.onRotate?.(1));

    this.stage = el("div.tf-char__stage", {},
      this.mount,
      el("div.tf-char__turn", {}, turnL, turnR),
    );

    this.optionsHead = sectionHead("Style");
    this.swatchHead = sectionHead("Colour");

    const save = el("button.tf-btn.tf-btn--gold", { type: "button" },
      icon("check", { size: "1em" }), el("span", { text: "Save hero" }));
    const rand = el("button.tf-btn.tf-btn--ghost", { type: "button", "aria-label": "Randomise" },
      icon("sparkle", { size: "1em" }));
    on(save, "click", () => this.state.onSave?.());
    on(rand, "click", () => this.state.onRandomise?.());

    this.skeleton = el("div", {},
      skelBlock("calc(300 * var(--tf-u))", "var(--r-5)"),
      el("div", { style: "height:var(--sp-4)" }),
      skelBlock("calc(84 * var(--tf-u))"),
    );

    this.node = el("div.tf-pan.tf-screen", {},
      el("div.tf-char", {}, this.rail, this.stage),
      this.optionsHead, this.options,
      this.swatchHead, this.swatches,
      el("div.tf-char__cta", {}, rand, save),
      this.skeleton,
    );
    this.render();
  }

  /** Swap the placeholder out for a real renderer view. */
  attachRenderer(view: Node): void {
    this.mount.replaceChildren(view);
  }

  /** Put the labelled placeholder back (renderer torn down). */
  detachRenderer(): void {
    this.mount.replaceChildren(this.placeholder);
  }

  protected render(): void {
    const p = this.state;
    const loading = !!p.loading;
    this.skeleton.hidden = !loading;
    for (const n of [this.node.firstElementChild as HTMLElement, this.optionsHead, this.options, this.swatchHead, this.swatches]) {
      if (n) n.hidden = loading;
    }
    if (loading) return;

    fill(this.rail, ...p.categories.map((c) => {
      const b = el("button.tf-railbtn", {
        type: "button", role: "tab", "aria-selected": String(c.id === p.activeCategory),
        "aria-label": c.label,
      }, icon(c.icon, { size: "1em" }), el("span", { text: c.label }));
      on(b, "click", () => this.state.onCategory?.(c.id));
      return b;
    }));

    fill(this.options, ...p.options.map((o) => {
      const b = el("button.tf-opt", {
        type: "button", role: "option",
        "aria-selected": String(o.id === p.selectedOption),
        "aria-pressed": String(o.id === p.selectedOption),
        "aria-label": o.label ?? o.id,
      },
        o.art ? el("img", { src: o.art, alt: "", style: "max-width:74%;max-height:74%" }) : icon(o.icon ?? "person", { size: "1em" }),
        o.label ? el("span.tf-opt__n", { text: o.label }) : null,
        o.locked ? el("span.tf-opt__lock", {}, icon("lock", { size: "1em" })) : null,
      );
      on(b, "click", () => { if (!o.locked) this.state.onOption?.(o.id); });
      return b;
    }));

    const sw = p.swatches ?? [];
    this.swatchHead.hidden = sw.length === 0;
    this.swatches.hidden = sw.length === 0;
    fill(this.swatches, ...sw.map((s) => {
      const b = el("button.tf-sw", {
        type: "button", role: "option",
        "aria-selected": String(s.id === p.selectedSwatch),
        "aria-pressed": String(s.id === p.selectedSwatch),
        "aria-label": s.label ?? s.id,
      }, el("span.tf-sw__tick", {}, icon("check", { size: "1em" })));
      b.style.setProperty("--sw", s.color);
      on(b, "click", () => { if (!s.locked) this.state.onSwatch?.(s.id); });
      return b;
    }));

    this.stage.setAttribute("aria-label", p.name ? `Preview of ${p.name}` : "Character preview");

    if (this.cascadedCat !== p.activeCategory) {
      this.cascadedCat = p.activeCategory;
      cascade(this.options, 18);
    }
  }

  destroy(): void { this.node.remove(); }
}
