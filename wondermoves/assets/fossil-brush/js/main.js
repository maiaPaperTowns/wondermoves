/* ==========================================================================
   Main game controller: input, game loop, dig → reveal → collect flow.
   ========================================================================== */
(function () {
  const FB = window.FB;
  const $ = s => document.querySelector(s);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  FB.Store.load();
  FB.Sound.setMuted(!!FB.Store.data.muted);

  const canvas = $('#game');
  const site = FB.site = new FB.DigSite(canvas);  // FB.site: used by js/sensor.js (WonderMoves board input)
  const cursor = $('#brushCursor');
  const hand = $('#handHint');
  const digArea = $('#digArea');

  /* ---------------- choosing a treasure ---------------- */
  function pickItem(level) {
    const w = level.weights;
    const total = w.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total, ri = 0;
    for (; ri < w.length - 1; ri++) { roll -= w[ri]; if (roll < 0) break; }
    let pool = [];
    // if a level has no item of the rolled rarity, step down until one exists
    for (let k = ri; k >= 0 && !pool.length; k--) {
      pool = level.items.filter(i => i.rarity === FB.RARITIES[k].id);
    }
    if (!pool.length) pool = level.items;
    // gently favour treasures the player hasn't found yet
    const fresh = pool.filter(i => !FB.Store.isFound(i.id));
    if (fresh.length && Math.random() < 0.7) pool = fresh;
    return pick(pool);
  }

  /* ---------------- game state ---------------- */
  const Game = FB.Game = {
    state: 'idle',
    level: null, item: null, depth: 0,
    target: 0, shown: 0, zone: 0,
    said: {}, startAt: 0, lastBrushAt: 0,

    canDig() { return this.state === 'digging' && !FB.UI.blocking(); },
    params() { return { radius: this.level.brushRadius, strength: this.level.strength }; },

    setLevel(id) {
      this.level = FB.levelById(id) || FB.LEVELS[0];
      FB.Store.data.level = this.level.id; FB.Store.save();
      FB.UI.applyTheme(this.level);
      FB.UI.updateLevelPill(this.level);
      this.newDig();
    },

    newDig() {
      const item = pickItem(this.level);
      const r = FB.rarityById(item.rarity);
      this.item = item;
      this.depth = r.min + 4 + Math.random() * (r.max - r.min - 8);
      this.target = 0; this.shown = 0; this.zone = 0;
      this.said = {};
      this.state = 'digging';
      this.startAt = performance.now();
      this.lastBrushAt = 0;
      site.setup(this.level, item, this.depth, (Math.random() * 1e9) | 0);
      FB.Meter.reset();
      hideHand();
      if (!FB.UI.blocking()) FB.Buddy.say(pick(FB.LINES.start));
    },

    afterBrush() {
      const st = site.stats();
      this.target = Math.max(this.target, st.removed * this.depth);
      const z = Math.min(4, Math.floor(this.target / 20));
      if (z > this.zone) {
        this.zone = z;
        const r = FB.RARITIES[z];
        FB.Meter.flashZone(z);
        FB.Sound.chime();
        FB.Buddy.say(`We reached the ${r.name} zone! ${r.icon} Keep going!`);
      } else if (!this.said.peek && st.uncovered > 0.3) {
        this.said.peek = true;
        FB.Buddy.say(pick(FB.LINES.peek));
      }
      if (st.uncovered >= 0.8) this.reveal();
    },

    reveal() {
      this.state = 'revealing';
      const item = this.item, r = FB.rarityById(item.rarity), rank = FB.rarityIndex(item.rarity);
      FB.Sound.brush(0);
      site.startReveal(900, r.color);
      this.target = this.depth;
      setTimeout(() => {
        site.celebrate(r.color);
        FB.Sound.fanfare(rank);
        fireConfetti(r, rank);
        FB.Buddy.say(FB.LINES.found[r.id], 2600);
      }, 750);
      setTimeout(() => {
        const isNew = FB.Store.addFind(item, this.depth);
        this.state = 'found';
        FB.Meter.pin(item, this.depth);
        FB.Found.show(item, this.depth, isNew);
      }, 2100);
    },
  };

  /* ---------------- confetti ---------------- */
  function fireConfetti(r, rank) {
    if (typeof window.confetti !== 'function') return;
    const F = site.fossilScreen();
    const origin = { x: F.x / window.innerWidth, y: F.y / window.innerHeight };
    const colors = [r.color, r.deep, '#ffffff', '#FFE27A'];
    window.confetti({ particleCount: 70 + rank * 45, spread: 70 + rank * 15, startVelocity: 38 + rank * 4, origin, colors, scalar: 1.1 });
    if (rank >= 3) {
      setTimeout(() => {
        window.confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.75 }, colors });
        window.confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.75 }, colors });
      }, 250);
    }
    if (rank === 4) {
      setTimeout(() => window.confetti({ particleCount: 160, spread: 160, origin: { x: 0.5, y: 0.3 }, colors, shapes: ['star'], scalar: 1.4 }), 600);
    }
  }

  /* ---------------- layout ---------------- */
  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    const narrow = w < 640;
    const meterW = narrow ? 76 : 150;
    const top = narrow ? 76 : 92;
    const bottom = narrow ? 24 : 28;
    const availW = w - meterW - 16;
    const availH = h - top - bottom;
    const S = Math.max(220, Math.min(availW * 0.94, availH * 0.98, 780));
    const L = { cx: availW / 2 + 8, cy: top + availH / 2, S };
    site.resize(w, h, L);
    Object.assign(digArea.style, {
      left: L.cx - S / 2 + 'px', top: L.cy - S / 2 + 'px', width: S + 'px', height: S + 'px',
    });
    FB.Tutorial.reposition();
  }
  window.addEventListener('resize', layout);

  /* ---------------- input ---------------- */
  let down = false, last = null, pointerId = null;

  function moveCursor(x, y) {
    cursor.style.transform = `translate(${x - 6}px, ${y - 58}px)`;
  }
  function updateCursorVisibility(e) {
    const over = Game.canDig() && site.contains(e.clientX, e.clientY, 1.05);
    const show = over && (e.pointerType === 'mouse' || down);
    cursor.classList.toggle('show', show);
    canvas.classList.toggle('digging', over);
  }

  canvas.addEventListener('pointerdown', e => {
    FB.Sound.ensure();
    if (!Game.canDig() || down) return;
    down = true; pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    last = { x: e.clientX, y: e.clientY };
    moveCursor(last.x, last.y);
    updateCursorVisibility(e);
    cursor.classList.add('brushing');
    const removed = site.tap(last.x, last.y, Game.params());
    if (removed > 0) { site.spawnDust(last.x, last.y, 0, -1, 4); Game.lastBrushAt = performance.now(); hideHand(); Game.afterBrush(); }
  });

  canvas.addEventListener('pointermove', e => {
    moveCursor(e.clientX, e.clientY);
    updateCursorVisibility(e);
    if (!down || e.pointerId !== pointerId || !Game.canDig()) return;
    const x = e.clientX, y = e.clientY;
    const dx = x - last.x, dy = y - last.y;
    const removed = site.brushStroke(last.x, last.y, x, y, Game.params());
    if (removed > 0.02) {
      site.spawnDust(x, y, dx, dy, Math.min(6, 1 + Math.round(removed * 0.4)));
      FB.Sound.brush(Math.min(0.3, Math.hypot(dx, dy) / 90));
      Game.lastBrushAt = performance.now();
      hideHand();
      Game.afterBrush();
    }
    last = { x, y };
  });

  function endStroke(e) {
    if (e.pointerId !== pointerId) return;
    down = false; pointerId = null;
    cursor.classList.remove('brushing');
    if (e.pointerType !== 'mouse') cursor.classList.remove('show');
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) cursor.classList.remove('show'); });

  /* ---------------- hand hint ---------------- */
  function showHand() {
    if (hand.classList.contains('show')) return;
    const L = site.layout;
    hand.style.left = L.cx + 'px';
    hand.style.top = L.cy + 'px';
    hand.classList.add('show');
  }
  function hideHand() { hand.classList.remove('show'); }

  /* ---------------- main loop ---------------- */
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    Game.shown += (Game.target - Game.shown) * Math.min(1, dt * 6);
    FB.Meter.set(Game.shown);
    site.update(dt);
    site.draw();

    if (Game.state === 'digging' && !FB.UI.blocking()) {
      if (!Game.lastBrushAt && t - Game.startAt > 4500) showHand();
      if (Game.lastBrushAt && t - Game.lastBrushAt > 9000 && !Game.said.idle) {
        Game.said.idle = true;
        FB.Buddy.say(pick(FB.LINES.idle));
      }
    } else if (FB.UI.blocking()) {
      hideHand();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */
  FB.UI.init();
  layout();
  Game.setLevel(FB.Store.data.level);
  requestAnimationFrame(frame);
  if (!FB.Store.data.tutorialDone) setTimeout(() => FB.Tutorial.open(), 700);
})();
