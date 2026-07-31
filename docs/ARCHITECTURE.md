# Architecture — how WISP is put together

Ten plain-script modules on one global namespace `W`, loaded in
dependency order from `index.html`. No build step, no modules, no
dependencies — the game must always run from `file://` and any static
host.

## Load order & responsibilities

| Module | Owns | Never does |
|---|---|---|
| `util.js` | formatting, math helpers, seeded RNG, name sanitizing | DOM, state |
| `config.js` | **every** number and content table | logic |
| `audio.js` | WebAudio synth: sfx, ambience, music box | state, DOM |
| `state.js` | the save (`W.state.S`), persistence + backups, derived math (rates, costs, multipliers, ascension) | DOM, canvas, timers |
| `particles.js` | one pooled particle system (dot/heart/ring) | game rules |
| `scene.js` | the world: sky, hills, buildings, weather, seasons, visitors, dew, memorial stars; hit-tests for tappable things | state mutation (except visual agents) |
| `wisp.js` | the creature: face states, springs, gaze, accessories; hit-test | economy |
| `ui.js` | HUD, tabs/shop, toasts/floaters/bubble, modals, postcard, favicon | tick logic |
| `game.js` | the tick: earning, levels, events (attention/dew/shower/blessing/visitor/wishes/daily), achievements, ascension flow | rendering |
| `main.js` | boot, ceremonies (intro/rebirth), input routing, rAF loop, PWA, debug panel | game rules |

## Data flow

- **One state object** (`W.state.S`), saved to localStorage every 10s,
  on hide, and after meaningful moments. `state.load()` merges onto
  `defaultState()` so old saves gain new fields; corrupt saves are
  stashed and yesterday's automatic backup is restored.
- **Render loop** (`main.js frame`): `game.tick(dt)` → `scene.draw(t, dt)`
  (which draws wisp + particles) → throttled UI updates (150ms).
  `dt` is clamped to `[0, 0.1]` — timer anomalies must never go negative.
- **Input routing** (`main.js pointerup`), in priority order: pet-release
  → pending-ascension sky pick → dewdrop → visitor → owl → moon → wisp
  tap → memorial star → comet → ambient sparkle.
- **Hidden tabs**: rAF sleeps, so on `visibilitychange` back to visible
  the elapsed passive income is paid out; full offline (page closed) is
  computed from `lastSeen` on boot at the offline rate/cap.

## Conventions

- Balance/content changes belong in `config.js` only.
- Everything visual goes through `scene.js`/`wisp.js` (see
  `assets/SPRITE-GUIDE.md` for the future art pass).
- Player-typed names are sanitized at entry AND on load (imported save
  codes are untrusted).
- Events never punish: expiry is silent or gently melancholy.
- Bump `C.BUILD` on releases; `sw.js` VERSION on structural changes.
- `scripts/release-check.sh` before shipping; the e2e suite lives in
  the dev scratchpad (see DEVLOG "Test harness").
