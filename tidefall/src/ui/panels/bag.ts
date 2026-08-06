/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/panels/bag.ts
   Inventory grid, rarity borders, stack counts, detail popover.

   WHY a popover rather than a second sheet: stacking sheet-on-sheet
   costs the player their place in the grid and a second dismiss
   gesture. The popover opens next to the tile the finger is already
   on, keeps the grid visible behind it, and dies on any outside tap.

   WHY the grid always draws empty slots: a bag that ends where the
   items end hides the upgrade hook. Seeing the wells you have not
   filled is the whole reason to buy more.
   ═══════════════════════════════════════════════════════════════ */

import { el, on, setText, fill, reconcile, clamp } from "./../dom";
import { icon, type IconName } from "./../icons";
import { makeBar } from "./../widgets";
import { skelGrid, skelBlock, cascade } from "./../transitions";
import { RARITY, type Rarity, compact, grouped } from "./../theme";
import { dismiss } from "./../sheet";
import { BasePanel } from "./panel";

export interface BagItemAction {
  id: string;
  label: string;
  variant?: "gold" | "gem" | "ghost" | "plain";
  disabled?: boolean;
}

export interface BagItem {
  /** Stable key; the panel reuses the tile DOM for this id. */
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
  /** Preferred: a sprite URL. Falls back to `icon` then a rarity dot. */
  art?: string;
  icon?: IconName;
  /** One line under the name in the popover. */
  subtitle?: string;
  /** Key/value rows in the popover, e.g. { label: "Value", value: "82g" }. */
  stats?: Array<{ label: string; value: string }>;
  equipped?: boolean;
  isNew?: boolean;
  /** Buttons in the popover. Ids come back through onItemAction. */
  actions?: BagItemAction[];
}

export interface BagFilter { id: string; label: string; icon?: IconName }

export interface BagProps {
  items: BagItem[];
  /** Capacity meter. slotsUsed defaults to items.length. */
  slotsUsed?: number;
  slotsTotal: number;
  filters?: BagFilter[];
  activeFilter?: string;
  loading?: boolean;
  onFilter?: (id: string) => void;
  onSort?: () => void;
  onItemAction?: (itemId: string, actionId: string) => void;
  /** Fired on tile tap, before the popover opens. */
  onSelect?: (itemId: string) => void;
}

/** Hard cap on rendered wells so a 500-slot bank cannot stall a frame. */
const MAX_CELLS = 60;

export class BagPanel extends BasePanel<BagProps> {
  readonly eyebrow = "Carried";
  readonly title = "Bag";
  readonly node: HTMLElement;

  private readonly capBar = makeBar("gold", false);
  private readonly capNum = el("span.tf-cap__n");
  private readonly chips = el("div.tf-chiprow", { role: "tablist", "aria-label": "Filter items" });
  private readonly grid = el("div.tf-grid.tf-grid--5", { role: "grid", "aria-label": "Inventory" });
  private readonly skeleton: HTMLElement;
  private readonly tiles = new Map<string, HTMLElement>();
  private popover: HTMLElement | null = null;
  private scrim: HTMLElement | null = null;
  private selected: string | null = null;
  private didCascade = false;

  constructor(initial: Partial<BagProps> = {}) {
    super({ items: [], slotsTotal: 40, loading: false, ...initial });

    this.skeleton = el("div", {},
      skelBlock("calc(34 * var(--tf-u))"),
      el("div", { style: "height:var(--sp-4)" }),
      skelGrid(20, 5, "var(--sp-2)"),
    );

    this.node = el("div.tf-pan.tf-screen", { style: "position:relative" },
      el("div.tf-cap", {}, this.capBar.node, this.capNum),
      this.chips,
      this.grid,
      this.skeleton,
    );
    this.render();
  }

  headerActions(): Node[] {
    const b = el("button.tf-iconbtn", { type: "button", "aria-label": "Sort bag" }, icon("sortdown", { size: "0.8em" }));
    on(b, "click", () => this.state.onSort?.());
    return [b];
  }

  onHide(): void { this.closePopover(); }

  protected render(): void {
    const p = this.state;
    const loading = !!p.loading;
    this.skeleton.hidden = !loading;
    this.grid.hidden = loading;
    this.chips.hidden = loading || !p.filters?.length;
    if (loading) return;

    /* capacity */
    const used = p.slotsUsed ?? p.items.length;
    this.capBar.set(p.slotsTotal ? used / p.slotsTotal : 0);
    setText(this.capNum, "");
    fill(this.capNum, el("b", { text: String(used) }), ` / ${p.slotsTotal}`);
    this.capBar.node.setAttribute("aria-label", `Bag capacity ${used} of ${p.slotsTotal}`);

    /* filters */
    if (p.filters?.length) {
      fill(this.chips, ...p.filters.map((f) => {
        const c = el("button.tf-chip", {
          type: "button", role: "tab",
          "aria-selected": String(f.id === p.activeFilter),
        }, f.icon ? icon(f.icon, { size: "0.85em" }) : null, el("span", { text: f.label }));
        on(c, "click", () => this.state.onFilter?.(f.id));
        return c;
      }));
    }

    /* grid: items first, then empty wells up to the visible cap */
    const cells: Array<BagItem | null> = [...p.items];
    const target = clamp(Math.max(p.slotsTotal, p.items.length), 0, MAX_CELLS);
    while (cells.length < target) cells.push(null);

    reconcile(
      this.grid, cells,
      (c, i) => (c ? `i:${c.id}` : `e:${i}`),
      (c) => (c ? this.buildTile(c) : el("div.tf-slot.tf-slot--empty", { role: "gridcell", "aria-hidden": "true" })),
      (node, c) => { if (c) this.paintTile(node, c); },
      this.tiles,
    );

    if (!this.didCascade && p.items.length) { this.didCascade = true; cascade(this.grid, 12); }
  }

