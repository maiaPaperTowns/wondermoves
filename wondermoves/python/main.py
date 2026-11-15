"""WonderMoves — Linux side (Qualcomm QRB2210 on UNO Q).

Receives raw sensor samples from the MCU, runs calibration + movement detection
on-device, and pushes structured game events to the browser through the WebUI brick.
"""
import json
import math
import statistics
import time
from collections import deque
from pathlib import Path

from arduino.app_bricks.web_ui import WebUI
from arduino.app_utils import App, Bridge

from parent_sessions import sessionize
from strokes import StrokeCounter
from vision import Vision

ui = WebUI()
DATA = Path(__file__).resolve().parent.parent / "data"
DATA.mkdir(exist_ok=True)
PROFILE = DATA / "profile.json"
SESSIONS = DATA / "sessions.jsonl"

HOLD_S = 0.3            # a reach must be held this long
RETURN_TOL_MM = 15      # "back at rest" tolerance
WARM_ROOM_C = 28.0      # suggest a break above this room temperature


def load_profile():
    if PROFILE.exists():
        return json.loads(PROFILE.read_text())
    # approved_max_mm and assist_hand are set by the caregiver / therapist, never by the game
    return {"baseline_mm": None, "comfortable_mm": None, "approved_max_mm": 50, "level": 1,
            "assist_hand": "left", "lift_height": 0.16}


profile = load_profile()
profile.setdefault("found", [])  # rewards the child has uncovered (shown in the Grown-ups tab)
profile.setdefault("lift_height", 0.16)  # Bubble Lift: caregiver-set lift (fraction of camera height)
profile.setdefault("break_minutes", 10)  # gentle break suggestion after this much continuous play (0 = off)
profile.pop("bubble_area", None)

# About the child, for Pip's voice. Entered by a grown-up in Settings, kept only in data/profile.json on
# this board. Never written to the play log (sessions.jsonl), so it never goes to Databricks.
CHILD_DEFAULTS = {"nickname": "", "age_band": "", "language": "en", "interests": [], "needs": [],
                  "avoid": "", "pronouns": "", "voice_ok": False}
CHILD_NEEDS = {"tap_answers", "short_sentences", "extra_time", "quiet_sounds", "read_aloud"}
CHILD_LANGS = {"en", "es", "vi", "zh", "fr", "ar", "hi"}
profile["child"] = {**CHILD_DEFAULTS, **(profile.get("child") or {})}


def clean_child(data):
    """Keep only short, expected values. Free text is trimmed and stripped of control characters."""
    def text(v, n):
        return "".join(ch for ch in str(v or "") if ch.isprintable()).strip()[:n]
    c = dict(profile["child"])
    if "nickname" in data:
        c["nickname"] = text(data["nickname"], 20)
    if data.get("age_band") in ("", "6-8", "9-12"):
        c["age_band"] = data["age_band"]
    if data.get("language") in CHILD_LANGS:
        c["language"] = data["language"]
    if isinstance(data.get("interests"), list):
        c["interests"] = [t for t in (text(x, 24) for x in data["interests"]) if t][:3]
    if isinstance(data.get("needs"), list):
        c["needs"] = [x for x in data["needs"] if x in CHILD_NEEDS]
    if "avoid" in data:
        c["avoid"] = text(data["avoid"], 120)
    if data.get("pronouns") in ("", "they", "she", "he"):
        c["pronouns"] = data["pronouns"]
    if "voice_ok" in data:
        c["voice_ok"] = bool(data["voice_ok"])
    return c


def logged_profile():
    """The profile without the child's personal details, for events that go into the play log."""
    return {k: v for k, v in profile.items() if k != "child"}

# Illustrative game settings, not prescribed distances. Level 5 uses the child's own range.
LEVELS = {
    1: {"name": "First Dig", "target_mm": 50, "reward": "coin", "icon": "🪙"},
    2: {"name": "Hidden Gems", "target_mm": 70, "reward": "gemstone", "icon": "💎"},
    3: {"name": "Fossil Hunt", "target_mm": 100, "reward": "fossil", "icon": "🦴"},
    4: {"name": "Deep Explorer", "target_mm": 120, "reward": "cave", "icon": "🕳️"},
    5: {"name": "Treasure Master", "target_mm": None, "reward": "treasure chest", "icon": "🧰"},
}
LAYERS_PER_LEVEL = 4  # valid reaches to clear the soil


