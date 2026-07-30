/* ═══════════════════════════════════════════════════════════════
   WISP — state.js
   Game state, save/load, and all derived values (rates, costs,
   multipliers). Pure data & math — no DOM, no canvas.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const C = W.config;

  function defaultState() {
    return {
      version: C.VERSION,
      wispName: null,
      born: Date.now(),
      lastSeen: Date.now(),
      light: 0,
      totalLight: 0,     // lifetime earned (drives XP + achievements)
      taps: 0,
      level: 1,
      xp: 0,
      buildings: {},     // id -> count
      upgrades: {},      // id -> true
      achievements: {},  // id -> timestamp
      flags: { returned: false, introDone: false },
      settings: { sound: true, particles: true },
      seed: Math.floor(Math.random() * 1e9),
      // ascension
      stars: [],         // past wisps: {name, hue, stage, level, totalLight, born, ascended, x, y}
      stardust: 0,
      generation: 1,
      allTimeLight: 0,
      // bond — carried across generations; it's *your* capacity to care
      bond: { xp: 0, level: 1 },
      // daily streak
      streak: { last: null, count: 0 },
      // active timed boosts [{id, label, mult, until}]
      buffs: [],
      // worn accessory id (wardrobe) or null
      accessory: null,
    };
  }

  let S = defaultState();

  /* ─────────────── persistence ─────────────── */

  function save() {
    try {
      S.lastSeen = Date.now();
      localStorage.setItem(C.SAVE_KEY, JSON.stringify(S));
    } catch (e) { /* storage full or blocked — play on */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(C.SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return false;
      // Merge onto defaults so new fields appear in old saves.
      S = Object.assign(defaultState(), data);
      S.flags = Object.assign({ returned: false, introDone: false }, data.flags);
      S.settings = Object.assign({ sound: true, particles: true }, data.settings);
      S.buildings = data.buildings || {};
      S.upgrades = data.upgrades || {};
      S.achievements = data.achievements || {};
      S.stars = data.stars || [];
      S.bond = Object.assign({ xp: 0, level: 1 }, data.bond);
      S.streak = Object.assign({ last: null, count: 0 }, data.streak);
      S.buffs = (data.buffs || []).filter((b) => b && b.until > Date.now());
      // migrate the old single-buff field
      if (data.buff && data.buff.until > Date.now()) {
        S.buffs.push({ id: "daily", label: "morning warmth", mult: data.buff.mult, until: data.buff.until });
      }
      delete S.buff;
      return true;
    } catch (e) {
      return false;
    }
  }

  function wipe() {
    try { localStorage.removeItem(C.SAVE_KEY); } catch (e) {}
    S = defaultState();
  }

  /* ─────────────── derived values ─────────────── */

  function buildingCount(id) { return S.buildings[id] || 0; }

  function totalBuildings(state) {
    const s = state || S;
    let n = 0;
    for (const k in s.buildings) n += s.buildings[k];
    return n;
  }

  function buildingCost(b) {
    return Math.ceil(b.baseCost * Math.pow(b.growth, buildingCount(b.id)));
  }

  /** Total cost of the next n of a building (geometric series). */
  function buildingCostN(b, n) {
    const owned = buildingCount(b.id);
    const g = b.growth;
    return Math.ceil(b.baseCost * Math.pow(g, owned) * (Math.pow(g, n) - 1) / (g - 1));
  }

  /** How many of b the player can afford right now (0 if none). */
  function maxAffordable(b) {
    const g = b.growth;
    const first = b.baseCost * Math.pow(g, buildingCount(b.id));
    if (S.light < first) return 0;
    // solve first*(g^n -1)/(g-1) <= light
    const n = Math.floor(Math.log((S.light * (g - 1)) / first + 1) / Math.log(g));
    return Math.max(1, n);
  }

  /** Multiplier applying to a single building from its upgrades. */
  function buildingMult(id) {
    let m = 1;
    for (const u of C.UPGRADES) {
      if (S.upgrades[u.id] && u.type === "building" && u.target === id) m *= u.mult;
    }
    return m;
  }

  function globalMult() {
    let m = 1;
    for (const u of C.UPGRADES) {
      if (S.upgrades[u.id] && u.type === "global") m *= u.mult;
    }
    m *= 1 + (S.level - 1) * C.LEVEL.prodPerLevel;
    m *= 1 + Object.keys(S.achievements).length * C.ACH_PROD_BONUS;
    m *= 1 + S.stardust * C.PRESTIGE.perStardust;
    m *= 1 + (S.bond.level - 1) * C.BOND.prodPerLevel;
    m *= buffMult();
    return m;
  }

  /** Combined multiplier of all active timed buffs. */
  function buffMult() {
    let m = 1;
    const now = Date.now();
    for (const b of S.buffs) {
      if (b.until > now) m *= b.mult;
    }
    return m;
  }

  /** Add (or refresh) a timed buff. */
  function addBuff(id, label, mult, seconds) {
    S.buffs = S.buffs.filter((b) => b.id !== id && b.until > Date.now());
    S.buffs.push({ id, label, mult, until: Date.now() + seconds * 1000 });
  }

  /** Passive light per second. */
  function lightPerSec() {
    let sum = 0;
    for (const b of C.BUILDINGS) {
      const n = buildingCount(b.id);
      if (n > 0) sum += n * b.rate * buildingMult(b.id);
    }
    return sum * globalMult();
  }

  /** Light per tap (before crit). */
  function tapValue() {
    let v = C.TAP.base;
    for (const u of C.UPGRADES) {
      if (S.upgrades[u.id] && u.type === "tap") v *= u.mult;
    }
    v *= globalMult();
    v *= 1 + (S.bond.level - 1) * C.BOND.tapPerLevel;
    let pct = 0;
    for (const u of C.UPGRADES) {
      if (S.upgrades[u.id] && u.type === "tapRate") pct += u.pct;
    }
    v += lightPerSec() * pct;
    return v;
  }

  /* ─────────────── levels & stages ─────────────── */

  function xpForLevel(level) {
    return Math.ceil(C.LEVEL.baseXp * Math.pow(C.LEVEL.growth, level - 1));
  }

  function stageFor(level) {
    let st = C.STAGES[0];
    for (const s of C.STAGES) {
      if (level >= s.level) st = s;
      else break;
    }
    return st;
  }

  function nextStage(level) {
    for (const s of C.STAGES) {
      if (s.level > level) return s;
    }
    return null;
  }

  /* ─────────────── bond ─────────────── */

  function bondXpForLevel(level) {
    return Math.ceil(C.BOND.baseXp * Math.pow(C.BOND.growth, level - 1));
  }

  function bondTitle(level) {
    const t = C.BOND.titles;
    return t[Math.min(level - 1, t.length - 1)];
  }

  /** Add bond XP; returns true if the bond deepened (level up). */
  function gainBond(xp) {
    S.bond.xp += xp;
    let leveled = false;
    while (S.bond.xp >= bondXpForLevel(S.bond.level)) {
      S.bond.xp -= bondXpForLevel(S.bond.level);
      S.bond.level++;
      leveled = true;
    }
    return leveled;
  }

  /* ─────────────── ascension ─────────────── */

  function stardustGain() {
    return Math.floor(Math.sqrt(S.totalLight / C.PRESTIGE.divisor));
  }

  /** Archive the current wisp as a star and start a new life.
      The meadow keeps its shape (same seed) — home stays home. */
  function ascend(starPos) {
    const st = stageFor(S.level);
    const star = {
      name: S.wispName,
      hue: st.hue,
      stage: st.name,
      level: S.level,
      totalLight: S.totalLight,
      born: S.born,
      ascended: Date.now(),
      x: starPos.x,
      y: starPos.y,
    };
    S.stars.push(star);
    S.stardust += stardustGain();
    S.allTimeLight += S.totalLight;
    S.generation += 1;

    S.wispName = null;
    S.born = Date.now();
    S.light = 0;
    S.totalLight = 0;
    S.level = 1;
    S.xp = 0;
    S.buildings = {};
    S.upgrades = {};
    save();
    return star;
  }

  W.state = {
    get S() { return S; },
    defaultState, save, load, wipe,
    buildingCount, totalBuildings, buildingCost, buildingCostN, maxAffordable, buildingMult,
    globalMult, lightPerSec, tapValue,
    xpForLevel, stageFor, nextStage,
    stardustGain, ascend,
    bondXpForLevel, bondTitle, gainBond,
    buffMult, addBuff,
  };
})();
