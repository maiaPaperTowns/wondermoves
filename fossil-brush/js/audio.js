/* Tiny synthesized sound effects (no audio files needed).
   Replace with real samples later if you like. */
window.FB = window.FB || {};

FB.Sound = (() => {
  let ctx = null, master = null, noiseGain = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);

    // Looping filtered noise = "swish" of the brush
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    src.connect(bp).connect(noiseGain).connect(master);
    src.start();
    return ctx;
  }

  function tone(freq, start, dur, type = 'sine', vol = 0.2) {
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
    brush(level) {
      if (!ctx || !noiseGain) return;
      const t = ctx.currentTime;
      noiseGain.gain.cancelScheduledValues(t);
      noiseGain.gain.setTargetAtTime(Math.min(0.3, level), t, 0.03);
      noiseGain.gain.setTargetAtTime(0, t + 0.09, 0.07);
    },
    click() {
      if (!ensure()) return;
      tone(720, ctx.currentTime, 0.09, 'triangle', 0.08);
    },
    chime() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(880, t, 0.4, 'triangle', 0.16);
      tone(1318.5, t + 0.09, 0.55, 'triangle', 0.13);
    },
    fanfare(rank) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
      const n = 3 + rank;
      for (let i = 0; i < n; i++) tone(notes[i], t + i * 0.1, 0.45, 'triangle', 0.16);
      const end = t + n * 0.1;
      [523.25, 659.25, 783.99].forEach(f => tone(f * (rank >= 3 ? 2 : 1), end, 1.1, 'sine', 0.12));
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
    },
    get muted() { return muted; },
  };
})();
