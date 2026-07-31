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
      projects: { dock: 0, house: 0, boat: 0 },  // built tier per project
      deco: {},                      // decoId -> true
      building: null,                // {id, tier, readyAt} while a crew works
      restedUntil: 0,
      ferryNextAt: 0,
      trophies: {},                  // bossId -> true (mounted at the stall)
      bossCooldowns: {},             // bossId -> next catch timestamp
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
      S.projects = Object.assign({ dock: 0, house: 0, boat: 0 }, data.projects);
      S.deco = data.deco || {};
      S.building = data.building || null;
      S.trophies = data.trophies || {};
      S.bossCooldowns = data.bossCooldowns || {};
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

  /* ─────────────── projects (the Building Board) ─────────────── */

  function projectTier(id) { return S.projects[id] || 0; }

  /** The next unbuilt tier spec of a project, or null when maxed. */
  function nextProjectTier(id) {
    return C.PROJECTS[id].tiers[projectTier(id)] || null;
  }

  /** {ok, missing:[...]} for a {coins, mats} cost. */
  function checkCost(cost) {
    const missing = [];
    if (S.coins < cost.coins) missing.push(W.util.fmt(cost.coins - S.coins) + " coins");
    for (const [mid, n] of Object.entries(cost.mats || {})) {
      if (invCount(mid) < n) missing.push((n - invCount(mid)) + "× " + item(mid).name);
    }
    return { ok: missing.length === 0, missing };
  }

  function payCost(cost) {
    if (!checkCost(cost).ok) return false;
    S.coins -= cost.coins;
    for (const [mid, n] of Object.entries(cost.mats || {})) takeItem(mid, n);
    return true;
  }

  /** Pay for the next tier; instant tiers finish now, timed tiers
      occupy the (single) crew. Returns "done" | "building" | false. */
  function startProject(id) {
    const tier = nextProjectTier(id);
    if (!tier || S.building) return false;
    if (!payCost(tier)) return false;
    if (tier.buildMin > 0) {
      S.building = { id, tier: projectTier(id) + 1, readyAt: Date.now() + tier.buildMin * 60000 };
      save();
      return "building";
    }
    S.projects[id] = projectTier(id) + 1;
    onProjectDone(id, S.projects[id]);
    save();
    return "done";
  }

  /** Finish S.building if its time has come; returns {id, tier} once. */
  function completeBuilding(now) {
    if (!S.building || (now || Date.now()) < S.building.readyAt) return null;
    const b = S.building;
    S.building = null;
    S.projects[b.id] = b.tier;
    onProjectDone(b.id, b.tier);
    save();
    return b;
  }

  function onProjectDone(id, tier) {
    if (id === "dock" && tier === 3) S.ferryNextAt = Date.now() + C.FERRY.firstWaitSec * 1000;
  }

  function buyDeco(id) {
    const d = C.DECO.find((x) => x.id === id);
    if (!d || S.deco[id] || S.coins < d.cost) return false;
    S.coins -= d.cost;
    S.deco[id] = true;
    save();
    return true;
  }

  function offlineCapHours() {
    return C.OFFLINE.capHours + [0, 2, 4, 8][projectTier("house")];
  }

  /** Gather-speed multiplier from the rested boost (house). */
  function restedMult() {
    if (projectTier("house") < 1 || Date.now() >= S.restedUntil) return 1;
    return projectTier("house") >= 2 ? 2 : 1.5;
  }

  /* ─────────────── derived ─────────────── */

  function toolMult(which) { return C.TOOLS[S.tools[which]].mult; }

  function fishTime() { return C.GATHER.fishBaseSec / (toolMult("rod") * restedMult()); }
  function chopTime() { return C.GATHER.chopBaseSec / (toolMult("axe") * restedMult()); }

  function unlockedFish() {
    return C.FISH.filter((f) => f.lvl <= S.skills.fishing.level);
  }

  function queueSize() {
    let q = C.STALL.queueBase;
    for (const [lvl, size] of C.STALL.queueLevels) {
      if (S.skills.trading.level >= lvl) q = size;
    }
    if (projectTier("dock") >= 1) q += 1;
    return q;
  }

  function priceMult() {
    let m = 1 + S.skills.trading.level * C.STALL.priceLvlBonus;
    if (S.stallUpgrades.cart) m *= 1.15;
    if (projectTier("dock") >= 2) m *= 1.15;
    return m;
  }

  function orderValue(items) {
    let sum = 0;
    for (const it of items) {
      let p = item(it.id).price * it.n;
      // De Oude Koi's trophy: fish are worth more, forever
      if (S.trophies.koi && item(it.id).kind === "fish") p *= 1.05;
      sum += p;
    }
    return Math.round(sum * C.STALL.orderMarkup * priceMult());
  }

  /* ─────────────── the deep water ─────────────── */

  function baitCheck(boss) {
    const missing = [];
    for (const [mid, n] of Object.entries(boss.bait)) {
      if (invCount(mid) < n) missing.push((n - invCount(mid)) + "× " + item(mid).name);
    }
    return { ok: missing.length === 0, missing };
  }

  function takeBait(boss) {
    if (!baitCheck(boss).ok) return false;
    for (const [mid, n] of Object.entries(boss.bait)) takeItem(mid, n);
    return true;
  }

  function bossReady(boss) {
    return (S.bossCooldowns[boss.id] || 0) <= Date.now();
  }

  W.state = {
    get S() { return S; },
    get restoredFromBackup() { return restoredFromBackup; },
    defaultState, save, load, wipe, rotateBackup,
    xpForLevel, gainXp,
    item, invCount, addItem, takeItem,
    toolMult, fishTime, chopTime, unlockedFish,
    queueSize, priceMult, orderValue,
    projectTier, nextProjectTier, checkCost, payCost,
    startProject, completeBuilding, buyDeco,
    offlineCapHours, restedMult,
    baitCheck, takeBait, bossReady,
  };
})();
