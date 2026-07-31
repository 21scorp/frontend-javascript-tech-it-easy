# Drop your art here

Save each sprite as a transparent PNG named exactly after its key
(see `cove/SPRITES.md` for the full manifest and prompt packs):

```
char_idle.png  char_fish.png  char_chop.png
stall.png      mine.png
tree_oak.png   tree_birch.png tree_maple.png tree_yew.png tree_elder.png
cust_fien.png  cust_bram.png  cust_saar.png  cust_milo.png
cust_vera.png  cust_ted.png   cust_noor.png  cust_kas.png
item_sardine.png item_herring.png item_trout.png item_salmon.png
item_tuna.png    item_sword.png   item_koi.png
item_oak.png     item_birch.png   item_maple.png item_yew.png item_elder.png
```

Animation sheets (see `cove/PROMPTS-ANIM.md`) use the same names with
an `_anim` suffix — e.g. `char_chop_anim.png`, `cust_fien_anim.png`,
`stall_anim.png`. One horizontal row of **square** frames; the game
auto-detects the frame count and plays the loop. When a sheet exists
it wins over the static PNG.

Rules:
- transparent background, feet/base touching the bottom edge
- any resolution (500–1000 px wide is plenty); the game scales it
- a missing file is fine — the built-in placeholder is used instead
- sheet frames must be square, or the frame count is detected wrong
