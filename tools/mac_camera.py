"""Run the Bubble Pop Adventure camera on a laptop and feed the UNO Q game.

Use this while the Brio is plugged into the Mac (dev setup). The board still runs the
game, the portal and Digger; this script only does the hand tracking and sends the same
events the board's own camera code would (hand positions for
the bubbles), through the board's portal websocket.

    adb forward tcp:7070 tcp:7000           # portal reachable at 127.0.0.1:7070
    .venv/bin/python tools/mac_camera.py     # add --preview to see the video locally

The camera only turns on while Bubble Pop is being played (same rule as on the
board), and frames never leave this process.
"""
import argparse
import os
import sys
import time

import socketio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "wondermoves", "python"))
from vision import Vision  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--portal", default="http://127.0.0.1:7070")
p.add_argument("--camera", default="1", help="OpenCV index; on a Mac 0 is usually FaceTime, 1 the Brio")
p.add_argument("--assist", default="left", choices=["left", "right"])
p.add_argument("--always-on", action="store_true", help="keep the camera on even outside the game")
p.add_argument("--preview", action="store_true", help="show the camera window locally (laptop only)")
args = p.parse_args()

sio = socketio.Client(reconnection=True)


def on_event(event, data):
    if sio.connected:
        sio.emit("vision_event", {"event": event, "data": data})
    if event != "camera_status":
        print(f"[camera] {event} {data}")


def on_hands(d):
    if sio.connected:
        sio.emit("vision_hands", d)


vision = Vision(on_event=on_event, on_hands=on_hands, camera=args.camera, assist_hand=args.assist)
if args.always_on:
    vision.enabled.set()


@sio.event
def connect():
    print(f"[camera] connected to {args.portal}")
    sio.emit("vision_hello", {"host": "laptop"})  # board stops using its own camera
    sio.emit("get_state", {})


@sio.on("profile")
def on_profile(d):
    if d and d.get("assist_hand"):
        vision.set_assist_hand(d["assist_hand"])


@sio.on("session_started")
def on_session(d):
    if d.get("game") == "bubbles":
        vision.enabled.set()
    elif not args.always_on:
        vision.enabled.clear()


@sio.on("break_requested")
def on_break(_d):
    if not args.always_on:
        vision.enabled.clear()


sio.connect(args.portal, wait_timeout=10)
print(f"[camera] backend will be MediaPipe if installed; camera index {args.camera}. Ctrl-C to stop.")
try:
    if args.preview:
        vision.preview = True
        vision.enabled.set()
        vision._run()  # imshow must run on the main thread on macOS
    else:
        vision.start()
        while True:
            time.sleep(5)
            if vision.enabled.is_set():
                print(f"[camera] {vision.backend_name} {vision.fps:.1f} fps")
except KeyboardInterrupt:
    pass
finally:
    vision.stop()
    sio.disconnect()
