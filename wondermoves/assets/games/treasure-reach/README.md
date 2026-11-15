# Treasure Reach 💰

Reach toward the screen to open a treasure chest. The game uses the webcam and on-device hand tracking (MediaPipe Hand Landmarker). Video never leaves the device and is never saved.

## Flow

1. **Camera setup.** The laptop's front camera is tilted down at the hands on the table. The camera panel opens large in the center of the screen, and Pip gives instructions from the bottom-left. There are three steps:
   1. **Max forward:** press both hands against the laptop, then tilt the screen down until the tops of the hands (the wrists) just show at the bottom of the picture, on the dashed red line. The game records where each wrist sits; this is "max forward". On the UNO Q it also records the Distance sensor's reading there.
   2. **Make space:** push the laptop forward until there's room to stretch comfortably, then tap **Next**. The camera moves with the laptop, so "max forward" (hands touching the laptop) stays valid.
   3. **Start spot:** pull the hands back to a natural starting position and keep still. The game records where each wrist sits; this is "start".

   **↩ Use my last setup** skips straight to play.
2. **Docking:** the panel shrinks to the bottom-left. 👁️ hides it.
3. **Level:** pick Easy, Medium or Hard with the chip in the top bar.
4. **Each rep:** push both hands toward the laptop. The chest opens when both conditions below hold for the level's hold time. Then pull the hands back to the start spot, and a new chest appears.
5. **Sets:** after every set of chests (5 by default), a celebration card appears.

## When does the chest open?

Two conditions must hold together:

**(a) Far enough.**
- **On the UNO Q:** the progress comes in two parts.
  - **Camera:** moving the wrists toward max forward fills the bar, and moves the circles, only up to 70% (`switchAt`). A gap always stays between the circles and the chest; camera movement alone can't close it.
  - **Sensor:** once the Distance sensor reads **100 mm** (`handoffMm`), it takes over. Going from 100 mm to **50 mm** (`openMm`) fills the last 30% and brings the circles to the chest. The chest opens at 50 mm or closer, held for the level's hold time (Easy 0.3 s, Medium 0.8 s, Hard 1.5 s).
- **Camera only (no board):** both wrists must be 60% (Easy), 80% (Medium) or 100% (Hard) of the way from the start spot to max forward.

**(b) Both hands pushing.** The tops of both hands must stay in the camera picture, at about the same point between the start spot and max forward. The default tolerance is a quarter of the way. This matters because the sensor only measures the closest object, so one hand alone could otherwise open the chest.

If the hands are uneven, Pip says "Push with both hands together!". If a hand leaves the picture, Pip says "Keep the tops of both hands in the picture".

**The red and blue circles** don't show where the hands are on camera. They sit on the horizon beside the chest and slide toward it as the reach progresses:
- **Camera first:** the wrists moving toward max forward fill the first 70%, and no more.
- **Sensor after that:** from 100 mm to 50 mm, the sensor fills the rest.

The bar on the right only reaches the top when the chest can really open.

**Re-arming:** a new reach only counts after the hands have been back near the start spot.

**Mouse mode:** the blue circle follows the pointer. Bringing it to the chest fills the bar.

All the sensor numbers (`handoffMm`, `openMm`, `switchAt`) are in `TR.SENSE` in `js/data.js`, so they're easy to tune on the real kit.

## Treasure collection

There are 12 treasures across 5 rarities, from Common to Legendary. Which rarity comes out of a chest depends on the level (`weights` in `TR.DIFFICULTIES`, in `js/data.js`):

| Level | Rare or better | Legendary |
| --- | --- | --- |
| 🐢 Easy | 10% | never |
| 🦀 Medium | 28% | 2% |
| 🦈 Hard | 48% | 10% |

The game gently favors treasures the child hasn't found yet. The 📖 Collection button shows every treasure. Unfound ones appear as silhouettes with their rarity and the levels where they can appear. Tap a found treasure to read a fun fact.

## Grown-up settings (Menu)

- Camera or mouse. **Redo camera setup** appears under it in Camera mode.
- Chests per set (3, 5 or 10). Reach goal and hold time come from the level. Both hands are always required.
- **Practice log:** one record per chest, with time to reach, peak, how far the wrists got (share of start → max forward), closest sensor reading and goal in mm (board), level and hold time. Download it as JSON.

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
- Setup thresholds (where the wrists must sit at max forward, how still to hold, the minimum travel between start and max forward) are at the top of `js/calib.js`.
- To use real treasure art, set `image` on an item in `TR.TREASURES`.
