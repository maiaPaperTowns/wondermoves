"""Fake board events for the parent website, so it can be shown without the UNO Q.

Writes the same event lines the board writes to data/sessions.jsonl (see python/main.py emit()).
Everything made here is SIMULATED and marked so.

    python3 parents/simulate_board.py history         # 2 sample children, 2 weeks of past sessions
    python3 parents/simulate_board.py play brush      # play one live session now (watch the page update)
    python3 parents/simulate_board.py play reach
    python3 parents/simulate_board.py play bubbles
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
HISTORY = DATA / "sample_history.jsonl"
DEMO_LOG = DATA / "demo_board_log.jsonl"

REACH_LEVELS = [(1, "First Dig", "coin", "🪙", 50), (2, "Hidden Gems", "gemstone", "💎", 70),
                (3, "Fossil Hunt", "fossil", "🦴", 100), (4, "Deep Explorer", "cave", "🕳️", 120)]
MAPS = [("beach", "Easy"), ("desert", "Medium"), ("canyon", "Hard"), ("volcano", "Expert")]


def session_events(game: str, t0: float, rng: random.Random, skill: float, level: int = 1, child=None,
                   pace: float = 1.0):
    """Event lines for one session, in the board's format. skill ~0.5-1.5 scales how much is done."""
    ev = []
    t = t0

    def add(name, **data):
        nonlocal t
        row = {"event": name, **data, "t": round(t, 2)}
        if child:
            row.update(child=child, simulated=True)
        ev.append(row)

    lv = REACH_LEVELS[min(level, len(REACH_LEVELS)) - 1]
    if game == "reach":
        add("session_started", game="reach", level=lv[0], level_name=lv[1], reward=lv[2], icon=lv[3],
            target_mm=min(lv[4], 45), capped=lv[4] > 45)
        if rng.random() < 0.3:
            t += 4
            add("calibration_done", baseline_mm=300, comfortable_mm=round(40 + 15 * skill), approved_max_mm=50)
        reaches = max(2, int(rng.gauss(10 * skill, 2)))
        for i in range(reaches):
            t += rng.uniform(5, 11) * pace
            add("reach_completed", reach_mm=round(rng.uniform(38, 50)), target_mm=45,
                layers_cleared=i % 4 + 1, layers_total=4)
            if i % 4 == 3:
                add("level_completed", level=lv[0], level_name=lv[1], reward=lv[2], icon=lv[3])
                lv = REACH_LEVELS[min(lv[0], len(REACH_LEVELS) - 1)]   # the board moves up a level
    elif game == "brush":
        m, diff = MAPS[min(int(skill * 1.6), 3)] if rng.random() < 0.7 else MAPS[0]
        add("session_started", game="brush", map=m, difficulty=diff)
        strokes = max(3, int(rng.gauss(14 * skill, 3)))
        for _ in range(strokes):
            t += rng.uniform(3, 7) * pace
            if rng.random() < 0.12:
                add("gesture_uncertain")
            else:
                add("brush_stroke", degrees=round(rng.uniform(12, 40) * skill, 1))
    else:
        add("session_started", game="bubbles")
        pops = max(3, int(rng.gauss(16 * skill, 3)))
        for _ in range(pops):
            t += rng.uniform(2, 6) * pace
            add("bubble_popped", kind="pair" if rng.random() < 0.3 else "single")
    if rng.random() < 0.15:
        t += 3
        add("break_suggested", reason="warm_room", temp_c=28.4)
    t += rng.uniform(2, 5)
    add("break_requested")
    return ev


def cmd_history(a):
    rng = random.Random(a.seed)
    DATA.mkdir(exist_ok=True)
    now = time.time()
    rows = []
    for child, base in (("Mia (sample)", 0.7), ("Leo (sample)", 1.0)):
        for day in range(14, 0, -1):
            if rng.random() < 0.45:
                continue
            day_start = now - day * 86400 - rng.uniform(0, 3 * 3600)   # some afternoon, N days ago
            for k, game in enumerate(rng.sample(["reach", "brush", "bubbles"], rng.randint(1, 2))):
                grow = base * (1 + (14 - day) * 0.025)    # gentle simulated growth
                t0 = day_start + k * 1500                  # sessions on the same day don't overlap
                rows += session_events(game, t0, rng, grow, level=1 + (14 - day) // 5, child=child, pace=3.5)
    rows.sort(key=lambda r: r["t"])
    HISTORY.write_text("".join(json.dumps(r) + "\n" for r in rows))
    print(f"wrote {len(rows)} SIMULATED events for 2 sample children to {HISTORY.relative_to(HERE.parent)}")


def cmd_play(a):
    """Append one session to the demo board log in real time (like a child playing now)."""
    rng = random.Random()
    DATA.mkdir(exist_ok=True)
    events = session_events(a.game, time.time(), rng, skill=0.5 if a.quick else 0.8)
    if a.quick:
        events = events[:6] + [events[-1]]
    start = events[0]["t"]
    t_real = time.time()
    with DEMO_LOG.open("a") as f:
        for row in events:
            delay = (row["t"] - start) * (0.25 if a.quick else 0.5) - (time.time() - t_real)
            if delay > 0:
                time.sleep(delay)
            row["t"] = round(time.time(), 2)
            f.write(json.dumps(row) + "\n")
            f.flush()
            print(row["event"], {k: v for k, v in row.items() if k not in ("event", "t")} or "")
    print("session closed (break_requested): the parent page sends it to Databricks now")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    h = sub.add_parser("history")
    h.add_argument("--seed", type=int, default=11)
    h.set_defaults(fn=cmd_history)
    pl = sub.add_parser("play")
    pl.add_argument("game", choices=["brush", "reach", "bubbles"])
    pl.add_argument("--quick", action="store_true", help="a short session (~10 s)")
    pl.set_defaults(fn=cmd_play)
    args = p.parse_args()
    args.fn(args)
