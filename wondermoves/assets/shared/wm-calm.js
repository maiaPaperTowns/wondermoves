/* ==========================================================================
   WM.Calm: comfort settings for children with CP, shared by every game.
   Load it FIRST (before canvas-confetti and any sound code).

   Settings (Settings page → Comfort; saved on this device in localStorage 'wm.calm'):
     on      Calm mode: no confetti or flashing light rays, no drifting clouds or fish,
             a plain sky, a strong outline on the target, quieter sounds.
             (Many children with CP also have epilepsy or a strong startle reflex,
             and visual processing difficulties: busy, flashing scenes are harder.)
     volume  0–1, for every sound the page makes (any game's own sound code included).
   ========================================================================== */
window.WM = window.WM || {};

(function () {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('wm.calm')) || {}; } catch (e) { saved = {}; }
  const Calm = WM.Calm = {
    on: !!saved.on,
    volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 1,
    save(next) {
      const v = Object.assign({ on: this.on, volume: this.volume }, next);
      try { localStorage.setItem('wm.calm', JSON.stringify(v)); } catch (e) { /* private mode */ }
    },
  };

  /* Volume for everything: route whatever connects to the speakers through one gain node per AudioContext. */
  const level = (Calm.on ? 0.55 : 1) * Calm.volume;
  if (level < 1 && window.AudioNode && AudioNode.prototype.connect) {
    const connect = AudioNode.prototype.connect;
    const out = new WeakMap();
    AudioNode.prototype.connect = function (dest, ...rest) {
      const ctx = this.context;
      if (ctx && dest === ctx.destination && !this.__wmCalmOut) {
        let g = out.get(ctx);
        if (!g) { g = ctx.createGain(); g.gain.value = level; g.__wmCalmOut = true; connect.call(g, ctx.destination); out.set(ctx, g); }
        return connect.call(this, g, ...rest);
      }
      return connect.call(this, dest, ...rest);
    };
  }

  if (!Calm.on) return;
  document.documentElement.classList.add('wm-calm');

  /* No confetti bursts (canvas-confetti assigns window.confetti; keep it a quiet no-op). */
  const quiet = () => Promise.resolve();
  quiet.reset = () => {}; quiet.create = () => quiet;
  try { Object.defineProperty(window, 'confetti', { get: () => quiet, set: () => {}, configurable: true }); } catch (e) { /* ignore */ }

  const css = document.createElement('style');
  css.textContent = `
    .wm-calm .cloud, .wm-calm .fish, .wm-calm .chest-rays, .wm-calm .found-rays, .wm-calm .rays,
    .wm-calm .sea-hi, .wm-calm .floor-decor { display: none !important; }
    .wm-calm .sun { animation: none !important; box-shadow: none !important; }
    .wm-calm .chest:not(.open):not(.fresh) { animation: none !important; }
    .wm-calm .chest-glow { opacity: calc(var(--p, 0) * .5) !important; }
    .wm-calm .scene { filter: saturate(.7) contrast(1.05); }
    .wm-calm .chest-svg, .wm-calm .trace-target, .wm-calm .bubble { filter: drop-shadow(0 0 0 #2B1A0E) drop-shadow(0 0 3px #2B1A0E) !important; }
    .wm-calm .tc-ping { animation: none !important; opacity: 0 !important; }
  `;
  (document.head || document.documentElement).appendChild(css);
})();
