/* ==========================================================================
   WM.Buddy + WM.Tutorial: Pip the mascot, shared by WonderMoves games.
   - WM.Buddy.say(text, ms)   speech bubble from the bottom-left corner
                              (ms = 0 keeps it up until the next say/hide)
   - WM.Tutorial.open(steps)  spotlight walkthrough. Each step is
                              { text, target: '#selector' | null, round, pad }
   Needs wm-pip.css. Builds its own DOM.
   ========================================================================== */
window.WM = window.WM || {};

(function () {
  const here = document.currentScript && document.currentScript.src;
  WM.PIP = {
    name: 'Pip',
    image: here ? new URL('assets/mascot.svg', here).href : 'assets/mascot.svg',
  };

  /* ---------------- Buddy ---------------- */
  const Buddy = WM.Buddy = {
    el: null, timer: null,
    mount() {
      if (this.el) return;
      const el = document.createElement('div');
      el.className = 'wm-buddy';
      el.innerHTML = `<img alt="${WM.PIP.name}" draggable="false" src="${WM.PIP.image}">
        <div class="wm-buddy-bubble" role="status" aria-live="polite"></div>`;
      document.body.appendChild(el);
      this.el = el;
    },
    say(text, ms = 3400) {
      this.mount();
      this.el.querySelector('.wm-buddy-bubble').textContent = text;
      this.el.classList.remove('talk'); void this.el.offsetWidth;
      this.el.classList.add('show', 'talk');
      clearTimeout(this.timer);
      if (ms > 0) this.timer = setTimeout(() => this.el.classList.remove('show'), ms);
    },
    hide() { clearTimeout(this.timer); if (this.el) this.el.classList.remove('show'); },
  };

  /* ---------------- Tutorial ---------------- */
  const Tutorial = WM.Tutorial = {
    el: null, steps: [], i: 0, typing: null, opts: {},

    mount() {
      if (this.el) return;
      const el = document.createElement('div');
      el.className = 'wm-tutorial';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'How to play');
      el.innerHTML = `
        <div class="wm-spotlight"></div>
        <div class="wm-tut-box">
          <img class="wm-tut-mascot" alt="" draggable="false" src="${WM.PIP.image}">
          <div class="wm-tut-bubble">
            <div class="wm-tut-name">${WM.PIP.name}</div>
            <p class="wm-tut-text" aria-live="polite"></p>
            <div class="wm-tut-foot">
              <div class="wm-tut-dots"></div>
              <div class="wm-tut-actions">
                <button class="wm-link" data-act="skip">Skip</button>
                <button class="wm-btn small" data-act="back">⬅ Back</button>
                <button class="wm-btn primary small" data-act="next">Next ➜</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el);
      this.el = el;
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (b) { WM.Sound && WM.Sound.click(); this[b.dataset.act](); }
        else if (e.target.closest('.wm-tut-bubble')) this.finishTyping();
      });
      window.addEventListener('resize', () => this.isOpen() && this.place(this.steps[this.i]));
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen()) this.skip(); });
    },

    isOpen() { return !!(this.el && this.el.classList.contains('open')); },

    open(steps, opts = {}) {
      this.mount();
      this.steps = steps;
      this.opts = opts;
      this.i = 0;
      Buddy.hide();
      document.body.classList.add('wm-tut-open');
      this.el.classList.add('open');
      this.el.querySelector('.wm-tut-dots').innerHTML = steps.map(() => '<i></i>').join('');
      this.render();
    },

    close() {
      clearInterval(this.typing); this.typing = null;
      document.body.classList.remove('wm-tut-open');
      this.el.classList.remove('open');
      this.opts.onClose && this.opts.onClose();
    },
    skip() { this.close(); },
    next() {
      if (this.finishTyping()) return;
      if (this.i >= this.steps.length - 1) return this.close();
      this.i++; this.render();
    },
    back() { if (this.i > 0) { this.i--; this.render(); } },
    finishTyping() {
      if (!this.typing) return false;
      clearInterval(this.typing); this.typing = null;
      this.el.querySelector('.wm-tut-text').textContent = this.steps[this.i].text;
      return true;
    },

    render() {
      const st = this.steps[this.i];
      const el = this.el;
      el.querySelectorAll('.wm-tut-dots i').forEach((d, k) => d.classList.toggle('on', k === this.i));
      el.querySelector('[data-act="back"]').style.visibility = this.i === 0 ? 'hidden' : 'visible';
      el.querySelector('[data-act="next"]').textContent = this.i === this.steps.length - 1 ? (this.opts.doneLabel || "Let's go! 🎉") : 'Next ➜';
      const m = el.querySelector('.wm-tut-mascot');
      m.classList.remove('hop'); void m.offsetWidth; m.classList.add('hop');
      this.place(st);
      clearInterval(this.typing);
      const txt = el.querySelector('.wm-tut-text');
      const chars = [...st.text];
      let n = 0;
      txt.textContent = '';
      this.typing = setInterval(() => {
        n++;
        txt.textContent = chars.slice(0, n).join('');
        if (n >= chars.length) { clearInterval(this.typing); this.typing = null; }
      }, 22);
    },

    place(st) {
      const spot = this.el.querySelector('.wm-spotlight');
      const box = this.el.querySelector('.wm-tut-box');
      const target = st.target && document.querySelector(st.target);
      if (!target) {
        spot.style.cssText = 'left:50%;top:45%;width:0;height:0;border-radius:50%';
        spot.classList.remove('ring');
        box.classList.remove('top');
        return;
      }
      const r = target.getBoundingClientRect();
      const pad = st.pad != null ? st.pad : 10;
      spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:${st.round ? '50%' : '26px'}`;
      spot.classList.add('ring');
      box.classList.toggle('top', r.top + r.height > window.innerHeight * 0.62);
    },
  };
})();
