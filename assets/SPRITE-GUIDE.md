# Sprite guide — swapping procedural art for drawn art

Everything visual is procedural today, but the renderer was built so an
art pass can land without touching game logic. This is the map.

## Ground rules

- **Only two files draw the world**: `js/scene.js` (meadow, sky,
  buildings, visitors, events) and `js/wisp.js` (the creature and its
  accessories). Game logic never draws; UI is HTML/CSS.
- Every draw function receives everything it needs (position, count,
  time `t` for animation phase). Replace the body of a draw function
  with an image blit and nothing else changes.
- Keep the **glow layers** (the `glow()` radial-gradient calls) even
  when sprites land — the glow under a sprite is what makes the scene
  cohesive. Sprites should be drawn *on top of* their glow.
- The night palette shifts with the player's clock (`paletteNow()`),
  so sprites should be drawn slightly desaturated and let the glow
  carry colour, or provide a night-tinted set.

## Where each thing is drawn

| Thing | Function in scene.js | Anchor | Notes |
|---|---|---|---|
| Fireflies | `drawFireflies` | centre | wandering agents; ~2px core + glow |
| Glowshrooms | `drawGlowshrooms` | base on front hill | seeded positions, per-shroom `scale` |
| Lantern string | `drawLanterns` | rope between two posts | lanterns sway with `windFactor()` |
| Moonflowers | `drawMoonflowers` | stem base on mid hill | petals pulse open/closed |
| Beacon | `drawBeacon` | base at `xn=0.72` | height scales with count; beam above |
| Ember owls | `drawOwls` | post top at `OWL_SPOTS` | blink; tappable (`owlHit`) |
| Aurora | `drawAurora` | full-width bands | keep as procedural ribbons |
| Fallen stars | `drawFallenStars` | resting on back hill | breathing scale |
| Moon well | `drawMoonwell` | `xn=0.3` front hill | shimmer lines animate |
| Comets | `drawComets` | head + fading trail | tappable (`cometHit`) |
| Star anvil | `drawAnvil` | `xn=0.86` front hill | clink cycle every 2.2s |
| Cloud shepherd | `drawShepherdClouds` | drifting sky blobs | starlight rain below |
| Moon garden | `drawMoonGarden` | tulips on the moon's rim | hue per tulip |
| Sun seed | `drawSunSeed` | `xn=0.12` front hill | glowing crack; sprout at 10 stars |
| Visitors | `drawVisitor` | `visitorScreenPos()` | hedgehog / boat / cloud-sheep / smoke-fox |
| Golden dewdrop | `drawDew` | `dewScreenPos()` | tappable (`dewHit`) |
| Petal moment | `drawPetalMoment` | flower → wisp path | arrives at the wisp |
| Memorial stars | `drawMemorialStars` | normalized sky positions | hue = ascended wisp's final hue |

## The wisp (js/wisp.js)

- `draw()` composes: rays → outer glow → body → face → accessory,
  all inside one translated/scaled context (squish applies to
  everything). A sprite wisp should keep this order.
- Stage data (`config.js STAGES`) gives radius/hue/motes/rays per
  evolution stage — a sprite set needs one body per stage (13) or a
  tintable base.
- Faces are states: normal (blinking, gaze via `gazeTarget`), happy
  (arc eyes), sleepy (0-6am), frenzied (star eyes). Sprite sheets
  should cover these four.
- `drawAccessory(ctx, id, r, t)` draws in wisp-local space: origin at
  the centre, `r` = body radius. Nine accessory ids today.

## Sizing

Everything scales from `min(viewportWidth, viewportHeight)`; the wisp
radius is `stage.radius × clamp(min/700, 0.75, 1.4)`. Author sprites
at 2× the base sizes listed in config for crispness on retina.
