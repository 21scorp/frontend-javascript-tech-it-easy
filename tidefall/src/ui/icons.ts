/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/icons.ts
   Hand-authored inline SVG, no icon font, no sprite sheet.

   WHY inline: the icon has to inherit the element's colour (gold on
   a pressed tab, muted on a locked skill), scale with --tf-scale,
   and cost zero network requests inside a PWA shell. Line-art icon
   sets read "web dashboard"; these are deliberately chunky, filled
   silhouettes with a highlight pass (.ic-hi) so they hold up at
   22px on a busy painted background.
   ═══════════════════════════════════════════════════════════════ */

import { svg } from "./dom";

export type IconName =
  // skills
  | "fish" | "axe" | "pickaxe" | "sword" | "flame" | "anvil"
  | "sprout" | "mushroom" | "bow" | "gear" | "anchor" | "flask"
  // navigation
  | "skilltree" | "bag" | "house" | "tag" | "person"
  // currency & rewards
  | "coin" | "gem" | "star" | "sparkle" | "bolt" | "shirt"
  // controls
  | "chevron" | "close" | "plus" | "minus" | "lock" | "check"
  | "clock" | "filter" | "sortdown" | "info" | "trash" | "grip";

const P: Record<IconName, string> = {
  /* ── skills ─────────────────────────────────────────────────── */
  fish:
    `<ellipse cx="13.4" cy="12" rx="7.4" ry="4.8"/>
     <path d="M2.2 6.4 8.4 12l-6.2 5.6z"/>
     <path d="M12.6 7.4c1.3-2.1 3-3.2 3-3.2s.4 1.9-.2 3.8z"/>
     <circle cx="16.8" cy="10.4" r="1.15" class="ic-lo"/>
     <ellipse cx="12" cy="9.4" rx="4" ry="1.1" class="ic-hi"/>`,
  axe:
    `<g transform="rotate(-14 12 12)">
       <rect x="15.1" y="1.8" width="2.4" height="20.4" rx="1.2"/>
       <path d="M15.6 2.8h-4.3C6.6 2.8 3 5.6 3 9.1s3.6 6.3 8.3 6.3h4.3z"/>
       <path d="M15.6 5h-4.2C8 5 5.4 6.8 5.4 9.1s2.6 4.1 6 4.1h4.2z" class="ic-hi"/>
     </g>`,
  pickaxe:
    `<rect x="10.6" y="6.8" width="2.8" height="15.2" rx="1.4"/>
     <path d="M1.2 11.6 3 8.4C5.8 5.9 8.9 4.6 12 4.6s6.2 1.3 9 3.8l1.8 3.2-3.4-.9C17 9 14.5 8.1 12 8.1s-5 .9-7.4 2.6z"/>
     <path d="M5.2 9.4C7.4 8 9.7 7.3 12 7.3s4.6.7 6.8 2.1l-.5 1.1C16.2 9.4 14.1 8.8 12 8.8s-4.2.6-6.3 1.7z" class="ic-hi"/>`,
  sword:
    `<path d="M12 1.4 15.2 7.6v6.9H8.8V7.6z"/>
     <path d="M12 3.4 13.8 7v6.2H12z" class="ic-hi"/>
     <rect x="5.4" y="14.3" width="13.2" height="2.9" rx="1.45"/>
     <rect x="10.6" y="17" width="2.8" height="3.2"/>
     <circle cx="12" cy="21.3" r="2"/>`,
  flame:
    `<path d="M13.4 1.1c-.3 2.6-1.6 3.7-3.1 5.1-.9-.8-1.2-1.6-1.3-2.7C7.2 5.2 5.7 7.6 5.7 10.6c0 1.7.5 3 1.4 4.3-.6-.1-1.2-.5-1.7-1 .2 4.5 3.1 8 6.6 8 3.6 0 6.5-3.1 6.5-7 0-2.6-1.2-4.4-2.8-6.4-1.6-2-2.5-4-2.3-7.4z"/>
     <path d="M12.2 11.6c1 2.1 2.7 2.9 2.7 5a3 3 0 0 1-6 0c0-1.8 2-2.4 3.3-5z" class="ic-hi"/>`,
  anvil:
    `<path d="M2.4 6.2h13.2c.8 2.3 2.9 3.5 6.2 3.7v2.6c-3.9-.2-7-1.4-9-3.3H5.2c-1.6 0-2.8-1.2-2.8-3z"/>
     <path d="M9.2 9.2h5.6l-1 6.6H10.2z"/>
     <path d="M4.6 19.6c0-2 1.6-3.6 3.6-3.6h7.6c2 0 3.6 1.6 3.6 3.6v1.6H4.6z"/>
     <path d="M3.6 6.9h11.4v1.2H3.6z" class="ic-hi"/>`,
  sprout:
    `<rect x="11" y="10.6" width="2" height="10.6" rx="1"/>
     <path d="M11.4 13.8C9 14 4.4 12.6 3.2 8.2c4.5-1.1 7.8 1.4 8.2 5.6z"/>
     <path d="M12.6 12.6c.4-4.1 3.7-6.6 8.2-5.5-1.2 4.4-5.8 5.8-8.2 5.5z"/>
     <path d="M5.6 9.4c2.6.2 4.4 1.6 5 3.6" class="ic-hi" fill="none" stroke="currentColor" stroke-width="1"/>`,
  mushroom:
    `<path d="M12 2.8c5.1 0 8.8 3.5 8.8 6.8 0 1.3-1 2-2.5 2H5.7c-1.5 0-2.5-.7-2.5-2C3.2 6.3 6.9 2.8 12 2.8z"/>
     <path d="M9.5 11.6h5v6.9a2.5 2.5 0 0 1-5 0z"/>
     <circle cx="8.4" cy="7.6" r="1.5" class="ic-hi"/>
     <circle cx="14.8" cy="6.6" r="1.1" class="ic-hi"/>
     <circle cx="16.6" cy="9.4" r=".8" class="ic-hi"/>`,
  bow:
    `<g transform="rotate(-40 12 12)">
       <path d="M6.6 1.8a1.4 1.4 0 0 1 2 1.9 11.9 11.9 0 0 0 0 16.6 1.4 1.4 0 0 1-2 1.9 14.6 14.6 0 0 1 0-20.4z"/>
       <rect x="6.9" y="3.2" width="1.3" height="17.6" rx=".65" class="ic-hi"/>
       <rect x="7.4" y="11" width="13.4" height="2" rx="1"/>
       <path d="M22.6 12 18 9.2v5.6z"/>
     </g>`,
  gear:
    `<g>
       <rect x="10.6" y="1.2" width="2.8" height="4.6" rx="1"/>
       <rect x="10.6" y="18.2" width="2.8" height="4.6" rx="1"/>
       <rect x="10.6" y="1.2" width="2.8" height="4.6" rx="1" transform="rotate(45 12 12)"/>
       <rect x="10.6" y="18.2" width="2.8" height="4.6" rx="1" transform="rotate(45 12 12)"/>
       <rect x="10.6" y="1.2" width="2.8" height="4.6" rx="1" transform="rotate(90 12 12)"/>
       <rect x="10.6" y="18.2" width="2.8" height="4.6" rx="1" transform="rotate(90 12 12)"/>
       <rect x="10.6" y="1.2" width="2.8" height="4.6" rx="1" transform="rotate(135 12 12)"/>
       <rect x="10.6" y="18.2" width="2.8" height="4.6" rx="1" transform="rotate(135 12 12)"/>
     </g>
     <path fill-rule="evenodd" d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8zm0 4.4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>`,
  anchor:
    `<circle cx="12" cy="4.3" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="11" y="6.4" width="2" height="14.6" rx="1"/>
     <rect x="7" y="8.2" width="10" height="2" rx="1"/>
     <path d="M3.4 12.2c0 4.7 3.8 8.5 8.6 8.5s8.6-3.8 8.6-8.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  flask:
    `<path d="M9.4 2.4h5.2v2.2h-.9v4.5l4.9 8.5c1.1 1.9-.3 4.3-2.5 4.3H7.9c-2.2 0-3.6-2.4-2.5-4.3l4.9-8.5V4.6h-.9z"/>
     <path d="M8.2 14.4h7.6l1.9 3.4c.6 1-.1 2.3-1.3 2.3H7.6c-1.2 0-1.9-1.3-1.3-2.3z" class="ic-hi"/>
     <circle cx="10.6" cy="17.4" r=".9" class="ic-lo"/>
     <circle cx="13.6" cy="18.6" r=".7" class="ic-lo"/>`,

  /* ── navigation ─────────────────────────────────────────────── */
  skilltree:
    `<path d="M11.1 7.4 6.3 15.6l1.8 1L12.9 8.4zM12.9 7.4l-1.8 1 4.8 8.2 1.8-1z"/>
     <circle cx="12" cy="4.8" r="3.1"/>
     <circle cx="5.4" cy="18.4" r="3.1"/>
     <circle cx="18.6" cy="18.4" r="3.1"/>
     <circle cx="11" cy="3.8" r="1" class="ic-hi"/>`,
  bag:
    `<path d="M5.2 8h13.6c1.1 0 1.9.9 1.8 2l-1 9.4a2.7 2.7 0 0 1-2.7 2.4H7.1a2.7 2.7 0 0 1-2.7-2.4l-1-9.4c-.1-1.1.7-2 1.8-2z"/>
     <path d="M8 9.2V6.9a4 4 0 0 1 8 0v2.3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
     <path d="M6 9.6h12l-.4 2.6H6.4z" class="ic-hi"/>`,
  house:
    `<path d="M12 2.2 22.4 10.4l-1.7 2.1-1.1-.9v8.1a1.9 1.9 0 0 1-1.9 1.9h-3.3v-5.5h-4.8v5.5H6.3a1.9 1.9 0 0 1-1.9-1.9v-8.1l-1.1.9L1.6 10.4z"/>
     <path d="M12 5.2 18.6 10.4H5.4z" class="ic-hi"/>`,
  tag:
    `<path fill-rule="evenodd" d="M11.3 2.4H20a1.7 1.7 0 0 1 1.7 1.7v8.7c0 .5-.2.9-.5 1.2l-7.6 7.6a1.7 1.7 0 0 1-2.4 0L2.4 12.8a1.7 1.7 0 0 1 0-2.4l7.6-7.6c.3-.3.8-.4 1.3-.4zM17.2 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>`,
  person:
    `<circle cx="12" cy="6.9" r="4.5"/>
     <path d="M12 12.8c4.9 0 8.8 3.1 9.4 7.3.1 1-.6 1.8-1.6 1.8H4.2c-1 0-1.7-.8-1.6-1.8.6-4.2 4.5-7.3 9.4-7.3z"/>
     <circle cx="10.3" cy="5.4" r="1.5" class="ic-hi"/>`,

  /* ── currency & rewards ─────────────────────────────────────── */
  coin:
    `<circle cx="12" cy="12" r="9.6"/>
     <circle cx="12" cy="12" r="7" class="ic-lo"/>
     <path d="M12 4.6a7.4 7.4 0 0 1 6.4 3.7A9 9 0 0 0 5.6 8.3 7.4 7.4 0 0 1 12 4.6z" class="ic-hi"/>`,
  gem:
    `<path d="M7.6 2.6h8.8l4.6 5.9L12 21.4 3 8.5z"/>
     <path d="M7.6 2.6 12 8.5 16.4 2.6z" class="ic-hi"/>
     <path d="M3 8.5h18L12 21.4z" class="ic-lo"/>`,
  star:
    `<path d="M12 1.8 15 8l6.9 1-5 4.8 1.2 6.8L12 17.4l-6.1 3.2L7.1 13.8l-5-4.8L9 8z"/>
     <path d="M12 4.4 13.9 8.4l4.3.6-2.6 2.5z" class="ic-hi"/>`,
  sparkle:
    `<path d="M12 1.4c.9 5.2 3.5 7.8 8.7 8.7-5.2.9-7.8 3.5-8.7 8.7-.9-5.2-3.5-7.8-8.7-8.7 5.2-.9 7.8-3.5 8.7-8.7z"/>
     <path d="M18.6 15.4c.4 2.3 1.5 3.4 3.8 3.8-2.3.4-3.4 1.5-3.8 3.8-.4-2.3-1.5-3.4-3.8-3.8 2.3-.4 3.4-1.5 3.8-3.8z"/>`,
  bolt:
    `<path d="M13.9 1.4 4.6 13.8h5.3l-.8 8.8 9.9-12.9h-5.8z"/>
     <path d="M13.9 1.4 8.5 12.4h2.1z" class="ic-hi"/>`,
  shirt:
    `<path d="M9 2.4 12 4.9l3-2.5 5.7 2.7c.8.4 1.2 1.2.9 2l-1.3 4.4-3.1-.8v10.9H6.8V10.7l-3.1.8-1.3-4.4c-.3-.8.1-1.6.9-2z"/>
     <path d="M9 2.4 12 4.9l3-2.5 1.2.6L12 6.9 7.8 3z" class="ic-hi"/>`,

  /* ── controls ───────────────────────────────────────────────── */
  chevron:
    `<path d="M12 8.2 20.4 16.6l-2.3 2.3L12 12.8l-6.1 6.1-2.3-2.3z"/>`,
  close:
    `<path d="M18.4 3.8 20.2 5.6 13.8 12l6.4 6.4-1.8 1.8-6.4-6.4-6.4 6.4L3.8 18.4 10.2 12 3.8 5.6l1.8-1.8L12 10.2z"/>`,
  plus:
    `<path d="M10.3 3.4h3.4v6.9h6.9v3.4h-6.9v6.9h-3.4v-6.9H3.4v-3.4h6.9z"/>`,
  minus:
    `<path d="M3.4 10.3h17.2v3.4H3.4z"/>`,
  lock:
    `<path d="M7.2 10.4V7.8a4.8 4.8 0 0 1 9.6 0v2.6" fill="none" stroke="currentColor" stroke-width="2.3"/>
     <rect x="4.2" y="10" width="15.6" height="11.4" rx="3.2"/>
     <circle cx="12" cy="15" r="1.7" class="ic-lo"/>
     <rect x="11" y="15.4" width="2" height="3.4" rx="1" class="ic-lo"/>`,
  check:
    `<path d="M9.4 17.8 3.6 12l2.3-2.3 3.5 3.5 8.3-8.3L20 7.2z"/>`,
  clock:
    `<circle cx="12" cy="12" r="9.4" fill="none" stroke="currentColor" stroke-width="2.3"/>
     <path d="M10.9 6.2h2.2v5.6l4.1 2.4-1.1 1.9-5.2-3z"/>`,
  filter:
    `<path d="M2.8 4.4h18.4l-7.2 8.4v6.6l-4 2.4v-9z"/>`,
  sortdown:
    `<path d="M3.4 5.6h9.4V8H3.4zM3.4 10.8h6.6v2.4H3.4zM3.4 16h3.8v2.4H3.4z"/>
     <path d="M17.6 19.4 13.2 14h2.9V5.6h3V14h2.9z"/>`,
  info:
    `<path fill-rule="evenodd" d="M12 2.2a9.8 9.8 0 1 0 0 19.6 9.8 9.8 0 0 0 0-19.6zm-1.5 7.4h3v7.8h-3zm1.5-4.4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z"/>`,
  trash:
    `<path d="M9.2 2.4h5.6l1 1.7h4.4v2.7H3.8V4.1h4.4z"/>
     <path d="M5.4 8.2h13.2l-.9 12a2.1 2.1 0 0 1-2.1 2H8.4a2.1 2.1 0 0 1-2.1-2z"/>
     <path d="M9.4 10.6h1.6v9H9.4zm3.6 0h1.6v9H13z" class="ic-lo"/>`,
  grip:
    `<rect x="3" y="8.6" width="18" height="2.6" rx="1.3"/>
     <rect x="3" y="13.4" width="18" height="2.6" rx="1.3"/>`,
};

