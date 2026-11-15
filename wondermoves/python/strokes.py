"""Fossil Brush stroke counter: counts COMPLETED back-and-forth strokes, not speed.

Rule from the CP game-design research (see docs/evidence-brief.html): respond to completion
of the movement, never to how fast it is, and never require precise timing.

How it works: integrate the gyro (deg/s) on the axis with the most motion to get the brush's
swing angle. A stroke counts when the angle has swung at least `min_deg` in one direction and
then turns back. A slow stroke and a fast stroke of the same size count the same. A slow
high-pass removes gyro bias so a hand at rest never drifts into fake strokes.
"""
from collections import deque


class StrokeCounter:
    def __init__(self, min_deg: float = 8.0, turn_deg: float = 2.0, rate_hz: float = 50.0):
        self.min_deg, self.turn_deg, self.dt = min_deg, turn_deg, 1.0 / rate_hz
        self.bias = [0.0, 0.0, 0.0]
        self.recent = deque(maxlen=int(rate_hz))      # last ~1 s of |gyro| per axis
        self.angle = 0.0
        self.start = 0.0      # angle where the current swing began
        self.peak = 0.0       # furthest angle reached in the current swing
        self.direction = 0    # +1 / -1 once a swing is under way

    def update(self, gx: float, gy: float, gz: float) -> float:
        """Feed one gyro sample (deg/s). Returns the swing size in degrees when a stroke
        completes on this sample, else 0."""
        g = [gx, gy, gz]
        for i in range(3):                               # slow bias estimate (~5 s)
            self.bias[i] += (g[i] - self.bias[i]) * 0.004
        g = [g[i] - self.bias[i] for i in range(3)]
        self.recent.append([abs(v) for v in g])
        axis = max(range(3), key=lambda i: sum(s[i] for s in self.recent))
        self.angle += g[axis] * self.dt

        if self.direction == 0:
            if abs(self.angle - self.start) >= self.turn_deg:
                self.direction = 1 if self.angle > self.start else -1
                self.peak = self.angle
            return 0.0
        if (self.angle - self.peak) * self.direction > 0:  # still swinging the same way
            self.peak = self.angle
            return 0.0
        if abs(self.angle - self.peak) >= self.turn_deg:   # turned back: the swing is over
            size = abs(self.peak - self.start)
            self.start, self.direction = self.peak, -self.direction
            self.peak = self.angle
            return size if size >= self.min_deg else 0.0
        return 0.0
