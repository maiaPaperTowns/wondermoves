"""WonderMoves parent website + Databricks link. Runs on the laptop next to the board.

    python3 parents/server.py               # real board over USB (needs adb), page at http://localhost:8090
    python3 parents/server.py --demo             # no board: reads the simulated log (parents/simulate_board.py)

Shows ONE child: whoever plays on the board. Nothing needs touching once it runs: sessions appear
by themselves as the child plays, and Databricks notes follow when each session ends.

What it does:
1. Every 2 s it reads the board's game log (data/sessions.jsonl on the UNO Q, through adb).
2. It splits the log into play sessions (a session ends when the child pauses or leaves the game,
   or after 3 quiet minutes). The parent page shows a session the moment it happens.
3. When a session closes, it uploads all finished sessions to Databricks and runs the
   parent_progress notebook (about 1-2 minutes). The notes and changes it sends back appear on the
   same session card. No internet? The page keeps working; Databricks catches up on the next session.

The board clock can be wrong (it boots in Sep 2025), so times are corrected to the laptop clock.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = HERE / "data"
SITE = HERE / "site"
VOL = "/Volumes/workspace/wondermoves/raw"
NOTEBOOK = "parent_progress"
QUIET_S = 180                     # a session with no events for this long counts as closed

GAMES = {
    "reach": {"name": "Treasure Reach", "icon": "🪙", "move": "reaches", "count": {"reach_completed"}},
    "brush": {"name": "Fossil Brush", "icon": "🦴", "move": "brush strokes", "count": {"brush_stroke"}},
    "bubbles": {"name": "Bubble Lift", "icon": "🫧", "move": "bubbles popped", "count": {"bubble_popped"}},
}
MAP_NAMES = {"beach": "Sunny Beach", "desert": "Desert Dunes", "canyon": "Rocky Canyon", "volcano": "Volcano Valley"}


# ---------------------------------------------------------------------------
# Reading the board
# ---------------------------------------------------------------------------

class BoardLog:
    """Reads the board's event log, and keeps board times on the laptop clock."""

    def __init__(self, demo: bool, board_path: str | None, child: str):
        self.demo, self.child = demo, child
        self.board_path = board_path
        self.offset = 0.0             # laptop time - board time
        self.seen = 0                 # lines already read
        self.events: list[dict] = []
        self.status = "starting"

    def _read_lines(self) -> list[str] | None:
        if self.demo:
            f = DATA / "demo_board_log.jsonl"
            self.status = "simulated board"
            return f.read_text().splitlines() if f.exists() else []
        adb = shutil.which("adb") or next((str(p) for p in (Path.home() / ".local/bin/adb",
                                                            Path.home() / "Library/Android/sdk/platform-tools/adb")
                                           if p.exists()), None)
        if not adb:
            self.status = "adb not found (install Android platform-tools, or use --demo)"
            return None
        if not self.board_path:
            r = subprocess.run([adb, "shell", "find /home/arduino -path '*wondermoves*' -name sessions.jsonl "
                                              "2>/dev/null | head -1"], capture_output=True, text=True, timeout=10)
            self.board_path = r.stdout.strip() or None
            if not self.board_path:
                self.status = "board connected, no game log yet" if r.returncode == 0 else "board not connected"
                return None
        r = subprocess.run([adb, "shell", f"cat '{self.board_path}'"], capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            self.status = "board not connected"
            return None
        self.status = "board connected"
        return r.stdout.splitlines()

    def poll(self) -> bool:
        lines = self._read_lines()
        if lines is None or len(lines) <= self.seen:
            return False
        new = []
        for line in lines[self.seen:]:
            try:
                new.append(json.loads(line))
            except ValueError:
                continue
        if self.seen == 0 and len(self.events) == 0 and not self.demo:
            # First read: assume the newest event happened about now, to fix a wrong board clock.
            self.offset = time.time() - max(e.get("t", 0) for e in new) if new else 0.0
        elif new and not self.demo:
            # New lines arrived within the last poll: re-anchor the clock to them.
            self.offset = time.time() - max(e.get("t", 0) for e in new)
        for e in new:
            e["t"] = e.get("t", 0) + self.offset
            e.setdefault("child", self.child)
        self.events += new
        self.seen = len(lines)
        return True


def load_history() -> list[dict]:
    f = DATA / "sample_history.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Databricks
# ---------------------------------------------------------------------------

class Databricks:
    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.cli = shutil.which("databricks") or str(Path.home() / ".local/bin/databricks")
        self.state = "waiting for a finished session" if enabled else "off"
        self.detail = ""
        self.busy = False
        self.failed_at = 0.0
        self.failed_ids: set[str] = set()
        self.insights = self._load()
        self.deployed = False
        if self.insights.get("sessions"):
            self.state, self.detail = "up to date", "Notes from the last Databricks run"

    def _load(self) -> dict:
        f = DATA / "parent_insights.json"
        try:
            return json.loads(f.read_text())
        except (OSError, ValueError):
            return {"sessions": {}, "daily": []}

    def db(self, *args, timeout=120) -> subprocess.CompletedProcess:
        return subprocess.run([self.cli, *args], capture_output=True, text=True, timeout=timeout)

    def notebook_path(self) -> str:
        me = json.loads(self.db("current-user", "me", "-o", "json", timeout=30).stdout)["userName"]
        return f"/Users/{me}/wondermoves/{NOTEBOOK}"

    def maybe_sync(self, closed: list[dict], force: bool = False):
        """Send when a finished session has no Databricks notes yet. After a failure (no internet),
        wait for a new session or 60 s before trying again."""
        missing = {s["session_id"] for s in closed} - set(self.insights.get("sessions", {}))
        if not self.enabled or self.busy or not (missing or force):
            return
        if not force and missing <= self.failed_ids and time.time() - self.failed_at < 60:
            return
        self.busy = True
        threading.Thread(target=self._sync, args=(closed,), daemon=True).start()

    def _sync(self, closed: list[dict]):
        try:
            self.state, self.detail = "sending", "Uploading finished sessions to Databricks"
            DATA.mkdir(exist_ok=True)
            out = DATA / "closed_sessions.jsonl"
            out.write_text("".join(json.dumps(s) + "\n" for s in closed))
            path = self.notebook_path()
            if not self.deployed:
                self.db("workspace", "mkdirs", path.rsplit("/", 1)[0])
                r = self.db("workspace", "import", path, "--file", str(ROOT / "databricks/notebooks/parent_progress.py"),
                            "--language", "PYTHON", "--format", "SOURCE", "--overwrite")
                if r.returncode != 0:
                    raise RuntimeError(r.stderr.strip()[:200])
                self.db("fs", "mkdir", f"dbfs:{VOL}/parents")
                self.deployed = True
            r = self.db("fs", "cp", str(out), f"dbfs:{VOL}/parents/sessions.jsonl", "--overwrite")
            if r.returncode != 0:
                raise RuntimeError(r.stderr.strip()[:200])
            self.state, self.detail = "analyzing", "Databricks is working out progress and writing notes"
            spec = {"run_name": "wondermoves parent progress",
                    "tasks": [{"task_key": "parent_progress", "notebook_task": {"notebook_path": path}}]}
            r = self.db("jobs", "submit", "--json", json.dumps(spec), "-o", "json", "--timeout", "20m", timeout=1300)
            if r.returncode != 0:
                raise RuntimeError((r.stderr or r.stdout).strip()[-200:])
            dest = DATA / "parent_insights.json"
            r = self.db("fs", "cp", f"dbfs:{VOL}/exports/parent_insights.json", str(dest), "--overwrite")
            if r.returncode != 0:
                raise RuntimeError(r.stderr.strip()[:200])
            self.insights = self._load()
            self.failed_ids = set()
            self.state = "up to date"
            self.detail = time.strftime("Updated %H:%M")
        except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as e:
            self.state = "offline"
            self.failed_at = time.time()
            self.failed_ids = {s["session_id"] for s in closed}
            self.detail = "Can't reach Databricks right now. It will try again by itself. (" + str(e)[:100] + ")"
        finally:
            self.busy = False


# ---------------------------------------------------------------------------
# Web server
# ---------------------------------------------------------------------------

class App:
    def __init__(self, args):
        self.board = BoardLog(args.demo, args.board_path, args.child)
        self.history = load_history() if args.samples else []
        self.databricks = Databricks(not args.no_databricks)
        self.lock = threading.Lock()
        self.sessions: list[dict] = []
        self.refresh()

    def refresh(self):
        with self.lock:
            self.board.poll()
            self.sessions = sessionize(self.history + self.board.events, time.time())
        # Every finished session goes to Databricks (sample history too, for context and charts).
        self.databricks.maybe_sync([s for s in self.sessions if s["closed"]])

    def loop(self):
        while True:
            try:
                self.refresh()
            except Exception as e:   # keep the page alive whatever happens
                self.board.status = f"error: {e}"[:120]
            time.sleep(2)

    def state(self) -> dict:
        ins = self.databricks.insights
        with self.lock:
            sessions = [dict(s, insight=ins.get("sessions", {}).get(s["session_id"])) for s in self.sessions]
        children = sorted({s["child"] for s in sessions} | {self.board.child}, key=lambda c: (c.endswith("(sample)"), c))
        return {"children": children, "sessions": sessions, "daily": ins.get("daily", []),
                "board": self.board.status, "databricks": {"state": self.databricks.state, "detail": self.databricks.detail,
                                                          "updated": ins.get("generated_at")},
                "now": time.time()}


def make_handler(app: App):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(SITE), **kw)

        def log_message(self, *a):
            pass

        def do_GET(self):
            if urlparse(self.path).path == "/api/state":
                body = json.dumps(app.state(), default=str).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def do_POST(self):
            if urlparse(self.path).path == "/api/resend":
                with app.lock:
                    closed = [s for s in app.sessions if s["closed"]]
                app.databricks.maybe_sync(closed, force=True)
                self.send_response(204)
                self.end_headers()
                return
            self.send_error(404)
    return Handler


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--demo", action="store_true", help="use the simulated board log instead of the UNO Q")
    p.add_argument("--board-path", help="path of sessions.jsonl on the board (found automatically)")
    p.add_argument("--child", default="Your child", help="name shown for the board's player")
    p.add_argument("--no-databricks", action="store_true", help="never contact Databricks")
    p.add_argument("--samples", action="store_true", help="also show the simulated sample children (testing only)")
    p.add_argument("--port", type=int, default=8090)
    a = p.parse_args()
    app = App(a)
    threading.Thread(target=app.loop, daemon=True).start()
    print(f"Parent website: http://localhost:{a.port}   (board: {app.board.status})")
    ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(app)).serve_forever()
