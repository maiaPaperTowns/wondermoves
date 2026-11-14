# Fossil Brush 🦴🖌️

A kid-friendly digging game for the browser. Brush away a pile of sand to uncover a buried treasure. The deeper it's buried, the rarer it is.

## Run it

You don't need to build or install anything. Open `index.html` in a browser.

You can also serve the folder, which is better for tablets on your local network:

```bash
cd fossil-brush
python3 -m http.server 8000   # then visit http://localhost:8000
```

The game works offline. Only the Fredoka font and the confetti effect load from a CDN, and the game still runs without them.

## How it plays

- **Brush:** press and drag on the sand pile. Sand comes off as you swipe back and forth.
- **Depth meter (right):** shows how deep you've dug. It has five bands: Common, Uncommon, Rare, Epic and Legendary. Each treasure is buried inside its own rarity's band, so watching the marker sink past a zone line builds suspense.
- **Menu (top-left):** four dig sites from Easy to Expert. Harder sites use a smaller brush, have hard rocky clumps, and give better odds of rare treasures.
- **Collection (📖):** shows every treasure, grouped by site. Treasures you haven't found appear as silhouettes with their rarity and depth range.
- **Tutorial:** Pip the Dig-Dino explains the game on the first visit. The **?** button starts the tutorial again.

Progress is saved in the browser's `localStorage`. You can wipe it with **Menu → Reset collection**.

## Replacing placeholder assets

| What | Where |
| --- | --- |
| Mascot | `assets/mascot.svg`, or change `FB.MASCOT.image` / `name` in `js/data.js` |
| Brush cursor | `assets/brush.svg` (64×64; keep the bristle tip near the bottom-left corner at 6,58) |
| Treasure art | Each item in `js/data.js` has `image: null`. Set it to a path such as `'assets/items/trex.png'` and the emoji is replaced everywhere. |
| Background | Set `background: 'assets/bg-beach.jpg'` on a level to replace the drawn sky, hills and emoji decorations |
| Colors | `theme` on each level: sky, hills, sand strata (top to deepest), rock and clay bed |
| Sounds | Synthesized in `js/audio.js`; replace with real samples if you like |

## Tuning

These settings are per level, in `js/data.js`:

- `brushRadius`: brush size as a fraction of the pile
- `strength`: how much sand each swipe removes
- `rockiness`: 0–1, how much hard rock is mixed in
- `weights`: odds of each rarity, `[common, uncommon, rare, epic, legendary]`

For a global speed change, edit `BRUSH_K` at the top of `js/digsite.js`.

## Files

```
index.html        page layout
css/style.css     all styling
js/data.js        levels, treasures, rarities, mascot lines  ← edit me
js/store.js       save/load progress
js/audio.js       sound effects
js/digsite.js     sand heightmap, brushing, rendering, particles
js/ui.js          depth meter, menu, collection, found card, tutorial
js/main.js        game loop, input, dig → reveal → collect flow
```
