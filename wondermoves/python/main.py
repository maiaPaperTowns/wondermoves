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
            "assist_hand": "left"}


profile = load_profile()
LEVEL_TARGETS_MM = {1: 50, 2: 70, 3: 100, 4: 120}


def target_mm():
    """Target for the current level, never above the approved or comfortable range."""
    caps = [profile["approved_max_mm"]]
    if profile["comfortable_mm"]:
        caps.append(profile["comfortable_mm"])
    lvl = LEVEL_TARGETS_MM.get(profile["level"], profile["approved_max_mm"])
    return min([lvl] + caps)


def emit(event, **data):
    data["t"] = time.time()
    ui.send_message(event, data)
    with SESSIONS.open("a") as f:
        f.write(json.dumps({"event": event, **data}) + "\n")


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
        # A rep = leave rest for >= 0.25 s with a peak >= 15 mm, then return.
        # Sensor jitter around the threshold used to count as extra reps.
        reach, now = base - d, time.time()
        if state["phase"] == "rest":
            if reach > 10 and now - state.get("rest_since", 0) >= 0.3:
                state["phase"], state["peak"], state["out_since"] = "out", reach, now
            elif reach <= 10:
                state.setdefault("rest_since", now)
        elif state["phase"] == "out":
            state["peak"] = max(state["peak"], reach)
            if reach < RETURN_TOL_MM:
                state["phase"], state["rest_since"] = "rest", now
                if state["peak"] < 15 or now - state["out_since"] < 0.25:
                    return  # too small or too quick: jitter, not a reach
                state["calib"].append(state["peak"])
                emit("calibration_rep", count=len(state["calib"]), reach_mm=state["peak"])
                if len(state["calib"]) >= 3:
                    profile["comfortable_mm"] = statistics.median(state["calib"])
                    PROFILE.write_text(json.dumps(profile, indent=2))
                    state["mode"] = "idle"
                    emit("calibration_done", **profile, target_mm=target_mm())
        return

    if state["mode"] != "playing" or state["game"] != "reach":
        return

    reach = base - d
    if state["phase"] == "rest" and reach >= target_mm():
        if state["hold_start"] is None:
            state["hold_start"] = time.time()
        elif time.time() - state["hold_start"] >= HOLD_S:
            state["phase"], state["hold_start"] = "reached", None
            emit("reach_completed", reach_mm=round(reach), target_mm=target_mm())
    elif state["phase"] == "rest":
        state["hold_start"] = None
    elif state["phase"] == "reached" and reach < RETURN_TOL_MM:
        state["phase"] = "rest"
        emit("returned_to_rest")


# ---------------- Fossil Brush (IMU) ----------------
# Starter threshold detector. Replace with an on-device classifier for the edge-inference demo.
gyro_window = deque(maxlen=25)  # ~0.5 s
last_brush = 0.0


def on_imu(ax, ay, az, gx, gy, gz):
    global last_brush
    if state["mode"] != "playing" or state["game"] != "brush":
        return
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
    now = time.time()
    if avg > 25 and now - last_brush > 0.8:   # gentle strokes count: CP-friendly threshold
        last_brush = now
        emit("brush_stroke", energy=round(avg, 1))
    elif 8 < avg <= 15 and now - last_brush > 4.0:   # barely moving: gentle encouragement
        last_brush = now
        emit("gesture_uncertain")


# ---------------- Thermo (room comfort only) ----------------
def on_thermo(temp_c, humidity):
    ui.send_message("room", {"temp_c": temp_c, "humidity": humidity})
    if temp_c > WARM_ROOM_C and state["mode"] == "playing":
        emit("break_suggested", reason="warm_room", temp_c=round(temp_c, 1))


# ---------------- Two-Hand Treasure (camera) ----------------
CAMERA_GAMES = {"twohand"}


def on_vision_event(event, data):
    if event == "camera_status":
        ui.send_message("camera_status", data)
        return
    if state["mode"] == "playing" and state["game"] in CAMERA_GAMES:
        emit(event, **data)


vision = Vision(on_event=on_vision_event,
                on_hands=lambda d: ui.send_message("hands", d),
                assist_hand=profile.get("assist_hand", "left"))
vision.start()


def sync_camera():
    """The camera is on only while a camera game is being played."""
    if state["mode"] == "playing" and state["game"] in CAMERA_GAMES:
        vision.enabled.set()
    else:
        vision.enabled.clear()


sensor_status = {}


def on_sensor_status(has_d, has_m, has_t, distance_hz, imu_hz, last_mm):
    """1 Hz from the sketch: which Modulinos are plugged in and whether they send data."""
    sensor_status.update(distance=bool(has_d), movement=bool(has_m), thermo=bool(has_t),
                         distance_hz=distance_hz, imu_hz=imu_hz,
                         last_distance_mm=last_mm if last_mm >= 0 else None)
    ui.send_message("sensors", sensor_status)


# ---------------- Browser -> board messages ----------------
def on_start(_client, data):
    state.update(mode="playing", phase="rest", game=(data or {}).get("game", "reach"))
    sync_camera()
    emit("session_started", game=state["game"], target_mm=target_mm())


def on_pause(_client, _data):
    state["mode"] = "idle"
    sync_camera()
    emit("break_requested")


def on_calibrate(_client, _data):
    state.update(mode="calib_baseline", phase="rest", calib=[], calib_t0=time.time(),
                 rest_since=0)
    sync_camera()
    emit("calibration_step", step="baseline")


def on_set_limits(_client, data):
    # Caregiver portal only: sets the approved maximum and level.
    profile["approved_max_mm"] = int(data.get("approved_max_mm", profile["approved_max_mm"]))
    profile["level"] = int(data.get("level", profile["level"]))
    if data.get("assist_hand") in ("left", "right"):
        profile["assist_hand"] = data["assist_hand"]
        vision.set_assist_hand(profile["assist_hand"])
    PROFILE.write_text(json.dumps(profile, indent=2))
    emit("limits_updated", **profile, target_mm=target_mm())


def on_get_state(client, _data):
    ui.send_message("profile", {**profile, "target_mm": target_mm()})
    ui.send_message("camera_status", {"ok": True, "on": vision.enabled.is_set(),
                                      "backend": vision.backend_name})


Bridge.provide("distance", on_distance)
Bridge.provide("imu", on_imu)
Bridge.provide("thermo", on_thermo)
Bridge.provide("sensor_status", on_sensor_status)
Bridge.provide("i2c_scan", lambda found: ui.send_message("i2c_scan", {"found": found}))
ui.on_message("start", on_start)
ui.on_message("pause", on_pause)
ui.on_message("calibrate", on_calibrate)
ui.on_message("set_limits", on_set_limits)
ui.on_message("get_state", on_get_state)

App.run()
