# Balance notes — how WISP's economy is tuned

All numbers live in `js/config.js`. This file explains the shape they
make together, with measured pacing from the headless simulator
(`sim.js` in the dev scratchpad — an active player tapping ~2/s who
buys greedily by best payback).

## Core curves

| Curve | Formula | Feel it creates |
|---|---|---|
| Building cost | `base × 1.15^owned` | classic incremental ramp; each copy ~15% pricier |
| Building tiers | cost ×~7, rate ×~5 per tier | new tier ≈ always worth saving for |
| Level XP | `60 × 1.42^(level−1)`, XP = light earned | levels rain early, slow to a drip late |
| Level bonus | +4% production each | levels always matter a little |
| Memories | +1% production each (50) | collection = permanent power |
| Bond | +2% light / +5% touch per level | petting is never wasted |
| Stardust | `floor(sqrt(lifetime / 5e7))` each +10% | prestige grows ~linearly per equal effort |
| Tap | `1 × upgrades × global`, combo up to ×2, crit 3% ×10 | tapping is emotional, not mandatory |

## Measured pacing (v0.6.0)

**Active player (2 taps/s):**
- First building ~10s; first boost ~3m; no buy-gap ever exceeds ~1m
- Stage evolutions land at 1m / 5m / 11m / 22m / 37m / 58m of play
- **Ascension reachable at ~1h08** — one cozy evening = one full arc
- All 14 buildings by ~5h30; content keeps landing through hour 8

**Idle player (taps only in the first 2 minutes):**
- Ascension at ~1h21 — tapping is optional by design

**Generation 2 (+2 stardust):**
- Beats its previous stardust total at ~70m — each loop feels similar
  in length but bigger in numbers

**Daily drip (not in sims):** gift ≈ 30 production-minutes + ×2 for
10m; 3 wishes ≈ 60 production-minutes + 1 stardust; weekly Moon Letter
+1 stardust; events (dew/comets/blessings/visitors) ≈ 5–15 bonus
minutes each. Generous, because kindness is the retention engine.

## Tuning levers (safe to touch)

- Ascension too early/late → `PRESTIGE.divisor` (5e7). Doubling it
  pushes the first ascension roughly √2 later.
- Prestige power → `PRESTIGE.perStardust` (0.10). This compounds with
  daily wish/letter stardust — watch generation-10+ growth if raising.
- Idle generosity → `OFFLINE.rate/capHours` and the two offline boosts.
- Early pace → first three buildings' `baseCost`; keep firefly ≤ 20
  so the first purchase lands inside the first minute.
- Session length → event gaps (`DEW`, `ATTENTION`, shower timer in
  game.js): shorter gaps = stickier sessions, but respect quiet.

## Invariants the release check enforces

`scripts/release-check.sh` fails if building costs/rates or stage
levels ever stop increasing monotonically, if any id is duplicated,
or if an achievement check throws on a fresh save.
