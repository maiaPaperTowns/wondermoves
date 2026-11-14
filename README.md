# WonderMoves — MadHacks 2026 (Qualcomm / Infer-X track)

Theme: **Let's Dig In.**

A playful physical gaming platform on the **Arduino UNO Q** (Qualcomm QRB2210 Linux side + STM32 MCU)
that helps children aged 6–12 with unilateral cerebral palsy take part in personalised upper-limb
movement activities: reaching, controlled positioning and repeated movement sequences.

> WonderMoves is **not** a medical device and does not replace occupational or physical therapy.
> Reach targets never auto-increase past the range a caregiver or therapist approves.

## Hardware we have (confirmed from photos, 3 kits: boards #21, #23, …)

| Item | Part | Used for |
|---|---|---|
| Arduino UNO Q | Qualcomm Dragonwing QRB2210 MPU + STM32U585 MCU, 4 GB RAM, 32 GB eMMC, Wi-Fi/BLE | Runs everything on-device |
| Modulino Distance | ABX00102 (ToF, Qwiic/I2C) | Treasure Reach: hand-to-sensor distance |
| Modulino Movement | ABX00101 (6-axis IMU) | Fossil Brush: brushing gesture on a hand/forearm mount |
| Modulino Thermo | ABX00103 (temp + humidity) | Room comfort check: suggests a break when the room is warm. Not a body or fatigue measurement. |
| Logitech Brio 105 | 1080p USB webcam | On-device hand/pose vision (see below) |
| StarTech USB-C multiport adapter | 100 W PD, 4K60 HDMI, GbE, USB 5 Gbps | Powers the UNO Q and connects the camera, monitor, keyboard and mouse |
| Power brick + braided USB-C cable | — | Feed the 100 W PD port of the adapter, then connect the adapter to the board |

**Keep all packaging**, including the anti-static bags and the boxes with the numbers written on them. The lab checks for it when the kits are returned.

### Why the camera matters (Qualcomm edge-AI story)
The QRB2210 can run a small hand/pose model on the Brio feed locally. Nothing leaves the board.
- **Two-Hand Treasure is no longer a stretch.** The camera checks that both hands are in frame and that one is holding still while the other moves. This solves the "one distance sensor can't verify both hands" problem.
- **Fossil Brush mirror:** Digger demonstrates a stroke and the camera shows the child's own movement beside it (action observation).
- **Sensor fusion:** the camera confirms what the ToF/IMU detect, which cuts false triggers. The game emits `gesture_uncertain` instead of guessing.
- **Privacy:** process frames in memory only. Never save or stream video, and show a visible "camera on" indicator in the child portal.

### Using 3 kits
- **Board A (main):** Treasure Reach + Fossil Brush, the web portal and Digger.
- **Board B:** Two-Hand Treasure station (camera + second Movement sensor on the stabilising hand).
- **Board C:** spare / dev board, so teammates can develop in parallel and a dead board doesn't kill the demo.

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
| Two-Hand Treasure | Bimanual training | Camera (both hands) + IMU | MVP if the vision model runs, otherwise stretch |

See [docs/PLAN.md](docs/PLAN.md) for the build plan and task split.

## Board setup (from the lab's guide)

1. Install **Arduino App Lab** (not Arduino IDE): https://www.arduino.cc/en/software/
2. Power: power brick → StarTech adapter's **PD input** → adapter → UNO Q. Plug the Brio into the adapter's USB port and a monitor into HDMI if you want to run it standalone. Ordinary USB-A hubs often can't power the board.
3. Select the board in App Lab, finish the first-time setup and let updates complete.
4. Use the board credentials from the lab's email. They aren't stored in this repo.
5. Skip Wi-Fi if App Lab offers a Skip option. Run the **Blink** example to confirm the board works.
6. Copy `wondermoves/` into App Lab's apps folder (or create a new app and paste in the files), then run it.

Docs: [UNO Q user manual](https://docs.arduino.cc/tutorials/uno-q/user-manual/) ·
[App Lab quickstart](https://docs.arduino.cc/software/app-lab/getting-started/quickstart) ·
[Hardware](https://docs.arduino.cc/hardware/uno-q/)
