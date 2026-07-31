/* ═══════════════════════════════════════════════════════════════
   COVE — config.js
   Every number and content table. Logic never hardcodes these.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ─────────────── Skills ───────────────
     RuneScape-shaped curve, softened: quick early, long late,
     but weeks — not months — to 100.                              */
  const SKILLS = {
    cap: 100,
    xpForLevel: (l) => Math.floor(25 * Math.pow(l, 1.9)),
  };

  /* ─────────────── Fish (pond, left) ─────────────── */
  const FISH = [
    { id: "sardine",  name: "Sardine",   lvl: 1,  xp: 8,   price: 6,   hue: 205 },
    { id: "herring",  name: "Herring",   lvl: 5,  xp: 15,  price: 12,  hue: 185 },
    { id: "trout",    name: "Trout",     lvl: 15, xp: 30,  price: 26,  hue: 30 },
    { id: "salmon",   name: "Salmon",    lvl: 30, xp: 60,  price: 55,  hue: 12 },
    { id: "tuna",     name: "Tuna",      lvl: 50, xp: 120, price: 120, hue: 225 },
    { id: "sword",    name: "Swordfish", lvl: 70, xp: 220, price: 260, hue: 250 },
    { id: "koi",      name: "Golden Koi", lvl: 90, xp: 400, price: 600, hue: 45 },
  ];

  /* ─────────────── Trees (forest, right) ───────────────
     Each tree SPOT in the world is one species.                    */
  const TREES = [
    { id: "oak",   name: "Oak",        lvl: 1,  xp: 7,   price: 5,   canopy: 95,  hue: 105 },
    { id: "birch", name: "Birch",      lvl: 10, xp: 14,  price: 11,  canopy: 80,  hue: 90 },
    { id: "maple", name: "Maple",      lvl: 25, xp: 30,  price: 25,  canopy: 100, hue: 25 },
    { id: "yew",   name: "Yew",        lvl: 45, xp: 65,  price: 60,  canopy: 110, hue: 140 },
    { id: "elder", name: "Elder",      lvl: 70, xp: 130, price: 140, canopy: 120, hue: 160 },
  ];

  /* ─────────────── Gathering ─────────────── */
  const GATHER = {
    fishBaseSec: 3.4,
    chopBaseSec: 3.0,
    // catches skew to the highest unlocked tier but keep the tail
    // alive so old orders stay fillable
    topWeight: 0.7,
    biteGapMin: 7, biteGapMax: 16,   // seconds between "!" moments
    biteWindow: 1.5,                 // seconds to tap it
    biteBonusXp: 2,                  // xp multiplier on the bonus item
  };

  /* ─────────────── Tools (gear shop) ─────────────── */
  const TOOLS = [
    { id: "wood",   name: "Worn",    mult: 1.0,  cost: 0 },
    { id: "bronze", name: "Bronze",  mult: 1.25, cost: 400 },
    { id: "silver", name: "Silver",  mult: 1.55, cost: 4500 },
    { id: "gold",   name: "Gold",    mult: 1.9,  cost: 38000 },
    { id: "star",   name: "Starmetal", mult: 2.4, cost: 260000 },
  ];

  /* ─────────────── Stall & orders ─────────────── */
  const STALL = {
    queueBase: 2,
    queueLevels: [ [5, 3], [20, 4] ],   // trading level → queue size
    spawnMinSec: 45, spawnMaxSec: 110,
    orderMarkup: 1.4,        // order pays 1.4× base prices
    tipPct: 0.25,            // served within tipWindow → +25%
    tipWindowSec: 180,
    surplusRate: 0.6,        // "sell surplus" pays 60% of base
    priceLvlBonus: 0.005,    // +0.5% prices per trading level
  };

  /* Stall upgrades (one-time) */
  const STALL_UPGRADES = [
    { id: "awning", name: "Bright Awning", glyph: "⛱️", cost: 900,
      desc: "Customers tip 10% more often.", effect: "tip" },
    { id: "bell",   name: "Counter Bell",  glyph: "🛎️", cost: 6500,
      desc: "Customers arrive 20% faster.", effect: "spawn" },
    { id: "cart",   name: "Delivery Cart", glyph: "🛒", cost: 30000,
      desc: "Orders pay 15% more.", effect: "markup" },
  ];

  /* ─────────────── Customers ───────────────
     A small village of regulars. Affinity grows per serve.        */
  const CUSTOMERS = [
    { id: "fien", name: "Fien",  hue: 350, hat: "straw",  likes: "fish",  line: "The pancake stand needs fish. Chef's orders!" },
    { id: "bram", name: "Bram",  hue: 210, hat: "beanie", likes: "wood",  line: "Fixing the ferry dock. Again." },
    { id: "saar", name: "Saar",  hue: 40,  hat: "flower", likes: "fish",  line: "Grandma's soup won't cook itself." },
    { id: "milo", name: "Milo",  hue: 120, hat: "cap",    likes: "wood",  line: "Building a treehouse. Don't tell my mom." },
    { id: "vera", name: "Vera",  hue: 285, hat: "beret",  likes: "any",   line: "An artist needs supplies, darling." },
    { id: "ted",  name: "Ted",   hue: 20,  hat: "none",   likes: "any",   line: "The inn's fireplace is hungry." },
    { id: "noor", name: "Noor",  hue: 180, hat: "scarf",  likes: "fish",  line: "Market day in the city tomorrow!" },
    { id: "kas",  name: "Kas",   hue: 90,  hat: "straw",  likes: "wood",  line: "A boat. I'm building a boat. Probably." },
  ];

  const AFFINITY = {
    milestones: [3, 10, 25, 50],
    giftCoins: [150, 900, 6000, 40000],  // scaled by tier index
    lines: [
      "You remembered my name! For that, a little extra.",
      "You're the best part of this cove, you know.",
      "I told the whole village about your stall.",
      "Family. That's what you are by now.",
    ],
  };

  /* ─────────────── Offline ─────────────── */
  const OFFLINE = {
    rate: 0.5,
    capHours: 4,
    minSeconds: 90,
  };

  /* ─────────────── World layout (unit space) ───────────────
     Portrait world; camera letterboxes on other shapes.           */
  const WORLD = {
    w: 1000, h: 1400,
    pond:  { x: 230, y: 640, rx: 175, ry: 95 },
    treeSpots: [
      { x: 700, y: 430, tree: "oak" },
      { x: 870, y: 560, tree: "birch" },
      { x: 640, y: 620, tree: "maple" },
      { x: 850, y: 760, tree: "yew" },
      { x: 700, y: 900, tree: "elder" },
    ],
    mine:  { x: 500, y: 175 },
    stall: { x: 500, y: 1075 },
    queueSpots: [
      { x: 320, y: 1160 }, { x: 205, y: 1200 }, { x: 95, y: 1240 }, { x: 20, y: 1290 },
    ],
    home:  { x: 560, y: 1000 },  // where the character idles
  };

  W.config = {
    BUILD: "0.1.0",
    SAVE_KEY: "cove.save.v1",
    SKILLS, FISH, TREES, GATHER, TOOLS,
    STALL, STALL_UPGRADES, CUSTOMERS, AFFINITY, OFFLINE, WORLD,
  };
})();
