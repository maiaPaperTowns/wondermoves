/* ==========================================================================
   Main game controller: input, game loop, dig → reveal → collect flow.
   Two modes:
     'trace' — Copy Pip: Pip draws shapes, the child traces them to dig.
     'free'  — Free Play: brush the sand freely.
   ========================================================================== */
(function () {
  const FB = window.FB;
  const $ = s => document.querySelector(s);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  FB.Store.load();
  FB.Sound.setMuted(!!FB.Store.data.muted);

  const canvas = $('#game');
  const site = FB.site = new FB.DigSite(canvas);  // FB.site: used by js/camera.js (fingertip mapping)
  const cursor = $('#brushCursor');
  const hand = $('#handHint');
  const digArea = $('#digArea');

  /* ---------------- choosing a treasure ---------------- */
  function pickItemOfRarity(level, ri) {
    let pool = [];
    // if a level has no item of this rarity, step down until one exists
    for (let k = ri; k >= 0 && !pool.length; k--) {
      pool = level.items.filter(i => i.rarity === FB.RARITIES[k].id);
    }
    if (!pool.length) pool = level.items;
    // gently favour treasures the player hasn't found yet
    const fresh = pool.filter(i => !FB.Store.isFound(i.id));
    if (fresh.length && Math.random() < 0.7) pool = fresh;
    return pick(pool);
  }

  function pickItem(level) {
    const w = level.weights;
    const total = w.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total, ri = 0;
    for (; ri < w.length - 1; ri++) { roll -= w[ri]; if (roll < 0) break; }
    return pickItemOfRarity(level, ri);
  }

  function depthFor(item) {
    const r = FB.rarityById(item.rarity);
    return r.min + 4 + Math.random() * (r.max - r.min - 8);
  }

  /* ---------------- game state ---------------- */
  const Game = FB.Game = {
    state: 'idle', // idle | choosing | digging | revealing | found
    mode: FB.Store.data.mode === 'free' ? 'free' : 'trace',
    level: null, item: null, depth: 0, tier: 0,
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

    setMode(mode) {
      this.mode = mode === 'free' ? 'free' : 'trace';
      FB.Store.data.mode = this.mode; FB.Store.save();
      document.body.dataset.mode = this.mode;
      layout();
      FB.UI.updateLevelPill(this.level);
      this.newDig();
    },

    resetDig() {
      FB.Trace.stop();
      hideHand();
      this.target = 0; this.shown = 0; this.zone = 0;
      this.said = {};
      this.startAt = performance.now();
      this.lastBrushAt = 0;
      FB.Meter.reset();
    },

    newDig() {
      this.resetDig();
      // rarity is rolled from the dig site's odds; in Copy Pip the rarity sets
      // how many / how tricky the shapes are (rarer = longer sequence)
      this.item = pickItem(this.level);
      this.depth = depthFor(this.item);
      this.state = 'digging';
      site.setup(this.level, this.item, this.depth, (Math.random() * 1e9) | 0);
      if (this.mode === 'trace') {
        this.tier = FB.rarityIndex(this.item.rarity);
        FB.Trace.start(this.tier);
        return;
      }
      if (!FB.UI.blocking()) FB.Buddy.say(pick(FB.LINES.start));
    },

    /** Camera setup finished (or switched back to touch). */
    cameraDone() {
      if (!FB.Store.data.tutorialDone) { setTimeout(() => FB.Tutorial.open(), 400); return; }
      if (this.mode === 'trace' && this.state === 'digging') FB.Trace.replay();
    },

    updateDepth() {
      const st = site.stats();
      this.target = Math.max(this.target, st.removed * this.depth);
      const z = Math.min(4, Math.floor(this.target / 20));
      if (z > this.zone) {
        this.zone = z;
        const r = FB.RARITIES[z];
        FB.Meter.flashZone(z);
        FB.Sound.chime();
        FB.Buddy.say(`We reached the ${r.name} zone! ${r.icon} Keep going!`);
      }
      return st;
    },

    afterBrush() {
      const zoneBefore = this.zone;
      const st = this.updateDepth();
      if (this.zone === zoneBefore && !this.said.peek && st.uncovered > 0.3) {
        this.said.peek = true;
        FB.Buddy.say(pick(FB.LINES.peek));
      }
      if (st.uncovered >= 0.8) this.reveal();
    },

    finishTrace() {
      if (this.state === 'digging') this.reveal();
    },

    reveal() {
      this.state = 'revealing';
      const item = this.item, r = FB.rarityById(item.rarity), rank = FB.rarityIndex(item.rarity);
      let extra = null;
      if (this.mode === 'trace') {
        extra = FB.Trace.summary();
        FB.Trace.stop();
      }
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
        FB.Found.show(item, this.depth, isNew, extra);
      }, 2100);
    },
  };
  document.body.dataset.mode = Game.mode;

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
    const bottom = Game.mode === 'trace' ? (narrow ? 92 : 104) : (narrow ? 24 : 28);
    const availW = w - meterW - 16;
    const availH = h - top - bottom;
    const S = Math.max(220, Math.min(availW * 0.94, availH * 0.98, 780));
    const L = { cx: availW / 2 + 8, cy: top + availH / 2, S };
    site.resize(w, h, L);
    Object.assign(digArea.style, {
      left: L.cx - S / 2 + 'px', top: L.cy - S / 2 + 'px', width: S + 'px', height: S + 'px',
    });
    FB.Trace.relayout();
    FB.Tutorial.reposition();
  }
  window.addEventListener('resize', layout);

  /* ---------------- input (touch / mouse / camera finger all go through these) ---------------- */
  let down = false, last = null, pointerId = null, camDown = false;

  function inputDown(x, y) {
    FB.Sound.ensure();
    if (!Game.canDig() || down) return false;
    down = true;
    last = { x, y };
    moveCursor(x, y);
    cursor.classList.add('brushing');
    if (Game.mode === 'trace') { FB.Trace.onDown(x, y); return true; }
    const removed = site.tap(x, y, Game.params());
    if (removed > 0) { site.spawnDust(x, y, 0, -1, 4); Game.lastBrushAt = performance.now(); hideHand(); Game.afterBrush(); }
    return true;
  }

  function inputMove(x, y) {
    moveCursor(x, y);
    if (!down || !Game.canDig()) return;
    if (Game.mode === 'trace') { FB.Trace.onMove(x, y); last = { x, y }; return; }
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
  }

  function inputUp() {
    if (!down) return;
    down = false;
    FB.Trace.onUp();
    cursor.classList.remove('brushing');
  }

  /** Camera play: the fingertip drives the brush; pointing = brush on the sand. */
  function cameraInput() {
    const f = FB.Cam.finger();
    cursor.classList.toggle('finger', !!f);
    if (!f) {
      if (camDown) { inputUp(); camDown = false; }
      if (pointerId == null) cursor.classList.remove('show');
      return;
    }
    cursor.classList.add('show');
    cursor.classList.toggle('lifted', !f.pen);
    if (f.pen && !camDown && pointerId == null) camDown = inputDown(f.x, f.y);
    else if (f.pen && camDown) inputMove(f.x, f.y);
    else if (!f.pen && camDown) { inputUp(); camDown = false; }
    else moveCursor(f.x, f.y);
  }

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
    if (camDown || !inputDown(e.clientX, e.clientY)) return;
    pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    updateCursorVisibility(e);
  });

  canvas.addEventListener('pointermove', e => {
    if (camDown) return;
    if (pointerId == null || e.pointerId === pointerId) { moveCursor(e.clientX, e.clientY); updateCursorVisibility(e); }
    if (e.pointerId === pointerId) inputMove(e.clientX, e.clientY);
  });

  function endStroke(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    inputUp();
    if (e.pointerType !== 'mouse') cursor.classList.remove('show');
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) cursor.classList.remove('show'); });

  /* ---------------- hand hint (Free Play) ---------------- */
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
    const blocking = FB.UI.blocking();

    if (FB.Cam.active) FB.Cam.update(dt);
    if (FB.Cam.playing() && !blocking) cameraInput();
    else if (camDown) { inputUp(); camDown = false; }

    if (Game.mode === 'trace') {
      if (!blocking) FB.Trace.update(dt);
      if (Game.state === 'digging') Game.updateDepth();
    }

    Game.shown += (Game.target - Game.shown) * Math.min(1, dt * 6);
    FB.Meter.set(Game.shown);
    site.update(dt);
    site.draw();
    FB.Trace.draw(site.ctx);
    if (WM.CamPanel.el) WM.CamPanel.draw((c, w, h) => FB.Cam.drawExtra(c, w, h));

    if (Game.mode === 'free' && Game.state === 'digging' && !blocking) {
      if (!Game.lastBrushAt && t - Game.startAt > 4500) showHand();
      if (Game.lastBrushAt && t - Game.lastBrushAt > 9000 && !Game.said.idle) {
        Game.said.idle = true;
        FB.Buddy.say(pick(FB.LINES.idle));
      }
    } else if (blocking) {
      hideHand();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- embedded in the WonderMoves shell ---------------- */
  // The shell posts {source:'wondermoves', type:'visibility'} when tabs switch.
  // Go quiet while hidden; restore the player's own sound setting when shown.
  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.source !== 'wondermoves' || m.type !== 'visibility') return;
    FB.Sound.setMuted(m.visible ? !!FB.Store.data.muted : true);
    if (!m.visible) FB.Sound.brush(0);
    WM.Hands.pause(!m.visible);
  });

  /* ---------------- boot ---------------- */
  FB.UI.init();
  layout();
  Game.setLevel(FB.Store.data.level);
  requestAnimationFrame(frame);
  // Every launch starts in Camera mode (Mouse lasts until the page is reloaded).
  // Fossil Brush doesn't use board sensors: camera, touch and mouse only.
  FB.Cam.open();
})();
