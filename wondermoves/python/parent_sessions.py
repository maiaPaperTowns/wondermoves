"""Splits the game log (data/sessions.jsonl) into play sessions for the parent page.

Shared by the board app (main.py serves the parent page at /parents/) and the laptop helper
(parents/server.py, which adds the Databricks notes). Standard library only.
"""
from __future__ import annotations

QUIET_S = 180                     # a session with no events for this long counts as closed

GAMES = {
    "reach": {"name": "Treasure Reach", "icon": "💰", "move": "reaches", "count": {"reach_completed"}},
    "brush": {"name": "Fossil Brush", "icon": "🦴", "move": "brush strokes", "count": {"brush_stroke"}},
    "bubbles": {"name": "Bubble Pop", "icon": "🫧", "move": "bubbles popped", "count": {"bubble_popped"}},
}
MAP_NAMES = {"beach": "Sunny Beach", "desert": "Desert Dunes", "canyon": "Rocky Canyon", "volcano": "Volcano Valley"}


def sessionize(events: list[dict], now: float) -> list[dict]:
    """Group events into sessions per child. Same rules as the Databricks notebook expects."""
    sessions, open_by_child = [], {}
    for e in sorted(events, key=lambda x: x["t"]):
        child = e.get("child", "Your child")
        cur = open_by_child.get(child)
        if cur and e["t"] - cur["_last"] > QUIET_S:
            cur["closed"] = True
            open_by_child.pop(child, None)
            cur = None
        name = e.get("event")
        if name == "session_started":
            if cur:
                cur["closed"] = True
            game = e.get("game", "reach")
            # The shell UI's Treasure Reach (Andrew's game on the Distance sensor) logs as
            # "reach_ui"; it is the same game and logs the same reach_completed events.
            game = {"reach_ui": "reach"}.get(game, game)
            g = GAMES.get(game, {"name": game, "icon": "🎮", "move": "movements", "count": set()})
            cur = {"session_id": f"{child}|{game}|{int(e['t'])}", "child": child, "simulated": bool(e.get("simulated")),
                   "game": game, "game_name": g["name"], "icon": g["icon"], "movement_word": g["move"],
                   "movements": 0, "pairs": 0, "uncertain": 0, "breaks": 0, "rewards": [],
                   "detail": "", "comfortable_mm": None, "start_t": e["t"], "end_t": e["t"], "_last": e["t"],
                   # the board's own clock (the laptop helper shifts t to the laptop clock): how the board
                   # matches Databricks notes to its sessions
                   "board_start_t": e.get("board_t", e["t"]),
                   "reach_mms": [], "closest_mms": [], "rep_mss": [], "quality_ok": 0, "quality_all": 0,
                   "closed": False}
            if game == "reach" and e.get("level_name"):
                cur["detail"] = f"Level {e.get('level')}: {e.get('level_name')}"
            if game == "brush" and e.get("map"):
                cur["detail"] = f"{MAP_NAMES.get(e['map'], e['map'].title())} ({e.get('difficulty', '')})".replace(" ()", "")
            sessions.append(cur)
            open_by_child[child] = cur
            continue
        if not cur:
            continue
        cur["_last"] = cur["end_t"] = e["t"]
        counted = GAMES.get(cur["game"], {}).get("count", set())
        if name == "sensor_quality":
            cur["quality_ok"] += int(e.get("ok") or 0)
            cur["quality_all"] += int(e.get("total") or 0)
        if name in counted:
            cur["movements"] += 1
            for key, field in (("reach_mms", "reach_mm"), ("closest_mms", "closest_mm"), ("rep_mss", "rep_ms")):
                if isinstance(e.get(field), (int, float)):
                    cur[key].append(e[field])
            if e.get("kind") == "pair":
                cur["pairs"] += 1
        elif name == "gesture_uncertain":
            cur["uncertain"] += 1
        elif name == "level_completed" and e.get("reward"):
            cur["rewards"].append(f"{e.get('icon', '')} {e['reward']}".strip())
        elif name == "calibration_done" and e.get("comfortable_mm"):
            cur["comfortable_mm"] = e["comfortable_mm"]
        elif name == "break_suggested":
            cur["breaks"] += 1
        elif name == "break_requested":
            cur["closed"] = True
            open_by_child.pop(child, None)
    for s in sessions:
        if not s["closed"] and now - s["_last"] > QUIET_S:
            s["closed"] = True
        s["minutes"] = round(max(s["end_t"] - s["start_t"], 0) / 60, 1)
        s.pop("_last", None)
        s.update(progress(s))
    return sessions


def _median(v):
    v = sorted(v)
    n = len(v)
    return None if not n else v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def progress(s):
    """Neutral numbers for the parent page: no scores, no judging words."""
    reach, rep_ms = s.pop("reach_mms"), s.pop("rep_mss")
    closest = s.pop("closest_mms")
    q_ok, q_all = s.pop("quality_ok"), s.pop("quality_all")
    out = {"reach_avg_mm": round(sum(reach) / len(reach)) if reach else None,
           "reach_max_mm": max(reach) if reach else None,
           "reach_n": len(reach),
           # spread of reach lengths: the middle half of reaches lies within this many mm
           "reach_spread_mm": None, "closest_mm": min(closest) if closest else None,
           "rep_median_s": round(_median(rep_ms) / 1000, 1) if rep_ms else None,
           "quality_pct": round(100 * q_ok / q_all) if q_all else None,
           # raw values so the page can combine sessions (a week, a day)
           "reach_list": reach, "quality_ok": q_ok, "quality_all": q_all}
    if len(reach) >= 4:
        r = sorted(reach)
        out["reach_spread_mm"] = round(r[(3 * len(r)) // 4] - r[len(r) // 4])
    return out

