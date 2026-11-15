/* ==========================================================================
   Copy Pip mode: Pip draws a shape, the child traces it.
   --------------------------------------------------------------------------
   Designed for motor-skill practice (incl. children with cerebral palsy):
   - no timers, no failure states, progress is kept when the finger lifts
   - a wide, visible "lane" shows how much wobble is OK (see TOLERANCE)
   - Pip re-demonstrates automatically if the child seems stuck
   - every stroke is logged (time, accuracy, off-path %) for grown-ups
   ========================================================================== */
window.FB = window.FB || {};

(function () {
  const TAU = Math.PI * 2;
  const curve = (n, fn) => { const o = []; for (let i = 0; i <= n; i++) o.push(fn(i / n)); return o; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => performance.now();
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  /* Shapes live in a -1..1 box (y points down). `d` = difficulty 1..5.
     Add your own: return an array of [x, y] points in drawing order. */
  const SHAPES = {
    lineRight: { name: 'a straight line', emoji: '➡️', d: 1, pts: () => [[-1, 0], [1, 0]] },
    lineLeft:  { name: 'a line going back', emoji: '⬅️', d: 1, pts: () => [[1, 0], [-1, 0]] },
    lineDown:  { name: 'a line going down', emoji: '⬇️', d: 1, pts: () => [[0, -0.85], [0, 0.85]] },
    lineUp:    { name: 'a line going up', emoji: '⬆️', d: 1, pts: () => [[0, 0.85], [0, -0.85]] },
    slide:     { name: 'a slide', emoji: '🛝', d: 2, pts: () => [[-0.75, -0.7], [0.75, 0.7]] },
    rainbow:   { name: 'a rainbow', emoji: '🌈', d: 2, pts: () => curve(48, t => { const a = Math.PI * (1 - t); return [Math.cos(a) * 0.9, 0.4 - Math.sin(a) * 0.9]; }) },
    smile:     { name: 'a big smile', emoji: '🙂', d: 2, pts: () => curve(48, t => { const a = Math.PI * (1 - t); return [Math.cos(a) * 0.85, -0.3 + Math.sin(a) * 0.85]; }) },
    wave:      { name: 'ocean waves', emoji: '🌊', d: 3, pts: () => curve(80, t => [-1 + 2 * t, 0.32 * Math.sin(t * TAU * 1.5)]) },
    zigzag:    { name: 'pointy mountains', emoji: '⛰️', d: 3, pts: () => [[-1, 0.35], [-0.5, -0.4], [0, 0.35], [0.5, -0.4], [1, 0.35]] },
    circle:    { name: 'a circle', emoji: '⭕', d: 4, pts: () => curve(80, t => { const a = -Math.PI / 2 + TAU * t; return [Math.cos(a) * 0.75, Math.sin(a) * 0.75]; }) },
    square:    { name: 'a square', emoji: '🟧', d: 4, pts: () => [[-0.65, -0.65], [0.65, -0.65], [0.65, 0.65], [-0.65, 0.65], [-0.65, -0.65]] },
    triangle:  { name: 'a triangle', emoji: '🔺', d: 4, pts: () => [[0, -0.75], [0.78, 0.6], [-0.78, 0.6], [0, -0.75]] },
    snake:     { name: 'a wiggly snake', emoji: '🐍', d: 4, pts: () => curve(80, t => [0.5 * Math.sin(t * TAU), -0.85 + 1.7 * t]) },
    spiral:    { name: 'a snail shell', emoji: '🐌', d: 5, pts: () => curve(140, t => { const a = -Math.PI / 2 + t * TAU * 2.25; const r = 0.85 - 0.68 * t; return [Math.cos(a) * r, Math.sin(a) * r]; }) },
    infinity:  { name: 'a loop-de-loop', emoji: '♾️', d: 5, pts: () => curve(140, t => { const a = Math.PI / 2 + TAU * t; const s = Math.sin(a), c = Math.cos(a), q = 1 + s * s; return [c / q, (1.4 * s * c) / q]; }) },
    heart:     { name: 'a heart', emoji: '❤️', d: 5, pts: () => curve(140, t => { const a = TAU * t; const x = 16 * Math.pow(Math.sin(a), 3); const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); return [x / 19, (y + 2.5) / 17]; }) },
    star:      { name: 'a star', emoji: '⭐', d: 5, pts: () => { const o = []; for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * (4 * Math.PI / 5); o.push([Math.cos(a) * 0.85, Math.sin(a) * 0.85 + 0.08]); } return o; } },
  };

  /* Challenge tiers, one per rarity. Rarer treasure = longer / harder sequence. */
  const TIERS = [
    { rarity: 'common',    count: 2, pool: ['lineRight', 'lineDown', 'lineLeft', 'lineUp'], blurb: '2 straight lines' },
    { rarity: 'uncommon',  count: 3, pool: ['lineRight', 'lineDown', 'slide', 'rainbow', 'smile'], blurb: '3 lines & curves' },
    { rarity: 'rare',      count: 3, pool: ['rainbow', 'smile', 'wave', 'zigzag', 'slide'], blurb: '3 curvy shapes' },
    { rarity: 'epic',      count: 4, pool: ['circle', 'square', 'triangle', 'snake', 'wave', 'zigzag'], blurb: '4 tricky shapes' },
    { rarity: 'legendary', count: 5, pool: ['circle', 'spiral', 'infinity', 'heart', 'star', 'triangle', 'square'], blurb: '5 super shapes' },
  ];

  /* How far from the path still counts (fraction of the pile size, with a pixel minimum). */
  const TOLERANCE = {
    gentle:  { label: 'Gentle',  k: 0.095, min: 44 },
    normal:  { label: 'Normal',  k: 0.068, min: 32 },
    precise: { label: 'Precise', k: 0.045, min: 22 },
  };

  const SHAPE_SCALE = 0.34; // shape box half-size as a fraction of the pile size

  const PRAISE = ['Great job! 🎉', 'You did it! ⭐', 'Wow, nice tracing! ✨', 'Super! Keep going! 💪', 'Awesome brushing! 🖌️'];

  function resample(raw, step) {
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const L = cum[cum.length - 1];
    const n = Math.max(2, Math.ceil(L / step));
    const out = [];
    let seg = 1;
    for (let k = 0; k <= n; k++) {
      const target = (k / n) * L;
      while (seg < raw.length - 1 && cum[seg] < target) seg++;
      const a = raw[seg - 1], b = raw[seg];
      const sl = cum[seg] - cum[seg - 1] || 1;
      const t = clamp((target - cum[seg - 1]) / sl, 0, 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return { pts: out, len: L };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /** Small SVG icon of a shape (start point marked with a dot). */
  function thumb(key) {
    const { pts } = resample(SHAPES[key].pts(), 0.08);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('');
    const s = pts[0];
    return `<svg class="shape-thumb" viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="0.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${s[0].toFixed(2)}" cy="${s[1].toFixed(2)}" r="0.22" fill="currentColor"/></svg>`;
  }

  const Trace = FB.Trace = {
    active: false, phase: 'idle', // idle | demo | trace | between | done
    seq: [], i: 0, p: 0, pts: [], cum: [], tol: 40,
    down: false, token: 0, results: [], pulse: 0, hintAt: 0,

    tolPx(S) {
      const T = TOLERANCE[FB.Store.data.tolerance] || TOLERANCE.gentle;
      return Math.max(T.min, S * T.k);
    },

    start(tierIdx) {
      const tier = TIERS[tierIdx];
      const pool = shuffle(tier.pool.slice());
      const keys = [];
      while (keys.length < tier.count) keys.push(pool[keys.length % pool.length]);
      keys.sort((a, b) => SHAPES[a].d - SHAPES[b].d);
      this.seq = keys.map(k => Object.assign({ key: k }, resample(SHAPES[k].pts(), 0.012)));
      this.tier = tierIdx;
      this.i = 0;
      this.results = [];
      this.active = true;
      this.token++;
      this.beginStroke();
    },

    stop() {
      this.active = false;
      this.phase = 'idle';
      this.down = false;
      this.token++;
      this.renderHud();
    },

    beginStroke() {
      this.p = 0; this.dev = 0; this.devN = 0; this.off = 0; this.t0 = 0;
      this.down = false; this.saidIdle = false;
      this.relayout();
      this.playDemo(true);
      this.renderHud();
    },

    relayout() {
      if (!this.active || !this.seq[this.i]) return;
      const { cx, cy, S } = FB.site.layout;
      const k = S * SHAPE_SCALE;
      this.pts = this.seq[this.i].pts.map(([x, y]) => [cx + x * k, cy + y * k]);
      this.cum = [0];
      for (let j = 1; j < this.pts.length; j++) {
        this.cum.push(this.cum[j - 1] + Math.hypot(this.pts[j][0] - this.pts[j - 1][0], this.pts[j][1] - this.pts[j - 1][1]));
      }
      this.tol = this.tolPx(S);
    },

    playDemo(first) {
      const s = SHAPES[this.seq[this.i].key];
      this.phase = 'demo';
      this.demoT = 0;
      this.demoDur = Math.min(4.5, 1 + this.seq[this.i].len * 0.6);
      this.renderHud();
      FB.Buddy.say(first ? `Watch me draw ${s.name}! ${s.emoji}` : 'Watch me one more time! 👀', (this.demoDur + 1.4) * 1000);
    },

    replay() {
      if (this.active && (this.phase === 'trace' || this.phase === 'demo')) this.playDemo(false);
    },

    toTrace() {
      this.phase = 'trace';
      this.lastProgress = now();
      this.renderHud();
      FB.Buddy.say(this.p > 0 ? 'Keep going! Follow the glowing dot ✨' : 'Your turn! Start at the glowing dot ✨', 4000);
    },

    update(dt) {
      if (!this.active) return;
      this.pulse += dt;
      if (this.phase === 'demo') {
        this.demoT += dt;
        if (this.demoT >= this.demoDur + 0.4) this.toTrace();
      } else if (this.phase === 'trace' && !this.down && !this.saidIdle && now() - this.lastProgress > 9000) {
        this.saidIdle = true;
        this.playDemo(false);
      }
    },

    /* ---------- input ---------- */
    onDown(x, y) {
      if (!this.active) return;
      if (this.phase === 'demo') {
        if (this.demoT < 0.8) return;   // let Pip show at least the start
        this.toTrace();
      }
      if (this.phase !== 'trace') return;
      this.down = true;
      if (!this.t0) this.t0 = now();
      this.track(x, y);
    },
    onMove(x, y) { if (this.down && this.phase === 'trace') this.track(x, y); },
    onUp() { this.down = false; },

    track(x, y) {
      const pts = this.pts, cum = this.cum, tol = this.tol, n = pts.length;
      const p0 = Math.floor(this.p);
      const maxLen = cum[p0] + tol * 2.5; // can't skip far ahead
      let best = -1, nearest = Infinity;
      for (let k = 0; k < n && cum[k] <= maxLen; k++) { // already-traced part counts as on-path too
        const d = Math.hypot(pts[k][0] - x, pts[k][1] - y);
        if (d < nearest) nearest = d;
        if (d < tol && k > best && k >= p0 - 8) best = k;
      }
      this.devN++;
      this.dev += Math.min(nearest, tol * 2);
      if (nearest > tol) this.off++;

      if (best > this.p) {
        const from = Math.floor(this.p);
        this.p = best;
        this.lastProgress = now();
        this.saidIdle = false;
        const floor = 1 - (this.i + 1) / this.seq.length;
        for (let k = from; k <= best; k += 2) FB.site.groove(pts[k][0], pts[k][1], tol * 0.75, floor);
        FB.site.spawnDust(x, y, pts[best][0] - pts[from][0], pts[best][1] - pts[from][1], 3);
        if (Math.random() < 0.5) FB.site.burst(pts[best][0], pts[best][1], '#FFE27A', 2);
        FB.Sound.brush(0.22);
        if (cum[n - 1] - cum[best] < tol * 0.45) this.complete();
      } else if (nearest > tol * 1.8 && now() - this.hintAt > 6000) {
        this.hintAt = now();
        FB.Buddy.say('Follow the glowing dot! ✨', 2500);
      }
    },

    complete() {
      this.phase = 'between';
      this.down = false;
      this.p = this.pts.length - 1;
      const meanDev = this.devN ? this.dev / this.devN : 0;
      const rec = {
        at: Date.now(),
        shape: this.seq[this.i].key,
        tier: TIERS[this.tier].rarity,
        ms: Math.round(now() - (this.t0 || now())),
        accuracy: +clamp(1.15 - meanDev / this.tol, 0, 1).toFixed(2),
        offPath: +(this.devN ? this.off / this.devN : 0).toFixed(2),
        tolerance: FB.Store.data.tolerance,
      };
      this.results.push(rec);
      FB.Store.logTrace(rec);

      FB.site.lowerTo(1 - (this.i + 1) / this.seq.length, 800);
      FB.Sound.chime();
      for (let k = 0; k < this.pts.length; k += 6) FB.site.burst(this.pts[k][0], this.pts[k][1], k % 12 ? '#FFE27A' : '#FF8A3D', 1);
      FB.Buddy.say(pick(PRAISE), 2000);
      this.renderHud();

      const tok = this.token;
      const last = this.i >= this.seq.length - 1;
      setTimeout(() => {
        if (tok !== this.token || !this.active) return;
        if (last) { this.phase = 'done'; this.renderHud(); FB.Game.finishTrace(); }
        else { this.i++; this.beginStroke(); }
      }, last ? 900 : 1300);
    },

    /** Kind summary for the found card. */
    summary() {
      const r = this.results;
      const acc = r.length ? r.reduce((a, b) => a + b.accuracy, 0) / r.length : 1;
      const stars = acc >= 0.75 ? 3 : acc >= 0.5 ? 2 : 1;
      const msg = stars === 3 ? 'Super smooth tracing!' : stars === 2 ? 'Great tracing!' : 'Nice effort, keep practising!';
      return { stars, msg, shapes: r.length };
    },

    /* ---------- drawing (on the game canvas, above the sand) ---------- */
    draw(ctx) {
      if (!this.active || this.phase === 'done' || !this.pts.length) return;
      const pts = this.pts, tol = this.tol, n = pts.length - 1;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const path = (from, to) => {
        ctx.beginPath();
        ctx.moveTo(pts[from][0], pts[from][1]);
        for (let k = from + 1; k <= to; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      };

      // the lane: everything inside it counts
      path(0, n);
      ctx.strokeStyle = 'rgba(255,255,255,0.26)';
      ctx.lineWidth = tol * 1.7;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = tol * 0.55;
      ctx.stroke();
      ctx.setLineDash([1, 16]);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(74,44,23,0.55)';
      ctx.stroke();
      ctx.setLineDash([]);

      // direction arrows
      const total = this.cum[n];
      for (let L = 70; L < total - 40; L += 95) {
        let k = 1;
        while (k < n && this.cum[k] < L) k++;
        const a = Math.atan2(pts[Math.min(n, k + 1)][1] - pts[k - 1][1], pts[Math.min(n, k + 1)][0] - pts[k - 1][0]);
        ctx.save();
        ctx.translate(pts[k][0], pts[k][1]);
        ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(5, 0); ctx.lineTo(-6, 9);
        ctx.lineWidth = 7; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(74,44,23,0.8)'; ctx.stroke();
        ctx.restore();
      }

      // finish star
      const end = pts[n];
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(end[0], end[1], 18, 0, TAU); ctx.fill();
      ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⭐', end[0], end[1] + 1);

      // what the child has traced so far
      const pi = Math.floor(this.p);
      if (pi > 0) {
        path(0, pi);
        ctx.shadowColor = 'rgba(255,138,61,0.8)';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#FF8A3D';
        ctx.lineWidth = 16;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FFE27A';
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      if (this.phase === 'demo') {
        // Pip's demonstration stroke with the brush at its tip
        const t = clamp(this.demoT / this.demoDur, 0, 1);
        const f = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const di = Math.floor(f * n);
        if (di > 0) {
          path(0, di);
          ctx.shadowColor = 'rgba(34,180,163,0.7)';
          ctx.shadowBlur = 12;
          ctx.strokeStyle = 'rgba(34,180,163,0.95)';
          ctx.lineWidth = 14;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        const tip = pts[di];
        const img = FB.loadImage('assets/brush.svg');
        if (img.complete && img.naturalWidth) ctx.drawImage(img, tip[0] - 6, tip[1] - 58, 64, 64);
      } else {
        // the glowing "follow me" dot
        const lp = pts[pi];
        const pul = 1 + 0.18 * Math.sin(this.pulse * 6);
        ctx.fillStyle = 'rgba(255,226,122,0.35)';
        ctx.beginPath(); ctx.arc(lp[0], lp[1], tol * 0.6 * pul, 0, TAU); ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FF8A3D';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(lp[0], lp[1], 13, 0, TAU); ctx.fill();
        ctx.stroke();
        if (pi === 0) {
          ctx.fillStyle = '#4A2C17';
          ctx.font = '700 15px Fredoka, sans-serif';
          ctx.fillText(String(this.i + 1), lp[0], lp[1] + 1);
        }
      }
      ctx.restore();
    },

    /* ---------- step tracker at the bottom of the screen ---------- */
    renderSample() {
      document.getElementById('traceSteps').innerHTML = ['lineRight', 'rainbow', 'circle']
        .map((k, i) => `<span class="tstep ${i === 0 ? 'done' : i === 1 ? 'current' : ''}">${thumb(k)}${i === 0 ? '<b>✓</b>' : ''}</span>`).join('');
      document.getElementById('traceLabel').textContent = 'Shape 2 of 3';
    },

    renderHud() {
      const hud = document.getElementById('traceHud');
      if (!hud) return;
      const show = this.active && this.phase !== 'done';
      hud.classList.toggle('show', show);
      if (!show) return;
      document.getElementById('traceSteps').innerHTML = this.seq.map((s, k) => {
        const done = k < this.i || (k === this.i && this.phase === 'between');
        return `<span class="tstep ${done ? 'done' : ''} ${k === this.i && !done ? 'current' : ''}" title="${SHAPES[s.key].name}">${thumb(s.key)}${done ? '<b>✓</b>' : ''}</span>`;
      }).join('');
      document.getElementById('traceLabel').textContent = `Shape ${Math.min(this.i + 1, this.seq.length)} of ${this.seq.length}`;
      document.getElementById('traceReplay').disabled = this.phase === 'demo' || this.phase === 'between';
    },
  };

  FB.TRACE = { SHAPES, TIERS, TOLERANCE, thumb };
})();
