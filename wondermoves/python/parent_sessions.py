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
        if name in counted:
            cur["movements"] += 1
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
    return sessions
