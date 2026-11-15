# WonderMoves web games

A shell page that holds several movement games. You switch between them with big tabs at the bottom.

## Run it

Serve the folder and open it in Chrome:

```bash
cd web
python3 -m http.server 8000   # then visit http://localhost:8000
```

**The camera needs a server.** Chrome blocks the camera for games inside the shell when the shell is opened straight from disk as a `file://` URL. Everything else, including mouse play, also works from `file://`.

The shell opens on **Home**: Pip says hello, shows today's moves from the board, and has a big card for each game. Games load only when picked, so the camera isn't asked for on Home. To open a specific game directly, add its id to the URL, for example `index.html#bubble-pop`.

Grown-ups reach the parent page from **For grown-ups** on Home or **Grown-ups** in the tab bar (`parents/`, served by the board). It links to Settings (`grownups.html?settings`) and back to the games.

## Layout

```
web/
  index.html, shell.css, shell.js   the frame, Home screen + bottom tab bar
  parents/index.html                the grown-ups page: child profile, game log, Databricks notes
  shared/
    wm-base.css                     shared look: colors, font, buttons, cards
    wm-pip.css / wm-pip.js          Pip: bottom-left helper bubble + spotlight tutorial
    wm-ui.css                       game chrome: top bar, side meter, menu drawer, cards
    wm-campanel.css / .js           camera window: big for calibration, docked bottom-left
    wm-hands.js                     webcam hand tracking (MediaPipe, on-device)
    wm-pose.js                      head & shoulders framing (MediaPipe pose, on-device)
    wm-sound.js                     synthesized sound effects
    wm-bridge.js                    game ↔ shell messaging helper
    assets/                         mascot, favicon
  games/
    fossil-brush/                   Fossil Brush (Copy Pip + Free Play)
    treasure-reach/                 Treasure Reach (camera reach + calibration, or mouse)
    bubble-pop/                     Bubble Pop (under the sea, 60 s sessions, camera or mouse)
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

Treasure Reach still uses its own copy of the camera panel and top-bar styles. Bubble Pop uses the shared `wm-campanel` and `wm-ui`. Moving Treasure Reach over to them is a small follow-up.

The **Touch & mouse** pill on the right of the tab bar is a placeholder. It will become the camera / finger-tracking status. The camera panel, where Pip helps the child get their finger in frame, is planned to live in the shell, not in each game, so every game shares one camera setup.

The iframes already allow `camera`, so a shell-level camera can later send finger positions down to the active game through the bridge.

## Plugging in the AI voice agent (Talk to Pip)

The shell has two hooks so a voice agent can be added without touching the games:

- **Where the button goes:** `#voiceSlot`, top right of the Home screen. It's hidden while empty, so add the
  button from your script (for example `document.getElementById('voiceSlot').append(btn)`).
- **What screen the child is on:** the shell fires `wm:screen` on `window` every time the screen changes:

  ```js
  window.addEventListener('wm:screen', e => {
    // e.detail = { screen: 'home' | 'fossil-brush' | 'treasure-reach' | 'bubble-pop', name: 'Treasure Reach' }
  });
  ```

- **Opening a game by voice:** call `location.hash = '#treasure-reach'` (or `'#home'`).

Load the agent with one `<script>` tag at the end of `index.html`. Keep the project rules: no timers, no
scores or comparisons, a slow movement counts like a fast one, and nothing recorded or sent without a
grown-up's say-so.
