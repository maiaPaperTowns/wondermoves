/* WM.Sound: tiny synthesized sound effects shared by WonderMoves games. */
window.WM = window.WM || {};

WM.Sound = (() => {
  let ctx = null, master = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, start, dur, type = 'triangle', vol = 0.16) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master);
    o.start(start); o.stop(start + dur + 0.05);
  }

  return {
    ensure,
    click() { if (ensure()) tone(720, ctx.currentTime, 0.09, 'triangle', 0.08); },
    chime() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(880, t, 0.4, 'triangle', 0.16);
      tone(1318.5, t + 0.09, 0.55, 'triangle', 0.13);
    },
    /** Short rising blip; step 0..n gives a rising scale. */
    tick(step = 0) {
      if (!ensure()) return;
      const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
      tone(scale[Math.min(scale.length - 1, step)], ctx.currentTime, 0.18, 'sine', 0.12);
    },
    fanfare(rank = 2) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
      const n = 3 + rank;
      for (let i = 0; i < n; i++) tone(notes[i], t + i * 0.1, 0.45, 'triangle', 0.16);
      const end = t + n * 0.1;
      [523.25, 659.25, 783.99].forEach(f => tone(f * 2, end, 1.1, 'sine', 0.11));
    },
    creak() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.45);
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
    },
    get muted() { return muted; },
  };
})();
