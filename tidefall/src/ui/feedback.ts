/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/feedback.ts
   Toasts, floating reward numbers, the level-up celebration and a
   modal primitive.

   WHY these live together: they are the game's *reward channel*, and
   a reward channel has to be arbitrated. Two celebrations at once,
   or a toast under a modal, reads as broken. One module owns the
   stack, the caps (max 3 toasts, max 24 floats) and the ordering.

   Everything here degrades under prefers-reduced-motion to a plain
   appear/disappear — the information still arrives, the motion does
   not. Rewards are not optional content.
   ═══════════════════════════════════════════════════════════════ */

import { el, on, fill } from "./dom";
import { icon, coinMedal, gemMedal, type IconName } from "./icons";
import { addTick, tween, Ease, haptic } from "./motion";
import { prefersReducedMotion, compact } from "./theme";

export type ToastKind = "info" | "good" | "gold" | "bad";

export interface ToastSpec {
  title: string;
  sub?: string;
  kind?: ToastKind;
  icon?: IconName;
  /** ms on screen; default 2600. */
  ttl?: number;
}

export type FloatKind = "coin" | "gem" | "xp" | "bad" | "plain";

export interface FloatSpec {
  text: string;
  kind?: FloatKind;
  /** Origin in CSS px inside the portrait frame. Defaults to centre. */
  x?: number;
  y?: number;
  /** Slight horizontal wander so bursts do not overlap into a blur. */
  spread?: number;
}

export interface LevelUpSpec {
  skill: string;
  level: number;
  icon?: IconName;
  /** Optional "what this unlocked" line — the reason to care. */
  unlock?: string;
  onDismiss?: () => void;
}

export interface DialogAction {
  label: string;
  /** "gold" is the affirmative CTA; only one per dialog. */
  variant?: "gold" | "gem" | "ghost" | "plain";
  onPick?: () => void;
}

export interface DialogSpec {
  title: string;
  body?: string;
  icon?: IconName;
  actions?: DialogAction[];
  /** Tap-outside / Escape closes. Default true. */
  dismissable?: boolean;
}

const MAX_TOASTS = 3;
const MAX_FLOATS = 24;

export class Feedback {
  /** Mount all four in this order — z-index is set in CSS. */
  readonly toastLayer = el("div.tf-toasts", { role: "status", "aria-live": "polite" });
  readonly floatLayer = el("div.tf-floats", { "aria-hidden": "true" });
  readonly overlayLayer = el("div.tf-overlays");

  private floats = 0;
  private celebration: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private disposers: Array<() => void> = [];

  constructor(private readonly host: HTMLElement) {
    host.append(this.floatLayer, this.toastLayer, this.overlayLayer);
  }

  /* ── toasts ─────────────────────────────────────────────────── */

  toast(spec: ToastSpec): void {
    const kind = spec.kind ?? "info";
    const node = el(`div.tf-toast.tf-toast--${kind}`, {},
      el("span.tf-toast__ic", {}, icon(spec.icon ?? defaultToastIcon(kind), { size: "1em" })),
      el("span.tf-toast__txt", {},
        el("div.tf-toast__title", { text: spec.title }),
        spec.sub ? el("div.tf-toast__sub", { text: spec.sub }) : null,
      ),
    );
    this.toastLayer.appendChild(node);

    while (this.toastLayer.childElementCount > MAX_TOASTS) {
      this.toastLayer.firstElementChild?.remove();
    }

    const ttl = spec.ttl ?? 2600;
    window.setTimeout(() => {
      node.classList.add("is-out");
      window.setTimeout(() => node.remove(), 240);
    }, ttl);
  }

  /* ── floating numbers ───────────────────────────────────────── */

  float(spec: FloatSpec): void {
    if (this.floats >= MAX_FLOATS) return;
    const kind = spec.kind ?? "plain";
    const r = this.host.getBoundingClientRect();
    const x = (spec.x ?? r.width / 2) + (Math.random() - 0.5) * (spec.spread ?? 26);
    const y = spec.y ?? r.height * 0.62;

    const node = el(`div.tf-float${kind === "xp" ? ".tf-float--xp" : kind === "bad" ? ".tf-float--bad" : ""}`);
    if (kind === "coin") node.appendChild(coinMedal(16));
    if (kind === "gem") node.appendChild(gemMedal(15));
    node.appendChild(el("span", { text: spec.text }));
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    this.floatLayer.appendChild(node);
    this.floats++;

    if (prefersReducedMotion()) {
      window.setTimeout(() => { node.remove(); this.floats--; }, 900);
      return;
    }

    const drift = (Math.random() - 0.5) * 26;
    const rise = 82 + Math.random() * 26;
    tween(1050, (t) => {
      const lift = Ease.out(t) * rise;
      const scale = t < 0.18 ? 0.6 + Ease.back(t / 0.18) * 0.5 : 1.1 - t * 0.12;
      node.style.transform =
        `translate(-50%,-50%) translate(${drift * t}px, ${-lift}px) scale(${scale.toFixed(3)})`;
      node.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }, (t) => t, () => { node.remove(); this.floats--; });
  }

  /** Convenience burst for "you got paid" moments. */
  reward(amount: number, kind: FloatKind = "coin", at?: { x: number; y: number }): void {
    this.float({ text: `+${compact(amount)}`, kind, x: at?.x, y: at?.y });
  }

