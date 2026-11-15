# Fossil Brush 🦴🖌️

A kid-friendly digging game for the browser. Brush away a pile of sand to uncover a buried treasure. The deeper it's buried, the rarer it is.

## Run it

You don't need to build or install anything. Open `index.html` in a browser. It also runs inside the WonderMoves shell (`web/index.html`), as the Fossil Brush tab.

You can also serve the folder, which is better for tablets on your local network:

```bash
cd web/games/fossil-brush
python3 -m http.server 8000   # then visit http://localhost:8000
```

The game works offline. Only the Fredoka font, the confetti effect and the hand-tracking runtime load from a CDN, and the game still runs without them.

## Hand tracking (webcam)

The game can follow your index fingertip through the webcam, so a child can play without touching the screen. It runs entirely in the browser with [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js), through the shared tracker `../../shared/wm-hands.js` (camera mode in `js/camera.js`). You don't need a separate server, and video frames never leave the page.

- The model lives in `../../shared/models/hand_landmarker.task` (bundled so it works offline; the CDN copy is the fallback). The WebAssembly runtime loads from jsDelivr (`@mediapipe/tasks-vision@0.10.14`).
- Serve the folder over `http://localhost` (see above). Browsers block the camera and the model download on `file://`. Browsers also only allow the camera on a secure origin, so a tablet that opens the game through your LAN IP needs HTTPS.
- If a Logitech/Brio camera is plugged in, the game uses it. Otherwise it uses the default camera.
- If the camera is denied or unavailable, the preview hides and touch and mouse keep working.

## Modes

### ✏️ Copy Pip (default): guided motor-skill practice

1. Each dig rolls a treasure using the dig site's odds. Its rarity sets the shape sequence:

   | Rarity | Sequence |
   | --- | --- |
   | Common | 2 straight lines |
   | Uncommon | 3 lines and arcs |
   | Rare | 3 curvy shapes (waves, zigzags) |
   | Epic | 4 shapes (circle, square, triangle, snake) |
   | Legendary | 5 shapes (spiral, figure-8, heart, star) |

   There is no menu to pick from: harder dig sites simply roll rare treasures more often.
2. Pip's brush draws a shape on the sand pile.
3. The child traces it by following a glowing dot along a soft lane. Each finished shape digs one layer deeper, and the last one reveals the treasure.

Accessibility choices, aimed at children with cerebral palsy and other motor difficulties:

- No timers and no fail states.
- Progress is kept if the finger lifts. Going back over an already-traced part never counts as a mistake.
- The lane shows how much wobble is allowed. Grown-ups can set its width to Gentle, Normal or Precise.
- If the child makes no progress for about 9 seconds, Pip demonstrates the shape again. The **👀 Show me** button replays it at any time.
- Each stroke is logged on the device with its shape, tier, time, accuracy and off-path fraction. Grown-ups can download the log as JSON from **Menu → For grown-ups**.

Shapes and tiers live at the top of `js/trace.js`. A shape is a list of points in a -1..1 box, so adding new ones is easy.

### 📷 Camera play (prototype)

**Menu → Camera** switches from touch and mouse to the webcam. The camera looks down at the table, and setup has two steps:

1. **Point:** the child points with one finger inside the outline.
2. **Circle:** the child draws a big circle on the table. That area is mapped onto the sand pile.

During play the fingertip moves the brush. Pointing (only the index finger out) means the brush is touching the sand; an open hand or a fist lifts it. This rule lives in `FB.Cam.finger()` in `js/camera.js`, ready to be replaced by a real touch sensor.

### 🖌️ Free Play

The original mode: brush the sand freely, and treasure rarity is random according to each site's odds.

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
js/trace.js       Copy Pip: shapes, tiers, path following, practice log
js/camera.js      camera play: table-view setup + pointer-finger brush
js/ui.js          depth meter, menu, challenge picker, collection, found card, tutorial
js/main.js        game loop, input, webcam hand tracking, dig → reveal → collect flow
models/           MediaPipe hand landmarker model
```

## Playing with the WonderMoves board

When the UNO Q app serves this page (portal → 🖌 Fossil Brush, or `http://<board>:7000/fossil-brush/index.html`),
`js/sensor.js` connects to the board and brushes with the **Modulino Movement** sensor. Put the sensor in a chunky brush
handle or wrist strap and brush back and forth: faster strokes sweep faster. Touch or mouse still works too.
Opened standalone, the sensor bridge stays off.

- `MIN_ENERGY` / `FULL_ENERGY` in `js/sensor.js` set how much motion counts (°/s from the gyro, ~1 at rest).
- The only change to the game itself is `FB.site = …` in `js/main.js`, which exposes the dig site to the bridge.

## Playing with the WonderMoves board

When the UNO Q app serves this page, `js/sensor.js` connects through `../../shared/wm-board.js` and brushes with the
**Modulino Movement** sensor (in a chunky brush handle or a wrist cuff). The board counts **completed back-and-forth
strokes** (`python/strokes.py`), the same at any speed, and each stroke plays one fixed sweep of sand in Free Play.
Touch, mouse and the camera modes still work. Opened standalone, the board bridge stays off.
