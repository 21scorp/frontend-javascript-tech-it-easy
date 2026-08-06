# Working on TIDEFALL

Read this first. It is the working agreement, not documentation — the
README explains what the code is, this explains how we build it and
which mistakes have already been paid for.

## What we are making

A portrait-first idle / tycoon / RPG for mobile browsers: gather (fish,
chop, mine), fight, craft, sell, and build up an island holding. It
ships as an installable PWA and later wraps into the App Store and Play
with Capacitor. The full approved brief is in `docs/BRIEF.md`; current
state, stubs and open bugs are in `docs/STATUS.md`. Update STATUS when
you finish something — it is how the next session starts informed.

The quality bar is explicit: it must survive a blind side-by-side
against **Hay Day**, **Clash of Clans** and **AFK Arena**. "Good enough
for a web toy" is not the target.

## Rules that are not negotiable

**Portrait is law.** The game is for one thumb. Orientation is locked in
the manifest, requested natively where the platform allows, and guarded
on landscape phones. Wide desktops get a centred portrait column, never
a stretched frame. Everything is authored in a fixed 1080 x 1920 design
space; no gameplay code ever sees a device pixel.

**Verify by playing, not by asserting.** "It builds" and "tests pass"
prove nothing about a game. Open the built bundle in a real browser,
drive it, and look at the screenshot. `npm run test:smoke` exists
because a blank-world bug shipped past the type-checker, 117 unit tests
and the balance sim — none of which render a frame.

**Report what is actually true.** If something is placeholder, say
placeholder. If a check was skipped, say so. Half the value here comes
from knowing which parts are real.

**Systems stay strangers.** Each system talks through the `System`
interface and the event bus in `src/core/contracts.ts`. When two systems
need to agree on something, the translation goes in `src/game/game.ts` —
that is the only file allowed to know how a tapped tree becomes xp.
Bending one system to match another's vocabulary is how this rots.

## Commands

```bash
npm run dev          # localhost:5180
npm run typecheck    # must be clean before any commit
npm test             # 117 service tests
npm run sim          # balance simulation, prints hours-to-level
npm run build        # production build into dist/
npm run test:smoke   # serves dist/ and PLAYS it in a browser
npm run build:single # one-file build for sharing
```

`PLAYWRIGHT_CHROMIUM=/path/to/chrome` overrides the browser for the
smoke test on machines with a preinstalled one.

## Traps already sprung — do not re-learn these

**Pixi pipes must register before the renderer exists.** PixiJS 8
snapshots `renderer.renderPipes` at `app.init()`. The game is behind a
dynamic import, so in a production build its Pixi classes land in a lazy
chunk that loads too late, and the first frame using one dies on
`validateRenderable` — blank world, intact HTML HUD, and dev looks fine
because vite does not code-split. `src/core/pixi-pipes.ts` holds the
static side-effect imports. **Add a line there whenever the scene starts
using a new renderable** (mesh, text, text-bitmap, sprite-nine-slice,
particle-container) and extend `REQUIRED_PIPES`.

**Cover-clamp the camera.** Zooming out must never reveal a letterbox
bar. The minimum zoom is the level at which the world still covers the
frame. This was shipped wrong once already.

**Sprite handedness is data, not luck.** Some sheets were authored
facing left. Each sheet carries a `mirror` flag, and actors explicitly
face their target when they start an action — otherwise the axe swings
away from the tree whenever you approach from the wrong side.

**Feet-anchored, y-sorted.** Every world sprite anchors at ground
contact and sorts by y. Scale is calibrated off head width, not bounding
box, so a character does not change size between poses.

**Generator art carries padding.** Textures are trimmed to their opaque
bounds at load; animation sheets use one shared frame-local crop (the
union over all frames) so playback never jitters.

## Working method

Big pieces get split across sub-agents, one system each, with strict
file ownership so they never edit the same file. They report their
exported API and I wire the seams myself in `game.ts` — integration is
where the real bugs live, because agents drift on vocabulary.

A separate critical agent judges visual quality: it screenshots each
screen, puts it blind next to a reference game, and picks the better
one. If ours loses it writes a concrete failure list, never "make it
nicer". A screen is done when it wins or draws three rounds running.

## Art

Textures live in `public/assets/`. The user generates art from prompt
packs; ask for a prompt pack rather than inventing filenames. Sheets are
one horizontal row of square frames.
`paperdollArtManifest()` in `src/actors/paperdoll.ts` emits the exact
file list needed for full layered equipment.
