# WISP — devlog

Working notes for the overnight build session (30→31 July 2026).
This file doubles as my memory between work rounds — read it first.

## Session goal
Empty repo → build a one-tab game that is addictive, beautiful without
sprites (sprite-ready later), monetizable/viral-capable, emotionally
engaging ("never done"). Work non-stop until 09:00 NL time (07:00 UTC).

## Round 1 — ~23:40–00:40 CEST · core game
- Emptied repo, built WISP from scratch: full core loop
  (tap → build → level → evolve), 10 buildings all rendered in-world,
  15 boosts, 23 achievements (+1% each), offline progress (60%, 8h cap),
  intro + naming ceremony, wisp with eyes/blink/pet/squish, voice lines,
  time-of-day sky, synthesized audio, autosave.

## Next rounds — priority order
1. **Test & fix**: serve locally, Playwright screenshots, console errors,
   balance sanity pass (first 10 minutes must feel great).
2. **Prestige — "Ascension"**: wisp becomes a permanent named star in
   the sky; stardust currency; new wisp inherits multiplier. THE
   emotional hook. Constellation view of all past wisps.
3. **Bond system**: petting builds bond XP → bond levels → multiplier +
   new voice lines. "Wants attention" moments (heart bubble, bonus).
4. **Daily gift + streak.**
5. **More content**: buildings 11-14, boosts, achievements; balance curve
   for hours 2-10.
6. **Juice pass**: milestone celebrations, combo tapping, buy ×10/×max.
7. **PWA manifest + meta tags (og:) for shareability.**
8. **Polish pass on visuals**: better hills, vignette, shooting-star
   wish mechanic (click a comet = bonus).

## Conventions
- All balance/content in js/config.js — logic never hardcodes numbers.
- Renderer (scene.js/wisp.js) is the only place that draws — sprite
  swap later must only touch these.
- No dependencies, no build step, ever. One tab.
- Save key: wisp.save.v1 — bump + migrate in state.load() on breaking
  changes.

## Watch-outs
- `roundRect` needs modern browser (fine for target audience).
- Time-of-day palettes: "day" palette intentionally still twilight-ish
  so the glow aesthetic holds; check it doesn't look muddy.
- Firefly wander speed may be too slow — check on screenshot.
