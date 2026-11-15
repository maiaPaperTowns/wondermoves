/* ==========================================================================
   WonderMoves board bridge: drives Fossil Brush from the Modulino Movement sensor.

   Rule (docs/evidence-brief.html): respond to COMPLETION of the movement, not its speed.
   The board counts completed back-and-forth strokes (python/strokes.py) and sends
   `brush_stroke` once per stroke. Each stroke plays one fixed-length sweep of the virtual
   brush over the treasure (Free Play), so every completed stroke clears the same amount
   of sand, slow or fast. Uses the same DigSite.brushStroke() as touch input.
   Only active when served by the UNO Q app (via ../../shared/wm-board.js); opened
   standalone, it does nothing and touch / mouse / camera play work as before.
   ========================================================================== */
(function () {
  const FB = window.FB;
  if (!FB || !FB.Game || !window.WM || !WM.Board) return;

  const SWEEP_FRAMES = 24;     // one stroke = one sweep of fixed length (~0.4 s on screen)
  const PHASE_STEP = 0.16;     // constant brush speed on screen, whatever the child's speed
  const cursor = document.getElementById('brushCursor');
  let pending = 0, framesLeft = 0, phase = 0, prev = null, strokes = 0, started = false;
  const queueStroke = () => { pending = Math.min(pending + 1, 3); strokes++; };

  function startOnBoard() {
    if (started || !WM.Board.available) return;
    const s = WM.Board.sensors;
    if (s && s.movement === false) return;          // no Movement sensor: keep touch / camera play
    started = true;
    if (FB.Game.mode !== 'free') FB.Game.setMode('free');
    WM.Board.send('start', { game: 'brush' });
  }

  WM.Board.on('brush_stroke', queueStroke);
  WM.Board.on('gesture_uncertain', () => FB.Buddy && FB.Buddy.say('Brush back and forth, nice and big! 🖌️', 2200));
  WM.Board.on('sensors', () => { if (!started && document.visibilityState === 'visible') startOnBoard(); });
  WM.Board.ready(() => { if (document.visibilityState === 'visible') startOnBoard(); });
  if (WM.bridge) WM.bridge.onVisibility(v => {
    if (v && started) WM.Board.send('start', { game: 'brush' });   // back on this tab: brush game again
    else if (v) startOnBoard();
  });
  window.WM_brush = { stroke: queueStroke, count: () => strokes };  // test hook

  function tick() {
    requestAnimationFrame(tick);
    const G = FB.Game, site = FB.site;
    if (!framesLeft && pending && site && G.canDig()) { pending--; framesLeft = SWEEP_FRAMES; }
    if (!framesLeft || !site || !G.canDig()) {
      prev = null;
      if (cursor && cursor.dataset.sensor) { cursor.classList.remove('show', 'brushing'); delete cursor.dataset.sensor; }
      return;
    }
    framesLeft--;
    phase += PHASE_STEP;
    const f = site.fossilScreen();
    const reach = Math.max(f.r * 1.4, site.layout.S * 0.12);
    const x = f.x + Math.sin(phase) * reach;
    const y = f.y + Math.sin(phase * 0.5) * reach * 0.6;
    if (prev) {
      const removed = site.brushStroke(prev.x, prev.y, x, y, G.params());
      if (removed > 0.02) {
        site.spawnDust(x, y, x - prev.x, y - prev.y, Math.min(6, 1 + Math.round(removed * 0.4)));
        FB.Sound.brush(0.15);
        G.lastBrushAt = performance.now();
        G.afterBrush();
      }
    }
    prev = { x, y };
    if (cursor) {
      cursor.dataset.sensor = '1';
      cursor.classList.add('show', 'brushing');
      cursor.style.transform = `translate(${x - 6}px, ${y - 58}px)`;
    }
  }
  requestAnimationFrame(tick);
})();
