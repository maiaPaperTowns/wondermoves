# WonderMoves · MadHacks 2026 · Databricks track

**Therapy movements turned into play for children with cerebral palsy, with Databricks turning every session into progress that parents, caregivers and therapists can see.**

Children with cerebral palsy (CP) improve their arm and hand use through practice: the same movement, many times, at home, week after week. But home programmes are hard to keep up. The exercises feel like homework, and nobody can see what happened between therapy visits.

WonderMoves fixes both halves:

1. **At home, on the table:** three short games on an Arduino UNO Q, with a distance sensor and a webcam. Each game is built on one movement therapists already prescribe.
2. **In Databricks:** each finished session goes into Delta tables. Databricks builds a progress history for each child and game, and an AI model writes a short note in plain language. The note is checked against safety rules before a parent sees it on the dashboard.

> WonderMoves is **not** a medical device and does not replace occupational or physical therapy. Reach targets never go past the range a caregiver or therapist approves.

**Try it:** [public demo](https://maiapapertowns.github.io/wondermoves/) (games with the webcam or a mouse) · [Databricks notebook](databricks/notebooks/parent_progress.py) · [parent helper](parents/server.py) · [evidence brief](docs/evidence-brief.html)

---

## How Databricks fits in

```
 child plays on the table
        │  distance sensor + webcam (video processed on the board, never saved or sent)
        ▼
 Arduino UNO Q ── event log: reach_completed, brush_stroke, bubble pops, breaks …
        │  USB (adb)
        ▼
 laptop helper (parents/server.py)
   • groups events into sessions (a session ends on a break, or after 3 quiet minutes)
   • uploads finished sessions to a Unity Catalog volume
   • runs the notebook as a Databricks job (`databricks jobs submit`)
        │
        ▼
 ┌──────────────────────── Databricks ────────────────────────┐
 │ /Volumes/workspace/wondermoves/raw/parents/sessions.jsonl   │
 │        │                                                    │
 │        ▼  notebook: databricks/notebooks/parent_progress.py │
 │  Delta  workspace.wondermoves.parent_sessions  (typed)      │
 │  Delta  workspace.wondermoves.parent_daily     (per day)    │
 │  Delta  workspace.wondermoves.parent_notes     (AI notes)   │
 │        │  Llama 3.3 70B on Databricks Model Serving         │
 │        │  → safety check → fallback template if it fails    │
 │        ▼                                                    │
 │  exports/parent_insights.json                               │
 └─────────────────────────────────────────────────────────────┘
        │
        ▼
 parent and caregiver dashboard (behind a PIN): sessions, movements per day,
 reach progress, "N this time · M last time", and the note for each session
```

### What the notebook does

| Step | What happens | Output |
|---|---|---|
| **Ingest** | Reads the finished sessions from the volume and drops empty visits (a game opened, then left without any movement). | — |
| **Store** | Saves every session as a **Delta table with fixed, typed columns**, so a field that's empty in every session, or a new field from the board, can't break the schema. | `parent_sessions` |
| **Aggregate** | Movements, minutes and sessions per child, per game, per day. Days follow the family's own calendar (`local_day` from the laptop), not UTC. | `parent_daily` |
| **Compare with last time** | For each child and game, works out the previous session's movements and how many sessions so far. These are stated as plain numbers, never as a score. | columns in `parent_sessions` |
| **Explain** | Llama 3.3 70B (`databricks-meta-llama-3-3-70b-instruct`) writes a 2–3 sentence note about each new session, using only facts the notebook passes in (game, movements, minutes, average reach in cm, what was found, last time). | `parent_notes` |
| **Check** | Every note must pass `note_ok()`: 420 characters or less, 3 sentences at most, and none of the blocked words. If a note fails, or the model is unavailable, a plain template sentence is used instead. `note_source` records which one was used. | `parent_notes.note_source` |
| **Export** | Writes notes, changes since last time and daily totals as JSON. The helper shows them on the dashboard and copies them to the board. | `exports/parent_insights.json` |

Notes are incremental: only new sessions get a note (40 at most per run, settable), and `NOTE_VERSION` rewrites older notes when the prompt or the rules change.

### Safety rules for the AI notes

The notes are read by parents of disabled children, so the rules are strict and enforced in code, not only in the prompt:

- no diagnosis, no "better / worse / improved / decline", no scores or percentages;
- no comparisons with other children, and no telling the family what to do;
- no body-side wording, and no he/she guessed from a name (first name or "they" only);
- facts only, with the exact numbers given.

### Privacy by design

- **Video never leaves the board.** Frames are processed in memory and never saved or streamed.
- **Databricks gets movement data only:** counts, minutes, reach lengths and sensor quality, plus a display label (default "Your child").
- **The child's profile stays on the board.** Nickname, age, interests and the hand to practise are never sent to Databricks.
- **The dashboard is behind a 4-digit parent PIN.** The board stores only a salted hash. The laptop helper only listens on `127.0.0.1`.
- **No transcripts and no recordings.**

## Run the Databricks part yourself

Works on the free **Databricks Free Edition**.

1. Make a free account at databricks.com and open the workspace once in the browser.
2. Install the Databricks CLI:
   - Mac: `curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh`
   - Windows: `winget install Databricks.DatabricksCLI`
3. Sign in: `databricks auth login --host https://<your-workspace>.cloud.databricks.com`
4. Run the helper:

   ```bash
   python3 parents/server.py --demo        # no board needed: simulated board log
   python3 parents/simulate_board.py play brush   # in another terminal: a child "plays"
   ```

5. Open http://localhost:8090. When the session closes, the helper:
   - creates `workspace.wondermoves` and the `raw` volume;
   - uploads the notebook to `/Users/<you>/wondermoves/parent_progress`;
   - submits the job.

   The note appears on the session card about 1–2 minutes later. The job's runs, the three Delta tables and the notes are all visible in the workspace.

With a real board plugged in over USB, run `python3 parents/server.py` without `--demo`. More details: [parents/README.md](parents/README.md).

## The three games

Each game uses one upper-body movement, chosen from the research on therapy for children with CP:

| Game | Movement | Based on | Input |
|---|---|---|---|
| **Treasure Reach** (first game) | Reach forward to the sensor, hold, come back. Each reach opens a treasure chest. | Goal-directed training | Modulino Distance (VL53L4CD time-of-flight sensor); webcam for the hint |
| **Fossil Brush** | Pip shows a shape, then the child traces it in the air to brush sand off a fossil. | Action observation (watch, then do) | Webcam, tracking the index finger |
| **Bubble Pop** | Lift a hand to pop a bubble. Paired bubbles need both hands together. No timer; the child taps "I'm done". | Bimanual (two-handed) training | Webcam, tracking both hands |

Rules for every game:
- one movement;
- completion, not speed (a slow reach counts the same);
- no timers and no fail states;
- never beyond the range a grown-up approved during calibration;
- gentle break reminders.

Accessibility: Calm mode (no flashing, softer sounds), one-button play for children who can't use a camera or mouse, and a choice of hand to practise.

Evidence and sources: [docs/evidence-brief.html](docs/evidence-brief.html). The main source is Burgess et al., *Developmental Medicine & Child Neurology* (2025), a network meta-analysis of 48 randomised trials with children with CP. The UP-CAT trial (Sgandurra et al., 2013) is the evidence for action observation.

## Hardware and on-device AI

| Part | Used for |
|---|---|
| Arduino UNO Q (Qualcomm QRB2210 running Linux + STM32U585 microcontroller) | Runs the games, the sensors, hand tracking and the event log on the board |
| Modulino Distance (VL53L4CD) | Treasure Reach: how far each reach goes |
| Logitech Brio webcam | Hand tracking on the board for Fossil Brush and Bubble Pop |

```
 Modulino sensors ──I2C── STM32 (wondermoves/sketch) reads sensors, sends samples over the RPC Bridge
                               ▼
                    Linux side (wondermoves/python)  calibration, reach detection, event log, parent PIN
                               ▼  WebUI brick (FastAPI + Socket.IO)
                    Browser (wondermoves/assets)     game shell, 3 games, Settings, parent dashboard
```

## Links

| Where | Link | What works |
|---|---|---|
| Public demo | https://maiapapertowns.github.io/wondermoves/ | Home and all three games with the webcam or a mouse. No sensors and no parent data. |
| On the board (USB) | http://localhost:7070/ after `adb forward tcp:7070 tcp:7000` | Everything: sensors, games, the play log. |
| Parent dashboard on the board | http://localhost:7070/parents/ | Child profile, game log, chart, reach progress. |
| Parent dashboard and Databricks notes (laptop) | http://localhost:8090/ after `python3 parents/server.py` | The same page, plus the Databricks notes. |

## Repo layout

| Path | What's in it |
|---|---|
| `databricks/notebooks/parent_progress.py` | The Databricks notebook: Delta tables, daily progress, AI notes, export |
| `parents/` | Laptop helper that sends sessions to Databricks and runs the job, plus a board simulator |
| `wondermoves/python/` | Board app: sensors, sessions (`parent_sessions.py`), PIN, profile |
| `wondermoves/assets/` | Game shell, the three games, Settings, parent dashboard |
| `wondermoves/sketch/` | STM32 sketch (sensors) |
| `board/` | Sketch build notes and library zips |
| `docs/` | Evidence brief, hardware notes, Devpost scripts |

## Board quirks we hit

- **Wrong clock:** the board boots thinking it's September 2025, so HTTPS downloads fail. Join a phone hotspot so the clock syncs, or set it with `adb shell -t "sudo date -u -s '<UTC time>'"`. The dashboard corrects session times to the laptop's clock.
- **Port 7000 is taken on a Mac** (AirPlay Receiver). Forward to 7070 instead: `adb forward tcp:7070 tcp:7000`.
- **Camera:** `/dev/video0` and `/dev/video1` are the Qualcomm video codec, not cameras, so the code finds the Brio by name. Plug in the Brio before starting the app.
- **The distance sensor's protective film** made it read about 27 mm all the time. Peel it off.
- **Sketch build fixes:** see [board/README.md](board/README.md).

## Team

Maia Le (@maiaPaperTowns) · Joy Hong (@schae4999) · Andrew Kim (@Minulion) · Arnesh (@ArneshXCode)
