/* ═══════════════════════════════════════════════════════════════
   COVE — state.js
   Save, load, and derived math. No DOM, no canvas.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const C = W.config;

  function defaultState() {
    return {
      version: 1,
      playerName: null,
      born: Date.now(),
      lastSeen: Date.now(),
      coins: 0,
      inv: {},                       // itemId -> count
      skills: {                      // id -> {level, xp}
        fishing: { level: 1, xp: 0 },
        woodcutting: { level: 1, xp: 0 },
        trading: { level: 1, xp: 0 },
      },
      tools: { rod: 0, axe: 0 },     // index into TOOLS
      stallUpgrades: {},             // id -> true
      affinity: {},                  // customerId -> serves count
      totals: { catches: 0, chops: 0, served: 0, earned: 0 },
      activity: null,                // {type:"fish"} | {type:"chop", tree:"oak"} | null
      orders: [],                    // live queue (serialized)
      nextSpawnAt: 0,
      settings: { sound: true },
      flags: { introDone: false },
      seed: Math.floor(Math.random() * 1e9),
    };
  }

  let S = defaultState();
  let restoredFromBackup = false;

  /* ─────────────── persistence ─────────────── */

  function save() {
    try {
      S.lastSeen = Date.now();
      localStorage.setItem(C.SAVE_KEY, JSON.stringify(S));
    } catch (e) {}
  }

  function rotateBackup() {
    try {
      const raw = localStorage.getItem(C.SAVE_KEY);
      if (raw) localStorage.setItem(C.SAVE_KEY + ".backup", raw);
    } catch (e) {}
  }

  function load() {
    try {
      let raw = localStorage.getItem(C.SAVE_KEY);
      let data = null;
      if (raw) {
        try { data = JSON.parse(raw); }
        catch (e) {
          try { localStorage.setItem(C.SAVE_KEY + ".corrupt", raw); } catch (e2) {}
        }
      }
      if (!data || typeof data !== "object") {
        const backup = localStorage.getItem(C.SAVE_KEY + ".backup");
        if (backup) {
          try { data = JSON.parse(backup); restoredFromBackup = true; } catch (e) { data = null; }
        }
      }
      if (!data || typeof data !== "object") return false;
      S = Object.assign(defaultState(), data);
      S.skills = Object.assign(defaultState().skills, data.skills);
      S.inv = data.inv || {};
      S.tools = Object.assign({ rod: 0, axe: 0 }, data.tools);
      S.stallUpgrades = data.stallUpgrades || {};
      S.affinity = data.affinity || {};
      S.totals = Object.assign(defaultState().totals, data.totals);
      S.settings = Object.assign({ sound: true }, data.settings);
      S.flags = Object.assign({ introDone: false }, data.flags);
      S.orders = Array.isArray(data.orders) ? data.orders : [];
      if (S.playerName) S.playerName = W.util.sanitizeName(S.playerName) || "Keeper";
      return true;
    } catch (e) {
      return false;
    }
  }

  function wipe() {
    try { localStorage.removeItem(C.SAVE_KEY); } catch (e) {}
    S = defaultState();
  }

  /* ─────────────── skills ─────────────── */

  function xpForLevel(l) { return C.SKILLS.xpForLevel(l); }

  /** Add xp; returns levels gained (0+). */
  function gainXp(skillId, xp) {
    const sk = S.skills[skillId];
    if (!sk || sk.level >= C.SKILLS.cap) return 0;
    sk.xp += xp;
    let ups = 0;
    while (sk.level < C.SKILLS.cap && sk.xp >= xpForLevel(sk.level)) {
      sk.xp -= xpForLevel(sk.level);
      sk.level++;
      ups++;
    }
    return ups;
  }

  /* ─────────────── items ─────────────── */

  const ITEMS = {};
  for (const f of C.FISH) ITEMS[f.id] = Object.assign({ kind: "fish" }, f);
  for (const t of C.TREES) ITEMS[t.id] = Object.assign({ kind: "wood" }, t);

  function item(id) { return ITEMS[id]; }
  function invCount(id) { return S.inv[id] || 0; }
  function addItem(id, n) { S.inv[id] = (S.inv[id] || 0) + n; }
  function takeItem(id, n) {
    if (invCount(id) < n) return false;
    S.inv[id] -= n;
    if (S.inv[id] <= 0) delete S.inv[id];
    return true;
  }

  /* ─────────────── derived ─────────────── */

  function toolMult(which) { return C.TOOLS[S.tools[which]].mult; }

  function fishTime() { return C.GATHER.fishBaseSec / toolMult("rod"); }
  function chopTime() { return C.GATHER.chopBaseSec / toolMult("axe"); }

  function unlockedFish() {
    return C.FISH.filter((f) => f.lvl <= S.skills.fishing.level);
  }

  function queueSize() {
    let q = C.STALL.queueBase;
    for (const [lvl, size] of C.STALL.queueLevels) {
      if (S.skills.trading.level >= lvl) q = size;
    }
    return q;
  }

  function priceMult() {
    let m = 1 + S.skills.trading.level * C.STALL.priceLvlBonus;
    if (S.stallUpgrades.cart) m *= 1.15;
    return m;
  }

  function orderValue(items) {
    let sum = 0;
    for (const it of items) sum += item(it.id).price * it.n;
    return Math.round(sum * C.STALL.orderMarkup * priceMult());
  }

  W.state = {
    get S() { return S; },
    get restoredFromBackup() { return restoredFromBackup; },
    defaultState, save, load, wipe, rotateBackup,
    xpForLevel, gainXp,
    item, invCount, addItem, takeItem,
    toolMult, fishTime, chopTime, unlockedFish,
    queueSize, priceMult, orderValue,
  };
})();
