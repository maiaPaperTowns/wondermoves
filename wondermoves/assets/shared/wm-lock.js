/* ==========================================================================
   WM.Lock: parent PIN for the grown-up pages (Progress and Settings).
   - WM.Lock.ensure(onReady, root)  shows the PIN card if needed, then calls onReady()
                                    (root: relative path to the web folder, e.g. '../')
   - WM.Lock.headers()         { 'X-WM-Token': token } for fetch()
   - WM.Lock.token             the token (send it with settings messages on the socket)
   - WM.Lock.relock()          forget the token and ask again (e.g. the board restarted)
   The board keeps a salted hash of the PIN (data/parent_pin.json). Pages served by the laptop
   helper (parents/server.py, laptop only) have no /api/pin, so no PIN is asked there.
   The token lives in sessionStorage: closing the tab locks the page again.
   ========================================================================== */
window.WM = window.WM || {};

(function () {
  const KEY = 'wm.parentToken';
  const store = {
    get() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ } },
  };
  const api = (p) => new URL(p, location.origin).href;

  const CSS = `
  .wm-lock { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(rgba(255,255,255,.06) 1.5px, transparent 1.5px) 0 0 / 22px 22px, #2B2350;
    font-family: 'Fredoka', ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif; color: #4A2C17; }
  .wm-lock-card { width: min(380px, 100%); background: #FFFBF2; border: 3px solid #EED6AE; border-radius: 28px;
    box-shadow: 0 6px 0 #D5B07A, 0 20px 40px rgba(0,0,0,.3); padding: 24px 22px; text-align: center; }
  .wm-lock-card img { width: 56px; height: 56px; }
  .wm-lock-card h1 { margin: 10px 0 4px; font-size: 24px; }
  .wm-lock-card p { margin: 0 0 14px; color: #85634A; font-size: 15px; line-height: 1.4; }
  .wm-lock-pin { width: 100%; font: 700 30px/1 inherit; letter-spacing: .5em; text-align: center; padding: 12px 0 12px .5em;
    border: 3px solid #EED6AE; border-radius: 18px; background: #FFF3DD; color: #4A2C17; }
  .wm-lock-pin:focus { outline: none; border-color: #FF8A3D; }
  .wm-lock-pin + .wm-lock-pin { margin-top: 10px; }
  .wm-lock-btn { margin-top: 16px; width: 100%; min-height: 52px; border: 0; border-radius: 999px; cursor: pointer;
    background: #FF8A3D; color: #fff; font: 700 19px inherit; box-shadow: 0 5px 0 #D9621A; }
  .wm-lock-btn:active { transform: translateY(3px); box-shadow: 0 2px 0 #D9621A; }
  .wm-lock-err { min-height: 22px; margin-top: 10px; color: #B3261E; font-weight: 600; font-size: 15px; }
  .wm-lock-back { display: inline-block; margin-top: 12px; color: #85634A; font-size: 15px; }
  .wm-lock-help { margin-top: 10px; font-size: 13px; color: #85634A; }`;

  const Lock = WM.Lock = {
    token: store.get(),
    headers() { return this.token ? { 'X-WM-Token': this.token } : {}; },
    relock() { this.token = null; store.set(null); location.reload(); },

    async ensure(onReady, root = './') {
      this.root = new URL(root, location.href).href;
      let status;
      try {
        const r = await fetch(api('/api/pin'), { cache: 'no-store' });
        if (r.status === 404) return onReady();            // laptop helper: no PIN there
        status = await r.json();
      } catch (e) { return onReady(); }                    // no board (e.g. the public demo)
      if (this.token) {                                    // still valid?
        try {
          const r = await fetch(api('/api/state'), { cache: 'no-store', headers: this.headers() });
          const st = await r.json();
          if (!st.locked) return onReady();
        } catch (e) { /* ask again */ }
        this.token = null; store.set(null);
      }
      this.show(!status.set, onReady);
    },

    show(create, onReady) {
      if (!document.getElementById('wmLockCss')) {
        const st = document.createElement('style'); st.id = 'wmLockCss'; st.textContent = CSS; document.head.appendChild(st);
      }
      const mascot = this.root + 'shared/assets/logo-mark.svg';
      const el = document.createElement('div');
      el.className = 'wm-lock';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.innerHTML = `
        <form class="wm-lock-card" autocomplete="off">
          <img src="${mascot}" alt="">
          <h1>${create ? 'Create a parent PIN' : 'Grown-ups only'}</h1>
          <p>${create ? 'Choose 4 numbers. You will need them to see progress and change settings. Keep them away from little explorers!'
            : 'Enter your 4-number parent PIN to see progress and change settings.'}</p>
          <input class="wm-lock-pin" id="wmPin1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" aria-label="${create ? 'New PIN' : 'PIN'}" required>
          ${create ? '<input class="wm-lock-pin" id="wmPin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" aria-label="Repeat the new PIN" placeholder="again" required>' : ''}
          <button class="wm-lock-btn" type="submit">${create ? 'Save PIN' : 'Unlock'}</button>
          <div class="wm-lock-err" role="alert"></div>
          <a class="wm-lock-back" href="${this.root}">← Back to the games</a>
          ${create ? '' : '<div class="wm-lock-help">Forgot it? Delete data/parent_pin.json on the game board, then create a new one.</div>'}
        </form>`;
      document.body.appendChild(el);
      const f = el.querySelector('form'), err = el.querySelector('.wm-lock-err'), p1 = el.querySelector('#wmPin1');
      setTimeout(() => p1.focus(), 50);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const a = p1.value.trim(), b = create ? el.querySelector('#wmPin2').value.trim() : a;
        if (!/^\d{4}$/.test(a)) { err.textContent = 'Please use exactly 4 numbers.'; return; }
        if (create && a !== b) { err.textContent = 'The two PINs are different. Try again.'; return; }
        try {
          const r = await fetch(api('/api/pin'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(create ? { new_pin: a } : { pin: a }) });
          const d = await r.json();
          if (d.ok) { this.token = d.token; store.set(d.token); el.remove(); onReady(); return; }
          err.textContent = d.error === 'wait' ? `Too many tries. Wait ${d.wait_s} seconds.`
            : d.error === 'wrong_pin' ? 'That PIN is not right.' : 'Please use exactly 4 numbers.';
          p1.value = ''; p1.focus();
        } catch (e2) { err.textContent = 'Can’t reach the game board.'; }
      });
    },
  };
})();
