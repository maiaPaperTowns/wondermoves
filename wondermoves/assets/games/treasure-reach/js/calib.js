/* ==========================================================================
   Treasure Reach: camera setup + reach calibration.

   Setup (laptop front camera tilted down at the hands on the table):
     1. max   — press both hands against the laptop and tilt the screen down until the
                tops of the hands (the wrists) touch the line near the bottom of the
                picture. The line turns green (with a chime) when both are on it.
                Records each wrist's height = "max forward", and the Distance sensor's
                reading there (when the board is connected).
     2. space — push the laptop forward until there is room to stretch comfortably.
                The camera moves with the laptop, so "max forward" stays valid.
     3. home  — pull both hands back behind the start line and keep still. The line
                turns green (with a chime) when both are behind it.
                Records each wrist's height = "start".

   During play a hand's camera progress = how far its wrist has moved from start (0)
   to max forward (1). See TR.camProgress / TR.sensorMm below and game.js.
   ========================================================================== */
window.TR = window.TR || {};

(function () {
  const $ = s => document.querySelector(s);
  const median = a => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const MAX_S = 1.5, HOME_S = 2;
  /** The max-forward line: where the tops of the hands (wrists) should touch, as a fraction
      of the picture height, and how close counts as "touching". */
  // y: high enough that the whole hand (fingers too) stays in the picture, so the tracker can still recognise it
  const MAX_LINE = { y: 0.72, touch: 0.09, keep: 0.14 };   // turns green within `touch`, stays green until past `keep`
  /** The start line sits this far above the max-forward position (fraction of the picture). */
  const START_GAP = 0.14;
  const START_KEEP = 0.05; // once behind the start line, stays green until this far in front of it
  const LINE_GRACE_S = 0.5; // a green line only turns red after the hands are off it this long
  const STEADY = 0.05;     // wrist moving less than this (picture height) over ~1 s = still
  const GREEN = '#3DDC84', RED = '#FF5A3D';

  const other = s => (s === 'left' ? 'right' : 'left');
  const wrist = h => (h ? h.wrist || { x: h.x, y: h.y } : null);

  /** Is a Distance sensor available (UNO Q board answering, sensor plugged in)? */
  TR.hasSensor = () => !!(window.WM && WM.Board && WM.Board.available && !(WM.Board.sensors && WM.Board.sensors.distance === false));

  /** Latest trusted Distance-sensor reading in mm, or null (no board / nothing close enough). */
  TR.sensorMm = function () {
    const B = window.WM && WM.Board;
    if (!B || !B.available || B.distMm == null || performance.now() - B.distAt > TR.SENSE.freshMs) return null;
    return B.distMm > 0 && B.distMm <= TR.SENSE.trustMm ? B.distMm : null;
  };

  /** Sensor distance that opens the chest (camera + sensor 'board' mode). */
  TR.sensorGoalMm = () => TR.SENSE.openMm;

  /** Sensor mode: how far (mm) the hand must move toward the sensor to open the chest.
      The child's own limit from the board (Settings): the caregiver's approved maximum and the
      calibrated comfortable reach, whichever is smaller. Never more than the sensor can measure. */
  TR.sensorTargetMm = function () {
    const p = (window.WM && WM.Board && WM.Board.profile) || {};
    const caps = [p.approved_max_mm, p.comfortable_mm].filter(v => typeof v === 'number' && v > 0);
    const t = caps.length ? Math.min(...caps) : TR.SENSE.openMm;
    return Math.max(15, Math.min(t, TR.SENSE.trustMm - 30));
  };

  /** A hand's progress from start (0) to max forward (1) on camera, or null. */
  TR.camProgress = function (side, hand) {
    const c = TR.Store.data.calib, w = wrist(hand);
    if (!c || c.v !== 2 || !w) return null;
    const home = c.homeY[side] != null ? c.homeY[side] : c.homeY[other(side)];
    const max = c.maxY[side] != null ? c.maxY[side] : c.maxY[other(side)];
    if (home == null || max == null || max - home < 0.04) return null;
    return (w.y - home) / (max - home);
  };

  const Calib = TR.Calib = {
    active: false, step: 'start', t: 0, stepStart: 0,
    samples: { left: [], right: [] }, sensor: [], recent: { left: [], right: [] },
    lineOk: false,           // the guide line is green (both hands on / behind it)
    offFor: 0,               // how long the hands have been off a green line

    open() {
      this.active = true;
      WM.CamPanel.calibrating();
      this.go(WM.Hands.running ? 'max' : 'start');
    },

    go(step) {
      this.step = step;
      this.t = 0;
      this.stepStart = performance.now();
      this.samples = { left: [], right: [] };
      this.sensor = [];
      this.lineOk = false;
      this.offFor = 0;
      this.render();
      const say = {
        start: `Hi, I'm ${WM.PIP.name}! I need to see your hands to play. Ask a grown-up to turn on the camera! 📷`,
        max: 'Press both hands against the laptop. Tilt the screen down until the tops of your hands touch the red line! 🖐️🖐️',
        space: 'Now push the laptop forward so you have room to stretch comfortably. Then tap Next! 💻',
        home: 'Pull both hands back behind the start line and keep them still. 😌',
        done: 'All set! Push both hands toward the laptop to open the chest! 🎯',
      }[step];
      if (say) WM.Buddy.say(say, 0);
    },

    async startCamera() {
      const status = $('#calStatus');
      const btn = $('#calStart');
      if (btn) btn.disabled = true;
      WM.Sound.ensure();
      try {
        await WM.Hands.start(WM.CamPanel.video, { onStatus: m => { if (status) status.textContent = m; } });
        WM.CamPanel.cameraOn(true);
        this.go('max');
      } catch (e) {
        if (btn) btn.disabled = false;
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        const none = e && (e.name === 'NotFoundError' || e.code === 'no-api');
        const fileFrame = location.protocol === 'file:' && window.parent !== window;
        if (status) {
          status.textContent = denied && fileFrame
            ? 'The camera only works when WonderMoves runs from a local server (see web/README.md), or open this game on its own.'
            : denied ? 'The camera was blocked. Allow camera access in the browser, or play with a mouse.'
            : none ? 'No camera found. You can play with a mouse instead.'
            : 'The hand tracker could not load (are you offline?). You can play with a mouse instead.';
          status.classList.add('error');
        }
        WM.Buddy.say('Uh oh, I can\'t see the camera. We can play with a mouse instead! 🖱️', 0);
        console.warn('[Treasure Reach] camera start failed:', e);
      }
    },

    finish() {
      this.go('done');
      WM.Sound.fanfare(1);
      setTimeout(() => { this.active = false; TR.Game.afterCalibration(); }, 1700);
    },

    /** The guide line turns green (with one chime) when both hands are on / behind it.
        It only turns red again after the hands have been off it for LINE_GRACE_S, so
        tracking jitter at the edge doesn't make it flicker. */
    setLine(ok, dt) {
      if (ok) {
        this.offFor = 0;
        if (!this.lineOk) { this.lineOk = true; WM.Sound.chime(); }
      } else if (this.lineOk) {
        this.offFor += dt;
        if (this.offFor >= LINE_GRACE_S) this.lineOk = false;
      }
      return this.lineOk;
    },

    /** Start line height (fraction of the picture), from the max-forward line just recorded. */
    startLineY() {
      const c = this.pending;
      return Math.max(0.1, Math.min(c.maxY.left, c.maxY.right) - START_GAP);
    },

    /** Both wrists seen and still for about a second? */
    steady(L) {
      let ok = true;
      ['left', 'right'].forEach(s => {
        const r = this.recent[s];
        const w = wrist(L[s]);
        if (w) { r.push(w.y); if (r.length > 30) r.shift(); } else r.length = 0;
        if (r.length < 15 || Math.max(...r) - Math.min(...r) > STEADY) ok = false;
      });
      return ok;
    },

    update(dt) {
      if (!this.active) return;
      const L = WM.Hands.latest;
      const both = !!(L.left && L.right);
      const still = this.steady(L);
      const d = TR.sensorMm();

      if (this.step === 'max') {
        const ys = both ? [wrist(L.left).y, wrist(L.right).y] : [];
        const band = this.lineOk ? MAX_LINE.keep : MAX_LINE.touch;   // easier to stay on than to get on
        const tooHigh = ys.some(y => y < MAX_LINE.y - band);
        const tooLow = ys.some(y => y > MAX_LINE.y + band);
        const onLine = this.setLine(both && !tooHigh && !tooLow, dt);
        const ok = onLine && still;
        if (ok) {
          this.t += dt;
          ['left', 'right'].forEach(s => this.samples[s].push(wrist(L[s]).y));
          if (d != null) this.sensor.push(d);
        } else if (!onLine) this.t = Math.max(0, this.t - dt);   // a little wobble on the line only pauses the bar
        this.setBar(this.t / MAX_S);
        this.setLive(!both ? (L.left || L.right ? 'I see one hand… press the other one against the laptop too!' : 'Press both hands against the laptop 🖐️🖐️')
          : tooHigh ? 'Tilt the screen down until the tops of your hands touch the line ⬇️'
          : tooLow ? 'Tilt the screen up a little, so the tops of your hands are on the line ⬆️'
          : !still ? 'Both hands on the line! Now hold still… 😌'
          : `Perfect! Hold it there…${d != null ? ` (sensor: ${Math.round(d)} mm)` : ''}`);
        if (this.t >= MAX_S) {
          const c = { v: 2, maxY: {}, homeY: {}, touchMm: null, at: Date.now() };
          ['left', 'right'].forEach(s => { c.maxY[s] = median(this.samples[s]); });
          if (this.sensor.length >= 5) c.touchMm = median(this.sensor);
          this.pending = c;
          this.go('space');
        }
      }

      else if (this.step === 'home') {
        const c = this.pending;
        const line = this.startLineY();
        const limit = this.lineOk ? line + START_KEEP : line;   // easier to stay behind than to get behind
        const behind = this.setLine(both && ['left', 'right'].every(s => wrist(L[s]).y <= limit), dt);
        const ok = behind && still;
        if (ok) {
          this.t += dt;
          ['left', 'right'].forEach(s => this.samples[s].push(wrist(L[s]).y));
        } else if (!behind) this.t = Math.max(0, this.t - dt);   // a little wobble behind the line only pauses the bar
        this.setBar(this.t / HOME_S);
        this.setLive(!both ? 'Keep both hands where I can see them 👀'
          : !behind ? 'Pull both hands back behind the start line, toward you 🙌'
          : !still ? 'Both hands behind the line! Now hold still… 😌'
          : `Stay comfy… ${Math.max(1, Math.ceil(HOME_S - this.t))}`);
        if (this.t >= HOME_S) {
          ['left', 'right'].forEach(s => { c.homeY[s] = median(this.samples[s]); });
          TR.Store.data.calib = c;
          TR.Store.save();
          this.finish();
        }
      }
    },

    /** Guide lines on the camera view while setting up. */
    drawExtra(ctx, w, h) {
      if (!this.active || (this.step !== 'max' && this.step !== 'home')) return;
      const L = WM.Hands.latest;
      const font = `700 ${Math.max(12, w / 40)}px Fredoka, sans-serif`;
      const line = (y, color, label, width) => {
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(w * 0.06, y); ctx.lineTo(w * 0.94, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(label, w * 0.07, y - 6);
      };
      ctx.save();
      if (this.step === 'max') {
        line(MAX_LINE.y * h, this.lineOk ? GREEN : RED, this.lineOk ? 'both hands on the line ✔' : 'tops of your hands on this line', this.lineOk ? 6 : 4);
      } else {
        line(this.startLineY() * h, this.lineOk ? GREEN : RED, this.lineOk ? 'both hands behind the start line ✔' : 'start line: pull back behind it', this.lineOk ? 6 : 4);
      }
      ['left', 'right'].forEach(s => {
        const p = wrist(L[s]);
        if (!p) return;
        ctx.fillStyle = WM.Hands.COLORS[s];
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x * w, p.y * h, Math.max(7, w / 60), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      ctx.restore();
    },

    setBar(f) { const b = $('#calBar'); if (b) b.style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; },
    setLive(text) { const l = $('#calLive'); if (l && l.textContent !== text) l.textContent = text; },

    render() {
      const el = WM.CamPanel.body;
      const steps = ['max', 'space', 'home'];
      const idx = steps.indexOf(this.step);
      const stepper = `<ol class="wm-stepper">${['Tilt down', 'Make space', 'Start spot'].map((n, i) => `<li class="${i < idx || this.step === 'done' ? 'done' : i === idx ? 'on' : ''}"><b>${i + 1}</b>${n}</li>`).join('')}</ol>`;
      const mouseLink = '<button class="wm-link" data-cal="mouse">🖱️ Play with a mouse instead</button>';
      const saved = TR.Store.data.calib && TR.Store.data.calib.v === 2;

      if (this.step === 'start') {
        el.innerHTML = `
          <h2>Let's set up the camera!</h2>
          <p>Sit at the table with the laptop in front of you. Pip will help you point the camera at your hands.</p>
          <div class="wm-calib-actions">
            <button class="wm-btn primary" id="calStart" data-cal="start">📷 Turn on camera</button>
            ${mouseLink}
          </div>
          <p class="wm-calib-status" id="calStatus"></p>
          <p class="wm-calib-privacy">🔒 The video stays on this device. It is never saved or sent anywhere.</p>`;
      } else if (this.step === 'done') {
        el.innerHTML = `${stepper}<h2>🎯 All set!</h2><p>Push both hands toward the laptop to open the chest!</p>`;
      } else if (this.step === 'space') {
        el.innerHTML = `
          ${stepper}
          <h2>Push the device forward 💻</h2>
          <p>Push until there's enough space to stretch your arms comfortably.</p>
          <div class="wm-calib-actions">
            <button class="wm-btn primary" data-cal="next">Next ➜</button>
            ${mouseLink}
          </div>`;
      } else {
        const title = { max: 'Tilt the camera down till the line hits your hand', home: 'Move your hands back to the start 😌' }[this.step];
        el.innerHTML = `
          ${stepper}
          <h2>${title}</h2>
          <div class="wm-calib-meter"><i id="calBar"></i></div>
          <p class="wm-calib-live" id="calLive"></p>
          <div class="wm-calib-actions">
            ${this.step === 'max' && saved ? '<button class="wm-btn small" data-cal="saved">↩ Use my last setup</button>' : ''}
            ${mouseLink}
          </div>`;
      }
    },
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cal]');
    if (!b) return;
    WM.Sound.click();
    const act = b.dataset.cal;
    if (act === 'start') Calib.startCamera();
    else if (act === 'mouse') { Calib.active = false; TR.Game.useMouse(); }
    else if (act === 'next') Calib.go('home');
    else if (act === 'saved') Calib.finish();
  });
})();
