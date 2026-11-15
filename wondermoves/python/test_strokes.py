"""Stroke counter tests with simulated gyro data. No board needed.

    python3 test_strokes.py
"""
import math
import random

from strokes import StrokeCounter

RATE = 50


def brush(counter, amp_deg, hz, seconds, axis=0, noise=1.0, bias=0.0):
    """Simulate a sinusoidal brushing swing of +/- amp_deg at hz; returns strokes counted."""
    random.seed(1)
    strokes = 0
    for i in range(int(seconds * RATE)):
        t = i / RATE
        rate = amp_deg * 2 * math.pi * hz * math.cos(2 * math.pi * hz * t)  # d(angle)/dt
        g = [random.gauss(bias, noise) for _ in range(3)]
        g[axis] += rate
        strokes += counter.update(*g) > 0
    return strokes


def test_counts_completed_strokes():
    # +/-10 deg swing = 20 deg per stroke, 1 Hz for 6 s = 6 cycles = ~12 strokes
    n = brush(StrokeCounter(), 10, 1.0, 6)
    assert 10 <= n <= 13, n


def test_speed_does_not_matter():
    slow = brush(StrokeCounter(), 10, 0.5, 12)   # 6 slow cycles
    fast = brush(StrokeCounter(), 10, 2.0, 3)    # 6 fast cycles
    assert abs(slow - fast) <= 2, (slow, fast)


def test_rest_and_bias_give_no_strokes():
    assert brush(StrokeCounter(), 0, 1.0, 20, noise=1.0, bias=1.5) == 0


def test_tiny_wiggles_do_not_count():
    assert brush(StrokeCounter(), 2, 2.0, 5) == 0   # +/-2 deg = 4 deg swings < 8 deg


def test_any_axis():
    assert brush(StrokeCounter(), 10, 1.0, 6, axis=2) >= 10


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