  /* ── tiles ──────────────────────────────────────────────────── */

  private buildTile(item: BagItem): HTMLElement {
    const node = el("button.tf-slot.tf-slot--full", {
      type: "button", role: "gridcell", "aria-pressed": "false",
    },
      el("span.tf-slot__art"),
      el("span.tf-slot__qty"),
      el("span.tf-slot__new", { hidden: true }),
      el("span.tf-slot__eq", { text: "E", hidden: true }),
    );
    on(node, "click", () => {
      this.state.onSelect?.(item.id);
      this.openPopover(item.id, node);
    });
    return node;
  }

  private paintTile(node: HTMLElement, item: BagItem): void {
    const r = RARITY[item.rarity] ?? RARITY.common;
    node.style.setProperty("--rar", r.color);
    node.style.setProperty("--rar-glow", r.glow);

    const art = node.querySelector(".tf-slot__art") as HTMLElement;
    const key = item.art ?? item.icon ?? "";
    if (art.dataset.key !== key) {
      art.dataset.key = key;
      if (item.art) {
        art.replaceChildren(el("img", { src: item.art, alt: "", loading: "lazy", decoding: "async" }));
      } else {
        art.replaceChildren(icon(item.icon ?? "star", { size: "1em" }));
      }
    }

    const qty = node.querySelector(".tf-slot__qty") as HTMLElement;
    setText(qty, item.qty > 1 ? compact(item.qty) : "");
    (node.querySelector(".tf-slot__new") as HTMLElement).hidden = !item.isNew;
    (node.querySelector(".tf-slot__eq") as HTMLElement).hidden = !item.equipped;
    node.setAttribute("aria-pressed", String(this.selected === item.id));
    node.setAttribute(
      "aria-label",
      `${item.name}, ${r.label}${item.qty > 1 ? `, ${grouped(item.qty)}` : ""}${item.equipped ? ", equipped" : ""}`,
    );
  }

  /* ── detail popover ─────────────────────────────────────────── */

  private openPopover(id: string, anchor: HTMLElement): void {
    if (this.selected === id) { this.closePopover(); return; }
    this.closePopover();

    const item = this.state.items.find((i) => i.id === id);
    if (!item) return;
    this.selected = id;
    anchor.setAttribute("aria-pressed", "true");

    const r = RARITY[item.rarity] ?? RARITY.common;

    const acts = (item.actions ?? [
      { id: "use", label: "Use", variant: "gold" as const },
      { id: "drop", label: "Drop", variant: "ghost" as const },
    ]).map((a) => {
      const cls = a.variant === "gold" ? ".tf-btn--gold"
        : a.variant === "gem" ? ".tf-btn--gem"
        : a.variant === "ghost" ? ".tf-btn--ghost" : "";
      const b = el(`button.tf-btn.tf-btn--sm${cls}`, { type: "button", text: a.label, disabled: a.disabled });
      on(b, "click", () => { this.state.onItemAction?.(item.id, a.id); this.closePopover(); });
      return b;
    });

    const pop = el("div.tf-pop", { role: "dialog", "aria-label": item.name },
      el("div.tf-pop__head", {},
        el("div.tf-pop__art", {},
          item.art
            ? el("img", { src: item.art, alt: "" })
            : icon(item.icon ?? "star", { size: "1em" }),
        ),
        el("div", {},
          el("div.tf-pop__name", { text: item.name }),
          el("div.tf-pop__rar", { text: r.label }),
          item.subtitle ? el("div.tf-pop__sub", { text: item.subtitle }) : null,
        ),
      ),
      item.stats?.length
        ? el("div.tf-pop__stats", {}, ...item.stats.map((s) =>
            el("div.tf-pop__row", {}, el("span", { text: s.label }), el("b", { text: s.value }))))
        : null,
      el("div.tf-pop__acts", {}, ...acts),
    );
    pop.style.setProperty("--rar", r.color);

    const scrim = el("div.tf-pop__scrim");
    on(scrim, "pointerdown", () => this.closePopover());

    this.node.append(scrim, pop);
    this.scrim = scrim;
    this.popover = pop;

    // Anchor under the tile, flipping above when it would overflow.
    const gap = 10;
    const below = anchor.offsetTop + anchor.offsetHeight + gap;
    const fitsBelow = below + pop.offsetHeight < this.node.offsetHeight;
    pop.style.top = `${fitsBelow ? below : Math.max(0, anchor.offsetTop - pop.offsetHeight - gap)}px`;
    const left = anchor.offsetLeft + anchor.offsetWidth / 2 - pop.offsetWidth / 2;
    pop.style.left = `${clamp(left, 0, Math.max(0, this.node.offsetWidth - pop.offsetWidth))}px`;

    (acts[0] ?? pop).focus?.({ preventScroll: true });
  }

  private closePopover(): void {
    if (this.selected) {
      const t = this.tiles.get(`i:${this.selected}`);
      t?.setAttribute("aria-pressed", "false");
    }
    this.selected = null;
    this.scrim?.remove();
    this.scrim = null;
    if (this.popover) { dismiss(this.popover); this.popover = null; }
  }

  destroy(): void {
    this.closePopover();
    this.tiles.clear();
    this.node.remove();
  }
}
