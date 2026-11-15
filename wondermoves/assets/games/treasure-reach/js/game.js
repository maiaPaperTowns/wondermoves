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
  /** Hands that reach past the bottom of the camera picture still count (see computeProgress). */
  const OUT_OF_VIEW = { minP: 0.5, edgeY: 0.72, ms: 2500 };

  TR.Store.load();
  WM.Sound.setMuted(!!TR.Store.data.muted);
  WM.CamPanel.mount({ storageKey: 'treasureReach.camHidden' });

  const fx = $('#fx'), ctx = fx.getContext('2d');
  const chest = $('#chest'), anchor = $('#chestAnchor');
  let W = 0, H = 0, dpr = 1, chestC = { x: 0, y: 0, r: 100 };

  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  const Game = TR.Game = {
    state: 'idle',            // idle | rest | holding | open | return
    p: { left: null, right: null },
    bar: 0, shown: 0, hold: 0, openT: 0,
    setCount: 0, setBest: 0, pendingSet: false,
    peak: 0, peakReach: 0, peakSide: null, repStart: 0,
    said: {}, lostSince: 0, lostSaidAt: 0,
    armed: false,             // a reach only counts after the hands have been at rest
    mouse: { x: 0, y: 0, active: false },
    pos: { left: null, right: null }, alpha: { left: 0, right: 0 }, trail: { left: [], right: [] },
    seen: { left: null, right: null }, // last progress/position per hand (for hands that reach out of the picture)
    particles: [],

    get mode() { return TR.Store.data.inputMode; },

    afterCalibration() {
      WM.CamPanel.dock();
      WM.CamPanel.cameraOn(WM.Hands.running);
      this.startPlay();
    },

    /** First time: tutorial, then pick a level. Otherwise straight to the level picker. */
    startPlay() {
      this.state = 'rest';
      this.resetRep();
      if (!TR.Store.data.tutorialDone) setTimeout(() => TR.openTutorial(() => TR.UI.openLevels()), 500);
      else TR.UI.openLevels();
    },

    /** UNO Q board: reach measured by the Modulino Distance sensor in the dig tunnel. */
    useBoard() {
      WM.Hands.stop();
      TR.Calib.active = false;
      TR.Store.data.inputMode = 'board'; TR.Store.save();
      WM.CamPanel.dock();
      WM.CamPanel.cameraOn(false, 'Using the dig-tunnel sensor');
      const p = WM.Board.profile || {};
      if (!p.comfortable_mm) {
        // No calibration yet: run the board's (rest, then 3 comfy reaches), voiced by Pip.
        this.state = 'idle';
        WM.Buddy.say('First, rest your hand on the towel and keep it still. 🖐️', 0);
        WM.Board.send('calibrate');
        return;
      }
      WM.Board.send('start', { game: 'reach_ui' });
      this.startPlay();
    },

    /** Goal in mm on the board: a share of the comfy reach, never above the approved maximum. */
    boardGoalMm() {
      const p = WM.Board.profile || {};
      const comfy = p.comfortable_mm || 50;
      return Math.max(10, Math.min(comfy * TR.level().goalPct / 100, p.approved_max_mm || Infinity));
    },

    useMouse() {
      WM.Hands.stop();
      TR.Calib.active = false;
      TR.Store.data.inputMode = 'mouse'; TR.Store.save();
      WM.CamPanel.dock();
      WM.CamPanel.show(false); // no camera window (or toggle) in mouse mode
      this.startPlay();
    },

    nudge(force) {
      if (this.state !== 'rest' && !force) return;
      WM.Buddy.say(pick(this.mode === 'mouse' ? TR.LINES.mouse : this.mode === 'board' ? TR.LINES.board : TR.LINES.rest), 3600);
    },

    resetRep() {
      this.hold = 0; this.peak = 0; this.peakReach = 0; this.peakSide = null; this.repStart = 0;
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
      if (this.mode === 'board') {
        const fresh = performance.now() - WM.Board.reachAt < 600;
        if (!fresh || WM.Board.reachMm == null) return { left: null, right: null };
        const frac = clamp(WM.Board.reachMm / this.boardGoalMm(), 0, 1.25);
        if (this.state === 'rest' || this.state === 'holding') this.peakReach = Math.max(this.peakReach, frac);
        return { left: null, right: frac };
      }
      const goalFrac = TR.level().goalPct / 100;
      const L = WM.Hands.latest, out = { left: null, right: null };
      const now = performance.now();
      ['left', 'right'].forEach(s => {
        const r = TR.reachAmount(s, L[s]); // 1 = calibrated comfy reach
        if (r != null) {
          out[s] = clamp(r / goalFrac, 0, 1.25);
          this.seen[s] = { p: out[s], y: L[s].y, t: now };
          if (this.state === 'rest' || this.state === 'holding') this.peakReach = Math.max(this.peakReach, r);
        } else {
          // A front camera loses hands that reach all the way to the computer: they slide off
          // the bottom of the picture. If a hand was well on its way and left through the
          // bottom edge, count it as reaching the goal for a moment instead of dropping to 0.
          const k = this.seen[s];
          if (k && k.p >= OUT_OF_VIEW.minP && k.y > OUT_OF_VIEW.edgeY && now - k.t < OUT_OF_VIEW.ms) out[s] = Math.max(k.p, 1);
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

      // lost hands (camera or board sensor)
      if (this.mode !== 'mouse' && (this.state === 'rest' || this.state === 'holding')) {
        if (!vals.length) {
          if (!this.lostSince) this.lostSince = now;
          if (now - this.lostSince > 3000 && now - this.lostSaidAt > 9000) { this.lostSaidAt = now; WM.Buddy.say(pick(this.mode === 'board' ? TR.LINES.boardLost : TR.LINES.lost), 4000); }
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
          if (this.hold >= TR.level().holdMs) this.openChest();
        } else { this.state = 'rest'; this.hold = 0; }
      } else if (this.state === 'open') {
        this.openT += dt;
        if (this.openT > 2.4) { this.state = 'return'; WM.Buddy.say(pick(TR.LINES.back), 0); }
      } else if (this.state === 'return') {
        if (bar < s.restLevel) this.closeChest();
      }
    },

    openChest() {
      if (this.mode === 'board') {
        // Log the rep on the board (caregiver session log / parent website).
        WM.Board.send('reach_rep', { reach_mm: Math.round(WM.Board.reachMm || 0), goal_mm: Math.round(this.boardGoalMm()),
          level: TR.level().id, hold_ms: TR.level().holdMs });
      }
      this.state = 'open';
      this.openT = 0;
      this.hold = 0;
      chest.classList.add('open');
      WM.Sound.creak();
      setTimeout(() => WM.Sound.fanfare(2 + Math.floor(pickRank() / 2)), 180);

      const prize = pickTreasure();
      const rar = TR.rarityById(prize.rarity), rank = TR.rarityIndex(prize.rarity);
      const isNew = !TR.Store.data.totals.treasures[prize.id];
      const rw = $('#reward');
      rw.style.setProperty('--rc', rar.color);
      rw.style.setProperty('--rd', rar.deep);
      rw.querySelector('.reward-art').innerHTML = prize.image ? `<img src="${prize.image}" alt="">` : prize.emoji;
      rw.querySelector('.reward-name').textContent = prize.name;
      rw.querySelector('.reward-rarity').textContent = `${rar.icon} ${rar.name}`;
      rw.querySelector('.reward-new').hidden = !isNew;
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
        window.confetti({ particleCount: 90 + rank * 40, spread: 90 + rank * 10, startVelocity: 42, origin: { x: chestC.x / W, y: chestC.y / H }, colors: [rar.color, rar.deep, '#FFC94A', '#ffffff'] });
      }
      WM.Buddy.say(isNew && rank >= 2 ? `WOW! ${/^[AEIOU]/.test(rar.name) ? 'An' : 'A'} ${rar.name} ${prize.name}! ${rar.icon}` : isNew ? `A new treasure for your collection! 📖` : pick(TR.LINES.open), 2600);

      const d = TR.Store.data;
      d.totals.chests++;
      d.totals.treasures[prize.id] = (d.totals.treasures[prize.id] || 0) + 1;
      TR.Store.logRep({
        at: Date.now(),
        mode: this.mode,
        hands: TR.Store.s.hands,
        side: this.peakSide,
        difficulty: TR.level().id,
        peak: +this.peak.toFixed(2),                 // fraction of the level's goal reached (1 = goal)
        peakReach: +this.peakReach.toFixed(2),       // fraction of the calibrated comfy reach (camera only)
        goalPct: TR.level().goalPct,
        holdMs: TR.level().holdMs,
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

  /* ---------------- treasure roll: rarity odds come from the level ---------------- */
  let lastRank = 0;
  function pickRank() { return lastRank; }
  function pickTreasure() {
    const w = TR.level().weights;
    let r = Math.random() * w.reduce((a, b) => a + b, 0), ri = 0;
    for (; ri < w.length - 1; ri++) { r -= w[ri]; if (r < 0) break; }
    let pool = [];
    for (let k = ri; k >= 0 && !pool.length; k--) pool = TR.TREASURES.filter(t => t.rarity === TR.RARITIES[k].id);
    const fresh = pool.filter(t => !TR.Store.data.totals.treasures[t.id]);
    if (fresh.length && Math.random() < 0.6) pool = fresh; // gently favour treasures not found yet
    const prize = pool[(Math.random() * pool.length) | 0];
    lastRank = TR.rarityIndex(prize.rarity);
    return prize;
  }

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
    const hf = Game.state === 'holding' ? Math.min(1, Game.hold / TR.level().holdMs) : Game.state === 'open' ? 1 : 0;
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
          const h = WM.Hands.latest[side] || (p != null && Game.seen[side] ? { x: Game.pos[side] ? Game.pos[side].x / W : 0.5, y: 1 } : null);
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
    WM.CamPanel.draw((c, w, h) => TR.Calib.drawExtra(c, w, h));
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
    TR.UI.tabHidden = !v;
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

  // let the idle wiggle resume after the "new chest" bounce
  chest.addEventListener('animationend', e => { if (e.animationName === 'chestFresh') chest.classList.remove('fresh'); });

  /* ---------------- boot ---------------- */
  TR.UI.init();
  resize();
  Game.renderDots();
  /* UNO Q board: use the Distance sensor when the board is there and the sensor is plugged in. */
  WM.Board.on('calibration_step', d => WM.Buddy.say(d.step === 'baseline'
    ? 'Rest your hand on the towel and keep it still. 🖐️' : 'Now 3 small, comfy reaches toward the cave, then back. 🙌', 0));
  WM.Board.on('calibration_rep', d => WM.Buddy.say(`Got it, ${d.count}! ⭐`, 1800));
  WM.Board.on('calibration_done', () => { WM.Buddy.say('All set up. Let\'s dig for treasure! 🎉', 2600); if (Game.mode === 'board') Game.useBoard(); });
  WM.Board.on('calibration_busy', () => WM.Buddy.say('Let\'s finish setting up first: rest, then 3 small reaches.', 3000));
  WM.Board.on('hand_not_seen', () => { if (Game.mode === 'board') WM.Buddy.say(pick(TR.LINES.boardLost), 3500); });
  WM.bridge.onVisibility(v => { if (v && Game.mode === 'board' && Game.state !== 'idle') WM.Board.send('start', { game: 'reach_ui' }); });
  WM.Board.ready(() => {
    const sensorOk = WM.Board.available && WM.Board.sensors && WM.Board.sensors.distance !== false;
    // Every launch starts with the camera (or the board's sensor on the UNO Q); Mouse lasts until reload.
    if (WM.Board.available && sensorOk !== false) Game.useBoard();
    else { TR.Store.data.inputMode = 'camera'; TR.Calib.open(false); }
  });
  requestAnimationFrame(frame);
})();
