/* ==========================================================================
   Treasure Reach: camera setup + reach calibration.
   Mirrors the WonderMoves Python protocol:
     1. hands   — make sure both hands can be seen
     2. rest    — hold still in a comfy spot → baseline palm size per hand
     3. reach   — 3 comfortable reaches toward the screen → goal = median peak
   "Reach" = how much bigger the palm looks than at rest (hand moving toward the camera).
   ========================================================================== */
window.TR = window.TR || {};

(function () {
  const $ = s => document.querySelector(s);
  const median = a => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const REPS = 3;
  const HANDS_S = 1.2, REST_S = 3;
  const OUT_AT = 0.06, BACK_AT = 0.03, MIN_PEAK = 0.08;

  TR.base = { left: null, right: null };

  /** Palm growth vs. rest for one hand (0 = at rest, 0.3 = 30% bigger). */
  TR.growth = function (side, hand) {
    const base = TR.base[side] || TR.base[side === 'left' ? 'right' : 'left'];
    if (!hand || !base) return null;
    return hand.size / base - 1;
  };

  const Calib = TR.Calib = {
    active: false, step: 'start', full: true,
    t: 0, samples: { left: [], right: [] }, reps: [], out: false, peak: 0, live: 0, best: 0.3,
    stepStart: 0, saidSlow: false,

    /** full = redo the reach part even if a goal is saved. */
    open(full) {
      this.active = true;
      this.full = !!full || !TR.Store.data.calib;
      TR.Panel.calibrating();
      if (WM.Hands.running) this.go('hands');
      else this.go('start');
    },

    go(step) {
      this.step = step;
      this.t = 0;
      this.stepStart = performance.now();
      this.saidSlow = false;
      if (step === 'rest') this.samples = { left: [], right: [] };
      if (step === 'reach') { this.reps = []; this.out = false; this.peak = 0; this.live = 0; this.best = 0.3; }
      this.render();
      const say = {
        start: `Hi, I'm ${WM.PIP.name}! I need to see your hands to play. Ask a grown-up to turn on the camera! 📷`,
        hands: 'Hold up your hands so I can see them! 👋',
        rest: 'Now rest your hands somewhere comfy and stay still… 😌',
        reach: `Reach toward the screen as far as feels comfy, then come back. Let's do it ${REPS} times! 🙌`,
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
        await WM.Hands.start($('#camVideo'), { onStatus: m => { if (status) status.textContent = m; } });
        TR.Store.data.inputMode = 'camera'; TR.Store.save();
        TR.Panel.cameraOn(true);
        this.go('hands');
      } catch (e) {
        if (btn) btn.disabled = false;
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        const none = e && (e.name === 'NotFoundError' || e.code === 'no-api');
        if (status) {
          const fileFrame = location.protocol === 'file:' && window.parent !== window;
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
        TR.Store.data.calib = { goal: Math.max(MIN_PEAK, median(this.reps)), reps: this.reps.map(r => +r.toFixed(3)), at: Date.now() };
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
        this.t = present.length ? this.t + dt : Math.max(0, this.t - dt * 0.5);
        this.setBar(this.t / HANDS_S);
        this.setLive(present.length === 2 ? 'I see both hands! 🙌' : present.length ? 'I see one hand… show me the other one too!' : 'Looking for hands… 👀');
        if (this.t >= HANDS_S) this.go('rest');
      }

      else if (this.step === 'rest') {
        if (present.length) {
          this.t += dt;
          present.forEach(s => this.samples[s].push(L[s].size));
        }
        this.setBar(this.t / REST_S);
        this.setLive(present.length ? `Stay still… ${Math.max(1, Math.ceil(REST_S - this.t))}` : 'Where did your hands go? 👀');
        if (this.t >= REST_S) {
          ['left', 'right'].forEach(s => { TR.base[s] = this.samples[s].length >= 8 ? median(this.samples[s]) : null; });
          WM.Sound.chime();
          if (!this.full && TR.Store.data.calib) this.finish();
          else this.go('reach');
        }
      }

      else if (this.step === 'reach') {
        const gs = present.map(s => TR.growth(s, L[s])).filter(g => g != null);
        const g = gs.length ? Math.max(...gs) : 0;
        this.live = g;
        if (!this.out && g > OUT_AT) { this.out = true; this.peak = g; }
        if (this.out) {
          this.peak = Math.max(this.peak, g);
          this.best = Math.max(this.best, this.peak * 1.15);
          if (g < BACK_AT) {
            this.out = false;
            if (this.peak >= MIN_PEAK) {
              this.reps.push(this.peak);
              WM.Sound.tick(this.reps.length + 1);
              if (this.reps.length >= REPS) { this.finish(); return; }
              WM.Buddy.say(`Great reach! ${REPS - this.reps.length} more! 🙌`, 0);
              this.renderReps();
            }
          }
        }
        this.setBar(g / this.best);
        this.setLive(this.out ? 'Reaching… now come back! 🔁' : 'Reach toward the screen! 🙌');
        if (!this.saidSlow && now - this.stepStart > 25000 && this.reps.length < REPS) {
          this.saidSlow = true;
          WM.Buddy.say('Any comfy reach is great, even a small one! Reach toward me, then come back. 💛', 0);
        }
      }
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
      const el = $('#camCalib');
      const steps = ['hands', 'rest', 'reach'];
      const idx = steps.indexOf(this.step);
      const stepper = `<ol class="stepper">${['Hands', 'Rest', 'Reach'].map((n, i) => `<li class="${i < idx || this.step === 'done' ? 'done' : i === idx ? 'on' : ''}"><b>${i + 1}</b>${n}</li>`).join('')}</ol>`;
      const mouseLink = '<button class="wm-link" data-cal="mouse">🖱️ Play with a mouse instead</button>';

      if (this.step === 'start') {
        el.innerHTML = `
          <h2>Let's set up the camera!</h2>
          <p>Pip uses the camera to see your hands. Sit so your hands and arms can be seen.</p>
          <div class="calib-actions">
            <button class="wm-btn primary" id="calStart" data-cal="start">📷 Turn on camera</button>
            ${mouseLink}
          </div>
          <p class="calib-status" id="calStatus"></p>
          <p class="calib-privacy">🔒 The video stays on this device. It is never saved or sent anywhere.</p>`;
      } else if (this.step === 'done') {
        el.innerHTML = `${stepper}<h2>🎯 All set!</h2><p>Your reach goal is ready. Let's find some treasure!</p>`;
      } else {
        const title = { hands: 'Show me your hands! 👋', rest: 'Rest your hands and stay still 😌', reach: 'Reach toward the screen, then come back 🙌' }[this.step];
        el.innerHTML = `
          ${stepper}
          <h2>${title}</h2>
          <div class="calib-meter ${this.step}"><i id="calBar"></i></div>
          <p class="calib-live" id="calLive"></p>
          ${this.step === 'reach' ? `<div class="rep-dots" id="calReps"></div>` : ''}
          <div class="calib-actions">
            ${this.step === 'reach' ? '<button class="wm-btn small" id="calDone" data-cal="done" hidden>✔ Use these reaches</button>' : ''}
            ${this.step === 'reach' && TR.Store.data.calib ? '<button class="wm-btn small" data-cal="saved">↩ Use my last goal</button>' : ''}
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
