/* ═══════════════════════════════════════════════════════════════
   WISP — ui.js
   HUD, shop, toasts, floaters, speech bubble, modals.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;
  const $ = (id) => document.getElementById(id);

  const els = {};
  let shopRows = new Map();   // id -> {row, costEl}
  let boostRows = new Map();
  let bubbleTimer = null;
  let visibleBuildings = 0;
  let visibleBoostIds = "";

  function init() {
    ["hud", "light-amount", "light-rate", "wisp-name-tag", "wisp-stage-tag",
     "xpfill", "wisp-level-tag", "panel", "panel-toggle", "tab-build",
     "tab-boosts", "tab-wisp", "toasts", "floaters", "bubble", "bubble-text",
     "modal-shade", "modal-title", "modal-body", "modal-actions", "btn-settings",
    ].forEach((id) => { els[id] = $(id); });

    els["panel-toggle"].addEventListener("click", () => {
      els.panel.classList.toggle("collapsed");
    });

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        $("tab-" + tab.dataset.tab).classList.add("active");
        els.panel.classList.remove("collapsed");
        if (tab.dataset.tab === "wisp") renderWispTab();
      });
    });

    els["btn-settings"].addEventListener("click", showSettings);
  }

  /* ─────────────── counters ─────────────── */

  function updateCounters() {
    const S = W.state.S;
    els["light-amount"].textContent = U.fmt(S.light);
    els["light-rate"].textContent = U.fmt(W.state.lightPerSec()) + " /s · tap " + U.fmt(W.state.tapValue());
    els["wisp-name-tag"].textContent = S.wispName || "…";
    els["wisp-stage-tag"].textContent = W.state.stageFor(S.level).name;
    els["wisp-level-tag"].textContent = "Lv " + S.level;
    const need = W.state.xpForLevel(S.level);
    els.xpfill.style.width = Math.min(100, (S.xp / need) * 100) + "%";
  }

  /* ─────────────── build tab ─────────────── */

  function buildingVisibleCount() {
    const S = W.state.S;
    // Show first building always; each next one appears once the
    // previous is owned. Tease one locked row beyond that.
    let visible = 1;
    for (let i = 0; i < C.BUILDINGS.length; i++) {
      if ((S.buildings[C.BUILDINGS[i].id] || 0) > 0) visible = i + 2;
    }
    return Math.min(visible + 1, C.BUILDINGS.length);
  }

  function renderBuildTab() {
    const S = W.state.S;
    const count = buildingVisibleCount();
    visibleBuildings = count;
    shopRows.clear();
    const frag = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
      const b = C.BUILDINGS[i];
      const unlocked = i === 0 || (S.buildings[C.BUILDINGS[i - 1].id] || 0) > 0;
      const row = document.createElement("button");
      row.className = "shop-row" + (unlocked ? "" : " locked");
      if (unlocked) {
        row.innerHTML =
          `<div class="shop-glyph">${b.glyph}</div>` +
          `<div class="shop-info"><div class="shop-name">${b.name}<span class="owned"></span></div>` +
          `<div class="shop-desc">${b.desc}</div></div>` +
          `<div class="shop-cost"><div class="cost"></div><div class="rate"></div></div>`;
        row.addEventListener("click", () => W.game.buyBuilding(b.id));
        shopRows.set(b.id, {
          row,
          costEl: row.querySelector(".cost"),
          rateEl: row.querySelector(".rate"),
          ownedEl: row.querySelector(".owned"),
        });
      } else {
        row.innerHTML =
          `<div class="shop-glyph">?</div>` +
          `<div class="shop-info"><div class="shop-name">???</div>` +
          `<div class="shop-desc">Something new stirs beyond the hills…</div></div>`;
      }
      frag.appendChild(row);
    }
    els["tab-build"].replaceChildren(frag);
    updateShop();
  }

  function updateShop() {
    const S = W.state.S;
    if (buildingVisibleCount() !== visibleBuildings) { renderBuildTab(); return; }
    for (const [id, refs] of shopRows) {
      const b = C.BUILDINGS.find((x) => x.id === id);
      const cost = W.state.buildingCost(b);
      const owned = S.buildings[id] || 0;
      const can = S.light >= cost;
      refs.costEl.textContent = U.fmt(cost) + " ✦";
      refs.costEl.classList.toggle("cant", !can);
      refs.row.classList.toggle("unaffordable", !can);
      refs.ownedEl.textContent = owned > 0 ? "×" + owned : "";
      const each = b.rate * W.state.buildingMult(id) * W.state.globalMult();
      refs.rateEl.textContent = "+" + U.fmt(each) + "/s";
    }
  }

  /* ─────────────── boosts tab ─────────────── */

  function availableBoosts() {
    const S = W.state.S;
    return C.UPGRADES.filter((u) => {
      if (S.upgrades[u.id]) return false;
      if (u.needs && (S.buildings[u.needs[0]] || 0) < u.needs[1]) return false;
      return S.totalLight >= u.cost * 0.25; // appears when within reach
    });
  }

  function renderBoostsTab() {
    const S = W.state.S;
    const list = availableBoosts();
    visibleBoostIds = list.map((u) => u.id).join(",");
    boostRows.clear();
    const frag = document.createDocumentFragment();

    if (list.length === 0) {
      const p = document.createElement("p");
      p.className = "shop-desc";
      p.style.textAlign = "center";
      p.style.padding = "20px 10px";
      p.textContent = Object.keys(S.upgrades).length > 0
        ? "You've gathered every boost within reach. Keep growing — more will come."
        : "Boosts will appear here as your light grows.";
      frag.appendChild(p);
    }

    for (const u of list) {
      const row = document.createElement("button");
      row.className = "shop-row";
      row.innerHTML =
        `<div class="shop-glyph">${u.glyph}</div>` +
        `<div class="shop-info"><div class="shop-name">${u.name}</div>` +
        `<div class="shop-desc">${u.desc}</div></div>` +
        `<div class="shop-cost"><div class="cost"></div></div>`;
      row.addEventListener("click", () => W.game.buyUpgrade(u.id));
      boostRows.set(u.id, { row, costEl: row.querySelector(".cost"), cost: u.cost });
      frag.appendChild(row);
    }

    const ownedCount = Object.keys(S.upgrades).length;
    if (ownedCount > 0) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = ownedCount + " boost" + (ownedCount > 1 ? "s" : "") + " woven into your light";
      frag.appendChild(label);
    }

    els["tab-boosts"].replaceChildren(frag);
    updateBoosts();
  }

  function updateBoosts() {
    const S = W.state.S;
    const ids = availableBoosts().map((u) => u.id).join(",");
    if (ids !== visibleBoostIds) { renderBoostsTab(); return; }
    let anyAffordable = false;
    for (const [, refs] of boostRows) {
      const can = S.light >= refs.cost;
      if (can) anyAffordable = true;
      refs.costEl.textContent = U.fmt(refs.cost) + " ✦";
      refs.costEl.classList.toggle("cant", !can);
      refs.row.classList.toggle("unaffordable", !can);
    }
    // notification dot on the Boosts tab
    const tab = document.querySelector('.tab[data-tab="boosts"]');
    const hasDot = !!tab.querySelector(".tab-dot");
    if (anyAffordable && !hasDot) {
      const dot = document.createElement("span");
      dot.className = "tab-dot";
      tab.appendChild(dot);
    } else if (!anyAffordable && hasDot) {
      tab.querySelector(".tab-dot").remove();
    }
  }

  /* ─────────────── wisp tab ─────────────── */

  function renderWispTab() {
    const S = W.state.S;
    const st = W.state.stageFor(S.level);
    const next = W.state.nextStage(S.level);
    const ageDays = Math.floor((Date.now() - S.born) / 86400000);
    const ageText = ageDays === 0 ? "born today" : ageDays === 1 ? "1 day old" : ageDays + " days old";

    const achHtml = C.ACHIEVEMENTS.map((a) => {
      const has = !!S.achievements[a.id];
      return `<div class="ach ${has ? "unlocked" : ""}" title="${has ? a.name + " — " + a.desc : "???"}">${a.glyph}</div>`;
    }).join("");

    // ─ ascension card ─
    let ascHtml = "";
    const gain = W.state.stardustGain();
    if (S.level >= C.PRESTIGE.unlockLevel || S.stars.length > 0) {
      const ready = gain >= 1;
      ascHtml =
        `<div class="wisp-card" style="border-color: rgba(255,217,122,0.25)">
          <h3>🌠 Ascension</h3>
          <div class="shop-desc">When ${S.wispName || "your wisp"} is bright enough, it can take its
          place in the sky — a star that watches over every wisp after it, forever.
          The meadow starts over; stardust, stars and memories stay.</div>
          <div class="stat-line" style="margin-top:8px"><span>Stardust now</span><b>${S.stardust} ✨ (+${Math.round(S.stardust * C.PRESTIGE.perStardust * 100)}% light)</b></div>
          <div class="stat-line"><span>If it ascends today</span><b>+${gain} ✨</b></div>
          <button class="btn ${ready ? "btn-primary" : "btn-ghost"}" id="btn-ascend"
            style="width:100%; margin-top:10px; ${ready ? "" : "opacity:0.55"}">
            ${ready ? "Begin the ascension…" : "Not bright enough yet (needs " + U.fmt(C.PRESTIGE.divisor) + " ✦ lifetime)"}
          </button>
        </div>`;
    }

    // ─ family of stars ─
    let starsHtml = "";
    if (S.stars.length > 0) {
      const rows = S.stars.map((star) =>
        `<div class="stat-line"><span>🌟 ${star.name}</span><b>${star.stage} · Lv ${star.level}</b></div>`
      ).join("");
      starsHtml =
        `<div class="wisp-card">
          <h3>Your sky · generation ${S.generation}</h3>
          ${rows}
          <div class="shop-desc" style="margin-top:6px">They're in the sky right now. Tap them to say hi.</div>
        </div>`;
    }

    els["tab-wisp"].innerHTML =
      `<div class="wisp-card">
        <h3>${S.wispName || "Your wisp"} · ${st.name}${S.stars.length > 0 ? " · gen " + S.generation : ""}</h3>
        <div class="stat-line"><span>Age</span><b>${ageText}</b></div>
        <div class="stat-line"><span>Level</span><b>${S.level}</b></div>
        ${next ? `<div class="stat-line"><span>Next form</span><b>${next.name} at Lv ${next.level}</b></div>` : ""}
        <div class="stat-line"><span>Light gathered (this life)</span><b>${U.fmt(S.totalLight)} ✦</b></div>
        ${S.allTimeLight > 0 ? `<div class="stat-line"><span>Light across all lives</span><b>${U.fmt(S.allTimeLight + S.totalLight)} ✦</b></div>` : ""}
        <div class="stat-line"><span>Times touched</span><b>${U.fmtInt(S.taps)}</b></div>
        <div class="stat-line"><span>Things built</span><b>${U.fmtInt(W.state.totalBuildings())}</b></div>
        <div class="stat-line"><span>Production bonus</span><b>×${W.state.globalMult().toFixed(2)}</b></div>
      </div>
      ${ascHtml}
      ${starsHtml}
      <div class="wisp-card">
        <h3>Memories · ${Object.keys(S.achievements).length}/${C.ACHIEVEMENTS.length}</h3>
        <div class="ach-grid">${achHtml}</div>
        <div class="shop-desc" style="margin-top:8px">Each memory makes ${S.wispName || "your wisp"} glow 1% brighter. Memories survive ascension.</div>
      </div>`;

    const ascBtn = $("btn-ascend");
    if (ascBtn) ascBtn.addEventListener("click", () => W.game.tryAscend());
  }

  /* ─────────────── floaters, toasts, bubble ─────────────── */

  function floater(x, y, text, crit) {
    const el = document.createElement("div");
    el.className = "floater" + (crit ? " crit" : "");
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.fontSize = crit ? "1.5rem" : "1.05rem";
    els.floaters.appendChild(el);
    setTimeout(() => el.remove(), 1150);
    // keep DOM lean
    if (els.floaters.childElementCount > 40) els.floaters.firstElementChild.remove();
  }

  function toast(title, sub) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<b>${title}</b>` + (sub ? `<span class="toast-sub">${sub}</span>` : "");
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3900);
    if (els.toasts.childElementCount > 3) els.toasts.firstElementChild.remove();
  }

  function bubble(text, duration = 3200) {
    els["bubble-text"].textContent = text;
    els.bubble.classList.remove("hidden");
    const p = W.scene.wispPos();
    const r = W.wisp.radius();
    els.bubble.style.top = "0px";
    // measure after render
    requestAnimationFrame(() => {
      const bh = els.bubble.offsetHeight;
      els.bubble.style.top = Math.max(10, p.y - r * 2.1 - bh) + "px";
    });
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => els.bubble.classList.add("hidden"), duration);
  }

  /* ─────────────── modal ─────────────── */

  function modal(title, bodyHtml, actions) {
    els["modal-title"].textContent = title;
    els["modal-body"].innerHTML = bodyHtml;
    els["modal-actions"].replaceChildren();
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.className = "btn " + (a.cls || "btn-primary");
      btn.textContent = a.label;
      btn.addEventListener("click", () => {
        closeModal();
        if (a.fn) a.fn();
      });
      els["modal-actions"].appendChild(btn);
    }
    els["modal-shade"].classList.remove("hidden");
  }

  function closeModal() {
    els["modal-shade"].classList.add("hidden");
  }

  /* ─────────────── settings ─────────────── */

  function showSettings() {
    const S = W.state.S;
    const rowsHtml =
      `<div class="setting-row"><span>Sound</span><button class="switch ${S.settings.sound ? "on" : ""}" id="sw-sound"></button></div>
       <div class="setting-row"><span>Particles</span><button class="switch ${S.settings.particles ? "on" : ""}" id="sw-particles"></button></div>
       <div class="setting-row"><span>Playing since</span><b style="font-size:0.85rem">${new Date(S.born).toLocaleDateString()}</b></div>`;

    modal("Settings", rowsHtml + `<p class="muted" style="margin-top:12px">WISP saves automatically, right here in your browser.</p>`, [
      { label: "Start over…", cls: "btn-danger", fn: confirmReset },
      { label: "Close", cls: "btn-ghost" },
    ]);

    $("sw-sound").addEventListener("click", (e) => {
      S.settings.sound = !S.settings.sound;
      W.audio.setEnabled(S.settings.sound);
      e.target.classList.toggle("on", S.settings.sound);
      if (S.settings.sound) W.audio.play("buy");
    });
    $("sw-particles").addEventListener("click", (e) => {
      S.settings.particles = !S.settings.particles;
      e.target.classList.toggle("on", S.settings.particles);
    });
  }

  function confirmReset() {
    const S = W.state.S;
    const name = S.wispName || "your wisp";
    modal(
      "Start over?",
      `<p>This will let <b>${name}</b> go — everything you've built together, every memory, gone forever.</p>
       <p class="muted" style="margin-top:10px">${name} will not remember you.</p>`,
      [
        { label: "Keep " + name, cls: "btn-primary" },
        { label: "Let go", cls: "btn-danger", fn: () => { W.state.wipe(); location.reload(); } },
      ]
    );
  }

  W.ui = {
    init, updateCounters,
    renderBuildTab, updateShop,
    renderBoostsTab, updateBoosts,
    renderWispTab,
    floater, toast, bubble, modal, closeModal,
    show() { els.hud.classList.remove("hidden"); },
  };
})();
