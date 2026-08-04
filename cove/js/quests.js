/* ═══════════════════════════════════════════════════════════════
   COVE — quests.js
   The goal ladder: always exactly one quest, always almost done.
   Authored chain first, then an endless scaling rotation.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const U = W.util;
  const C = W.config;

  let readyToasted = false;

  /** The active quest spec (+ scaled reward for loop quests). */
  function current() {
    const S = W.state.S;
    if (S.quest.idx < C.QUESTS.length) return C.QUESTS[S.quest.idx];
    const li = (S.quest.idx - C.QUESTS.length) % C.QUEST_LOOP.length;
    const lap = Math.floor((S.quest.idx - C.QUESTS.length) / C.QUEST_LOOP.length);
    const q = C.QUEST_LOOP[li];
    return Object.assign({}, q, { r: Math.round(q.r * Math.pow(C.QUEST_LOOP_SCALE, lap)) });
  }

  /** {have, need} progress toward the active quest. */
  function progress() {
    const S = W.state.S;
    const q = current();
    const base = S.quest.start;
    switch (q.t) {
      case "catch": return { have: S.totals.catches - (base.catches || 0), need: q.n };
      case "chop":  return { have: S.totals.chops - (base.chops || 0), need: q.n };
      case "serve": return { have: S.totals.served - (base.served || 0), need: q.n };
      case "earn":  return { have: Math.round(S.totals.earned - (base.earned || 0)), need: q.n };
      case "shiny": return { have: (S.totals.shinies || 0) - (base.shinies || 0), need: q.n };
      case "combo": return { have: S.totals.bestCombo || 0, need: q.n };
      case "level": return { have: S.skills[q.skill].level, need: q.lvl };
      case "tool":  return { have: S.tools[q.which], need: q.idx };
      case "project": return { have: W.state.projectTier(q.id), need: q.tier };
      case "trophy": return { have: S.trophies[q.id] ? 1 : 0, need: 1 };
      default: return { have: 0, need: 1 };
    }
  }

  function ready() {
    const p = progress();
    return p.have >= p.need;
  }

  /** Snapshot counters so count-quests start from zero. */
  function rebase() {
    const S = W.state.S;
    S.quest.start = {
      catches: S.totals.catches, chops: S.totals.chops,
      served: S.totals.served, earned: S.totals.earned,
      shinies: S.totals.shinies || 0,
    };
  }

  function claim() {
    if (!ready()) return false;
    const S = W.state.S;
    const q = current();
    S.coins += q.r;
    S.totals.earned += q.r;
    S.quest.idx++;
    rebase();
    readyToasted = false;
    W.audio.play("level");
    W.particles.confetti(W.actor.x, W.actor.y, 24);
    W.scene.kick(4);
    W.ui.toast("🏅 Quest complete: " + q.d, "+" + U.fmt(q.r) + " coins · next: " + current().d);
    W.state.save();
    return true;
  }

  /** Called from the tick — nudges once when the quest turns ready. */
  function check() {
    if (!readyToasted && ready()) {
      readyToasted = true;
      W.audio.play("bonus");
      W.ui.toast("🏅 " + current().d + " — done!", "Tap the quest banner to claim your reward.");
    }
  }

  W.quests = { current, progress, ready, claim, check, rebase };
})();
