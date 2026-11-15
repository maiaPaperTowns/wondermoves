# Bubble Pop 🫧

Under the sea, bubbles float up from the sea floor. Move a glowing hand circle onto a bubble to pop it before time runs out. Hand tracking runs on the device with the webcam; video is never saved or sent anywhere.

## Flow

1. **Camera setup** (same panel and Pip guidance as Treasure Reach):
   1. **Sit:** a body-pose model checks that the head and shoulders are centered at a good distance. Pip gives directions ("move this way", "come closer", "scoot back"). A grown-up can skip this step.
   2. **Hands:** both hands in view. If only one hand shows, "Continue with one hand" appears after 4 seconds.
   3. **Wave:** the child waves their hands as far as is comfortable for about 6 seconds. That area of the camera picture is stretched to fill the whole play area, so a child with a small range of movement can still reach every bubble. "Use my last area" reuses the saved one.
2. **Docking:** the camera panel shrinks to the bottom-left. 👁️ hides it.
3. **Start card:** choose a difficulty (🐢 Easy, 🐠 Medium, 🐬 Hard), then a 3-2-1 countdown.
4. **Session:** 60 seconds by default. The air tank on the right drains as time passes. Bubbles are worth different amounts:
   - Plain bubbles: 1 point.
   - Fish bubbles: 2 points.
   - Star bubbles: 3 points.
5. **Results:** score, best score, bubbles popped and missed, and pops split by left and right hand.

The session clock pauses while the menu, tutorial or calibration is open, or while another WonderMoves tab is showing.

## Difficulty

Set in `BP.DIFFICULTIES` in `js/data.js`:

- `speed`: how fast bubbles rise, as a fraction of the play-area height per second.
- `every`: seconds between new bubbles.
- `size`: bubble size multiplier.

Grown-ups can also change the game length (30, 60 or 90 s) and the bubble size (small, medium or big) in the menu.

## Motion sensors (planned)

`BP.canPop(side)` in `js/game.js` decides whether a touch counts as a pop. Today, with **"Only pop while the hand is moving"** on, it needs camera-measured hand speed above `BP.MOVE_SPEED`. When the hand is moving fast enough, its circle gets a gold ring. Motion-sensor input should plug into this same function, so a bubble only pops when the child actively reaches for it, not when it drifts into a still hand.

## Practice log

The game saves one record per session: difficulty, length, settings, score, popped, spawned, missed, and left/right pops. Download it as JSON from **Menu → For grown-ups**.

## Files

```
index.html       layout: sea scene, top bar, air tank, start/results cards, menu
css/style.css    under-the-sea styles
js/data.js       difficulties, bubble kinds, settings, Pip's lines, saved data
js/calib.js      camera start + sit / hands / wave calibration
js/ui.js         menu, start + results cards, tutorial steps
js/game.js       session loop, bubbles, hand mapping, pop gate, drawing
```

Shared modules come from `../../shared/`: `wm-hands`, `wm-pose`, `wm-campanel`, `wm-pip`, `wm-sound`, `wm-ui` and `wm-bridge`.
