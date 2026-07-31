/* ═══════════════════════════════════════════════════════════════
   COVE — ui.js
   HUD, panel tabs (Bag / Gear / Friends), toasts, floaters, modal.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;
  const $ = (id) => document.getElementById(id);

  let bagDirty = true;

  function init() {
    $("panel-toggle").addEventListener("click", () => $("panel").classList.toggle("collapsed"));
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        $("tab-" + tab.dataset.tab).classList.add("active");
        $("panel").classList.remove("collapsed");
        if (tab.dataset.tab === "gear") renderGear();
        if (tab.dataset.tab === "build") renderBuild();
        if (tab.dataset.tab === "friends") renderFriends();
      });
    });
    document.querySelectorAll(".skill-chip").forEach((chip) => {
      chip.addEventListener("click", () => showSkill(chip.dataset.skill));
    });
    $("btn-settings").addEventListener("click", showSettings);
  }

  /* ─────────────── HUD ─────────────── */

  function updateHud() {
    const S = W.state.S;
    $("coin-amount").textContent = U.fmt(S.coins);
    for (const id of ["fishing", "woodcutting", "trading"]) {
      const sk = S.skills[id];
      $("lv-" + id).textContent = sk.level;
      const need = W.state.xpForLevel(sk.level);
      $("fill-" + id).style.width = Math.min(100, (sk.xp / need) * 100) + "%";
    }
    if (bagDirty && $("tab-bag").classList.contains("active")) renderBag();
    if ($("tab-build").classList.contains("active")) {
      buildClock += 0.15;
      if (buildDirty || (S.building && buildClock >= 1)) { buildClock = 0; renderBuild(); }
    }
    document.title = (S.playerName ? S.playerName + "'s stall · " : "") + U.fmt(S.coins) + " ● COVE";
  }

  /* ─────────────── Bag ─────────────── */

  function renderBag() {
    bagDirty = false;
    const S = W.state.S;
    const ids = Object.keys(S.inv);
    let html = "";
    if (!ids.length) {
      html = `<p class="row-sub" style="text-align:center;padding:18px 8px">Your bag is empty.
        Tap the pond to fish, or a tree to chop — the queue will want both.</p>`;
    } else {
      const chips = ids.map((id) => {
        const spec = W.state.item(id);
        return `<span class="bag-chip"><span style="color:hsl(${spec.hue},60%,45%)">${spec.kind === "fish" ? "🐟" : "🪵"}</span>${spec.name} × ${S.inv[id]}</span>`;
      }).join("");
      html = `<div class="bag-grid">${chips}</div>
        <div class="section-label">Surplus</div>
        <button class="row" id="btn-surplus">
          <div class="row-glyph">💰</div>
          <div class="row-info"><div class="row-name">Sell everything the queue doesn't need</div>
          <div class="row-sub">Instant coins at ${Math.round(C.STALL.surplusRate * 100)}% of base price. Orders always pay more.</div></div>
        </button>`;
    }
    $("tab-bag").innerHTML = html;
    const btn = $("btn-surplus");
    if (btn) btn.addEventListener("click", sellSurplus);
  }

  function sellSurplus() {
    const S = W.state.S;
    // reserve what live orders need
    const reserved = {};
    for (const o of S.orders) for (const it of o.items) reserved[it.id] = (reserved[it.id] || 0) + it.n;
    let total = 0;
    for (const id of Object.keys(S.inv)) {
      const spare = S.inv[id] - (reserved[id] || 0);
      if (spare > 0) {
        total += Math.round(W.state.item(id).price * spare * C.STALL.surplusRate * W.state.priceMult());
        W.state.takeItem(id, spare);
      }
    }
    if (total > 0) {
      S.coins += total;
      S.totals.earned += total;
      const ups = W.state.gainXp("trading", Math.round(total * 0.4));
      if (ups > 0) skillUp("trading", ups);
      W.audio.play("sell");
      toast("💰 Surplus sold", "+" + U.fmt(total) + " coins");
      W.state.save();
    } else {
      W.audio.play("denied");
      toast("Nothing spare", "The queue still needs what you're carrying.");
    }
    bagDirty = true;
    renderBag();
  }

  /* ─────────────── Gear ─────────────── */

  function renderGear() {
    const S = W.state.S;
    let html = `<div class="section-label">Tools</div>`;
    for (const [which, icon, label] of [["rod", "🎣", "Fishing rod"], ["axe", "🪓", "Axe"]]) {
      const cur = C.TOOLS[S.tools[which]];
      const next = C.TOOLS[S.tools[which] + 1];
      if (next) {
        const can = S.coins >= next.cost;
        html += `<button class="row ${can ? "" : "disabled"}" data-tool="${which}">
          <div class="row-glyph">${icon}</div>
          <div class="row-info"><div class="row-name">${next.name} ${label.toLowerCase()}</div>
          <div class="row-sub">Now: ${cur.name} (×${cur.mult}). Upgrade → ×${next.mult} speed.</div></div>
          <div class="row-end"><span class="${can ? "" : "cant"}">${U.fmt(next.cost)} ●</span></div>
        </button>`;
      } else {
        html += `<div class="row disabled"><div class="row-glyph">${icon}</div>
          <div class="row-info"><div class="row-name">${cur.name} ${label.toLowerCase()}</div>
          <div class="row-sub">The finest there is. ×${cur.mult} speed.</div></div></div>`;
      }
    }
    html += `<div class="section-label">Stall</div>`;
    for (const up of C.STALL_UPGRADES) {
      if (S.stallUpgrades[up.id]) {
        html += `<div class="row disabled"><div class="row-glyph">${up.glyph}</div>
          <div class="row-info"><div class="row-name">${up.name} ✓</div>
          <div class="row-sub">${up.desc}</div></div></div>`;
      } else {
        const can = S.coins >= up.cost;
        html += `<button class="row ${can ? "" : "disabled"}" data-stallup="${up.id}">
          <div class="row-glyph">${up.glyph}</div>
          <div class="row-info"><div class="row-name">${up.name}</div>
          <div class="row-sub">${up.desc}</div></div>
          <div class="row-end"><span class="${can ? "" : "cant"}">${U.fmt(up.cost)} ●</span></div>
        </button>`;
      }
    }
    $("tab-gear").innerHTML = html;

    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => buyTool(btn.dataset.tool));
    });
    document.querySelectorAll("[data-stallup]").forEach((btn) => {
      btn.addEventListener("click", () => buyStallUpgrade(btn.dataset.stallup));
    });
  }

  function buyTool(which) {
    const S = W.state.S;
    const next = C.TOOLS[S.tools[which] + 1];
    if (!next || S.coins < next.cost) { W.audio.play("denied"); return; }
    S.coins -= next.cost;
    S.tools[which]++;
    W.audio.play("buy");
    toast("✨ " + next.name + " " + (which === "rod" ? "rod" : "axe"), "×" + next.mult + " gathering speed");
    W.state.save();
    renderGear();
  }

  function buyStallUpgrade(id) {
    const S = W.state.S;
    const up = C.STALL_UPGRADES.find((u) => u.id === id);
    if (!up || S.stallUpgrades[id] || S.coins < up.cost) { W.audio.play("denied"); return; }
    S.coins -= up.cost;
    S.stallUpgrades[id] = true;
    W.audio.play("buy");
    toast(up.glyph + " " + up.name, up.desc);
    W.state.save();
    renderGear();
  }

  /* ─────────────── Build (the cove grows) ─────────────── */

  let buildDirty = true;
  let buildClock = 0;

  function costHtml(cost) {
    const S = W.state.S;
    const parts = [];
    parts.push(`<span class="${S.coins >= cost.coins ? "" : "cant"}">${U.fmt(cost.coins)} ●</span>`);
    for (const [mid, n] of Object.entries(cost.mats || {})) {
      const ok = W.state.invCount(mid) >= n;
      parts.push(`<span class="${ok ? "" : "cant"}">${n}× ${W.state.item(mid).name}</span>`);
    }
    return parts.join(" + ");
  }

  function renderBuild() {
    buildDirty = false;
    const S = W.state.S;
    let html = "";

    if (S.building) {
      const proj = C.PROJECTS[S.building.id];
      const tierSpec = proj.tiers[S.building.tier - 1];
      const left = Math.max(0, Math.ceil((S.building.readyAt - Date.now()) / 1000));
      html += `<div class="section-label">Under construction</div>
        <div class="row"><div class="row-glyph">🔨</div>
        <div class="row-info"><div class="row-name">${tierSpec.name}</div>
        <div class="row-sub">The crew is at it — ready in ${U.fmtDuration(left)}. It finishes even while you're away.</div></div></div>`;
    }

    html += `<div class="section-label">Projects</div>`;
    for (const [pid, proj] of Object.entries(C.PROJECTS)) {
      const tier = W.state.projectTier(pid);
      const next = W.state.nextProjectTier(pid);
      if (!next) {
        html += `<div class="row disabled"><div class="row-glyph">${proj.glyph}</div>
          <div class="row-info"><div class="row-name">${proj.name} ✓</div>
          <div class="row-sub">${proj.tiers[proj.tiers.length - 1].desc}</div></div></div>`;
        continue;
      }
      const busy = !!S.building;
      const can = !busy && W.state.checkCost(next).ok;
      const timeNote = next.buildMin > 0 ? ` · builds in ${U.fmtDuration(next.buildMin * 60)}` : "";
      html += `<button class="row ${can ? "" : "disabled"}" data-project="${pid}">
        <div class="row-glyph">${proj.glyph}</div>
        <div class="row-info"><div class="row-name">${next.name}${tier > 0 ? " (tier " + (tier + 1) + ")" : ""}</div>
        <div class="row-sub">${next.desc}${timeNote}${busy ? " · the crew is busy" : ""}</div>
        <div class="row-sub"><b>${costHtml(next)}</b></div></div>
      </button>`;
    }

    html += `<div class="section-label">Decorations</div>`;
    for (const d of C.DECO) {
      if (S.deco[d.id]) {
        html += `<div class="row disabled"><div class="row-glyph">${d.glyph}</div>
          <div class="row-info"><div class="row-name">${d.name} ✓</div>
          <div class="row-sub">${d.line}</div></div></div>`;
      } else {
        const can = S.coins >= d.cost;
        html += `<button class="row ${can ? "" : "disabled"}" data-deco="${d.id}">
          <div class="row-glyph">${d.glyph}</div>
          <div class="row-info"><div class="row-name">${d.name}</div>
          <div class="row-sub">Just because it's yours.</div></div>
          <div class="row-end"><span class="${can ? "" : "cant"}">${U.fmt(d.cost)} ●</span></div>
        </button>`;
      }
    }
    html += `<p class="row-sub" style="padding:6px 8px">Every build changes the cove you see.
      Wood comes from your own axe — sell it, or build with it.</p>`;

    $("tab-build").innerHTML = html;
    document.querySelectorAll("[data-project]").forEach((btn) => {
      btn.addEventListener("click", () => buyProject(btn.dataset.project));
    });
    document.querySelectorAll("[data-deco]").forEach((btn) => {
      btn.addEventListener("click", () => buyDeco(btn.dataset.deco));
    });
  }

  function buyProject(pid) {
    const next = W.state.nextProjectTier(pid);
    if (!next) return;
    const res = W.state.startProject(pid);
    if (res === false) {
      W.audio.play("denied");
      const chk = W.state.checkCost(next);
      if (W.state.S.building) toast("🔨 The crew is busy", "One project at a time — they're worth the wait.");
      else if (!chk.ok) toast("Still needed: " + chk.missing.join(", "), "Chop, fish, and sell to get there.");
      return;
    }
    W.audio.play("buy");
    if (res === "building") {
      toast("🔨 " + next.name + " started", "Ready in " + U.fmtDuration(next.buildMin * 60) + " — even if you close the game.");
    }
    // instant completion toast comes from the tick
    bagDirty = true;
    renderBuild();
  }

  function buyDeco(id) {
    const d = C.DECO.find((x) => x.id === id);
    if (!W.state.buyDeco(id)) { W.audio.play("denied"); return; }
    W.audio.play("buy");
    toast(d.glyph + " " + d.name, d.line);
    renderBuild();
  }

  /* ─────────────── Friends ─────────────── */

  function renderFriends() {
    const S = W.state.S;
    let html = `<div class="section-label">The village</div>`;
    for (const c of C.CUSTOMERS) {
      if (c.needsDock && S.projects.dock < c.needsDock) {
        html += `<div class="row disabled">
          <div class="row-glyph">⛴️</div>
          <div class="row-info"><div class="row-name">???</div>
          <div class="row-sub">Arrives once the dock reaches tier ${c.needsDock}.</div></div>
        </div>`;
        continue;
      }
      const serves = S.affinity[c.id] || 0;
      const next = C.AFFINITY.milestones.find((m) => m > serves);
      const hearts = C.AFFINITY.milestones.filter((m) => serves >= m).length;
      html += `<div class="row">
        <div class="row-glyph" style="background:hsl(${c.hue},50%,88%)">🙂</div>
        <div class="row-info"><div class="row-name">${c.name} <span class="aff-hearts">${"♥".repeat(hearts)}${"♡".repeat(4 - hearts)}</span></div>
        <div class="row-sub">${serves} order${serves === 1 ? "" : "s"} served${next ? " · gift at " + next : " · a true friend"}</div></div>
      </div>`;
    }
    html += `<p class="row-sub" style="padding:6px 8px">Regulars bring gifts as you get to know them.
      One day, one of them might bring you something better than coins…</p>`;
    $("tab-friends").innerHTML = html;
  }

  /* ─────────────── skill popups ─────────────── */

  function skillUp(skillId, ups) {
    const S = W.state.S;
    const names = { fishing: "Fishing", woodcutting: "Woodcutting", trading: "Trading" };
    W.audio.play("level");
    toast("⬆ " + names[skillId] + " level " + S.skills[skillId].level + "!",
      skillId === "trading" ? "Better prices — and busier queues." : "New catches come within reach.");
  }

  function showSkill(skillId) {
    const S = W.state.S;
    const sk = S.skills[skillId];
    const names = { fishing: "Fishing", woodcutting: "Woodcutting", trading: "Trading" };
    let unlocks = "";
    if (skillId === "fishing") {
      unlocks = C.FISH.map((f) =>
        `<div class="setting-row"><span>${f.lvl <= sk.level ? "✓" : "🔒"} ${f.name}</span><b>lv ${f.lvl}</b></div>`).join("");
    } else if (skillId === "woodcutting") {
      unlocks = C.TREES.map((t) =>
        `<div class="setting-row"><span>${t.lvl <= sk.level ? "✓" : "🔒"} ${t.name}</span><b>lv ${t.lvl}</b></div>`).join("");
    } else {
      unlocks = C.STALL.queueLevels.map(([lvl, size]) =>
        `<div class="setting-row"><span>${sk.level >= lvl ? "✓" : "🔒"} Queue of ${size}</span><b>lv ${lvl}</b></div>`).join("");
    }
    modal(names[skillId] + " · level " + sk.level,
      `<p class="muted">${U.fmt(sk.xp)} / ${U.fmt(W.state.xpForLevel(sk.level))} xp to next level</p>
       <div style="margin-top:10px;text-align:left">${unlocks}</div>`,
      [{ label: "Close", cls: "btn-primary" }]);
  }

  /* ─────────────── floaters & toasts ─────────────── */

  function worldFloater(wx, wy, text, kind) {
    const p = W.scene.toScreen(wx, wy);
    const el = document.createElement("div");
    el.className = "floater" + (kind ? " " + kind : "");
    el.textContent = text;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.style.fontSize = "1rem";
    $("floaters").appendChild(el);
    setTimeout(() => el.remove(), 1150);
    if ($("floaters").childElementCount > 30) $("floaters").firstElementChild.remove();
  }

  function toast(title, sub) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<b>${title}</b>` + (sub ? `<span class="toast-sub">${sub}</span>` : "");
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 3900);
    if ($("toasts").childElementCount > 3) $("toasts").firstElementChild.remove();
  }

  /* ─────────────── modal & settings ─────────────── */

  function modal(title, bodyHtml, actions) {
    $("modal-title").textContent = title;
    $("modal-body").innerHTML = bodyHtml;
    $("modal-actions").replaceChildren();
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.className = "btn " + (a.cls || "btn-primary");
      btn.textContent = a.label;
      btn.addEventListener("click", () => { closeModal(); if (a.fn) a.fn(); });
      $("modal-actions").appendChild(btn);
    }
    $("modal-shade").classList.remove("hidden");
  }
  function closeModal() { $("modal-shade").classList.add("hidden"); }

  function showSettings() {
    const S = W.state.S;
    modal("Settings",
      `<div class="setting-row"><span>Sound</span><button class="switch ${S.settings.sound ? "on" : ""}" id="sw-sound"></button></div>
       <div class="setting-row"><span>Save code</span><span>
         <button class="btn btn-ghost" id="btn-export" style="padding:8px 14px;font-size:0.8rem">Copy</button>
         <button class="btn btn-ghost" id="btn-import" style="padding:8px 14px;font-size:0.8rem">Load</button>
       </span></div>
       <div class="setting-row"><span>Served</span><b>${U.fmtInt(S.totals.served)} orders · ${U.fmt(S.totals.earned)} ● lifetime</b></div>
       <p class="muted" style="margin-top:10px">COVE ${C.BUILD} · saves automatically in this browser</p>`,
      [
        { label: "Start over…", cls: "btn-danger", fn: confirmReset },
        { label: "Close", cls: "btn-ghost" },
      ]);
    $("sw-sound").addEventListener("click", (e) => {
      S.settings.sound = !S.settings.sound;
      W.audio.setEnabled(S.settings.sound);
      e.target.classList.toggle("on", S.settings.sound);
      if (S.settings.sound) W.audio.play("buy");
    });
    $("btn-export").addEventListener("click", () => {
      W.state.save();
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => toast("📋 Save code copied", "Keep it somewhere safe."))
          .catch(() => window.prompt("Copy your save code:", code));
      } else window.prompt("Copy your save code:", code);
    });
    $("btn-import").addEventListener("click", () => {
      const code = window.prompt("Paste a save code:");
      if (!code) return;
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
        if (typeof data.coins !== "number") throw new Error("bad");
        localStorage.setItem(C.SAVE_KEY, JSON.stringify(data));
        location.reload();
      } catch (e) {
        modal("Hmm…", "<p>That code doesn't look like a stall. Nothing was changed.</p>",
          [{ label: "Okay", cls: "btn-ghost" }]);
      }
    });
  }

  function confirmReset() {
    modal("Start over?",
      `<p>The stall, your skills, and everything the village knows about you — gone for good.</p>`,
      [
        { label: "Keep my cove", cls: "btn-primary" },
        { label: "Wipe it", cls: "btn-danger", fn: () => { W.state.wipe(); location.reload(); } },
      ]);
  }

  W.ui = {
    init, updateHud, renderBag, renderGear, renderBuild, renderFriends,
    worldFloater, toast, modal, closeModal, skillUp,
    markBagDirty() { bagDirty = true; },
    markBuildDirty() { buildDirty = true; },
    show() { $("hud").classList.remove("hidden"); },
  };
})();
