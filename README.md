# WonderMoves — MadHacks 2026 (Qualcomm / Infer-X track)

Theme: **Let's Dig In.**

A playful physical gaming platform on the **Arduino UNO Q** (Qualcomm QRB2210 Linux side + STM32 MCU)
that helps children aged 6–12 with unilateral cerebral palsy take part in personalised upper-limb
movement activities: reaching, controlled positioning and repeated movement sequences.

> WonderMoves is **not** a medical device and does not replace occupational or physical therapy.
> Reach targets never auto-increase past the range a caregiver or therapist approves.

## Hardware in the kit

| Sensor | Likely part (Arduino Modulino, Qwiic/I2C) | Used for |
|---|---|---|
| Distance | Modulino Distance (VL53L4CD ToF) | Treasure Reach: hand-to-sensor distance |
| Movement | Modulino Movement (LSM6DSOX IMU) | Fossil Brush: brushing gesture on a hand/forearm mount |
| Thermo | Modulino Thermo (HS300x temp/humidity) | Room comfort check: suggests a break if the room is too warm. Not a body or fatigue measurement. |

Confirm the part names on the boxes. **Keep all packaging**, because the lab checks for it when the kits are returned.

## Architecture

```
 Modulino sensors ──I2C── STM32 MCU (sketch/)        ← reads sensors at ~50 Hz, sends raw samples
                              │  RPC Bridge
                              ▼
                   Qualcomm Linux side (python/)      ← calibration, reach/gesture detection (edge inference),
                              │                          game state, session log
                              │  WebUI brick (socket.io)
                              ▼
                   Browser (assets/)                  ← Child Game Portal + Parent Portal, Digger voice/subtitles
```

Digger, the AI companion, receives only structured events: `reach_completed`, `gesture_uncertain`,
`break_requested`, `level_completed`. It explains, celebrates and offers breaks. It never prescribes
distances, diagnoses anything or pushes the child to keep going.

## Games

| Game | Approach | Sensor | Status |
|---|---|---|---|
| Treasure Reach | Goal-directed practice | Distance | **MVP** |
| Fossil Brush | Action observation + execution | IMU | MVP |
| Two-Hand Treasure | Bimanual training | IMU + extra input | Stretch |

See [docs/PLAN.md](docs/PLAN.md) for the build plan and task split.

## Board setup (from the lab's guide)

1. Install **Arduino App Lab** (not Arduino IDE): https://www.arduino.cc/en/software/
2. Connect the UNO Q over a USB-C **data** cable with a 5 V / 3 A supply. Ordinary USB-A hubs often can't power it.
3. Select the board in App Lab, finish the first-time setup and let updates complete.
4. Use the board credentials from the lab's email. They aren't stored in this repo.
5. Skip Wi-Fi if App Lab offers a Skip option. Run the **Blink** example to confirm the board works.
6. Copy `wondermoves/` into App Lab's apps folder (or create a new app and paste in the files), then run it.

Docs: [UNO Q user manual](https://docs.arduino.cc/tutorials/uno-q/user-manual/) ·
[App Lab quickstart](https://docs.arduino.cc/software/app-lab/getting-started/quickstart) ·
[Hardware](https://docs.arduino.cc/hardware/uno-q/)
