/* ==========================================================================
   WM.Hands: webcam hand tracking (MediaPipe Hand Landmarker, in the browser).
   --------------------------------------------------------------------------
   Privacy: frames are processed in memory on this device. Video is never
   saved or sent anywhere. Only per-hand numbers leave this module.

   Output (WM.Hands.latest), per side ('left' / 'right' = the player's hands):
     { x, y,        palm centre, 0..1, x already mirrored like a selfie view
       size,        palm size (fraction of image height), grows as the hand nears the camera
       tip,         index fingertip {x, y}, mirrored like x
       wrist,       wrist point {x, y}, mirrored like x (the "top of the hand" seen by a camera tilted down)
       pointing,    true when only the index finger is stretched out
       landmarks }  21 raw MediaPipe points (not mirrored)

   Usage:
     await WM.Hands.start(videoEl, { onStatus: msg => ... });
     WM.Hands.onFrame(latest => ...);
   ========================================================================== */
window.WM = window.WM || {};

WM.Hands = (function () {
  const VERSION = '0.10.14';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
  // The model ships with the app (shared/models/) so it works offline; fall back to Google's copy
  // if the local file can't be read (e.g. when the page is opened from file://).
  const here = document.currentScript && document.currentScript.src;
  const MODEL_LOCAL = here ? new URL('models/hand_landmarker.task', here).href : 'models/hand_landmarker.task';
  const MODEL_REMOTE = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  // Prefer the kit's camera (Logitech Brio 105) when it is plugged in.
  const PREFERRED_CAMERA = /logitech|brio/i;
  // MediaPipe's left/right labels match the player's own hands for a normal
  // (unmirrored) webcam feed, confirmed on a real camera. Set to true only if a
  // camera mirrors its own output and the colours come out swapped.
  const SWAP_HANDEDNESS = false;
  const SMOOTH = 0.45;      // 0..1, higher = more responsive, lower = steadier
  const GRACE_MS = 250;     // keep a hand through brief detection dropouts
  const COLORS = { left: '#FF5A5F', right: '#4DA3FF' };
  const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

  let landmarker = null, video = null, stream = null;
  let running = false, paused = false, lastVideoTime = -1;
  let fps = 0, frames = 0, fpsT = 0;
  const listeners = [];
  const latest = { left: null, right: null };
  const smooth = { left: null, right: null };

  async function loadModel(onStatus) {
    onStatus && onStatus('Loading the hand tracker…');
    const vision = await import(`${CDN}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const make = (delegate, model) => vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    const tryModel = async model => {
      try { return await make('GPU', model); } catch (e) { return make('CPU', model); }
    };
    try { landmarker = await tryModel(MODEL_LOCAL); } catch (e) { landmarker = await tryModel(MODEL_REMOTE); }
  }

  /** Open the camera, switching to a Logitech/Brio if one is connected.
      (Device names are only readable after permission is granted, so ask first.) */
  async function openCamera() {
    const size = { width: { ideal: 640 }, height: { ideal: 480 } };
    let s = await navigator.mediaDevices.getUserMedia({ video: { ...size, facingMode: 'user' }, audio: false });
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const preferred = devices.find(d => d.kind === 'videoinput' && PREFERRED_CAMERA.test(d.label));
      const current = s.getVideoTracks()[0].getSettings().deviceId;
      if (preferred && preferred.deviceId !== current) {
        s.getTracks().forEach(t => t.stop());
        s = await navigator.mediaDevices.getUserMedia({ video: { ...size, deviceId: { exact: preferred.deviceId } }, audio: false });
      }
    } catch (e) { /* keep the default camera */ }
    return s;
  }

  async function start(videoEl, { onStatus } = {}) {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      throw Object.assign(new Error('This browser cannot use the camera here.'), { code: 'no-api' });
    }
    onStatus && onStatus('Asking to use the camera…');
    if (!stream) stream = await openCamera();
    video = videoEl;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (!landmarker) await loadModel(onStatus);
    running = true;
    paused = false;
    onStatus && onStatus('');
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (video) video.srcObject = null;
    latest.left = latest.right = null;
    smooth.left = smooth.right = null;
  }

  const dist = (a, b, asp) => Math.hypot((a.x - b.x) * asp, a.y - b.y);

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (paused || !video || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const now = performance.now();
    let res;
    try { res = landmarker.detectForVideo(video, now); } catch (e) { return; }

    const asp = video.videoWidth / video.videoHeight || 4 / 3;
    const found = { left: null, right: null };
    const hs = res.handedness || res.handednesses || [];
    (res.landmarks || []).forEach((lm, i) => {
      const cat = hs[i] && hs[i][0];
      let cx = 0, cy = 0;
      [0, 5, 9, 13, 17].forEach(k => { cx += lm[k].x; cy += lm[k].y; });
      cx /= 5; cy /= 5;
      let side = cat ? cat.categoryName.toLowerCase() : (cx < 0.5 ? 'right' : 'left');
      if (cat && SWAP_HANDEDNESS) side = side === 'left' ? 'right' : 'left';
      if (found[side]) side = side === 'left' ? 'right' : 'left'; // two hands with the same label
      if (found[side]) return;
      // a finger is stretched out when its tip is clearly farther from the wrist than its middle joint
      const ext = (tip, pip) => dist(lm[0], lm[tip], asp) > dist(lm[0], lm[pip], asp) * 1.12;
      found[side] = {
        x: 1 - cx, y: cy,
        tip: { x: 1 - lm[8].x, y: lm[8].y },
        wrist: { x: 1 - lm[0].x, y: lm[0].y },
        pointing: ext(8, 6) && !ext(12, 10) && !ext(16, 14),
        size: (dist(lm[0], lm[9], asp) + dist(lm[5], lm[17], asp)) / 2,
        score: cat ? cat.score : 1,
        landmarks: lm,
        t: now,
      };
    });

    ['left', 'right'].forEach(s => {
      const h = found[s];
      if (!h) {
        if (latest[s] && now - latest[s].t > GRACE_MS) { latest[s] = null; smooth[s] = null; }
        return;
      }
      const p = smooth[s];
      if (p) {
        h.x = p.x + (h.x - p.x) * SMOOTH;
        h.y = p.y + (h.y - p.y) * SMOOTH;
        h.size = p.size + (h.size - p.size) * SMOOTH;
        h.tip = { x: p.tip.x + (h.tip.x - p.tip.x) * SMOOTH, y: p.tip.y + (h.tip.y - p.tip.y) * SMOOTH };
        h.wrist = { x: p.wrist.x + (h.wrist.x - p.wrist.x) * SMOOTH, y: p.wrist.y + (h.wrist.y - p.wrist.y) * SMOOTH };
      }
      smooth[s] = { x: h.x, y: h.y, size: h.size, tip: h.tip, wrist: h.wrist };
      latest[s] = h;
    });

    frames++;
    if (now - fpsT > 1000) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
    listeners.forEach(fn => fn(latest));
  }

  /** Draw a mirrored skeleton + palm circles onto a canvas laid over the (mirrored) video. */
  function drawOverlay(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ['left', 'right'].forEach(side => {
      const hand = latest[side];
      if (!hand || !hand.landmarks || hand.landmarks.length < 21) return;
      const P = hand.landmarks.map(p => [(1 - p.x) * w, p.y * h]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, w / 180);
      ctx.beginPath();
      CONNECTIONS.forEach(([a, b]) => { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); });
      ctx.stroke();
      ctx.fillStyle = COLORS[side];
      P.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, w / 140), 0, Math.PI * 2); ctx.fill(); });
      const cx = hand.x * w, cy = hand.y * h, r = hand.size * h * 0.55;
      ctx.lineWidth = Math.max(3, w / 110);
      ctx.strokeStyle = COLORS[side];
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    });
  }

  return {
    COLORS,
    start, stop,
    pause(p) { paused = !!p; },
    onFrame(fn) { listeners.push(fn); },
    drawOverlay,
    get latest() { return latest; },
    get running() { return running; },
    get fps() { return fps; },
  };
})();
