"""WonderMoves on-device vision for the Logitech Brio 105.

Privacy rules:
- Frames are processed in memory and dropped right away. Video is never saved or streamed.
- Only a few numbers per hand (position, speed) are sent to the browser.

Backends, tried in order:
1. MediaPipe Hands: 21 keypoints per hand with left/right labels. This is the edge-AI path.
2. OpenCV motion: frame differencing on the left and right halves of the image. It can't
   tell what is a hand, but "one side still, the other side moving" still works for the demo.

Run it standalone on a laptop to tune it before deploying to the board:
    python vision.py --preview          # shows the webcam with overlays (laptop only)
    python vision.py                    # prints events
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional


# ---------------------------------------------------------------------------
# Pure logic (no OpenCV / MediaPipe imports), unit-testable with fake samples
# ---------------------------------------------------------------------------

@dataclass
class HandTrack:
    """Recent normalised palm positions (0..1) for one hand."""
    window_s: float = 0.5
    samples: deque = field(default_factory=lambda: deque(maxlen=60))
    last_seen: float = 0.0

    def add(self, t: float, x: float, y: float) -> None:
        self.samples.append((t, x, y))
        self.last_seen = t
        while self.samples and t - self.samples[0][0] > self.window_s:
            self.samples.popleft()

    def present(self, now: float, timeout: float = 0.4) -> bool:
        return now - self.last_seen < timeout and len(self.samples) >= 3

    def speed(self) -> float:
        """Average speed in image-widths per second over the window."""
        if len(self.samples) < 2:
            return 0.0
        dist = 0.0
        for (t0, x0, y0), (t1, x1, y1) in zip(self.samples, list(self.samples)[1:]):
            dist += ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        dt = self.samples[-1][0] - self.samples[0][0]
        return dist / dt if dt > 0 else 0.0


class TwoHandDetector:
    """Bimanual action: the assisting hand stays steady while the other hand moves.

    For unilateral CP the affected hand is often the *assisting* (stabilising) hand;
    caregivers choose which side via `assist_hand`. Thresholds are deliberately lenient:
    "steady" means roughly holding a position, not perfectly still.
    """

    def __init__(self, assist_hand: str = "left", still_max: float = 0.25,
                 move_min: float = 0.45, hold_s: float = 0.4, cooldown_s: float = 1.2):
        self.assist_hand = assist_hand
        self.still_max, self.move_min = still_max, move_min
        self.hold_s, self.cooldown_s = hold_s, cooldown_s
        self.tracks = {"left": HandTrack(), "right": HandTrack()}
        self._good_since: Optional[float] = None
        self._last_action = float("-inf")
        self._last_uncertain = float("-inf")

    @property
    def active_hand(self) -> str:
        return "right" if self.assist_hand == "left" else "left"

    def update(self, now: float, hands: dict) -> list:
        """hands: {"left": (x, y) | None, "right": (x, y) | None}. Returns a list of (event, data)."""
        for side, pos in hands.items():
            if pos is not None:
                self.tracks[side].add(now, *pos)

        events = []
        a, m = self.tracks[self.assist_hand], self.tracks[self.active_hand]
        both = a.present(now) and m.present(now)
        if not both:
            self._good_since = None
            return events

        a_speed, m_speed = a.speed(), m.speed()
        good = a_speed <= self.still_max and m_speed >= self.move_min
        if good:
            if self._good_since is None:
                self._good_since = now
            elif now - self._good_since >= self.hold_s and now - self._last_action >= self.cooldown_s:
                self._last_action = now
                self._good_since = None
                events.append(("two_hand_action", {
                    "assist_speed": round(a_speed, 2), "active_speed": round(m_speed, 2)}))
        else:
            self._good_since = None
            # Both hands moving a lot: gently ask for a steady helper hand (rate-limited).
            if (a_speed > self.still_max * 2 and m_speed >= self.move_min
                    and now - self._last_uncertain > 4.0 and now - self._last_action > 2.0):
                self._last_uncertain = now
                events.append(("gesture_uncertain", {"hint": "steady_helper_hand"}))
        return events


# ---------------------------------------------------------------------------
# Camera backends
# ---------------------------------------------------------------------------

class MediaPipeBackend:
    name = "mediapipe_hands"

    def __init__(self):
        import mediapipe as mp  # noqa: F401 — raises if unavailable
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=False, max_num_hands=2, model_complexity=0,
            min_detection_confidence=0.5, min_tracking_confidence=0.5)

    def process(self, frame_bgr) -> dict:
        import cv2
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        res = self._hands.process(rgb)
        out = {"left": None, "right": None}
        if res.multi_hand_landmarks:
            for lm, hd in zip(res.multi_hand_landmarks, res.multi_handedness):
                # The frame is already mirrored (selfie view), so MediaPipe's label
                # matches the child's real hand.
                side = hd.classification[0].label.lower()
                palm = [lm.landmark[i] for i in (0, 5, 9, 13, 17)]  # wrist + knuckles
                out[side] = (sum(p.x for p in palm) / 5, sum(p.y for p in palm) / 5)
        return out


class MotionBackend:
    """Fallback: motion centroid in each half of the mirrored frame."""
    name = "opencv_motion"

    def __init__(self, min_pixels: int = 400):
        self._prev = None
        self._min = min_pixels

    def process(self, frame_bgr) -> dict:
        import cv2
        import numpy as np
        g = cv2.GaussianBlur(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY), (21, 21), 0)
        out = {"left": None, "right": None}
        if self._prev is None:
            self._prev = g
            return out
        diff = cv2.threshold(cv2.absdiff(self._prev, g), 25, 255, cv2.THRESH_BINARY)[1]
        self._prev = g
        h, w = diff.shape
        # Mirrored view: the child's left hand is on the left of the image.
        for side, sl in (("left", slice(0, w // 2)), ("right", slice(w // 2, w))):
            ys, xs = np.nonzero(diff[:, sl])
            if len(xs) >= self._min:
                out[side] = ((xs.mean() + sl.start) / w, ys.mean() / h)
            else:
                # A still hand produces no motion. Report it as present at a fixed point so
                # "steady helper hand" can still be satisfied. Weaker than MediaPipe.
                out[side] = (0.25 if side == "left" else 0.75, 0.5)
        return out


def make_backend(prefer: str = "auto"):
    if prefer in ("auto", "mediapipe"):
        try:
            return MediaPipeBackend()
        except Exception as e:  # ImportError, missing libGL, etc.
            print(f"[vision] MediaPipe unavailable ({e!r}); using motion fallback")
    return MotionBackend()


# ---------------------------------------------------------------------------
# Background camera loop
# ---------------------------------------------------------------------------

class Vision:
    """Owns the camera thread. Call `start()` and read results through the callbacks."""

    def __init__(self, on_event: Callable[[str, dict], None],
                 on_hands: Optional[Callable[[dict], None]] = None,
                 camera: Optional[str] = None, assist_hand: str = "left",
                 width: int = 640, height: int = 480, preview: bool = False):
        self.on_event, self.on_hands = on_event, on_hands
        self.camera = camera if camera is not None else os.environ.get("WM_CAMERA", "0")
        self.size = (width, height)
        self.detector = TwoHandDetector(assist_hand=assist_hand)
        self.enabled = threading.Event()   # only process frames while a camera game is running
        self.preview = preview
        self.fps = 0.0
        self.backend_name = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._thread = threading.Thread(target=self._run, name="vision", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def set_assist_hand(self, side: str):
        if side in ("left", "right"):
            self.detector = TwoHandDetector(assist_hand=side)

    def _open(self):
        import cv2
        src = int(self.camera) if str(self.camera).isdigit() else self.camera
        cap = cv2.VideoCapture(src)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.size[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.size[1])
        return cap

    def _run(self):
        try:
            import cv2
        except Exception as e:
            self.on_event("camera_status", {"ok": False, "error": f"opencv missing: {e!r}"})
            return
        backend = make_backend()
        self.backend_name = backend.name
        cap = None
        frames, t_fps, last_hands_push = 0, time.time(), 0.0

        while not self._stop.is_set():
            if not self.enabled.is_set():
                if cap is not None:          # release the camera (and its LED) between games
                    cap.release()
                    cap = None
                    self.on_event("camera_status", {"ok": True, "on": False})
                self.enabled.wait(0.5)
                continue
            if cap is None:
                cap = self._open()
                ok = cap.isOpened()
                self.on_event("camera_status", {"ok": ok, "on": ok, "backend": backend.name,
                                                "camera": str(self.camera)})
                if not ok:
                    cap.release()
                    cap = None
                    self.enabled.clear()
                    continue

            ok, frame = cap.read()
            if not ok:
                time.sleep(0.05)
                continue
            frame = cv2.flip(frame, 1)       # selfie view
            now = time.time()
            hands = backend.process(frame)
            for ev, data in self.detector.update(now, hands):
                self.on_event(ev, data)

            frames += 1
            if now - t_fps >= 2.0:
                self.fps = frames / (now - t_fps)
                frames, t_fps = 0, now
            if self.on_hands and now - last_hands_push >= 0.1:   # 10 Hz to the UI
                last_hands_push = now
                self.on_hands({
                    "hands": {k: (None if v is None else [round(v[0], 3), round(v[1], 3)])
                              for k, v in hands.items()},
                    "assist": self.detector.assist_hand,
                    "fps": round(self.fps, 1), "backend": backend.name})

            if self.preview:
                h, w = frame.shape[:2]
                for side, pos in hands.items():
                    if pos:
                        color = (0, 200, 0) if side == self.detector.assist_hand else (0, 140, 255)
                        cv2.circle(frame, (int(pos[0] * w), int(pos[1] * h)), 18, color, 3)
                cv2.putText(frame, f"{backend.name} {self.fps:.1f} fps", (10, 24),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.imshow("WonderMoves vision (q to quit)", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    self._stop.set()
            del frame                         # nothing is kept

        if cap is not None:
            cap.release()


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--camera", default=os.environ.get("WM_CAMERA", "0"))
    p.add_argument("--assist", default="left", choices=["left", "right"])
    p.add_argument("--preview", action="store_true")
    args = p.parse_args()

    v = Vision(on_event=lambda e, d: print(e, d), camera=args.camera,
               assist_hand=args.assist, preview=args.preview)
    v.enabled.set()
    if args.preview:
        v._run()                              # cv2.imshow must run on the main thread (macOS)
    else:
        v.start()
        try:
            while True:
                time.sleep(2)
                print(f"[vision] {v.backend_name} {v.fps:.1f} fps")
        except KeyboardInterrupt:
            v.stop()
