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

## Rounds 4-7 — ~01:00–01:00+ CEST · everything below shipped & tested
- Balance sim (scratchpad/sim.js): 8h arc, no dead zones, ascension
  at ~1h08 active. Buildings 11-14 + 10 boosts + 3 stages extend arc.
- Buy ×1/×10/×max; comet wishes; star blessings; golden dewdrop
  (×7 frenzy / lucky windfall); starfall showers; tap combos.
- PWA (manifest+SW+icons), og: tags, save codes, postcard camera.
- Wardrobe (6 earned accessories), constellation lines, buff stacking.
- Owl's Tales (18, one/day), night ambience (wind+crickets),
  Moon Letters (every 7th streak day, +1 stardust), offline flavor,
  rested buff (12h+ away → ×3), onboarding hints, live tab title,
  keyboard taps, weather (mist/breeze/shimmer), hidden-tab income fix,
  Sun Seed sprouts at 10 stars, visitors (hedgehog/boat/cloud-sheep).
- Version 0.3.0 in settings. GH Pages workflow ready (needs merge to
  main + Pages→GitHub Actions in repo settings).

## Test harness (scratchpad)
`python3 -m http.server 8477` in repo root, then:
node shot.js <name> <intro|game|rich> · fresh.js (first-time mobile) ·
ascend.js · daily.js (gift+letter) · wardrobe.js · visitors.js ·
weather.js · shower.js · share.js (postcard/export/SW) · sim.js [hours]

## Next ideas (priority)
1. Fuller regression run + balance sim after each content batch.
2. NL localization scaffold (strings table in config) — decide later;
   English-first for viral reach.
3. Cosmetic supporter pack hook (monetization: cosmetics only).
4. More tales/voice/visitors; seasonal palettes (real-date holidays).
5. Optional: Google Play wrapper (TWA) once Pages is live.

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
