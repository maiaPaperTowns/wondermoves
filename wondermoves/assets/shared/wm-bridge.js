/* ==========================================================================
   WonderMoves bridge: lets a game talk to the shell it is embedded in.
   Works standalone too (embedded === false, and messages are no-ops).

   Usage in a game:
     WM.bridge.onVisibility(visible => visible ? resume() : pause());
     WM.bridge.send('ready');
   ========================================================================== */
window.WM = window.WM || {};

WM.bridge = (function () {
  const embedded = window.parent && window.parent !== window;
  const listeners = { visibility: [] };
  let visible = true;

  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.source !== 'wondermoves') return;
    if (m.type === 'visibility') {
      visible = !!m.visible;
      listeners.visibility.forEach(fn => fn(visible));
    }
  });

  return {
    embedded,
    get visible() { return visible; },
    /** Called with true/false when the player switches to / away from this game. */
    onVisibility(fn) { listeners.visibility.push(fn); },
    /** Send a message to the shell, e.g. send('switch', { game: 'bubble-pop' }). */
    send(type, payload) {
      if (embedded) window.parent.postMessage(Object.assign({ source: 'wondermoves', type }, payload), '*');
    },
  };
})();
