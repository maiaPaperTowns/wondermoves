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

## 2. Treasure Reach: "dig box" (Distance sensor)

```
 child's side                                              far side
 ┌────────────┐                                    ┌──────────────────┐
 │ hand rest  │  ◄──────── 25–35 cm ────────►     │ Distance sensor  │
 │ (towel)    │      reach path (tape arrow)       │ upright, chip    │
 └────────────┘                                    │ facing the hand  │
                                                   │ "cave wall" box  │
                                                   └──────────────────┘
```

1. **Hand rest:** fold a towel, or use a foam block, so the forearm is supported at the start position. Mark it with tape. This is where calibration records the resting distance.
2. **Sensor wall:** cut a cardboard "cave wall", about 15 × 10 cm, and tape the Distance sensor upright so its small black chip faces the hand.
   - Mount it at hand height, roughly 4–6 cm above the table.
   - The beam is narrow, about 18°, so aim it straight at the back or palm of the hand. A sleeve or fingers sticking out can give odd readings.
3. **Path:** add a tape arrow from the rest towards the wall and decorate it as a dig tunnel. Don't mark targets. The game sets them from calibration and the caregiver's limit.
4. **Check:** with the hand resting, the portal's meter should be empty. Moving the hand a few cm forward should fill it.

## 3. Fossil Brush: "explorer brush" (Movement sensor)

Pick whichever is easier for the child's grip:

- **Chunky brush:** tape the Movement board inside a thick foam handle, such as pipe insulation or a rolled-up sponge, with a paintbrush head on the end. Big handles are easier to hold with a weak grip.
- **Wrist cuff:** a velcro strap or soft hair tie over a sleeve, with the sensor on the back of the hand or forearm. Use this if the child can't hold the brush.

Run the cable along the arm, not across the hand, with slack so it never pulls. Qwiic cables are short, so ask the organisers for a longer Qwiic cable. Another option is to put the Movement sensor first in the chain, right off the board, so it gets the full cable length.

Make a "fossil" tray to brush over: a shallow box lid with a printed dinosaur bone and some sand or paper confetti.

## 4. Bubble Pop Adventure (camera)

```
   screen / monitor  ←  bubbles float here, inside the caregiver-set reach area
          ▲
   Brio camera on top of the screen, 1–1.5 m from the child, both arms in view
          │
        child seated, both hands free (no object to hold)
```

1. Put the Brio on top of the monitor, or on a stack of books just below it, facing the child. Both arms must be in view when stretched out.
2. Use a plain background and good light from the front, not a bright window behind the child.
3. The view is mirrored like a mirror: moving the right hand moves the orange **R** dot. The green **L** dot is the left hand.
4. Colourful bubbles pop with either hand. **Blue pair bubbles** joined by a dotted line need both hands at the same time, one on each side.
5. The caregiver sets the **reach area** (Small → Extra large) in the Grown-ups tab. Bubbles only appear inside it, and it never grows by itself.
6. No timer: bubbles float gently until they're popped, and Break stops the game at any time.

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
