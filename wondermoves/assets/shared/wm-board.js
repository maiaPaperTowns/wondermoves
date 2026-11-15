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
  /* Gentle break card (no countdown, child chooses): long play or a warm room. */
  let breakEl = null;
  function showBreak(d) {
    if (document.visibilityState !== 'visible') return;
    const text = d && d.reason === 'long_play'
      ? `Great moving! You've played ${d.minutes} minute${d.minutes === 1 ? '' : 's'}. Shake out your hands and have a sip of water? 💧`
      : "It's a bit warm. Want a little break and a drink of water? 💧";
    if (window.WM.Buddy && WM.Buddy.say) { try { WM.Buddy.say(text, 6000); } catch (e) {} }
    if (window.FB && FB.Buddy && FB.Buddy.say) { try { FB.Buddy.say(text, 6000); } catch (e) {} }
    if (!breakEl) {
      breakEl = document.createElement('div');
      breakEl.setAttribute('role', 'status');
      breakEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;max-width:min(560px,90vw);' +
        'background:#fffbe9;color:#3b2f1e;border:3px solid #f2c14e;border-radius:22px;padding:16px 20px;font:600 20px/1.35 system-ui,sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;gap:14px;align-items:center';
      const msg = document.createElement('span'); breakEl.appendChild(msg);
      const ok = document.createElement('button');
      ok.textContent = 'OK';
      ok.style.cssText = 'min-width:88px;min-height:56px;border-radius:16px;border:0;background:#f2c14e;color:#3b2f1e;font:700 20px system-ui;cursor:pointer';
      ok.onclick = () => { breakEl.style.display = 'none'; };
      breakEl.appendChild(ok);
      document.body.appendChild(breakEl);
    }
    breakEl.firstChild.textContent = text;
    breakEl.style.display = 'flex';
  }
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
    socket.on('break_suggested', showBreak);
    // The board answers get_state with 'profile'; treat that as "board is here".
    socket.once('profile', () => { B.available = true; settle(); });
    setTimeout(settle, 2500);  // board not answering: carry on without it
  };
  document.head.appendChild(s);
  return B;
})();
