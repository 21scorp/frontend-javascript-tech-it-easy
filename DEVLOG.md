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

## Rounds 8-10 — ~01:00–02:00 CEST · shipped & tested
- Contextual idle voice, seasons (snow/valentine/newyear), wisp dreams
  (assembled from the player's own buildings/stars), evolution
  shockwave rings + longer fanfare, lifetime stats + rename +
  gift-code supporter pack (3 exclusive cosmetics + golden postcard
  frame; code FIRSTLIGHT, honor-system v1), frenzy star-eyes + golden
  wash, "meadow grew" version notice, Tonight's Wishes (3 daily
  mini-goals, all-three → +1 stardust), memorial star modal,
  constellation naming (label drawn in the sky + postcard),
  music box (generative pentatonic lullaby, opt-in), tappable
  memories (mobile), sleepy pet lines, more dreams/achievements.
- FIXED: negative frame dt (rAF timer anomaly) could crash renderer
  via negative arc radius — dt clamped [0,0.1], draw t clamped [0,1].
- Perf: 60fps median on maxed save (perf.js); 10-min soak (soak.js).
- v0.4.0.

## Rounds 11-13 — ~02:00–01:20+ CEST · shipped & tested
- Name sanitization (hostile save-code XSS neutralized, tested),
  season-2 tales (19-30), offline boosts (Pillow of Clouds 75%,
  The Long Dream 16h cap), packaging script (268K zip), live wish
  bars, level-fx throttle (mass level-ups no longer churn DOM — soak:
  64 cycles, 0 errors, 0 leaks, heap 6MB), petal living-moment,
  smoke-fox visitor, tappable owl murmurs, save safety (corrupt stash
  + daily backup rotation + auto-restore with toast). v0.5.0.
- Test suite now 17 scripts (run-all.sh).

## Rounds 14-16 — ~01:20–02:00 CEST · shipped & tested
- Collection layer: dew/comet/best-streak counters, Dewdrop Pendant +
  Comet Ribbon accessories, 5 memories (50 total incl. hidden
  moon-touch), moon is tappable, ground light-pool under the wisp,
  daydreaming gaze, palette caching, Wisp-tab scroll preserved,
  gen-5+ rebirth verses, reduced-motion flash guard, name
  suggestions in the intro placeholder, postcard guardian-line
  truncation, itch.io page copy (docs/ITCH-PAGE.md), README totals.
- Verified: mobile ascension e2e, idle-only pacing (1h21), gen-2
  loop (~70m), pricing math vs brute force, 17/17 suite green.

## Rounds 17-19 — ~02:00–02:15 CEST · shipped & tested → v0.6.0
- Streak shield (miss one night, moon covers once/week), togetherness
  anniversaries (day 7/30/100), drowsy meadow 0-6h, ground light-pool,
  living favicon (stage colour), ?debug=1 panel, animated README GIF
  (Playwright recording + gifenc), stage-coloured HUD tag, panel
  locked during ascension, earn() NaN guard, ascension-ready
  announcement, fmt() unit-tested to 1e36, more flavour lines.
- 18/18 e2e suite green incl. after the UTC midnight rollover.

## Round 20 — ~02:20 CEST
- Sky placement: after confirming ascension you touch the sky to
  choose where the star lives (12s fallback). Boost-tab teaser row,
  release-check.sh, clean-clone verification, veteran save = 4.8KB,
  package.sh excludes marketing assets, combo giggles, ascension GIF.
- 18/18 suite green with the new placement flow.

## Round 21 — ~02:40 CEST · verification wave
- 25-min realistic longplay: fresh player reached Lv 49 Luminous,
  112 buildings, bond 5, 22 memories — 0 errors, DOM 320 nodes,
  heap 7MB (no leaks). Suite now 19 tests, all green.
- Seed variation check (1/999/31337/777777): all generated meadows
  compose well. Balloon visitor added; sky-glow placement hint;
  event spawns paused while placing a star.

## Round 22 — ~03:25 CEST · full-cycle proof
- 35-min organic longplay played the COMPLETE loop untouched:
  fresh intro → named "Eerste" → grew to ascension (~15m) → player
  chose a sky spot → ceremony → rebirth named "Tweede" → gen 2 to
  Lv 63 under Eerste's star. 0 errors, heap 6MB.
- All 11 accessories visually verified (contact sheet).
- docs/BALANCE.md: curves, measured pacing, tuning levers.

## Decisions
- English-only for launch (viral reach); NL translation is a possible
  later pass — all strings live in config.js + ui.js templates.
- Monetization: cosmetics only, gift codes as delivery (itch/Ko-fi).

## Next ideas (priority)
1. More tales past day 18 (season 2 of lore), more visitors.
2. Sprite art pass via scene.js/wisp.js seam.
3. TWA wrapper for Play Store once Pages is live.

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
