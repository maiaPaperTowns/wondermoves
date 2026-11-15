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
        <span class="diff-meta">${TR.Store.data.inputMode === 'board' ? `Within ${(d.slackMm / 10).toFixed(1).replace('.0', '')} cm of max` : `Reach ${Math.min(TR.MAX_GOAL_PCT, d.goalPct)}%`} · hold ${(d.holdMs / 1000).toFixed(1)} s</span>
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
      const cam = d.inputMode !== 'mouse'; // 'board' = camera + Distance sensor
      $$('#inputToggle [data-input]').forEach(b => b.classList.toggle('active', b.dataset.input === (cam ? 'camera' : 'mouse')));
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
  TR.tutorialSteps = function () {
    const mouse = TR.Store.data.inputMode === 'mouse';
    return [
      { text: `Hi, I'm ${WM.PIP.name}! Let's open some treasure chests together! 💰`, target: null },
      { text: mouse ? 'This chest is locked tight! Move the blue circle up to it to open it. 🖱️' : 'This chest is locked tight! Keep both hands on the table and push them toward the laptop to open it. 🙌', target: '#chest', round: true, pad: 4 },
      { text: mouse ? 'The blue circle is your hand. Bring it all the way to the chest! 🔵' : 'Your hands are the glowing circles: red for your left hand, blue for your right. They slide toward the chest as you reach. Push with both hands together! 🔴🔵', target: null },
      { text: 'This bar fills up as you reach. Fill it to the star and hold it for a moment! ⭐', target: '#reachMeter' },
      { text: 'Tap here to pick Easy, Medium or Hard. Harder means a bigger reach and a longer hold! 🐢🦀🦈', target: '#levelChip', pad: 8 },
      { text: 'Then bring your hands back to rest, and a new chest appears. 🔁', target: '#setDots', pad: 12 },
      { text: 'Every treasure goes into your Collection. Harder levels hide rarer treasures! 📖', target: '#collectionBtn' },
      ...(mouse ? [] : [{ text: 'This is my camera window. Tap the eye to hide it or show it. 📷', target: '#wmCam' }]),
      { text: 'Grown-ups can redo the reach setup and change settings in the Menu. ⚙️', target: '#menuBtn' },
      { text: 'Need help? Tap ? and I\'ll come right back. Let\'s find treasure! 🎉', target: '#helpBtn' },
    ];
  };
  TR.openTutorial = function (then) {
    WM.Tutorial.open(TR.tutorialSteps(), {
      doneLabel: "Let's go! 💰",
      onClose: () => {
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
