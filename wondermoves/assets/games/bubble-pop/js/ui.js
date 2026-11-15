/* ==========================================================================
   Bubble Pop: UI (menu + grown-up settings, start card, results card, tutorial).
   ========================================================================== */
window.BP = window.BP || {};

(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const UI = BP.UI = {
    open: new Set(),
    tabHidden: false,
    /** Anything covering the game that should pause the session timer. */
    blocking() { return this.open.size > 0 || WM.Tutorial.isOpen() || BP.Calib.active || this.tabHidden; },
  };
  const openLayer = sel => { $(sel).classList.add('open'); UI.open.add(sel); };
  const closeLayer = sel => { $(sel).classList.remove('open'); UI.open.delete(sel); };

  UI.updateLevelChip = function () {
    const d = BP.DIFFICULTIES.find(x => x.id === BP.Store.s.difficulty) || BP.DIFFICULTIES[0];
    const chip = $('#levelChip');
    chip.className = `wm-level-chip lv-${d.lv}`;
    chip.innerHTML = `<span class="wm-emoji">${d.emoji}</span><span class="lc-name">${d.name}</span><span class="caret">▾</span>`;
  };

  /* ---------------- start card ---------------- */
  UI.openStart = function () {
    const midRound = BP.Game.state === 'playing' || BP.Game.state === 'countdown';
    $('#startResume').hidden = !midRound;
    const cur = BP.Store.s.difficulty;
    $('#diffGrid').innerHTML = BP.DIFFICULTIES.map(d => `
      <button class="diff-card ${d.id === cur ? 'active' : ''}" data-diff="${d.id}">
        <span class="diff-emoji wm-emoji">${d.emoji}</span>
        <span class="diff-name">${d.name}</span>
        <span class="diff-blurb">${d.blurb}</span>
        <span class="diff-best">Best: ${BP.Store.data.best[d.id] || 0}</span>
      </button>`).join('');
    $('#startGo').textContent = midRound ? `🫧 Start a new round (${BP.Store.s.seconds} s)` : `🫧 Start! (${BP.Store.s.seconds} s)`;
    openLayer('#startModal');
  };
  UI.closeStart = () => closeLayer('#startModal');

  /* ---------------- results card ---------------- */
  UI.openResults = function (r) {
    $('#resScore').textContent = r.score;
    $('#resBest').hidden = !r.newBest;
    $('#resPopped').textContent = r.popped;
    $('#resMissed').textContent = r.missed;
    $('#resDiff').textContent = `${r.diff.emoji} ${r.diff.name}`;
    const tot = Math.max(1, r.left + r.right);
    $('#resLeftBar').style.width = (r.left / tot) * 100 + '%';
    $('#resRightBar').style.width = (r.right / tot) * 100 + '%';
    $('#resLeft').textContent = r.left;
    $('#resRight').textContent = r.right;
    $('#resHands').hidden = r.mode === 'mouse';
    openLayer('#endModal');
  };
  UI.closeResults = () => closeLayer('#endModal');

  /* ---------------- menu ---------------- */
  const Menu = BP.Menu = {
    open() { this.render(); openLayer('#drawer'); $('#drawerBackdrop').classList.add('open'); },
    close() { closeLayer('#drawer'); $('#drawerBackdrop').classList.remove('open'); },
    render() {
      const d = BP.Store.data, s = BP.Store.s;
      $$('#inputToggle [data-input]').forEach(b => b.classList.toggle('active', b.dataset.input === d.inputMode));
      $$('#secToggle [data-sec]').forEach(b => b.classList.toggle('active', +b.dataset.sec === s.seconds));
      $$('#sizeToggle [data-size]').forEach(b => b.classList.toggle('active', b.dataset.size === s.bubbleSize));
      $('#moveOnly').checked = !!s.popWhileMoving;
      const log = d.log;
      if (log.length) {
        const last = log.slice(-5);
        const avg = Math.round(last.reduce((a, r) => a + r.score, 0) / last.length);
        const L = last.reduce((a, r) => a + r.left, 0), R = last.reduce((a, r) => a + r.right, 0);
        $('#logInfo').textContent = `${log.length} sessions · last 5: avg score ${avg}, pops left ${L} / right ${R}`;
      } else $('#logInfo').textContent = 'No sessions yet.';
      $('#rangeInfo').textContent = d.range
        ? `Comfy area set ${new Date(d.range.at).toLocaleDateString()} (${Math.round((d.range.x1 - d.range.x0) * 100)}% × ${Math.round((d.range.y1 - d.range.y0) * 100)}% of the camera view)`
        : 'No comfy area set yet.';
    },
  };

  /* ---------------- tutorial ---------------- */
  BP.tutorialSteps = function () {
    const mouse = BP.Store.data.inputMode === 'mouse';
    return [
      { text: `Hi, I'm ${WM.PIP.name}! Welcome under the sea! Let's pop some bubbles! 🫧`, target: null },
      { text: mouse ? 'Bubbles float up from the sea floor. Move the blue circle onto a bubble to pop it! 🔵' : 'Bubbles float up from the sea floor. Move a glowing hand circle onto a bubble to pop it: red for your left hand, blue for your right! 🔴🔵', target: null },
      { text: 'This air tank shows how much time is left. Pop as many as you can before it runs out! ⏱️', target: '#tank' },
      { text: 'Your score goes up here. Fishy bubbles are worth 2, and star bubbles are worth 3! 🐠⭐', target: '#scorePill', pad: 8 },
      ...(mouse ? [] : [{ text: 'This is my camera window. Tap the eye to hide it or show it. 📷', target: '#wmCam' }]),
      { text: 'Grown-ups can change the game time, bubble size and more in the Menu. ⚙️', target: '#menuBtn' },
      { text: 'Need help? Tap ? and I\'ll come right back. Let\'s dive in! 🌊', target: '#helpBtn' },
    ];
  };
  BP.openTutorial = function () {
    WM.Tutorial.open(BP.tutorialSteps(), {
      doneLabel: "Let's dive in! 🫧",
      onClose: () => {
        if (!BP.Store.data.tutorialDone) { BP.Store.data.tutorialDone = true; BP.Store.save(); }
        if (BP.Game.state === 'ready' && !UI.open.has('#startModal')) UI.openStart();
      },
    });
  };

  function updateSoundBtn() {
    $('#soundBtn').textContent = WM.Sound.muted ? '🔇' : '🔊';
    $('#soundBtn').setAttribute('aria-label', WM.Sound.muted ? 'Turn sound on' : 'Turn sound off');
  }

  /* ---------------- wiring ---------------- */
  UI.init = function () {
    updateSoundBtn();
    UI.updateLevelChip();
    document.addEventListener('click', e => { if (e.target.closest('button') && !e.target.closest('[data-cal],[data-act]')) WM.Sound.click(); });

    $('#menuBtn').addEventListener('click', () => Menu.open());
    $('#drawerClose').addEventListener('click', () => Menu.close());
    $('#drawerBackdrop').addEventListener('click', () => Menu.close());
    $('#helpBtn').addEventListener('click', () => BP.openTutorial());
    $('#soundBtn').addEventListener('click', () => {
      WM.Sound.ensure();
      WM.Sound.setMuted(!WM.Sound.muted);
      BP.Store.data.muted = WM.Sound.muted; BP.Store.save();
      updateSoundBtn();
    });

    $('#diffGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-diff]');
      if (!b) return;
      BP.Store.s.difficulty = b.dataset.diff; BP.Store.save();
      $$('#diffGrid [data-diff]').forEach(x => x.classList.toggle('active', x === b));
      UI.updateLevelChip();
    });
    $('#startGo').addEventListener('click', () => { UI.closeStart(); BP.Game.begin(); });
    $('#startResume').addEventListener('click', () => UI.closeStart());
    $('#levelChip').addEventListener('click', () => { if (!BP.Calib.active) UI.openStart(); });
    $('#resAgain').addEventListener('click', () => { UI.closeResults(); BP.Game.begin(); });
    $('#resChange').addEventListener('click', () => { UI.closeResults(); UI.openStart(); });

    $('#inputToggle').addEventListener('click', e => {
      const b = e.target.closest('[data-input]');
      if (!b) return;
      Menu.close();
      BP.Game.stopSession();
      if (b.dataset.input === 'mouse') BP.Game.useMouse();
      else { UI.closeStart(); BP.Calib.open(); }
    });
    $('#recalBtn').addEventListener('click', () => { Menu.close(); BP.Game.stopSession(); UI.closeStart(); BP.Calib.open(); });
    $('#drawerHelp').addEventListener('click', () => { Menu.close(); BP.openTutorial(); });
    $('#newGameBtn').addEventListener('click', () => { Menu.close(); BP.Game.stopSession(); UI.openStart(); });

    const seg = (sel, attr, key, cast) => $(sel).addEventListener('click', e => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b) return;
      BP.Store.s[key] = cast(b.dataset[attr]); BP.Store.save();
      Menu.render();
    });
    seg('#secToggle', 'sec', 'seconds', Number);
    seg('#sizeToggle', 'size', 'bubbleSize', String);
    $('#moveOnly').addEventListener('change', e => { BP.Store.s.popWhileMoving = e.target.checked; BP.Store.save(); });

    $('#exportLog').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ range: BP.Store.data.range, settings: BP.Store.s, sessions: BP.Store.data.log }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bubble-pop-log.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('Clear the camera setup, best scores, settings and practice log?')) return;
      const keep = { muted: BP.Store.data.muted, tutorialDone: BP.Store.data.tutorialDone };
      try { localStorage.removeItem(BP.Store.key); } catch (_) { /* ignore */ }
      BP.Store.load();
      Object.assign(BP.Store.data, keep);
      BP.Store.save();
      Menu.close();
      BP.Game.stopSession();
      BP.Calib.open();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && UI.open.has('#drawer')) Menu.close();
    });
  };
})();
