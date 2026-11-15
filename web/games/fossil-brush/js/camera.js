/* ==========================================================================
   Fossil Brush: camera play (prototype).
   The camera points straight at the child. One index finger, held up in the
   air, is the brush.
     1. point — hold up one hand with the index finger pointing up, inside the outline
     2. area  — draw a big circle in the air with the fingertip; that area is
                mapped onto the sand pile
   During play the fingertip moves the brush. When the brush touches the sand
   depends on the grown-up setting `brushRule`:
     'auto'  (default) — no gesture needed. Free Play: the brush is down
             whenever a finger is seen. Copy Pip: it goes down when the
             fingertip reaches the glowing dot, and lifts between shapes.
     'point' — only the index finger out = touching; open hand / fist = lifted.
   A real touch sensor can later replace these rules in FB.Cam.finger().

   Setup works the same way as Treasure Reach and Bubble Pop:
     start (tap "Turn on camera") → point → circle ("Use my last area" if saved)
     → done → the panel docks bottom-left. If the camera fails, the panel stays
     open with the reason and a "use touch / mouse instead" option.
   ========================================================================== */
window.FB = window.FB || {};

(function () {
  const $ = s => document.querySelector(s);
  const POINT_S = 1.2, AREA_S = 6, AREA_MAX_S = 14, MIN_SPAN = 0.18;
  const GUIDE = { x: 0.5, y: 0.6, size: 0.2 };
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.max(0, Math.round(q * (b.length - 1))))]; };

  /** The hand to use: prefer one that is pointing. */
  function activeHand() {
    const L = WM.Hands.latest;
    const hs = ['right', 'left'].map(s => L[s]).filter(Boolean);
    return hs.find(h => h.pointing) || hs[0] || null;
  }

  const Cam = FB.Cam = {
    active: false, step: 'start', t: 0, stepStart: 0,
    pts: { x: [], y: [] }, path: [],
    penCount: 0, pen: false,

    get enabled() { return FB.Store.data.input === 'camera'; },
    /** Camera is set up and driving the brush. */
    playing() { return this.enabled && !this.active && WM.Hands.running; },

    mount() {
      if (WM.CamPanel.el) return;
      WM.CamPanel.mount({ storageKey: 'fossilBrush.camHidden' });
    },

    open() {
      this.mount();
      FB.Store.data.input = 'camera'; FB.Store.save();
      this.active = true;
      WM.CamPanel.calibrating();
      this.go(WM.Hands.running ? 'point' : 'start');
    },

    /** Setup finished: dock the panel and carry on playing. */
    done() {
      this.go('done');
      FB.Sound.chime();
      setTimeout(() => {
        this.active = false;
        WM.CamPanel.dock();
        WM.CamPanel.cameraOn(true);
        FB.Game.cameraDone();
      }, 1600);
    },

    /** Back to touch / mouse. */
    off() {
      this.active = false;
      WM.Hands.stop();
      FB.Store.data.input = 'touch'; FB.Store.save();
      if (WM.CamPanel.el) { WM.CamPanel.dock(); WM.CamPanel.show(false); }
      FB.Game.cameraDone();
    },

    go(step) {
      this.step = step;
      this.t = 0;
      this.stepStart = performance.now();
      if (step === 'area') { this.pts = { x: [], y: [] }; this.path = []; }
      this.render();
      const say = {
        start: `Let's use the camera! Sit facing the computer so I can see you. 📷`,
        point: 'Hold up one hand and point your finger up in the air, like this! ☝️',
        area: 'Now draw a big circle in the air with your finger! ⭕',
        done: 'All set! Your finger is the brush now! 🖌️',
      }[step];
      if (say) FB.Buddy.say(say, 0);
    },

    async startCamera() {
      const status = $('#calStatus'), btn = $('#calStart');
      if (btn) btn.disabled = true;
      FB.Sound.ensure();
      try {
        await WM.Hands.start(WM.CamPanel.video, { onStatus: m => { if (status) status.textContent = m; } });
        WM.CamPanel.cameraOn(true);
        this.go('point');
      } catch (e) {
        console.warn('[Fossil Brush] camera start failed:', e);
        if (btn) btn.disabled = false;
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        const fileFrame = location.protocol === 'file:' && window.parent !== window;
        if (status) {
          status.textContent = denied && fileFrame
            ? 'The camera only works when WonderMoves runs from a local server (see web/README.md), or open this game on its own.'
            : denied ? 'The camera was blocked. Allow camera access in the browser, or use touch / mouse instead.'
            : 'No camera or hand tracker available. You can use touch or the mouse instead.';
          status.classList.add('error');
        }
        FB.Buddy.say('Uh oh, I can\'t see the camera. We can brush with touch or the mouse instead! 🖐️', 0);
      }
    },

    finish() {
      const xs = this.pts.x, ys = this.pts.y;
      const grow = (a, b) => {
        const pad = (b - a) * 0.06;
        a -= pad; b += pad;
        if (b - a < MIN_SPAN) { const c = (a + b) / 2; a = c - MIN_SPAN / 2; b = c + MIN_SPAN / 2; }
        return [Math.max(0, a), Math.min(1, b)];
      };
      const [x0, x1] = grow(pct(xs, 0.04), pct(xs, 0.96));
      const [y0, y1] = grow(pct(ys, 0.04), pct(ys, 0.96));
      FB.Store.data.camArea = { x0, x1, y0, y1, at: Date.now() };
      FB.Store.save();
      this.done();
    },

    update(dt) {
      if (!this.active) return;
      const h = activeHand();
      if (this.step === 'point') {
        const ok = !!(h && (h.pointing || FB.Store.data.brushRule !== 'point'));
        this.t = ok ? this.t + dt : Math.max(0, this.t - dt * 0.6);
        this.setBar(this.t / POINT_S);
        this.setLive(ok ? 'I see your finger! Hold it up… ☝️' : h ? 'I see your hand! Now point one finger up ☝️' : 'Hold up your hand so I can see it 👀');
        if (this.t >= POINT_S) { FB.Sound.chime(); this.go('area'); }
      } else if (this.step === 'area') {
        if (h) {
          this.t += dt;
          this.pts.x.push(h.tip.x); this.pts.y.push(h.tip.y);
          this.path.push([h.tip.x, h.tip.y]);
          if (this.path.length > 400) this.path.shift();
        }
        const span = this.pts.x.length > 10 ? Math.min(pct(this.pts.x, 0.96) - pct(this.pts.x, 0.04), pct(this.pts.y, 0.96) - pct(this.pts.y, 0.04)) : 0;
        this.setBar(this.t / AREA_S);
        this.setLive(!h ? 'Where did your hand go? 👀' : span < MIN_SPAN ? 'Bigger circle! As big as is comfy ⭕' : 'Lovely circle! Keep going… ⭕');
        if ((this.t >= AREA_S && span >= MIN_SPAN) || this.t >= AREA_MAX_S) this.finish();
      }
    },

    /** Fingertip on screen + whether the brush is "down", for play. */
    finger() {
      const h = activeHand();
      if (!h) { this.penCount = 0; this.pen = false; return null; }
      const a = FB.Store.data.camArea || { x0: 0.2, x1: 0.8, y0: 0.2, y1: 0.8 };
      const u = (h.tip.x - a.x0) / (a.x1 - a.x0), v = (h.tip.y - a.y0) / (a.y1 - a.y0);
      const { cx, cy, S } = FB.site.layout;
      const k = S * 1.1;
      const pos = {
        x: Math.max(0, Math.min(window.innerWidth, cx + (u - 0.5) * k)),
        y: Math.max(0, Math.min(window.innerHeight, cy + (v - 0.5) * k)),
      };
      if (FB.Store.data.brushRule === 'point') {
        // a little hysteresis so a wobbly finger doesn't flicker the brush on/off
        this.penCount = Math.max(-3, Math.min(3, this.penCount + (h.pointing ? 1 : -1)));
        if (this.penCount >= 2) this.pen = true;
        if (this.penCount <= -2) this.pen = false;
      } else {
        this.pen = this.autoPen(pos);
      }
      return { ...pos, pen: this.pen };
    },

    /** 'auto' rule: no gesture needed (from the fossil-brush camera integration). */
    autoPen(pos) {
      if (FB.Game.mode === 'free') return true;            // Free Play: brush whenever a finger is seen
      const T = FB.Trace;
      if (!T.active || T.phase !== 'trace') return false;  // lift between shapes / during Pip's demo
      if (this.pen) return true;                           // keep brushing once started
      const dot = T.pts[Math.floor(T.p)];                  // start when the fingertip reaches the glowing dot
      return !!dot && Math.hypot(pos.x - dot[0], pos.y - dot[1]) <= T.tol * 1.2;
    },

    /** Extra drawing on the camera view. */
    drawExtra(ctx, w, h) {
      if (this.active && this.step === 'point') {
        const hand = activeHand();
        WM.CamPanel.drawHandGuide(ctx, GUIDE.x * w, GUIDE.y * h, GUIDE.size * w, { side: 'right', pointing: true, ok: !!(hand && hand.pointing) });
      } else if (this.active && this.step === 'area' && this.path.length > 1) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#FFE27A'; ctx.lineWidth = 5;
        ctx.beginPath();
        this.path.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
        ctx.stroke();
        ctx.restore();
      } else if (!this.active) {
        const a = FB.Store.data.camArea;
        if (a) {
          ctx.save();
          ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,226,122,0.8)';
          ctx.strokeRect(a.x0 * w, a.y0 * h, (a.x1 - a.x0) * w, (a.y1 - a.y0) * h);
          ctx.restore();
        }
        const hand = activeHand();
        if (hand) {
          ctx.fillStyle = this.pen ? '#FF8A3D' : 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(hand.tip.x * w, hand.tip.y * h, 7, 0, Math.PI * 2); ctx.fill();
        }
      }
    },

    setBar(f) { const b = $('#calBar'); if (b) b.style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; },
    setLive(text) { const l = $('#calLive'); if (l && l.textContent !== text) l.textContent = text; },

    render() {
      const el = WM.CamPanel.body;
      const idx = ['point', 'area'].indexOf(this.step);
      const stepper = `<ol class="wm-stepper">${['Point', 'Circle'].map((n, i) => `<li class="${i < idx || this.step === 'done' ? 'done' : i === idx ? 'on' : ''}"><b>${i + 1}</b>${n}</li>`).join('')}</ol>`;
      const touchLink = '<button class="link-btn" data-cam="touch">🖐️ Use touch / mouse instead</button>';
      if (this.step === 'start') {
        el.innerHTML = `
          <h2>Let's set up the camera!</h2>
          <p>Point the camera straight at you, and sit so it can see your hand when you hold it up.</p>
          <div class="wm-calib-actions">
            <button class="pill-btn primary" id="calStart" data-cam="start">📷 Turn on camera</button>
            ${touchLink}
          </div>
          <p class="wm-calib-status" id="calStatus"></p>
          <p class="wm-calib-privacy">🔒 The video stays on this device. It is never saved or sent anywhere.</p>`;
      } else if (this.step === 'done') {
        el.innerHTML = `${stepper}<h2>🖌️ All set!</h2><p>${FB.Store.data.brushRule === 'point' ? 'Point to brush the sand. Open your hand to lift the brush.' : 'Move your finger to brush the sand!'}</p>`;
      } else {
        const title = { point: 'Finger up in the air ☝️', area: 'Draw a big circle in the air ⭕' }[this.step];
        el.innerHTML = `
          ${stepper}
          <h2>${title}</h2>
          <div class="wm-calib-meter"><i id="calBar"></i></div>
          <p class="wm-calib-live" id="calLive"></p>
          <div class="wm-calib-actions">
            ${this.step === 'area' && FB.Store.data.camArea ? '<button class="pill-btn small" data-cam="saved">↩ Use my last area</button>' : ''}
            ${touchLink}
          </div>`;
      }
    },
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    const act = b.dataset.cam;
    if (act === 'start') Cam.startCamera();
    else if (act === 'touch') Cam.off();
    else if (act === 'saved') {
      Cam.done();
    }
  });
})();
