/* ═══════════════════════════════════════════════════════════════
   COVE — actor.js
   Your one character: walking, working, being watched fondly.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const C = W.config;

  const a = {
    x: C.WORLD.home.x,
    y: C.WORLD.home.y,
    target: null,
    onArrive: null,
    speed: 240,
    state: "idle",    // idle | walk | fish | chop
    flip: false,
    t: 0,
  };

  function walkTo(x, y, then) {
    a.target = { x, y };
    a.onArrive = then || null;
    a.state = "walk";
    a.flip = x < a.x;
  }

  function update(dt) {
    a.t += dt;
    if (a.target) {
      const dx = a.target.x - a.x;
      const dy = a.target.y - a.y;
      const d = Math.hypot(dx, dy);
      const step = a.speed * dt;
      if (d <= step) {
        a.x = a.target.x;
        a.y = a.target.y;
        a.target = null;
        a.state = "idle";
        const cb = a.onArrive;
        a.onArrive = null;
        if (cb) cb();
      } else {
        a.x += (dx / d) * step;
        a.y += (dy / d) * step;
        a.flip = dx < 0;
      }
    }
  }

  function draw(ctx, t) {
    W.sprites.drawChar(ctx, a.x, a.y, { t, state: a.state, flip: a.flip });
  }

  function hitTest(wx, wy) {
    return Math.hypot(wx - a.x, wy - (a.y - 50)) < 70;
  }

  W.actor = {
    walkTo, update, draw, hitTest,
    setState(s) { a.state = s; },
    face(tx) { a.flip = tx < a.x; },   // look at what you work on
    get x() { return a.x; },
    get y() { return a.y; },
    get state() { return a.state; },
    get flip() { return a.flip; },
  };
})();
