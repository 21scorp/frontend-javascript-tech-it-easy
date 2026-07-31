# COVE — animation & variant pack (Style 1: hand-painted cozy)

This builds **on top of** `PROMPTS.md` (the 30 base sprites). Same style,
same rules — plus animation sheets now that your tool can do frames.

How the game reads a sheet:
- One PNG, **one horizontal row of square frames**, left to right.
- Frame count is auto-detected from the image ratio — so keep every
  frame square (e.g. 6 frames of 512×512 → total 3072×512).
- Save as the exact filename shown, drop it in `cove/assets/sprites/`.
- If the sheet exists, the game plays it automatically at the right
  speed. If not, it falls back to the static PNG, then the placeholder.
- If you make the animated sheet, you don't need the static version of
  that sprite in-game anymore (still handy for store/promo images).

Consistency: generate these with the **same seed / style reference** as
your base set, in the same session if possible.

Suggested order (biggest visual win first):
1. The 4 character sheets  2. The stall  3. The 8 customers  4. The stumps

---

## Character animation sheets (same person as the base set — identical wording)

### `char_idle_anim.png` — 6 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a friendly young shopkeeper with short chestnut-brown hair, warm smile, cream shirt with rolled-up sleeves, olive green trousers, brown leather apron, relaxed idle animation: breathing gently, a small weight shift, one slow blink, standing upright facing the camera, sprite sheet animation, one horizontal row of 6 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 3072x512
```

### `char_walk_anim.png` — 8 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a friendly young shopkeeper with short chestnut-brown hair, warm smile, cream shirt with rolled-up sleeves, olive green trousers, brown leather apron, walk cycle animation, walking towards the right, seen from the side, full stride with relaxed arm swing, sprite sheet animation, one horizontal row of 8 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 4096x512
```

### `char_fish_anim.png` — 6 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a friendly young shopkeeper with short chestnut-brown hair, warm smile, cream shirt with rolled-up sleeves, olive green trousers, brown leather apron, fishing animation, seen from the side, holding a simple wooden fishing rod out in front, the rod tip and fishing line bob gently up and down, sprite sheet animation, one horizontal row of 6 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 3072x512
```

### `char_chop_anim.png` — 8 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a friendly young shopkeeper with short chestnut-brown hair, warm smile, cream shirt with rolled-up sleeves, olive green trousers, brown leather apron, woodcutting animation, seen from the side, raising a small axe over the shoulder and swinging it forward into a chop, then lifting it back up, sprite sheet animation, one horizontal row of 8 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 4096x512
```

## Stall

### `stall_anim.png` — 6 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a small wooden market stall with a warm red and cream striped fabric awning, wooden counter with a few small crates on it, cozy and inviting, only the striped fabric awning flutters gently in a light breeze, everything else stays perfectly still, sprite sheet animation, one horizontal row of 6 square frames arranged left to right, the stall stays at exactly the same position and scale in every frame, only the fabric moves between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 3072x512
```

## Customers — subtle idle loops (4 frames each)

### `cust_fien_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a cheerful villager woman in a pink dress and a straw hat, carrying a small basket, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

### `cust_bram_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a sturdy villager handyman in blue work clothes and a knitted beanie, wearing a tool belt, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

### `cust_saar_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a sweet young villager girl in a warm yellow dress with a flower in her hair, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

### `cust_milo_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a playful villager boy in a green t-shirt and a backwards cap, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

### `cust_vera_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, an elegant villager artist woman in a purple coat and a beret, holding a paintbrush, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

### `cust_ted_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a friendly older villager innkeeper man with a grey beard and an orange-brown vest, no hat, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

### `cust_noor_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a smart villager merchant woman in a teal dress with a matching headscarf, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

### `cust_kas_anim.png` — 4 frames
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a laid-back villager boat builder man in yellow-green overalls and a straw hat, standing, facing the camera, subtle idle animation: shifting weight slightly from one foot to the other and blinking, sprite sheet animation, one horizontal row of 4 square frames arranged left to right, the character stays at exactly the same position and scale in every frame, only the moving parts change between frames, the last frame flows seamlessly back into the first frame (perfect loop), 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, each frame 512x512, total image 2048x512
```

## Tree stumps (static state variants — shown while a tree regrows)

### `tree_oak_stump.png`
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a low freshly cut oak tree stump with warm brown bark and pale growth rings on top, a couple of wood chips beside it, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```

### `tree_birch_stump.png`
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a low freshly cut birch tree stump with white papery bark with dark markings and pale growth rings on top, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```

### `tree_maple_stump.png`
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a low freshly cut maple tree stump with reddish-brown bark and growth rings on top, a few fallen orange-red leaves beside it, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```

### `tree_yew_stump.png`
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a low freshly cut ancient yew tree stump with dark greenish-brown gnarled bark and growth rings on top, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```

### `tree_elder_stump.png`
```
hand-painted cartoon game art, soft painterly shading, warm saturated colors, thick rounded shapes, subtle dark outline, cozy farming game style, gentle highlights, a low freshly cut elder tree stump with dark silvery bark, growth rings on top and a faint magical shimmer, single game sprite, 3/4 top-down view (ground plane tilted about 35 degrees, front face visible), isolated on transparent background, PNG, centered, no ground, no drop shadow, no text, no watermark, consistent soft lighting from top-left, 1024x1024
```
