# TIDEFALL

A portrait-first idle / tycoon / RPG for mobile browsers. Gather, craft,
fight, sell, and build up your island holding. Ships as an installable
PWA; the same build wraps into native store apps with Capacitor.

**Portrait is a hard constraint.** The game is designed for one thumb:
the manifest locks orientation, the viewport requests a native lock
where the platform allows it, landscape phones get a rotate guard, and
wide desktops render a centred portrait column rather than a stretched
frame. All gameplay is authored in a fixed 1080 x 1920 design space, so
no gameplay code ever sees a device pixel.

## Running it

```bash
npm install
npm run dev        # http://localhost:5180
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run typecheck` | Types only |
| `npm test` | Service-layer test suite |
| `SINGLE=1 npx vite build` | One-file build for sharing |
| `npx tsx src/progression/sim.ts` | Balance simulation — prints hours-to-level |

## Layout

```
src/
  core/         viewport (portrait law), shared contracts
  services/     save, input, audio, haptics, assets, perf
  world/        camera, terrain, resource nodes, day-night, weather
  actors/       character model, paperdoll, animation, actor entity
  progression/  12 skills, xp curve, content tables, balance sim
  ui/           tokens, HUD, bottom nav, sheets, panels
  game/         the orchestrator that wires the systems together
public/assets/  painted art
```

Systems never reach into each other. They talk through the `System`
interface and an event bus defined in `src/core/contracts.ts`, and the
choreography between them lives in `src/game/game.ts` — that is the one
place allowed to know how a tapped tree becomes xp in a skill.

## Progression

Twelve skills, level 1-100, on a softened RuneScape-shaped curve:
`xpForLevel(l) = round(1.8907 * l^2.85) + 140`, 24.1M xp to cap. The
pacing is simulated rather than guessed — first level-up under a minute,
level 10 inside the first session, level 50 around 18-25 hours, level
100 a 130-180 hour goal per skill.

## Art

Textures live in `public/assets/`. Sprites are feet-anchored and
depth-sorted by y. Animation sheets are one horizontal row of square
frames; a per-sheet `mirror` flag handles art authored facing either
way. `paperdollArtManifest()` in `src/actors/paperdoll.ts` emits the
exact file list an artist needs for full layered equipment.
