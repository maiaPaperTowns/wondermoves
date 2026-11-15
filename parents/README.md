# Parent website + Databricks

A page for families showing what their child did in all three games, with notes from Databricks.

```
child plays → board saves events → laptop helper → parent page (instant)
                                         ↓ when the session closes
                                    Databricks (≈1–2 min) → note + "this time / last time" on the same card
```

## Run it

```bash
python3 parents/server.py               # real board over USB (needs adb, like the board README)
python3 parents/server.py --demo             # no board: simulated board log
```

Then open **http://localhost:8090**.

- The game runs offline. The **laptop** needs internet (Wi-Fi or a phone hotspot) only for the Databricks notes.
  Without internet the page still shows every session, and the notes are added when the connection comes back.
- A session closes when the child pauses or leaves the game (`break_requested`), or after 3 quiet minutes.
- The board's clock is often wrong, so times are corrected to the laptop's clock.

## Set up a laptop (once)

Each laptop that runs the parent website needs its own free Databricks account. It's set up automatically
the first time a session is sent.

1. Make a free account at **databricks.com** (Free Edition) and open the workspace once in the browser.
2. Install the Databricks CLI:
   - Mac: `curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh`
   - Windows: `winget install Databricks.DatabricksCLI`
3. Sign in (it opens a browser page; approve it). Use the workspace address from your browser, up to the first `/`:
   `databricks auth login --host https://dbc-xxxxxxxx-xxxx.cloud.databricks.com`
4. Have `adb` (the same tool used to start the games on the board).
5. Get the code (`git pull`), plug in the board, and run `python3 parents/server.py`. Open http://localhost:8090.

The first session sent creates the Databricks storage (`workspace.wondermoves`) and uploads the notebook
to `/Users/<you>/wondermoves/parent_progress`, where judges can see its runs, tables and notes.

## Try it without the board

```bash
python3 parents/server.py --demo 
python3 parents/simulate_board.py play brush     # in another terminal: watch the page update live
```

The page shows **one child**: whoever plays on the board. It starts empty and fills in by itself as the
child plays; nobody needs to touch the laptop. (Testing only: `simulate_board.py history` plus
`server.py --samples` adds two simulated sample children.)

## What parents see

Last 7 days (sessions, minutes, movements per game), movements per day, and one card per session:
game, map/level, movements, what was found, rest breaks, comfortable reach (from calibration),
"N this time · M last time", and a short note written on Databricks.

The notes follow the project rules: no diagnosis, scores or comparisons with other children, no
judging words, no body-side wording, and no he/she guessed from a name. A note that breaks a rule is replaced by a plain template.

## Needs from the games

- **Fossil Brush map:** the game should send the map with `start`
  (`{game: 'brush', map: 'desert', difficulty: 'Medium'}`), and `main.py` should log it in `session_started`.
  Without it, cards show the brush strokes but no map.

## Files

| File | What |
|---|---|
| `parents/server.py` | Laptop helper: reads the board log, splits sessions, serves the page, runs Databricks |
| `parents/site/index.html` | The parent page (no external files; works offline) |
| `parents/simulate_board.py` | Simulated board events for demos and testing |
| `databricks/notebooks/parent_progress.py` | Databricks: session history tables, per-day totals, notes for parents |

`parents/data/` (play logs, Databricks results) is local only and not committed.
