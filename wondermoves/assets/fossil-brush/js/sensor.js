/* ==========================================================================
   WonderMoves bridge: drives Fossil Brush from the Modulino Movement sensor.

   When the page is served by the UNO Q app, socket.io is available. The board
   streams `brush_motion` {energy: deg/s} about 10x a second while the child moves
   the sensor brush. We turn that into a virtual brush sweeping over the buried
   treasure, using the same DigSite.brushStroke() the touch input uses.
   Opened standalone (no board), socket.io is missing and this file does nothing,
   so touch/mouse play still works.
   ========================================================================== */
(function () {
  const FB = window.FB;
  if (typeof window.io !== 'function' || !FB || !FB.Game) return;

  const MIN_ENERGY = 15;   // deg/s; below this the hand is resting
  const FULL_ENERGY = 90;  // deg/s; at or above this the brush moves at full speed
  const socket = window.io(`http://${location.host}`);
  const cursor = document.getElementById('brushCursor');
  let energy = 0, lastMsg = 0, phase = 0, prev = null;

  socket.on('connect', () => socket.emit('start', { game: 'brush' }));
  socket.on('brush_motion', d => { energy = d.energy; lastMsg = performance.now(); });
  socket.on('gesture_uncertain', () => FB.Buddy && FB.Buddy.say('Try a gentle brush, back and forth! 🖌️', 2200));
  window.addEventListener('pagehide', () => socket.emit('pause', {}));

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
    const active = site && G.canDig() && performance.now() - lastMsg < 400 && energy >= MIN_ENERGY;
    if (!active) {
      prev = null;
      if (cursor && cursor.dataset.sensor) { cursor.classList.remove('show', 'brushing'); delete cursor.dataset.sensor; }
      return;
    }
    // Sweep a figure-of-eight over the treasure; faster movement = faster sweep.
    const speed = Math.min(1, (energy - MIN_ENERGY) / (FULL_ENERGY - MIN_ENERGY));
    phase += 0.06 + 0.22 * speed;
    const f = site.fossilScreen();
    const reach = Math.max(f.r * 1.4, site.layout.S * 0.12);
    const x = f.x + Math.sin(phase) * reach;
    const y = f.y + Math.sin(phase * 0.5) * reach * 0.6;
    if (prev) {
      const removed = site.brushStroke(prev.x, prev.y, x, y, G.params());
      if (removed > 0.02) {
        site.spawnDust(x, y, x - prev.x, y - prev.y, Math.min(6, 1 + Math.round(removed * 0.4)));
        FB.Sound.brush(Math.min(0.3, 0.08 + speed * 0.2));
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
