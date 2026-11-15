/* ==========================================================================
   UI — depth meter, mascot buddy, menu drawer, catalog, found card, tutorial
   ========================================================================== */
window.FB = window.FB || {};

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Item artwork: real image if provided, otherwise the placeholder emoji. */
  FB.art = (item, cls = '') => item.image
    ? `<img class="art ${cls}" src="${esc(item.image)}" alt="" draggable="false">`
    : `<span class="art emoji ${cls}" aria-hidden="true">${item.emoji}</span>`;

  const starStr = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  /* ---------------- layer bookkeeping ---------------- */
  const UI = FB.UI = {
    open: new Set(),
    blocking() { return this.open.size > 0 || !!(FB.Cam && FB.Cam.active); },
  };
  function openLayer(sel) { $(sel).classList.add('open'); $(sel).setAttribute('aria-hidden', 'false'); UI.open.add(sel); }
  function closeLayer(sel) { $(sel).classList.remove('open'); $(sel).setAttribute('aria-hidden', 'true'); UI.open.delete(sel); }

  /* ---------------- Depth meter ---------------- */
  const Meter = FB.Meter = {
    init() {
      const R = FB.RARITIES;
      $('#meterLabels').innerHTML = R.map((r, i) => `
        <div class="meter-label" data-i="${i}" style="--rc:${r.color};--rd:${r.deep}">
          <span class="ic">${r.icon}</span><span class="nm">${r.name}</span>
        </div>`).join('');
      $('#meterZones').innerHTML = R.map(r => `<div class="meter-zone" style="--rc:${r.color}"></div>`).join('');
      this.cover = $('#meterCover');
      this.marker = $('#meterMarker');
      this.val = $('#meterVal');
      this.pinEl = $('#meterPin');
      this.labels = $$('.meter-label');
      this.last = -1;
    },
    set(d) {
      const v = Math.max(0, Math.min(FB.MAX_DEPTH, d));
      const pct = (v / FB.MAX_DEPTH) * 100;
      this.cover.style.top = pct + '%';
      this.marker.style.top = pct + '%';
      const r = Math.round(v);
      if (r !== this.last) {
        this.last = r;
        this.val.textContent = r + ' m';
        this.labels.forEach((l, i) => l.classList.toggle('reached', i === 0 || v > FB.RARITIES[i].min));
      }
    },
    flashZone(i) {
      const l = this.labels[i];
      l.classList.remove('flash'); void l.offsetWidth; l.classList.add('flash');
    },
    pin(item, d) {
      this.pinEl.innerHTML = FB.art(item);
      this.pinEl.style.top = (d / FB.MAX_DEPTH) * 100 + '%';
      this.pinEl.classList.add('show');
    },
    reset() {
      this.pinEl.classList.remove('show');
      this.last = -1;
      this.set(0);
    },
  };

  /* ---------------- Mascot buddy (bottom-left) ---------------- */
  const Buddy = FB.Buddy = {
    timer: null,
    say(text, ms = 3400) {
      const b = $('#buddy');
      $('#buddyBubble').textContent = String(text).replace(/\s+(\S+)\s*$/, '\u00A0$1'); // keep a trailing emoji with its word
      b.classList.remove('talk'); void b.offsetWidth;
      b.classList.add('show', 'talk');
      clearTimeout(this.timer);
      if (ms > 0) this.timer = setTimeout(() => b.classList.remove('show'), ms); // ms = 0: stay until the next line
    },
    hide() { clearTimeout(this.timer); $('#buddy').classList.remove('show'); },
  };

  /* ---------------- Theme / scenery ---------------- */
  UI.applyTheme = function (lv) {
    const root = document.documentElement.style;
    const th = lv.theme;
    root.setProperty('--sky-top', th.skyTop);
    root.setProperty('--sky-bottom', th.skyBottom);
    root.setProperty('--sun', th.sun);
    root.setProperty('--far', th.far);
    root.setProperty('--mid', th.mid);
    root.setProperty('--ground', th.ground);
    const scene = $('#scene');
    scene.classList.toggle('has-bg', !!lv.background);
    scene.style.backgroundImage = lv.background ? `url("${lv.background}")` : '';
    scene.dataset.level = lv.id;
    $('#decor').innerHTML = (lv.background ? [] : lv.decor).map((d, i) =>
      `<span style="left:${d.x}%;${d.b != null ? `bottom:${d.b}%` : `top:${d.y}%`};font-size:${d.s}vmin;animation-delay:${-i * 1.3}s">${d.e}</span>`).join('');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = th.skyTop;
  };

  UI.updateLevelPill = function (lv) {
    $('#levelPill').innerHTML = `
      <span class="lp-emoji">${lv.emoji}</span>
      <span class="lp-name">${esc(lv.name)}</span>
      <button class="wm-level-chip lv-${lv.diffLevel}" id="levelChip" aria-label="Change dig site"><span>${lv.difficulty}</span><span class="caret">▾</span></button>
      <span class="mode-chip">${FB.Game && FB.Game.mode === 'free' ? '🖌️ Free Play' : '✏️ Copy Pip'}</span>`;
  };

  /* ---------------- Menu drawer ---------------- */
  const Menu = FB.Menu = {
    render() {
      const cur = FB.Game.level && FB.Game.level.id;
      $('#levelList').innerHTML = FB.LEVELS.map(lv => {
        const found = lv.items.filter(i => FB.Store.isFound(i.id)).length;
        const pct = (found / lv.items.length) * 100;
        return `
        <button class="level-card ${lv.id === cur ? 'active' : ''}" data-level="${lv.id}"
          style="--a:${lv.theme.skyTop};--b:${lv.theme.ground};--c:${lv.theme.far}">
          <span class="level-art"><span>${lv.emoji}</span></span>
          <span class="level-info">
            <span class="level-top">
              <span class="level-name">${esc(lv.name)}</span>
              <span class="diff-chip diff-${lv.diffLevel}">${lv.difficulty}</span>
            </span>
            <span class="level-blurb">${esc(lv.blurb)}</span>
            <span class="bar"><i style="width:${pct}%"></i></span>
            <span class="level-count">${found} / ${lv.items.length} treasures found ${found === lv.items.length ? '🏆' : ''}</span>
          </span>
          ${lv.id === cur ? '<span class="here-tag">You are here</span>' : ''}
        </button>`;
      }).join('');
    },
    renderSettings() {
      const mode = FB.Game.mode;
      $$('#modeToggle [data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      $('#modeHint').textContent = mode === 'trace'
        ? 'Copy the shapes Pip draws to dig. Rarer treasures need more shapes!'
        : 'Brush the sand any way you like.';
      $$('#tolToggle [data-tol]').forEach(b => b.classList.toggle('active', b.dataset.tol === FB.Store.data.tolerance));
      $$('#inputToggle [data-input]').forEach(b => b.classList.toggle('active', b.dataset.input === (FB.Store.data.input || 'touch')));
      $('#camRecal').hidden = FB.Store.data.input !== 'camera';
      const log = FB.Store.data.traceLog;
      if (log.length) {
        const recent = log.slice(-20);
        const acc = Math.round(recent.reduce((a, r) => a + r.accuracy, 0) / recent.length * 100);
        $('#practiceStats').textContent = `${log.length} shapes traced so far · recent accuracy ${acc}%`;
      } else {
        $('#practiceStats').textContent = 'No shapes traced yet.';
      }
    },
    open() { this.render(); this.renderSettings(); openLayer('#drawer'); $('#drawerBackdrop').classList.add('open'); },
    close() { closeLayer('#drawer'); $('#drawerBackdrop').classList.remove('open'); },
  };

  /* ---------------- Catalog ---------------- */
  const Catalog = FB.Catalog = {
    tab: null,
    open(levelId) {
      this.tab = levelId || (FB.Game.level && FB.Game.level.id) || FB.LEVELS[0].id;
      this.render();
      this.hideDetail();
      openLayer('#catalogModal');
    },
    close() { closeLayer('#catalogModal'); },
    render() {
      const all = FB.allItems();
      const foundAll = all.filter(i => FB.Store.isFound(i.id)).length;
      $('#catCount').textContent = `${foundAll} / ${all.length}`;
      $('#catBar').style.width = (foundAll / all.length) * 100 + '%';

      $('#catTabs').innerHTML = FB.LEVELS.map(lv => {
        const f = lv.items.filter(i => FB.Store.isFound(i.id)).length;
        return `<button class="tab ${lv.id === this.tab ? 'active' : ''}" data-tab="${lv.id}" role="tab"
          aria-selected="${lv.id === this.tab}">
          <span class="tab-emoji">${lv.emoji}</span><span class="tab-name">${esc(lv.name)}</span>
          <em>${f}/${lv.items.length}</em></button>`;
      }).join('');

      const lv = FB.levelById(this.tab);
      const items = [...lv.items].sort((a, b) => FB.rarityIndex(a.rarity) - FB.rarityIndex(b.rarity));
      $('#catGrid').innerHTML = items.map(item => {
        const r = FB.rarityById(item.rarity);
        const rec = FB.Store.record(item.id);
        const found = !!(rec && rec.count);
        return `
        <button class="item-card ${found ? 'found' : 'locked'} rar-${r.id}" data-item="${item.id}" style="--rc:${r.color};--rd:${r.deep}">
          <span class="item-rarity">${r.name}</span>
          <span class="item-art ${found ? '' : 'silhouette'}">${FB.art(item)}</span>
          <span class="item-name">${found ? esc(item.name) : '???'}</span>
          <span class="item-stars">${starStr(r.stars)}</span>
          ${found ? `<span class="item-count">×${rec.count}</span>` : '<span class="item-lock">🔒</span>'}
        </button>`;
      }).join('');
    },
    showDetail(id) {
      const item = FB.allItems().find(i => i.id === id);
      if (!item) return;
      const r = FB.rarityById(item.rarity);
      const lv = FB.LEVELS.find(l => l.items.includes(item));
      const rec = FB.Store.record(item.id);
      const found = !!(rec && rec.count);
      const d = $('#catDetail');
      d.style.setProperty('--rc', r.color);
      d.style.setProperty('--rd', r.deep);
      $('#catDetailBody').innerHTML = `
        <div class="detail-art ${found ? '' : 'silhouette'}"><div class="detail-rays"></div>${FB.art(item)}</div>
        <div class="rarity-ribbon">${r.icon} ${r.name}</div>
        <h3>${found ? esc(item.name) : 'Mystery Treasure'}</h3>
        <div class="stars big">${starStr(r.stars)}</div>
        ${found
          ? `<p class="fact">💡 ${esc(item.fact)}</p>
             <p class="meta">Found ${rec.count} time${rec.count > 1 ? 's' : ''} · deepest at ${rec.best} m</p>`
          : `<p class="fact">This ${r.name.toLowerCase()} treasure is hiding at <b>${esc(lv.name)}</b>,
             between <b>${r.min}–${r.max} m</b> deep. Keep digging to find it!</p>`}
      `;
      d.classList.add('open');
    },
    hideDetail() { $('#catDetail').classList.remove('open'); },
  };

  /* ---------------- Found card ---------------- */
  const Found = FB.Found = {
    show(item, depth, isNew, extra) {
      const r = FB.rarityById(item.rarity);
      const panel = $('#foundModal .found-panel');
      panel.style.setProperty('--rc', r.color);
      panel.style.setProperty('--rd', r.deep);
      panel.dataset.rarity = r.id;
      $('#foundArt').innerHTML = FB.art(item);
      $('#foundNew').hidden = !isNew;
      $('#foundRarity').textContent = `${r.icon} ${r.name}`;
      $('#foundName').textContent = item.name;
      $('#foundStars').textContent = starStr(r.stars);
      $('#foundDepth').textContent = `Found ${Math.round(depth)} m deep!`;
      $('#foundFact').textContent = item.fact;
      $('#foundTrace').hidden = !extra;
      if (extra) {
        $('#foundTrace').innerHTML = `✏️ ${extra.shapes} shape${extra.shapes === 1 ? '' : 's'} traced · <span class="trace-stars">${'★'.repeat(extra.stars)}${'☆'.repeat(3 - extra.stars)}</span> ${extra.msg}`;
      }
      openLayer('#foundModal');
      setTimeout(() => $('#foundAgain').focus(), 300);
    },
    close() { closeLayer('#foundModal'); },
  };

  /* ---------------- Tutorial ---------------- */
  const Tutorial = FB.Tutorial = {
    i: 0,
    typing: null,
    FREE_STEPS: [
      { text: `Hi there, explorer! I'm ${FB.MASCOT.name} the Dig-Dino! Let's dig up some amazing treasures together! 🦕`, target: null },
      { text: 'See that big pile of sand? Press and drag on it to brush the sand away. Swish, swish! 🖌️', target: '#digArea', round: true, hand: true },
      { text: 'This is the Depth Meter. The deeper you dig, the rarer the treasure! Common… Rare… Epic… maybe even LEGENDARY! 🌟', target: '#depthMeter' },
      { text: 'Tap the Menu to visit new dig sites. Harder sites hide rarer treasures! 🗺️', target: '#menuBtn' },
      { text: 'Every treasure you find goes into your Collection book. Peek inside to see what\'s still hiding! 📖', target: '#catalogBtn' },
      { text: 'Need help? Tap the ? button and I\'ll come right back. Happy digging! 🎉', target: '#helpBtn' },
    ],
    TRACE_STEPS: [
      { text: `Hi there, explorer! I'm ${FB.MASCOT.name} the Dig-Dino! Let's dig up some amazing treasures together! 🦕`, target: null },
      { text: 'I\'ll draw a shape on the sand pile with my brush. Watch closely! 👀', target: '#digArea', round: true },
      { text: 'Then it\'s your turn! Put your finger on the glowing dot and follow the path. Wobbly is OK! ✏️', target: '#digArea', round: true, hand: true },
      { text: 'These show how many shapes are left. Tap "Show me" if you want me to draw it again! 👀', target: '#traceHud' },
      { text: 'Every shape digs deeper. Rare treasures are buried deep, so they need more shapes to reach! 🌟', target: '#depthMeter' },
      { text: 'Tap the Menu to visit new dig sites, or switch to Free Play brushing. 🗺️', target: '#menuBtn' },
      { text: 'Every treasure you find goes into your Collection book. Can you find them all? 📖', target: '#catalogBtn' },
      { text: 'Need help? Tap the ? button and I\'ll come right back. Happy digging! 🎉', target: '#helpBtn' },
    ],
    steps: [],
    open() {
      this.steps = FB.Game && FB.Game.mode === 'free' ? this.FREE_STEPS : this.TRACE_STEPS;
      if (this.steps === this.TRACE_STEPS) {
        document.body.classList.add('show-hud');
        if (!FB.Trace.active) FB.Trace.renderSample();
      }
      this.i = 0;
      Buddy.hide();
      document.body.classList.add('tut-open');
      openLayer('#tutorial');
      $('#tutDots').innerHTML = this.steps.map(() => '<i></i>').join('');
      this.render();
    },
    close() {
      clearInterval(this.typing);
      document.body.classList.remove('tut-open', 'show-hud');
      closeLayer('#tutorial');
      if (!FB.Store.data.tutorialDone) { FB.Store.data.tutorialDone = true; FB.Store.save(); }
      if (FB.Game && FB.Game.state === 'digging' && FB.Game.mode === 'free') Buddy.say('Your turn! Brush the sand! 🖌️');
      else if (FB.Game && FB.Game.state === 'digging') FB.Trace.replay();
    },
    next() {
      if (this.finishTyping()) return;
      if (this.i >= this.steps.length - 1) return this.close();
      this.i++; this.render();
    },
    back() { if (this.i > 0) { this.i--; this.render(); } },
    finishTyping() {
      if (!this.typing) return false;
      clearInterval(this.typing); this.typing = null;
      $('#tutText').textContent = this.steps[this.i].text;
      return true;
    },
    render() {
      const st = this.steps[this.i];
      $$('#tutDots i').forEach((d, k) => d.classList.toggle('on', k === this.i));
      $('#tutBack').style.visibility = this.i === 0 ? 'hidden' : 'visible';
      $('#tutNext').textContent = this.i === this.steps.length - 1 ? "Let's dig! 🖌️" : 'Next ➜';
      $('#tutMascot').classList.remove('hop'); void $('#tutMascot').offsetWidth; $('#tutMascot').classList.add('hop');
      this.place(st);

      // typewriter
      clearInterval(this.typing);
      const el = $('#tutText');
      const chars = [...st.text];
      let n = 0;
      el.textContent = '';
      this.typing = setInterval(() => {
        n += 1;
        el.textContent = chars.slice(0, n).join('');
        if (n >= chars.length) { clearInterval(this.typing); this.typing = null; }
      }, 22);
    },
    place(st) {
      const spot = $('#spotlight');
      const hand = $('#tutHand');
      const box = $('#tutBox');
      if (!st.target) {
        spot.style.cssText = `left:50%;top:45%;width:0;height:0;border-radius:50%`;
        spot.classList.remove('ring');
        hand.classList.remove('show');
        box.classList.remove('top');
        return;
      }
      const r = $(st.target).getBoundingClientRect();
      const pad = st.round ? 0 : 10;
      spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:${st.round ? '50%' : '26px'}`;
      spot.classList.add('ring');
      if (st.hand) {
        hand.style.left = r.left + r.width / 2 + 'px';
        hand.style.top = r.top + r.height / 2 + 'px';
        hand.classList.add('show');
      } else hand.classList.remove('show');
      // keep the dialog away from targets near the bottom of the screen
      box.classList.toggle('top', r.top + r.height > window.innerHeight * 0.72 && !st.round);
    },
    reposition() { if (UI.open.has('#tutorial')) this.place(this.steps[this.i]); },
  };

  /* ---------------- Wiring ---------------- */
  UI.updateSoundBtn = function () {
    const m = FB.Sound.muted;
    $('#soundBtn').innerHTML = `<span aria-hidden="true">${m ? '🔇' : '🔊'}</span>`;
    $('#soundBtn').setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off');
  };

  UI.init = function () {
    Meter.init();
    $('#buddyImg').src = FB.MASCOT.image;
    $('#tutMascot').src = FB.MASCOT.image;
    $('.tut-name').textContent = FB.MASCOT.name;
    $('#buddyImg').alt = FB.MASCOT.name;
    UI.updateSoundBtn();

    document.addEventListener('click', e => {
      if (e.target.closest('button')) FB.Sound.click();
    });

    $('#menuBtn').addEventListener('click', () => Menu.open());
    $('#levelPill').addEventListener('click', e => { if (e.target.closest('#levelChip')) Menu.open(); });
    $('#drawerClose').addEventListener('click', () => Menu.close());
    $('#drawerBackdrop').addEventListener('click', () => Menu.close());
    $('#levelList').addEventListener('click', e => {
      const card = e.target.closest('[data-level]');
      if (!card) return;
      Menu.close();
      FB.Game.setLevel(card.dataset.level);
    });
    $('#newDigBtn').addEventListener('click', () => { Menu.close(); FB.Game.newDig(); });
    $('#drawerHelp').addEventListener('click', () => { Menu.close(); Tutorial.open(); });
    $('#drawerCatalog').addEventListener('click', () => { Menu.close(); Catalog.open(); });
    $('#resetBtn').addEventListener('click', () => {
      if (confirm('Start a brand-new collection? All found treasures will be cleared.')) {
        FB.Store.reset(); Menu.render();
        Buddy.say('Fresh start! Let\'s find them all again! ✨');
      }
    });

    $('#modeToggle').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (!b || b.dataset.mode === FB.Game.mode) return;
      Menu.close();
      FB.Game.setMode(b.dataset.mode);
    });
    $('#tolToggle').addEventListener('click', e => {
      const b = e.target.closest('[data-tol]');
      if (!b) return;
      FB.Store.data.tolerance = b.dataset.tol; FB.Store.save();
      FB.Trace.relayout();
      Menu.renderSettings();
    });
    $('#inputToggle').addEventListener('click', e => {
      const b = e.target.closest('[data-input]');
      if (!b || b.dataset.input === (FB.Store.data.input || 'touch')) return;
      Menu.close();
      if (b.dataset.input === 'camera') FB.Cam.open(); else FB.Cam.off();
    });
    $('#camRecal').addEventListener('click', () => { Menu.close(); FB.Cam.open(); });
    $('#exportLog').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(FB.Store.data.traceLog, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fossil-brush-practice-log.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $('#traceReplay').addEventListener('click', () => FB.Trace.replay());

    $('#catalogBtn').addEventListener('click', () => Catalog.open());
    $('#catClose').addEventListener('click', () => Catalog.close());
    $('#catTabs').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (!t) return;
      Catalog.tab = t.dataset.tab; Catalog.render(); Catalog.hideDetail();
    });
    $('#catGrid').addEventListener('click', e => {
      const c = e.target.closest('[data-item]');
      if (c) Catalog.showDetail(c.dataset.item);
    });
    $('#catDetailClose').addEventListener('click', () => Catalog.hideDetail());

    $('#foundAgain').addEventListener('click', () => { Found.close(); FB.Game.newDig(); });
    $('#foundCatalog').addEventListener('click', () => {
      Found.close();
      Catalog.open(FB.Game.level.id);
      Catalog.showDetail(FB.Game.item.id);
      FB.Game.newDig();
    });

    $('#helpBtn').addEventListener('click', () => Tutorial.open());
    $('#tutNext').addEventListener('click', () => Tutorial.next());
    $('#tutBack').addEventListener('click', () => Tutorial.back());
    $('#tutSkip').addEventListener('click', () => Tutorial.close());
    $('#tutBubble').addEventListener('click', e => { if (!e.target.closest('button')) Tutorial.finishTyping(); });

    $('#soundBtn').addEventListener('click', () => {
      FB.Sound.ensure();
      FB.Sound.setMuted(!FB.Sound.muted);
      FB.Store.data.muted = FB.Sound.muted; FB.Store.save();
      UI.updateSoundBtn();
    });

    // click on the dark backdrop of a modal closes it
    $$('.modal').forEach(m => m.addEventListener('click', e => {
      if (e.target !== m) return;
      if (m.id === 'catalogModal') Catalog.close();
    }));

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (UI.open.has('#tutorial')) Tutorial.close();
      else if ($('#catDetail').classList.contains('open')) Catalog.hideDetail();
      else if (UI.open.has('#catalogModal')) Catalog.close();
      else if (UI.open.has('#drawer')) Menu.close();
    });
  };
})();
