# Hardware build guide

Built with what's in the kit plus hackathon supplies: cardboard, tape, velcro or hair ties, foam or a towel.
Everything that touches the child is soft, light and removable. No sensor is fixed to the body tightly.

## 1. Electronics (one station)

```
Power brick ──► StarTech dock (PD in) ──USB-C──► UNO Q
                     ├── USB: Logitech Brio 105
                     ├── HDMI: monitor or TV (child + parent portal)
                     └── USB: keyboard/mouse (setup only)

UNO Q [QWIIC] ──► Modulino Thermo ──► Modulino Distance ──► Modulino Movement
```

- The Qwiic chain order doesn't matter, because every Modulino has its own I2C address. Put whichever sensor needs the longest reach at the end of the chain.
- Unplug power before adding or removing Modulinos, and pull the white plug, not the wires. Hot-plugging froze our I2C bus once, and only a restart fixed it.
- **Troubleshooting:** the Grown-ups tab shows each sensor's status and, while any sensor is missing, a live I2C scan
  (`Thermo 0x44`, `Distance 0x29`, `Movement 0x6a`). If a sensor disappears only when it sits *after* a certain
  board, that board's second socket is bad. Put that board at the **end** of the chain. On our kit, the Thermo's
  second socket was dead, so the working chain is **board → Movement → Distance → Thermo**.
- **Dev mode:** board ⇄ Mac over USB-C, which gives `adb` and the portal at http://127.0.0.1:7070 via `adb forward tcp:7070 tcp:7000`.
- **Demo mode:** board on the dock with the camera. The portal opens in the board's own browser on the HDMI screen at http://localhost:7000. Everything runs on the Qualcomm chip.
- UWNet blocks device-to-device traffic. To reach the board from the Mac in demo mode, put both on the same phone hotspot.

## 2. Treasure Reach: "dig tunnel" (Distance sensor)

The Distance sensor sees a narrow cone, about **18°**: only **~6 cm wide at 20 cm**. A hand resting freely on the
table drifts out of it, and a sensor sitting on the table sees the table instead. In testing, that caused almost every
failed run. The tunnel keeps the hand in the beam without the child having to aim.

```
 SIDE VIEW                                              TOP VIEW
                     beam (18°)                         ┌───────────── wall (8 cm high) ─────┐
 hand ▄▄  ·  ·  ·  ·  ·  ·  ·  ·  ◄ chip                │ [hand rest] ──reach──►   ◄ sensor  │
 ═towel═                          ▐ sensor on box       └───────────── wall ─────────────────┘
 ─────── table ──────────────────────────────            walls 8 cm apart, tunnel ~30 cm long
   chip and hand both ~5 cm above the table; rest ~10 cm from the chip
```

**Build (about 15 minutes):**
1. **Sensor wall.** Tape the Distance sensor upright to the side of a small box or a stack of books so the **chip is
   about 5 cm above the table**, facing straight along the tunnel. Make sure nothing (tape, cardboard lip, cable)
   sits in front of the chip: anything within ~4 cm reads as a fake target.
2. **Hand rest at the same height.** A folded towel on a book, so the resting hand's centre is also ~5 cm up,
   **about 10 cm** from the chip. (Measured: a hand closer than ~14 cm reads cleanly; farther, its weak return
   competes with the sensor's own window reflection and drops out.) Mark the spot with tape.
3. **Tunnel walls.** Two cardboard strips, ~30 cm long and 8 cm high, taped down **8 cm apart** from the rest to the
   sensor. The hand slides forward between them, so it stays in line.
4. **Check before calibrating.** Grown-ups tab → "Distance:" must show a **steady number** (about "100 mm") with the hand
   at rest, and drop by ~50 mm when the hand moves 5 cm closer. Keep the chip window clean (no fingerprints). "Nothing in range" means the hand is out of the beam:
   adjust the sensor's height or tilt, not the child.
5. **Decorate:** the far wall is the "cave", the tunnel is the "dig path". Keep the floor of the tunnel matte (no foil).

## 3. Fossil Brush: "explorer brush" (Movement sensor)

Pick whichever is easier for the child's grip:

- **Chunky brush:** tape the Movement board inside a thick foam handle, such as pipe insulation or a rolled-up sponge, with a paintbrush head on the end. Big handles are easier to hold with a weak grip.
- **Wrist cuff:** a velcro strap or soft hair tie over a sleeve, with the sensor on the back of the hand or forearm. Use this if the child can't hold the brush.

Run the cable along the arm, not across the hand, with slack so it never pulls. Qwiic cables are short, so ask the organisers for a longer Qwiic cable. Another option is to put the Movement sensor first in the chain, right off the board, so it gets the full cable length.

Make a "fossil" tray to brush over: a shallow box lid with a printed dinosaur bone and some sand or paper confetti.

## 4. Bubble Lift (camera)

```
   screen / monitor  ←  bubbles float here, inside the caregiver-set reach area
          ▲
   Brio camera on top of the screen, 1–1.5 m from the child, both arms in view
          │
        child seated, both hands free (no object to hold)
```

1. Put the Brio on top of the monitor, or on a stack of books just below it, facing the child. Both arms must be in view when stretched out.
2. **Tilt it down** so the child's head is near the top of the picture and the resting hands are mid-picture.
   Measured on our setup: aimed too high, the hands sat at the bottom edge and were tracked in ~30% of frames;
   after tilting, left 100% / right 57% / both 57%, and the first real pair pop.
3. Use a plain background and good light from the front, not a bright window behind the child.
4. The view is mirrored like a mirror: moving the right hand moves the orange **R** dot. The green **L** dot is the left hand.
5. One movement: rest both hands on the table; a bubble appears directly above one hand, and lifting that hand straight up pops it. **Blue pairs** need both hands up together.
6. The caregiver sets the **lift height** (Small → Extra large) in the Grown-ups tab. It never grows by itself.
7. No timer: a bubble waits until it is popped, and the next one only counts after the hand comes back to rest.

## 5. Station checklist

- [ ] Child sits with feet supported and the table at elbow height.
- [ ] All cables taped down, out of the path of the arm.
- [ ] No sensor touches the child except a soft cuff, if used.
- [ ] The caregiver has set the approved maximum reach and the helper hand in the Grown-ups tab.
- [ ] Break button visible, Digger voice on, subtitles visible.
- [ ] All kit packaging and anti-static bags kept for the return.

## Materials shopping list

Cardboard boxes (2 small, 1 shoebox), masking tape, velcro strap or hair ties, pipe insulation or a sponge, a cheap paintbrush,
a towel or foam block, printouts of fossils and gems, sand or confetti, and longer Qwiic cables if the organisers have them.
