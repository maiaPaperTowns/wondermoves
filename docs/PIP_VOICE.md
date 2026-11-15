# Pip's voice and voice commands

Owner: @ArneshXCode. Works in every game through the shell, using the hooks in `wondermoves/assets/SHELL-README.md`
("Plugging in the AI voice agent"). The games themselves are unchanged; the only edit outside `shared/` is one
`<script>` line at the end of `wondermoves/assets/index.html`.

## 1. Everything is spoken

Built for children who are blind or have low vision: **everything a child can see is also said out loud**, in one voice.

- **Home:** "Welcome! Choose your game: Treasure Reach, Fossil Brush, or Bubble Pop." The child says a game and it opens.
- **Camera setup:** "A grown-up needs to help set up the camera.", then each step's big title ("Let's set up the
  camera!", "Move your hands back to the start") and its instructions, plus the live tips ("Pull both hands back behind
  the start line"). Not the step list, privacy note or button names.
- **Treasure found:** only the treasure's name and its fact ("Dino Bone!" + the fact). Pressing any button stops Pip at once.
- **Treasure Reach, after each chest:** "Now pull both hands back toward you, to get a new chest!" (or the sensor /
  mouse version), after the name and fact, and again every few seconds until the hands are back.
- **Pip's speech bubble and every tutorial step**, in the game on screen.
- **Every other card, pop-up and menu** as it appears or changes: level picker, set complete, collection,
  treasure found, results, break card, the treasure label over an opened chest, the Menu. Then Pip says the
  buttons: "You can say "Easy", "Medium", "Hard" or "Start!"."
- **Bubble Pop's countdown** (drawn on the canvas): 4, 3, 2, 1, Pop!
- **Hints** so a child always knows what to say: when a round ends ("Say "dig again" to find another treasure…"),
  on start screens ("Say "begin"…"), in tutorials.
- Short forms on screen are said in full ("49 m" → "49 meters", "87%" → "87 percent", "5 / 12" → "5 of 12"), and the
  child's nickname is said as "explorer" (the recordings can't know every name, and it stays private).

**Voice:** ElevenLabs "Cherry Twinkle – Bubbly and Sweet" (voice id `XJ2fW4ybq7HouelYYGcL`), made once and saved in
`shared/voice/`, so it plays **offline**. Lines with changing numbers are stitched from recorded pieces and recorded
numbers in the same voice. **There is no second voice:** a line without a recording stays silent and is listed in
`WM.Voice.missing` in the browser console, so it can be recorded. A changing card is read at most every 3.5 s.

**If you change or add a line:** run `python3 tools/pip_voice.py eleven` (needs `ELEVENLABS_API_KEY` in the repo's
`.env`, made on the team's ElevenLabs Starter account). It only makes what's missing. For a new card or screen, walk
through it once with the voice on and add any line `WM.Voice.missing` shows to `tools/voice_lines_extra.txt`.

Browsers only allow sound after the first tap or key press on the page: a grown-up taps once before a child starts.

## 2. Talking to Pip

Tap **🎤 Talk to Pip** on Home (top right) once and allow the microphone. With a child profile on the board, Pip only
listens when a grown-up switched on *Let Pip talk with my child by voice* in Settings.

| Say | What happens |
|---|---|
| "Pip, open the fossil game" · "bubbles!" · "treasure please" | Opens that game |
| "begin" · "start" · "next" · "yes" · "let's go" | Start / Next / Let's go |
| "again" · "dig again" · "Pip, let's dig" · "play again" | Play again / Dig again / Keep going |
| "I'm done" · "exit" · "go home" | Back to Home (in Bubble Pop: its own "I'm done") |
| "pause" · "I need a break", then "keep going" | Rest, then carry on |
| **The name of any button on screen**: "Hard", "Collection", "Free Play", "Change level", "Show me" | Presses it |
| "close" | Closes the open card or menu |
| On the camera screen (for the grown-up): "yes" / "mouse" | Turn on camera / play without it |
| "help" · "repeat" · "say that again" | How to play / Pip repeats what to do now |

- Short commands work with or without "Pip"; longer sentences need "Pip", so grown-ups talking nearby don't trigger
  anything. Everyday words ("okay", "yes") only count right after Pip asks something or with "Pip" in front.
- Commands work while Pip is talking and stop Pip. Pip ignores its own voice.
- If there's nothing to press (e.g. "next" in the middle of a dig), Pip says again what to do instead of staying silent.
- The 🎤 pill shows what was heard and what Pip did.
- Speech becomes text **on this computer** with Whisper (tiny, English), offline; nothing is recorded or kept.
- Buttons always keep working. Kids with CP may speak less clearly; voice is an extra way in, not the only one.

**Test without a microphone** (browser console on the shell page): `WM.Voice.handleHeard('dig again')` runs a heard
phrase through the same path; `WM.Voice.testHear('shared/speech/test-done.wav')` plays a recording through the mic path.

## Files

| File | What |
|---|---|
| `shared/wm-voice.js` | Narrator, voiceover player, microphone, command matching |
| `shared/voice/` | ElevenLabs clips + `manifest.json` |
| `shared/speech/wm-listen-worker.js`, `lib/`, `models/` | Whisper speech-to-text (transformers.js 4.3.2, offline) |
| `tools/pip_voice.py` | Collects every line (code + `tools/voice_lines_extra.txt` + `tools/voice_numbers.txt`), makes clips |

Credits: voice by ElevenLabs (Starter plan, commercial license). Whisper by OpenAI (MIT), transformers.js (Apache-2.0),
onnxruntime (MIT).
