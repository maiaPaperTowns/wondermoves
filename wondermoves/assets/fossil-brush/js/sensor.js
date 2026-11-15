/* ==========================================================================
   WonderMoves bridge: drives Fossil Brush from the Modulino Movement sensor.

   Rule (docs/evidence-brief.html): respond to COMPLETION of the movement, not its speed.
   The board counts completed back-and-forth strokes (python/strokes.py) and sends
   `brush_stroke` once per stroke. Each stroke plays one fixed-length sweep of the virtual
   brush over the treasure, so every completed stroke clears the same amount of sand,
   whether it was slow or fast. Uses the same DigSite.brushStroke() as touch input.
   Opened standalone (no board), socket.io is missing and this file does nothing,
   so touch/mouse play still works.
   ========================================================================== */
(function () {
  const FB = window.FB;
  if (typeof window.io !== 'function' || !FB || !FB.Game) return;

  const SWEEP_FRAMES = 24;     // one stroke = one sweep of fixed length (~0.4 s on screen)
  const PHASE_STEP = 0.16;     // constant brush speed on screen, whatever the child's speed
  const socket = window.io(`http://${location.host}`);
  const cursor = document.getElementById('brushCursor');
  let pending = 0, framesLeft = 0, phase = 0, prev = null, strokes = 0;

  socket.on('connect', () => socket.emit('start', { game: 'brush' }));
  socket.on('brush_stroke', () => { pending = Math.min(pending + 1, 3); strokes++; });
  socket.on('gesture_uncertain', () => FB.Buddy && FB.Buddy.say('Brush back and forth, nice and big! 🖌️', 2200));
  window.addEventListener('pagehide', () => socket.emit('pause', {}));
  window.WM_brush = { stroke: () => { pending = Math.min(pending + 1, 3); strokes++; }, count: () => strokes };  // test hook

  // Way back to the WonderMoves portal (only shown when running on the board).
  const back = document.createElement('a');
  back.href = '../index.html';
  back.textContent = '⬅ WonderMoves';
  back.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;padding:12px 18px;border-radius:16px;' +
    'background:#fff;color:#2b1a0e;font:600 18px Fredoka,system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 8px #0003';
  document.body.appendChild(back);

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
