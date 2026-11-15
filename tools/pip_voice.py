"""Pip's voice for all WonderMoves games: ElevenLabs "Cherry Twinkle", recorded once, played offline.

Collects every line Pip can say (the games' code, plus tools/voice_lines_extra.txt from walking through every
screen, plus tools/voice_numbers.txt), records each one with ElevenLabs, and lists them in
wondermoves/assets/shared/voice/manifest.json. shared/wm-voice.js plays them. There is no second voice:
a line without a recording stays silent and shows up in WM.Voice.missing in the browser console.

    python3 tools/pip_voice.py lines            # every line, and which ones still need a recording
    python3 tools/pip_voice.py eleven           # record what's missing (re-runs only make new ones)
    python3 tools/pip_voice.py eleven --dry-run # how many characters that would use
    python3 tools/pip_voice.py clean            # remove recordings no line uses any more

Needs ELEVENLABS_API_KEY in the repo's .env (git-ignored), from the team's ElevenLabs Starter account.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "wondermoves" / "assets"
GAMES = ASSETS / "games"
OUT = ASSETS / "shared" / "voice"


def speakable(text: str) -> str:
    out = re.sub(r"[\U0001F000-\U0001FFFF←-⯿☀-➿️‍⃣]", "", text)
    return re.sub(r"\s+", " ", out).strip()


def key(text: str) -> str:
    """Lookup key shared with wm-voice.js."""
    t = speakable(text).lower().replace("’", "'").replace("‘", "'").replace("…", "...")
    t = t.replace("“", '"').replace("”", '"').replace("—", "-").replace("–", "-")
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------------------
# Collect every line
# ---------------------------------------------------------------------------

STR = r"'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`"


def literals(src: str) -> list[str]:
    out = []
    for m in re.finditer(STR, src):
        s = m.group(1) if m.group(1) is not None else m.group(2)
        out.append(s.replace("\\'", "'"))
    return out


def block(src: str, start: str) -> str:
    """The {...} or [...] that follows `start` (empty if missing)."""
    i = src.find(start)
    if i < 0:
        return ""
    i += len(start)
    while i < len(src) and src[i] not in "{[":
        i += 1
    open_ch = src[i]
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    for j in range(i, len(src)):
        depth += src[j] == open_ch
        depth -= src[j] == close_ch
        if depth == 0:
            return src[i:j + 1]
    return ""


def speechy(s: str) -> bool:
    """A string that Pip would say (not a CSS class, id, url or label)."""
    t = speakable(s)
    return (len(t) >= 4 and re.search(r"[A-Za-z]{2}", t) and (" " in t or t.endswith(("!", "?", ".")))
            and not re.search(r"[#<>{}=;]|https?:|\.js|\.css|px\b|^[a-z-]+$", t) and "${" not in t)


def read(p) -> str:
    return (GAMES / p).read_text()


def collect() -> dict[str, str]:
    """{line: category}."""
    lines: dict[str, str] = {}

    def add(text, cat):
        t = speakable(text)
        if t and t not in lines:
            lines[t] = cat

    # Line lists, praise and camera-setup messages
    for f, start, cat in [("treasure-reach/js/data.js", "TR.LINES =", "talk"), ("bubble-pop/js/data.js", "BP.LINES =", "talk"),
                          ("fossil-brush/js/data.js", "FB.LINES =", "talk"), ("fossil-brush/js/trace.js", "const PRAISE =", "cheer"),
                          ("treasure-reach/js/calib.js", "const say =", "instruction"),
                          ("bubble-pop/js/calib.js", "const say =", "instruction"),
                          ("fossil-brush/js/camera.js", "const say =", "instruction")]:
        for s in literals(block(read(f), start)):
            if speechy(s):
                add(s, cat)
    # Tutorials (both mouse and camera wording)
    for f, start in [("treasure-reach/js/ui.js", "tutorialSteps"), ("bubble-pop/js/ui.js", "tutorialSteps"),
                     ("fossil-brush/js/ui.js", "FREE_STEPS:"), ("fossil-brush/js/ui.js", "TRACE_STEPS:")]:
        src = block(read(f), start).replace("${WM.PIP.name}", "Pip").replace("${FB.MASCOT.name}", "Pip")
        for s in literals(src):
            if speechy(s) and len(speakable(s)) > 12:
                add(s, "tutorial")
    # Every plain string given straight to Pip (including both sides of `cond ? 'a' : 'b'`)
    for f in sorted(GAMES.glob("*/js/*.js")):
        src = f.read_text()
        for m in re.finditer(r"\.say\(([^;]*?)(?:,\s*[\d.()*+\-a-zA-Z_ ]+)?\)\s*[;}\n]", src, re.S):
            for s in literals(m.group(1)):
                if speechy(s):
                    add(s, "talk")

    # Lines built from game data
    fb_data, tr_data, trace = read("fossil-brush/js/data.js"), read("treasure-reach/js/data.js"), read("fossil-brush/js/trace.js")
    for name, icon in re.findall(r"name:\s*'(\w+)',\s*color:[^}]*?icon:\s*'([^']+)'", block(fb_data, "FB.RARITIES =")):
        add(f"We reached the {name} zone! Keep going!", "cheer")
    for n in (1, 2):
        add(f"Great reach! {n} more!", "cheer")
    for n in (1, 2, 3):
        add(f"Got it, {n}!", "cheer")
    for name, hold in re.findall(r"name:\s*'(\w+)',\s*emoji:[^}]*?holdMs:\s*(\d+)", block(tr_data, "TR.LEVELS =") or tr_data):
        add(f"{name}! Reach to the star and hold for {int(hold) / 1000:.1f} seconds!", "instruction")
    tr_rar = re.findall(r"id:\s*'(\w+)',\s*name:\s*'(\w+)'", block(tr_data, "TR.RARITIES =") or tr_data)
    rank = {r: i for i, (r, _) in enumerate(tr_rar)}
    names = dict(tr_rar)
    for pname, rarity in re.findall(r"name:\s*'((?:[^'\\]|\\.)*)',\s*emoji:\s*'[^']*',\s*rarity:\s*'(\w+)'", tr_data):
        if rank.get(rarity, 0) >= 2:
            rn = names[rarity]
            add(f"WOW! {'An' if rn[0] in 'AEIOU' else 'A'} {rn} {pname.replace(chr(92), '')}!", "cheer")
    for sname in re.findall(r"name:\s*'([^']+)',\s*emoji:", block(trace, "const SHAPES =") or trace):
        add(f"Watch me draw {sname}!", "instruction")
    # Fossil Brush "treasure found" card (read by wm-voice.js): name, rarity and fact
    add("A new treasure!", "found")
    for name in re.findall(r"name:\s*'(\w+)',\s*color:", block(fb_data, "FB.RARITIES =")):
        add(f"{name}.", "found")
    for name, fact in re.findall(r"name:\s*'((?:[^'\\]|\\.)*)'[^\n]*?fact:\s*'((?:[^'\\]|\\.)*)'", fb_data):
        add(f"You found the {name.replace(chr(92), '')}!", "found")
        add(fact.replace("\\'", "'"), "fact")
    # Voice-command replies (shared/wm-voice.js)
    for t in VOICE_LINES:
        add(t, "voice")
    # Lines found by walking through every screen, and the numbers used inside sentences.
    for f, cat in (("voice_lines_extra.txt", "screen"), ("voice_numbers.txt", "number")):
        path = ROOT / "tools" / f
        if path.exists():
            for row in path.read_text().splitlines():
                if row.strip() and not row.startswith("#"):
                    lines.setdefault(row.strip(), cat) if cat == "number" else add(row, cat)
    return lines


# Pip's spoken replies to voice commands. Keep in sync with REPLY in shared/wm-voice.js.
VOICE_LINES = [
    "I'm listening!", "Okay! Let's play Fossil Brush!", "Okay! Let's play Treasure Reach!", "Okay! Let's play Bubble Pop!",
    "Okay, all done with this game!", "Okay, let's go again!", "Okay, time for a little rest.", "Okay, let's keep going!",
    "Okay, let's begin!", "Okay!", "I didn't catch that. You can say fossil, treasure or bubbles.",
    "You can say: Pip, open fossil. Or: Pip, I'm done. Or: Pip, again!",
    "Let's dig again!", "Here comes a new chest!", "Let's pop more bubbles!",
    'Say "dig again" to find another treasure, or "I\'m done" to stop.',
    'Say "again" for another chest, or "I\'m done" to stop.',
    'Say "again" to play again, or "I\'m done" to stop.',
    'Say "next" to keep going.', 'Say "begin" when you\'re ready!',
    'Say "yes" to turn on the camera, or "mouse" to play without it.',
    "Brush back and forth to dig!", "Reach toward the treasure!", "Lift your hand to pop a bubble!",
]




# ---------------------------------------------------------------------------
# ElevenLabs (the human-sounding voice): every line made once, then played offline
# ---------------------------------------------------------------------------

ELEVEN_VOICE = "XJ2fW4ybq7HouelYYGcL"      # "Cherry Twinkle - Bubbly and Sweet" (ElevenLabs Voice Library)
ELEVEN_MODEL = "eleven_multilingual_v2"
ELEVEN_FORMAT = "mp3_44100_96"
ELEVEN_STYLE = {
    "cheer": {"stability": 0.30, "similarity_boost": 0.75, "style": 0.65, "use_speaker_boost": True},
    "calm": {"stability": 0.50, "similarity_boost": 0.75, "style": 0.30, "use_speaker_boost": True},
    "talk": {"stability": 0.42, "similarity_boost": 0.75, "style": 0.45, "use_speaker_boost": True},
}


# Camera setup is a grown-up's job: these lines stay on screen but Pip doesn't say them (shared/wm-voice.js
# says "A grown-up needs to help set up the camera." once instead). Taken from the camera code itself.
CAMERA_FILES = ["treasure-reach/js/calib.js", "bubble-pop/js/calib.js", "fossil-brush/js/camera.js",
                "../shared/wm-campanel.js", "../shared/wm-hands.js", "../shared/wm-pose.js"]
CAMERA_EXTRA = [
    "Hi, I'm Pip! I need to see your hands to play. Ask a grown-up to turn on the camera!",
    "Let's go under the sea! Ask a grown-up to turn on the camera.",
    "Uh oh, I can't see the camera. We can play with a mouse instead!",
    "Uh oh, I can't see the camera. We can brush with touch or the mouse instead!",
    "This is my camera window. Tap the eye to hide it or show it.",
    'Say "yes" to turn on the camera, or "mouse" to play without it.',
    "Let's use the camera! Sit facing the computer so I can see you.",
]


def camera_lines() -> list[str]:
    out = list(CAMERA_EXTRA)
    for rel in CAMERA_FILES:
        f = (GAMES / rel).resolve()
        if not f.exists():
            continue
        src = f.read_text()
        dq = [m.replace('\\"', '"') for m in re.findall(r'"((?:[^"\\\n]|\\.)*)"', src)]
        for t in literals(src) + dq:
            t2 = speakable(re.sub(r"<[^>]+>", " ", t))
            if "${" in t or not re.search(r"[A-Za-z]{2}", t2) or " " not in t2 or not t2[:1].isupper():
                continue
            if re.search(r"[<>{}=;#]|https?:|\.js|class=", t2) or t2.startswith("All set"):
                continue   # "All set! ..." starts the game: the child should hear it
            out.append(t2)
    return list(dict.fromkeys(out))


def write_camera_list():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "camera-lines.json").write_text(json.dumps(sorted({key(t) for t in camera_lines()}), indent=0, ensure_ascii=False) + "\n")


def eleven_key() -> str:
    import os
    k = os.environ.get("ELEVENLABS_API_KEY")
    env = ROOT / ".env"
    if not k and env.exists():
        for row in env.read_text().splitlines():
            if row.strip().startswith("ELEVENLABS_API_KEY="):
                k = row.split("=", 1)[1].strip().strip('"').strip("'")
    if not k:
        sys.exit("No ElevenLabs key. Put ELEVENLABS_API_KEY=... in the repo's .env file.")
    return k


def eleven_tts(text: str, style: str) -> bytes:
    """One clip through macOS curl (python.org Python can lack root certificates). Key never on the command line."""
    import time
    with tempfile.TemporaryDirectory() as tmp:
        headers = Path(tmp) / "h"
        headers.touch(mode=0o600)
        headers.write_text(f"xi-api-key: {eleven_key()}\nContent-Type: application/json\nAccept: audio/mpeg\n")
        out = Path(tmp) / "out"
        body = json.dumps({"text": text, "model_id": ELEVEN_MODEL, "voice_settings": ELEVEN_STYLE[style]})
        for attempt in range(4):
            r = subprocess.run(["curl", "-sS", "-o", str(out), "-w", "%{http_code}", "-H", f"@{headers}", "--max-time", "90",
                                "-X", "POST", "--data-binary", body,
                                f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}?output_format={ELEVEN_FORMAT}"],
                               capture_output=True, text=True)
            code = r.stdout.strip()
            if r.returncode == 0 and code.startswith("2"):
                return out.read_bytes()
            if code == "429" and attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            detail = out.read_text(errors="replace")[:300] if out.exists() else r.stderr[:300]
            raise RuntimeError(f"ElevenLabs error {code or r.returncode}: {detail}")
    raise RuntimeError("unreachable")


def eleven_style(cat: str, text: str) -> str:
    if cat in ("number",) or re.match(r"^(say |you can say)", text, re.I):
        return "calm"
    if cat in ("cheer", "found") or re.search(r"\b(wow|yay|amazing|great|you did it|nice)\b", text, re.I):
        return "cheer"
    return "talk"


def cmd_eleven(a):
    """Make every line with ElevenLabs. Saves as it goes; re-running only makes what's missing."""
    m = load_manifest(engine="elevenlabs")
    clips = m["clips"]
    lines = collect()
    order = ["voice", "screen", "tutorial", "instruction", "talk", "cheer", "number", "found", "fact"]
    todo = sorted(((t, c) for t, c in lines.items() if key(t) not in clips),
                  key=lambda x: order.index(x[1]) if x[1] in order else len(order))
    chars = sum(len(t) for t, _ in todo)
    print(f"{len(lines)} lines; {len(todo)} still need a clip = {chars} characters")
    if a.dry_run:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    made = used = 0
    for t, c in todo:
        if a.max_chars and used + len(t) > a.max_chars:
            continue
        name = hashlib.sha1(json.dumps([t, ELEVEN_VOICE, ELEVEN_MODEL]).encode()).hexdigest()[:12] + ".mp3"
        try:
            (OUT / name).write_bytes(eleven_tts(t, eleven_style(c, t)))
        except RuntimeError as e:
            print("stopped:", e)
            break
        clips[key(t)] = name
        made += 1
        used += len(t)
        if made % 10 == 0:
            save_manifest(clips, engine="elevenlabs")
            print(f"  {made} made ({used} characters)")
    save_manifest(clips, engine="elevenlabs")
    left = sum(1 for t in lines if key(t) not in clips)
    print(f"made {made} clips ({used} characters); {left} lines still without a clip")


