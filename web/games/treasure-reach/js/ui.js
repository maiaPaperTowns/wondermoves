/* ==========================================================================
   Treasure Reach: UI (camera panel, menu + grown-up settings, set card, tutorial).
   ========================================================================== */
window.TR = window.TR || {};

(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ---------------- camera panel ---------------- */
  const Panel = TR.Panel = {
    el: null,
    init() { this.el = $('#camPanel'); this.applyHidden(); },
    calibrating() {
      document.body.classList.add('calibrating');
      this.el.classList.add('calibrating');
      this.el.classList.remove('docked');
      $('#camShow').classList.remove('show');
      this.el.classList.remove('collapsed');
    },
    dock() {
      document.body.classList.remove('calibrating');
      this.el.classList.remove('calibrating');
      this.el.classList.add('docked');
      this.applyHidden();
    },
    cameraOn(on) {
      this.el.classList.toggle('cam-live', on);
      $('#camOffText').textContent = on ? '' : (TR.Store.data.inputMode === 'mouse' ? 'Using the mouse' : 'Camera is off');
    },
    applyHidden() {
      const hidden = !!TR.Store.data.camHidden && this.el.classList.contains('docked');
      this.el.classList.toggle('collapsed', hidden);
      $('#camShow').classList.toggle('show', hidden);
    },
    setHidden(h) { TR.Store.data.camHidden = h; TR.Store.save(); this.applyHidden(); },
  };

  /* ---------------- layers ---------------- */
  const UI = TR.UI = {
    open: new Set(),
    blocking() { return this.open.size > 0 || WM.Tutorial.isOpen() || TR.Calib.active; },
  };
  function openLayer(sel) { $(sel).classList.add('open'); UI.open.add(sel); }
  function closeLayer(sel) { $(sel).classList.remove('open'); UI.open.delete(sel); }

  /* ---------------- menu / settings ---------------- */
  const Menu = TR.Menu = {
    open() { this.render(); openLayer('#drawer'); $('#drawerBackdrop').classList.add('open'); },
    close() { closeLayer('#drawer'); $('#drawerBackdrop').classList.remove('open'); },
    render() {
      const d = TR.Store.data, s = TR.Store.s;
      $$('#inputToggle [data-input]').forEach(b => b.classList.toggle('active', b.dataset.input === d.inputMode));
      $('#goalPct').value = s.goalPct;
      $('#goalPctVal').textContent = s.goalPct + '%';
      $$('#holdToggle [data-hold]').forEach(b => b.classList.toggle('active', +b.dataset.hold === s.holdMs));
      $$('#handsToggle [data-hands]').forEach(b => b.classList.toggle('active', b.dataset.hands === s.hands));
      $$('#setToggle [data-set]').forEach(b => b.classList.toggle('active', +b.dataset.set === s.setSize));
      const c = d.calib;
      $('#calibInfo').textContent = c
        ? `Comfy reach: palm grows ${Math.round(c.goal * 100)}% (set ${new Date(c.at).toLocaleDateString()})`
        : 'No reach setup yet.';
      const log = d.log;
      if (log.length) {
        const recent = log.slice(-10);
        const avg = Math.round(recent.reduce((a, r) => a + r.peak, 0) / recent.length * 100);
        const secs = (recent.reduce((a, r) => a + r.ms, 0) / recent.length / 1000).toFixed(1);
        $('#logInfo').textContent = `${d.totals.chests} chests opened · last 10: avg peak ${avg}% of goal, ${secs}s per reach`;
      } else {
        $('#logInfo').textContent = 'No chests opened yet.';
      }
      $('#totalChests').textContent = d.totals.chests;
    },
  };

  /* ---------------- set complete ---------------- */
  TR.SetCard = {
    show(count, bestPct) {
      $('#setCount').textContent = count;
      $('#setBest').textContent = bestPct + '%';
      openLayer('#setModal');
    },
    close() { closeLayer('#setModal'); },
  };

  /* ---------------- tutorial ---------------- */
  TR.tutorialSteps = function () {
    const mouse = TR.Store.data.inputMode === 'mouse';
    return [
      { text: `Hi, I'm ${WM.PIP.name}! Let's open some treasure chests together! 💰`, target: null },
      { text: mouse ? 'This chest is locked tight! Move the blue circle up to it to open it. 🖱️' : 'This chest is locked tight! Reach toward the screen to open it. 🙌', target: '#chest', round: true, pad: 4 },
      { text: mouse ? 'The blue circle is your hand. Bring it all the way to the chest! 🔵' : 'Your hands are the glowing circles: red for your left hand, blue for your right. They float to the chest as you reach! 🔴🔵', target: null },
      { text: 'This bar fills up as you reach. Fill it to the star and hold it for a moment! ⭐', target: '#reachMeter' },
      { text: 'Then bring your hands back to rest, and a new chest appears. 🔁', target: '#setDots', pad: 12 },
      { text: 'This is my camera window. Tap the eye to hide it or show it. 📷', target: '#camPanel' },
      { text: 'Grown-ups can redo the reach setup or change the goal in the Menu. ⚙️', target: '#menuBtn' },
      { text: 'Need help? Tap ? and I\'ll come right back. Let\'s find treasure! 🎉', target: '#helpBtn' },
    ];
  };
  TR.openTutorial = function () {
    WM.Tutorial.open(TR.tutorialSteps(), {
      doneLabel: "Let's go! 💰",
      onClose: () => {
        if (!TR.Store.data.tutorialDone) { TR.Store.data.tutorialDone = true; TR.Store.save(); }
        TR.Game.nudge(true);
      },
    });
  };

  /* ---------------- sound button ---------------- */
  function updateSoundBtn() {
    const m = WM.Sound.muted;
    $('#soundBtn').textContent = m ? '🔇' : '🔊';
    $('#soundBtn').setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off');
  }

  /* ---------------- wiring ---------------- */
  UI.init = function () {
    Panel.init();
    updateSoundBtn();
    document.addEventListener('click', e => { if (e.target.closest('button') && !e.target.closest('[data-cal],[data-act]')) WM.Sound.click(); });

    $('#menuBtn').addEventListener('click', () => Menu.open());
    $('#drawerClose').addEventListener('click', () => Menu.close());
    $('#drawerBackdrop').addEventListener('click', () => Menu.close());
    $('#helpBtn').addEventListener('click', () => TR.openTutorial());
    $('#soundBtn').addEventListener('click', () => {
      WM.Sound.ensure();
      WM.Sound.setMuted(!WM.Sound.muted);
      TR.Store.data.muted = WM.Sound.muted; TR.Store.save();
      updateSoundBtn();
    });

    $('#camHide').addEventListener('click', () => Panel.setHidden(true));
    $('#camShow').addEventListener('click', () => Panel.setHidden(false));

    $('#inputToggle').addEventListener('click', e => {
      const b = e.target.closest('[data-input]');
      if (!b) return;
      Menu.close();
      if (b.dataset.input === 'mouse') TR.Game.useMouse();
      else TR.Calib.open(false);
    });
    $('#recalBtn').addEventListener('click', () => { Menu.close(); TR.Calib.open(true); });
    $('#drawerHelp').addEventListener('click', () => { Menu.close(); TR.openTutorial(); });

    $('#goalPct').addEventListener('input', e => {
      TR.Store.s.goalPct = +e.target.value; TR.Store.save();
      $('#goalPctVal').textContent = e.target.value + '%';
    });
    const seg = (sel, attr, key, cast) => $(sel).addEventListener('click', e => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b) return;
      TR.Store.s[key] = cast(b.dataset[attr]); TR.Store.save();
      Menu.render();
      if (key === 'setSize') TR.Game.renderDots();
    });
    seg('#holdToggle', 'hold', 'holdMs', Number);
    seg('#handsToggle', 'hands', 'hands', String);
    seg('#setToggle', 'set', 'setSize', Number);

    $('#exportLog').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ calib: TR.Store.data.calib, settings: TR.Store.s, reps: TR.Store.data.log }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'treasure-reach-log.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('Clear the reach setup, settings and practice log?')) return;
      const keep = { muted: TR.Store.data.muted, tutorialDone: TR.Store.data.tutorialDone };
      try { localStorage.removeItem(TR.Store.key); } catch (_) { /* ignore */ }
      TR.Store.load();
      Object.assign(TR.Store.data, keep);
      TR.Store.save();
      Menu.close();
      TR.Calib.open(true);
    });

    $('#setAgain').addEventListener('click', () => { TR.SetCard.close(); TR.Game.nudge(true); });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (UI.open.has('#drawer')) Menu.close();
      else if (UI.open.has('#setModal')) TR.SetCard.close();
    });
  };
})();
