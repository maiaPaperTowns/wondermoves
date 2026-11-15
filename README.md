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
- **Bubble Lift:** the camera tracks both hands. A bubble sits directly above each resting hand; lifting that hand pops it, and blue pairs need both hands up together (bimanual training).
- **Fossil Brush mirror:** Digger demonstrates a stroke and the camera shows the child's own movement beside it (action observation).
- **Sensor fusion:** the camera confirms what the ToF/IMU detect, which cuts false triggers. The game emits `gesture_uncertain` instead of guessing.
- **Privacy:** process frames in memory only. Never save or stream video, and show a visible "camera on" indicator in the child portal.

### Using 3 kits
- **Board A (main):** Treasure Reach + Fossil Brush, the web portal and Digger.
- **Board B:** Bubble Lift station (camera).
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

| Game | One movement | Approach (evidence level) | Sensor | Status |
|---|---|---|---|---|
| Treasure Reach | Reach forward from rest, then back | Goal-directed training (moderate) | Modulino Distance | ✅ tested on the board |
| Fossil Brush | One back-and-forth stroke; counted on completion, not speed | Action observation (emerging) | Modulino Movement | Stroke counter tested with simulated gyro; game on the board |
| Bubble Lift | Lift the hand straight up; pairs = both hands together | Bimanual training (strong) | Brio camera, on-device pose | Tested on the board with simulated hands; real-camera tracking measured |

Every game follows the same rules: one movement, completion not speed, no timers, and the child's approved range is never exceeded.
Evidence and sources: [docs/evidence-brief.html](docs/evidence-brief.html).

**Thermo** isn't tied to one game: it watches room comfort and suggests breaks. With 3 kits, each game can run on its own board,
so each person can own one station.

See [docs/PLAN.md](docs/PLAN.md) for the build plan and task split, and [docs/HARDWARE.md](docs/HARDWARE.md) for building the physical game stations.

## Board quirks we hit (UNO Q at MadHacks)

- **Wrong clock:** the board boots thinking it's 9 Sep 2025, and UWNet blocks NTP. HTTPS downloads (sketch libraries, pip) then fail with "certificate not valid yet". Fix: join a phone hotspot so NTP works, or set the clock by hand with `adb shell -t "sudo date -u -s '<UTC time>'"`.
- **Sketch build fixes:** see [board/README.md](board/README.md) for TMPDIR, pre-staged library zips and the `Arduino_Modulino` rename.
- **Port 7000 clash:** port 7000 on the Mac is taken by AirPlay Receiver. Forward to 7070: `adb forward tcp:7070 tcp:7000`, then open http://127.0.0.1:7070.
- **Camera device:** `/dev/video0` and `/dev/video1` are the Qualcomm video codec, not cameras. `vision.py` finds the Brio by name. App Lab only passes in cameras that are plugged in when the app starts, so plug the Brio in first, then (re)start the app.
- **Python packages:** the board's Python is 3.13 with OpenCV 4.12 and numpy. MediaPipe isn't installed, so vision uses the OpenCV motion fallback.

## Team

Maia Le (@maiaPaperTowns) · Joy Hong (@schae4999) · Andrew Kim (@Minulion) · @ArneshXCode

## Bubble Lift with the camera on a laptop (dev setup)

While the Brio is plugged into the Mac instead of the board, the Mac does the hand tracking (MediaPipe) and the board runs the game:

```bash
uv venv -p 3.12 --managed-python .venv && uv pip install -p .venv/bin/python opencv-python numpy "mediapipe==0.10.21" "python-socketio[client]"
adb forward tcp:7070 tcp:7000
.venv/bin/python tools/mac_camera.py      # camera 0 = Brio on our Mac (check with --preview; try --camera 1 if you see the built-in camera)
```

macOS must allow camera access for the app that runs it (System Settings → Privacy & Security → Camera).

## Camera / vision quick test (laptop, before the board)

```bash
cd wondermoves/python
python3 test_vision.py                       # detector logic, no camera needed
pip install mediapipe opencv-python numpy    # then, with a webcam:
python3 vision.py --preview                  # green = left hand, orange = right; q quits
```

On the board, `main.py` turns the camera on only during Bubble Lift, and the portal shows a 🔴 badge while it's on.
If MediaPipe won't install on the UNO Q, `vision.py` falls back to OpenCV motion detection on its own. Check the `backend`
and `fps` values in the `hands` messages to see which one is running.

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
