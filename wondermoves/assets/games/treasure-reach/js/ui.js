/* ==========================================================================
   Treasure Reach: UI (level picker, menu + grown-up settings, set card, tutorial).
   The camera window itself is the shared WM.CamPanel.
   ========================================================================== */
window.TR = window.TR || {};

(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ---------------- layers ---------------- */
  const UI = TR.UI = {
    open: new Set(),
    tabHidden: false,
    blocking() { return this.open.size > 0 || WM.Tutorial.isOpen() || TR.Calib.active || this.tabHidden; },
  };
  const openLayer = sel => { $(sel).classList.add('open'); UI.open.add(sel); };
  const closeLayer = sel => { $(sel).classList.remove('open'); UI.open.delete(sel); };

  /** Current difficulty, with the reach goal capped within comfort. */
  TR.level = function () {
    const d = TR.DIFFICULTIES.find(x => x.id === TR.Store.s.difficulty) || TR.DIFFICULTIES[0];
    return Object.assign({}, d, { goalPct: Math.min(TR.MAX_GOAL_PCT, d.goalPct) });
  };

  UI.updateLevelChip = function () {
    const d = TR.level();
    const chip = $('#levelChip');
    chip.className = `wm-level-chip lv-${d.lv}`;
    chip.innerHTML = `<span class="wm-emoji">${d.emoji}</span><span class="lc-name">${d.name}</span><span class="caret">▾</span>`;
  };

  /* ---------------- treasure collection ---------------- */
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const art = t => t.image ? `<img src="${t.image}" alt="">` : `<span class="wm-emoji">${t.emoji}</span>`;
  const Collection = TR.Collection = {
    open() { this.render(); this.hideDetail(); openLayer('#collectionModal'); },
    close() { closeLayer('#collectionModal'); },
    render() {
      const got = TR.Store.data.totals.treasures;
      const n = TR.TREASURES.filter(t => got[t.id]).length;
      $('#colCount').textContent = `${n} / ${TR.TREASURES.length}`;
      $('#colBar').style.width = (n / TR.TREASURES.length) * 100 + '%';
      $('#colGrid').innerHTML = TR.TREASURES.map(t => {
        const r = TR.rarityById(t.rarity), c = got[t.id] || 0;
        return `
        <button class="item-card ${c ? 'found' : 'locked'} rar-${r.id}" data-item="${t.id}" style="--rc:${r.color};--rd:${r.deep}">
          <span class="item-rarity">${r.name}</span>
          <span class="item-art ${c ? '' : 'silhouette'}">${art(t)}</span>
          <span class="item-name">${c ? t.name : '???'}</span>
          <span class="item-stars">${stars(r.stars)}</span>
          ${c ? `<span class="item-count">×${c}</span>` : '<span class="item-lock">🔒</span>'}
        </button>`;
      }).join('');
    },
    showDetail(id) {
      const t = TR.TREASURES.find(x => x.id === id);
      if (!t) return;
      const r = TR.rarityById(t.rarity), c = TR.Store.data.totals.treasures[t.id] || 0;
      const levels = TR.levelsFor(t.rarity).map(d => `${d.emoji} ${d.name}`).join(', ');
      const d = $('#colDetail');
      d.style.setProperty('--rc', r.color);
      d.style.setProperty('--rd', r.deep);
      $('#colDetailBody').innerHTML = `
        <div class="detail-art ${c ? '' : 'silhouette'}"><div class="detail-rays"></div>${art(t)}</div>
        <div class="rarity-ribbon">${r.icon} ${r.name}</div>
        <h3>${c ? t.name : 'Mystery Treasure'}</h3>
        <div class="item-stars big">${stars(r.stars)}</div>
        ${c ? `<p class="fact">💡 ${t.fact}</p><p class="meta">Found ${c} time${c > 1 ? 's' : ''}</p>`
            : `<p class="fact">This ${r.name.toLowerCase()} treasure hides in chests on <b>${levels}</b>. Keep reaching to find it!</p>`}`;
      d.classList.add('open');
    },
    hideDetail() { $('#colDetail').classList.remove('open'); },
  };

  /* ---------------- level picker ---------------- */
  UI.openLevels = function () {
    const cur = TR.Store.s.difficulty;
    $('#levelGrid').innerHTML = TR.DIFFICULTIES.map(d => `
      <button class="diff-card ${d.id === cur ? 'active' : ''}" data-diff="${d.id}">
        <span class="diff-emoji wm-emoji">${d.emoji}</span>
        <span class="diff-name">${d.name}</span>
        <span class="diff-blurb">${d.blurb}</span>
        <span class="diff-meta">${TR.Store.data.inputMode === 'sensor' ? `Reach ${(TR.sensorTargetMm() / 10).toFixed(1)} cm` : TR.Store.data.inputMode === 'board' ? `Reach to ${TR.SENSE.openMm / 10} cm` : `Reach ${Math.min(TR.MAX_GOAL_PCT, d.goalPct)}%`} · hold ${(d.holdMs / 1000).toFixed(1)} s</span>
        <span class="diff-loot">Best loot: ${TR.RARITIES[d.weights.reduce((m, w, i) => (w > 0 ? i : m), 0)].icon} ${TR.RARITIES[d.weights.reduce((m, w, i) => (w > 0 ? i : m), 0)].name}</span>
      </button>`).join('');
    openLayer('#levelModal');
  };
  UI.closeLevels = () => closeLayer('#levelModal');

  /* ---------------- menu / settings ---------------- */
  const Menu = TR.Menu = {
    open() { this.render(); openLayer('#drawer'); $('#drawerBackdrop').classList.add('open'); },
    close() { closeLayer('#drawer'); $('#drawerBackdrop').classList.remove('open'); },
    render() {
      const d = TR.Store.data, s = TR.Store.s;
      const cam = d.inputMode === 'camera' || d.inputMode === 'board'; // 'board' = camera + Distance sensor
      $('#inputToggle [data-input="sensor"]').hidden = !TR.hasSensor();
      $$('#inputToggle [data-input]').forEach(b => b.classList.toggle('active', b.dataset.input === (d.inputMode === 'board' ? 'camera' : d.inputMode)));
      $('#recalBtn').hidden = !cam;
      $$('#setToggle [data-set]').forEach(b => b.classList.toggle('active', +b.dataset.set === s.setSize));
      const c = d.calib;
      $('#calibInfo').textContent = c && c.v === 2
        ? `Camera setup saved ${new Date(c.at).toLocaleDateString()}${c.touchMm != null ? ` · sensor at max forward: ${Math.round(c.touchMm)} mm` : ''}.${d.inputMode === 'board' ? ' Playing with the Distance sensor.' : ''}`
        : 'No camera setup yet.';
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
  /* Demo for the tutorial (sensor mode): fakes the sensor so the bar fills while Pip explains.
     The game is paused during the tutorial, so no chest opens and nothing is logged. */
  const Demo = TR.Demo = {
    real: null, mm: null, timer: null,
    start() { if (!this.real) { this.real = TR.sensorMm; TR.sensorMm = () => this.mm; } },
    glide(from, to, ms) {
      this.start(); clearInterval(this.timer);
      const t0 = performance.now();
      this.mm = from;
      this.timer = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        this.mm = from + (to - from) * (0.5 - Math.cos(Math.PI * k) / 2);
        if (k >= 1) clearInterval(this.timer);
      }, 30);
    },
    reach() {   // rest → reach → hold → back, on a loop
      this.glide(150, 40, 1600);
      clearTimeout(this.loop);
      this.loop = setTimeout(() => { this.glide(40, 150, 1200); this.loop = setTimeout(() => this.reach(), 1500); }, 2600);
    },
    stop() {
      clearInterval(this.timer); clearTimeout(this.loop);
      if (this.real) { TR.sensorMm = this.real; this.real = null; }
      this.mm = null;
    },
  };

  TR.tutorialSteps = function () {
    const mode = TR.Store.data.inputMode;
    const sensor = mode === 'sensor', mouse = mode === 'mouse';
    const show = fn => (sensor ? fn : () => Demo.stop());
    return [
      { text: `Hi, I'm ${WM.PIP.name}! Every reach opens a treasure chest. Let me show you how! 💰`,
        target: '#chest', round: true, pad: 4, onShow: () => Demo.stop() },
      { text: sensor ? 'First, rest your arm on the table. Put your hand about a ruler away from the little sensor. 🖐️'
          : mouse ? 'First, put the mouse near the bottom of the screen. 🖱️'
          : 'First, rest both hands on the table in front of the camera. 🙌',
        target: null, onShow: () => Demo.stop() },
      { text: sensor ? 'Now watch! Slide your hand slowly toward the sensor. Slow is great! 🐢'
          : mouse ? 'Now move the blue circle up to the chest. 🔵'
          : 'Now push both hands toward the laptop, nice and slow. 🐢',
        target: '#chest', round: true, pad: 4, onShow: show(() => Demo.reach()) },
      { text: 'This bar fills as you reach. Get to the star ⭐ and hold still for a moment. Then the chest opens!',
        target: '#reachMeter', onShow: show(() => Demo.reach()) },
      { text: 'Then rest your hand again, and a new chest appears. Each treasure goes in your Collection! 📖',
        target: '#collectionBtn', onShow: () => Demo.stop() },
      { text: 'Want to see this again? Tap ? any time. Ready? Let\'s find treasure! 🎉',
        target: '#helpBtn', onShow: () => Demo.stop() },
    ];
  };
  TR.openTutorial = function (then) {
    WM.Tutorial.open(TR.tutorialSteps(), {
      doneLabel: "Let's go! 💰",
      onClose: () => {
        Demo.stop();
        if (!TR.Store.data.tutorialDone) { TR.Store.data.tutorialDone = true; TR.Store.save(); }
        if (then) then(); else TR.Game.nudge(true);
      },
    });
  };

  function updateSoundBtn() {
    const m = WM.Sound.muted;
    $('#soundBtn').textContent = m ? '🔇' : '🔊';
    $('#soundBtn').setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off');
  }

  /* ---------------- wiring ---------------- */
  UI.init = function () {
    updateSoundBtn();
    UI.updateLevelChip();
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

    $('#levelChip').addEventListener('click', () => UI.openLevels());
    $('#collectionBtn').addEventListener('click', () => Collection.open());
    $('#drawerCollection').addEventListener('click', () => { Menu.close(); Collection.open(); });
    $('#colClose').addEventListener('click', () => Collection.close());
    $('#colDetailClose').addEventListener('click', () => Collection.hideDetail());
    $('#colGrid').addEventListener('click', e => { const c = e.target.closest('[data-item]'); if (c) Collection.showDetail(c.dataset.item); });
    $('#levelGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-diff]');
      if (!b) return;
      TR.Store.s.difficulty = b.dataset.diff; TR.Store.save();
      $$('#levelGrid [data-diff]').forEach(x => x.classList.toggle('active', x === b));
    });
    $('#levelGo').addEventListener('click', () => {
      UI.closeLevels();
      UI.updateLevelChip();
      const d = TR.level();
      WM.Buddy.say(`${d.emoji} ${d.name}! Reach to the star and hold for ${(d.holdMs / 1000).toFixed(1)} seconds!`, 3500);
    });

    $('#inputToggle').addEventListener('click', e => {
      const b = e.target.closest('[data-input]');
      if (!b) return;
      Menu.close();
      if (b.dataset.input === 'mouse') TR.Game.useMouse();
      else if (b.dataset.input === 'sensor') TR.Game.useSensor();
      else TR.Calib.open(false);
    });
    $('#recalBtn').addEventListener('click', () => { Menu.close(); TR.Calib.open(true); });
    $('#drawerLevel').addEventListener('click', () => { Menu.close(); UI.openLevels(); });
    $('#drawerHelp').addEventListener('click', () => { Menu.close(); TR.openTutorial(); });

    const seg = (sel, attr, key, cast) => $(sel).addEventListener('click', e => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b) return;
      TR.Store.s[key] = cast(b.dataset[attr]); TR.Store.save();
      Menu.render();
      if (key === 'setSize') TR.Game.renderDots();
    });
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
      UI.updateLevelChip();
      TR.Calib.open(true);
    });

    $('#setAgain').addEventListener('click', () => { TR.SetCard.close(); TR.Game.nudge(true); });
    $('#setLevel').addEventListener('click', () => { TR.SetCard.close(); UI.openLevels(); });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (UI.open.has('#drawer')) Menu.close();
      else if ($('#colDetail').classList.contains('open')) Collection.hideDetail();
      else if (UI.open.has('#collectionModal')) Collection.close();
      else if (UI.open.has('#setModal')) TR.SetCard.close();
    });
  };
})();
