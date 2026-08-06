/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/panels/skills.ts
   The twelve-skill grid.

   WHY a ring instead of a bar on each card: twelve linear bars in a
   grid turn into visual noise, and the number that matters at a
   glance is "how close am I". A ring reads as a dial, keeps the card
   square, and leaves the centre free for the skill's icon — which is
   the thing the player actually scans for.

   The next-unlock hint is deliberately on every card. In an idle
   game the reason to keep training has to be visible without a tap.
   ═══════════════════════════════════════════════════════════════ */

import { el, setText, on, reconcile } from "./../dom";
import { icon, type IconName } from "./../icons";
import { makeRing, type RingHandle } from "./../widgets";
import { skelGrid, skelBlock, cascade } from "./../transitions";
import { compact } from "./../theme";
import { BasePanel } from "./panel";

export interface SkillCard {
  /** Stable key — the panel reuses DOM per id. */
  id: string;
  name: string;
  icon: IconName;
  level: number;
  maxLevel?: number;
  /** XP inside the current level, and how big that level is. */
  xpInLevel: number;
  xpForLevel: number;
  /** Dim + padlock. */
  locked?: boolean;
  /** One line: "Yew logs at 60". Shown under the card. */
  unlockHint?: string;
  /** Currently training — gets the aqua glow and TRAINING tag. */
  active?: boolean;
  /** CSS colour for the icon; falls back to the aqua/ink default. */
  tint?: string;
}

export interface SkillsProps {
  skills: SkillCard[];
  /** Header stats. Omit any to hide that cell. */
  totalLevel?: number;
  totalXp?: number;
  /** Highest-level skill name, for the summary strip. */
  bestSkill?: string;
  loading?: boolean;
  onSelect?: (id: string) => void;
}

interface Row {
  node: HTMLElement;
  ring: RingHandle;
  iconSlot: HTMLElement;
  name: HTMLElement;
  lvl: HTMLElement;
  xp: HTMLElement;
  hint: HTMLElement;
  tag: HTMLElement;
  lock: HTMLElement;
  iconName: IconName | null;
}

export class SkillsPanel extends BasePanel<SkillsProps> {
  readonly eyebrow = "Progression";
  readonly title = "Skills";
  readonly node: HTMLElement;

  private readonly statTotal = el("div.tf-stat__v.tf-stat__v--gold", { text: "0" });
  private readonly statXp = el("div.tf-stat__v", { text: "0" });
  private readonly statBest = el("div.tf-stat__v.tf-stat__v--aqua", { text: "—" });
  private readonly stats: HTMLElement;
  private readonly grid = el("div.tf-grid.tf-grid--3");
  private readonly skeleton: HTMLElement;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly cells = new Map<string, Row>();
  private didCascade = false;

  constructor(initial: Partial<SkillsProps> = {}) {
    super({ skills: [], loading: false, ...initial });

    this.stats = el("div.tf-stats", {},
      el("div.tf-stat", {}, this.statTotal, el("div.tf-stat__k", { text: "Total level" })),
      el("div.tf-stat", {}, this.statXp, el("div.tf-stat__k", { text: "Total XP" })),
      el("div.tf-stat", {}, this.statBest, el("div.tf-stat__k", { text: "Highest" })),
    );

    this.skeleton = el("div", {}, skelBlock("calc(58 * var(--tf-u))"), el("div", { style: "height:var(--sp-4)" }), skelGrid(12, 3));

    this.node = el("div.tf-pan.tf-screen", {}, this.stats, this.grid, this.skeleton);
    this.render();
  }

  protected render(): void {
    const p = this.state;
    const loading = !!p.loading;

    this.skeleton.hidden = !loading;
    this.stats.hidden = loading;
    this.grid.hidden = loading;
    if (loading) return;

    setText(this.statTotal, String(p.totalLevel ?? p.skills.reduce((a, s) => a + s.level, 0)));
    setText(this.statXp, compact(p.totalXp ?? 0, 2));
    setText(this.statBest, p.bestSkill ?? "—");

    reconcile(
      this.grid, p.skills, (s) => s.id,
      (s) => this.build(s),
      (_node, s) => this.paint(s),
      this.rows,
    );

    if (!this.didCascade && p.skills.length) {
      this.didCascade = true;
      cascade(this.grid, 22);
    }
  }

  private build(s: SkillCard): HTMLElement {
    const ring = makeRing({ size: 58, width: 4.5, color: s.tint ?? "#2fd7c4", glow: true });
    const iconSlot = el("span.tf-skill__ic");
    const name = el("span.tf-skill__name");
    const lvl = el("span.tf-skill__lv");
    const xp = el("span.tf-skill__xp");
    const hint = el("span.tf-skill__hint");
    const tag = el("span.tf-skill__tag", { text: "Training", hidden: true });
    const lock = el("span.tf-skill__lock", { hidden: true }, icon("lock", { size: "1em" }));

    const node = el("button.tf-skill", { type: "button" },
      lvl,
      el("span.tf-skill__ring", {}, ring.node, iconSlot, lock),
      name, xp, hint, tag,
    );
    on(node, "click", () => this.state.onSelect?.(s.id));

    this.cells.set(s.id, { node, ring, iconSlot, name, lvl, xp, hint, tag, lock, iconName: null });
    return node;
  }

  private paint(s: SkillCard): void {
    const c = this.cells.get(s.id);
    if (!c) return;

    if (c.iconName !== s.icon) {
      c.iconName = s.icon;
      c.iconSlot.replaceChildren(icon(s.icon, { size: "1em" }));
    }
    if (s.tint) c.node.style.setProperty("--tint", s.tint);

    setText(c.name, s.name);
    setText(c.lvl, String(s.level));
    const pct = s.xpForLevel > 0 ? s.xpInLevel / s.xpForLevel : 0;
    c.ring.set(s.locked ? 0 : pct);
    setText(c.xp, s.locked ? "Locked" : `${compact(s.xpInLevel)}/${compact(s.xpForLevel)}`);
    setText(c.hint, s.unlockHint ?? "");
    c.tag.hidden = !s.active;
    c.lock.hidden = !s.locked;
    // A "0" level chip on a locked skill is noise; the padlock says it.
    c.lvl.hidden = !!s.locked;
    c.node.classList.toggle("is-active", !!s.active);
    c.node.classList.toggle("is-locked", !!s.locked);
    c.node.setAttribute(
      "aria-label",
      s.locked
        ? `${s.name}, locked. ${s.unlockHint ?? ""}`
        : `${s.name}, level ${s.level}${s.maxLevel ? ` of ${s.maxLevel}` : ""}, ${Math.floor(pct * 100)} percent to next level${s.active ? ", currently training" : ""}`,
    );
  }

  destroy(): void {
    this.rows.clear();
    this.cells.clear();
    this.node.remove();
  }
}