def target_mm(level=None):
    """Target for a level. NEVER above the caregiver-approved maximum or the child's
    calibrated comfortable reach: finishing a level does not push the child further.
    A child with a 2 cm range plays every level at 2 cm."""
    lv = LEVELS[level or profile["level"]]
    caps = [profile["approved_max_mm"]]
    if profile["comfortable_mm"]:
        caps.append(profile["comfortable_mm"])
    return min(([lv["target_mm"]] if lv["target_mm"] else []) + caps)


def level_info(level=None):
    level = level or profile["level"]
    lv = LEVELS[level]
    return {"level": level, "level_name": lv["name"], "reward": lv["reward"], "icon": lv["icon"],
            "target_mm": target_mm(level),
            # True when the level's example distance was capped to the approved range
            "capped": bool(lv["target_mm"] and target_mm(level) < lv["target_mm"])}


# Practice dose since the board was switched on (dose matters: docs/evidence-brief.html).
practice = {"reaches": 0, "strokes": 0, "bubbles": 0, "pairs": 0, "seconds": 0, "since_break": 0}


def emit(event, **data):
    data["t"] = time.time()
    ui.send_message(event, data)
    with SESSIONS.open("a") as f:
        f.write(json.dumps({"event": event, **data}) + "\n")
    counted = {"reach_completed": "reaches", "brush_stroke": "strokes", "bubble_popped": "bubbles"}.get(event)
    if counted:
        practice[counted] += 2 if data.get("kind") == "pair" else 1
        if data.get("kind") == "pair":
            practice["pairs"] += 1
        ui.send_message("practice", practice)


# ---------------- Treasure Reach (distance) ----------------
state = {"mode": "idle", "phase": "rest", "hold_start": None, "calib": [], "game": "reach"}
recent = deque(maxlen=5)


