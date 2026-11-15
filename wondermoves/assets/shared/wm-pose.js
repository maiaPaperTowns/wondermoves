/* ==========================================================================
   WM.Pose: upper-body pose (MediaPipe Pose Landmarker lite), on-device.
   Used only while framing the player ("center your head and shoulders").
   Runs on the same <video> that WM.Hands uses; call stop() once framed.

   WM.Pose.latest = { ok, nose:{x,y,v}, ls:{x,y,v}, rs:{x,y,v} }
     x is mirrored like a selfie view; ls/rs = the player's left/right shoulder;
     v = visibility 0..1
   ========================================================================== */
window.WM = window.WM || {};

WM.Pose = (function () {
  const VERSION = '0.10.14';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  let landmarker = null, video = null, running = false, lastVideoTime = -1;
  const latest = { ok: false, nose: null, ls: null, rs: null };

  async function start(videoEl) {
    video = videoEl;
    if (!landmarker) {
      const vision = await import(`${CDN}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const make = delegate => vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try { landmarker = await make('GPU'); } catch (e) { landmarker = await make('CPU'); }
    }
    running = true;
    requestAnimationFrame(loop);
  }

  function stop() { running = false; latest.ok = false; }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!video || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    let res;
    try { res = landmarker.detectForVideo(video, performance.now()); } catch (e) { return; }
    const p = res.landmarks && res.landmarks[0];
    if (!p) { latest.ok = false; return; }
    const pt = k => ({ x: 1 - p[k].x, y: p[k].y, v: p[k].visibility == null ? 1 : p[k].visibility });
    latest.ok = true;
    latest.nose = pt(0);
    latest.ls = pt(11); // MediaPipe 11 = the person's left shoulder
    latest.rs = pt(12);
  }

  return {
    start, stop,
    get latest() { return latest; },
    get running() { return running; },
  };
})();
