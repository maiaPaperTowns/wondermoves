/* ==========================================================================
   Treasure Reach: DISTANCE-SENSOR TEST MODE (reach-test branch only)

   Purpose: isolate the Modulino Distance sensor to see where and when it detects
   a hand. The camera is NOT used at all. The chest opens purely from the sensor:
   reading ≤ threshold, held for the level's hold time, then the reading must go
   back above threshold + BACK_MM (or disappear) before the next chest.

   The diagnostics panel shows:
   - the live reading (all readings, also those beyond the game's 15 cm trust limit)
   - readings per second and the age of the last reading
   - min / max since reset, and a 10-second graph with the threshold line
   - the chip's own per-second counts from the board (distance_debug):
     ok / noisy / weak / error readings, the raw mm and raw status of the last one
   - the board's "sensor only sees its own window" hint
   Threshold is adjustable live (− / +) and remembered in this browser.
   ========================================================================== */
window.TR = window.TR || {};

(function () {
  const $ = s => document.querySelector(s);
  const FRESH_MS = 400;       // a reading older than this = "no reading"
  const BACK_MM = 30;         // after a chest, the reading must go back above threshold + this
  const GRAPH_S = 10;         // seconds shown in the graph
  const GRAPH_MAX_MM = 300;   // graph top
  const KEY = 'treasureReach.sensorTest.thresholdMm';

  let threshold = 60;
  try { threshold = +localStorage.getItem(KEY) || 60; } catch (_) { /* ignore */ }

  const T = TR.SensorTest = {
    enabled: true,            // this branch: Treasure Reach always runs as the sensor test
    get thresholdMm() { return threshold; },
    readings: [],             // [t, mm] for the graph + rate
    min: null, max: null,
    debug: null, debugAt: 0, hint: null,

    /** Latest reading in mm, or null when nothing fresh has arrived. */
    reading() {
      const B = window.WM && WM.Board;
      if (!B || B.distMm == null || performance.now() - B.distAt > FRESH_MS) return null;
      return B.distMm;
    },

    start() {
      TR.Store.data.inputMode = 'sensor';
      TR.Calib.active = false;
      if (WM.CamPanel.el) { WM.CamPanel.dock(); WM.CamPanel.show(false); }
      document.body.classList.remove('wm-calibrating');
      this.mount();
      const B = WM.Board;
      if (B.available) B.send('start', { game: 'reach_ui' });
      // collect every reading for the rate / graph (wm-board.js keeps only the latest)
      B.on('distance', d => {
        const now = performance.now(), mm = d.mm;
        this.readings.push([now, mm]);
        this.min = this.min == null ? mm : Math.min(this.min, mm);
        this.max = this.max == null ? mm : Math.max(this.max, mm);
      });
      B.on('distance_debug', d => { this.debug = d; this.debugAt = performance.now(); });
      B.on('sensor_hint', d => { this.hint = d; });
      WM.Buddy.say(B.available ? 'Sensor test! Move your hand toward the sensor to open the chest. 📏' : 'Sensor test: the board isn\'t connected, so there are no readings yet. 🔌', 0);
      TR.Game.state = 'rest';
      TR.Game.resetRep();
    },

    /** Game measurement for the test (used by TR.Game.measure in 'sensor' mode). */
    measure() {
      const d = this.reading();
      const far = Math.max(threshold + 60, 200);
      const v = d == null ? 0 : Math.max(0, Math.min(1, (far - d) / (far - threshold)));
      const ok = d != null && d <= threshold;
      const back = d == null || d > threshold + BACK_MM;
      return { p: { left: v, right: v }, bar: ok ? 1 : Math.min(v, 0.97), ok, back };
    },

    setThreshold(mm) {
      threshold = Math.max(5, Math.min(400, Math.round(mm)));
      try { localStorage.setItem(KEY, threshold); } catch (_) { /* ignore */ }
      $('#stThr').textContent = threshold + ' mm';
    },

    mount() {
      if ($('#sensorTest')) return;
      const el = document.createElement('section');
      el.id = 'sensorTest';
      el.className = 'sensor-test wm-card';
      el.innerHTML = `
        <div class="st-head">📏 Distance sensor test</div>
        <div class="st-big"><b id="stMm">—</b><span id="stState">no reading</span></div>
        <div class="st-row"><span>Readings / s</span><b id="stRate">0</b></div>
        <div class="st-row"><span>Last reading</span><b id="stAge">—</b></div>
        <div class="st-row"><span>Min / max</span><b id="stMinMax">— / —</b></div>
        <div class="st-row thr"><span>Open at ≤</span>
          <button class="st-btn" data-st="-">−</button><b id="stThr"></b><button class="st-btn" data-st="+">+</button>
        </div>
        <canvas id="stGraph" width="560" height="200"></canvas>
        <div class="st-sub">Chip, last second</div>
        <div class="st-chips">
          <span>ok <b id="stOk">–</b></span><span>noisy <b id="stNoisy">–</b></span>
          <span>weak <b id="stWeak">–</b></span><span>error <b id="stErr">–</b></span>
        </div>
        <div class="st-row"><span>Raw (any status)</span><b id="stRaw">—</b></div>
        <div class="st-row"><span>Board</span><b id="stBoard">—</b></div>
        <div class="st-warn" id="stHint" hidden>⚠️ The sensor only sees its own window (film, fingerprint or something touching it)</div>
        <div class="st-actions">
          <button class="wm-btn small" data-st="reset">Reset min / max</button>
          <span class="st-chests">Chests: <b id="stChests">0</b></span>
        </div>`;
      document.body.appendChild(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-st]');
        if (!b) return;
        const a = b.dataset.st;
        if (a === '-') this.setThreshold(threshold - 5);
        else if (a === '+') this.setThreshold(threshold + 5);
        else if (a === 'reset') { this.min = this.max = null; }
      });
      this.setThreshold(threshold);
    },

    /** Refresh the panel (called every frame). */
    render() {
      if (!$('#sensorTest')) return;
      const now = performance.now();
      this.readings = this.readings.filter(r => now - r[0] <= GRAPH_S * 1000);
      const d = this.reading();
      const B = WM.Board;
      const last = this.readings.length ? this.readings[this.readings.length - 1] : null;
      const rate = this.readings.filter(r => now - r[0] <= 1000).length;
      $('#stMm').textContent = d == null ? '—' : `${Math.round(d)} mm`;
      const st = $('#stState');
      st.textContent = d == null ? 'no reading' : d <= threshold ? 'IN RANGE: opens' : 'seen, too far';
      st.className = d == null ? 'none' : d <= threshold ? 'in' : 'out';
      $('#stRate').textContent = rate;
      $('#stAge').textContent = last ? `${Math.round(now - last[0])} ms ago` : 'never';
      $('#stMinMax').textContent = `${this.min == null ? '—' : Math.round(this.min)} / ${this.max == null ? '—' : Math.round(this.max)} mm`;
      const dbg = this.debug && now - this.debugAt < 2500 ? this.debug : null;
      $('#stOk').textContent = dbg ? dbg.ok : '–';
      $('#stNoisy').textContent = dbg ? dbg.noisy : '–';
      $('#stWeak').textContent = dbg ? dbg.weak : '–';
      $('#stErr').textContent = dbg ? dbg.error : '–';
      $('#stRaw').textContent = dbg ? `${dbg.raw_mm} mm · status ${dbg.raw_status}` : '—';
      const s = B.sensors || {};
      $('#stBoard').textContent = !B.available ? 'not connected'
        : `connected · distance ${s.distance === false ? 'MISSING' : 'ok'}${s.distance_hz != null ? ` · ${s.distance_hz} Hz` : ''}`;
      $('#stHint').hidden = !(this.hint && this.hint.distance_window_blocked);
      $('#stChests').textContent = TR.Store.data.totals.chests;

      // graph: last GRAPH_S seconds, near = bottom
      const cv = $('#stGraph'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
      const y = mm => H - Math.min(1, mm / GRAPH_MAX_MM) * H;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#1D1A2E'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '16px Fredoka, sans-serif';
      [50, 100, 150, 200, 250].forEach(mm => { g.beginPath(); g.moveTo(0, y(mm)); g.lineTo(W, y(mm)); g.stroke(); g.fillText(mm + '', 4, y(mm) - 3); });
      g.setLineDash([8, 6]); g.strokeStyle = '#3DDC84'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, y(threshold)); g.lineTo(W, y(threshold)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#FFC94A';
      this.readings.forEach(([t, mm]) => {
        const x = W - ((now - t) / (GRAPH_S * 1000)) * W;
        g.fillRect(x - 2, y(mm) - 2, 4, 4);
      });
    },
  };
})();
