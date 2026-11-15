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
  const site = FB.site = new FB.DigSite(canvas);
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
      if (this.mode === 'trace') {
        // show a fresh pile behind the challenge picker; the real treasure is chosen with the tier
        this.state = 'choosing';
        this.item = pickItem(this.level);
        this.depth = depthFor(this.item);
        site.setup(this.level, this.item, this.depth, (Math.random() * 1e9) | 0);
        return; // the game loop opens the challenge picker
      }
      this.item = pickItem(this.level);
      this.depth = depthFor(this.item);
      this.state = 'digging';
      site.setup(this.level, this.item, this.depth, (Math.random() * 1e9) | 0);
      if (!FB.UI.blocking()) FB.Buddy.say(pick(FB.LINES.start));
    },

    /** Copy Pip: start a dig for the chosen challenge tier. */
    startTrace(tierIdx) {
      this.resetDig();
      const tier = FB.TRACE.TIERS[tierIdx];
      this.tier = tierIdx;
      this.item = pickItemOfRarity(this.level, FB.rarityIndex(tier.rarity));
      this.depth = depthFor(this.item);
      this.state = 'digging';
      site.setup(this.level, this.item, this.depth, (Math.random() * 1e9) | 0);
      FB.Trace.start(tierIdx);
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
        extra.unlocked = FB.Store.unlockAfter(this.tier);
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

  /* ---------------- input ---------------- */
  let down = false, last = null, pointerId = null;

  function moveCursor(x, y) {
    cursor.style.transform = `translate(${x - 6}px, ${y - 58}px)`;
  }
  function updateCursorVisibility(e) {
    const over = Game.canDig() && site.contains(e.clientX, e.clientY, 1.05);
    const show = over && (
      e.pointerType === 'mouse' ||
      e.pointerId === 999 ||
      down
    );
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

    if (Game.mode === 'trace') { FB.Trace.onDown(last.x, last.y); return; }

    const removed = site.tap(last.x, last.y, Game.params());
    if (removed > 0) { site.spawnDust(last.x, last.y, 0, -1, 4); Game.lastBrushAt = performance.now(); hideHand(); Game.afterBrush(); }
  });

  canvas.addEventListener('pointermove', e => {
    moveCursor(e.clientX, e.clientY);
    updateCursorVisibility(e);
    if (!down || e.pointerId !== pointerId || !Game.canDig()) return;
    const x = e.clientX, y = e.clientY;

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
  });

  function endStroke(e) {
    if (e.pointerId !== pointerId) return;
    down = false; pointerId = null;
    FB.Trace.onUp();
    cursor.classList.remove('brushing');
    if (e.pointerType !== 'mouse') cursor.classList.remove('show');
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) cursor.classList.remove('show'); });


  /* ---------------- webcam hand tracking (in the browser) ---------------- */
  // MediaPipe Hand Landmarker runs on-device (WebAssembly / WebGL). Frames never leave the page.
  const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const HAND_MODEL = 'models/hand_landmarker.task';

  const webcamVideo = $('#webcamVideo');
  const cameraPreview = $('#cameraPreview');
  const trackingOverlay = $('#trackingOverlay');
  const trackingCtx = trackingOverlay.getContext('2d');

  function drawTrackingDot(data) {
    const w = trackingOverlay.clientWidth, h = trackingOverlay.clientHeight;
    if (trackingOverlay.width !== w || trackingOverlay.height !== h) {
      trackingOverlay.width = w; trackingOverlay.height = h;
    }
    trackingCtx.clearRect(0, 0, w, h);
    if (!data.detected) return;

    // the preview uses object-fit: cover, so map through the same crop
    const vw = webcamVideo.videoWidth || w, vh = webcamVideo.videoHeight || h;
    const s = Math.max(w / vw, h / vh);
    const x = data.x * vw * s - (vw * s - w) / 2;
    const y = data.y * vh * s - (vh * s - h) / 2;

    trackingCtx.beginPath();
    trackingCtx.arc(x, y, 10, 0, Math.PI * 2);
    trackingCtx.fillStyle = '#00FF66';
    trackingCtx.fill();
    trackingCtx.lineWidth = 3;
    trackingCtx.strokeStyle = 'white';
    trackingCtx.stroke();
  }

  async function openCamera() {
    const size = { width: { ideal: 640 }, height: { ideal: 480 } };
    let stream = await navigator.mediaDevices.getUserMedia({ video: size, audio: false });
    // Device labels are only readable after permission, so look for a Logitech/Brio now.
    const devices = await navigator.mediaDevices.enumerateDevices();
    const preferred = devices.find(d => d.kind === 'videoinput' && /logitech|brio/i.test(d.label));
    const current = stream.getVideoTracks()[0].getSettings().deviceId;
    if (preferred && preferred.deviceId !== current) {
      stream.getTracks().forEach(t => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({
        video: { ...size, deviceId: { exact: preferred.deviceId } }, audio: false,
      });
    }
    webcamVideo.srcObject = stream;
    await webcamVideo.play();
  }

  async function loadLandmarker() {
    const { FilesetResolver, HandLandmarker } = await import(`${VISION_CDN}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
    const opts = delegate => ({
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    try { return await HandLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch (_) { return HandLandmarker.createFromOptions(fileset, opts('CPU')); }
  }

  let landmarker = null, lastVideoTime = -1;
  function trackLoop() {
    if (webcamVideo.readyState >= 2 && webcamVideo.currentTime !== lastVideoTime) {
      lastVideoTime = webcamVideo.currentTime;
      const res = landmarker.detectForVideo(webcamVideo, performance.now());
      const tip = res.landmarks && res.landmarks[0] && res.landmarks[0][8]; // index fingertip
      // mirror x so moving your hand right moves the brush right
      onHand(tip ? { detected: true, x: 1 - tip.x, y: tip.y } : { detected: false });
    }
    requestAnimationFrame(trackLoop);
  }

  async function startHandTracking() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { cameraPreview.hidden = true; return; }
    try {
      [landmarker] = await Promise.all([loadLandmarker(), openCamera()]);
      requestAnimationFrame(trackLoop);
    } catch (err) {
      console.warn('Hand tracking unavailable; touch and mouse still work.', err);
      const stream = webcamVideo.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());
      cameraPreview.hidden = true;
    }
  }

  let cameraDown = false;

  function cameraPointer(type, x, y) {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId: 999,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y
    }));
  }

  function onHand(data) {
    drawTrackingDot(data);

    if (!data.detected || !Game.canDig()) {
      if (cameraDown) {
        cameraPointer("pointerup", 0, 0);
        cameraDown = false;
      }
      return;
    }

    const rect = digArea.getBoundingClientRect();
    const x = rect.left + data.x * rect.width;
    const y = rect.top + data.y * rect.height;

    // Always move the pen with the fingertip, even before drawing.
    if (!cameraDown) {
      cameraPointer("pointermove", x, y);
    }

    // Free Play: draw whenever a finger is detected.
    if (Game.mode === "free") {
      if (!cameraDown) {
        cameraPointer("pointerdown", x, y);
        cameraDown = true;
      } else {
        cameraPointer("pointermove", x, y);
      }
      return;
    }

    // Copy Pip: only start when near the current glowing dot.
    const trace = FB.Trace;

    if (!trace.active || trace.phase !== "trace") {
      if (cameraDown) {
        cameraPointer("pointerup", x, y);
        cameraDown = false;
      }
      return;
    }

    if (!cameraDown) {
      const start = trace.pts[Math.floor(trace.p)];
      if (!start) return;

      const distance = Math.hypot(x - start[0], y - start[1]);

      // Allow a slightly larger starting area for accessibility.
      if (distance <= trace.tol * 1.2) {
        cameraPointer("pointerdown", x, y);
        cameraDown = true;
      }
    } else {
      cameraPointer("pointermove", x, y);
    }
  }

  startHandTracking();


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

    if (Game.mode === 'trace') {
      FB.Trace.update(dt);
      if (Game.state === 'digging') Game.updateDepth();
      if (Game.state === 'choosing' && !blocking && FB.Store.data.tutorialDone) FB.Challenge.open();
    }

    Game.shown += (Game.target - Game.shown) * Math.min(1, dt * 6);
    FB.Meter.set(Game.shown);
    site.update(dt);
    site.draw();
    FB.Trace.draw(site.ctx);

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

  /* ---------------- boot ---------------- */
  FB.UI.init();
  layout();
  Game.setLevel(FB.Store.data.level);
  requestAnimationFrame(frame);
  if (!FB.Store.data.tutorialDone) setTimeout(() => FB.Tutorial.open(), 700);
})();
