/* ==========================================================================
   Treasure Reach: main loop.
   One rep:  rest → reach until the bar hits the goal → hold → chest opens
             → bring hands back to rest → new chest.
   ========================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = t => 1 - Math.pow(1 - t, 2);
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  TR.Store.load();
  WM.Sound.setMuted(!!TR.Store.data.muted);

  const fx = $('#fx'), ctx = fx.getContext('2d');
  const chest = $('#chest'), anchor = $('#chestAnchor');
  const camCanvas = $('#camOverlay'), camCtx = camCanvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, chestC = { x: 0, y: 0, r: 100 };

  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  const Game = TR.Game = {
    state: 'idle',            // idle | rest | holding | open | return
    p: { left: null, right: null },
    bar: 0, shown: 0, hold: 0, openT: 0,
    setCount: 0, setBest: 0, pendingSet: false,
    peak: 0, peakGrowth: 0, peakSide: null, repStart: 0,
    said: {}, lostSince: 0, lostSaidAt: 0,
    armed: false,             // a reach only counts after the hands have been at rest
    mouse: { x: 0, y: 0, active: false },
    pos: { left: null, right: null }, alpha: { left: 0, right: 0 }, trail: { left: [], right: [] },
    particles: [],

    get mode() { return TR.Store.data.inputMode; },

    afterCalibration() {
      TR.Panel.dock();
      TR.Panel.cameraOn(WM.Hands.running);
      this.state = 'rest';
      this.resetRep();
      if (!TR.Store.data.tutorialDone) setTimeout(() => TR.openTutorial(), 600);
      else this.nudge(true);
    },

    useMouse() {
      WM.Hands.stop();
      TR.Calib.active = false;
      TR.Store.data.inputMode = 'mouse'; TR.Store.save();
      TR.Panel.dock();
      TR.Panel.cameraOn(false);
      this.state = 'rest';
      this.resetRep();
      if (!TR.Store.data.tutorialDone) setTimeout(() => TR.openTutorial(), 400);
      else this.nudge(true);
    },

    nudge(force) {
      if (this.state !== 'rest' && !force) return;
      WM.Buddy.say(this.mode === 'mouse' ? pick(TR.LINES.mouse) : pick(TR.LINES.rest), 3600);
    },

    resetRep() {
      this.hold = 0; this.peak = 0; this.peakGrowth = 0; this.peakSide = null; this.repStart = 0;
      this.said = {};
    },

    /* ---------- progress toward the goal, per hand (1 = goal) ---------- */
    computeProgress() {
      if (this.mode === 'mouse') {
        if (!this.mouse.active) return { left: null, right: null };
        const far = Math.max(180, Math.hypot(W * 0.15, H - chestC.y) * 0.95);
        const near = chestC.r * 0.55;
        const d = Math.hypot(this.mouse.x - chestC.x, this.mouse.y - chestC.y);
        return { left: null, right: clamp((far - d) / (far - near), 0, 1.25) };
      }
      const c = TR.Store.data.calib;
      const goal = Math.max(0.04, (c ? c.goal : 0.25) * TR.Store.s.goalPct / 100);
      const L = WM.Hands.latest, out = { left: null, right: null };
      ['left', 'right'].forEach(s => {
        const g = TR.growth(s, L[s]);
        if (g != null) {
          out[s] = clamp(g / goal, 0, 1.25);
          if (this.state === 'rest' || this.state === 'holding') this.peakGrowth = Math.max(this.peakGrowth, g);
        }
      });
      return out;
    },

    update(dt) {
      const now = performance.now();
      const pr = this.computeProgress();
      this.p = pr;
      const s = TR.Store.s;
      const vals = [pr.left, pr.right].filter(v => v != null);
      this.bar = s.hands === 'both'
        ? (pr.left != null && pr.right != null ? Math.min(pr.left, pr.right) : 0)
        : (vals.length ? Math.max(...vals) : 0);
      this.shown += (this.bar - this.shown) * Math.min(1, dt * 10);
      if (TR.UI.blocking() || this.state === 'idle') {
        this.hold = 0;
        this.armed = false;
        if (this.state === 'holding') this.state = 'rest';
        return;
      }
      if (!this.armed && this.bar < s.restLevel) this.armed = true;

      // lost hands (camera only)
      if (this.mode === 'camera' && (this.state === 'rest' || this.state === 'holding')) {
        if (!vals.length) {
          if (!this.lostSince) this.lostSince = now;
          if (now - this.lostSince > 3000 && now - this.lostSaidAt > 9000) { this.lostSaidAt = now; WM.Buddy.say(pick(TR.LINES.lost), 4000); }
        } else this.lostSince = 0;
      }

      const bar = this.bar;
      if ((this.state === 'rest' || this.state === 'holding') && this.armed) {
        if (bar > 0.15 && !this.repStart) this.repStart = now;
        if (bar > this.peak) { this.peak = bar; this.peakSide = pr.left != null && pr.left === bar ? 'left' : 'right'; }
        if (bar > 0.5 && !this.said.half) { this.said.half = true; WM.Sound.tick(1); WM.Buddy.say(pick(TR.LINES.half), 2200); }
        if (bar > 0.8 && !this.said.almost) { this.said.almost = true; WM.Sound.tick(3); WM.Buddy.say(pick(TR.LINES.almost), 2200); }
      }

      if (this.state === 'rest') {
        if (bar >= 1 && this.armed) { this.state = 'holding'; this.hold = 0; }
        else if (bar >= 1 && !this.said.rest) { this.said.rest = true; WM.Buddy.say('First, rest your hands. Then reach! 🙌', 2600); }
      } else if (this.state === 'holding') {
        if (bar >= 0.95) {
          this.hold += dt * 1000;
          if (this.hold >= s.holdMs) this.openChest();
        } else { this.state = 'rest'; this.hold = 0; }
      } else if (this.state === 'open') {
        this.openT += dt;
        if (this.openT > 2.4) { this.state = 'return'; WM.Buddy.say(pick(TR.LINES.back), 0); }
      } else if (this.state === 'return') {
        if (bar < s.restLevel) this.closeChest();
      }
    },

    openChest() {
      this.state = 'open';
      this.openT = 0;
      this.hold = 0;
      chest.classList.add('open');
      WM.Sound.creak();
      setTimeout(() => WM.Sound.fanfare(2), 180);

      const total = TR.TREASURES.reduce((a, t) => a + t.w, 0);
      let r = Math.random() * total, prize = TR.TREASURES[0];
      for (const t of TR.TREASURES) { r -= t.w; if (r < 0) { prize = t; break; } }
      const rw = $('#reward');
      rw.querySelector('.reward-art').innerHTML = prize.image ? `<img src="${prize.image}" alt="">` : prize.emoji;
      rw.querySelector('.reward-name').textContent = prize.name;
      rw.classList.remove('show'); void rw.offsetWidth; rw.classList.add('show');

      for (let k = 0; k < 34; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, sp = 320 + Math.random() * 420;
        this.particles.push({
          x: chestC.x + (Math.random() - 0.5) * chestC.r, y: chestC.y - chestC.r * 0.2,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
          life: 0, max: 1.4 + Math.random() * 0.6, e: pick(['coin', 'coin', 'coin', '💎', '✨']), size: 22 + Math.random() * 16,
        });
      }
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 110, spread: 90, startVelocity: 42, origin: { x: chestC.x / W, y: chestC.y / H }, colors: ['#FFC94A', '#FF8A3D', '#ffffff', '#22B4A3'] });
      }
      WM.Buddy.say(pick(TR.LINES.open), 2400);

      const d = TR.Store.data;
      d.totals.chests++;
      d.totals.treasures[prize.id] = (d.totals.treasures[prize.id] || 0) + 1;
      TR.Store.logRep({
        at: Date.now(),
        mode: this.mode,
        hands: TR.Store.s.hands,
        side: this.peakSide,
        peak: +this.peak.toFixed(2),                 // fraction of goal reached (1 = goal)
        peakGrowth: +this.peakGrowth.toFixed(3),     // palm growth vs. rest (camera only)
        goal: d.calib ? +d.calib.goal.toFixed(3) : null,
        goalPct: TR.Store.s.goalPct,
        holdMs: TR.Store.s.holdMs,
        ms: Math.round(performance.now() - (this.repStart || performance.now())),
        prize: prize.id,
      });

      this.setCount++;
      this.setBest = Math.max(this.setBest, this.peak);
      if (this.setCount % TR.Store.s.setSize === 0) this.pendingSet = true;
      this.renderDots();
    },

    closeChest() {
      chest.classList.remove('open');
      chest.classList.remove('fresh'); void chest.offsetWidth; chest.classList.add('fresh');
      $('#reward').classList.remove('show');
      this.state = 'rest';
      this.resetRep();
      this.armed = true; // hands are already back at rest
      WM.Sound.tick(0);
      if (this.pendingSet) {
        this.pendingSet = false;
        TR.SetCard.show(TR.Store.s.setSize, Math.round(this.setBest * 100));
        this.setBest = 0;
        WM.Sound.fanfare(4);
        if (typeof window.confetti === 'function') window.confetti({ particleCount: 180, spread: 160, origin: { x: 0.5, y: 0.35 }, shapes: ['star'], colors: ['#FFC94A', '#FF8A3D', '#ffffff'] });
        this.renderDots();
      } else {
        this.nudge(true);
      }
    },

    renderDots() {
      const n = TR.Store.s.setSize;
      const done = this.pendingSet ? n : this.setCount % n;
      $('#setDots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('');
    },
  };

  /* ---------------- reach meter ---------------- */
  const rmFill = $('#rmFill'), rmVal = $('#rmVal'), rmL = $('#rmLeft'), rmR = $('#rmRight'), rmHold = $('#rmHoldRing'), meter = $('#reachMeter');
  function renderMeter() {
    const v = Game.state === 'open' ? 1 : Math.min(1, Game.shown);
    rmFill.style.height = v * 100 + '%';
    rmVal.textContent = Math.round(Math.min(1.25, Game.state === 'open' ? 1 : Game.shown) * 100) + '%';
    meter.classList.toggle('full', v >= 0.995);
    [['left', rmL], ['right', rmR]].forEach(([s, el]) => {
      const p = Game.p[s];
      el.classList.toggle('show', p != null && Game.state !== 'open');
      if (p != null) el.style.bottom = Math.min(1, p) * 100 + '%';
    });
    const hf = Game.state === 'holding' ? Math.min(1, Game.hold / TR.Store.s.holdMs) : Game.state === 'open' ? 1 : 0;
    rmHold.style.strokeDashoffset = String(100 - hf * 100);
    const k = Game.state === 'open' || Game.state === 'return' ? 0 : clamp((Game.shown - 0.5) / 0.5, 0, 1);
    chest.style.setProperty('--p', Math.min(1, Game.shown).toFixed(3));
    chest.style.setProperty('--shake', k.toFixed(3));
  }

  /* ---------------- drawing: hands + coins ---------------- */
  function drawHand(side, x, y, p, a) {
    const col = WM.Hands.COLORS[side];
    const R = 24 + 14 * Math.min(1, p);
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(x, y, R * 0.4, x, y, R * 2.6);
    g.addColorStop(0, hexA(col, 0.6));
    g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    const hi = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, 1, x, y, R);
    hi.addColorStop(0, 'rgba(255,255,255,0.95)');
    hi.addColorStop(0.45, 'rgba(255,255,255,0.25)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    if (p >= 1) {
      const t = performance.now() / 1000;
      ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 8));
      ctx.lineWidth = 5; ctx.strokeStyle = '#FFE27A';
      ctx.beginPath(); ctx.arc(x, y, R + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a;
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(R * 0.7)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(side === 'left' ? 'L' : 'R', x, y + 1);
    ctx.globalAlpha = 1;
  }

  function drawFx(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // coins
    const ps = Game.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.life += dt;
      if (p.life > p.max) { ps.splice(k, 1); continue; }
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.max - p.life) * 3);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.e === 'coin') {
        const r = p.size * 0.45;
        ctx.scale(Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2, 1); // spinning coin
        ctx.fillStyle = '#E9A100';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFD34D';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.22, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.font = `${p.size}px ${EMOJI_FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.e, 0, 0);
      }
      ctx.restore();
    }

    // hands
    const blockingCalib = TR.Calib.active;
    ['left', 'right'].forEach(side => {
      let target = null;
      const p = Game.p[side];
      if (!blockingCalib) {
        if (Game.mode === 'mouse') {
          if (side === 'right' && Game.mouse.active) target = { x: Game.mouse.x, y: Game.mouse.y };
        } else {
          const h = WM.Hands.latest[side];
          if (h && p != null) {
            const cam = { x: h.x * W, y: h.y * H };
            const off = side === 'left' ? -1 : 1;
            const tgt = { x: chestC.x + off * chestC.r * 0.42, y: chestC.y + chestC.r * 0.05 };
            const e = ease(Math.min(1, p));
            target = { x: cam.x + (tgt.x - cam.x) * e, y: cam.y + (tgt.y - cam.y) * e };
          }
        }
      }
      if (target) {
        const cur = Game.pos[side];
        Game.pos[side] = cur ? { x: cur.x + (target.x - cur.x) * Math.min(1, dt * 14), y: cur.y + (target.y - cur.y) * Math.min(1, dt * 14) } : target;
        Game.alpha[side] = Math.min(1, Game.alpha[side] + dt * 5);
      } else {
        Game.alpha[side] = Math.max(0, Game.alpha[side] - dt * 3);
      }
      const pos = Game.pos[side];
      if (!pos || Game.alpha[side] <= 0) { Game.trail[side].length = 0; return; }
      const tr = Game.trail[side];
      tr.push({ x: pos.x, y: pos.y });
      if (tr.length > 14) tr.shift();
      const col = WM.Hands.COLORS[side];
      tr.forEach((q, i) => {
        ctx.globalAlpha = (i / tr.length) * 0.35 * Game.alpha[side];
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(q.x, q.y, 6 + i * 0.9, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      drawHand(side, pos.x, pos.y, p || 0, Game.alpha[side]);
    });
  }

  function drawCamOverlay() {
    const panel = TR.Panel.el;
    if (!WM.Hands.running || panel.classList.contains('collapsed')) return;
    const w = camCanvas.clientWidth, h = camCanvas.clientHeight;
    if (!w || !h) return;
    if (camCanvas.width !== Math.round(w * dpr)) { camCanvas.width = Math.round(w * dpr); camCanvas.height = Math.round(h * dpr); }
    camCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    WM.Hands.drawOverlay(camCtx, w, h);
    const st = $('#camStatus');
    const n = ['left', 'right'].filter(s => WM.Hands.latest[s]).length;
    const txt = n === 2 ? '🙌 2 hands' : n === 1 ? '✋ 1 hand' : '👀 looking…';
    if (st.textContent !== txt) st.textContent = txt;
  }

  /* ---------------- layout + input ---------------- */
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr);
    fx.style.width = W + 'px'; fx.style.height = H + 'px';
    const r = anchor.getBoundingClientRect();
    chestC = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }
  window.addEventListener('resize', resize);

  const setMouse = e => { Game.mouse.x = e.clientX; Game.mouse.y = e.clientY; Game.mouse.active = true; };
  window.addEventListener('pointermove', setMouse);
  window.addEventListener('pointerdown', e => { WM.Sound.ensure(); setMouse(e); });
  document.documentElement.addEventListener('pointerleave', () => { Game.mouse.active = false; });

  // pause tracking while another WonderMoves tab is showing
  WM.bridge.onVisibility(v => {
    WM.Hands.pause(!v);
    WM.Sound.setMuted(v ? !!TR.Store.data.muted : true);
  });

  /* ---------------- loop ---------------- */
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    requestAnimationFrame(frame); // schedule first so one bad frame can never stop the game
    try {
      if (TR.Calib.active) TR.Calib.update(dt);
      Game.update(dt);
      renderMeter();
      drawFx(dt);
      drawCamOverlay();
    } catch (e) {
      console.error('[Treasure Reach] frame error', e);
    }
  }

  // match the camera box to the camera's real shape so the overlay lines up
  $('#camVideo').addEventListener('loadedmetadata', e => {
    const v = e.target;
    if (v.videoWidth && v.videoHeight) document.querySelector('.cam-view').style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
  });
  // let the idle wiggle resume after the "new chest" bounce
  chest.addEventListener('animationend', e => { if (e.animationName === 'chestFresh') chest.classList.remove('fresh'); });

  /* ---------------- boot ---------------- */
  TR.UI.init();
  resize();
  Game.renderDots();
  if (TR.Store.data.inputMode === 'mouse') Game.useMouse();
  else TR.Calib.open(false);
  requestAnimationFrame(frame);
})();
