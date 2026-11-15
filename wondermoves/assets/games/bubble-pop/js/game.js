/* ==========================================================================
   Bubble Pop: main loop.
   Two modes (BP.Store.s.lift):
   - Lift (default, WonderMoves evidence rules): no timer, no countdown, no missed bubbles.
     A bubble waits directly above a resting hand; lifting that hand straight up pops it.
     Order: left, right, then a pair that needs both hands up together (bimanual training).
     The next bubble only counts after the hand comes back to rest. Lift height comes from the
     caregiver setting on the board (Grown-ups → Bubble Lift height), never raised by the game.
   - Timed original: countdown → bubbles rise for N seconds → results.
   A bubble pops when a hand circle touches it AND BP.canPop(side) says yes (timed mode).
   ========================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const HAND_R = 30;
  const SIZE = { small: 0.8, medium: 1, big: 1.3 };

  BP.Store.load();
  WM.Sound.setMuted(!!BP.Store.data.muted);
  WM.CamPanel.mount({ storageKey: 'bubblePop.camHidden' });

  const fx = $('#fx'), ctx = fx.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const area = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  /* -----------------------------------------------------------------------
     Pop gate. Today: optional camera-measured hand speed.
     Later: motion-sensor input plugs in here, so a bubble only pops when the
     child actively moves to reach it (not when it drifts into a still hand).
     ----------------------------------------------------------------------- */
  BP.MOVE_SPEED = 140; // px/s on screen
  BP.canPop = function (side) {
    if (!BP.Store.s.popWhileMoving) return true;
    return Game.speed[side] > BP.MOVE_SPEED;
  };

  const Game = BP.Game = {
    state: 'setup',     // setup | ready | countdown | playing | ended
    score: 0, timeLeft: 60, spawnT: 0, countdown: 0,
    bubbles: [], fxp: [], texts: [],
    stats: { popped: 0, spawned: 0, missed: 0, left: 0, right: 0 },
    mouse: { x: 0, y: 0, active: false },
    pos: { left: null, right: null }, speed: { left: 0, right: 0 }, alpha: { left: 0, right: 0 }, trail: { left: [], right: [] },
    said: {}, lostSince: 0, lostSaidAt: 0, lastPopSay: 0,

    get mode() { return BP.Store.data.inputMode; },
    get diff() { return BP.DIFFICULTIES.find(d => d.id === BP.Store.s.difficulty) || BP.DIFFICULTIES[0]; },

    afterCalibration() {
      WM.CamPanel.dock();
      WM.CamPanel.cameraOn(WM.Hands.running);
      this.toReady();
    },

    useMouse() {
      WM.Hands.stop();
      WM.Pose.stop();
      BP.Calib.active = false;
      BP.Store.data.inputMode = 'mouse'; BP.Store.save();
      WM.CamPanel.dock();
      WM.CamPanel.show(false); // no camera window (or toggle) in mouse mode
      this.toReady();
    },

    toReady() {
      this.state = 'ready';
      if (!BP.Store.data.tutorialDone) setTimeout(() => BP.openTutorial(), 500);
      else BP.UI.openStart();
    },

    begin() {
      this.bubbles = []; this.texts = [];
      this.score = 0;
      this.timeLeft = BP.Store.s.seconds;
      this.spawnT = 0.4;
      this.stats = { popped: 0, spawned: 0, missed: 0, left: 0, right: 0 };
      this.said = {};
      if (BP.Store.s.lift) {
        this.state = 'playing';
        this.timeLeft = Infinity;
        Lift.reset();
        WM.Board.send('start', { game: 'bubbles' });
        renderHud();
        WM.Buddy.say(pick(BP.LINES.liftStart), 3500);
        return;
      }
      this.state = 'countdown';
      this.countdown = 3.999;
      this.lastCount = 4;
      renderHud();
      WM.Buddy.say(this.mode === 'mouse' ? pick(BP.LINES.mouse) : 'Get your hands ready… 🙌', 3000);
    },

    stopSession() {
      if (this.state === 'countdown' || this.state === 'playing') { this.state = 'ready'; this.bubbles = []; $('#countdown').classList.remove('show'); }
    },

    end() {
      this.state = 'ended';
      this.bubbles.forEach(b => { b.leaving = true; });
      WM.Sound.fanfare(3);
      WM.Buddy.say(pick(BP.LINES.end), 3000);
      const d = this.diff, best = BP.Store.data.best;
      const newBest = this.score > (best[d.id] || 0);
      if (newBest) best[d.id] = this.score;
      BP.Store.logSession({
        at: Date.now(), mode: this.mode, difficulty: d.id, seconds: BP.Store.s.seconds,
        bubbleSize: BP.Store.s.bubbleSize, popWhileMoving: BP.Store.s.popWhileMoving,
        score: this.score, ...this.stats,
      });
      if (typeof window.confetti === 'function') window.confetti({ particleCount: 150, spread: 120, origin: { x: 0.45, y: 0.4 }, colors: ['#7FD8FF', '#FFE27A', '#FF9AD5', '#ffffff'] });
      setTimeout(() => BP.UI.openResults({ score: this.score, newBest, diff: d, mode: this.mode, ...this.stats }), 1300);
    },

    spawn() {
      const d = this.diff;
      const total = BP.KINDS.reduce((a, k) => a + k.w, 0);
      let r = Math.random() * total, kind = BP.KINDS[0];
      for (const k of BP.KINDS) { r -= k.w; if (r < 0) { kind = k; break; } }
      const base = clamp(Math.min(W, H) * 0.075, 34, 72) * d.size * (SIZE[BP.Store.s.bubbleSize] || 1);
      const rad = base * rand(0.85, 1.15) * (kind.id === 'plain' ? 1 : 1.1);
      const span = area.y1 - area.y0;
      this.bubbles.push({
        x: rand(area.x0 + rad, area.x1 - rad), y: area.y1 + rad,
        r: rad, vy: -rand(d.speed[0], d.speed[1]) * span,
        phase: Math.random() * 6.28, hue: kind.id === 'star' ? 45 : rand(170, 330),
        kind, emoji: kind.emoji ? pick(kind.emoji) : null, age: 0,
      });
      this.stats.spawned++;
    },

    pop(b, side) {
      b.popped = true;
      this.score += b.kind.pts;
      this.stats.popped++;
      if (side) this.stats[side]++;
      WM.Sound.pop(clamp(1 - b.r / 80, 0, 1));
      if (b.kind.pts > 1) setTimeout(() => WM.Sound.tick(b.kind.pts + 1), 60);
      const col = b.kind.id === 'star' ? '#FFD34D' : `hsl(${b.hue},90%,80%)`;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, sp = rand(120, 260);
        this.fxp.push({ x: b.x + Math.cos(a) * b.r * 0.8, y: b.y + Math.sin(a) * b.r * 0.8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(0.35, 0.6), r: rand(3, 6), c: col });
      }
      this.fxp.push({ ring: true, x: b.x, y: b.y, r: b.r, life: 0, max: 0.35, c: col });
      this.texts.push({ x: b.x, y: b.y, t: 0, txt: `+${b.kind.pts}`, big: b.kind.pts > 1 });
      const pill = $('#scorePill');
      pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
      if (performance.now() - this.lastPopSay > 7000 && Math.random() < 0.5) { this.lastPopSay = performance.now(); WM.Buddy.say(pick(BP.LINES.pop), 1500); }
    },

    /* ---------- hands → screen ---------- */
    mapHand(h) {
      const r = BP.Store.data.range || { x0: 0.12, x1: 0.88, y0: 0.12, y1: 0.88 };
      const u = clamp((h.x - r.x0) / (r.x1 - r.x0), 0, 1);
      const v = clamp((h.y - r.y0) / (r.y1 - r.y0), 0, 1);
      return { x: area.x0 + u * (area.x1 - area.x0), y: area.y0 + v * (area.y1 - area.y0) };
    },

    updateHands(dt) {
      ['left', 'right'].forEach(side => {
        let target = null;
        if (!BP.Calib.active) {
          if (this.mode === 'mouse') { if (side === 'right' && this.mouse.active) target = { x: this.mouse.x, y: this.mouse.y }; }
          else {
            let h = WM.Hands.latest[side];
            // Board camera (UNO Q pose tracking or tools/mac_camera.py) when the browser camera isn't running.
            if (!h && !WM.Hands.running && performance.now() - boardHands.at < 600) {
              const b = boardHands[side]; if (b) h = { x: b[0], y: b[1] };
            }
            if (h) target = this.mapHand(h);
          }
        }
        const cur = this.pos[side];
        if (target) {
          const k = this.mode === 'mouse' ? 1 : Math.min(1, dt * 18);
          const next = cur ? { x: cur.x + (target.x - cur.x) * k, y: cur.y + (target.y - cur.y) * k } : target;
          const sp = cur && dt > 0 ? Math.hypot(next.x - cur.x, next.y - cur.y) / dt : 0;
          this.speed[side] += (sp - this.speed[side]) * Math.min(1, dt * 8);
          this.pos[side] = next;
          this.alpha[side] = Math.min(1, this.alpha[side] + dt * 5);
        } else {
          this.alpha[side] = Math.max(0, this.alpha[side] - dt * 3);
          this.speed[side] = 0;
        }
      });
    },

    update(dt) {
      this.updateHands(dt);
      // effects always animate
      for (let k = this.fxp.length - 1; k >= 0; k--) {
        const p = this.fxp[k];
        p.life += dt;
        if (p.life > p.max) { this.fxp.splice(k, 1); continue; }
        if (!p.ring) { p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      }
      for (let k = this.texts.length - 1; k >= 0; k--) { this.texts[k].t += dt; if (this.texts[k].t > 0.9) this.texts.splice(k, 1); }

      if (BP.UI.blocking()) return; // session clock pauses under menus, tutorial, hidden tab

      if (this.state === 'countdown') {
        this.countdown -= dt;
        const n = Math.ceil(this.countdown);
        if (n !== this.lastCount) {
          this.lastCount = n;
          const el = $('#countdown');
          el.textContent = n > 0 ? n : 'Pop!';
          el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
          WM.Sound.tick(n > 0 ? 3 - n : 5);
        }
        if (this.countdown <= 0) { this.state = 'playing'; WM.Buddy.say(pick(BP.LINES.start), 2500); }
        return;
      }

      const moving = this.state === 'playing' || this.state === 'ended';
      if (!moving) return;

      if (this.state === 'playing' && BP.Store.s.lift) {
        Lift.update(dt);
      } else if (this.state === 'playing') {
        this.timeLeft -= dt;
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawn(); this.spawnT = this.diff.every * rand(0.75, 1.25); }
        if (this.timeLeft <= 10 && !this.said.ten) { this.said.ten = true; WM.Buddy.say(pick(BP.LINES.ten), 2500); }
        if (this.timeLeft <= 5 && Math.ceil(this.timeLeft) !== this.said.tick) { this.said.tick = Math.ceil(this.timeLeft); WM.Sound.tick(0); }
        if (this.mode === 'camera') {
          const seen = WM.Hands.latest.left || WM.Hands.latest.right;
          const now = performance.now();
          if (!seen) {
            if (!this.lostSince) this.lostSince = now;
            if (now - this.lostSince > 2500 && now - this.lostSaidAt > 9000) { this.lostSaidAt = now; WM.Buddy.say(pick(BP.LINES.lost), 3500); }
          } else this.lostSince = 0;
        }
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.end(); }
      }

      for (let k = this.bubbles.length - 1; k >= 0; k--) {
        const b = this.bubbles[k];
        b.age += dt;
        b.y += b.vy * dt * (b.leaving ? 2.2 : 1);
        b.dx = Math.sin(b.age * 1.6 + b.phase) * b.r * 0.25;
        if (b.leaving) b.fade = (b.fade || 1) - dt * 1.5;
        if (b.popped || (b.fade != null && b.fade <= 0)) { this.bubbles.splice(k, 1); continue; }
        if (b.y + b.r < area.y0 - 4) { this.bubbles.splice(k, 1); if (!b.leaving) this.stats.missed++; continue; }
        if (this.state !== 'playing' || BP.Store.s.lift) continue;   // lift mode pops in Lift.update
        for (const side of ['left', 'right']) {
          const p = this.pos[side];
          if (!p || this.alpha[side] < 0.5) continue;
          if (Math.hypot(p.x - (b.x + b.dx), p.y - b.y) < b.r + HAND_R * 0.6 && BP.canPop(side)) { this.pop(b, this.mode === 'mouse' ? null : side); break; }
        }
      }
    },
  };

  /* ---------------- Lift mode (WonderMoves rules) ---------------- */
  const boardHands = { left: null, right: null, at: 0 };
  WM.Board.on('hands', d => { boardHands.left = d.hands.left; boardHands.right = d.hands.right; boardHands.at = performance.now(); });

  const Lift = BP.Lift = {
    rest: { left: [], right: [] }, ready: { left: true, right: true },
    order: ['left', 'right', 'pair'], step: 0, target: null, nextAt: 0, waitingSince: 0, lastSay: 0, pops: 0,
    reset() { this.rest = { left: [], right: [] }; this.ready = { left: true, right: true }; this.step = 0; this.target = null; this.nextAt = performance.now() + 1500; this.waitingSince = 0; this.pops = 0; },
    sides() { return Game.mode === 'mouse' ? ['right'] : ['left', 'right']; },
    /** Lift height in screen px: the caregiver's setting (fraction of camera height), through the hand mapping. */
    liftPx() {
      const p = WM.Board.profile || {};
      const r = BP.Store.data.range || { y0: 0.12, y1: 0.88 };
      const frac = p.lift_height || 0.16;
      return Game.mode === 'mouse' ? (area.y1 - area.y0) * 0.25 : frac * (area.y1 - area.y0) / Math.max(0.2, r.y1 - r.y0);
    },
    restOf(side) {
      const a = this.rest[side]; if (a.length < 10) return null;
      const med = k => a.map(p => p[k]).sort((x, y) => x - y)[a.length >> 1];
      return { x: med('x'), y: med('y') };
    },
    bubbleAt(side) { const r = this.restOf(side); return r && { x: r.x, y: Math.max(area.y0 + 60, r.y - this.liftPx()) }; },
    up(side) { const p = Game.pos[side], b = this.bubbleAt(side); return !!(p && b && Game.alpha[side] > 0.5 && p.y <= b.y + 24); },
    atRest(side) { const p = Game.pos[side], r = this.restOf(side); return !!(p && r && p.y >= r.y - this.liftPx() * 0.35); },
    say(lines, ms) { this.lastSay = performance.now(); WM.Buddy.say(pick(lines), ms || 2500); },

    update(dt) {
      const now = performance.now();
      for (const side of this.sides()) {        // learn each hand's resting spot while it is low
        const p = Game.pos[side];
        if (p && Game.alpha[side] > 0.5) {
          const r = this.restOf(side);
          if (!r || p.y >= r.y - this.liftPx() * 0.35) { this.rest[side].push({ x: p.x, y: p.y }); if (this.rest[side].length > 60) this.rest[side].shift(); }
          if (!this.ready[side] && this.atRest(side)) this.ready[side] = true;
        }
      }
      if (!this.target) {
        if (now < this.nextAt) return;
        const sides = this.sides();
        let want = this.order[this.step % this.order.length];
        if (!sides.includes(want) && want !== 'pair') { this.step++; return; }
        if (want === 'pair' && sides.length < 2) { this.step++; return; }
        const need = want === 'pair' ? ['left', 'right'] : [want];
        if (!need.every(s => this.restOf(s) && this.ready[s])) {
          if (!this.waitingSince) this.waitingSince = now;
          if (now - this.waitingSince > 6000 && now - this.lastSay > 7000) this.say(BP.LINES.liftRest, 3000);
          return;
        }
        this.waitingSince = 0;
        const kind = BP.KINDS.find(k => k.id === (want === 'pair' ? 'star' : 'plain')) || BP.KINDS[0];
        const rad = clamp(Math.min(W, H) * 0.075, 34, 72) * (SIZE[BP.Store.s.bubbleSize] || 1);
        this.target = { kind: want === 'pair' ? 'pair' : 'single', sides: need, bubbles: need.map(s => {
          const at = this.bubbleAt(s);
          const b = { x: at.x, y: at.y, r: rad, vy: 0, phase: Math.random() * 6.28, hue: want === 'pair' ? 200 : rand(170, 330),
            kind, emoji: kind.emoji ? pick(kind.emoji) : null, age: 0, side: s };
          Game.bubbles.push(b); Game.stats.spawned++;
          return b;
        }) };
        this.say(want === 'pair' ? BP.LINES.liftPair : want === 'left' ? BP.LINES.liftLeft : BP.LINES.liftRight, 2200);
        return;
      }
      // keep each bubble above its hand's (slowly drifting) resting spot
      this.target.bubbles.forEach(b => { const at = this.bubbleAt(b.side); if (at) { b.x += (at.x - b.x) * Math.min(1, dt * 2); b.y += (at.y - b.y) * Math.min(1, dt * 2); } });
      const t = this.target;
      if (t.sides.every(s => this.up(s) && this.ready[s])) {
        t.bubbles.forEach(b => Game.pop(b, Game.mode === 'mouse' ? null : b.side));
        t.sides.forEach(s => { this.ready[s] = false; });
        WM.Board.send('bubble_pop', { kind: t.kind });
        this.pops += t.sides.length;
        if (this.pops && this.pops % 12 < t.sides.length) setTimeout(() => this.say(BP.LINES.liftBreak, 3500), 1500);
        this.target = null; this.step++; this.nextAt = now + 1200;
      } else if (t.kind === 'pair' && t.sides.some(s => this.up(s)) && now - this.lastSay > 5000) {
        this.say(BP.LINES.liftHold, 2500);
      }
    },
  };

  /* ---------------- HUD ---------------- */
  const tankFill = $('#tankFill'), tankVal = $('#tankVal'), tank = $('#tank'), scoreVal = $('#scoreVal');
  function renderHud() {
    if (BP.Store.s.lift) {                     // no timer: the tank stays full
      tankFill.style.height = '100%'; tankVal.textContent = '🫧'; tank.classList.remove('low');
      if (scoreVal.textContent !== String(Game.score)) scoreVal.textContent = Game.score;
      return;
    }
    const total = BP.Store.s.seconds;
    const t = Game.state === 'playing' ? Game.timeLeft : Game.state === 'ended' ? 0 : total;
    tankFill.style.height = (t / total) * 100 + '%';
    tankVal.textContent = Math.ceil(t) + 's';
    tank.classList.toggle('low', Game.state === 'playing' && t <= 10);
    if (scoreVal.textContent !== String(Game.score)) scoreVal.textContent = Game.score;
  }

  /* ---------------- drawing ---------------- */
  function drawBubble(b) {
    const x = b.x + (b.dx || 0), y = b.y, r = b.r;
    const sq = 1 + Math.sin(b.age * 3 + b.phase) * 0.04;
    ctx.save();
    ctx.globalAlpha = b.fade != null ? Math.max(0, b.fade) : 1;
    ctx.translate(x, y);
    ctx.scale(sq, 2 - sq);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.55, `hsla(${b.hue},95%,82%,0.12)`);
    g.addColorStop(0.86, `hsla(${b.hue},95%,78%,0.38)`);
    g.addColorStop(1, `hsla(${b.hue},95%,88%,0.8)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = b.kind.id === 'star' ? 'rgba(255,211,77,0.95)' : 'rgba(255,255,255,0.8)';
    ctx.stroke();
    if (b.emoji) {
      ctx.globalAlpha *= 0.95;
      ctx.font = `${Math.round(r * 0.95)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.emoji, 0, r * 0.05);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.2, r * 0.11, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.42, r * 0.38, r * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHand(side, x, y, a) {
    const col = WM.Hands.COLORS[side], R = HAND_R;
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(x, y, R * 0.4, x, y, R * 2.6);
    g.addColorStop(0, hexA(col, 0.6)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    const hi = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, 1, x, y, R);
    hi.addColorStop(0, 'rgba(255,255,255,0.95)'); hi.addColorStop(0.45, 'rgba(255,255,255,0.25)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    if (BP.Store.s.popWhileMoving && Game.speed[side] > BP.MOVE_SPEED) {
      ctx.lineWidth = 4; ctx.strokeStyle = '#FFE27A';
      ctx.beginPath(); ctx.arc(x, y, R + 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(R * 0.7)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(side === 'left' ? 'L' : 'R', x, y + 1);
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    Game.bubbles.forEach(drawBubble);
    for (const p of Game.fxp) {
      const t = p.life / p.max;
      ctx.globalAlpha = 1 - t;
      if (p.ring) {
        ctx.lineWidth = 4 * (1 - t) + 1; ctx.strokeStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + t * 0.7), 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - t * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of Game.texts) {
      ctx.globalAlpha = 1 - t.t / 0.9;
      ctx.font = `700 ${t.big ? 34 : 26}px Fredoka, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = '#1B4E7A'; ctx.fillStyle = t.big ? '#FFE27A' : '#fff';
      const y = t.y - t.t * 70;
      ctx.strokeText(t.txt, t.x, y); ctx.fillText(t.txt, t.x, y);
    }
    ctx.globalAlpha = 1;
    ['left', 'right'].forEach(side => {
      const p = Game.pos[side];
      if (!p || Game.alpha[side] <= 0) { Game.trail[side].length = 0; return; }
      const tr = Game.trail[side];
      tr.push({ x: p.x, y: p.y });
      if (tr.length > 12) tr.shift();
      tr.forEach((q, i) => {
        ctx.globalAlpha = (i / tr.length) * 0.3 * Game.alpha[side];
        ctx.fillStyle = WM.Hands.COLORS[side];
        ctx.beginPath(); ctx.arc(q.x, q.y, 5 + i, 0, Math.PI * 2); ctx.fill();
      });
      drawHand(side, p.x, p.y, Game.alpha[side]);
    });
  }

  /* ---------------- layout + input ---------------- */
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr);
    fx.style.width = W + 'px'; fx.style.height = H + 'px';
    const side = W < 640 ? 76 : 116;
    area.x0 = 16; area.x1 = W - side - 30;
    area.y0 = W < 640 ? 74 : 90; area.y1 = H;
  }
  window.addEventListener('resize', resize);
  const setMouse = e => { Game.mouse.x = e.clientX; Game.mouse.y = e.clientY; Game.mouse.active = true; };
  window.addEventListener('pointermove', setMouse);
  window.addEventListener('pointerdown', e => { WM.Sound.ensure(); setMouse(e); });
  document.documentElement.addEventListener('pointerleave', () => { Game.mouse.active = false; });

  WM.bridge.onVisibility(v => {
    BP.UI.tabHidden = !v;
    WM.Hands.pause(!v);
    WM.Sound.setMuted(v ? !!BP.Store.data.muted : true);
  });

  /* ---------------- loop ---------------- */
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    requestAnimationFrame(frame);
    try {
      if (BP.Calib.active) BP.Calib.update(dt);
      Game.update(dt);
      renderHud();
      draw();
      WM.CamPanel.draw((c, w, h) => BP.Calib.drawExtra(c, w, h));
    } catch (e) {
      console.error('[Bubble Pop] frame error', e);
    }
  }

  /* ---------------- background bubbles (decoration only) ---------------- */
  const amb = $('#ambient');
  for (let k = 0; k < 16; k++) {
    const sp = document.createElement('span');
    const sz = rand(6, 18);
    Object.assign(sp.style, { left: rand(0, 100) + '%', width: sz + 'px', height: sz + 'px', animationDuration: rand(8, 18) + 's', animationDelay: -rand(0, 18) + 's', opacity: rand(0.3, 0.7) });
    amb.appendChild(sp);
  }

  /* ---------------- boot ---------------- */
  BP.UI.init();
  resize();
  // Every launch starts in Camera mode (Mouse lasts until the page is reloaded).
  BP.Store.data.inputMode = 'camera';
  BP.Calib.open();
  requestAnimationFrame(frame);
})();