  /* ── level up ───────────────────────────────────────────────── */

  levelUp(spec: LevelUpSpec): void {
    this.celebration?.remove();
    haptic(18);

    const close = () => {
      if (!node.isConnected) return;
      node.classList.add("is-out");
      window.setTimeout(() => { node.remove(); spec.onDismiss?.(); }, 240);
      this.celebration = null;
    };

    const btn = el("button.tf-btn.tf-btn--gold", { type: "button", text: "Nice!" });
    const node = el("div.tf-celebrate", { role: "alertdialog", "aria-label": `${spec.skill} level ${spec.level}` },
      el("div.tf-celebrate__wash"),
      el("div.tf-celebrate__rays", { "aria-hidden": "true" }),
      confetti(),
      el("div.tf-celebrate__core", {},
        el("div.tf-celebrate__badge", {},
          el("div", {},
            el("div.tf-celebrate__cap", { text: "Level" }),
            el("div.tf-celebrate__lvl", { text: String(spec.level) }),
          ),
        ),
        el("div.tf-celebrate__skill", { text: spec.skill }),
        el("div.tf-celebrate__sub", { text: "Skill level increased" }),
        spec.unlock
          ? el("div.tf-celebrate__unlock", {},
              icon(spec.icon ?? "sparkle", { size: "1em" }),
              el("span", { text: spec.unlock }))
          : null,
        el("div.tf-celebrate__act", {}, btn),
      ),
    );

    this.disposers.push(on(btn, "click", close));
    this.disposers.push(on(node, "pointerdown", (e) => {
      if (e.target === node || (e.target as HTMLElement).classList.contains("tf-celebrate__wash")) close();
    }));

    this.overlayLayer.appendChild(node);
    this.celebration = node;
    btn.focus({ preventScroll: true });
    window.setTimeout(close, 6000);
  }

  /* ── modal ──────────────────────────────────────────────────── */

  /** Resolves with the index of the action picked, or -1 if dismissed. */
  confirm(spec: DialogSpec): Promise<number> {
    this.dialog?.remove();
    return new Promise((resolve) => {
      let done = false;
      const finish = (i: number) => {
        if (done) return;
        done = true;
        node.classList.add("is-out");
        window.setTimeout(() => node.remove(), 180);
        this.dialog = null;
        resolve(i);
      };

      const acts = spec.actions ?? [{ label: "OK", variant: "gold" }];
      const buttons = acts.map((a, i) => {
        const cls = a.variant === "gold" ? ".tf-btn--gold"
          : a.variant === "gem" ? ".tf-btn--gem"
          : a.variant === "ghost" ? ".tf-btn--ghost" : "";
        const b = el(`button.tf-btn${cls}`, { type: "button", text: a.label });
        on(b, "click", () => { a.onPick?.(); finish(i); });
        return b;
      });

      const scrim = el("div.tf-modal__scrim");
      const node = el("div.tf-modal", { role: "dialog", "aria-modal": "true", "aria-label": spec.title },
        scrim,
        el("div.tf-modal__card.tf-panel", {},
          spec.icon ? el("div.tf-modal__ic", {}, icon(spec.icon, { size: "2em" })) : null,
          el("div.tf-modal__title", { text: spec.title }),
          spec.body ? el("div.tf-modal__body", { text: spec.body }) : null,
          el("div.tf-modal__acts", {}, ...buttons),
        ),
      );

      if (spec.dismissable !== false) {
        on(scrim, "pointerdown", () => finish(-1));
        const off = on<KeyboardEvent>(window, "keydown", (e) => {
          if (e.key === "Escape") { off(); finish(-1); }
        });
        this.disposers.push(off);
      }

      this.overlayLayer.appendChild(node);
      this.dialog = node;
      buttons[buttons.length - 1]?.focus({ preventScroll: true });
    });
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    fill(this.toastLayer);
    fill(this.floatLayer);
    fill(this.overlayLayer);
    this.toastLayer.remove();
    this.floatLayer.remove();
    this.overlayLayer.remove();
  }
}

function defaultToastIcon(kind: ToastKind): IconName {
  return kind === "good" ? "check" : kind === "gold" ? "coin" : kind === "bad" ? "info" : "sparkle";
}

/* Confetti as 26 absolutely-positioned slivers. Cheap, and it beats
   a canvas particle system we would have to tear down. */
function confetti(): HTMLElement {
  const wrap = el("div.tf-confetti", { "aria-hidden": "true" });
  if (prefersReducedMotion()) return wrap;
  const tints = ["#f6cd63", "#ffe49a", "#2fd7c4", "#a06bff", "#ff8b7f", "#fff5d2"];
  for (let i = 0; i < 26; i++) {
    const p = el("i");
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = tints[i % tints.length] as string;
    p.style.animationDuration = `${1.7 + Math.random() * 1.6}s`;
    p.style.animationDelay = `${Math.random() * 0.7}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    wrap.appendChild(p);
  }
  // Keep the DOM clean once the last sliver has landed.
  let t = 0;
  addTick((dt) => { t += dt; if (t > 4200) { wrap.replaceChildren(); return false; } return true; });
  return wrap;
}
