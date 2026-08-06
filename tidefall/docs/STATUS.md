# TIDEFALL — where things stand

Keep this current. It is the first thing a new session reads after
`CLAUDE.md`, and it is how work resumes without re-deriving everything.

_Last updated: after the first playable build and the production
render-pipe fix._

## Built and verified

| Area | State | How it was verified |
|---|---|---|
| Portrait lock | Done | Checked at 390x844 (full bleed), 844x390 (guard shown, canvas hidden), 1600x900 (0.75 column) |
| World | Done | 1080x4200 strip, zones mountain → forest → meadow/base → coast → wilds; painted ground with invisible joins at max zoom; day/night and weather; 37 resource nodes |
| Camera | Done | Cover-clamped: requesting zoom 0.02 clamps to 1.0, so no letterbox is reachable |
| Skills & progression | Done | 12 skills, 96 content entries, curve `round(1.8907*l^2.85)+140`; `npm run sim` proves the pacing, 17 self-checks |
| Services | Done | Saves with migrations, checksums, backup recovery; unified input; audio synth; haptics; assets; perf degrade. 117 tests |
| Character | Partial | Appearance model, paperdoll pipeline, 8-state animation, feet anchoring and facing all verified |
| UI | Partial | HUD, bottom nav, draggable sheets, 5 panels, toasts, level-up, dialogs — all screenshot-verified at 390x844 and 430x932 |
| Gather loop | Done | Tap a tree → walk → chop → xp, coins, loot, stump. Covered by `npm run test:smoke` |

## Placeholder or stubbed — do not mistake for finished

- **Equipment art.** The paperdoll falls back to full-character sheets
  plus tinting and crude procedural overlay pieces. Gear "works" but
  looks like geometry. `paperdollArtManifest()` lists the 196 files a
  full layered set needs; the owner has an open choice between trimming
  the option catalogue for v1 or generating the lot.
- **Ore rocks** are procedurally baked placeholders, not painted art.
- **Panels show sample data.** Bag, Base, Shop and Character render
  convincing placeholders. They have clean props interfaces; nothing
  feeds them real game state yet.
- **Audio is a synth.** Real files have never existed. The manifest in
  `src/services/audio.ts` lists 10 music stems and 23 SFX to deliver.
- **The app icon** is functional, not AAA.

## Not started

Mining, combat, Slayer, crafting and the production skills exist as
*data and progression* but are not wired to the world. Base building,
selling, the economy, quests, dailies, seasons, prestige and
monetisation are all still ahead. There is no backend, by design.

## Known issues

1. **Reward floats land below the character instead of above it.** The
   world→frame pixel conversion in `game.ts` (`toFramePx`) is off.
   Cosmetic, visible on every gather.
2. **The forest band reads darker and muddier than the meadow below it**,
   and the mountain rocks overlap the forest edge awkwardly.
3. **The character carries an orange tint** from the placeholder
   paperdoll tinting.
4. **The UI is CSS, not painted.** Its own agent's honest read: this
   reads as very good mobile UI rather than illustrated. The highest
   leverage upgrade is 9-slice PNG frames for sheets, cards and buttons.
   Icons are the weakest layer; the empty bag reads as a void.
5. **Sheet physics were tuned by reasoning, not on hardware.** The
   momentum, rubber-band and spring constants in `src/ui/sheet.ts` want
   one pass on a real device.

## Next steps, in the order I would take them

1. **Run the critical visual QA agent.** Blind side-by-side against Hay
   Day / Clash of Clans / AFK Arena, one concrete failure list per
   screen. Issues 1–4 above are the known starting points.
2. **Feed the panels real data.** Bag showing actual loot, Skills
   showing actual levels, the Character creator actually mounting the
   paperdoll preview. This turns a demo into a game.
3. **Wire mining and the remaining gathering** into the world.
4. **Then** new systems: combat, base building, the economy.

Resist adding content before 1 and 2. More content on an unconvincing
loop just makes a larger unconvincing loop.
