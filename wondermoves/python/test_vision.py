"""Logic tests for the two-hand detector. No camera, OpenCV or MediaPipe needed.

    python3 test_vision.py
"""
import math

from vision import TwoHandDetector

FPS = 30


def run(detector, seconds, left_fn, right_fn, start=0.0):
    events = []
    for i in range(int(seconds * FPS)):
        t = start + i / FPS
        hands = {"left": left_fn(t), "right": right_fn(t)}
        events += [e for e, _ in detector.update(t, hands)]
    return events


still = lambda x: (lambda t: (x, 0.5))
wiggle = lambda x, amp=0.08, hz=2.0: (lambda t: (x + amp * math.sin(2 * math.pi * hz * t), 0.5))


def test_helper_still_mover_moving_triggers():
    ev = run(TwoHandDetector(assist_hand="left"), 3, still(0.25), wiggle(0.75))
    assert "two_hand_action" in ev, ev
    # Cooldown means at most ~1 action per 1.2 s.
    assert ev.count("two_hand_action") <= 3, ev


def test_only_one_hand_never_triggers():
    ev = run(TwoHandDetector(assist_hand="left"), 3, lambda t: None, wiggle(0.75))
    assert ev == [], ev


def test_both_still_never_triggers():
    ev = run(TwoHandDetector(assist_hand="left"), 3, still(0.25), still(0.75))
    assert ev == [], ev


def test_both_moving_gives_gentle_hint_not_action():
    ev = run(TwoHandDetector(assist_hand="left"), 3, wiggle(0.25, amp=0.15), wiggle(0.75))
    assert "two_hand_action" not in ev, ev
    assert ev.count("gesture_uncertain") == 1, ev  # rate-limited


def test_assist_side_is_respected():
    # Right hand is the helper here, so a moving right hand must not count.
    ev = run(TwoHandDetector(assist_hand="right"), 3, still(0.25), wiggle(0.75))
    assert "two_hand_action" not in ev, ev
    ev = run(TwoHandDetector(assist_hand="right"), 3, wiggle(0.25), still(0.75))
    assert "two_hand_action" in ev, ev


def test_small_tremor_on_helper_hand_still_counts():
    # Lenient "steady": a small tremor on the helper hand is fine.
    ev = run(TwoHandDetector(assist_hand="left"), 3, wiggle(0.25, amp=0.01, hz=3), wiggle(0.75))
    assert "two_hand_action" in ev, ev


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
