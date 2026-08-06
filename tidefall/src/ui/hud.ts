/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/hud.ts
   Top status strip: purse, gems, and what the idle loop is doing.

   WHY it is read-only: the top of a portrait phone is out of thumb
   reach, so nothing up here may be required to play. The one
   exception is the activity readout, which is a shortcut into the
   Skills sheet — a nice-to-have, never the only route.

   WHY it animates: an idle game's core feedback loop is "the number
   went up while I was away". A snap from 1,204 to 9,910 reads as a
   bug; a 700ms roll with a coin flip reads as a reward.
   ═══════════════════════════════════════════════════════════════ */

import { el, setText, on } from "./dom";
import { icon, coinMedal, gemMedal, type IconName } from "./icons";
import { makeRing } from "./widgets";
import { CountUp, pulse } from "./motion";
import { currency, compact } from "./theme";

/** What the idle/skill system feeds the HUD each time it changes. */
export interface HudActivity {
  /** Stable id so the HUD can tell "same skill, new xp" from a switch. */
  skillId: string;
  name: string;
  icon: IconName;
  level: number;
  /** XP accumulated inside the current level, and the level's size. */
  xpInLevel: number;
  xpForLevel: number;
  /** Optional projected gain, shown as "+1.2K/h". */
  ratePerHour?: number;
  /** False parks the readout in its dim "idle" state. */
  active: boolean;
}

export interface HudProps {
  coins: number;
  gems: number;
  activity: HudActivity | null;
}

export interface HudOptions {
  /** Tapping the activity strip — wire this to open the Skills sheet. */
  onActivity?: () => void;
}

const IDLE: HudActivity = {
  skillId: "__idle", name: "Resting", icon: "clock", level: 0,
  xpInLevel: 0, xpForLevel: 1, active: false,
};

export class Hud {
  readonly node: HTMLElement;

  private readonly coinNum: HTMLElement;
  private readonly gemNum: HTMLElement;
  private readonly coinPurse: HTMLElement;
  private readonly gemPurse: HTMLElement;
  private readonly coinDelta: HTMLElement;
  private readonly gemDelta: HTMLElement;
  private readonly coinCount: CountUp;
  private readonly gemCount: CountUp;

  private readonly act: HTMLElement;
  private readonly actIconSlot: HTMLElement;
  private readonly actName: HTMLElement;
  private readonly actLvl: HTMLElement;
  private readonly actRate: HTMLElement;
  private readonly actXp: HTMLElement;
  private readonly ring = makeRing({ size: 38, width: 3.5, color: "#2fd7c4", glow: true });

  private currentSkill = "";
  private disposers: Array<() => void> = [];

  constructor(opts: HudOptions = {}) {
    /* ── purses ── */
    this.coinNum = el("span.tf-purse__num", { text: "0" });
    this.coinDelta = el("span.tf-purse__delta");
    this.coinPurse = el("div.tf-purse.tf-purse--coin",
      { role: "status", "aria-live": "polite", "aria-label": "Coins" },
      el("span.tf-purse__medal", {}, coinMedal(30)),
      this.coinNum, this.coinDelta,
    );

    this.gemNum = el("span.tf-purse__num", { text: "0" });
    this.gemDelta = el("span.tf-purse__delta");
    this.gemPurse = el("div.tf-purse.tf-purse--gem",
      { role: "status", "aria-live": "polite", "aria-label": "Gems" },
      el("span.tf-purse__medal", {}, gemMedal(26)),
      this.gemNum, this.gemDelta,
    );

    this.coinCount = new CountUp(0, (v) => setText(this.coinNum, currency(v)));
    this.gemCount = new CountUp(0, (v) => setText(this.gemNum, currency(v)));

    /* ── activity readout ── */
    this.actIconSlot = el("span.tf-activity__icon", {}, icon("clock", { size: "1em" }));
    this.actName = el("span.tf-activity__name", { text: "Resting" });
    this.actLvl = el("span.tf-activity__lvl", { text: "LV 0" });
    this.actRate = el("span.tf-activity__rate");
    this.actXp = el("span.tf-activity__xp", { text: "Tap a resource to begin" });

    this.act = el("button.tf-activity.tf-activity__idle",
      { type: "button", "aria-label": "Current activity — open Skills" },
      el("span.tf-activity__ring", {}, this.ring.node, this.actIconSlot),
      el("span.tf-activity__body", {},
        el("span.tf-activity__line", {}, this.actName, this.actLvl, this.actRate),
        this.actXp,
      ),
    );
    if (opts.onActivity) this.disposers.push(on(this.act, "click", opts.onActivity));

    this.node = el("header.tf-hud", { role: "banner" },
      el("div.tf-hud__top", {}, this.coinPurse, this.gemPurse, el("div.tf-hud__spacer")),
      this.act,
    );

    this.setActivity(null);
  }

  /* ── public API ─────────────────────────────────────────────── */

  setProps(p: Partial<HudProps>): void {
    if (p.coins !== undefined) this.setCoins(p.coins);
    if (p.gems !== undefined) this.setGems(p.gems);
    if (p.activity !== undefined) this.setActivity(p.activity);
  }

  /** `animate:false` for load/restore, so the HUD doesn't roll from 0. */
  setCoins(v: number, animate = true): void {
    this.applyCurrency(this.coinCount, this.coinPurse, this.coinDelta, v, animate);
  }

  setGems(v: number, animate = true): void {
    this.applyCurrency(this.gemCount, this.gemPurse, this.gemDelta, v, animate);
  }

  get coins() { return this.coinCount.value; }
  get gems() { return this.gemCount.value; }

  setActivity(a: HudActivity | null): void {
    const data = a ?? IDLE;
    const idle = !data.active;

    this.act.classList.toggle("tf-activity__idle", idle);

    if (data.skillId !== this.currentSkill) {
      this.currentSkill = data.skillId;
      this.actIconSlot.replaceChildren(icon(data.icon, { size: "1em" }));
      if (!idle) pulse(this.act, "is-pop", 400);
    }

    setText(this.actName, data.name);
    setText(this.actLvl, idle ? "IDLE" : `LV ${data.level}`);

    const pct = data.xpForLevel > 0 ? data.xpInLevel / data.xpForLevel : 0;
    this.ring.set(idle ? 0 : pct);

    setText(
      this.actXp,
      idle
        ? "Tap a resource to begin"
        : `${compact(data.xpInLevel)} / ${compact(data.xpForLevel)} XP · ${Math.floor(pct * 100)}%`,
    );
    setText(this.actRate, !idle && data.ratePerHour ? `+${compact(data.ratePerHour)}/h` : "");
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.node.remove();
  }

  /* ── internals ──────────────────────────────────────────────── */

  private applyCurrency(
    count: CountUp, purse: HTMLElement, delta: HTMLElement, v: number, animate: boolean,
  ) {
    const prev = count.value;
    if (!animate) { count.set(v); return; }
    if (v === prev) return;

    const diff = v - prev;
    delta.classList.toggle("is-neg", diff < 0);
    setText(delta, `${diff > 0 ? "+" : "−"}${compact(Math.abs(diff))}`);
    pulse(delta, "is-run", 1000);
    pulse(purse, "is-pop", 400);
    count.to(v, Math.min(900, 320 + Math.abs(diff) * 0.4));
  }
}
