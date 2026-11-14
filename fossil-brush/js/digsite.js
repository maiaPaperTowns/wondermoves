/* ==========================================================================
   DigSite — the sand pile simulation + renderer.
   The pile is a heightmap (N x N grid). Brushing lowers the height; where the
   sand reaches zero, the clay "bed" and the buried treasure show through.
   ========================================================================== */
window.FB = window.FB || {};

(function () {
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  const BRUSH_K = 1.5;          // global dig speed tuning
  const UNCOVERED_H = 0.06;     // sand height that counts as "uncovered"

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(rand) {
    const P = 256, grid = new Float32Array(P * P);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const at = (x, y) => grid[((y & 255) * P) + (x & 255)];
    const sm = t => t * t * (3 - 2 * t);
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      const u = sm(xf), v = sm(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, oct = 4) {
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) { s += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
      return s / norm;
    }
    return { noise, fbm };
  }

  const imgCache = {};
  FB.loadImage = function (src) {
    if (!imgCache[src]) { const im = new Image(); im.src = src; imgCache[src] = im; }
    return imgCache[src];
  };

  class DigSite {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.N = 192;
      const n = this.N * this.N;
      this.h = new Float32Array(n);
      this.h0 = new Float32Array(n);
      this.hard = new Float32Array(n);
      this.grain = new Float32Array(n);
      this.strataN = new Float32Array(n);
      this.edge = new Float32Array(n);
      this.maskIdx = new Int32Array(0);
      this.maskSum0 = 1;

      this.sand = document.createElement('canvas');
      this.sand.width = this.sand.height = this.N;
      this.sandCtx = this.sand.getContext('2d');
      this.img = this.sandCtx.createImageData(this.N, this.N);
      this.sandHi = document.createElement('canvas');
      this.sandHiCtx = this.sandHi.getContext('2d');
      this.bed = document.createElement('canvas');
      this.fossil = document.createElement('canvas');
      this.grainPattern = this.makeGrainPattern();

      this.particles = [];
      this.sparkles = [];
      this.glow = 0; this.glowTarget = 0; this.glowColor = '#fff';
      this.pop = 0; this.time = 0; this.reveal = null; this.revealed = false;
      this.dirty = true; this.dpr = 1;
      this.vw = 0; this.vh = 0;
      this.layout = { cx: 0, cy: 0, S: 300 };
      this.level = null;
    }

    makeGrainPattern() {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const id = g.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) {
        const light = Math.random() < 0.5;
        id.data[i] = light ? 255 : 150;
        id.data[i + 1] = light ? 252 : 100;
        id.data[i + 2] = light ? 238 : 50;
        id.data[i + 3] = Math.random() < 0.3 ? Math.random() * (light ? 70 : 34) : 0;
      }
      g.putImageData(id, 0, 0);
      return this.ctx.createPattern(c, 'repeat');
    }

    /* ---------- layout ---------- */
    resize(vw, vh, layout) {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.vw = vw; this.vh = vh;
      this.canvas.width = Math.round(vw * this.dpr);
      this.canvas.height = Math.round(vh * this.dpr);
      this.canvas.style.width = vw + 'px';
      this.canvas.style.height = vh + 'px';
      this.layout = layout;
      const px = Math.min(1100, Math.round(layout.S * this.dpr));
      this.sandHi.width = this.sandHi.height = px;
      if (this.level) { this.buildBed(); this.buildFossil(); }
      this.dirty = true;
    }

    /* ---------- new dig ---------- */
    setup(level, item, depth, seed) {
      this.level = level; this.item = item; this.depth = depth;
      const th = level.theme;
      this.pal = th.strata.map(hexToRgb);
      this.rockRgb = hexToRgb(th.rock);
      const rand = mulberry32(seed);
      this.rand = rand;
      const nz = makeNoise(rand);
      const N = this.N;
      this.depthFactor = 0.8 + depth / 100;

      // a few smaller piles heaped around the main mound
      const bumps = [];
      for (let k = 0; k < 5; k++) {
        const a = rand() * Math.PI * 2, d = 0.18 + rand() * 0.38;
        bumps.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r2: Math.pow(0.14 + rand() * 0.12, 2), a: 0.1 + rand() * 0.14 });
      }

      this.fx = (rand() - 0.5) * 0.2;
      this.fy = (rand() - 0.5) * 0.14;
      this.fr = 0.27;
      const fr2 = this.fr * this.fr;
      const mask = [];
      let sum0 = 0;

      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const idx = j * N + i;
          const u = ((i + 0.5) / N) * 2 - 1, v = ((j + 0.5) / N) * 2 - 1;
          const ang = Math.atan2(v, u);
          const wob = 0.8 + 0.34 * nz.fbm(Math.cos(ang) * 1.8 + 30, Math.sin(ang) * 1.8 + 30, 3);
          const r = Math.min(1.2, Math.hypot(u, v) / Math.min(1, wob));
          this.edge[idx] = r >= 1 ? 0 : 1 - smoothstep(0.93, 1, r);
          let h0 = 0;
          if (r < 1) {
            h0 = 0.14 + 0.36 * (1 - smoothstep(0.55, 1, r)) + 0.5 * Math.exp(-(r * r) / 0.22);
            for (const b of bumps) {
              const dx = u - b.x, dy = v - b.y;
              h0 += b.a * Math.exp(-(dx * dx + dy * dy) / b.r2);
            }
            h0 += (nz.fbm(u * 3 + 11, v * 3 + 7) - 0.5) * 0.16;
            h0 = Math.max(0.1, h0);
          }
          this.h0[idx] = h0;
          this.h[idx] = h0;
          const rock = smoothstep(0.55, 0.7, nz.fbm(u * 4.5 + 40, v * 4.5 + 40, 3)) * level.rockiness;
          this.hard[idx] = 1 + rock * 3;
          this.grain[idx] = rand() - 0.5;
          this.strataN[idx] = nz.fbm(u * 2 + 80, v * 7 + 80, 3) - 0.5;
          const dx = u - this.fx, dy = v - this.fy;
          if (dx * dx + dy * dy < fr2) { mask.push(idx); sum0 += h0; }
        }
      }
      this.maskIdx = Int32Array.from(mask);
      this.maskSum0 = sum0 || 1;

      this.particles.length = 0;
      this.sparkles.length = 0;
      this.glow = 0; this.glowTarget = 0; this.pop = 0;
      this.reveal = null; this.revealed = false;
      this.buildBed();
      this.buildFossil();
      this.dirty = true;
    }

    /* ---------- static layers ---------- */
    buildBed() {
      const s = this.sandHi.width, R = s / 2;
      const c = this.bed; c.width = c.height = s;
      const g = c.getContext('2d');
      const th = this.level.theme;
      const rand = mulberry32(1234);

      const grad = g.createRadialGradient(R, R * 0.9, 0, R, R, R);
      grad.addColorStop(0, th.bed);
      grad.addColorStop(1, th.bedDark);
      g.fillStyle = grad;
      g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();

      // cracks
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineCap = 'round';
      for (let k = 0; k < 14; k++) {
        let x = rand() * s, y = rand() * s, a = rand() * Math.PI * 2;
        g.lineWidth = (0.6 + rand() * 1.6) * this.dpr;
        g.beginPath(); g.moveTo(x, y);
        const segs = 3 + (rand() * 5) | 0;
        for (let q = 0; q < segs; q++) {
          a += (rand() - 0.5) * 1.4;
          x += Math.cos(a) * s * 0.04; y += Math.sin(a) * s * 0.04;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // pebbles
      for (let k = 0; k < 70; k++) {
        const x = rand() * s, y = rand() * s, r = (1 + rand() * 4) * this.dpr;
        g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255,0.12' : '0,0,0,0.16'})`;
        g.beginPath(); g.ellipse(x, y, r * 1.3, r, rand() * 3, 0, Math.PI * 2); g.fill();
      }
      // dug-out hollow around the treasure
      const fx = R + this.fx * R, fy = R + this.fy * R, fr = this.fr * R;
      const hol = g.createRadialGradient(fx, fy, fr * 0.3, fx, fy, fr * 1.3);
      hol.addColorStop(0, 'rgba(0,0,0,0.30)');
      hol.addColorStop(0.75, 'rgba(0,0,0,0.12)');
      hol.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hol;
      g.beginPath(); g.arc(fx, fy, fr * 1.3, 0, Math.PI * 2); g.fill();

      // trim to the same lumpy outline as the sand pile
      const N = this.N;
      const mc = document.createElement('canvas');
      mc.width = mc.height = N;
      const mg = mc.getContext('2d');
      const md = mg.createImageData(N, N);
      for (let k = 0; k < N * N; k++) md.data[k * 4 + 3] = this.edge[k] * 255;
      mg.putImageData(md, 0, 0);
      g.globalCompositeOperation = 'destination-in';
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(mc, 0, 0, s, s);
      g.globalCompositeOperation = 'source-over';
    }

    buildFossil() {
      const R = this.sandHi.width / 2;
      const fr = this.fr * R;
      const size = Math.ceil(fr * 2 * 1.3);
      const c = this.fossil; c.width = c.height = size;
      const g = c.getContext('2d');
      const item = this.item;
      g.clearRect(0, 0, size, size);
      g.save();
      g.shadowColor = 'rgba(30,15,5,0.45)';
      g.shadowBlur = 10 * this.dpr;
      g.shadowOffsetY = 4 * this.dpr;
      if (item.image) {
        const im = FB.loadImage(item.image);
        if (im.complete && im.naturalWidth) {
          const box = fr * 2 * 1.05;
          const k = Math.min(box / im.naturalWidth, box / im.naturalHeight);
          const w = im.naturalWidth * k, h = im.naturalHeight * k;
          g.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
        } else {
          im.addEventListener('load', () => { if (this.item === item) this.buildFossil(); }, { once: true });
        }
      } else {
        g.font = `${Math.round(fr * 1.85)}px ${EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(item.emoji, size / 2, size / 2 + fr * 0.08);
      }
      g.restore();
    }

    /* ---------- geometry helpers ---------- */
    toGrid(x, y) {
      const { cx, cy, S } = this.layout;
      return [((x - (cx - S / 2)) / S) * this.N, ((y - (cy - S / 2)) / S) * this.N];
    }
    cellToScreen(idx) {
      const { cx, cy, S } = this.layout, N = this.N;
      const i = idx % N, j = (idx / N) | 0;
      return [cx - S / 2 + ((i + 0.5) / N) * S, cy - S / 2 + ((j + 0.5) / N) * S];
    }
    fossilScreen() {
      const { cx, cy, S } = this.layout;
      return { x: cx + (this.fx * S) / 2, y: cy + (this.fy * S) / 2, r: (this.fr * S) / 2 };
    }
    contains(x, y, pad = 1.02) {
      const { cx, cy, S } = this.layout;
      return Math.hypot(x - cx, y - cy) < (S / 2) * pad;
    }

    /* ---------- brushing ---------- */
    dab(gx, gy, rc, amt) {
      const N = this.N, h = this.h, hard = this.hard;
      const i0 = Math.max(0, Math.floor(gx - rc)), i1 = Math.min(N - 1, Math.ceil(gx + rc));
      const j0 = Math.max(0, Math.floor(gy - rc)), j1 = Math.min(N - 1, Math.ceil(gy + rc));
      const inv = 1 / (rc * rc);
      let removed = 0;
      for (let j = j0; j <= j1; j++) {
        const dy = j + 0.5 - gy;
        for (let i = i0; i <= i1; i++) {
          const dx = i + 0.5 - gx;
          const d2 = (dx * dx + dy * dy) * inv;
          if (d2 >= 1) continue;
          const idx = j * N + i;
          const cur = h[idx];
          if (cur <= 0) continue;
          const f = (1 - d2) * (1 - d2);
          const nh = cur - (amt * f) / hard[idx];
          const v = nh > 0 ? nh : 0;
          removed += cur - v;
          h[idx] = v;
        }
      }
      if (removed > 0) this.dirty = true;
      return removed;
    }

    /** Brush along a screen-space segment. Returns amount of sand removed. */
    brushStroke(x1, y1, x2, y2, p) {
      const [ga, gb] = this.toGrid(x1, y1);
      const [gc, gd] = this.toGrid(x2, y2);
      const S = this.layout.S;
      const travel = Math.min(Math.hypot(x2 - x1, y2 - y1), 70);
      if (travel < 0.5) return 0;
      const rc = p.radius * this.N;
      const steps = Math.max(1, Math.ceil(Math.hypot(gc - ga, gd - gb) / (rc * 0.35)));
      const amt = (p.strength * BRUSH_K * (travel / S)) / this.depthFactor / steps;
      let removed = 0;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        removed += this.dab(ga + (gc - ga) * t, gb + (gd - gb) * t, rc, amt);
      }
      return removed;
    }

    /** A single tap. */
    tap(x, y, p) {
      const [gx, gy] = this.toGrid(x, y);
      return this.dab(gx, gy, p.radius * this.N * 0.8, 0.03 * p.strength / this.depthFactor);
    }

    stats() {
      const h = this.h, h0 = this.h0, m = this.maskIdx;
      let rem = 0, unc = 0;
      for (let k = 0; k < m.length; k++) {
        const idx = m[k];
        rem += h0[idx] - h[idx];
        if (h[idx] < UNCOVERED_H) unc++;
      }
      return { removed: rem / this.maskSum0, uncovered: unc / (m.length || 1) };
    }

    /* ---------- discovery ---------- */
    startReveal(ms, color) {
      const N = this.N, cells = [], start = [], weight = [];
      const R1 = this.fr * 1.12, R2 = this.fr * 1.5;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const u = ((i + 0.5) / N) * 2 - 1, v = ((j + 0.5) / N) * 2 - 1;
          const d = Math.hypot(u - this.fx, v - this.fy);
          if (d < R2) {
            const idx = j * N + i;
            cells.push(idx); start.push(this.h[idx]);
            weight.push(1 - smoothstep(R1, R2, d));
          }
        }
      }
      this.reveal = { t: 0, dur: ms / 1000, cells, start, weight };
      this.glowColor = color;
    }

    celebrate(color) {
      this.glowColor = color;
      this.glowTarget = 1;
      this.revealed = true;
      this.pop = 0.35;
      const F = this.fossilScreen();
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260;
        this.particles.push({
          x: F.x, y: F.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
          life: 0, max: 0.6 + Math.random() * 0.5, size: 2 + Math.random() * 3,
          c: this.level.theme.strata[(Math.random() * 3) | 0],
        });
      }
    }

    /* ---------- particles ---------- */
    sampleColor(x, y) {
      const [gx, gy] = this.toGrid(x, y);
      const i = clamp(gx | 0, 0, this.N - 1), j = clamp(gy | 0, 0, this.N - 1);
      const idx = j * this.N + i;
      const ref = this.h0[idx] || 0.35;
      const t = clamp((ref - this.h[idx]) / Math.max(ref, 0.35), 0, 0.999);
      const c = this.pal[Math.floor(t * (this.pal.length - 1))];
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }

    spawnDust(x, y, dx, dy, count) {
      if (this.particles.length > 500) return;
      const col = this.sampleColor(x, y);
      const len = Math.hypot(dx, dy) || 1;
      for (let k = 0; k < count; k++) {
        const sp = 60 + Math.random() * 180;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 16,
          vx: (dx / len) * sp * 0.8 + (Math.random() - 0.5) * 140,
          vy: (dy / len) * sp * 0.5 - 80 - Math.random() * 160,
          life: 0, max: 0.4 + Math.random() * 0.45, size: 1.4 + Math.random() * 2.6, c: col,
        });
      }
    }

    update(dt) {
      this.time += dt;
      const ps = this.particles;
      for (let k = ps.length - 1; k >= 0; k--) {
        const p = ps[k];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(k, 1); continue; }
        p.vy += 700 * dt; p.vx *= 0.98;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }

      if (this.reveal) {
        const r = this.reveal;
        r.t += dt;
        const p = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - p, 3);
        for (let k = 0; k < r.cells.length; k++) {
          this.h[r.cells[k]] = r.start[k] * (1 - e * r.weight[k]);
        }
        this.dirty = true;
        if (Math.random() < 0.6) {
          const F = this.fossilScreen();
          const a = Math.random() * Math.PI * 2;
          this.spawnDust(F.x + Math.cos(a) * F.r, F.y + Math.sin(a) * F.r, Math.cos(a), Math.sin(a), 2);
        }
        if (p >= 1) this.reveal = null;
      }

      // twinkles on uncovered bits of the treasure
      if (this.level && this.maskIdx.length) {
        const rank = FB.rarityIndex(this.item.rarity);
        const chance = this.revealed ? 0.5 : 0.08 + rank * 0.06;
        if (Math.random() < chance * dt * 30) {
          const idx = this.maskIdx[(Math.random() * this.maskIdx.length) | 0];
          if (this.h[idx] < UNCOVERED_H) {
            const [x, y] = this.cellToScreen(idx);
            this.sparkles.push({ x, y, life: 0, max: 0.7 + Math.random() * 0.4, size: 5 + Math.random() * 7 });
          }
        }
      }
      const sp = this.sparkles;
      for (let k = sp.length - 1; k >= 0; k--) {
        sp[k].life += dt;
        if (sp[k].life >= sp[k].max) sp.splice(k, 1);
      }

      this.glow += (this.glowTarget - this.glow) * Math.min(1, dt * 3);
      this.pop *= Math.pow(0.02, dt);
    }

    /* ---------- rendering ---------- */
    renderSand() {
      const N = this.N, h = this.h, h0 = this.h0, d = this.img.data;
      const pal = this.pal, P = pal.length, rock = this.rockRgb;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const idx = j * N + i, o = idx * 4;
          const hv = h[idx];
          const a = this.edge[idx] * smoothstep(0.004, 0.05, hv);
          if (a <= 0.004) { d[o + 3] = 0; continue; }
          const hl = i > 0 ? h[idx - 1] : hv, hr = i < N - 1 ? h[idx + 1] : hv;
          const hu = j > 0 ? h[idx - N] : hv, hd = j < N - 1 ? h[idx + N] : hv;
          // light comes from the upper-left: slopes facing it are brighter
          let shade = 1 + ((hr - hl) * 0.8 + (hd - hu)) * 10;
          shade = clamp(shade, 0.68, 1.22);

          const ref = h0[idx];
          let t = (ref - hv) / Math.max(ref, 0.35);
          t += this.strataN[idx] * 0.3 * Math.min(1, t * 4);
          t = clamp(t, 0, 0.999);
          const k = t * (P - 1), i0 = Math.floor(k);
          const f = smoothstep(0.6, 1, k - i0);
          const c0 = pal[i0], c1 = pal[Math.min(P - 1, i0 + 1)];
          let r = c0[0] + (c1[0] - c0[0]) * f;
          let g = c0[1] + (c1[1] - c0[1]) * f;
          let b = c0[2] + (c1[2] - c0[2]) * f;
          const rk = ((this.hard[idx] - 1) / 3) * 0.75;
          if (rk > 0) { r += (rock[0] - r) * rk; g += (rock[1] - g) * rk; b += (rock[2] - b) * rk; }
          const m = (1 - 0.22 * t) * (0.88 + 0.12 * Math.min(1, hv)) * (1 + this.grain[idx] * 0.1);
          // warm shadows: blue drops faster than red so shade never turns grey
          const sr = shade < 1 ? Math.pow(shade, 0.75) : shade;
          const sb = shade < 1 ? Math.pow(shade, 1.5) : shade;
          d[o] = r * m * sr; d[o + 1] = g * m * shade; d[o + 2] = b * m * sb; d[o + 3] = a * 255;
        }
      }
      this.sandCtx.putImageData(this.img, 0, 0);
      const hi = this.sandHiCtx, s = this.sandHi.width;
      hi.clearRect(0, 0, s, s);
      hi.imageSmoothingEnabled = true;
      hi.imageSmoothingQuality = 'high';
      hi.drawImage(this.sand, 0, 0, s, s);
      hi.globalCompositeOperation = 'source-atop';
      hi.fillStyle = this.grainPattern;
      hi.fillRect(0, 0, s, s);
      hi.globalCompositeOperation = 'source-over';
      this.dirty = false;
    }

    drawRays(ctx, F) {
      const R = F.r * 2.7 * this.glow;
      ctx.save();
      ctx.translate(F.x, F.y);
      ctx.globalAlpha = 0.9 * this.glow;
      const halo = ctx.createRadialGradient(0, 0, F.r * 0.2, 0, 0, R);
      halo.addColorStop(0, '#ffffff');
      halo.addColorStop(0.35, this.glowColor);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.rotate(this.time * 0.5);
      ctx.fillStyle = halo;
      ctx.beginPath();
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a, a + (Math.PI / n) * 0.9);
        ctx.closePath();
      }
      ctx.fill();
      ctx.globalAlpha = 0.55 * this.glow;
      ctx.beginPath(); ctx.arc(0, 0, F.r * 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawFossil(ctx, F) {
      const k = this.layout.S / this.sandHi.width;
      const bob = this.revealed ? Math.sin(this.time * 2.4) * 3 : 0;
      const w = this.fossil.width * k * (1 + this.pop);
      ctx.drawImage(this.fossil, F.x - w / 2, F.y - w / 2 + bob, w, w);
    }

    drawStar(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    }

    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.vw, this.vh);
      if (!this.level) return;
      if (this.dirty) this.renderSand();
      const { cx, cy, S } = this.layout;
      const x0 = cx - S / 2, y0 = cy - S / 2;

      // ground shadow under the pile
      ctx.save();
      ctx.translate(cx + S * 0.03, cy + S * 0.07);
      ctx.scale(1, 0.8);
      const sg = ctx.createRadialGradient(0, 0, S * 0.25, 0, 0, S * 0.56);
      sg.addColorStop(0, 'rgba(50,25,8,0.34)');
      sg.addColorStop(1, 'rgba(50,25,8,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, S * 0.56, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.bed, x0, y0, S, S);
      const F = this.fossilScreen();
      if (this.revealed) {
        ctx.drawImage(this.sandHi, x0, y0, S, S);
        if (this.glow > 0.01) this.drawRays(ctx, F);
        this.drawFossil(ctx, F);
      } else {
        this.drawFossil(ctx, F);
        ctx.drawImage(this.sandHi, x0, y0, S, S);
      }

      for (const p of this.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const s of this.sparkles) {
        const t = s.life / s.max;
        const r = s.size * Math.sin(t * Math.PI);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
        this.drawStar(ctx, s.x, s.y, r);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = this.revealed ? this.glowColor : '#fff6c8';
        this.drawStar(ctx, s.x, s.y, r * 1.6);
      }
      ctx.globalAlpha = 1;
    }
  }

  FB.DigSite = DigSite;
})();
