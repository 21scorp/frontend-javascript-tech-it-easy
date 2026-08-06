/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/widgets.ts
   Two tiny stateful widgets that appear in several places (HUD,
   skills grid, bag weight, shop meters) and must look and behave
   identically everywhere. Each returns { node, set } — build once,
   call set() as often as you like, no re-render.
   ═══════════════════════════════════════════════════════════════ */

import { el, svg, clamp } from "./dom";

export interface RingHandle {
  node: SVGElement;
  /** progress 0..1 */
  set(p: number): void;
}

export interface RingOpts {
  /** viewBox size; stroke is drawn inside it. */
  size?: number;
  width?: number;
  color?: string;
  track?: string;
  /** Add a soft outer bloom in the same colour. */
  glow?: boolean;
}

/** Circular progress. Used for xp on skill cards and the HUD readout. */
export function makeRing(opts: RingOpts = {}): RingHandle {
  const size = opts.size ?? 40;
  const w = opts.width ?? 4;
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const color = opts.color ?? "#2fd7c4";

  const mk = (cls: string, stroke: string, extra?: Record<string, string>) =>
    svg("circle", {
      class: cls, cx: size / 2, cy: size / 2, r,
      "stroke-width": w, stroke,
      ...(extra ?? {}),
    });

  const glow = opts.glow
    ? mk("tf-ring__glow", color, { "stroke-dasharray": `${c}`, "stroke-dashoffset": `${c}` })
    : null;
  const fill = mk("tf-ring__fill", color, { "stroke-dasharray": `${c}`, "stroke-dashoffset": `${c}` });

  const node = svg("svg", {
    class: "tf-ring", viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true",
  },
    mk("tf-ring__track", opts.track ?? "rgba(4,12,22,.72)"),
    glow, fill,
  );

  return {
    node,
    set(p: number) {
      const off = c * (1 - clamp(p, 0, 1));
      fill.setAttribute("stroke-dashoffset", String(off));
      glow?.setAttribute("stroke-dashoffset", String(off));
    },
  };
}

export interface BarHandle {
  node: HTMLElement;
  set(p: number): void;
}

/** Linear progress with a travelling sheen (see .tf-bar in ui.css). */
export function makeBar(variant: "aqua" | "gold" = "aqua", slim = false): BarHandle {
  const fill = el("i.tf-bar__fill");
  const node = el(
    `div.tf-bar${variant === "gold" ? ".tf-bar--gold" : ""}${slim ? ".tf-bar--slim" : ""}`,
    { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 0 },
    fill,
  );
  return {
    node,
    set(p: number) {
      const pct = clamp(p, 0, 1) * 100;
      fill.style.width = `${pct.toFixed(2)}%`;
      node.setAttribute("aria-valuenow", String(Math.round(pct)));
    },
  };
}

/** Section heading with a fading rule — used to break up long sheets. */
export function sectionHead(title: string, ...trailing: (Node | null)[]): HTMLElement {
  return el("div.tf-sec", {},
    el("span.tf-sec__t", { text: title }),
    el("i.tf-sec__rule"),
    ...trailing.filter(Boolean) as Node[],
  );
}
