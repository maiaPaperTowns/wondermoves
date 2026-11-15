# WonderMoves web games

A shell page that holds several movement games. You switch between them with big tabs at the bottom.

## Run it

Serve the folder and open it in Chrome:

```bash
cd web
python3 -m http.server 8000   # then visit http://localhost:8000
```

**The camera needs a server.** Chrome blocks the camera for games inside the shell when the shell is opened straight from disk as a `file://` URL. Everything else, including mouse play, also works from `file://`.

To open a specific game directly, add its id to the URL, for example `index.html#bubble-pop`. The shell also remembers the last tab you played.

## Layout

```
web/
  index.html, shell.css, shell.js   the frame + bottom tab bar
  shared/
    wm-base.css                     shared look: colors, font, buttons, cards
    wm-pip.css / wm-pip.js          Pip: bottom-left helper bubble + spotlight tutorial
    wm-hands.js                     webcam hand tracking (MediaPipe, on-device)
    wm-sound.js                     synthesized sound effects
    wm-bridge.js                    game ↔ shell messaging helper
    assets/                         mascot, favicon
  games/
    fossil-brush/                   Fossil Brush (Copy Pip + Free Play)
    treasure-reach/                 Treasure Reach (camera reach + calibration, or mouse)
    bubble-pop/                     placeholder: coming soon (bubbles can be popped)
```

## How games plug in

Each game is a standalone page. The shell loads it in an `<iframe>` the first time its tab is opened. After that the game stays loaded, so it keeps its progress while you switch tabs.

To add a game:

1. Create `games/<id>/index.html`.
2. Add an entry to `GAMES` at the top of `shell.js`:

   ```js
   { id, name, icon, color, deep, src }
   ```

   `color` and `deep` are a main color and a darker shade, used for the tab.

**Messages**, sent with `postMessage`. Every message has `source: 'wondermoves'`.

| Direction | Message | Meaning |
| --- | --- | --- |
| shell → game | `{ type: 'visibility', visible }` | Sent when the player switches tabs. Pause, mute or resume here. |
| game → shell | `{ type: 'switch', game: '<id>' }` | Ask the shell to open another game. |

New games can include `shared/wm-bridge.js` and use these calls:

```js
WM.bridge.onVisibility(v => v ? resume() : pause());
WM.bridge.send('switch', { game: 'fossil-brush' });
```

Fossil Brush doesn't use the helper, so it stays fully standalone. It listens for the visibility message directly in `js/main.js` and mutes itself while hidden.

## Planned: camera panel

The **Touch & mouse** pill on the right of the tab bar is a placeholder. It will become the camera / finger-tracking status. The camera panel, where Pip helps the child get their finger in frame, is planned to live in the shell, not in each game, so every game shares one camera setup.

The iframes already allow `camera`, so a shell-level camera can later send finger positions down to the active game through the bridge.
