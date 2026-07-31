/* ═══════════════════════════════════════════════════════════════
   COVE — util.js
   Shared helpers. Everything hangs off the global `W` namespace.
   ═══════════════════════════════════════════════════════════════ */

window.W = window.W || {};

(function () {
  "use strict";

  const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

  /** Format a number for display: 1234 -> "1,234", 12345678 -> "12.35M" */
  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + fmt(-n);
    if (n < 1000) {
      // Show one decimal only when it matters (rates like 0.5/s)
      return n >= 100 || Number.isInteger(n)
        ? String(Math.floor(n))
        : (Math.round(n * 10) / 10).toString();
    }
    let tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIXES.length) {
      return n.toExponential(2).replace("+", "");
    }
    const scaled = n / Math.pow(10, tier * 3);
    const digits = scaled >= 100 ? 1 : 2;
    return scaled.toFixed(digits) + SUFFIXES[tier];
  }

  /** Format an integer with thousands separators (for stats). */
  function fmtInt(n) {
    return Math.floor(n).toLocaleString("en-US");
  }

  /** Format a duration in seconds as "2h 14m" / "3m 12s" / "45s". */
  function fmtDuration(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m " + s + "s";
    return s + "s";
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /** Deterministic pseudo-random from a seed — stable world decoration. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /** Player-provided names end up in innerHTML — strip anything markup-ish.
      (Matters for imported save codes from strangers.) */
  function sanitizeName(raw, maxLen) {
    return String(raw || "")
      .replace(/[<>&"'`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen || 14);
  }

  W.util = {
    fmt, fmtInt, fmtDuration,
    clamp, lerp, rand, randInt, pick,
    mulberry32, easeOutCubic, easeInOut,
    sanitizeName,
  };
})();