# ---------------------------------------------------------------------------
# Clips
# ---------------------------------------------------------------------------


def load_manifest(engine: str = "elevenlabs") -> dict:
    try:
        m = json.loads((OUT / "manifest.json").read_text())
        if m.get("engine") == engine:
            return m
    except (OSError, ValueError):
        pass
    return {"clips": {}}


def save_manifest(clips: dict, engine: str = "elevenlabs"):
    OUT.mkdir(parents=True, exist_ok=True)
    about = ("Pip's voice: ElevenLabs \"Cherry Twinkle - Bubbly and Sweet\" (Starter plan, commercial license), "
             "made by tools/pip_voice.py eleven.")
    (OUT / "manifest.json").write_text(json.dumps({
        "about": about, "engine": engine, "voice": ELEVEN_VOICE, "clips": clips,
    }, indent=1, ensure_ascii=False) + "\n")


def cmd_lines(_a):
    lines, have = collect(), load_manifest()["clips"]
    for t, c in sorted(lines.items(), key=lambda x: (x[1], x[0])):
        print(f"{'  ' if key(t) in have else 'NEW'} {c:11s} {t}")
    print(f"\n{len(lines)} lines, {sum(key(t) not in have for t in lines)} still need a clip")


def cmd_clean(_a):
    """Remove clip files no longer listed in the manifest (old voice, removed lines)."""
    keep = set(load_manifest()["clips"].values()) | {"manifest.json", "camera-lines.json"}
    n = 0
    for f in OUT.glob("*"):
        if f.is_file() and f.name not in keep:
            f.unlink()
            n += 1
    print(f"removed {n} old files")




if __name__ == "__main__":
    pa = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = pa.add_subparsers(dest="cmd", required=True)
    sub.add_parser("lines").set_defaults(fn=cmd_lines)
    sub.add_parser("clean").set_defaults(fn=cmd_clean)
    el = sub.add_parser("eleven")
    el.add_argument("--dry-run", action="store_true")
    el.add_argument("--max-chars", type=int, default=0)
    el.set_defaults(fn=cmd_eleven)
    args = pa.parse_args()
    args.fn(args)