export interface IconOpts {
  /** Extra classes on the <svg>. */
  cls?: string;
  /** Rendered size in CSS px; defaults to 1em so it follows type. */
  size?: number | string;
  /** Screen-reader label. Omit for decorative icons (aria-hidden). */
  label?: string;
}

/** Build an <svg> node for `name`. Colour comes from `currentColor`. */
export function icon(name: IconName, opts: IconOpts = {}): SVGElement {
  const size = opts.size === undefined ? "1em" : typeof opts.size === "number" ? `${opts.size}px` : opts.size;
  const node = svg("svg", {
    class: `tf-ic${opts.cls ? ` ${opts.cls}` : ""}`,
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "currentColor",
    focusable: "false",
    role: opts.label ? "img" : "presentation",
    "aria-hidden": opts.label ? null : "true",
  });
  if (opts.label) node.setAttribute("aria-label", opts.label);
  node.innerHTML = P[name];
  return node;
}

/** Same icon as a markup string, for the rare innerHTML batch build. */
export function iconMarkup(name: IconName, size = "1em"): string {
  return `<svg class="tf-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${P[name]}</svg>`;
}

/* ── currency medallions ─────────────────────────────────────────
   Coins and gems carry the game's value language, so they get real
   gradients and a rim rather than a flat glyph. Gradient ids must be
   unique per instance or the second one inherits the first's stops. */

