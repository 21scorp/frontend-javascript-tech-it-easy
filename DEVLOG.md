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

## Round 2 — ~00:00–00:35 CEST · fixes + Ascension
- Playwright test harness in scratchpad (shot.js / ascend.js / daily.js),
  serves on :8477. Fixed: panel-toggle overlap (redesigned to handle
  bar), aurora ghost at count 0, moon crescent clip, squish stacking,
  stage hues now absolute (gold→rose→violet→starlight).
- Ascension shipped & e2e-tested: stardust (+10%/each), sky ceremony,
  rebirth naming, memorial stars are tappable, family card in Wisp tab.

## Round 3 — ~00:35–01:05 CEST · bond, attention, daily
- Bond levels (pet + daily + attention XP), carries across generations.
- Attention moments (dashed ring + hearts, no-punish window).
- Daily gift modal + streak + ×2 buff with HUD countdown. All e2e-tested.

## Next rounds — priority order
1. **Balance sim**: script the first 2 hours of play headlessly; verify
   time-to-first-building < 30s, steady unlock cadence, ascension
   reachable in an evening. Tune costs/rates in config.
2. **More content**: buildings 11-14 (e.g. Star Anvil, Cloud Shepherd,
   Sun Seed…), boosts for them, tap upgrades late-game, achievements.
3. **Juice**: buy ×1/×10/×max toggle, milestone celebrations
   (first K/M/B), combo tap streaks, shooting-star wish (tap a comet).
4. **Star blessings**: past wisps occasionally pulse and drop a gift.
5. **PWA**: manifest + service worker + og: meta tags for sharing.
6. **Mobile pass**: 390×844 viewport test, touch targets, perf.
7. **Share postcard**: canvas snapshot of your meadow + wisp name.
8. Later ideas: weather/seasons, rare visitors, wisp accessories bought
   with stardust (cosmetic, sprite-ready), lore notes from the owl.

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
