/* ==========================================================================
   WonderMoves shell: hosts each game in an iframe, with tabs at the bottom.
   --------------------------------------------------------------------------
   Games are standalone pages. The shell talks to them with postMessage:
     shell → game  { source: 'wondermoves', type: 'visibility', visible: bool }
     game  → shell { source: 'wondermoves', type: 'ready' | ..., ... }
   See shared/wm-bridge.js for the game-side helper.
   ========================================================================== */
(function () {
  const GAMES = [
    // Treasure Reach first: it uses the Distance sensor on the game board.
    { id: 'treasure-reach', name: 'Treasure Reach', icon: '💰', color: '#22B4A3', deep: '#157F73', src: 'games/treasure-reach/index.html',
      move: 'Reach forward', how: 'Reach out and hold to open the treasure chest.', log: 'reach', word: 'reaches' },
    { id: 'fossil-brush',   name: 'Fossil Brush',   icon: '🦴', color: '#FF8A3D', deep: '#D9621A', src: 'games/fossil-brush/index.html',
      move: 'Brush the sand away', how: 'Copy Pip\'s brush strokes to dig up a fossil.', log: 'brush', word: 'strokes' },
    // Bubble Pop: the timed game (lift mode is always off, see BP.DEFAULTS in games/bubble-pop/js/data.js).
    { id: 'bubble-pop',     name: 'Bubble Pop',     icon: '🫧', color: '#5BA8F8', deep: '#2C74C9', src: 'games/bubble-pop/index.html',
      move: 'Lift your hand', how: 'Move your hand onto the bubbles to pop them.', log: 'bubbles', word: 'bubbles' },
  ];
  const HOME = { id: 'home', name: 'Home', icon: '🏠', color: '#FFD34D', deep: '#D9A400' };
  const TABS = [HOME, ...GAMES];
  const STORE_KEY = 'wondermoves.shell.v1';

  const stage = document.getElementById('stage');
  const tabsEl = document.getElementById('tabs');
  const frames = {};
  let current = null;

  /* ---------- tabs ---------- */
  tabsEl.innerHTML = TABS.map(g => `
    <button class="tab" role="tab" id="tab-${g.id}" data-game="${g.id}" aria-selected="false"
      aria-controls="frame-${g.id}" tabindex="-1" style="--c:${g.color};--cd:${g.deep}">
      <span class="tab-icon" aria-hidden="true">${g.icon}</span>
      <span class="tab-name">${g.name}</span>
    </button>`).join('');

  tabsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-game]');
    if (b) activate(b.dataset.game);
  });
  tabsEl.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex(g => g.id === current);
    let n = i;
    if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = TABS.length - 1;
    activate(TABS[n].id, { focusTab: true });
  });

  /* ---------- frames (created lazily, then kept alive so games keep their state) ---------- */
  function ensureFrame(game) {
    if (frames[game.id]) return frames[game.id];
    const wrap = document.createElement('section');
    wrap.className = 'game-frame';
    wrap.id = 'frame-' + game.id;
    wrap.setAttribute('role', 'tabpanel');
    wrap.setAttribute('aria-labelledby', 'tab-' + game.id);
    wrap.style.setProperty('--c', game.color);
    wrap.innerHTML = `
      <div class="loading"><span class="loading-icon">${game.icon}</span><span>Loading ${game.name}…</span></div>
      <iframe title="${game.name}" src="${game.src}" allow="camera; microphone; autoplay; fullscreen"></iframe>`;
    const iframe = wrap.querySelector('iframe');
    iframe.addEventListener('load', () => {
      wrap.classList.add('loaded');
      post(game.id, { type: 'visibility', visible: game.id === current });
    });
    stage.appendChild(wrap);
    frames[game.id] = wrap;
    return wrap;
  }

  function post(id, msg) {
    const f = frames[id] && frames[id].querySelector('iframe');
    if (f && f.contentWindow) f.contentWindow.postMessage(Object.assign({ source: 'wondermoves' }, msg), '*');
  }

  const home = document.getElementById('home');

  function activate(id, opts = {}) {
    const game = TABS.find(g => g.id === id) || HOME;
    if (game.id === current) return;
    current = game.id;
    const isHome = game === HOME;
    const wrap = isHome ? null : ensureFrame(game);

    home.classList.toggle('active', isHome);
    home.setAttribute('aria-hidden', String(!isHome));
    Object.entries(frames).forEach(([fid, el]) => {
      const on = fid === game.id;
      el.classList.toggle('active', on);
      el.setAttribute('aria-hidden', String(!on));
      post(fid, { type: 'visibility', visible: on });
    });
    TABS.forEach(g => {
      const t = document.getElementById('tab-' + g.id);
      const on = g.id === game.id;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    document.documentElement.style.setProperty('--active', game.color);
    document.title = isHome ? 'WonderMoves' : `${game.name} · WonderMoves`;

    try { localStorage.setItem(STORE_KEY, JSON.stringify({ last: game.id })); } catch (_) { /* ignore */ }
    if (location.hash !== '#' + game.id) history.replaceState(null, '', '#' + game.id);
    // Tells add-ons (e.g. the AI voice agent) which screen the child is on.
    window.dispatchEvent(new CustomEvent('wm:screen', { detail: { screen: game.id, name: game.name } }));
    if (isHome) loadToday();

    if (opts.focusTab) document.getElementById('tab-' + game.id).focus();
    else if (wrap && wrap.classList.contains('loaded')) wrap.querySelector('iframe').focus();
  }

  /* ---------- home ---------- */
  document.getElementById('homeGames').innerHTML = GAMES.map(g => `
    <button class="game-card" data-game="${g.id}" style="--c:${g.color};--cd:${g.deep}">
      <span class="game-card-art" aria-hidden="true"><img src="shared/assets/covers/${g.id}.jpg" alt="" loading="lazy"
        onerror="this.replaceWith(Object.assign(document.createElement('span'), { textContent: '${g.icon}' }))"></span>
      <span class="game-card-text">
        <span class="game-card-name">${g.name}</span>
        <span class="game-card-move">${g.move}</span>
        <span class="game-card-how">${g.how}</span>
      </span>
      <span class="game-card-count" id="count-${g.id}" hidden></span>
      <span class="game-card-play">Play <span aria-hidden="true">▶</span></span>
    </button>`).join('');
  document.getElementById('homeGames').addEventListener('click', e => {
    const b = e.target.closest('[data-game]');
    if (b) activate(b.dataset.game);
  });

  // Today's moves, from the board's play log (the same data the grown-ups page uses).
  async function loadToday() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) return;
      const st = await r.json();
      const nick = st.profile && st.profile.child && st.profile.child.nickname;
      document.getElementById('homeTitle').textContent = nick ? `Hi, ${nick}! Pick a game.` : 'Hi, explorer! Pick a game.';
      // For add-ons such as the voice agent: the grown-up-entered profile (nickname, age, language, interests, needs).
      window.WM_CHILD = (st.profile && st.profile.child) || null;
      const off = Date.now() / 1000 - st.now;               // the board clock can be wrong
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const today = st.sessions.filter(s => (s.start_t + off) * 1000 >= midnight.getTime());
      let total = 0;
      GAMES.forEach(g => {
        const n = today.filter(s => s.game === g.log).reduce((a, s) => a + s.movements, 0);
        total += n;
        const el = document.getElementById('count-' + g.id);
        el.hidden = !n;
        el.textContent = `⭐ ${n} ${g.word} today`;
      });
      document.getElementById('homeToday').textContent = total
        ? `You've made ${total} moves today. Every move counts!`
        : 'Every move you make helps Pip find treasure.';
    } catch (_) { /* no board: keep the friendly default */ }
  }

  /* ---------- messages from games ---------- */
  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.source !== 'wondermoves') return;
    // Future: input status from the camera panel, cross-game rewards, etc.
    if (m.type === 'switch' && m.game) activate(m.game);
  });

  /* ---------- start ---------- */
  // Start in Treasure Reach, the first game (it uses the Distance sensor), unless the URL names
  // another screen (e.g. index.html#home or #bubble-pop). Home is one tap away in the tab bar.
  const first = location.hash.slice(1);
  activate(TABS.some(g => g.id === first) ? first : GAMES[0].id);
  loadToday();   // the hello, today's counts and WM_CHILD (for the voice agent), even when starting in a game
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
})();
