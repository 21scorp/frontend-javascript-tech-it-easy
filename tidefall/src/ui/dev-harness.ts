/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/dev-harness.ts
   Mounts the UI standalone so it can be reviewed and screenshotted
   without touching game.ts. Loaded only by src/ui/dev.html.

   It also exposes window.TIDEFALL_UI so an automated visual pass can
   drive every state (open each panel, fire a level-up, toggle
   loading skeletons) from the outside.
   ═══════════════════════════════════════════════════════════════ */

import { UISystem } from "./index";
import type { NavDest } from "./nav";
import type { Detent } from "./sheet";

const host = document.getElementById("ui-root") as HTMLElement | null;
if (!host) throw new Error("[dev-harness] #ui-root missing");

const ui = new UISystem({ demo: true });
ui.attachStandalone(host, host.clientWidth || 390);
void ui.loadDemo();

/* A little life so screenshots are not of a dead screen: the purse
   ticks like the idle loop is paying out. */
let coins = 184_920;
let xp = 3120;
const timer = window.setInterval(() => {
  coins += Math.round(120 + Math.random() * 400);
  ui.hud.setCoins(coins);
  xp = (xp + 90) % 5400;
  ui.hud.setActivity({
    skillId: "fishing", name: "Fishing", icon: "fish", level: 42,
    xpInLevel: xp, xpForLevel: 5400, ratePerHour: 12400, active: true,
  });
}, 3200);

/* ── remote control for the visual pass ─────────────────────────── */

interface Harness {
  ui: UISystem;
  open(dest: NavDest, detent?: Detent): void;
  close(): void;
  toast(): void;
  levelUp(): void;
  dialog(): void;
  reward(): void;
  loading(on: boolean): void;
  freeze(): void;
}

const harness: Harness = {
  ui,
  open: (dest, detent) => ui.open(dest, detent),
  close: () => ui.close(),
  toast: () => {
    ui.toast({ kind: "gold", icon: "coin", title: "Sold 128 Trout", sub: "+23,040 coins" });
    ui.toast({ kind: "good", icon: "check", title: "Smokehouse upgraded", sub: "Level 3 · +40% output" });
    ui.toast({ kind: "bad", icon: "info", title: "Bag is full", sub: "Sell or drop something" });
  },
  levelUp: () => ui.levelUp({
    skill: "Fishing", level: 43, icon: "fish",
    unlock: "Bluefin Tuna now bite at the Point",
  }),
  dialog: () => void ui.confirm({
    title: "Scrap Tidewrought Blade?",
    body: "You will get back 4 Elder Logs and 1,200 coins. This cannot be undone.",
    actions: [
      { label: "Keep", variant: "ghost" },
      { label: "Scrap it", variant: "gold" },
    ],
  }),
  reward: () => {
    for (let i = 0; i < 6; i++) {
      window.setTimeout(() => {
        ui.float({ text: `+${120 + i * 40}`, kind: i % 2 ? "coin" : "xp", y: 470, spread: 120 });
      }, i * 110);
    }
  },
  loading: (on: boolean) => {
    ui.panels.skills.setProps({ loading: on });
    ui.panels.bag.setProps({ loading: on });
    ui.panels.base.setProps({ loading: on });
    ui.panels.shop.setProps({ loading: on });
    ui.panels.character.setProps({ loading: on });
  },
  freeze: () => window.clearInterval(timer),
};

(window as unknown as Record<string, unknown>).TIDEFALL_UI = harness;

/* Dev keyboard shortcuts — 1..5 open panels, 0 closes. */
window.addEventListener("keydown", (e) => {
  const map: Record<string, NavDest> = {
    "1": "skills", "2": "bag", "3": "base", "4": "shop", "5": "character",
  };
  const dest = map[e.key];
  if (dest) ui.open(dest);
  if (e.key === "0") ui.close();
  if (e.key === "l") harness.levelUp();
  if (e.key === "t") harness.toast();
});
