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
    $("btn-photo").addEventListener("click", sharePostcard);

    // the nameplate is a shortcut to the Wisp tab
    $("wisp-plate").style.cursor = "pointer";
    $("wisp-plate").addEventListener("click", () => {
      document.querySelector('.tab[data-tab="wisp"]').click();
    });
  }

  /* ─────────────── postcard ─────────────── */

  function sharePostcard() {
    const S = W.state.S;
    const world = document.getElementById("world");
    const PW = 1080, PH = 1350;
    const c = document.createElement("canvas");
    c.width = PW; c.height = PH;
    const x = c.getContext("2d");

    // cover-fit the live frame
    const scale = Math.max(PW / world.width, PH / world.height);
    const dw = world.width * scale, dh = world.height * scale;
    x.drawImage(world, (PW - dw) / 2, (PH - dh) / 2, dw, dh);

    // soft dark band for text
    const g = x.createLinearGradient(0, PH - 420, 0, PH);
    g.addColorStop(0, "rgba(7,10,28,0)");
    g.addColorStop(0.45, "rgba(7,10,28,0.82)");
    g.addColorStop(1, "rgba(7,10,28,0.95)");
    x.fillStyle = g;
    x.fillRect(0, PH - 420, PW, 420);

    const st = W.state.stageFor(S.level);
    const days = Math.max(1, Math.ceil((Date.now() - S.born) / 86400000));
    x.textAlign = "center";
    x.fillStyle = "#ffedbe";
    x.font = "800 92px ui-rounded, system-ui, sans-serif";
    x.shadowColor = "rgba(255,217,122,0.6)";
    x.shadowBlur = 40;
    x.fillText(S.wispName || "wisp", PW / 2, PH - 250);
    x.shadowBlur = 0;
    x.fillStyle = "#aab6dd";
    x.font = "600 42px ui-rounded, system-ui, sans-serif";
    x.fillText(st.name + " · level " + S.level + " · " + days + (days === 1 ? " day" : " days") + " together", PW / 2, PH - 175);
    if (S.stars.length > 0) {
      const names = S.stars.map((s) => s.name);
      const shown = names.length > 4
        ? names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more"
        : names.join(", ");
      const guardians = "watched over by " + shown;
      x.fillText(S.constellation ? guardians + " — the " + S.constellation : guardians, PW / 2, PH - 118);
    }
    x.fillStyle = "#6e7aa3";
    x.font = "600 34px ui-rounded, system-ui, sans-serif";
    x.fillText("— WISP · a tiny light that grows with you —", PW / 2, PH - 48);

    // supporters get a golden frame
    if (S.flags.supporter) {
      x.strokeStyle = "rgba(255,217,122,0.85)";
      x.lineWidth = 10;
      x.strokeRect(18, 18, PW - 36, PH - 36);
      x.strokeStyle = "rgba(255,217,122,0.35)";
      x.lineWidth = 2;
      x.strokeRect(34, 34, PW - 68, PH - 68);
      x.fillStyle = "#ffd97a";
      x.font = "44px sans-serif";
      x.textAlign = "left";
      x.fillText("✦", 34, 70);
      x.textAlign = "right";
      x.fillText("✦", PW - 34, 70);
      x.textAlign = "center";
    }

    c.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "wisp-postcard.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "WISP", text: "Meet " + (S.wispName || "my wisp") + " ✦" });
          return;
        } catch (e) { /* fall through to download */ }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "wisp-postcard.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("📷 Postcard saved", "Share " + (S.wispName || "your wisp") + " with someone kind.");
    }, "image/png");
    W.audio.play("achievement");
    const p = W.scene.wispPos();
    W.particles.burst(p.x, p.y, 20, { speed: 160 });
  }

  /* ─────────────── counters ─────────────── */

  function updateCounters() {
    const S = W.state.S;
    els["light-amount"].textContent = U.fmt(S.light);
    let rateText = U.fmt(W.state.lightPerSec()) + " /s · tap " + U.fmt(W.state.tapValue());
    const bm = W.state.buffMult();
    if (bm > 1) {
      const soonest = Math.min(...S.buffs.map((b) => b.until));
      const left = Math.max(0, Math.ceil((soonest - Date.now()) / 1000));
      rateText += " · ×" + (Math.round(bm * 10) / 10) + " " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    }
    els["light-rate"].textContent = rateText;
    // the tab remembers too
    document.title = (S.wispName ? S.wispName + " · " : "") + U.fmt(S.light) + " ✦ WISP";
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

  let buyQty = 1; // 1 | 10 | "max"

  function renderBuildTab() {
    const S = W.state.S;
    const count = buildingVisibleCount();
    visibleBuildings = count;
    shopRows.clear();
    const frag = document.createDocumentFragment();

    // quantity selector
    const seg = document.createElement("div");
    seg.className = "qty-seg";
    for (const q of [1, 10, "max"]) {
      const btn = document.createElement("button");
      btn.className = "qty-btn" + (buyQty === q ? " active" : "");
      btn.textContent = q === "max" ? "×max" : "×" + q;
      btn.addEventListener("click", () => { buyQty = q; renderBuildTab(); });
      seg.appendChild(btn);
    }
    frag.appendChild(seg);

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
        row.addEventListener("click", () => W.game.buyBuilding(b.id, buyQty));
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
      const owned = S.buildings[id] || 0;
      let n = buyQty === "max" ? Math.max(1, W.state.maxAffordable(b)) : buyQty;
      const cost = W.state.buildingCostN(b, n);
      const can = S.light >= cost;
      refs.costEl.textContent = (n > 1 ? n + " for " : "") + U.fmt(cost) + " ✦";
      refs.costEl.classList.toggle("cant", !can);
      refs.row.classList.toggle("unaffordable", !can);
      refs.ownedEl.textContent = owned > 0 ? "×" + owned : "";
      const each = b.rate * W.state.buildingMult(id) * W.state.globalMult();
      refs.rateEl.textContent = "+" + U.fmt(each * n) + "/s";
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
    setTabDot("boosts", anyAffordable);
    const S2 = W.state.S;
    setTabDot("wisp", !!(S2.wishes && S2.wishes.list.some((w) => w.n >= w.target && !w.claimed)));
    updateWishRows();
  }

  /** Keep open wish rows live without a full re-render. */
  function updateWishRows() {
    const S = W.state.S;
    if (!S.wishes) return;
    const page = els["tab-wisp"];
    if (!page.classList.contains("active")) return;
    page.querySelectorAll("[data-wish-row]").forEach((row) => {
      const w = S.wishes.list[parseInt(row.dataset.wishRow, 10)];
      if (!w) return;
      const ready = w.n >= w.target && !w.claimed;
      if (String(ready ? 1 : 0) !== row.dataset.ready) { renderWispTab(); return; }
      const fill = row.querySelector(".wish-fill");
      if (fill) fill.style.width = Math.min(100, (w.n / w.target) * 100) + "%";
      const count = row.querySelector(".wish-count");
      if (count) count.textContent = Math.floor(w.n) + "/" + w.target;
    });
  }

  function setTabDot(tabName, on) {
    const tab = document.querySelector('.tab[data-tab="' + tabName + '"]');
    if (!tab) return;
    const dot = tab.querySelector(".tab-dot");
    if (on && !dot) {
      const el = document.createElement("span");
      el.className = "tab-dot";
      tab.appendChild(el);
    } else if (!on && dot) {
      dot.remove();
    }
  }

  /* ─────────────── wisp tab ─────────────── */

  function renderWispTab() {
    const S = W.state.S;
    const keepScroll = $("tab-content") ? $("tab-content").scrollTop : 0;
    const st = W.state.stageFor(S.level);
    const next = W.state.nextStage(S.level);
    const ageDays = Math.floor((Date.now() - S.born) / 86400000);
    const ageText = ageDays === 0 ? "born today" : ageDays === 1 ? "1 day old" : ageDays + " days old";

    const achHtml = C.ACHIEVEMENTS.map((a) => {
      const has = !!S.achievements[a.id];
      return `<div class="ach ${has ? "unlocked" : ""}" data-ach="${a.id}" title="${has ? a.name + " — " + a.desc : "???"}">${a.glyph}</div>`;
    }).join("");

    // ─ tonight's wishes ─
    let wishesHtml = "";
    if (S.wishes && S.wishes.list.length) {
      const rows = S.wishes.list.map((w, i) => {
        const tpl = C.WISHES.find((x) => x.id === w.id);
        const text = tpl.text.replace("{name}", S.wispName || "your wisp").replace("{count}", tpl.count);
        const pct = Math.min(100, (w.n / w.target) * 100);
        const ready = w.n >= w.target && !w.claimed;
        return `<div class="wish ${w.claimed ? "claimed" : ""}" data-wish-row="${i}" data-ready="${ready ? 1 : 0}">
          <div class="wish-main">
            <div class="wish-text">${w.claimed ? "✔ " : ""}${text}</div>
            <div class="meter" style="margin-top:5px"><div class="wish-fill" style="height:100%;width:${pct}%;border-radius:3px;background:linear-gradient(90deg,#8ea6ff,#b28aff);box-shadow:0 0 8px rgba(140,150,255,0.6)"></div></div>
          </div>
          ${ready
            ? `<button class="btn btn-primary wish-claim" data-wish="${i}" style="padding:8px 14px;font-size:0.78rem">Claim</button>`
            : `<span class="wish-count">${Math.floor(w.n)}/${w.target}</span>`}
        </div>`;
      }).join("");
      wishesHtml =
        `<div class="wisp-card" style="border-color: rgba(140,160,255,0.25)">
          <h3>🌙 Tonight's wishes</h3>
          ${rows}
          <div class="shop-desc" style="margin-top:6px">${S.wishes.allDone
            ? "Every wish came true tonight. The sky is grateful."
            : "Fulfil all three and the sky tips you a stardust ✨"}</div>
        </div>`;
    }

    // ─ bond card ─
    const bond = S.bond;
    const bondNeed = W.state.bondXpForLevel(bond.level);
    const bondPct = Math.min(100, (bond.xp / bondNeed) * 100);
    const bondHtml =
      `<div class="wisp-card">
        <h3>💗 Bond · ${W.state.bondTitle(bond.level)}</h3>
        <div class="stat-line"><span>Bond level</span><b>${bond.level} (+${(bond.level - 1) * Math.round(C.BOND.prodPerLevel * 100)}% light, +${(bond.level - 1) * Math.round(C.BOND.tapPerLevel * 100)}% touch)</b></div>
        <div class="meter" style="margin:8px 0 4px"><div style="height:100%;width:${bondPct}%;border-radius:3px;background:linear-gradient(90deg,#ff9ec4,#ff6f9c);box-shadow:0 0 8px rgba(255,140,180,0.7)"></div></div>
        <div class="shop-desc">Hold ${S.wispName || "your wisp"} gently to pet it. Answer when it calls for you.
        The bond is yours — it carries across every generation.</div>
      </div>`;

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

    // ─ wardrobe ─
    const accHtml = C.ACCESSORIES.map((a) => {
      const unlocked = (() => { try { return a.check(S, { totalBuildings: (s) => W.state.totalBuildings(s) }); } catch (e) { return false; } })();
      const worn = S.accessory === a.id;
      return `<button class="acc ${unlocked ? "unlocked" : ""} ${worn ? "worn" : ""}" data-acc="${a.id}"
        title="${a.name} — ${unlocked ? (worn ? "wearing" : "tap to wear") : a.unlockText}" ${unlocked ? "" : "disabled"}>
        ${unlocked ? a.glyph : "🔒"}</button>`;
    }).join("");
    const wardrobeHtml =
      `<div class="wisp-card">
        <h3>👒 Wardrobe</h3>
        <div class="ach-grid">${accHtml}</div>
        <div class="shop-desc" style="margin-top:8px">Little gifts, earned by loyalty — never bought. Tap one to dress ${S.wispName || "your wisp"}.</div>
      </div>`;

    // ─ the owl's journal ─
    const talesUnlocked = Math.min(S.tales || 0, C.TALES.length);
    let journalHtml = "";
    if (talesUnlocked > 0) {
      const entries = C.TALES.slice(0, talesUnlocked).map((tale, i) =>
        `<div class="tale"><span class="tale-num">${i + 1}</span>${tale}</div>`
      ).join("");
      const remaining = C.TALES.length - talesUnlocked;
      journalHtml =
        `<div class="wisp-card">
          <h3>🦉 The Owl's Tales · ${talesUnlocked}/${C.TALES.length}</h3>
          <div class="tales">${entries}</div>
          <div class="shop-desc" style="margin-top:8px">${remaining > 0
            ? "The owl tells one tale for every day you return. " + remaining + " more wait in its feathers."
            : "You have heard every tale the owl knows. It watches you differently now."}</div>
        </div>`;
    }

    // ─ family of stars ─
    let starsHtml = "";
    if (S.stars.length > 0) {
      const rows = S.stars.map((star, i) =>
        `<div class="stat-line star-row" data-star="${i}" style="cursor:pointer">
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:hsl(${star.hue},95%,78%);box-shadow:0 0 6px hsl(${star.hue},95%,70%);margin-right:6px"></span>${star.name}</span>
          <b>${star.stage} · Lv ${star.level}</b></div>`
      ).join("");
      const constHtml = S.stars.length >= 3
        ? (S.constellation
          ? `<div class="shop-desc" style="margin-top:6px">✨ Together they form <b style="color:var(--gold-soft)">${S.constellation}</b>.</div>`
          : `<button class="btn btn-ghost" id="btn-constellation" style="width:100%;margin-top:8px;font-size:0.82rem">Name your constellation…</button>`)
        : "";
      starsHtml =
        `<div class="wisp-card">
          <h3>Your sky · generation ${S.generation}</h3>
          ${rows}
          <div class="shop-desc" style="margin-top:6px">They're in the sky right now. Tap them to say hi.</div>
          ${constHtml}
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
      ${wishesHtml}
      ${bondHtml}
      ${wardrobeHtml}
      ${ascHtml}
      ${starsHtml}
      ${journalHtml}
      <div class="wisp-card">
        <h3>Memories · ${Object.keys(S.achievements).length}/${C.ACHIEVEMENTS.length}</h3>
        <div class="ach-grid">${achHtml}</div>
        <div class="shop-desc" style="margin-top:8px">Each memory makes ${S.wispName || "your wisp"} glow 1% brighter. Memories survive ascension.</div>
      </div>`;

    const ascBtn = $("btn-ascend");
    if (ascBtn) ascBtn.addEventListener("click", () => W.game.tryAscend());

    els["tab-wisp"].querySelectorAll(".wish-claim").forEach((btn) => {
      btn.addEventListener("click", () => W.game.claimWish(parseInt(btn.dataset.wish, 10)));
    });

    // memories: tap to read (mobile has no hover)
    els["tab-wisp"].querySelectorAll(".ach").forEach((el) => {
      el.addEventListener("click", () => {
        const a = C.ACHIEVEMENTS.find((x) => x.id === el.dataset.ach);
        if (!a) return;
        const has = !!S.achievements[a.id];
        toast(has ? a.glyph + " " + a.name : "🔒 A memory not yet made", has ? a.desc : "Keep going — you'll know it when it happens.");
      });
    });

    // family rows open the same memorial as tapping the sky
    els["tab-wisp"].querySelectorAll(".star-row").forEach((el) => {
      el.addEventListener("click", () => {
        const star = S.stars[parseInt(el.dataset.star, 10)];
        if (star) W.game.starTouched(star);
      });
    });

    $("tab-content").scrollTop = keepScroll;

    const constBtn = $("btn-constellation");
    if (constBtn) {
      constBtn.addEventListener("click", () => {
        const raw = window.prompt("Your stars form a shape only you can see.\nWhat is it called?");
        if (raw === null) return;
        const name = U.sanitizeName(raw, 24);
        if (!name) return;
        S.constellation = name;
        W.state.save();
        W.audio.play("evolve");
        toast("✨ " + name, "Written into the sky, between your stars.");
        bubble("we live under " + name + " now. that's us.", 3800);
        renderWispTab();
      });
    }

    els["tab-wisp"].querySelectorAll(".acc.unlocked").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.acc;
        S.accessory = S.accessory === id ? null : id;
        W.state.save();
        W.audio.play("buy");
        renderWispTab();
      });
    });
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
       <div class="setting-row"><span>Night ambience</span><button class="switch ${S.settings.ambience ? "on" : ""}" id="sw-ambience"></button></div>
       <div class="setting-row"><span>Music box</span><button class="switch ${S.settings.music ? "on" : ""}" id="sw-music"></button></div>
       <div class="setting-row"><span>Particles</span><button class="switch ${S.settings.particles ? "on" : ""}" id="sw-particles"></button></div>
       <div class="setting-row"><span>Playing since</span><b style="font-size:0.85rem">${new Date(S.born).toLocaleDateString()}</b></div>
       <div class="setting-row"><span>Save code</span>
         <span>
           <button class="btn btn-ghost" id="btn-export" style="padding:8px 14px;font-size:0.8rem">Copy</button>
           <button class="btn btn-ghost" id="btn-import" style="padding:8px 14px;font-size:0.8rem">Load</button>
         </span>
       </div>
       <div class="setting-row"><span>Gift code</span>
         <button class="btn btn-ghost" id="btn-gift" style="padding:8px 14px;font-size:0.8rem">${S.flags.supporter ? "💛 supporter" : "Redeem"}</button>
       </div>
       <div class="setting-row"><span>Name</span>
         <span>
           <b style="font-size:0.85rem">${S.wispName || "…"}</b>
           <button class="btn btn-ghost" id="btn-rename" style="padding:8px 14px;font-size:0.8rem;margin-left:8px">Change</button>
         </span>
       </div>
       <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:4px">
         <span style="color:var(--ink-dim);font-size:0.78rem;margin-bottom:2px">Across all lifetimes</span>
         <div class="stat-line"><span>Generations</span><b>${S.generation}</b></div>
         <div class="stat-line"><span>Light, all lives</span><b>${U.fmt(S.allTimeLight + S.totalLight)} ✦</b></div>
         <div class="stat-line"><span>Stardust</span><b>${S.stardust} ✨</b></div>
         <div class="stat-line"><span>Visitors greeted</span><b>${S.visitors || 0}</b></div>
         <div class="stat-line"><span>Dewdrops caught</span><b>${S.counters.dews}</b></div>
         <div class="stat-line"><span>Wishes caught</span><b>${S.counters.comets}</b></div>
         <div class="stat-line"><span>Best streak</span><b>${Math.max(S.counters.bestStreak, S.streak.count)} days</b></div>
         <div class="stat-line"><span>Tales heard</span><b>${Math.min(S.tales || 0, C.TALES.length)}/${C.TALES.length}</b></div>
       </div>`;

    modal("Settings", rowsHtml + `<p class="muted" style="margin-top:12px">WISP saves automatically in this browser. Copy a save code to move ${S.wispName || "your wisp"} to another device — don't leave it behind.</p><p class="muted" style="margin-top:6px">WISP ${W.config.BUILD} · made with zero sprites</p>`, [
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
    $("sw-ambience").addEventListener("click", (e) => {
      S.settings.ambience = !S.settings.ambience;
      W.audio.setAmbience(S.settings.ambience);
      e.target.classList.toggle("on", S.settings.ambience);
    });
    $("sw-music").addEventListener("click", (e) => {
      S.settings.music = !S.settings.music;
      W.audio.setMusic(S.settings.music);
      e.target.classList.toggle("on", S.settings.music);
    });
    $("btn-export").addEventListener("click", exportSave);
    $("btn-import").addEventListener("click", importSave);
    $("btn-rename").addEventListener("click", renameWisp);
    $("btn-gift").addEventListener("click", redeemGift);
  }

  function redeemGift() {
    const S = W.state.S;
    if (S.flags.supporter) {
      toast("💛 Already a supporter", "The meadow remembers your kindness.");
      return;
    }
    const raw = window.prompt("Enter a gift code:");
    if (!raw) return;
    const kind = C.GIFT_CODES[raw.trim().toUpperCase()];
    if (kind === "supporter") {
      S.flags.supporter = true;
      W.state.save();
      closeModal();
      const p = W.scene.wispPos();
      W.particles.burst(p.x, p.y, 50, { speed: 240 });
      W.particles.ring(p.x, p.y, 60, 48);
      W.audio.play("evolve");
      toast("💛 Thank you for supporting the meadow", "Three gifts wait in the Wardrobe.");
      bubble("wait—for me?? for US??", 3500);
      renderWispTab();
    } else {
      toast("Hmm…", "The meadow doesn't recognise that code.");
    }
  }

  function renameWisp() {
    const S = W.state.S;
    const oldName = S.wispName || "your wisp";
    const raw = window.prompt("A new name for " + oldName + "?", S.wispName || "");
    if (raw === null) return;
    const name = U.sanitizeName(raw);
    if (!name || name === S.wispName) return;
    S.wispName = name;
    W.state.save();
    updateCounters();
    renderWispTab();
    bubble(name + "? …" + name + ". okay. I like this one too.", 4200);
    W.audio.play("chirp");
  }

  function encodeSave() {
    W.state.save();
    return btoa(unescape(encodeURIComponent(JSON.stringify(W.state.S))));
  }

  function exportSave() {
    const code = encodeSave();
    const done = () => toast("📋 Save code copied", "Keep it somewhere safe.");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => window.prompt("Copy your save code:", code));
    } else {
      window.prompt("Copy your save code:", code);
    }
  }

  function importSave() {
    const code = window.prompt("Paste a save code:");
    if (!code) return;
    let data = null;
    try {
      data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    } catch (e) { /* fallthrough */ }
    if (!data || typeof data !== "object" || typeof data.totalLight !== "number") {
      modal("Hmm…", "<p>That code doesn't look like a wisp. Nothing was changed.</p>",
        [{ label: "Okay", cls: "btn-ghost" }]);
      return;
    }
    const name = data.wispName || "an unnamed wisp";
    modal(
      "Load this save?",
      `<p>This code holds <b>${name}</b> (level ${data.level || 1}).</p>
       <p class="muted" style="margin-top:8px">Your current wisp here will be replaced.</p>`,
      [
        { label: "Cancel", cls: "btn-ghost" },
        { label: "Welcome home", cls: "btn-primary", fn: () => {
          try { localStorage.setItem(W.config.SAVE_KEY, JSON.stringify(data)); } catch (e) {}
          location.reload();
        } },
      ]
    );
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