def on_distance(mm):
    recent.append(mm)
    d = statistics.median(recent)
    ui.send_message("distance", {"mm": d})
    base = profile["baseline_mm"]

    if state["mode"] == "calib_baseline":
        if time.time() - state.get("calib_t0", 0) < 2.0:   # give the child 2 s to settle
            return
        state["calib"].append(d)
        if len(state["calib"]) >= 50:  # ~1 s at rest
            profile["baseline_mm"] = statistics.median(state["calib"])
            state["mode"], state["calib"] = "calib_reach", []
            emit("calibration_step", step="reach", baseline_mm=profile["baseline_mm"])
        return

    if base is None:
        return

    if state["mode"] == "calib_reach":
        # A rep = move >= 15 mm closer than where the hand last rested, for >= 0.25 s, then
        # come at least 60% of the way back. Measured from the LAST rest spot, because real
        # hands drift between reaches (live test: rest went 145 -> 60-80 mm).
        now = time.time()
        rest = state.setdefault("rest_ref", base)
        if state["phase"] == "rest":
            if rest - d > 10 and now - state.get("rest_since", 0) >= 0.3:
                state["phase"], state["min_d"], state["out_since"] = "out", d, now
            elif abs(rest - d) <= 10:
                state["rest_ref"] = rest * 0.9 + d * 0.1      # follow slow drift while resting
                state.setdefault("rest_since", now)
        elif state["phase"] == "out":
            state["min_d"] = min(state["min_d"], d)
            size = rest - state["min_d"]
            if d >= state["min_d"] + 0.6 * size:
                state["phase"], state["rest_since"], state["rest_ref"] = "rest", now, d
                if size < 15 or now - state["out_since"] < 0.25:
                    return  # too small or too quick: jitter, not a reach
                state["calib"].append(size)
                emit("calibration_rep", count=len(state["calib"]), reach_mm=size)
                if len(state["calib"]) >= 3:
                    profile["comfortable_mm"] = statistics.median(state["calib"])
                    PROFILE.write_text(json.dumps(profile, indent=2))
                    state["mode"] = "idle"
                    emit("calibration_done", **logged_profile(), target_mm=target_mm())
        return

    if state["mode"] == "playing" and state["game"] == "reach_ui":
        track_reach_for_ui(d)
        return

    if state["mode"] != "playing" or state["game"] != "reach":
        return

    # Reaches are measured from where the hand last rested (follows slow drift).
    now = time.time()
    if state["phase"] == "settle":
        # Start of a game: count nothing until the hand is seen resting (0.5 s steady).
        buf = state.setdefault("settle_buf", [])
        buf.append(d)
        if len(buf) >= 25:
            if max(buf[-25:]) - min(buf[-25:]) <= 15:
                state["rest_ref"], state["phase"] = statistics.median(buf[-25:]), "rest"
                state.pop("settle_buf", None)
                emit("returned_to_rest")
            else:
                del buf[:-25]
        return
    rest = state["rest_ref"]
    reach = rest - d
    if state["phase"] == "rest":
        if reach >= target_mm():
            if state["hold_start"] is None:
                state["hold_start"] = now
            elif now - state["hold_start"] >= HOLD_S:
                state["phase"], state["hold_start"], state["min_d"] = "reached", None, d
                state["layers"] = state.get("layers", 0) + 1
                emit("reach_completed", reach_mm=round(reach), target_mm=target_mm(),
                     layers_cleared=state["layers"], layers_total=LAYERS_PER_LEVEL)
                if state["layers"] >= LAYERS_PER_LEVEL:
                    done = level_info()
                    profile["found"].append(done["reward"])
                    profile["level"] = min(profile["level"] + 1, max(LEVELS))
                    PROFILE.write_text(json.dumps(profile, indent=2))
                    state["layers"] = 0
                    emit("level_completed", **done, next=level_info())
        else:
            state["hold_start"] = None
            if reach < 0:
                # Hand is farther back than the saved rest: moving away is never a reach, so
                # follow it quickly (fixes a rest saved during a reach or behind an obstruction).
                state["rest_ref"] = rest * 0.8 + d * 0.2
            elif reach <= max(10, target_mm() * 0.3):
                state["rest_ref"] = rest * 0.95 + d * 0.05   # follow slow drift while resting
    elif state["phase"] == "reached":
        state["min_d"] = min(state["min_d"], d)
        if d >= state["min_d"] + 0.6 * (rest - state["min_d"]):   # came most of the way back
            state["phase"], state["rest_ref"] = "rest", d
            emit("returned_to_rest")


def track_reach_for_ui(d):
    """Treasure Reach in the shell UI (games/treasure-reach): the browser game decides when a
    chest opens; the board only tracks where the hand rests and streams how far it has reached.
    Same rest rules as the board game: settle first, follow slow drift, follow quickly back."""
    now = time.time()
    rest = state.get("rest_ref")
    if rest is None:
        buf = state.setdefault("settle_buf", [])
        buf.append(d)
        if len(buf) >= 25:
            if max(buf[-25:]) - min(buf[-25:]) <= 15:
                state["rest_ref"] = statistics.median(buf[-25:])
                state.pop("settle_buf", None)
            else:
                del buf[:-25]
        return
    reach = rest - d
    hist = state.setdefault("ui_hist", deque(maxlen=100))   # ~2 s of samples
    hist.append(d)
    if reach < 0:
        state["rest_ref"] = rest * 0.8 + d * 0.2          # moved back: never a reach
    elif reach <= 10:
        state["rest_ref"] = rest * 0.95 + d * 0.05        # slow drift while resting
    elif len(hist) == hist.maxlen and max(hist) - min(hist) <= 10:
        state["rest_ref"] = statistics.median(hist)       # parked somewhere new for 2 s: new rest
    if now - state.get("ui_sent", 0) >= 0.05:             # ~20 Hz to the game
        state["ui_sent"] = now
        ui.send_message("reach_progress", {"reach_mm": round(max(0.0, state["rest_ref"] - d), 1)})


