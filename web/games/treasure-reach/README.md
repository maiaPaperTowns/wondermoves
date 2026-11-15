# Treasure Reach 💰

Reach toward the screen to open a treasure chest. The game uses the webcam and on-device hand tracking (MediaPipe Hand Landmarker). Video never leaves the device and is never saved.

## Flow

1. **Camera setup:** uses the computer's front camera. The hands rest on the table in front of the screen, so they appear near the bottom of the picture with fingers pointing down toward the camera. The camera panel opens large in the center of the screen and Pip gives instructions from the bottom-left. Setup has three steps:
   1. **Hands:** both hands flat on the table, inside the red and blue (upside-down) hand outlines at the top of the picture. The rest of the picture is room to reach; moving the laptop back gives even more.
   2. **Rest:** hold still for 3 seconds. This records each hand's resting position. If the hands rest too low in the picture, Pip asks the child to move the laptop back or sit back.
   3. **Reach:** make 3 comfortable reaches toward the camera, keeping the hands on the table and sliding them forward.
2. **Docking:** the panel shrinks to the bottom-left. Tap the 👁️ to hide it and the **📷 Show camera** pill to bring it back.
3. **Level:** pick a level with the chip in the top bar, or from the Menu. Each level sets how far to reach (a share of the child's comfortable reach, capped at 110%) and how long to hold:

   | Level | Reach goal | Hold |
   | --- | --- | --- |
   | 🐢 Easy | 60% | 0.3 s |
   | 🦀 Medium | 80% | 0.8 s |
   | 🦈 Hard | 100% | 1.5 s |

4. **Each rep:** the bar on the right fills as the child reaches. The red (left) and blue (right) circles glide toward the chest. Fill the bar to ⭐ and hold, and the chest opens with a treasure. Bring the hands back to rest and a new chest appears.
5. **Sets:** after every set of chests (5 by default), a celebration card appears.

**How reach is measured:** each hand is described by its position in the picture and its palm size. Seen from above, a reach moves the hand across the picture; seen from the front, it makes the hand look bigger. Calibration learns the child's own reach direction from the 3 reaches, and the goal is the median comfortable reach. Progress is how far the hand has moved along that direction. This works for either camera position. The hand-outline positions are set in `GUIDE` at the top of `js/calib.js`; adjust them for your camera mount.

**Reaching out of view:** a front camera can lose hands that reach all the way to the computer, because they slide off the bottom of the picture. A hand that was already at least halfway to the goal and leaves through the bottom edge counts as reaching the goal for up to 2.5 seconds. That's enough time for the hold, and the chest can open. Tune this with `OUT_OF_VIEW` in `js/game.js`.

**Re-arming:** a new reach only counts after the hands have come back to rest. This stops a chest opening by accident after a popup closes.

**Mouse mode:** if there's no camera, or for testing, the blue circle follows the pointer. Bringing it to the chest fills the bar.

## Treasure collection

There are 12 treasures across 5 rarities, from Common to Legendary. Which rarity comes out of a chest depends on the level (`weights` in `TR.DIFFICULTIES`, in `js/data.js`):

| Level | Rare or better | Legendary |
| --- | --- | --- |
| 🐢 Easy | 10% | never |
| 🦀 Medium | 28% | 2% |
| 🦈 Hard | 48% | 10% |

The game gently favors treasures the child hasn't found yet. The 📖 Collection button shows every treasure. Unfound ones appear as silhouettes with their rarity and the levels where they can appear. Tap a found treasure to read a fun fact.

## Grown-up settings (Menu)

- Camera or mouse, plus **Redo reach setup**.
- Either hand or both hands, and chests per set (3, 5 or 10). Reach goal and hold time come from the level.
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

- `SWAP_HANDEDNESS` in `shared/wm-hands.js` is off, which matches a real webcam. Turn it on only if a camera mirrors its own picture and the colors come out swapped.
- The calibration thresholds (`OUT_AT`, `BACK_AT`, `MIN_PEAK`) are at the top of `js/calib.js`.
- To use real treasure art, set `image` on an item in `TR.TREASURES`.
