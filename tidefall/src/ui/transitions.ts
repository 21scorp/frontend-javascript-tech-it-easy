/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/transitions.ts
   Screen swaps and the skeleton state panels wear while their data
   is still being computed.

   WHY skeletons rather than spinners: this game restores an offline
   simulation on launch, so a panel can be a few hundred ms behind.
   A spinner says "something is wrong"; a skeleton in the exact shape
   of the content says "it is coming", and stops the layout jumping
   when it lands. Every panel exposes a skeleton of its own shape.
   ═══════════════════════════════════════════════════════════════ */

import { el, nextFrame } from "./dom";
import { prefersReducedMotion } from "./theme";

/* ── skeletons ──────────────────────────────────────────────── */

export function skelText(widthPct = 100, cls = ""): HTMLElement {
  const n = el(`div.tf-skel.tf-skel--text${cls ? `.${cls}` : ""}`);
  n.style.width = `${widthPct}%`;
  return n;
}

export function skelTile(): HTMLElement {
  return el("div.tf-skel.tf-skel--tile");
}

export function skelBlock(height: string, radius = "var(--r-4)"): HTMLElement {
  const n = el("div.tf-skel");
  n.style.height = height;
  n.style.borderRadius = radius;
  return n;
}

/** A grid of shimmering tiles — the shape most panels load into. */
export function skelGrid(count: number, cols = 3, gap = "var(--sp-3)"): HTMLElement {
  const wrap = el("div.tf-skelgrid");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  wrap.style.gap = gap;
  for (let i = 0; i < count; i++) wrap.appendChild(skelTile());
  return wrap;
}

/* ── screen transitions ─────────────────────────────────────── */

export type SwapDirection = "forward" | "back" | "fade";

/**
 * Replace the contents of `host` with `next`, animated.
 * Awaited so callers can sequence a swap with data loading.
 */
export async function swap(
  host: HTMLElement,
  next: HTMLElement,
  dir: SwapDirection = "fade",
): Promise<void> {
  const prev = host.firstElementChild as HTMLElement | null;

  if (prefersReducedMotion() || !prev) {
    host.replaceChildren(next);
    return;
  }

  const shift = dir === "forward" ? 16 : dir === "back" ? -16 : 0;

  prev.style.transition = "opacity 130ms linear, transform 130ms cubic-bezier(.6,.03,.9,.4)";
  prev.style.opacity = "0";
  prev.style.transform = `translateX(${-shift}px)`;
  prev.style.pointerEvents = "none";

  next.style.opacity = "0";
  next.style.transform = `translateX(${shift}px)`;
  host.appendChild(next);

  await nextFrame();
  next.style.transition = "opacity 200ms linear, transform 260ms cubic-bezier(.22,.9,.28,1)";
  next.style.opacity = "1";
  next.style.transform = "none";

  window.setTimeout(() => {
    prev.remove();
    next.style.transition = "";
    next.style.transform = "";
  }, 280);
}

/**
 * Full-frame wipe for a hard context change (entering the character
 * creator, travelling between islands). Returns a closer so the
 * caller controls when the world behind is actually ready.
 */
export function wipe(host: HTMLElement): { done: () => void } {
  const veil = el("div.tf-wipe");
  veil.style.opacity = "0";
  veil.style.transition = "opacity 220ms var(--ease-out)";
  host.appendChild(veil);
  requestAnimationFrame(() => { veil.style.opacity = "1"; });

  return {
    done() {
      veil.style.opacity = "0";
      window.setTimeout(() => veil.remove(), 260);
    },
  };
}

/** Stagger children in — used after a skeleton resolves. */
export function cascade(parent: HTMLElement, stepMs = 26): void {
  if (prefersReducedMotion()) return;
  const kids = Array.from(parent.children) as HTMLElement[];
  kids.forEach((k, i) => {
    k.style.animation = `tf-screen-in 320ms cubic-bezier(.22,.9,.28,1) ${Math.min(i * stepMs, 420)}ms both`;
  });
  window.setTimeout(() => kids.forEach((k) => { k.style.animation = ""; }), 900);
}
