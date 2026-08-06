/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/theme.ts
   The TypeScript face of tokens.css.

   WHY it exists: a handful of things genuinely need token values in
   JS — canvas-free SVG gradients, spring targets, rarity lookups,
   reduced-motion gating. Rather than let those drift, the values
   live here once and every other module imports them. Sizes are NOT
   duplicated here: those stay in CSS where layout can use them.
   ═══════════════════════════════════════════════════════════════ */

export const COLORS = {
  abyss: "#060e18",
  deep900: "#0a1522",
  deep800: "#0d1b2a",
  deep700: "#102338",
  deep600: "#163050",
  deep500: "#1d3d63",
  deep400: "#274e78",

  ink: "#f7f0de",
  inkSoft: "#d9e3ef",
  inkDim: "#9db0c6",
  inkMute: "#6d829a",

  gold700: "#a4761f",
  gold600: "#d1942b",
  gold500: "#e8b23f",
  gold400: "#f6cd63",
  gold300: "#ffe49a",

  aqua600: "#12a897",
  aqua500: "#2fd7c4",
  aqua400: "#7cf0e2",

  gem600: "#7d4ae0",
  gem500: "#a06bff",
  gem400: "#cbb0ff",

  good: "#59d38a",
  warn: "#ffb454",
  bad: "#ff6b5e",
} as const;

/** Item / offer rarity. Drives border, glow and label colour. */
export type Rarity = "common" | "fine" | "rare" | "epic" | "legend" | "mythic";

export const RARITY: Record<Rarity, { label: string; color: string; glow: string }> = {
  common: { label: "Common",    color: "#9fb3c8", glow: "rgba(159,179,200,.30)" },
  fine:   { label: "Fine",      color: "#5fd47a", glow: "rgba(95,212,122,.40)" },
  rare:   { label: "Rare",      color: "#4aa8ff", glow: "rgba(74,168,255,.45)" },
  epic:   { label: "Epic",      color: "#b878ff", glow: "rgba(184,120,255,.50)" },
  legend: { label: "Legendary", color: "#ffab3d", glow: "rgba(255,171,61,.55)" },
  mythic: { label: "Mythic",    color: "#ff5d7e", glow: "rgba(255,93,126,.55)" },
};

export const DURATION = {
  instant: 90,
  fast: 150,
  base: 230,
  slow: 360,
  lazy: 620,
} as const;

/** True when the player asked the OS to calm animation down. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The UI's global size multiplier. 1.0 is a 390pt-wide phone frame.
 * Clamped so a desktop letterbox does not produce comedy-sized chrome
 * and a 320pt phone still clears the 44px touch minimum.
 */
export function uiScaleFor(frameW: number): number {
  return Math.max(0.94, Math.min(1.34, frameW / 390));
}

/** Push viewport-derived values into the CSS custom-property layer. */
export function applyMetrics(
  root: HTMLElement,
  m: { frameW: number; scale: number; safeTop: number; safeBottom: number },
): void {
  root.style.setProperty("--tf-scale", uiScaleFor(m.frameW).toFixed(4));
  // Viewport reports safe areas in design units; CSS needs frame pixels.
  root.style.setProperty("--safe-t", `${Math.round(m.safeTop * m.scale)}px`);
  root.style.setProperty("--safe-b", `${Math.round(m.safeBottom * m.scale)}px`);
}

/* ── number presentation ─────────────────────────────────────────
   Idle games live and die on legible big numbers. One formatter,
   used by HUD, panels and floating rewards alike. */

const SUFFIX = ["", "K", "M", "B", "T", "aa", "ab"];

export function compact(n: number, digits = 1): string {
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  const tier = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(abs) / 3));
  const scaled = n / Math.pow(1000, tier);
  const d = scaled < 10 ? digits : scaled < 100 ? Math.min(digits, 1) : 0;
  return `${scaled.toFixed(d).replace(/\.0+$/, "")}${SUFFIX[tier]}`;
}

export function grouped(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Currency style: grouped under 100k, compact above (keeps HUD stable). */
export function currency(n: number): string {
  return Math.abs(n) < 100_000 ? grouped(n) : compact(n, 2);
}
