# COVE — world & extras prompt pack (Style 1: hand-painted cozy)

Same style as always. One image here matters more than everything
else combined: **the painted island background**. It replaces the
flat code-drawn ground and the game draws every sprite on top of it.

## THE big one — `bg_island.png` (the whole ground, no objects!)

Portrait, roughly 2:3 (e.g. 1024×1536). NOT transparent — a full
painted image. Crucial: it's ONLY terrain. No trees, no buildings,
no people, no animals, no boats — the game places those.

```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, subtle dark outline, cozy farming game style, gentle highlights, a top-down 3/4 view game background map of a small green island cove, layout exactly as follows: a band of grey-brown rocky cliffs across the top tenth of the image, below it a big warm green grass meadow with soft texture, tiny flowers and small pebbles, an oval blue pond with sandy banks on the middle-left of the meadow about one third of the image wide, a winding sandy path from the top-center of the meadow down to the bottom-center, a light sandy beach strip along the bottom edge of the meadow, and calm turquoise sea just visible at the very bottom edge, the right half of the meadow is open grass, ONLY terrain: no trees, no buildings, no people, no animals, no objects, no text, no watermark, consistent soft lighting from top-left, portrait orientation, 1024x1536
```

Save as `cove/assets/sprites/bg_island.png` — the game detects it and
switches off the code-drawn ground automatically. I'll fine-tune the
pond/path positions in the game config to match the painting.

## Small optional set (placeholders exist, so no hurry)

### `supply_boat.png` — the daily gift boat
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a small wooden supply sailboat with a single cream sail and a few crates on deck, seen from the side, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```

### `cust_jip.png` — new customer (arrives with the repaired dock)
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a curious young traveler man with a purple hoodie and a backwards cap, carrying a small backpack, standing, facing the camera, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```

### `cust_lena.png` — new customer (dock tier 2)
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a confident chef woman in a rose-pink apron and a matching headscarf, holding a small notebook, standing, facing the camera, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```

Their idle sheets (optional, 4 frames like the others):
`cust_jip_anim.png` / `cust_lena_anim.png` — reuse the customer anim
prompt from PROMPTS-ANIM.md with the descriptions above.

## Later batch (only when you feel like it — placeholders look fine)

Painted versions of the built world, exact filenames the game
already watches for: `dock_1.png dock_2.png dock_3.png`,
`house_1.png house_2.png house_3.png`, `boat.png` (row boat),
`deco_lantern.png deco_flowers.png deco_bench.png`, `cat.png`,
`trophy_koi.png trophy_pike.png`. Prompts on request — the pattern
is always: style block + subject + the standard technical block.
