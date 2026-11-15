/* ==========================================================================
   Bubble Pop: camera setup + calibration (same flow and look as Treasure Reach).
     1. frame — centre head & shoulders in the picture (body-pose model)
     2. hands — both hands in view
     3. range — wave hands around as far as is comfy; that area is stretched
                to fill the whole play area, so every bubble is reachable
   ========================================================================== */
window.BP = window.BP || {};

(function () {
  const $ = s => document.querySelector(s);
  const FRAME_S = 1.5, HANDS_S = 1.2, RANGE_S = 6, RANGE_MAX_S = 14, MIN_SPAN = 0.22;
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.max(0, Math.round(q * (b.length - 1))))]; };

  /** Where the target head-and-shoulders outline sits in the camera picture. */
  const GUIDE = { cx: 0.5, shoulderY: 0.7, shoulderW: 0.36 };

  const Calib = BP.Calib = {
    active: false, step: 'start', t: 0, stepStart: 0,
    frame: { ok: false, msg: '' },
    pts: { x: [], y: [] },
    poseFailed: false,

    open() {
      this.active = true;
      WM.CamPanel.calibrating();
      if (WM.Hands.running) this.go('frame');
      else this.go('start');
    },

    go(step) {
      this.step = step;
      this.t = 0;
      this.stepStart = performance.now();
      if (step === 'range') this.pts = { x: [], y: [] };
      if (step === 'frame') {
        if (this.poseFailed) { this.go('hands'); return; }
        WM.Pose.start(WM.CamPanel.video).catch(e => {
          console.warn('[Bubble Pop] pose model failed, skipping framing', e);
          this.poseFailed = true;
          if (this.step === 'frame') this.go('hands');
        });
      } else {
        WM.Pose.stop();
      }
      this.render();
      const say = {
        start: `Hi, I'm ${WM.PIP.name}! Let's go under the sea! Ask a grown-up to turn on the camera. 📷`,
        frame: 'Sit so your head and shoulders are in the middle of the picture! 🙂',
        hands: 'Now hold up your hands so I can see them! 👋',
        range: 'Wave your hands around: up high, down low, out wide, as far as feels comfy! 🌊',
        done: 'All set! Let\'s pop some bubbles! 🫧',
      }[step];
      if (say) WM.Buddy.say(say, 0);
    },

    async startCamera() {
      const status = $('#calStatus'), btn = $('#calStart');
      if (btn) btn.disabled = true;
      WM.Sound.ensure();
      try {
        await WM.Hands.start(WM.CamPanel.video, { onStatus: m => { if (status) status.textContent = m; } });
        BP.Store.data.inputMode = 'camera'; BP.Store.save();
        WM.CamPanel.cameraOn(true);
        this.go('frame');
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
        console.warn('[Bubble Pop] camera start failed:', e);
      }
    },

    /** Is the player's head & shoulders centred at a good distance? */
    checkFrame() {
      const P = WM.Pose.latest;
      if (!WM.Pose.running) return { ok: false, msg: 'Getting ready to look… 👀' };
      if (!P.ok || !P.ls || !P.rs || P.ls.v < 0.5 || P.rs.v < 0.5) return { ok: false, msg: 'I can\'t see your shoulders yet. Sit back a little so they show 🙂' };
      const cx = (P.ls.x + P.rs.x) / 2, w = Math.abs(P.ls.x - P.rs.x), sy = (P.ls.y + P.rs.y) / 2;
      if (cx < GUIDE.cx - 0.12) return { ok: false, msg: 'Move a little this way ➡️' };
      if (cx > GUIDE.cx + 0.12) return { ok: false, msg: '⬅️ Move a little this way' };
      if (w < GUIDE.shoulderW * 0.6) return { ok: false, msg: 'Come a little closer 🙂' };
      if (w > GUIDE.shoulderW * 1.6) return { ok: false, msg: 'Scoot back a little 🙂' };
      if (sy > 0.92 || (P.nose && P.nose.v > 0.5 && P.nose.y > 0.6)) return { ok: false, msg: 'Sit up tall, or tip the camera down a bit ⬇️' };
      if (P.nose && P.nose.v > 0.5 && P.nose.y < 0.08) return { ok: false, msg: 'Move down a little, or tip the camera up ⬆️' };
      return { ok: true, msg: 'Perfect! Stay right there… 🌟' };
    },

    finishRange() {
      const xs = this.pts.x, ys = this.pts.y;
      let x0 = pct(xs, 0.05), x1 = pct(xs, 0.95), y0 = pct(ys, 0.05), y1 = pct(ys, 0.95);
      const grow = (a, b) => {
        const pad = (b - a) * 0.08;
        a -= pad; b += pad;
        if (b - a < MIN_SPAN) { const c = (a + b) / 2; a = c - MIN_SPAN / 2; b = c + MIN_SPAN / 2; }
        return [Math.max(0, a), Math.min(1, b)];
      };
      [x0, x1] = grow(x0, x1);
      [y0, y1] = grow(y0, y1);
      BP.Store.data.range = { x0, x1, y0, y1, at: Date.now() };
      BP.Store.save();
      this.finish();
    },

    finish() {
      this.go('done');
      WM.Sound.fanfare(1);
      setTimeout(() => { this.active = false; BP.Game.afterCalibration(); }, 1600);
    },

    update(dt) {
      if (!this.active) return;
      const L = WM.Hands.latest;
      const present = ['left', 'right'].filter(s => L[s]);

      if (this.step === 'frame') {
        this.frame = this.checkFrame();
        this.t = this.frame.ok ? this.t + dt : Math.max(0, this.t - dt);
        this.setBar(this.t / FRAME_S);
        this.setLive(this.frame.msg);
        if (this.t >= FRAME_S) { WM.Sound.chime(); this.go('hands'); }
      }

      else if (this.step === 'hands') {
        this.t = present.length ? this.t + dt : Math.max(0, this.t - dt * 0.5);
        this.setBar(this.t / HANDS_S);
        this.setLive(present.length === 2 ? 'I see both hands! 🙌' : present.length ? 'I see one hand… show me the other one too!' : 'Looking for hands… 👀');
        const one = $('#calOne');
        if (one) one.hidden = !(present.length === 1 && performance.now() - this.stepStart > 4000);
        if (this.t >= HANDS_S && present.length === 2) { WM.Sound.chime(); this.go('range'); }
      }

      else if (this.step === 'range') {
        if (present.length) {
          this.t += dt;
          present.forEach(s => { this.pts.x.push(L[s].x); this.pts.y.push(L[s].y); });
        }
        const span = this.pts.x.length > 10 ? Math.min(pct(this.pts.x, 0.95) - pct(this.pts.x, 0.05), pct(this.pts.y, 0.95) - pct(this.pts.y, 0.05)) : 0;
        this.setBar(this.t / RANGE_S);
        this.setLive(!present.length ? 'Where did your hands go? 👀' : span < MIN_SPAN * 0.8 ? 'Bigger waves! Up high and out wide! 🌊' : 'Great waving! Keep going… 🙌');
        if ((this.t >= RANGE_S && span >= MIN_SPAN * 0.8) || this.t >= RANGE_MAX_S) this.finishRange();
      }
    },

    /** Extra drawing on the camera overlay (framing guide, range box). */
    drawExtra(ctx, w, h) {
      if (!this.active) return;
      if (this.step === 'frame') {
        const ok = this.frame.ok;
        const sw = GUIDE.shoulderW * w, cx = GUIDE.cx * w, sy = GUIDE.shoulderY * h;
        const headR = sw * 0.3;
        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = ok ? '#7BE0A4' : 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(cx, sy - sw * 0.62, headR, 0, Math.PI * 2);
        ctx.moveTo(cx - sw * 0.85, h);
        ctx.quadraticCurveTo(cx - sw * 0.75, sy, cx - sw * 0.2, sy - sw * 0.05);
        ctx.lineTo(cx + sw * 0.2, sy - sw * 0.05);
        ctx.quadraticCurveTo(cx + sw * 0.75, sy, cx + sw * 0.85, h);
        ctx.stroke();
        ctx.setLineDash([]);
        const P = WM.Pose.latest;
        if (P.ok) {
          ctx.fillStyle = ok ? '#7BE0A4' : '#FFE27A';
          [P.nose, P.ls, P.rs].forEach(p => { if (p && p.v > 0.5) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 7, 0, Math.PI * 2); ctx.fill(); } });
          if (P.ls.v > 0.5 && P.rs.v > 0.5) {
            ctx.lineWidth = 4; ctx.strokeStyle = ctx.fillStyle;
            ctx.beginPath(); ctx.moveTo(P.ls.x * w, P.ls.y * h); ctx.lineTo(P.rs.x * w, P.rs.y * h); ctx.stroke();
          }
        }
        ctx.restore();
      } else if (this.step === 'range' && this.pts.x.length > 10) {
        const x0 = pct(this.pts.x, 0.05), x1 = pct(this.pts.x, 0.95), y0 = pct(this.pts.y, 0.05), y1 = pct(this.pts.y, 0.95);
        ctx.save();
        ctx.fillStyle = 'rgba(123,224,164,0.18)';
        ctx.strokeStyle = '#7BE0A4';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.fillRect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h);
        ctx.strokeRect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h);
        ctx.restore();
      }
    },

    setBar(f) { const b = $('#calBar'); if (b) b.style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; },
    setLive(text) { const l = $('#calLive'); if (l && l.textContent !== text) l.textContent = text; },

    render() {
      const el = WM.CamPanel.body;
      const steps = ['frame', 'hands', 'range'];
      const idx = steps.indexOf(this.step);
      const stepper = `<ol class="wm-stepper">${['Sit', 'Hands', 'Wave'].map((n, i) => `<li class="${i < idx || this.step === 'done' ? 'done' : i === idx ? 'on' : ''}"><b>${i + 1}</b>${n}</li>`).join('')}</ol>`;
      const mouseLink = '<button class="wm-link" data-cal="mouse">🖱️ Play with a mouse instead</button>';
      if (this.step === 'start') {
        el.innerHTML = `
          <h2>Let's set up the camera!</h2>
          <p>Pip uses the camera to see you and your hands. Sit facing the screen.</p>
          <div class="wm-calib-actions">
            <button class="wm-btn primary" id="calStart" data-cal="start">📷 Turn on camera</button>
            ${mouseLink}
          </div>
          <p class="wm-calib-status" id="calStatus"></p>
          <p class="wm-calib-privacy">🔒 The video stays on this device. It is never saved or sent anywhere.</p>`;
      } else if (this.step === 'done') {
        el.innerHTML = `${stepper}<h2>🫧 All set!</h2><p>Time to dive in and pop some bubbles!</p>`;
      } else {
        const title = { frame: 'Sit in the middle of the picture 🙂', hands: 'Show me your hands! 👋', range: 'Wave your hands as far as is comfy 🌊' }[this.step];
        el.innerHTML = `
          ${stepper}
          <h2>${title}</h2>
          <div class="wm-calib-meter"><i id="calBar"></i></div>
          <p class="wm-calib-live" id="calLive"></p>
          <div class="wm-calib-actions">
            ${this.step === 'frame' ? '<button class="wm-btn small" data-cal="skipframe">Skip this step</button>' : ''}
            ${this.step === 'hands' ? '<button class="wm-btn small" id="calOne" data-cal="onehand" hidden>✋ Continue with one hand</button>' : ''}
            ${this.step === 'range' && BP.Store.data.range ? '<button class="wm-btn small" data-cal="saved">↩ Use my last area</button>' : ''}
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
    else if (act === 'mouse') { Calib.active = false; WM.Pose.stop(); BP.Game.useMouse(); }
    else if (act === 'skipframe') Calib.go('hands');
    else if (act === 'onehand') Calib.go('range');
    else if (act === 'saved') Calib.finish();
  });
})();
