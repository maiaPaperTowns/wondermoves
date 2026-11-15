/* ==========================================================================
   WM.Board: connects a game to the WonderMoves UNO Q app (Modulino sensors,
   on-device pose tracking, calibration, caregiver limits, session log).
   --------------------------------------------------------------------------
   Only active when the page is served by the board app (it loads the board's
   socket.io from ../libs/). Opened standalone, WM.Board.available stays false
   and games keep using the browser camera or the mouse.

   Usage in a game:
     WM.Board.ready(() => { if (WM.Board.available) ... });
     WM.Board.on('reach_progress', d => ...);       // board → game events
     WM.Board.send('start', { game: 'reach_ui' });  // game → board messages
     WM.Board.profile                               // calibration + caregiver limits
   ========================================================================== */
window.WM = window.WM || {};

WM.Board = (function () {
  const handlers = {};
  const readyFns = [];
  let socket = null, settled = false;

  const B = {
    available: false, connected: false,
    profile: null,      // { baseline_mm, comfortable_mm, approved_max_mm, level, lift_height, ... }
    sensors: null,      // { distance, movement, thermo, distance_hz, imu_hz, last_distance_mm }
    reachMm: null, reachAt: 0,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); if (socket) socket.on(ev, fn); },
    send(ev, data) { if (socket) socket.emit(ev, data || {}); },
    /** Runs fn once we know whether a board is there (immediately if already known). */
    ready(fn) { settled ? fn() : readyFns.push(fn); },
  };
  const settle = () => { if (settled) return; settled = true; readyFns.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };
  const merge = p => { if (p) B.profile = Object.assign(B.profile || {}, p); };

  const here = document.currentScript && document.currentScript.src;
  if (!here || !/^https?:/.test(location.protocol)) { settle(); return B; }

  const s = document.createElement('script');
  s.src = new URL('../libs/socket.io.min.js', here).href;
  s.onerror = settle;  // not served by the board: no socket.io next to us
  s.onload = () => {
    if (typeof window.io !== 'function') return settle();
    socket = window.io(`${location.protocol}//${location.host}`);
    Object.entries(handlers).forEach(([ev, fns]) => fns.forEach(fn => socket.on(ev, fn)));
    socket.on('connect', () => { B.connected = true; socket.emit('get_state', {}); });
    socket.on('disconnect', () => { B.connected = false; });
    ['profile', 'calibration_done', 'limits_updated'].forEach(ev => socket.on(ev, merge));
    socket.on('sensors', st => { B.sensors = st; });
    socket.on('reach_progress', d => { B.reachMm = d.reach_mm; B.reachAt = performance.now(); });
    // The board answers get_state with 'profile'; treat that as "board is here".
    socket.once('profile', () => { B.available = true; settle(); });
    setTimeout(settle, 2500);  // board not answering: carry on without it
  };
  document.head.appendChild(s);
  return B;
})();
