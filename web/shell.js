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
    { id: 'fossil-brush',   name: 'Fossil Brush',   icon: '🦴', color: '#FF8A3D', deep: '#D9621A', src: 'games/fossil-brush/index.html' },
    { id: 'treasure-reach', name: 'Treasure Reach', icon: '💰', color: '#22B4A3', deep: '#157F73', src: 'games/treasure-reach/index.html' },
    { id: 'bubble-pop',     name: 'Bubble Pop',     icon: '🫧', color: '#5BA8F8', deep: '#2C74C9', src: 'games/bubble-pop/index.html' },
  ];
  const STORE_KEY = 'wondermoves.shell.v1';

  const stage = document.getElementById('stage');
  const tabsEl = document.getElementById('tabs');
  const frames = {};
  let current = null;

  /* ---------- tabs ---------- */
  tabsEl.innerHTML = GAMES.map(g => `
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
    const i = GAMES.findIndex(g => g.id === current);
    let n = i;
    if (e.key === 'ArrowLeft') n = (i - 1 + GAMES.length) % GAMES.length;
    if (e.key === 'ArrowRight') n = (i + 1) % GAMES.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = GAMES.length - 1;
    activate(GAMES[n].id, { focusTab: true });
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

  function activate(id, opts = {}) {
    const game = GAMES.find(g => g.id === id) || GAMES[0];
    if (game.id === current) return;
    current = game.id;
    const wrap = ensureFrame(game);

    Object.entries(frames).forEach(([fid, el]) => {
      const on = fid === game.id;
      el.classList.toggle('active', on);
      el.setAttribute('aria-hidden', String(!on));
      post(fid, { type: 'visibility', visible: on });
    });
    GAMES.forEach(g => {
      const t = document.getElementById('tab-' + g.id);
      const on = g.id === game.id;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    document.documentElement.style.setProperty('--active', game.color);
    document.title = `${game.name} · WonderMoves`;

    try { localStorage.setItem(STORE_KEY, JSON.stringify({ last: game.id })); } catch (_) { /* ignore */ }
    if (location.hash !== '#' + game.id) history.replaceState(null, '', '#' + game.id);

    if (opts.focusTab) document.getElementById('tab-' + game.id).focus();
    else if (wrap.classList.contains('loaded')) wrap.querySelector('iframe').focus();
  }

  /* ---------- messages from games ---------- */
  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.source !== 'wondermoves') return;
    // Future: input status from the camera panel, cross-game rewards, etc.
    if (m.type === 'switch' && m.game) activate(m.game);
  });

  /* ---------- start ---------- */
  let first = location.hash.slice(1);
  if (!GAMES.some(g => g.id === first)) {
    try { first = (JSON.parse(localStorage.getItem(STORE_KEY)) || {}).last; } catch (_) { first = null; }
  }
  activate(first || GAMES[0].id);
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
})();
