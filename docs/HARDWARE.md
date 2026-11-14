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
- Unplug power before adding or removing Modulinos, and pull the white plug, not the wires.
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

## 4. Two-Hand Treasure: "treasure chest" (camera)

```
            Brio camera, 60–80 cm away, slightly above, both hands in frame
                                   ▼
        ┌─────────────────────────────────────────┐
        │   helper hand          active hand       │
        │   rests on / steadies  turns the key or  │
        │   the chest            lifts the lid     │
        │      ┌───────────────────────┐           │
        │      │   cardboard chest 🧰  │──(key)    │
        │      └───────────────────────┘           │
        └─────────────────────────────────────────┘
```

1. Make a chest from a small cardboard box with a hinged lid and a big cardboard "key" or knob on the side.
2. The helper hand (set in the Grown-ups tab, often the affected side) rests on top of the chest to hold it steady. The active hand turns the key or lifts the lid.
3. Camera setup: put the Brio about 60–80 cm away, slightly above table height. Use a plain background and good light, and keep both hands in view. The portal draws two dots (green for the helper, orange for the mover), so you can check the framing without any video showing.
4. Optional upgrade: tape a second Movement sensor, from another kit, inside the chest. The IMU then measures how steady the helper hand holds it, which is more reliable than the camera. Needs a small code change.

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
