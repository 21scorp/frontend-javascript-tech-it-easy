# COVE — Expansion design: "The Cove Grows"

Design for the next four updates. Combines the two agreed directions:
**money builds the cove** (visible, permanent, emotional) and **active
peak moments** (boss fish, mine runs) inside the idle rhythm. All
numbers are first-pass and tunable; systems and hooks are the decision.

Design pillars, in priority order:
1. Money must have a purpose you can *see* — every project changes the
   world on screen.
2. Active content is short, tense, one-thumb, and always opt-in; the
   idle loop never requires it.
3. Everything hooks into what already exists (skills, items, customers,
   the boarded mine, the tip/affinity systems).
4. Cozy stays cozy: tension comes from stakes and timing, never from
   combat or losing your stash.

---

## System 1 — The Building Board

A new **Build** tab (panel next to Bag/Gear/Friends). Each project costs
**coins + materials** — finally a second use for logs and later ores, so
"sell it or build with it" becomes a real choice. Bigger projects also
take build time (hours, idle-friendly, finishes offline).

Projects and effects:

### Ferry dock (3 tiers) — more of the game's lifeblood: customers
| Tier | Cost (draft) | Effect | Visible change |
|---|---|---|---|
| 1 Repair the planks | 2,000c + 40 oak | queue +1 slot, unlocks 9th customer (Jip, a traveler) | broken planks → whole dock |
| 2 Mooring posts | 15,000c + 60 birch + 30 maple | order value +15%, spawns 10% faster, 10th customer (Lena, a chef) | posts, rope, lanterns |
| 3 The ferry returns | 80,000c + 40 yew + 20 elder | weekly **Ferry Day**: a wave of 5 customers with premium orders | ferry boat moored at the dock |

### The mine (gateway to System 3)
| Stage | Cost (draft) | Effect |
|---|---|---|
| Clear the entrance | 5,000c + 50 oak | **Mining skill unlocks** (1–100), surface veins tappable like fishing/chopping |
| Shore up the shaft | 25,000c + 40 maple + 20 silver ore | **Mine Runs** unlock (the push-your-luck expeditions) |
| Light the depths | 120,000c + 30 elder + 10 gold ore | run depth 5→8, opens the path to The Rumble (mine boss) |

Ores: bronze (lvl 1), silver (lvl 30), gold (lvl 55), starmetal (lvl 80,
boss-gated). Silver+ tools now cost coins **+ ores**, tying mining into
the existing gear ladder.

### Your house (3 tiers) — the offline/comfort track
| Tier | Cost (draft) | Effect |
|---|---|---|
| 1 Tent → cabin | 4,000c + 30 oak | offline cap +2h, "rested": first 5 min after returning = 1.5× action speed |
| 2 Cabin → cottage | 30,000c + 50 birch + 30 maple | offline cap +4h, rested 2× |
| 3 Garden & chimney | 150,000c + 40 yew + 20 elder | offline cap +8h, rested 10 min |

### Decorations — pure cosmetic, pure bond
Lanterns, flower boxes, path stones, bunting, a bench, and **a cat that
comes to live at your stall**. Fixed placement spots around the world;
each bought piece stays forever. No stat effects at all — this keeps the
future IAP decor sets honest (never pay-to-win). Draft prices 500c–25,000c.

---

## System 2 — The Deep Water (boss fish, active minigame)

The "dungeon" of a fishing game is the water you can't reach yet.

**Unlock:** Fishing 15 + project "Row boat" (3,500c + 25 oak).

**Prep (the grind hook):** each attempt costs special bait crafted from
your own catch, e.g. Glimmer Bait = 5 herring + 2 sardine. A failed
attempt costs the bait — real stakes, no stash loss.

**The duel (one thumb, 60–90 seconds):**
- Two bars: **line tension** and **fish stamina**.
- Hold = reel: stamina drops, tension rises. Release = slack: tension
  falls, fish recovers slightly.
- The fish switches phases with clear telegraphs:
  - **Dive** (tension spikes → release!),
  - **Jump** (tap exactly on the "!" cue — same reflex the player
    already knows from bites),
  - **Calm** (reel hard now).