def on_reach_rep(_client, data):
    """A chest opened in the shell's Treasure Reach: log it like the board game's reaches."""
    data = data or {}
    emit("reach_completed", reach_mm=data.get("reach_mm"), target_mm=data.get("goal_mm"),
         level=data.get("level"), source="treasure-reach-ui")


# ---------------- Fossil Brush (IMU) ----------------
# A stroke = a completed back-and-forth swing (strokes.py), counted the same at any speed.
gyro_window = deque(maxlen=25)  # ~0.5 s, only for the on-screen brush animation
stroke_counter = StrokeCounter(min_deg=8.0)
last_stroke = time.time()
last_nudge = 0.0


def on_imu(ax, ay, az, gx, gy, gz):
    global last_stroke, last_nudge
    if state["mode"] != "playing" or state["game"] != "brush":
        return
    size = stroke_counter.update(gx, gy, gz)
    now = time.time()
    if size:
        last_stroke = now
        emit("brush_stroke", degrees=round(size, 1))
    energy = math.sqrt(gx * gx + gy * gy + gz * gz)
    gyro_window.append(energy)
    if len(gyro_window) % 5 == 0 or len(gyro_window) == gyro_window.maxlen:
        # ~10 Hz stream of recent motion energy (deg/s) for Fossil Brush's virtual brush.
        recent = list(gyro_window)[-5:]
        if int(time.time() * 10) != state.get("motion_tick"):
            state["motion_tick"] = int(time.time() * 10)
            ui.send_message("brush_motion", {"energy": round(sum(recent) / len(recent), 1)})
    if len(gyro_window) < gyro_window.maxlen:
        return
    avg = sum(gyro_window) / len(gyro_window)
    # Moving but no completed stroke for a while: one gentle hint, never a penalty.
    if avg > 8 and now - last_stroke > 8 and now - last_nudge > 15:
        last_nudge = now
        emit("gesture_uncertain")


# ---------------- Thermo (room comfort only) ----------------
def on_thermo(temp_c, humidity):
    ui.send_message("room", {"temp_c": temp_c, "humidity": humidity})
    # Gentle suggestion, at most once every 2 minutes (real test: it fired every 5 s).
    if temp_c > WARM_ROOM_C and state["mode"] == "playing" and time.time() - state.get("warm_said", 0) > 120:
        state["warm_said"] = time.time()
        emit("break_suggested", reason="warm_room", temp_c=round(temp_c, 1))


# ---------------- Two-Hand Treasure (camera) ----------------
CAMERA_GAMES = {"bubbles"}  # Bubble Lift (was Bubble Pop / Two-Hand Treasure)


def on_vision_event(event, data):
    if event == "camera_status":
        ui.send_message("camera_status", data)
        return
    # Bubble Pop does its hit-testing in the browser from the hand positions, so the
    # old two-hand detector events are not forwarded.


VISION_STATS = DATA / "vision_stats.jsonl"
_vstats = {"t0": time.time(), "n": 0, "left": 0, "right": 0, "both": 0}


def on_board_hands(d):
    """Relay hand positions to the game, and every 10 s log how often hands were found
    (numbers only, no images) so camera tracking can be checked after a standalone run."""
    ui.send_message("hands", d)
    h = d.get("hands") or {}
    _vstats["n"] += 1
    _vstats["left"] += bool(h.get("left"))
    _vstats["right"] += bool(h.get("right"))
    _vstats["both"] += bool(h.get("left") and h.get("right"))
    if time.time() - _vstats["t0"] >= 10:
        n = max(1, _vstats["n"])
        with VISION_STATS.open("a") as f:
            f.write(json.dumps({"t": time.time(), "backend": d.get("backend"), "fps": d.get("fps"),
                                "frames": _vstats["n"], "left_pct": round(100 * _vstats["left"] / n),
                                "right_pct": round(100 * _vstats["right"] / n),
                                "both_pct": round(100 * _vstats["both"] / n),
                                "game": state.get("game") if state.get("mode") == "playing" else None}) + "\n")
        _vstats.update(t0=time.time(), n=0, left=0, right=0, both=0)


