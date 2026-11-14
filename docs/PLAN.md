# Build plan

## Milestones

1. **Board alive.** App Lab installed, Blink runs, and each Modulino prints readings on its own.
2. **Sensor pipeline.** The sketch streams `distance_mm`, accelerometer/gyro and temperature to Python over the Bridge.
3. **Calibration.** Record the baseline distance while the child rests (e.g. 300 mm). The child then makes a small voluntary reach 3–5 times. The comfortable range is the median of those reaches. The caregiver sets an approved maximum.
4. **Treasure Reach (MVP).** A reach counts when distance ≤ baseline − target and is held for ≥ 300 ms, followed by a return to baseline ± tolerance. Each valid reach removes one soil layer.
5. **Fossil Brush.** Digger demonstrates a stroke. A brush stroke is detected from IMU motion energy plus direction. Start with a threshold detector; if time allows, swap in a small on-device classifier, which is the Qualcomm edge-inference story.
6. **Portals.** Child portal: big Start/Pause buttons, no countdown, subtitles. Parent portal: sessions, attempts, calibrated ranges and time played. No scores, no diagnosis, no comparisons with other children.
7. **Digger voice.** Browser speechSynthesis reading templated lines driven by game events, with optional mic input on the laptop.
8. **Demo polish.** Pitch deck and 2-minute demo video.

## Levels (illustrative, capped at the approved range)

| Level | Target | Reward |
|---|---|---|
| 1. First Dig | 5 cm | Coin |
| 2. Hidden Gems | 7 cm | Gemstone |
| 3. Fossil Hunt | 10 cm | Fossil |
| 4. Deep Explorer | 12 cm | Cave |
| 5. Treasure Master | Individualised | Treasure chest |

A level whose target is above `approved_max_mm` stays locked. A child with a 2 cm range plays every level at 2 cm.

## Suggested split (3 people)

- **Hardware/MCU:** wiring, `sketch/`, sensor sanity checks, mounts.
- **Edge logic:** `python/`, calibration, reach/brush detection, optional classifier, session log.
- **Frontend/voice:** `assets/`, game art and animation, Digger lines, parent portal.

## Open questions

- Exact Modulino part numbers and library versions in the kit.
- Is the Two-Hand Treasure extra input a button, or a second IMU?
- Which track and judging criteria apply ("Qualcomm Infer-X"?)