- Tension maxed → line snaps, bait lost. Stamina emptied → caught,
  big splash cinematic.

**The bosses (escalating tiers):**
| Boss | Fishing lvl | Signature |
|---|---|---|
| De Oude Koi | 15 | gentle intro boss, long calm phases |
| Zilverrug the Pike | 35 | fast dives |
| De Fluisterval | 55 | fake telegraphs |
| Maanvin | 75 | only at night (real-world evening) |
| De Kraken van de Cove | 95 | multi-stage, the end boss of fishing |

**Rewards:** one-time big coins/xp; a **mounted trophy at the stall**
(customers comment on it via their toast lines); and one small permanent
perk per boss (Koi: fish sell +5%; Pike: rare-fish chance +; etc.).
Weekly re-catch for coins keeps them alive.

Art cost: one big sprite + one trophy sprite per boss; the minigame
itself is bars/FX on the existing water.

---

## System 3 — Mine Runs (push-your-luck, active minigame)

**A run:** descend level by level (max 5, later 8). Per level: 3 ore
veins, each a **tap-timing arc** (moving pin — green center = full ore,
yellow = partial, miss = a *crack*). After each level the question:
**"Descend — richer veins, one more crack risk — or leave with your
haul?"** Three cracks → collapse → lose *half the run's haul* (never
your stash, never your gear). Deeper = rarer ores + geode bonus chests.

**Pacing gate:** one free run per ~4h (the lantern refills) — it's an
appointment peak, not a replacement loop. (Lantern refill is also a
clean, fair IAP later.)

**At the bottom (depth 8, Mining 80+):** *The Rumble* — the thing that
makes the "SOON" sign shake. Mine boss fight = the vein-timing game
under pressure (falling rocks to dodge-tap, shrinking green zones).
Reward: starmetal access, unique trophy, the cove's biggest one-time
payout.

---

## Economy glue

- **Materials matter:** wood/fish/ore are now sales stock *and*
  construction stock. This single change gives every order a real
  opportunity cost and makes Trading feel strategic.
- **Sink sizing:** projects are priced at roughly 15–30 minutes of
  active earning (early tiers) up to multi-day idle earning (tier 3s) —
  same curve philosophy as the softened skill grind.
- **New faces:** dock tiers add customers 9 and 10 (2 new sprites) —
  more queue pressure to match the player's growing output.
- **Save compatibility:** all new state lives in new keys with defaults;
  existing saves upgrade in place.

---

## Build order (recommendation)

| Fase | Content | Why first |
|---|---|---|
| **1. Bouwen** | Build tab, dock T1–2, house T1–2, 3 decorations + the cat | Money gets a purpose *immediately*; no new minigame code; biggest bang for effort |
| **2. De Diepe Zee** | Row boat, duel minigame, bosses 1–2, trophies | First active peak; reuses fishing fantasy; small art bill |
| **3. De Mijn** | Clear entrance, Mining skill, surface veins, Mine Runs (depth 5), bronze→gold, ore-cost tools | The big mid-game update |
| **4. De Bodem** | Depth 8, The Rumble, starmetal, bosses 3–5, Ferry Day, decor IAP groundwork | End-game + monetization layer |

### New art per fase (keys, so prompts can follow the existing packs)
- **F1:** `dock_1..3`, `house_1..3`, `deco_lantern`, `deco_flowers`,
  `deco_path`, `deco_bench`, `cat` (+idle anim), `cust_jip`, `cust_lena`
- **F2:** `boat`, `boss_koi`, `boss_pike` (+ `trophy_*`), bait icons
- **F3:** `mine_open`, cave backdrop, `ore_bronze/silver/gold`, vein +
  crack FX, `item_ore_*`
- **F4:** `boss_rumble`, `boss_whisper`, `boss_moonfin`, `boss_kraken`,
  `ore_star`, ferry sprite

Each fase ships alone, is save-compatible, and leaves the game better
even if the next fase never came — same rule the base game was built on.
