/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/panels/shop.ts
   Storefront shell: tabs, a featured slot, and price tiles.

   WHY the price lives on a button and not in body text: the price
   IS the call to action in a store, and splitting them costs a tap
   target and a beat of hesitation. Coin prices are gold, gem prices
   violet, owned items go inert grey — the colour tells you which
   wallet you are spending before you read the number.

   NOTE: this surface performs no purchases. onBuy fires and the
   economy system decides; the shell never mutates a balance.
   ═══════════════════════════════════════════════════════════════ */

import { el, on, fill, setText } from "./../dom";
import { icon, coinMedal, gemMedal, type IconName } from "./../icons";
import { skelGrid, skelBlock, cascade } from "./../transitions";
import { compact } from "./../theme";
import { BasePanel } from "./panel";

export type ShopTabId = string;

export interface ShopTab {
  id: ShopTabId;
  label: string;
  icon?: IconName;
}

export interface ShopOffer {
  id: string;
  name: string;
  /** Sub-line: "24 hours", "x2 XP", "Best value". */
  sub?: string;
  icon?: IconName;
  art?: string;
  /** Which wallet. "real" renders the label verbatim ("$4.99"). */
  currency: "coin" | "gem" | "real";
  price: number | string;
  /** Struck-through original, e.g. 1200. */
  wasPrice?: number;
  /** Corner flag: "+20% BONUS", "NEW". */
  flag?: string;
  owned?: boolean;
  disabled?: boolean;
  tint?: string;
}

export interface ShopFeature {
  name: string;
  sub?: string;
  icon?: IconName;
  art?: string;
  ribbon?: string;
  currency: "coin" | "gem" | "real";
  price: number | string;
  offerId: string;
}

export interface ShopProps {
  tabs: ShopTab[];
  activeTab: ShopTabId;
  /** Big card at the top of the active tab. */
  feature?: ShopFeature | null;
  offers: ShopOffer[];
  /** Optional "refreshes in" line under the tabs. */
  refreshIn?: string;
  loading?: boolean;
  onTab?: (id: ShopTabId) => void;
  onBuy?: (offerId: string) => void;
}

export class ShopPanel extends BasePanel<ShopProps> {
  readonly eyebrow = "Trading post";
  readonly title = "Shop";
  readonly node: HTMLElement;

  private readonly tabs = el("div.tf-chiprow", { role: "tablist", "aria-label": "Store sections" });
  private readonly refresh = el("div.tf-skill__xp", { style: "margin:var(--sp-2) 0 0" });
  private readonly featureSlot = el("div");
  private readonly grid = el("div.tf-grid.tf-grid--2");
  private readonly skeleton: HTMLElement;
  private cascadedTab = "";

  constructor(initial: Partial<ShopProps> = {}) {
    super({ tabs: [], activeTab: "", offers: [], loading: false, ...initial });

    this.skeleton = el("div", {},
      skelBlock("calc(112 * var(--tf-u))", "var(--r-5)"),
      el("div", { style: "height:var(--sp-4)" }),
      skelGrid(6, 2),
    );

    this.node = el("div.tf-pan.tf-screen", {},
      this.tabs, this.refresh,
      el("div", { style: "height:var(--sp-3)" }),
      this.featureSlot, this.grid, this.skeleton,
    );
    this.render();
  }

  protected render(): void {
    const p = this.state;
    const loading = !!p.loading;
    this.skeleton.hidden = !loading;
    for (const n of [this.tabs, this.featureSlot, this.grid]) n.hidden = loading;
    this.refresh.hidden = loading || !p.refreshIn;
    if (loading) return;

    fill(this.tabs, ...p.tabs.map((t) => {
      const c = el("button.tf-chip", {
        type: "button", role: "tab", "aria-selected": String(t.id === p.activeTab),
      }, t.icon ? icon(t.icon, { size: "0.9em" }) : null, el("span", { text: t.label }));
      on(c, "click", () => this.state.onTab?.(t.id));
      return c;
    }));

    setText(this.refresh, p.refreshIn ? `Restocks in ${p.refreshIn}` : "");

    fill(this.featureSlot, p.feature ? this.buildFeature(p.feature) : null);
    fill(this.grid, ...p.offers.map((o) => this.buildOffer(o)));

    if (this.cascadedTab !== p.activeTab) {
      this.cascadedTab = p.activeTab;
      cascade(this.grid, 26);
    }
  }

  private buildFeature(f: ShopFeature): HTMLElement {
    const buy = this.priceButton(f.currency, f.price, false, false);
    on(buy, "click", () => this.state.onBuy?.(f.offerId));
    return el("div.tf-feature", { style: "margin-bottom:var(--sp-4)" },
      f.ribbon ? el("div.tf-ribbon", { text: f.ribbon }) : null,
      el("div.tf-feature__art", {},
        f.art ? el("img", { src: f.art, alt: "", style: "max-width:86%;max-height:86%" }) : icon(f.icon ?? "sparkle", { size: "1em" })),
      el("div.tf-feature__body", {},
        el("div.tf-feature__name", { text: f.name }),
        f.sub ? el("div.tf-feature__sub", { text: f.sub }) : null,
        buy,
      ),
    );
  }

  private buildOffer(o: ShopOffer): HTMLElement {
    const buy = this.priceButton(o.currency, o.price, !!o.owned, !!o.disabled, o.wasPrice);
    on(buy, "click", () => { if (!o.owned && !o.disabled) this.state.onBuy?.(o.id); });

    const node = el("div.tf-offer", {},
      o.flag ? el("div.tf-offer__flag", { text: o.flag }) : null,
      el("div.tf-offer__art", {},
        o.art ? el("img", { src: o.art, alt: "", style: "max-width:70%;max-height:70%" }) : icon(o.icon ?? "star", { size: "1em" })),
      el("div.tf-offer__name", { text: o.name }),
      el("div.tf-offer__sub", { text: o.sub ?? "" }),
      buy,
    );
    if (o.tint) node.style.setProperty("--tint", o.tint);
    return node;
  }

  private priceButton(
    currency: ShopOffer["currency"], price: number | string,
    owned: boolean, disabled: boolean, was?: number,
  ): HTMLElement {
    if (owned) {
      return el("button.tf-price.tf-price--owned", { type: "button", disabled: true },
        icon("check", { size: "0.85em" }), el("span", { text: "Owned" }));
    }
    const label = typeof price === "number" ? compact(price, 2) : price;
    const kids: Node[] = [];
    if (currency === "coin") kids.push(coinMedal(17));
    else if (currency === "gem") kids.push(gemMedal(15));
    if (was !== undefined) {
      kids.push(el("s", { text: compact(was, 2), style: "opacity:.55;font-weight:600" }));
    }
    kids.push(el("span", { text: label }));

    const b = el(`button.tf-price${currency === "gem" ? ".tf-price--gem" : ""}`,
      { type: "button", disabled, "aria-label": `Buy for ${label} ${currency === "real" ? "" : currency}` },
      ...kids);
    return b;
  }

  destroy(): void { this.node.remove(); }
}
