# WonderMoves

**Turn therapy movements into play for kids with cerebral palsy, with sensors and AI running on an Arduino UNO Q.**

🏆 MadHacks 2026 — Second Place · [Devpost](https://devpost.com/software/wondermoves) · [Live demo](https://maiapapertowns.github.io/wondermoves/)

Children with cerebral palsy (CP) improve hand function through repetition: hundreds of the same movement, practiced
at home, week after week. Home programs are hard to keep up and often feel like homework. WonderMoves turns
therapist-recommended movements into three short games for children aged 6–12, on affordable hardware that processes
camera footage on the board without uploading or storing video.

Unlike typical motion games, WonderMoves adapts to each child's comfortable movement range instead of asking the
child to meet a fixed difficulty.

> WonderMoves is **not** a medical device and does not replace occupational or physical therapy.

## Games

Each game is built around one movement.

| Game | Movement | Tracking |
|---|---|---|
| **Fossil Brush** | Brush in preset patterns to uncover a dinosaur fossil. Pip shows the movement first, then it's the child's turn. | Camera: follows the child's index fingertip |
| **Treasure Reach** | Reach forward and come back. Every completed reach opens a chest with a treasure. | Camera for the first part of the reach, then the Modulino Distance sensor takes over at 200 mm; the chest opens at 100 mm |
| **Bubble Pop** | Bubbles rise from the ocean floor for a set time; the child pops them by moving their hands across the screen. | Camera (Logitech Brio 105, browser or on-device pose) |

Also included:

- **Pip, the AI voice guide.** Everything on screen is also spoken, in one friendly AI-generated voice (recorded once,
  plays offline). Pip celebrates completed actions and offers gentle encouragement. Children can also give voice
  commands ("start", "dig again"), recognised on-device with Whisper. See [docs/PIP_VOICE.md](docs/PIP_VOICE.md).
- **Parent dashboard.** Caregivers see completed movements, play time and trends over time, with short notes
  generated in Databricks. See [parents/README.md](parents/README.md).

### Design rules

- **Completion, not speed.** A slow reach counts exactly like a fast one.
- **No fail states.** No lives, no penalty for mistakes.
- **Never beyond the approved range.** A grown-up calibrates the child's comfortable reach and sets a maximum the
  game never exceeds. Targets never auto-increase past it.
- **Gentle breaks.** After 10 minutes of play (adjustable), Pip suggests a stretch and a drink.

Evidence and sources: [docs/evidence-brief.html](docs/evidence-brief.html).

## Try it

| Where | Link | What works |
|---|---|---|
| **Public demo** | https://maiapapertowns.github.io/wondermoves/ | All three games with the webcam or a mouse. No sensors, play log or parent data (those need the board). |
| **On the board** (USB) | http://localhost:7070/ after `adb forward tcp:7070 tcp:7000` | Everything: sensors, games, play log. |
| Parent page on the board | http://localhost:7070/parents/ | Child profile, game log, chart (parent PIN). |
| Settings on the board | http://localhost:7070/grownups.html?settings | Hand, range, breaks, About your child, Calibrate, sensors. |
| Parent page + Databricks notes (laptop) | http://localhost:8090/ after `python3 parents/server.py` | The same page, plus Databricks notes. |

The public site redeploys automatically from `main` (`.github/workflows/pages.yml`).

## Stack

- **Hardware:** Arduino UNO Q (Qualcomm QRB2210 + STM32U585), Modulino Distance (VL53L4CD ToF), Logitech Brio 105 webcam.
- **On-device vision:** MediaPipe's pose model (ONNX) run with OpenCV DNN on the Qualcomm CPU (~119 ms per frame).
  Frames are processed in memory and never saved or sent. In the browser, the games use MediaPipe Hand Landmarker.
- **Games:** HTML5 canvas games inside one shell (iframes), with a board bridge so the same game works with sensors,
  camera, touch or mouse.
- **Voice:** ElevenLabs recordings for Pip, Whisper (transformers.js) for offline voice commands.
- **Data:** session logs on the board, processed in Databricks for the parent dashboard and trends.

## Architecture

```
 Modulino sensors ──I2C── STM32 MCU (sketch/)        ← reads sensors at ~50 Hz, sends raw samples
                              │  RPC Bridge
                              ▼
 Brio camera ──USB──▶ Qualcomm Linux side (python/)  ← calibration, reach detection, pose tracking,
                              │                         caregiver limits, session log
                              │  WebUI brick (socket.io)
                              ▼
                   Browser (assets/)                  ← game shell, games, Pip, Grown-ups settings, parent page
                              │
                              ▼  (laptop helper, parents/server.py)
                         Databricks                   ← history tables + notes for parents
```

Pip receives only structured events such as `reach_completed`, `break_requested` and `level_completed`. It explains,
celebrates and offers breaks. It never prescribes distances, diagnoses anything or pushes the child to keep going.

## Repo layout

| Path | What's there |
|---|---|
| `wondermoves/` | The Arduino App Lab app: `app.yaml`, `sketch/` (STM32), `python/` (Linux side: `main.py`, `vision.py`, `models/`) |
| `wondermoves/assets/` | Web app: shell (`index.html`, `shell.js`), `games/`, `shared/` (board bridge, camera, Pip, voice), `grownups.html`, `parents/`. See [SHELL-README.md](wondermoves/assets/SHELL-README.md). |
| `parents/` | Laptop helper for the parent page and the Databricks upload |
| `databricks/notebooks/` | `parent_progress.py`, the Databricks notebook that builds history and parent notes |
| `tools/` | `mac_camera.py` (laptop camera → board), `pip_voice.py` (generate Pip's voice lines) |
| `board/` | Sketch build workarounds and pre-downloaded library zips |
| `docs/` | Plan, hardware build guide, Pip voice, evidence brief, Devpost materials |

Each game has its own README: [Fossil Brush](wondermoves/assets/games/fossil-brush/README.md) ·
[Treasure Reach](wondermoves/assets/games/treasure-reach/README.md) ·
[Bubble Pop](wondermoves/assets/games/bubble-pop/README.md).

## Board setup

1. Install **Arduino App Lab** (not Arduino IDE): https://www.arduino.cc/en/software/
2. Power: power brick → USB-C adapter's **PD input** → adapter → UNO Q. Plug the Brio into the adapter's USB port, and a
   monitor into HDMI to run it standalone. Ordinary USB-A hubs often can't power the board.
3. Select the board in App Lab, finish first-time setup and let updates complete.
4. Copy `wondermoves/` into App Lab's apps folder (or create a new app and paste in the files), then run it.
5. On the laptop: `adb forward tcp:7070 tcp:7000` and open http://localhost:7070.

To restart from the command line:

```bash
adb shell 'export TMPDIR=/tmp; arduino-app-cli app restart user:wondermoves'
```

Docs: [UNO Q user manual](https://docs.arduino.cc/tutorials/uno-q/user-manual/) ·
[App Lab quickstart](https://docs.arduino.cc/software/app-lab/getting-started/quickstart) ·
[Hardware](https://docs.arduino.cc/hardware/uno-q/) · Physical game stations: [docs/HARDWARE.md](docs/HARDWARE.md)

### Board quirks

- **Wrong clock:** the board can boot thinking it's 9 Sep 2025, and some networks block NTP. HTTPS downloads then fail
  with "certificate not valid yet". Join a phone hotspot, or set the clock: `adb shell -t "sudo date -u -s '<UTC time>'"`.
- **Sketch build fixes:** see [board/README.md](board/README.md) for TMPDIR, pre-staged library zips and the `Arduino_Modulino` rename.
- **Port 7000 clash:** port 7000 on a Mac is taken by AirPlay Receiver, so forward to 7070 instead.
- **Camera device:** `/dev/video0` and `/dev/video1` are the Qualcomm video codec, not cameras. `vision.py` finds the
  Brio by name. App Lab only passes in cameras plugged in when the app starts, so plug the Brio in first, then (re)start the app.
- **No MediaPipe on the board:** the UNO Q's ARMv8.0 cores (no LSE atomics) can't run MediaPipe's native library, so
  `vision.py` uses the ONNX pose model with OpenCV DNN, and falls back to OpenCV motion detection if that fails.
  Check `backend` and `fps` in the `hands` messages to see which one is running.
- **Distance sensor reads ~27 mm constantly:** peel the protective film off the sensor. The sketch filters
  cover-window crosstalk, and the Grown-ups page shows a hint when it sees this.

## Development

**Vision on a laptop:**

```bash
cd wondermoves/python
python3 test_vision.py                       # detector logic, no camera needed
pip install mediapipe opencv-python numpy    # then, with a webcam:
python3 vision.py --preview                  # q quits; WM_BACKEND=opencv_pose tests the board's backend
```

**Brio on the Mac, game on the board:** the Mac does the hand tracking and sends it to the board.

```bash
uv venv -p 3.12 --managed-python .venv && uv pip install -p .venv/bin/python opencv-python numpy "mediapipe==0.10.21" "python-socketio[client]"
adb forward tcp:7070 tcp:7000
.venv/bin/python tools/mac_camera.py      # check with --preview; try --camera 1 if you see the built-in camera
```

macOS must allow camera access for the app that runs it (System Settings → Privacy & Security → Camera).

**Parent page without a board:** `python3 parents/server.py --demo`, then `python3 parents/simulate_board.py play brush`.

## Next steps

Additional games for lower-body control, and a pilot with an occupational therapist: a small group of children with
unilateral CP using one game at home for several weeks, measured with the Assisting Hand Assessment (AHA) and the
Canadian Occupational Performance Measure (COPM), with research-ethics approval first.

## Team

Maia Le (@maiaPaperTowns) · Joy Hong (@schae4999) · Andrew Kim (@Minulion) · Arnesh Maiti (@ArneshXCode)
