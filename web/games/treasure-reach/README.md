# Treasure Reach 💰

Reach toward the screen to open a treasure chest. The game uses the webcam and on-device hand tracking (MediaPipe Hand Landmarker). Video never leaves the device and is never saved.

## Flow

1. **Camera setup**: the camera panel opens large in the center of the screen and Pip gives instructions from the bottom-left. Setup has three steps:
   1. **Hands**: show both hands to the camera.
   2. **Rest**: hold still for 3 seconds. This records each hand's resting palm size.
   3. **Reach**: make 3 comfortable reaches toward the screen. The goal is the median of the 3 peaks, the same as the Python protocol.
2. **Docking**: the panel shrinks to the bottom-left. Tap the 👁️ to hide it and the **📷 Show camera** pill to bring it back.
3. **Each rep**: the bar on the right fills as the child reaches. The red (left) and blue (right) circles glide from where the hands are toward the chest. Fill the bar to ⭐, hold for 0.3 s (adjustable), and the chest opens with a treasure. Bring the hands back to rest and a new chest appears.
4. **Sets**: after every set of chests (5 by default), a celebration card appears.

**How reach is measured:** a hand reaching toward a front-facing camera looks bigger. Reach is the palm's size compared with its size at rest, and progress is that growth divided by the goal. A grown-up can scale the goal from 50% to 150% of the comfortable reach.

**Re-arming:** a new reach only counts after the hands have come back to rest. This stops a chest opening by accident after a popup closes.

**Mouse mode:** if there's no camera, or for testing, the blue circle follows the pointer. Bringing it to the chest fills the bar.

## Grown-up settings (Menu)

- Camera or mouse, plus **Redo reach setup**.
- Reach goal (% of comfortable reach), hold time (0.3 s, 0.8 s or 1.5 s), either hand or both hands, chests per set (3, 5 or 10).
- **Practice log:** one record per chest, with time to reach, peak (% of goal), palm growth, goal, settings and which hand. Download it as JSON.

## Files

```
index.html       layout, including the inline chest SVG (placeholder art; the lid animates)
css/style.css    styles
js/data.js       treasures, default settings, Pip's lines, saved data
js/calib.js      camera start + hands / rest / reach calibration
js/ui.js         camera panel states, menu, set card, tutorial steps
js/game.js       rep cycle, reach meter, hand circles, coins, main loop
```

Shared modules come from `../../shared/`: `wm-hands.js`, `wm-pip.*`, `wm-sound.js` and `wm-bridge.js`.

## Tuning notes

- `SWAP_HANDEDNESS` in `shared/wm-hands.js` sets the left/right labeling. Flip it if a camera already mirrors its picture and the colors come out swapped.
- The calibration thresholds (`OUT_AT`, `BACK_AT`, `MIN_PEAK`) are at the top of `js/calib.js`.
- To use real treasure art, set `image` on an item in `TR.TREASURES`.
