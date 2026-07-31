# COVE — sprite guide & AI-art prompt packs

The game renders through one seam (`js/sprites.js`). Every drawable has
a **key**; today each key paints placeholder art, later each key maps to
a region in a sprite atlas. Drop-in, no logic changes.

## Technical rules (put these in EVERY prompt)

```
single game sprite, 3/4 top-down view (ground plane tilted ~35 degrees,
front face visible), isolated on transparent background, PNG,
centered, no ground, no drop shadow, no text, no watermark,
consistent soft lighting from top-left, 1024x1024
```

- Generate **all 5 test subjects with identical style wording** (and the
  same seed if the tool supports it) — consistency matters more than any
  single pretty image.
- Later, real assets get packed into one atlas (2048×2048, power of two)
  — good for mobile WebView performance.

## The 5 test subjects (same across every style)

1. **Villager character** — friendly young shopkeeper, idle pose, facing
   the camera in 3/4 view, simple outfit with apron
2. **Market stall** — small wooden stall with striped awning and a
   counter, 3/4 view
3. **Oak tree** — full tree, slightly stylized round canopy, 3/4 view
4. **Gold ore rock** — grey boulder with visible veins of gold, 3/4 view
5. **Salmon** — single fish as an item/inventory icon, slight 3/4 angle

## Style pack 1 — Hand-painted cozy (Hay Day / Stardew-valley-painterly)

Broadest mass appeal; warm and instantly "farm-game" readable.

```
hand-painted cartoon game art, soft painterly shading, warm saturated
colors, thick rounded shapes, subtle dark outline, cozy farming game
style, gentle highlights, [SUBJECT], + technical rules
```

## Style pack 2 — Soft flat vector (modern mobile, Alto's-Odyssey calm)

Cheapest to keep consistent, razor-sharp on every screen, timeless.

```
flat vector game art, soft gradients, rounded geometric shapes, no
outlines, limited harmonious palette of 6 colors, subtle long shadow,
minimalist but warm, premium mobile game style, [SUBJECT], + technical rules
```

## Style pack 3 — Detailed pixel art (SNES-era, speaks to RuneScape fans)

Says "grind game with depth" to exactly your target audience.

```
detailed 48x48 pixel art game sprite, 16-bit SNES era style, rich
color ramps, selective outlines, crisp pixels, no anti-aliasing,
cozy RPG style like Stardew Valley, [SUBJECT], + technical rules
(render at 1024 but design on a 48px grid)
```

## Style pack 4 — Watercolor storybook (Ghibli-ish, distinctive)

Most distinctive of the five; matches a kindness-first brand. Harder to
keep consistent — judge the 5-sprite set extra critically on that.

```
watercolor storybook illustration game art, soft wet edges, visible
paper texture, muted warm palette, hand-drawn thin ink lines, gentle
whimsical children's book style, [SUBJECT], + technical rules
```

## Style pack 5 — Clay / toy look (3D-rendered softness, very shareable)

Reads as premium and does extremely well in social feeds and store
screenshots.

```
cute claymation style 3D render as game sprite, soft plasticine
material, fingerprint-subtle surface, rounded toy-like proportions,
studio soft lighting, pastel-warm colors, octane render, [SUBJECT],
+ technical rules
```

## How to judge the 5-sprite demos

1. Put the 5 sprites of one style side by side — do they look like one
   world? (This kills most AI sets.)
2. Shrink them to ~15% — still readable? Game sprites live small.
3. Does the character have a face you'd want to see every day?
4. Imagine 40 more assets in this style — will the generator stay
   consistent? (Flat vector and pixel art are safest; watercolor is
   riskiest.)

## Full asset manifest (what we'll eventually need)

Character: idle / walk (4 dirs or mirrored 2) / fishing / chopping /
sleeping · Customers: 6-8 villagers, portrait + standing ·
Environment: stall (3 upgrade tiers), pond, 5 tree types (+ stump),
boarded mine entrance, ground/path/water tiles, props (crates, barrels,
lanterns) · Items (icons): 7 fish, 5 wood types, coins, gift box ·
UI: bubble tail, coin, star, heart. ~45 sprites for v1.
