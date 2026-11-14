"""Logic tests for the two-hand detector. No camera, OpenCV or MediaPipe needed.

    python3 test_vision.py
"""
import math

from vision import TwoHandDetector, SideMapper, fuse, hold_through_dropouts

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


def test_fuse_prefers_hands_and_learns_pose_sides():
    m = SideMapper()
    # Mirrored frame: child's left hand at image left (x 0.3). Pose labels it RIGHT wrist.
    pose_l, pose_r = (0.7, 0.6), (0.3, 0.6)
    out = fuse({"left": (0.31, 0.58), "right": None}, pose_l, pose_r, m)
    assert out["left"] == (0.31, 0.58)           # Hands wins when present
    assert out["right"] == (0.7, 0.6)            # Pose fills the missing side
    out = fuse({"left": None, "right": None}, pose_l, pose_r, m)
    assert out == {"left": (0.3, 0.6), "right": (0.7, 0.6)}, out


def test_mapper_flips_if_pose_labels_are_not_swapped():
    m = SideMapper()
    pose_l, pose_r = (0.3, 0.6), (0.7, 0.6)      # pose labels already match the child
    for _ in range(5):
        fuse({"left": (0.3, 0.6), "right": (0.7, 0.6)}, pose_l, pose_r, m)
    assert not m.swapped
    assert fuse({"left": None, "right": None}, pose_l, pose_r, m) == {"left": (0.3, 0.6), "right": (0.7, 0.6)}


def test_hold_through_short_dropouts():
    seen = {}
    assert hold_through_dropouts({"left": (0.4, 0.5), "right": None}, seen, 10.0)["left"] == (0.4, 0.5)
    assert hold_through_dropouts({"left": None, "right": None}, seen, 10.2)["left"] == (0.4, 0.5)
    assert hold_through_dropouts({"left": None, "right": None}, seen, 10.5)["left"] is None


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
