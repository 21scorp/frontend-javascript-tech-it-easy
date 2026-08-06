/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/nav.ts
   The five-destination bottom bar.

   WHY it sits above the sheet in z-order: the bar is the player's
   escape hatch and their way to swap panels without a close-then-
   open round trip. Burying it under the sheet would cost a tap on
   the most frequent journey in the game.

   Selected state is a lifted gold puck rather than a tint: on a
   phone the finger covers the label, so the affordance has to be
   readable from the *shape* peeking out around the thumb.
   ═══════════════════════════════════════════════════════════════ */

import { el, on, setText, toggle } from "./dom";
import { icon, type IconName } from "./icons";
import { haptic } from "./motion";

export type NavDest = "skills" | "bag" | "base" | "shop" | "character";

export interface NavItem {
  id: NavDest;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "skills",    label: "Skills",  icon: "skilltree" },
  { id: "bag",       label: "Bag",     icon: "bag" },
  { id: "base",      label: "Base",    icon: "house" },
  { id: "shop",      label: "Shop",    icon: "tag" },
  { id: "character", label: "Hero",    icon: "person" },
];

export interface NavOptions {
  /** `reselect` is true when the already-open destination is tapped
      again — panels use it to jump the sheet to full height. */
  onSelect: (dest: NavDest, reselect: boolean) => void;
}

interface Slot {
  btn: HTMLElement;
  badge: HTMLElement;
}

export class Nav {
  readonly node: HTMLElement;
  private readonly slots = new Map<NavDest, Slot>();
  private active: NavDest | null = null;
  private disposers: Array<() => void> = [];

  constructor(private readonly opts: NavOptions) {
    this.node = el("nav.tf-nav", { role: "tablist", "aria-label": "Main sections" });

    for (const item of NAV_ITEMS) {
      const badge = el("span.tf-navbtn__dot", { hidden: true });
      const btn = el("button.tf-navbtn",
        {
          type: "button", role: "tab", id: `tf-tab-${item.id}`,
          "aria-selected": "false", "aria-label": item.label,
        },
        el("span.tf-navbtn__puck", {}, icon(item.icon, { size: "1em" })),
        el("span.tf-navbtn__label", { text: item.label }),
        badge,
      );
      this.disposers.push(on(btn, "click", () => {
        const reselect = this.active === item.id;
        haptic(reselect ? 4 : 9);
        this.opts.onSelect(item.id, reselect);
      }));
      this.slots.set(item.id, { btn, badge });
      this.node.appendChild(btn);
    }
  }

  /** null clears the selection (sheet closed, player is in the world). */
  setActive(dest: NavDest | null): void {
    this.active = dest;
    for (const [id, slot] of this.slots) {
      slot.btn.setAttribute("aria-selected", String(id === dest));
    }
  }

  get activeDest(): NavDest | null { return this.active; }

  /** Count badge — 0/null hides it, >99 shows "99+". */
  setBadge(dest: NavDest, value: number | string | null): void {
    const slot = this.slots.get(dest);
    if (!slot) return;
    const empty = value === null || value === 0 || value === "";
    slot.badge.hidden = empty;
    if (!empty) {
      setText(slot.badge, typeof value === "number" && value > 99 ? "99+" : String(value));
    }
  }

  /** Pull attention to a tab (new content, quest step). */
  setPinging(dest: NavDest, on_: boolean): void {
    const slot = this.slots.get(dest);
    if (slot) toggle(slot.btn, "is-ping", on_);
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.node.remove();
  }
}