vision = Vision(on_event=on_vision_event,
                on_hands=on_board_hands,
                assist_hand=profile.get("assist_hand", "left"))
vision.start()


def sync_camera():
    """The camera is on only while a camera game is being played.
    If a laptop camera (tools/mac_camera.py) is connected, it does the tracking instead."""
    if state["mode"] == "playing" and state["game"] in CAMERA_GAMES and not state.get("remote_camera"):
        vision.enabled.set()
    else:
        vision.enabled.clear()


def on_vision_hello(_client, data):
    state["remote_camera"] = True
    sync_camera()
    ui.send_message("camera_status", {"ok": True, "on": False, "remote": True})


def on_remote_vision_event(_client, msg):
    """Events from tools/mac_camera.py, handled exactly like the board's own camera."""
    on_vision_event(msg.get("event"), {**(msg.get("data") or {}), "remote": True})


def on_remote_hands(_client, d):
    ui.send_message("hands", d)


sensor_status = {}


def on_sensor_status(has_d, has_m, has_t, distance_hz, imu_hz, last_mm):
    """1 Hz from the sketch: which Modulinos are plugged in and whether they send data."""
    sensor_status.update(distance=bool(has_d), movement=bool(has_m), thermo=bool(has_t),
                         distance_hz=distance_hz, imu_hz=imu_hz,
                         last_distance_mm=last_mm if last_mm >= 0 else None)
    ui.send_message("sensors", sensor_status)
    if state["mode"] == "playing":
        practice["seconds"] += 1
        practice["since_break"] += 1
        limit = int(profile.get("break_minutes") or 0) * 60
        if limit and practice["since_break"] >= limit:
            practice["since_break"] = 0                  # suggest again after another block
            emit("break_suggested", reason="long_play", minutes=limit // 60)
        if practice["seconds"] % 10 == 0:
            ui.send_message("practice", practice)
    # Tell the caregiver right away when the Distance sensor can't see the hand during
    # calibration or Treasure Reach (its beam is narrow), instead of waiting silently.
    needs_hand = state["mode"] in ("calib_baseline", "calib_reach") or (
        state["mode"] == "playing" and state["game"] in ("reach", "reach_ui"))
    if needs_hand and distance_hz == 0 and time.time() - state.get("hand_warned", 0) > 6:
        state["hand_warned"] = time.time()
        emit("hand_not_seen")


# ---------------- Browser -> board messages ----------------
def on_start(_client, data):
    if state["mode"] in ("calib_baseline", "calib_reach"):
        # Never cancel a calibration half-way: the child's range would be saved wrong.
        emit("calibration_busy")
        return
    # phase "reached": a reach only counts after the hand has first been seen back at rest,
    # so a hand (or object) already near the sensor at Start is never counted as a reach.
    state.update(mode="playing", phase="settle", game=(data or {}).get("game", "reach"),
                 layers=0, hold_start=None)
    for k in ("settle_buf", "rest_ref", "ui_hist"):   # every game starts by finding the rest again
        state.pop(k, None)
    sync_camera()
    emit("session_started", game=state["game"], **level_info())


def on_pause(_client, _data):
    practice["since_break"] = 0
    state["mode"] = "idle"
    sync_camera()
    emit("break_requested")


def on_calibrate(_client, _data):
    state.update(mode="calib_baseline", phase="rest", calib=[], calib_t0=time.time(),
                 rest_since=0)
    state.pop("rest_ref", None)
    sync_camera()
    emit("calibration_step", step="baseline")


def on_set_limits(_client, data):
    # Caregiver portal only: sets the approved maximum and level.
    profile["approved_max_mm"] = int(data.get("approved_max_mm", profile["approved_max_mm"]))
    profile["level"] = min(max(int(data.get("level", profile["level"])), 1), max(LEVELS))
    if "lift_height" in data:
        profile["lift_height"] = min(max(float(data["lift_height"]), 0.08), 0.35)
    if "break_minutes" in data:
        profile["break_minutes"] = min(max(int(data["break_minutes"]), 0), 30)
    if data.get("assist_hand") in ("left", "right"):
        profile["assist_hand"] = data["assist_hand"]
        vision.set_assist_hand(profile["assist_hand"])
    PROFILE.write_text(json.dumps(profile, indent=2))
    emit("limits_updated", **{**logged_profile(), **level_info()})


def on_set_child(_client, data):
    """Settings → About your child. Saved on the board only; sent to open pages, never logged."""
    profile["child"] = clean_child(data or {})
    PROFILE.write_text(json.dumps(profile, indent=2))
    ui.send_message("child_updated", profile["child"])


def on_forget_child(_client, _data):
    profile["child"] = dict(CHILD_DEFAULTS)
    PROFILE.write_text(json.dumps(profile, indent=2))
    ui.send_message("child_updated", profile["child"])


def on_bubble_pop(_client, data):
    """Logged for the caregiver view; the browser decides when a bubble is popped."""
    if state["mode"] == "playing" and state["game"] == "bubbles":
        emit("bubble_popped", kind=(data or {}).get("kind", "single"))


def on_get_state(client, _data):
    playing = state["game"] if state["mode"] == "playing" else None
    ui.send_message("profile", {**profile, **level_info(), "playing": playing})
    ui.send_message("practice", practice)
    ui.send_message("camera_status", {"ok": True, "on": vision.enabled.is_set(),
                                      "backend": vision.backend_name})


Bridge.provide("distance", on_distance)
Bridge.provide("imu", on_imu)
Bridge.provide("thermo", on_thermo)
Bridge.provide("sensor_status", on_sensor_status)
def on_distance_debug(s0, s1, s2, s_err, raw_mm, raw_status):
    ui.send_message("distance_debug", {"ok": s0, "noisy": s1, "weak": s2, "error": s_err,
                                       "raw_mm": raw_mm, "raw_status": raw_status})
    # Only weak readings closer than 45 mm for 5 s in a row: the chip sees its own window
    # (protective film, fingerprint, tape or something touching it), not the hand.
    blocked = s0 == 0 and s2 > 20 and 0 < raw_mm < 45
    state["window_blocked_s"] = state.get("window_blocked_s", 0) + 1 if blocked else 0
    ui.send_message("sensor_hint", {"distance_window_blocked": state["window_blocked_s"] >= 5})


Bridge.provide("distance_debug", on_distance_debug)
Bridge.provide("i2c_scan", lambda found: ui.send_message("i2c_scan", {"found": found}))

def parents_state():
    """GET /api/state for the parent page at /parents/ (the same page the laptop helper serves).
    The board has no Databricks sign-in, so notes come only from the laptop helper."""
    events = []
    try:
        for line in SESSIONS.read_text().splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if "event" in e and "t" in e:
                e["child"] = profile["child"]["nickname"] or "Your child"
                events.append(e)
    except FileNotFoundError:
        pass
    sessions = [dict(s, insight=None) for s in sessionize(events, time.time())]
    prof = {k: profile.get(k) for k in ("assist_hand", "comfortable_mm", "baseline_mm", "approved_max_mm",
                                         "level", "break_minutes", "found", "child")}
    return {"children": [profile["child"]["nickname"] or "Your child"], "sessions": sessions, "daily": [], "profile": prof,
            "board": "connected (page served by the board)",
            "databricks": {"state": "on the laptop", "updated": None,
                           "detail": "Notes from Databricks appear when the parent helper runs on a laptop (python3 parents/server.py)."},
            "now": time.time()}


ui.expose_api("GET", "/api/state", parents_state)
ui.on_message("start", on_start)
ui.on_message("pause", on_pause)
ui.on_message("calibrate", on_calibrate)
ui.on_message("set_limits", on_set_limits)
ui.on_message("set_child", on_set_child)
ui.on_message("forget_child", on_forget_child)
ui.on_message("get_state", on_get_state)
ui.on_message("vision_hello", on_vision_hello)
ui.on_message("vision_event", on_remote_vision_event)
ui.on_message("vision_hands", on_remote_hands)
ui.on_message("bubble_pop", on_bubble_pop)
ui.on_message("reach_rep", on_reach_rep)

App.run()