let uid = 0;

export function coinMedal(size = 26): SVGElement {
  const id = `tfc${++uid}`;
  const node = svg("svg", {
    class: "tf-medal tf-medal--coin", viewBox: "0 0 40 40",
    width: `${size}px`, height: `${size}px`, "aria-hidden": "true",
  });
  node.innerHTML = `
    <defs>
      <radialGradient id="${id}f" cx="36%" cy="26%" r="78%">
        <stop offset="0" stop-color="#fff6d4"/>
        <stop offset=".45" stop-color="#f7cf68"/>
        <stop offset=".82" stop-color="#dd9d2c"/>
        <stop offset="1" stop-color="#a9711a"/>
      </radialGradient>
      <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe9a8"/>
        <stop offset="1" stop-color="#8a5a12"/>
      </linearGradient>
    </defs>
    <circle cx="20" cy="20.8" r="18.4" fill="rgba(0,0,0,.45)"/>
    <circle cx="20" cy="20" r="18.4" fill="url(#${id}r)"/>
    <circle cx="20" cy="20" r="15.4" fill="url(#${id}f)"/>
    <path d="M20 6.6c5.2 0 9.8 2.7 12.4 6.8-3.3-2.6-7.6-4.2-12.4-4.2S10.9 10.8 7.6 13.4C10.2 9.3 14.8 6.6 20 6.6z" fill="#fffbe8" opacity=".62"/>
    <path d="M22.6 12.4v2.1c1.5.3 2.7.9 3.7 1.8l-2 2.4c-.9-.8-2-1.2-3.4-1.2-1.1 0-1.8.4-1.8 1 0 .7.7 1 2.7 1.5 3 .7 4.9 1.7 4.9 4.4 0 2.2-1.5 3.7-4.1 4.1v2.1h-3v-2.1c-1.9-.3-3.4-1.1-4.6-2.2l2.1-2.4c1.1 1 2.4 1.5 3.9 1.5 1.3 0 2-.4 2-1.1 0-.7-.7-1-2.8-1.5-2.9-.7-4.8-1.7-4.8-4.3 0-2.1 1.5-3.6 4.2-4.1v-2z" fill="#7a4c0e" opacity=".72"/>`;
  return node;
}

export function gemMedal(size = 26): SVGElement {
  const id = `tfg${++uid}`;
  const node = svg("svg", {
    class: "tf-medal tf-medal--gem", viewBox: "0 0 40 40",
    width: `${size}px`, height: `${size}px`, "aria-hidden": "true",
  });
  node.innerHTML = `
    <defs>
      <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f0e4ff"/>
        <stop offset=".4" stop-color="#b98cff"/>
        <stop offset="1" stop-color="#6a35d6"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".85"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="M12.4 5.2h15.2l8 10.2L20 36.4 4.4 15.4z" fill="rgba(0,0,0,.45)"/>
    <path d="M12.4 4.4h15.2l8 10.2L20 35.6 4.4 14.6z" fill="url(#${id}a)"/>
    <path d="M12.4 4.4 20 14.6 27.6 4.4z" fill="url(#${id}b)"/>
    <path d="M4.4 14.6h31.2L20 35.6z" fill="#000" opacity=".16"/>
    <path d="M20 14.6 27.6 4.4l8 10.2z" fill="#fff" opacity=".2"/>
    <path d="M9.4 8.4 12.4 4.4 14.9 4.4 10.9 10z" fill="#fff" opacity=".55"/>`;
  return node;
}
