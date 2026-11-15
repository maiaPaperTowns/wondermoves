/* ==========================================================================
   WM.CamPanel: the camera window shared by camera games.
   - calibrating(): big, centred, dims the game (calibration content goes in .body)
   - dock():        small, bottom-left above Pip; 👁️ hides it, a pill shows it again
   - draw(extra):   call every frame; draws the hand overlay (+ optional extra drawing)
   Needs wm-campanel.css. Builds its own DOM.
   ========================================================================== */
window.WM = window.WM || {};

WM.CamPanel = {
  el: null, video: null, canvas: null, ctx: null, body: null, pill: null, storageKey: null,

  mount({ title = '📷 Pip\'s camera', storageKey = null } = {}) {
    if (this.el) return this;
    this.storageKey = storageKey;
    const el = document.createElement('section');
    el.className = 'wm-cam calibrating';
    el.id = 'wmCam';
    el.setAttribute('aria-label', 'Camera');
    el.innerHTML = `
      <div class="wm-cam-head">
        <span class="wm-cam-title">${title}</span>
        <span class="wm-cam-status"></span>
        <button class="wm-cam-toggle" aria-label="Hide camera" title="Hide camera">👁️</button>
      </div>
      <div class="wm-cam-view">
        <video playsinline muted></video>
        <canvas></canvas>
        <div class="wm-cam-off"><span class="wm-emoji">📷</span><b>Camera is off</b></div>
      </div>
      <div class="wm-cam-body"></div>`;
    const pill = document.createElement('button');
    pill.className = 'wm-cam-pill';
    pill.textContent = '📷 Show camera';
    document.body.append(el, pill);

    this.el = el;
    this.pill = pill;
    this.video = el.querySelector('video');
    this.canvas = el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.body = el.querySelector('.wm-cam-body');
    this.status = el.querySelector('.wm-cam-status');
    this.offText = el.querySelector('.wm-cam-off b');

    el.querySelector('.wm-cam-toggle').addEventListener('click', () => this.setHidden(true));
    pill.addEventListener('click', () => this.setHidden(false));
    this.video.addEventListener('loadedmetadata', () => {
      const v = this.video;
      if (v.videoWidth && v.videoHeight) el.querySelector('.wm-cam-view').style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
    });
    return this;
  },

  /** Show or remove the whole camera window (e.g. when a game switches to touch). */
  show(on) {
    this.el.style.display = on ? '' : 'none';
    if (on) this.applyHidden(); else this.pill.classList.remove('show');
  },

  get docked() { return this.el.classList.contains('docked'); },
  get hidden() { try { return localStorage.getItem(this.storageKey) === '1'; } catch (_) { return false; } },

  calibrating() {
    document.body.classList.add('wm-calibrating');
    this.el.classList.add('calibrating');
    this.el.classList.remove('docked', 'collapsed');
    this.pill.classList.remove('show');
  },

  dock() {
    document.body.classList.remove('wm-calibrating');
    this.el.classList.remove('calibrating');
    this.el.classList.add('docked');
    this.applyHidden();
  },

  setHidden(h) {
    try { localStorage.setItem(this.storageKey, h ? '1' : '0'); } catch (_) { /* ignore */ }
    this.applyHidden();
  },
  applyHidden() {
    const h = this.hidden && this.docked;
    this.el.classList.toggle('collapsed', h);
    this.pill.classList.toggle('show', h);
  },

  cameraOn(on, offText = 'Camera is off') {
    this.el.classList.toggle('cam-live', on);
    this.offText.textContent = offText;
  },

  /**
   * Dashed outline of a hand seen from above, fingers pointing up the picture.
   * Used as a "put your hand here" guide when the camera looks down at the table.
   * side: 'left' | 'right' (thumb position), pointing: only the index finger out.
   * upsideDown: fingers point DOWN the picture, i.e. toward a front-facing laptop
   *   camera that sees the hands resting on the table in front of it.
   */
  drawHandGuide(ctx, cx, cy, s, { side = 'right', pointing = false, ok = false, color, upsideDown = false } = {}) {
    if (upsideDown) {
      // rotate half a turn; swap the thumb side so the thumb still faces the middle
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI);
      this.drawHandGuide(ctx, 0, 0, s, { side: side === 'right' ? 'left' : 'right', pointing, ok, color });
      ctx.restore();
      return;
    }
    const col = ok ? '#7BE0A4' : (color || 'rgba(255,255,255,0.9)');
    const flip = side === 'right' ? 1 : -1; // right hand: thumb on the left of the picture
    const capsule = (x, y, w, len, ang = 0) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -len, w, len, w / 2);
      ctx.restore();
    };
    ctx.save();
    ctx.lineWidth = Math.max(3, s * 0.05);
    ctx.setLineDash([s * 0.12, s * 0.09]);
    ctx.strokeStyle = col;
    ctx.fillStyle = ok ? 'rgba(123,224,164,0.16)' : 'rgba(255,255,255,0.10)';
    // palm
    ctx.beginPath();
    ctx.roundRect(cx - s / 2, cy - s * 0.45, s, s * 0.95, s * 0.28);
    ctx.fill(); ctx.stroke();
    // fingers: index → pinky, from the thumb side outward
    const lens = pointing ? [0.9, 0.22, 0.2, 0.18] : [0.72, 0.82, 0.76, 0.58];
    for (let i = 0; i < 4; i++) {
      const fx = cx + flip * (-s * 0.36 + i * s * 0.24);
      capsule(fx, cy - s * 0.42, s * 0.2, s * lens[i]);
      ctx.fill(); ctx.stroke();
    }
    // thumb
    capsule(cx - flip * s * 0.48, cy + s * 0.05, s * 0.22, s * (pointing ? 0.32 : 0.5), -flip * 0.9);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },

  draw(extra) {
    if (!WM.Hands.running || this.el.classList.contains('collapsed')) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    WM.Hands.drawOverlay(this.ctx, w, h);
    if (extra) extra(this.ctx, w, h);
    const n = ['left', 'right'].filter(s => WM.Hands.latest[s]).length;
    const txt = n === 2 ? '🙌 2 hands' : n === 1 ? '✋ 1 hand' : '👀 looking…';
    if (this.status.textContent !== txt) this.status.textContent = txt;
  },
};
