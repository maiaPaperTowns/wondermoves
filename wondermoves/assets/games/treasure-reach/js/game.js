/* ==========================================================================
   Treasure Reach: main loop.
   One rep:  start spot → push both hands toward the laptop → hold → chest opens
             → pull hands back to the start spot → new chest.

   When does a chest open? Two conditions together, held for the level's time:
     (a) the board's Distance sensor (pointed at the hands) reads within the level's
         distance of "max forward"  [camera-only play: both wrists reach the level's
         share of the way to max forward instead]
     (b) the tops of BOTH hands stay in the camera picture, at about the same point
         between start and max forward, so both hands are pushing, not just one
         (the sensor only measures the closest object).
   The red/blue circles sit on the horizon and slide toward the chest: first from the
   camera (wrists moving toward max forward), then from the sensor once it reads.
   ========================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = t => 1 - Math.pow(1 - t, 2);
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

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
    m: null,                  // latest measurement (see measure())
    minMm: null, unevenSaidAt: 0, outSaidAt: 0,
    particles: [],

    get mode() { return TR.Store.data.inputMode; },

    afterCalibration() {
      WM.CamPanel.dock();
      WM.CamPanel.cameraOn(WM.Hands.running);
      // On the UNO Q with a Distance sensor, the sensor decides when the chest opens.
      TR.Store.data.inputMode = TR.hasSensor() ? 'board' : 'camera';
      TR.Store.save();
      if (this.mode === 'board') WM.Board.send('start', { game: 'reach_ui' });
      this.startPlay();
    },

    /** First time: a 3-step tutorial. Then straight to play at the saved level
        (the level chip at the top still opens the level picker). */
    startPlay() {
      this.state = 'rest';
      this.resetRep();
      if (!TR.Store.data.tutorialDone) setTimeout(() => TR.openTutorial(), 400);
      else setTimeout(() => this.nudge(true), 400);
    },

    /** UNO Q with a Distance sensor: no camera setup. The sensor alone opens the chest. */
    useSensor() {
      WM.Hands.stop();
      TR.Calib.active = false;
      TR.Store.data.inputMode = 'sensor'; TR.Store.save();
      WM.CamPanel.dock();
      WM.CamPanel.show(false);
      WM.Board.send('start', { game: 'reach_ui' });
      this.startPlay();
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
      WM.Buddy.say(pick(this.mode === 'mouse' ? TR.LINES.mouse : this.mode === 'sensor' ? TR.LINES.sensor : TR.LINES.rest), 3600);
    },

    resetRep() {
      this.hold = 0; this.peak = 0; this.peakReach = 0; this.peakSide = null; this.repStart = 0; this.minMm = null;
      this.said = {};
    },

    /* ---------- measurement ----------
       Returns { p: {left, right} per-circle progress, bar, ok (chest condition met), back (hands at start) } */
    measure() {
      const S = TR.SENSE;
      if (this.mode === 'mouse') {
        if (!this.mouse.active) return { p: { left: null, right: null }, bar: 0, ok: false, back: true };
        const far = Math.max(180, Math.hypot(W * 0.15, H - chestC.y) * 0.95);
        const near = chestC.r * 0.55;
        const d = Math.hypot(this.mouse.x - chestC.x, this.mouse.y - chestC.y);
        const v = clamp((far - d) / (far - near), 0, 1.25);
        return { p: { left: null, right: v }, bar: v, ok: v >= 1, back: v < TR.Store.s.restLevel };
      }
      if (this.mode === 'sensor') {
        // Distance sensor only: the bar fills from trustMm (150 mm) to openMm (50 mm).
        const d = TR.sensorMm(), goal = S.openMm;
        if (d != null) this.minMm = this.minMm == null ? d : Math.min(this.minMm, d);
        const v = d == null ? 0 : clamp((S.trustMm - d) / (S.trustMm - goal), 0, 1);
        // A single noisy reading mid-hold doesn't reset the hold: "near" lasts 150 ms after the last near reading.
        const now = performance.now();
        if (d != null && d <= goal) this.nearAt = now;
        const ok = now - (this.nearAt || 0) <= 150;
        this.m = { d, goal };
        const bar = ok ? 1 : Math.min(v, 0.97);
        if (this.state === 'rest' || this.state === 'holding') this.peakReach = Math.max(this.peakReach, v);
        // back at rest: the hand has moved away from the sensor (or it sees nothing)
        return { p: { left: null, right: bar }, bar, ok, back: !ok && (d == null || d > goal + 20) };
      }
      const L = WM.Hands.latest;
      const cam = { left: TR.camProgress('left', L.left), right: TR.camProgress('right', L.right) };
      const both = cam.left != null && cam.right != null;
      const level = both && Math.abs(cam.left - cam.right) <= S.levelTol;
      const seen = [cam.left, cam.right].filter(v => v != null);
      const avg = seen.length ? seen.reduce((a, b) => a + b, 0) / 2 : 0; // a missing hand counts as 0
      const back = seen.length > 0 && Math.max(...seen) < S.restBelow;
      let p, bar, ok;
      if (this.mode === 'board') {
        // Camera alone fills the bar only up to S.switchAt (a gap stays between the circles and
        // the chest). The sensor closes that gap: handoffMm (100 mm) → switchAt, openMm (50 mm) → 100%.
        const d = TR.sensorMm(), goal = S.openMm;
        const near = d != null && d <= S.handoffMm;
        const sensorP = near ? clamp((S.handoffMm - d) / (S.handoffMm - goal), 0, 1) : null;
        if (d != null) this.minMm = this.minMm == null ? d : Math.min(this.minMm, d);
        const camPart = clamp(avg, 0, 1) * S.switchAt;
        bar = sensorP == null ? camPart : Math.max(camPart, S.switchAt + (1 - S.switchAt) * sensorP);
        ok = d != null && d <= goal && level;               // (a) sensor at 50 mm and (b) both hands
        p = {};
        ['left', 'right'].forEach(s => {
          p[s] = cam[s] == null ? null : sensorP == null ? clamp(cam[s], 0, 1) * S.switchAt : bar;
        });
        this.m = { cam, both, level, d, goal, sensorP };
      } else {
        // camera only: both wrists reach the level's share of the way to max forward
        const goalFrac = TR.level().goalPct / 100;
        p = { left: cam.left == null ? null : clamp(cam.left / goalFrac, 0, 1.25), right: cam.right == null ? null : clamp(cam.right / goalFrac, 0, 1.25) };
        bar = clamp(avg / goalFrac, 0, 1.25);
        ok = level && Math.min(cam.left, cam.right) >= goalFrac;
        this.m = { cam, both, level };
      }
      if (!ok) bar = Math.min(bar, 0.97); // the bar only fills when the chest really can open
      if (this.state === 'rest' || this.state === 'holding') this.peakReach = Math.max(this.peakReach, clamp(avg, 0, 1.25));
      return { p, bar, ok, back };
    },

    update(dt) {
      const now = performance.now();
      const m = this.measure();
      this.p = m.p;
      this.bar = m.bar;
      this.shown += (this.bar - this.shown) * Math.min(1, dt * 10);
      if (TR.UI.blocking() || this.state === 'idle') {
        this.hold = 0;
        this.armed = false;
        if (this.state === 'holding') this.state = 'rest';
        return;
      }
      if (!this.armed && m.back) this.armed = true;

      // hands not seen / not level (camera + board)
      if (this.mode !== 'mouse' && (this.state === 'rest' || this.state === 'holding')) {
        const mm = this.m || {};
        const anyHand = mm.cam && (mm.cam.left != null || mm.cam.right != null);
        if (!anyHand) {
          if (!this.lostSince) this.lostSince = now;
          if (now - this.lostSince > 3000 && now - this.lostSaidAt > 9000) { this.lostSaidAt = now; WM.Buddy.say(pick(TR.LINES.lost), 4000); }
        } else {
          this.lostSince = 0;
          if (this.armed && this.bar > 0.4 && !mm.both && now - this.outSaidAt > 6000) { this.outSaidAt = now; WM.Buddy.say(pick(TR.LINES.handsOut), 3000); }
          else if (this.armed && this.bar > 0.4 && mm.both && !mm.level && now - this.unevenSaidAt > 6000) { this.unevenSaidAt = now; WM.Buddy.say(pick(TR.LINES.uneven), 3000); }
        }
      }

      const bar = this.bar;
      if ((this.state === 'rest' || this.state === 'holding') && this.armed) {
        if (bar > 0.15 && !this.repStart) this.repStart = now;
        if (bar > this.peak) { this.peak = bar; this.peakSide = this.p.left != null && this.p.left === bar ? 'left' : 'right'; }
        // no cheering while the hands are uneven or out of the picture: Pip's hint matters more then
        const fair = this.mode === 'mouse' || !this.m || (this.m.both && this.m.level);
        if (fair && bar > 0.5 && !this.said.half) { this.said.half = true; WM.Sound.tick(1); WM.Buddy.say(pick(TR.LINES.half), 2200); }
        if (fair && bar > 0.8 && !this.said.almost) { this.said.almost = true; WM.Sound.tick(3); WM.Buddy.say(pick(TR.LINES.almost), 2200); }
      }

      if (this.state === 'rest') {
        if (m.ok && this.armed) { this.state = 'holding'; this.hold = 0; }
        else if (m.ok && !this.said.rest) { this.said.rest = true; WM.Buddy.say('First, pull your hands back to your starting spot. Then reach! 🙌', 2600); }
      } else if (this.state === 'holding') {
        if (m.ok) {
          this.hold += dt * 1000;
          if (this.hold >= TR.level().holdMs) this.openChest();
        } else { this.state = 'rest'; this.hold = 0; }
      } else if (this.state === 'open') {
        this.openT += dt;
        if (this.openT > 2.4) { this.state = 'return'; WM.Buddy.say(pick(TR.LINES.back), 0); }
      } else if (this.state === 'return') {
        if (m.back) this.closeChest();
      }
    },

    openChest() {
      if (this.mode === 'board' || this.mode === 'sensor') {
        // Log the rep on the board (caregiver session log / parent website).
        WM.Board.send('reach_rep', { sensor_mm: this.minMm == null ? null : Math.round(this.minMm), goal_mm: Math.round(TR.sensorGoalMm()),
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
        side: this.peakSide,
        difficulty: TR.level().id,
        peak: +this.peak.toFixed(2),                 // bar at its fullest (1 = chest condition met)
        peakReach: +this.peakReach.toFixed(2),       // wrists' share of the way from start to max forward (camera)
        sensorMm: this.minMm == null ? null : Math.round(this.minMm),   // closest sensor reading (board)
        goalMm: this.mode === 'board' || this.mode === 'sensor' ? Math.round(TR.sensorGoalMm()) : null,
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
        } else if (p != null) {
          // Not where the hand is on camera: the circles sit on the horizon (chest height)
          // and slide toward the chest as the reach progresses.
          const off = side === 'left' ? -1 : 1;
          const startX = chestC.x + off * startSpread();
          const endX = chestC.x + off * chestC.r * 0.42;
          // straight in proportion to the bar, so the camera's 70% cap leaves a clear gap to the chest
          const e = Math.min(1, p);
          target = { x: startX + (endX - startX) * e, y: chestC.y + chestC.r * 0.05 };
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

  /** How far from the chest the circles start: symmetric, clear of the camera window and the reach bar. */
  function startSpread() {
    let left = 70;
    const cam = WM.CamPanel.el;
    if (cam && cam.style.display !== 'none' && !cam.classList.contains('collapsed')) left = Math.max(left, cam.getBoundingClientRect().right + 50);
    const right = W - (W < 640 ? 76 : 130) - 70;
    return Math.max(chestC.r * 0.9, Math.min(W * 0.34, chestC.x - left, right - chestC.x));
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
  /* UNO Q board: camera + Distance sensor (the sensor decides when the chest opens). The board's
     own in-tunnel calibration is not used: the camera setup above covers it. */
  WM.bridge.onVisibility(v => { if (v && (Game.mode === 'board' || Game.mode === 'sensor') && Game.state !== 'idle') WM.Board.send('start', { game: 'reach_ui' }); });
  WM.Board.ready(() => {
    // Distance sensor plugged in: play straight away, no camera setup.
    if (TR.hasSensor()) { Game.useSensor(); return; }
    // No sensor (e.g. the public website): camera setup, or Mouse from the setup card.
    TR.Store.data.inputMode = 'camera';
    TR.Calib.open(false);
  });
  requestAnimationFrame(frame);
})();
