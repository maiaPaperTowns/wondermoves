/* ==========================================================================
   Treasure Reach: camera setup + reach calibration.
   Uses the computer's front camera: the hands rest on the table in front of
   the screen, so in the picture they're near the bottom, fingers pointing
   down toward the camera.
     1. hands — both hands flat on the table, inside the (upside-down) outlines
     2. rest  — stay still → resting position of each hand
     3. reach — 3 comfortable reaches toward the screen → goal

   How reach is measured: each hand is described by (x, y, log palm size).
   From above, a reach moves the hand across the picture; from the front, it
   makes the hand look bigger. Calibration learns the child's own reach
   direction from their 3 reaches, and progress = how far the hand has moved
   along that direction (goal = the median comfortable reach), so it works
   for either camera position.
   ========================================================================== */
window.TR = window.TR || {};

(function () {
  const $ = s => document.querySelector(s);
  const median = a => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const REPS = 3;
  const HANDS_S = 1.2, REST_S = 3;
  const OUT_AT = 0.06, BACK_AT = 0.03, MIN_PEAK = 0.08;
  const K_SIZE = 0.6; // weight of palm-size change vs. position change
  /** Where the hand outlines sit in the camera picture (fractions). Tweak for your camera mount. */
  const GUIDE = { y: 0.7, dx: 0.17, size: 0.17, upsideDown: true };

  TR.rest = { left: null, right: null };

  const feature = h => [h.x, h.y, Math.log(h.size) * K_SIZE];

  /** Movement of a hand away from its resting spot: { vec, mag } or null. */
  TR.offset = function (side, hand) {
    const r = TR.rest[side];
    if (!hand || !r) return null;
    const f = feature(hand);
    const vec = [f[0] - r[0], f[1] - r[1], f[2] - r[2]];
    return { vec, mag: Math.hypot(...vec) };
  };

  /** How far along the child's own reach direction a hand is (1 = calibrated comfy reach). */
  TR.reachAmount = function (side, hand) {
    const c = TR.Store.data.calib, o = TR.offset(side, hand);
    if (!o || !c || !c.dir) return null;
    return (o.vec[0] * c.dir[0] + o.vec[1] * c.dir[1] + o.vec[2] * c.dir[2]) / c.goal;
  };

  /** Is this side's hand roughly inside its outline? */
  function inGuide(side, h) {
    if (!h) return false;
    const gx = 0.5 + (side === 'left' ? -1 : 1) * GUIDE.dx;
    return Math.hypot(h.x - gx, h.y - GUIDE.y) < GUIDE.size * 0.9;
  }

  const Calib = TR.Calib = {
    active: false, step: 'start', full: true,
    t: 0, samples: { left: [], right: [] }, reps: [], out: false, peak: null, best: 0.3,
    stepStart: 0, saidSlow: false,

    /** full = redo the reach part even if a goal is saved. */
    open(full) {
      this.active = true;
      const c = TR.Store.data.calib;
      this.full = !!full || !(c && c.dir);
      WM.CamPanel.calibrating();
      if (WM.Hands.running) this.go('hands');
      else this.go('start');
    },

    go(step) {
      this.step = step;
      this.t = 0;
      this.stepStart = performance.now();
      this.saidSlow = false;
      if (step === 'rest') this.samples = { left: [], right: [] };
      if (step === 'reach') { this.reps = []; this.out = false; this.peak = null; this.best = 0.3; }
      this.render();
      const say = {
        start: `Hi, I'm ${WM.PIP.name}! I need to see your hands to play. Ask a grown-up to turn on the camera! 📷`,
        hands: 'Put your hands flat on the table, fingers pointing at the screen, inside the outlines! 🖐️🖐️',
        rest: 'Now keep your hands still and comfy… 😌',
        reach: `Slide your hands toward the camera as far as feels comfy, then come back. Let's do it ${REPS} times! 🙌`,
        done: 'All set! Your reach goal is ready! 🎯',
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
        TR.Store.data.inputMode = 'camera'; TR.Store.save();
        WM.CamPanel.cameraOn(true);
        this.go('hands');
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
      if (this.reps.length) {
        // reach direction = average of the child's reaches; goal = median distance along it
        const sum = [0, 0, 0];
        this.reps.forEach(v => { const m = Math.hypot(...v) || 1; sum[0] += v[0] / m; sum[1] += v[1] / m; sum[2] += v[2] / m; });
        const n = Math.hypot(...sum) || 1;
        const dir = sum.map(c => c / n);
        const proj = this.reps.map(v => v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]);
        TR.Store.data.calib = { dir, goal: Math.max(MIN_PEAK, median(proj)), reps: proj.map(p => +p.toFixed(3)), at: Date.now() };
        TR.Store.save();
      }
      this.go('done');
      WM.Sound.fanfare(1);
      setTimeout(() => { this.active = false; TR.Game.afterCalibration(); }, 1700);
    },

    update(dt) {
      if (!this.active) return;
      const L = WM.Hands.latest;
      const present = ['left', 'right'].filter(s => L[s]);
      const now = performance.now();

      if (this.step === 'hands') {
        const inside = present.filter(s => inGuide(s, L[s]));
        this.t = present.length ? this.t + dt : Math.max(0, this.t - dt * 0.5);
        this.setBar(this.t / HANDS_S);
        this.setLive(inside.length === 2 ? 'Both hands in place! 🙌'
          : present.length === 2 ? 'I see both hands! Slide them into the outlines if you can.'
          : present.length ? 'I see one hand… show me the other one too!' : 'Looking for hands… 👀');
        if (this.t >= HANDS_S) this.go('rest');
      }

      else if (this.step === 'rest') {
        if (present.length) {
          this.t += dt;
          present.forEach(s => this.samples[s].push(feature(L[s])));
        }
        this.setBar(this.t / REST_S);
        this.setLive(present.length ? `Stay still… ${Math.max(1, Math.ceil(REST_S - this.t))}` : 'Where did your hands go? 👀');
        if (this.t >= REST_S) {
          ['left', 'right'].forEach(s => {
            const S = this.samples[s];
            TR.rest[s] = S.length >= 8 ? [0, 1, 2].map(k => median(S.map(f => f[k]))) : null;
          });
          WM.Sound.chime();
          if (!this.full) this.finish();
          else this.go('reach');
        }
      }

      else if (this.step === 'reach') {
        let best = null;
        present.forEach(s => { const o = TR.offset(s, L[s]); if (o && (!best || o.mag > best.mag)) best = o; });
        const g = best ? best.mag : 0;
        if (!this.out && g > OUT_AT) { this.out = true; this.peak = best; }
        if (this.out) {
          if (best && best.mag > this.peak.mag) this.peak = best;
          this.best = Math.max(this.best, this.peak.mag * 1.15);
          if (g < BACK_AT) {
            this.out = false;
            if (this.peak.mag >= MIN_PEAK) {
              this.reps.push(this.peak.vec);
              WM.Sound.tick(this.reps.length + 1);
              if (this.reps.length >= REPS) { this.finish(); return; }
              WM.Buddy.say(`Great reach! ${REPS - this.reps.length} more! 🙌`, 0);
              this.renderReps();
            }
          }
        }
        this.setBar(g / this.best);
        this.setLive(this.out ? 'Reaching… now come back! 🔁' : 'Reach toward the camera! 🙌');
        if (!this.saidSlow && now - this.stepStart > 25000 && this.reps.length < REPS) {
          this.saidSlow = true;
          WM.Buddy.say('Any comfy reach is great, even a small one! Reach toward me, then come back. 💛', 0);
        }
      }
    },

    /** Hand outlines on the camera view while setting up. */
    drawExtra(ctx, w, h) {
      if (!this.active || !['hands', 'rest'].includes(this.step)) return;
      const L = WM.Hands.latest;
      ['left', 'right'].forEach(side => {
        const gx = (0.5 + (side === 'left' ? -1 : 1) * GUIDE.dx) * w;
        WM.CamPanel.drawHandGuide(ctx, gx, GUIDE.y * h, GUIDE.size * w, { side, ok: inGuide(side, L[side]), color: WM.Hands.COLORS[side], upsideDown: GUIDE.upsideDown });
      });
    },

    setBar(f) { const b = $('#calBar'); if (b) b.style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; },
    setLive(text) { const l = $('#calLive'); if (l && l.textContent !== text) l.textContent = text; },
    renderReps() {
      const r = $('#calReps');
      if (r) r.innerHTML = Array.from({ length: REPS }, (_, i) => `<i class="${i < this.reps.length ? 'on' : ''}"></i>`).join('');
      const d = $('#calDone');
      if (d) d.hidden = this.reps.length === 0;
    },

    render() {
      const el = WM.CamPanel.body;
      const steps = ['hands', 'rest', 'reach'];
      const idx = steps.indexOf(this.step);
      const stepper = `<ol class="wm-stepper">${['Hands', 'Rest', 'Reach'].map((n, i) => `<li class="${i < idx || this.step === 'done' ? 'done' : i === idx ? 'on' : ''}"><b>${i + 1}</b>${n}</li>`).join('')}</ol>`;
      const mouseLink = '<button class="wm-link" data-cal="mouse">🖱️ Play with a mouse instead</button>';

      if (this.step === 'start') {
        el.innerHTML = `
          <h2>Let's set up the camera!</h2>
          <p>Sit in front of the computer with your hands resting on the table, so the camera can see them.</p>
          <div class="wm-calib-actions">
            <button class="wm-btn primary" id="calStart" data-cal="start">📷 Turn on camera</button>
            ${mouseLink}
          </div>
          <p class="wm-calib-status" id="calStatus"></p>
          <p class="wm-calib-privacy">🔒 The video stays on this device. It is never saved or sent anywhere.</p>`;
      } else if (this.step === 'done') {
        el.innerHTML = `${stepper}<h2>🎯 All set!</h2><p>Your reach goal is ready. Let's find some treasure!</p>`;
      } else {
        const title = { hands: 'Hands flat on the table 🖐️🖐️', rest: 'Keep your hands still 😌', reach: 'Reach toward the camera, then come back 🙌' }[this.step];
        el.innerHTML = `
          ${stepper}
          <h2>${title}</h2>
          <div class="wm-calib-meter"><i id="calBar"></i></div>
          <p class="wm-calib-live" id="calLive"></p>
          ${this.step === 'reach' ? `<div class="rep-dots" id="calReps"></div>` : ''}
          <div class="wm-calib-actions">
            ${this.step === 'reach' ? '<button class="wm-btn small" id="calDone" data-cal="done" hidden>✔ Use these reaches</button>' : ''}
            ${this.step === 'reach' && TR.Store.data.calib && TR.Store.data.calib.dir ? '<button class="wm-btn small" data-cal="saved">↩ Use my last goal</button>' : ''}
            ${mouseLink}
          </div>`;
        if (this.step === 'reach') this.renderReps();
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
    else if (act === 'done') Calib.finish();
    else if (act === 'saved') { Calib.reps = []; Calib.finish(); }
  });
})();
