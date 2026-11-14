# Getting a sketch to build on a fresh UNO Q (MadHacks workarounds)

These are the problems we hit on our kit boards, and the fixes.

## 1. `adb shell` needs `TMPDIR=/tmp`

`adb shell` sets `TMPDIR=/data/local/tmp`, Android's temp folder, which doesn't exist on the UNO Q's Debian.
`arduino-app-cli app start` then fails with `Stat /Data/Local/Tmp: No Such File Or Directory`. Always run:

```bash
adb shell 'export TMPDIR=/tmp; arduino-app-cli app restart user:wondermoves'
```

(App Lab's own Run button isn't affected.)

## 2. Board clock is wrong, so library downloads fail

The board boots believing it is 9 Sep 2025, and UWNet blocks NTP. Every HTTPS download fails with
"certificate not valid yet". Fix it without the internet: copy the library zips (downloaded on a laptop with the right
clock) into arduino-cli's download cache. arduino-cli then reports "already downloaded" and installs them:

```bash
adb push board/libzips/. /home/arduino/.arduino15/staging/libraries/
```

## 3. Library names and versions must match the board's index

The board's `library_index.json` is from Nov 2025. Arduino's own examples pin `Modulino (0.5.0)`,
which isn't in that index ("Library 'Modulino' not found"). We use **`Arduino_Modulino (0.6.1)`**
and `ArxTypeTraits (0.3.2)`, which the board already caches. See `wondermoves/sketch/sketch.yaml`.

## 4. Port 7000 on a Mac

AirPlay Receiver uses port 7000 on the Mac, so forward to another port:

```bash
adb forward tcp:7070 tcp:7000   # then open http://127.0.0.1:7070
```

## 5. Default app at boot

```bash
adb shell 'arduino-app-cli properties set default user:wondermoves'
```

The camera must be plugged in **before** the app starts, because App Lab only passes in the video devices present at start.
