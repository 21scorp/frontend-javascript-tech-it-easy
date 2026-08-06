# TIDEFALL — the approved brief

This is the brief the owner read and approved before a line was written.
It is the source of intent: when a decision is unclear, this outranks
convenience. Anything that contradicts it needs the owner's agreement,
not a developer's judgement call.

---

## Goal

Build an **AAA-quality mobile-first idle / tycoon / RPG** as an
installable PWA, which later goes unchanged to the App Store and Google
Play via Capacitor. The player makes their own character, gathers by
**fishing, woodcutting, mining and killing monsters**, turns those
resources into usable items, sells them for **coins, materials and
items**, and uses the proceeds to build a **base** that visibly grows on
screen.

Visual bar: Hay Day. Progression bar: RuneScape's skill curve, softened
to modern mobile pacing. Every tap should feel good, every session
should have one goal nearly finished, and every day should give a reason
to come back.

## Mandatory content

**World.** One island with zones you unlock: coast (fishing), forest
(woodcutting), mountain (mining), wilds (monsters), and your base in the
middle. A camera that follows, zooms and pans. Day/night, weather,
dynamic light, and a world that lives while you do nothing.

**Character.** A full creator: build, skin, face, hair, colour, outfit.
Equipment is **visible** on the character through layered paperdoll
sprites. What you wear, you see.

**Twelve skills, level 1–100, softened RuneScape curve.**
Gathering: Fishing, Woodcutting, Mining, Foraging.
Production: Smithing, Cooking, Crafting, Alchemy.
Combat: Combat (melee/ranged/magic styles), Slayer.
Support: Construction, Trading.
Every skill unlocks tiers, recipes, tools and zones — never just a
number going up.

**Combat and Slayer.** Auto-battle that runs idle, with active abilities
you tap at the right moment for markedly more. Telegraphed monster
attacks, loot tables with rare drops, and bosses that need preparation.
Slayer contracts give targets and rare rewards.

**Base building (the tycoon layer).** A grid you place and upgrade
buildings on: forge, kitchen, workshop, storage, harbour, mine shaft,
training yard, house. Buildings produce while you are away and visibly
change per tier. Companions and workers get assigned to tasks — that is
the idle engine.

**Economy.** Coins, resources, items and a premium currency. Selling via
your stall, contracts, and prices that move with Trading. Materials are
both stock and building supply, so every sale is a decision.

**Meta and retention.** Daily and weekly quests, login streak, seasons
with a free and a paid track, events, achievements, a collection album,
and a prestige system ("Voyage") that resets skills for permanent
multipliers.

**Monetisation, fairly.** Gems, cosmetics, season pass, extra worker
slots, offline time. **Never raw power for money.**

**Polish, non-negotiable.** 60 fps on mid-range phones with device-tier
scaling, cold start under 5 seconds, portrait-first with safe areas and
thumb-reachable controls, haptics, layered sound that shifts per zone,
cinematic transitions, particles and screen shake on impact, and a
loading screen that looks expensive.

## Method

Split the work across sub-agents, each owning one part. A separate
critical agent checks visual quality: it screenshots every screen, puts
it **blind** side-by-side against **Hay Day**, **Clash of Clans** or
**AFK Arena**, judges composition, colour, legibility at thumb size,
hierarchy, edge and shadow craft, and whether animation lives. If ours
loses it writes a concrete failure list — never "make it nicer" — and it
goes back to the responsible agent. A screen is finished when it wins or
draws three rounds in a row.

## Technology

PixiJS v8 (WebGL2/WebGPU) + TypeScript + Vite + vite-plugin-pwa, with
DOM/CSS for menu UI and Pixi for the world. Howler for audio. IndexedDB
behind an abstraction that can take cloud save later. Capacitor for the
native shells. Playwright as the visual QA harness. No backend in phase
one — the loop has to prove itself first.

Keep looping: build, test, compare visually, improve, per part, until
the critical agent stops rejecting screens.

## What the owner accepted alongside this

1. **A Pixi rebuild.** Canvas 2D hits a wall at this volume of sprites,
   light and particles, so the earlier prototype's code is reference,
   not foundation.
2. **This is large.** Twelve skills, combat, base building, a creator
   and seasons is a multiple of the prototype. It arrives in phases,
   each one playable.
3. **A lot of art is still to come.** Monsters, buildings per tier,
   equipment, UI frames. Claude writes the prompt packs; the owner
   generates the art.
4. **"AAA" here means the visual and polish bar of top-grossing mobile
   free-to-play** — Hay Day-level finish — not the content volume of a
   200-person studio. That is the definition the critical agent judges
   against.

## Later additions the owner asked for

- **Portrait only.** The game is played vertically, never horizontally.
- The game gets its own private repository, separate from any earlier
  coursework, and deploys automatically so every build is playable on a
  phone without manual packaging.
