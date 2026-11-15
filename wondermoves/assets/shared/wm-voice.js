/* ==========================================================================
   WM.Voice: Pip talks out loud, and children can talk back. Loaded once by the shell
   (index.html), it works for every game without changing the games.

   1. VOICEOVER (ElevenLabs "Cherry Twinkle", offline recordings, one voice for everything)
      Every line Pip shows (speech bubble, tutorial steps, Fossil Brush's "treasure found"
      card) is also spoken, in the active game only.
      - Every line plays from recordings made once with ElevenLabs ("Cherry Twinkle"), in
        shared/voice/ (tools/pip_voice.py eleven). There is no other voice: a line without a
        recording stays silent and is listed in WM.Voice.missing, so it can be recorded.
      Text stays on screen for deaf / hard-of-hearing players; the voice is for blind /
      low-vision players. Pip's bubble stays up until the voice is done and there was time
      to read it.

   2. VOICE COMMANDS (Whisper, offline)
      Tap 🎤 in the bottom bar once (the browser asks for the microphone the first time).
      Then a child can say, for example:
        "Pip, open the fossil game" / "bubbles!" / "treasure please"   -> opens that game
        "begin" / "start" / "next" / "yes" / "let's go"                 -> the Start / Next button
        "again" / "one more"                                            -> Play again / Dig again
        "exit" / "I'm done" / "end this game"                           -> stops, shows "pick a game"
        "pause" / "I need a break"   then   "keep going"                -> rest / carry on
        "no" / "help" / "show me"                                       -> the matching button
      Short commands work with or without "Pip"; longer sentences need "Pip" in them, so
      grown-ups talking nearby don't trigger anything. Pip keeps listening while it talks
      (it ignores its own words), and stops talking when a child gives a command.
      Speech becomes text on this computer (shared/speech/wm-listen-worker.js); nothing is
      recorded or kept. The 🎤 pill shows what was heard. Buttons always keep working.
   ========================================================================== */
(function () {
  const here = (document.currentScript && document.currentScript.src) || location.href;
  const base = new URL('./', here).href;                 // .../shared/
  const strip = t => String(t)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ').trim();
  const clipKey = t => strip(t).toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...')
    .replace(/\s+/g, ' ').trim();
  const sentences = t => strip(t).split(/(?<=[.!?…])\s+/).filter(Boolean);

  /* ======================= 1. VOICEOVER ======================= */
  let clips = {};
  fetch(base + 'voice/manifest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
    .then(m => { if (m && m.clips) { clips = m.clips; looseClips = null; } }).catch(() => {});

  /** The child's nickname is spoken as "explorer": the recordings can't know every name, and it stays private. */
  function forSpeech(text) {
    const nick = window.WM_CHILD && window.WM_CHILD.nickname;
    let t = String(text);
    if (nick) t = t.split(nick).join('explorer');
    // Short forms on screen, said in full.
    t = t.replace(/\b(\d+(?:\.\d+)?) ?m deep\b/g, '$1 meters deep').replace(/\b(\d+) ?s\b(?! [a-z])/g, '$1 seconds')
         .replace(/\b(\d+) ?min\b/g, '$1 minutes').replace(/★|☆/g, '').replace(/(\d+) ?\/ ?(\d+)/g, '$1 of $2').replace(/ \/ /g, ' or ').replace(/ · /g, ', ').replace(/(\d+(?:\.\d+)?)%/g, '$1 percent')
         // Headings in capitals ("PLAY WITH", "NEW!") are said as words, not spelled out.
         .replace(/\b[A-Z]{2,}(?: [A-Z]{2,})*\b/g, w => w.charAt(0) + w.slice(1).toLowerCase());
    return t;
  }
  /** Pre-made clip files for a line: the whole line, or stitched from recorded pieces (sentences,
      fixed parts of a sentence, and numbers), so lines like "You've made 12 moves today" use the
      same recorded voice. null when some part has no recording. */
  // Second index without quotes and commas, so a "You can say "A", "B" or "C"." sentence can be built from the
  // recorded "You can say", each button name, and "or".
  const loose = k => k.replace(/["“”,]/g, '').replace(/\s+/g, ' ').trim();
  let looseClips = null;
  function clipsFor(text) {
    const key = clipKey(forSpeech(text));
    if (clips[key]) return [clips[key]];
    if (!looseClips) { looseClips = {}; for (const k in clips) looseClips[loose(k)] = looseClips[loose(k)] || clips[k]; }
    const w = loose(key).split(' ');
    const n = w.length;
    const best = new Array(n + 1).fill(null);           // best[i] = fewest clips covering words 0..i
    best[0] = [];
    for (let i = 0; i < n; i++) {
      if (!best[i]) continue;
      for (let j = n; j > i; j--) {
        const seg = w.slice(i, j).join(' ');
        let file = clips[seg] || clips[seg.replace(/[,.!?:;]+$/, '')] || looseClips[seg] || looseClips[seg.replace(/[.!?:;]+$/, '')];
        if (!file && j === i + 1) {                      // a number on its own, e.g. "12" or "2!"
          const num = seg.replace(/[^\d.]/g, '').replace(/\.$/, '');
          if (num && /^\d+(\.\d+)?$/.test(num)) file = clips[num];
        }
        if (file && (!best[j] || best[j].length > best[i].length + 1)) best[j] = [...best[i], file];
      }
    }
    return best[n] && best[n].length ? best[n] : null;
  }
  const missing = new Set();                           // lines heard with no recording (for fixing)
  const spoken = new Set();                            // every line Pip said (tools/pip_voice.py uses this list)


  const Voice = {
    unlocked: false, current: null, queue: [], held: null, endedAt: 0, muted: false,
    recent: [],                                     // what Pip said lately (to ignore its own voice)

    speak(text, opts = {}) {
      const clean = strip(text);
      if (!clean) return;
      const item = { text: clean, priority: !!opts.priority || !!opts.hint };
      if (!this.unlocked) { if (item.priority || !this.held) this.held = item; return; }
      if (this.muted) return;
      if (opts.hint) {                                // "Say ... to ..." hints: wait their turn, never dropped
        if (!this.isSpeaking(clean)) { this.queue.push(item); this.pump(); }
        return;
      }
      if (opts.interrupt) { this.queue = []; this.cancel(); }
      if ((this.current && this.current.text === clean) || this.queue.some(q => q.text === clean)) return;
      if (item.priority) {
        this.queue = this.queue.filter(q => q.priority);
        if (this.current && !this.current.priority) this.cancel();
      } else if (this.current && this.current.priority && this.queue.length) {
        return;                                    // chatter never piles up behind important lines
      }
      this.queue.push(item);
      while (this.queue.length > 2) {               // drop chatter only; names, facts and instructions always play
        const k = this.queue.findIndex(q => !q.priority);
        if (k < 0) break;
        this.queue.splice(k, 1);
      }
      this.pump();
    },

    pump() {
      if (this.current || !this.queue.length) return;
      const item = this.current = this.queue.shift();
      this.recent = [item.text, ...this.recent].slice(0, 4);
      spoken.add(forSpeech(item.text));
      const files = clipsFor(item.text);
      if (!files && !missing.has(item.text)) { missing.add(item.text); console.warn('[wm-voice] no recording for:', item.text); }
      // Silent test mode (checking every screen without sound): record the line, play nothing.
      if (this.silentTest) { setTimeout(() => this.done(item), 40); return; }
      if (files) return this.playClips(item, files);
      // No recording: stay silent rather than switch to a different voice. The line is listed in
      // WM.Voice.missing so it can be recorded (tools/pip_voice.py eleven).
      setTimeout(() => this.done(item), 50);
    },

    done(item) {
      if (this.current !== item) return;
      this.current = null; this.stopper = null; this.endedAt = performance.now();
      document.dispatchEvent(new CustomEvent('wm-voice:said', { detail: item.text }));
      setTimeout(() => this.pump(), 150);
    },

    playClips(item, files) {
      let k = 0;
      const next = () => {
        if (this.current !== item) return;
        if (k >= files.length) return this.done(item);
        const a = new Audio(base + 'voice/' + files[k++]);
        this.stopper = () => a.pause();
        a.onended = next;
        a.onerror = next;                                   // a broken file: skip it, never another voice
        a.play().catch(next);
      };
      next();
    },

    cancel() {
      const stop = this.stopper;
      this.current = null; this.stopper = null;
      if (stop) stop();
      this.endedAt = performance.now();
    },

    isSpeaking(text) {
      const c = strip(text);
      return (this.current && this.current.text === c) || this.queue.some(q => q.text === c);
    },
  };

  function unlock() {
    if (Voice.unlocked) return;
    Voice.unlocked = true;
    const held = Voice.held; Voice.held = null;
    if (held) Voice.speak(held.text, { priority: held.priority });
  }
  function watchGestures(doc) {
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => doc.addEventListener(ev, unlock, { capture: true, passive: true }));
    doc.addEventListener('click', e => {
      if (!e.isTrusted || !e.target.closest || !e.target.closest('button, [role="button"], a, [data-game]')) return;
      Voice.queue = []; Voice.cancel();
    }, { capture: true });
  }
  watchGestures(document);

  /* ---------- hooking each game's Pip (games are same-origin iframes) ---------- */
  const frameOf = win => [...document.querySelectorAll('.game-frame')].find(f => {
    const i = f.querySelector('iframe'); return i && i.contentWindow === win;
  });
  const isActive = win => { const f = frameOf(win); return !!(f && f.classList.contains('active')); };

  const lastInstruction = new WeakMap();           // game window -> the last thing Pip asked there
  let bubbleLines = [];                            // Pip's latest speech-bubble lines (cards may repeat them)
  function hookBuddy(win, B, bubbleSel) {
    if (!B || B.__wmVoice) return;
    B.__wmVoice = true;
    const original = B.say.bind(B);
    B.say = function (text, ms = 3400, opts = {}) {
      original(text, ms);
      if (!opts.fromVoice) lastInstruction.set(win, text);
      bubbleLines = [strip(text), ...bubbleLines].slice(0, 5);
      if (!isActive(win)) return;
      let backLines = null; try { backLines = win.TR && win.TR.LINES && win.TR.LINES.back; } catch (_) {}
      if (backLines && backLines.includes(text)) handsBack(win);    // Treasure Reach: a clear "pull your hands back", never dropped
      else Voice.speak(text, opts);
      if (!(ms > 0)) return;                        // ms = 0: the game keeps it up itself
      clearTimeout(B.timer);
      const readMs = Math.max(ms, 1800 + strip(text).length * 60), shownAt = performance.now();
      const tryHide = () => {
        const b = win.document.querySelector(bubbleSel);
        if (b && strip(b.textContent) !== strip(text)) return;   // a newer line took over
        if (Voice.unlocked && !Voice.muted && Voice.isSpeaking(text)) { B.timer = setTimeout(tryHide, 250); return; }
        const left = readMs - (performance.now() - shownAt);
        if (left > 0) { B.timer = setTimeout(tryHide, left); return; }
        B.hide();
      };
      B.timer = setTimeout(tryHide, Math.min(readMs, 1200));
    };
  }

  function hookTutorial(win, T) {
    if (!T || T.__wmVoice) return;
    T.__wmVoice = true;
    const render = T.render.bind(T);
    T.render = function () {
      render();
      const st = this.steps && this.steps[this.i];
      if (st && isActive(win)) Voice.speak(st.text, { priority: true, interrupt: true });
    };
    const close = T.close.bind(T);
    T.close = function () { if (isActive(win)) { Voice.queue = []; Voice.cancel(); } close(); };
  }

  /** Treasure Reach: every opened chest says what's inside (its name, then its fact), every time,
      straight after Pip's cheer. A blind child must always know what they found. */
  function hookChest(win) {
    const G = win.TR && win.TR.Game;
    if (!G || G.__wmVoice || typeof G.openChest !== 'function') return;
    G.__wmVoice = true;
    const open = G.openChest.bind(G);
    G.openChest = function (...args) {
      const r = open(...args);
      if (!isActive(win)) return r;
      const rw = win.document.querySelector('#reward');
      const name = rw && strip((rw.querySelector('.reward-name') || {}).textContent || '');
      const item = name && (win.TR.TREASURES || []).find(t => strip(t.name) === name);
      if (name) Voice.speak(`${name}!`, { hint: true });                    // queued after the cheer, never dropped
      if (item && item.fact) Voice.speak(item.fact, { hint: true });
      return r;
    };
  }

  /** Fossil Brush: the treasure-found card says only the treasure's name and its fact. */
  function hookFound(win) {
    const F = win.FB && win.FB.Found;
    if (!F || F.__wmVoice || typeof F.show !== 'function') return;
    F.__wmVoice = true;
    const show = F.show.bind(F);
    F.show = function (item, ...rest) {
      const r = show(item, ...rest);
      if (!isActive(win) || !item) return r;
      Voice.queue = []; Voice.cancel();
      Voice.speak(`${strip(item.name)}!`, { hint: true });
      if (item.fact) Voice.speak(item.fact, { hint: true });
      return r;
    };
  }

  function hookFrame(iframe) {
    let win;
    try { win = iframe.contentWindow; if (!win || !win.document) return; } catch (_) { return; }
    try {
      if (!win.__wmVoiceGestures) { win.__wmVoiceGestures = true; watchGestures(win.document); }
      if (win.WM) { hookBuddy(win, win.WM.Buddy, '.wm-buddy-bubble'); hookTutorial(win, win.WM.Tutorial); hookChest(win); }
      // (Fossil Brush's "treasure found" card is read by the card reader below, with everything on it.)
      if (win.FB) { hookBuddy(win, win.FB.Buddy, '#buddyBubble'); hookTutorial(win, win.FB.Tutorial); hookFound(win); }
    } catch (e) { console.warn('[wm-voice] could not hook a game', e); }
  }
  // Games load lazily and set up Pip after their scripts run: check every second (hooks once).
  setInterval(() => document.querySelectorAll('.game-frame iframe').forEach(hookFrame), 1000);

  /* ======================= 2. VOICE COMMANDS ======================= */
  // When Pip finishes a line that asks something, everyday answers ("yes", "okay") count for 8 s.
  let questionUntil = 0, listening = false;
  const GAME_WORDS = [
    { id: 'fossil-brush', name: 'Fossil Brush', re: /\b(fossils?|dino(saur)?s?|brush(ing)?|dig(ging)?|sand)\b/ },
    { id: 'treasure-reach', name: 'Treasure Reach', re: /\b(treasures?|reach(ing)?|chests?|pirates?)\b/ },
    { id: 'bubble-pop', name: 'Bubble Pop', re: /\b(bubbles?|pop(ping)?|sea|fish)\b/ },
  ];
  const WAKE = /\b(hey |hi |okay |ok )?(k-)?(pip|pipp|pips|pep|peep|pipe|pib)\b[,.!]?/;
  const INTENTS = [   // first match wins
    { act: 'camera', re: /\b(turn on (the )?camera|use (the )?camera|camera( on| please)?|start (the )?camera|open (the )?camera)\b/ },
    { act: 'mouse', re: /\b(mouse|touch|no camera|without (the )?camera|don'?t use (the )?camera)\b/ },
    { act: 'saved', re: /\b(use my last|my last (one|area|goal)|same as (before|last time)|last time)\b/ },
    { act: 'skip', re: /\b(skip( this| it)?)\b/ },
    { act: 'close', re: /^(close( it| this| that)?|go away|close the (card|box|window|book|collection|menu))$/ },
    { act: 'home', re: /\b(go home|home|main menu|pick a game|choose a game|other games?)\b/ },
    { act: 'end', re: /\b(i'?m done|all done|done|finish(ed)?|end( this)?( game)?|stop( the| this)? game|quit|exit(ing)?|leave|enough|go back|the end|close (this |the )?game)\b/ },
    { act: 'pause', re: /\b(pause|break|rest|tired|wait|hold on|stop)\b/ },
    { act: 'resume', re: /\b(keep going|continue|carry on|resume|i'?m back|unpause)\b/ },
    { act: 'help', re: /\b(help|what do i do|how do i|i don'?t know|confused)\b/ },
    { act: 'show', re: /\b(show me|show it|watch you)\b/ },
    { act: 'no', re: /^(no|nope|nah|not now|no thanks?)\b/ },
    { act: 'again', re: /\b(again|one more|another( one)?|more|new (chest|game|dig|one)|restart|replay)\b/ },
    { act: 'next', re: /\b(begin(ning)?|start(ing)?|next|let'?s go|let'?s play|let'?s begin|let'?s do (it|this))\b/ },
    // Everyday answer words: they only count right after Pip asks a question, or with "Pip" in front.
    { act: 'next', answer: true, re: /^(yes|yeah|yep|yup|sure|okay|ok|go|ready|play|do it|this one)( please| pip)?$/ },
  ];
  const CAMERA_ON = ['[data-cam="start"]', '[data-cal="start"]'];
  const NO_CAMERA = ['[data-cam="touch"]', '[data-cal="mouse"]'];
  const BUTTONS = {
    camera: CAMERA_ON,
    mouse: NO_CAMERA,
    saved: ['[data-cam="saved"]', '[data-cal="saved"]'],
    skip: ['[data-cal="skipframe"]', '.wm-tutorial.open [data-act="skip"]', '#tutorial.open #tutSkip'],
    again: ['#foundAgain', '#resAgain', '#setAgain', '#newDigBtn', '#newGameBtn', '#startGo', '#levelGo'],
    next: [...CAMERA_ON, '[data-cal="done"]', '.wm-tutorial.open [data-act="next"]', '#tutorial.open #tutNext', '#startGo', '#levelGo', '#startResume',
      '#setAgain', '#foundAgain', '#resAgain', '#tutNext'],
    no: [...NO_CAMERA, '.wm-tutorial.open [data-act="skip"]', '#tutorial.open #tutSkip', '#catClose', '#colClose', '#drawerClose'],
    help: ['#helpBtn', '#drawerHelp'],
    close: ['.modal.open [aria-label^="Close"]', '.wm-modal.open [aria-label^="Close"]', '[role="dialog"] [aria-label^="Close"]',
      '[aria-label^="Back to"]', '.drawer.open [aria-label^="Close"]', '#drawerClose', '#catClose', '#colClose'],
    show: ['#traceReplay', '#helpBtn'],
  };
  const REPLY = {
    listening: "I'm listening!", again: "Okay, let's go again!", end: 'Okay, all done with this game!',
    pause: 'Okay, time for a little rest.', resume: "Okay, let's keep going!", begin: "Okay, let's begin!", ok: 'Okay!',
    unknown: "I didn't catch that. You can say fossil, treasure or bubbles.",   // only when "Pip" was said
    help: "You can say: Pip, open fossil. Or: Pip, I'm done. Or: Pip, again!",
  };
  const LABEL = { close: 'close', home: 'home', button: 'press', camera: 'camera on', mouse: 'play with mouse', saved: 'use last', skip: 'skip', repeat: 'repeat', open: 'open', end: 'end game', pause: 'pause', resume: 'keep going', help: 'help', show: 'show me',
    no: 'no', again: 'again', next: 'start / next', listening: 'listening', unknown: '?' };

  // What tiny Whisper often writes when a child says a short command (heard in testing).
  const SOUNDS_LIKE = [
    [/\b(exhale|exist|exits|ex it|egg sit|exiting)\b/g, 'exit'],
    [/\b(back in|big in|be gin|beggin|begging|began|begun)\b/g, 'begin'],
    [/\b(a gain|again st)\b/g, 'again'],
    [/\b(paws|pose|pauses)\b/g, 'pause'],
  ];
  function understand(raw) {
    let t = ' ' + String(raw).toLowerCase().replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ') + ' ';
    for (const [re, word] of SOUNDS_LIKE) t = t.replace(re, word);
    const woke = WAKE.test(t);
    t = t.replace(WAKE, ' ').replace(/\s+/g, ' ').trim();
    const words = t ? t.split(' ').length : 0;
    if (!t) return woke ? { act: 'listening', woke } : null;
    const game = GAME_WORDS.find(g => g.re.test(t));
    const wantsOpen = /\b(open|play|start|go to|switch|want|let'?s|can we|i wanna|put on)\b/.test(t);
    // Without "Pip", only very short commands count, so nearby conversation is ignored.
    if (!woke && words > (game && wantsOpen ? 6 : 5)) return null;
    if (/\b(repeat|say (that|it) again|what did you say|tell me again|what do i do now)\b/.test(t)) return { act: 'repeat', woke, text: t };
    if (/\b(again|more|another|keep (digging|brushing|popping|reaching)|one more)\b/.test(t) && !/\b(open|switch|go to)\b/.test(t)
        && !/^(no|nope|nah)\b/.test(t))
      return { act: 'again', woke, text: t };
    if (game && (wantsOpen || words <= 3)) return { act: 'open', game, woke, text: t };
    const asked = performance.now() < questionUntil;      // Pip just asked something
    for (const i of INTENTS) {
      if (!i.re.test(t)) continue;
      if (i.answer && !woke && !asked) return null;       // a stray "okay" / "go" in the room
      return { act: i.act, woke, text: t, answer: !!i.answer };
    }
    return woke ? { act: 'unknown', woke, text: t } : null;
  }

  // ...and after a "Say ..." hint finishes, "yes" / "okay" count for 20 s.
  document.addEventListener('wm-voice:said', e => {
    if (/\?\s*$/.test(e.detail)) questionUntil = Math.max(questionUntil, performance.now() + 8000);
    if (/^Say "/.test(e.detail)) questionUntil = Math.max(questionUntil, performance.now() + 20000);
  });

  // What Pip says after "again" in each game, and the hint when a round ends.
  const GAME_AGAIN = { 'fossil-brush': "Let's dig again!", 'treasure-reach': 'Here comes a new chest!', 'bubble-pop': "Let's pop more bubbles!" };
  const ROUND_HINT = {
    'fossil-brush': 'Say "dig again" to find another treasure, or "I\'m done" to stop.',
    'treasure-reach': 'Say "again" for another chest, or "I\'m done" to stop.',
    'bubble-pop': 'Say "again" to play again, or "I\'m done" to stop.',
  };
  const TUTORIAL_HINT = 'Say "next" to keep going.';
  const START_HINT = 'Say "begin" when you\'re ready!';
  const VOICE_OFF = 'Ask a grown-up to turn on talking with Pip in Settings.';
  const CAMERA_HELP = 'A grown-up needs to help set up the camera.';
  // Blind players can't see the "Dig again!" or "Next" buttons appear, so Pip says what to say.
  // Only while the microphone is on, and once per button appearance.
  const hinted = new WeakSet();
  const seenAt = new WeakMap();
  setInterval(() => {
    if (!listening && !Voice.hintsWithoutMic) return;
    const f = activeFrame(), win = activeWin();
    if (!f || !win || overlayMode) return;
    const id = f.id.replace('frame-', '');
    let doc; try { doc = win.document; } catch (_) { return; }
    // A button must have been on screen for 1.5 s before its hint, so the card around it is read first.
    const now = performance.now();
    const settled = el => { if (!el) return null; if (!seenAt.has(el)) seenAt.set(el, now); return now - seenAt.get(el) >= 1500 ? el : null; };
    const first = sels => settled(sels.map(sel => [...doc.querySelectorAll(sel)].find(visible)).find(Boolean));
    const again = first(['#foundAgain', '#resAgain', '#setAgain']);          // a round just ended
    if (again && !hinted.has(again) && ROUND_HINT[id]) {
      hinted.add(again);
      Voice.speak(ROUND_HINT[id], { hint: true });
      questionUntil = performance.now() + 30000;          // "yes" also works for a while
      return;
    }
    const cam = first(CAMERA_ON);                                             // camera setup screen
    if (cam && !hinted.has(cam)) { hinted.add(cam); Voice.speak(CAMERA_HELP, { hint: true }); return; }
    const start = first(['#startGo', '#levelGo']);                            // a start screen
    if (start && !hinted.has(start)) { hinted.add(start); Voice.speak(START_HINT, { hint: true }); questionUntil = performance.now() + 30000; return; }
    // Let the same button hint again next time it appears.
    doc.querySelectorAll('#foundAgain, #resAgain, #setAgain, #startGo, #levelGo, [data-cam="start"], [data-cal="start"]').forEach(b => { if (!visible(b)) { hinted.delete(b); seenAt.delete(b); } });
    const tut = doc.querySelector('.wm-tutorial.open, #tutorial.open');
    if (tut && !hinted.has(tut)) { hinted.add(tut); Voice.speak(TUTORIAL_HINT, { hint: true }); questionUntil = performance.now() + 60000; }
    if (!tut) [...doc.querySelectorAll('.wm-tutorial, #tutorial')].forEach(t => hinted.delete(t));
  }, 1000);

  /* ---------- the narrator: everything a child can see is also spoken ---------- */
  // Narration never repeats a line said in the last 15 s (panels re-render the same text).
  const narrated = new Map();
  const say = (text, opts) => {
    const k = clipKey(text), now = performance.now();
    if (narrated.has(k) && now - narrated.get(k) < 15000) return;
    narrated.set(k, now);
    Voice.speak(text, Object.assign({ priority: true }, opts || {}));
  };
  /** Readable lines of an element: its visible text, without button labels (listed separately). */
  function readable(el, buttons) {
    const labels = new Set(buttons.map(b => clipKey(labelOf(b))));
    const recentPip = new Set(bubbleLines.map(clipKey));     // skip only what Pip's speech bubble just said
    return (el.innerText || '').split(/\n+/).map(x => strip(x)).filter(x =>
      x && /[a-z]{2}/i.test(x) && !labels.has(clipKey(x)) && !recentPip.has(clipKey(x)));
  }
  /** A button's name: its first line of words ("Hard" on a "Hard / Speedy bubbles! / Best: 0" card). */
  function buttonName(b) {
    const lines = (b.innerText || '').split(/\n+/).map(strip).filter(x => /[a-z]{2}/i.test(x));
    return lines[0] || labelOf(b);
  }
  function optionsLine(buttons) {
    const names = [...new Set(buttons.map(buttonName).filter(x => x && /[a-z]{2}/i.test(x) && !/^(close|x|✕)$/i.test(x)))];
    if (!names.length || names.length > 12) return '';
    const list = names.length === 1 ? `"${names[0]}"` : names.slice(0, -1).map(x => `"${x}"`).join(', ') + ` or "${names[names.length - 1]}"`;
    return `You can say ${list}.`;
  }
  // The Home screen: a short welcome and the three games; the child then says a game.
  function announceHome() {
    if (!document.getElementById('home')) return;
    Voice.queue = []; Voice.cancel();
    narrated.delete(clipKey(HOME_HINT));
    say(HOME_HINT, { hint: true });
    questionUntil = performance.now() + 30000;
  }
  const HOME_HINT = 'Welcome! Choose your game: Treasure Reach, Fossil Brush, or Bubble Pop.';
  // The shell announces the first screen before this script runs: announce it once on our own.
  setTimeout(() => {
    if (onHome()) announceHome();
    else { const t = document.querySelector('.tab.active .tab-name'); if (t) say(`${strip(t.textContent)}!`); }
  }, 900);
  window.addEventListener('wm:screen', e => {
    const d = e.detail || {};
    lastSig = new WeakMap();
    if (d.screen === 'home') setTimeout(announceHome, 350);
    else if (d.name) { Voice.queue = []; Voice.cancel(); say(`${d.name}!`); }
  });
  // Cards and pop-ups inside a game (level picker, treasure found, results, collection, camera setup,
  // break card, menu): read them when they appear or change, then say what can be said.
  let lastSig = new WeakMap();
  const pendingSig = new WeakMap();
  const readAt = new WeakMap();
  // Also the treasure label that pops up over an opened chest (#reward), which isn't a dialog.
  const CARD_SEL = '[role="dialog"], [role="alertdialog"], [role="status"], .drawer.open, .wm-drawer.open';
  const SAID_ELSEWHERE = '#foundModal';                 // the treasure card: name + fact, said by hookFound
  const CAMERA_SEL = '.wm-cam, #camPanel, .cam-panel';
  /** Camera setup: say the big title ("Let's set up the camera!") and the instructions, including the live
      tips ("Pull both hands back behind the start line"). Not the step list, privacy note or buttons. */
  function cameraLinesOf(el) {
    const body = el.querySelector('.wm-cam-body, .cam-body') || el;
    return [...body.querySelectorAll('h1, h2, h3, p')].filter(n => visible(n) && !n.closest('.wm-calib-privacy, .wm-stepper, button'))
      .map(n => strip(n.innerText || '')).filter(x => x && /[a-z]{2}/i.test(x));
  }
  setInterval(() => {
    const win = activeWin();
    if (!win || overlayMode || !Voice.unlocked) return;          // before the first tap: keep cards for later
    let doc; try { doc = win.document; } catch (_) { return; }
    const cards = [...doc.querySelectorAll(CARD_SEL + ', ' + CAMERA_SEL)].filter(el => visible(el)
      && !el.closest('.wm-tutorial, #tutorial, .wm-buddy, #buddy')        // Pip's bubble + tutorial are voiced already
      && !el.matches('.wm-buddy-bubble, #buddyBubble')
      && !el.matches(SAID_ELSEWHERE));
    const top = cards.filter(el => !cards.some(o => o !== el && o.contains(el)));
    top.forEach(el => {
      const isCam = el.matches(CAMERA_SEL);
      const buttons = isCam ? [] : [...el.querySelectorAll('button, [role="button"]')].filter(visible);
      const lines = isCam ? cameraLinesOf(el) : readable(el, buttons);
      const sig = lines.join(' | ') + ' || ' + buttons.map(labelOf).join(',');
      if (!lines.length && !buttons.length) return;
      if (lastSig.get(el) === sig) return;
      // Wait until the card has stopped changing (typewriter text, fade-in), then read it once.
      if (pendingSig.get(el) !== sig) { pendingSig.set(el, sig); return; }
      // A live status (the camera panel while it looks for hands) can change many times a second:
      // read the same card at most every 3.5 s, and only its new lines.
      const now = performance.now();
      if (now - (readAt.get(el) || -1e9) < 3500) return;
      readAt.set(el, now);
      lastSig.set(el, sig);
      lines.forEach(t => say(t, { hint: true }));
      const opts = optionsLine(buttons);
      if (opts) { say(opts, { hint: true }); questionUntil = performance.now() + 30000; }
    });
  }, 600);

  // Treasure Reach: after a chest opens, the next chest only comes once the hands are back. A child who can't
  // see the screen must be told, every time, after the treasure's name and fact; and again while they wait.
  const HANDS_BACK = {
    camera: 'Now pull both hands back toward you, to get a new chest!',
    sensor: 'Now pull your hand back from the sensor, to get a new chest!',
    mouse: 'Now move the blue circle back down, to get a new chest!',
  };
  let backSaidAt = 0;
  const handsBackLine = G => HANDS_BACK[G.mode === 'mouse' ? 'mouse' : (G.mode === 'sensor' || G.mode === 'board') ? 'sensor' : 'camera'];
  function handsBack(win) {                         // queued after the treasure's name and fact
    const G = win.TR && win.TR.Game; if (!G) return;
    backSaidAt = performance.now(); Voice.speak(handsBackLine(G), { hint: true });
  }
  setInterval(() => {                               // still waiting for the hands: say it again
    const win = activeWin();
    let G = null; try { G = win && win.TR && win.TR.Game; } catch (_) {}
    if (!G || G.state !== 'return') return;
    const line = handsBackLine(G);
    if (!backSaidAt) { handsBack(win); return; }
    if (Voice.current || Voice.queue.length) return;
    if (performance.now() - Math.max(backSaidAt, Voice.endedAt) > 7000) { backSaidAt = performance.now(); Voice.speak(line, { hint: true }); }
  }, 400);

  // Countdowns drawn on the game canvas (Bubble Pop's 3, 2, 1): said out loud.
  let lastCount = null;
  setInterval(() => {
    const win = activeWin();
    let G = null; try { G = win && win.BP && win.BP.Game; } catch (_) {}
    if (G && lastCount === 1 && G.state === 'playing') { lastCount = null; Voice.speak('Pop!', { priority: true }); return; }
    if (!G || G.state !== 'countdown' || typeof G.countdown !== 'number') { lastCount = null; return; }
    const n = Math.ceil(G.countdown);
    if (n >= 1 && n <= 5 && n !== lastCount) { lastCount = n; Voice.speak(String(n), { priority: true }); }
  }, 150);

  /** Did the microphone just hear Pip itself? (Compare with what Pip said lately.) */
  function isPipsOwnVoice(text) {
    const words = s => clipKey(s).replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const heard = words(text);
    // Children's commands are short ("dig again", "next"): never mistake those for Pip, even if
    // Pip just said the same words. Pip's own lines coming back through the speakers are longer.
    if (heard.length < 3) return false;
    const recent = [...(Voice.current ? [Voice.current.text] : []), ...Voice.recent];
    return recent.some(line => {
      const said = new Set(words(line));
      return heard.filter(w => said.has(w)).length / heard.length >= 0.6;
    });
  }

  // ---- doing it ----
  const activeFrame = () => document.querySelector('.game-frame.active');
  const activeWin = () => { const f = activeFrame(); const i = f && f.querySelector('iframe'); try { return i && i.contentWindow; } catch (_) { return null; } };
  /** Really on screen: the element AND everything around it shown (a closed pop-up hides its buttons
      with opacity on the parent), not marked hidden, and not covered by nothing-size. */
  function visible(el) {
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect(), vw = el.ownerDocument.defaultView;
    if (r.width <= 0 || r.height <= 0 || el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
    // Slid off the side of the screen (a closed side menu): not visible. Items further down a scrolling list
    // still count: a child who can't see can't scroll to them, but can say them.
    if (r.right <= 1 || r.left >= vw.innerWidth - 1) return false;
    // A pop-up marked open/shown counts as visible even while it is still fading in.
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = n.ownerDocument.defaultView.getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      if (+s.opacity === 0 && !(n.classList.contains('open') || n.classList.contains('show') || n.hasAttribute('open'))) return false;
    }
    return true;
  }
  function press(act) {
    const win = activeWin(); if (!win) return false;
    for (const sel of BUTTONS[act] || []) {
      const b = [...win.document.querySelectorAll(sel)].find(visible);
      if (b) { b.click(); return true; }
    }
    return false;
  }
  const onHome = () => !activeFrame();
  /** Buttons a child could press right now (the active game, or the Home screen). */
  function visibleButtons() {
    const roots = [];
    const win = activeWin();
    if (win) { try { roots.push(win.document); } catch (_) {} } else roots.push(document.getElementById('home'));
    const out = [];
    roots.forEach(r => r && r.querySelectorAll('button, [role="button"], a.game-card').forEach(b => { if (visible(b)) out.push(b); }));
    return out;
  }
  const labelOf = b => strip(b.getAttribute('aria-label') || b.textContent || '').replace(/[➜▶↩✔✓]/g, '').trim();
  /** "Hard", "show me", "Free Play", "collection": press the visible button with that label. */
  function matchButton(heard) {
    const said = new Set(clipKey(heard).replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean));
    let best = null, bestScore = 0;
    const wordsOf = t => clipKey(t).replace(/[^a-z0-9' ]/g, ' ').split(/\s+/)
      .filter(x => x.length > 1 && !['the', 'a', 'an', 'my', 'to', 'of', 'and', 'or', 'with', 'this', 'it'].includes(x));
    for (const b of visibleButtons()) {
      // The whole label, or just its name (first line: "Hard" on a "Hard / Big reach, hold it steady" card).
      const name = strip(((b.innerText || b.textContent || '').split(/\n+/).map(strip).filter(x => /[a-z]{2}/i.test(x))[0]) || '');
      // Also its own text even when the screen hides it (narrow windows show only "📖" for "Collection").
      for (const words of [wordsOf(labelOf(b)), wordsOf(name), wordsOf(strip(b.textContent || ''))]) {
        if (!words.length) continue;
        const hit = words.filter(x => said.has(x)).length;
        if (hit === words.length && words.length >= bestScore) { best = b; bestScore = words.length; }
      }
    }
    return best;
  }
  function pipSays(text) {
    const win = activeWin();
    const B = win && ((win.WM && win.WM.Buddy) || (win.FB && win.FB.Buddy));
    if (B) B.say(text, 2600, { priority: true, fromVoice: true }); else Voice.speak(text, { priority: true });
  }
  /** Nothing to press right now (e.g. mid-dig): Pip says again what the child can do, never silence. */
  function repeatInstruction() {
    const win = activeWin();
    const id = (activeFrame() || { id: '' }).id.replace('frame-', '');
    const last = win && lastInstruction.get(win);
    const fallback = { 'fossil-brush': 'Brush back and forth to dig!', 'treasure-reach': 'Reach toward the treasure!',
      'bubble-pop': 'Lift your hand to pop a bubble!' }[id];
    const text = last || fallback;
    if (!text) return false;
    Voice.queue = []; Voice.cancel();
    pipSays(text);
    return true;
  }
  function setGameVisible(on) {
    const win = activeWin();
    if (win) win.postMessage({ source: 'wondermoves', type: 'visibility', visible: on }, '*');
  }

  // ---- styles, the 🎤 control in the bottom bar, and the "Pick a game" card ----
  const css = document.createElement('style');
  css.textContent = `
  .wmv-overlay{position:fixed;inset:0 0 var(--tabbar-h,92px) 0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(20,30,50,.45)}
  .wmv-overlay.show{display:flex}
  .wmv-card{background:#fff;color:#2b1a0e;border-radius:28px;padding:26px 28px;max-width:640px;width:calc(100% - 32px);text-align:center;
    box-shadow:0 10px 40px #0004;font:600 22px Fredoka,ui-rounded,system-ui,sans-serif}
  .wmv-card h2{margin:0 0 6px;font-size:30px}.wmv-card p{margin:0 0 18px;font-weight:500;color:#6e5a48}
  .wmv-games{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  .wmv-games button{font:700 22px Fredoka,ui-rounded,system-ui,sans-serif;border:0;border-radius:20px;padding:16px 20px;cursor:pointer;color:#fff;min-width:150px}
  .wmv-right{justify-self:end;display:flex;align-items:center;gap:10px;min-width:0}
  .wmv-mic{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:0;cursor:pointer;
    background:rgba(255,255,255,.12);color:#EDE8FF;font:600 14px Fredoka,ui-rounded,system-ui,sans-serif;max-width:300px}
  .wmv-mic:hover{background:rgba(255,255,255,.2)}
  .wmv-mic .dot{width:10px;height:10px;border-radius:50%;background:#8f86b8;flex:none}
  .wmv-mic.on .dot{background:#7BE0A4}.wmv-mic.hearing .dot{background:#FFB547;animation:wmvPulse .6s infinite}
  .wmv-mic.thinking .dot{background:#7DB9FF;animation:wmvPulse 1s infinite}
  .wmv-mic .txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .wmv-mic.big{background:#fff;color:#2B2350;font-size:18px;padding:12px 18px;box-shadow:0 3px 12px #0002;max-width:340px}
  .wmv-mic.big:hover{background:#FFF6D6}
  .wmv-mic.mini{padding:8px 11px;max-width:260px}
  .wmv-mic.mini .txt{max-width:0;transition:max-width .25s;overflow:hidden}
  .wmv-mic.mini.show-text .txt,.wmv-mic.mini:hover .txt{max-width:260px}
  .wmv-mic.floating{position:fixed;right:12px;bottom:calc(var(--tabbar-h,84px) + 10px);z-index:61;background:#2B2350;box-shadow:0 3px 12px #0004;
    padding:9px 11px}
  .wmv-mic.floating .txt{max-width:0;transition:max-width .25s}
  .wmv-mic.floating.show-text .txt,.wmv-mic.floating:hover .txt{max-width:260px}
  @keyframes wmvPulse{50%{opacity:.35}}
  @media (prefers-reduced-motion: reduce){.wmv-mic .dot{animation:none!important}}`;
  document.head.appendChild(css);

  const mic = document.createElement('button');
  mic.className = 'wmv-mic';
  mic.innerHTML = '<span class="dot"></span><span class="txt">🎤 Talk to Pip</span>';
  mic.title = 'Turn on voice commands';
  // The big button goes in the slot the shell keeps for it on Home (SHELL-README, "#voiceSlot").
  // In games, a small 🎤 status sits in the bottom bar so the child can see Pip is listening.
  const slot = document.getElementById('voiceSlot');
  if (slot) { mic.classList.add('big'); slot.appendChild(mic); slot.hidden = false; }
  else document.body.appendChild(mic);
  const mini = document.createElement('button');
  mini.className = 'wmv-mic mini';
  mini.innerHTML = '<span class="dot"></span><span class="txt">🎤</span>';
  const right = document.querySelector('.tabbar-right');
  if (right) right.insertBefore(mini, right.firstChild); else { mini.classList.add('floating'); document.body.appendChild(mini); }
  const narrow = window.matchMedia('(max-width: 900px)');
  const place = () => { if (narrow.matches && right) { mini.classList.add('floating'); document.body.appendChild(mini); }
    else if (right) { mini.classList.remove('floating'); right.insertBefore(mini, right.firstChild); } };
  place(); narrow.addEventListener && narrow.addEventListener('change', place);
  mini.addEventListener('click', () => listening ? stopListening() : startListening());
  const micText = t => {
    mic.querySelector('.txt').textContent = t;
    mini.querySelector('.txt').textContent = t;
    mini.classList.add('show-text'); clearTimeout(micText.m);
    micText.m = setTimeout(() => { mini.classList.remove('show-text'); }, 4500);
    // Small screens: the round 🎤 shows its text for a few seconds, then shrinks back.
    mic.classList.add('show-text'); clearTimeout(micText.t);
    micText.t = setTimeout(() => mic.classList.remove('show-text'), 4500);
  };

  const overlay = document.createElement('div');
  overlay.className = 'wmv-overlay';
  overlay.innerHTML = `<div class="wmv-card" role="dialog" aria-live="polite"><h2></h2><p></p><div class="wmv-games"></div></div>`;
  document.body.appendChild(overlay);
  let overlayMode = null;
  function showOverlay(mode) {
    overlayMode = mode;
    const card = overlay.querySelector('.wmv-card');
    card.querySelector('h2').textContent = mode === 'pause' ? 'Resting 🐢' : 'Pick a game! 🦕';
    card.querySelector('p').textContent = mode === 'pause' ? 'Say "keep going" or tap below when you\'re ready.'
      : 'Say "fossil", "treasure" or "bubbles", or tap one.';
    const games = mode === 'pause' ? [{ id: 'resume', name: '▶ Keep going', color: '#3DBE6A' }]
      : GAME_WORDS.map(g => { const t = document.getElementById('tab-' + g.id); return { id: g.id, name: g.name, color: t ? getComputedStyle(t).getPropertyValue('--c').trim() : '' }; });
    card.querySelector('.wmv-games').innerHTML = games.map(g => `<button data-wmv="${g.id}" style="background:${g.color || '#E8792B'}">${g.name}</button>`).join('');
    overlay.classList.add('show');
  }
  function hideOverlay() { overlay.classList.remove('show'); overlayMode = null; }
  overlay.addEventListener('click', e => {
    const b = e.target.closest('[data-wmv]'); if (!b) return;
    if (b.dataset.wmv === 'resume') return run({ act: 'resume' });
    run({ act: 'open', game: GAME_WORDS.find(g => g.id === b.dataset.wmv) });
  });
  // Tapping a game tab while the card is up also closes it and wakes that game.
  document.addEventListener('click', e => {
    const tab = e.target.closest && e.target.closest('[data-game]');
    if (!tab) return;
    Voice.cancel(); Voice.queue = [];
    if (overlayMode) { hideOverlay(); setTimeout(() => setGameVisible(true), 50); }
  });

  function run(cmd) {
    if (cmd.act !== 'listening' && cmd.act !== 'unknown') { Voice.queue = []; Voice.cancel(); }   // a child's command interrupts Pip
    if (onHome() && ['next', 'again'].includes(cmd.act)) { announceHome(); return true; }   // Home: say the choices again
    switch (cmd.act) {
      case 'listening': pipSays(REPLY.listening); break;
      case 'open': {
        const tab = document.getElementById('tab-' + cmd.game.id);
        const already = activeFrame() && activeFrame().id === 'frame-' + cmd.game.id;
        // Already in that game ("Pip, let's dig" after a treasure): it means "again" / "next", not "open".
        if (already && !overlayMode) {
          if (press('again')) { pipSays(GAME_AGAIN[cmd.game.id] || REPLY.again); break; }
          if (press('next')) break;
          return false;
        }
        hideOverlay();
        location.hash = '#' + cmd.game.id;                 // the shell opens the game (SHELL-README)
        setGameVisible(true);
        Voice.speak(`Okay! Let's play ${cmd.game.name}!`, { priority: true });
        break;
      }
      case 'home':
      case 'end':
        hideOverlay();
        if (onHome()) { announceHome(); break; }
        Voice.speak(REPLY.end, { priority: true });
        location.hash = '#home';                            // back to the Home screen, which Pip reads out
        break;
      case 'pause': setGameVisible(false); Voice.speak(REPLY.pause, { priority: true }); showOverlay('pause'); break;
      case 'resume': hideOverlay(); setGameVisible(true); pipSays(REPLY.resume); break;
      case 'again': hideOverlay(); setGameVisible(true); if (press('again')) pipSays(REPLY.again); else return repeatInstruction(); break;
      case 'camera': if (!press('camera')) return repeatInstruction(); break;
      case 'mouse': if (!press('mouse')) return repeatInstruction(); break;
      case 'saved': if (!press('saved')) return repeatInstruction(); break;
      case 'skip': if (!press('skip')) return repeatInstruction(); break;
      case 'repeat': return repeatInstruction();
      case 'close': if (!press('close')) return repeatInstruction(); break;
      case 'next':
        if (overlayMode === 'pause') return run({ act: 'resume' });
        if (!press('next')) return repeatInstruction();       // nothing to press: say what to do now
        if (/\b(begin|start|let'?s)/.test(cmd.text || '')) pipSays(REPLY.begin);
        break;
      case 'no': if (!press('no')) return false; break;
      case 'help': if (!press('help')) pipSays(REPLY.help); break;
      case 'show': if (!press('show') && !press('help')) return false; break;
      case 'button': cmd.el.click(); break;              // a button pressed by saying its label
      default: pipSays(REPLY.unknown);
    }
    return true;
  }

  /* ---------- the microphone ---------- */
  let worker = null, stream = null, mctx = null, busyHearing = false, nextId = 1, ratio = 1;
  function startWorker() {
    worker = worker || new Worker(base + 'speech/wm-listen-worker.js', { type: 'module' });
    return new Promise((res, rej) => {
      worker.onmessage = e => e.data.type === 'ready' ? res() : e.data.type === 'error' && rej(new Error(e.data.message));
      worker.onerror = e => rej(new Error(e.message || 'speech worker failed'));
      worker.postMessage({ type: 'load' });
    });
  }
  async function startListening() {
    if (listening) return;
    unlock();
    // A grown-up decides: with a child profile on the board, Pip only listens when
    // "Let Pip talk with my child by voice" is switched on (SHELL-README). No board: the click is the grown-up's choice.
    const child = window.WM_CHILD;
    if (child && child.voice_ok === false) {
      setMic('', '🎤 Voice is off');
      say(VOICE_OFF);
      return;
    }
    micText('🎤 Getting ready…'); mic.className = mic.className.replace(/\b(on|hearing|thinking)\b/g, '').trim() + ' thinking';
    try {
      const ready = startWorker();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      await ready;
      worker.onmessage = onWorker;
      // Use the device's own rate (asking for 16 kHz fails with some microphones), then shrink to 16 kHz.
      mctx = new (window.AudioContext || window.webkitAudioContext)();
      ratio = mctx.sampleRate / 16000;
      const src = mctx.createMediaStreamSource(stream);
      const proc = mctx.createScriptProcessor(4096, 1, 1);
      const sink = mctx.createGain(); sink.gain.value = 0;               // keeps the processor running, silently
      src.connect(proc); proc.connect(sink); sink.connect(mctx.destination);
      proc.onaudioprocess = e => onAudio(downsample(e.inputBuffer.getChannelData(0)));
      listening = true;
      setMic('on', '🎤 Say "Pip…"');
      mic.title = 'Voice commands are on. Click to turn off.';
    } catch (err) {
      console.warn('[wm-voice] microphone/speech unavailable', err);
      stopListening(true);
      setMic('', /denied|permission|notallowed/i.test(String(err)) ? '🎤 Mic blocked: allow it in Chrome' : '🎤 Voice off (no mic)');
    }
  }
  function stopListening(keepText) {
    listening = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (mctx) mctx.close();
    stream = mctx = null;
    if (!keepText) { setMic('', '🎤 Talk to Pip'); mic.title = 'Turn on voice commands'; }
  }
  function setMic(state, text) {
    [mic, mini].forEach(el => {
      const keep = ['floating', 'show-text', 'big', 'mini'].filter(c => el.classList.contains(c)).join(' ');
      el.className = 'wmv-mic' + (keep ? ' ' + keep : '') + (state ? ' ' + state : '');
    });
    if (text) micText(text);
  }
  mic.addEventListener('click', () => listening ? stopListening() : startListening());

  function downsample(input) {
    if (ratio === 1) return new Float32Array(input);
    const n = Math.floor(input.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {                                         // average each block: simple low-pass
      const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
      let s = 0; for (let j = a; j < b; j++) s += input[j];
      out[i] = s / Math.max(1, b - a);
    }
    return out;
  }

  // Voice-activity detection: energy above the room's noise floor = someone talking.
  let floor = 0.004, speech = [], silent = 0, pre = null, pending = null;
  function onAudio(chunk) {
    let sum = 0; for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
    const rms = Math.sqrt(sum / chunk.length);
    const loud = rms > Math.max(0.01, floor * 3);
    if (!loud && !speech.length) floor = floor * 0.95 + rms * 0.05;      // learn the room's quiet level
    if (loud) {
      if (!speech.length && pre) speech.push(pre);
      speech.push(chunk); silent = 0;
      if (listening) setMic('hearing');
    } else if (speech.length) {
      speech.push(chunk);
      if (++silent >= 3) flush();                                          // ~0.75 s of quiet ends a phrase
    }
    if (speech.length > 26) flush();                                       // ~6.5 s max
    pre = chunk;
  }
  function flush() {
    const chunks = speech; speech = []; silent = 0;
    const n = chunks.reduce((a, c) => a + c.length, 0);
    if (n < 16000 * 0.3) { if (listening) setMic('on'); return; }
    const audio = new Float32Array(n); let o = 0;
    for (const c of chunks) { audio.set(c, o); o += c.length; }
    if (busyHearing) { pending = audio; return; }                          // keep the newest phrase while busy
    hear(audio);
  }
  function hear(audio) {
    busyHearing = true; setMic('thinking');
    worker.postMessage({ type: 'hear', id: nextId++, audio }, [audio.buffer]);
  }
  /** Everything after speech becomes text: the same path for real speech and for tests. Returns what was done. */
  function handleHeard(text) {
    if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) return null;                 // [silence], (music)
    const shown = text.replace(/[.!?]$/, '');
    if (isPipsOwnVoice(text)) { console.info('[wm-voice] ignored Pip\'s own voice:', text); return null; }
    let cmd = understand(text);
    // A button on screen whose label was said ("Keep going!", "Change level", "Hard", "I'm done")
    // wins over the general commands: the child is answering what's in front of them.
    const short = clipKey(text).replace(WAKE, ' ').trim().split(/\s+/).length <= 5;
    const b = (short || (cmd && cmd.woke)) && !(cmd && cmd.answer && !cmd.woke) && matchButton(text);
    if (b && (!cmd || !['open', 'home', 'pause', 'listening'].includes(cmd.act) || /\b(i'?m done|done)\b/i.test(labelOf(b))))
      cmd = { act: 'button', el: b, woke: !!(cmd && cmd.woke), text: labelOf(b) };
    // While Pip is talking (or just finished), the child has to say "Pip" first: then Pip can't trigger itself.
    // While Pip talks, clear commands ("next", "dig again", "exit") still work, and stop Pip.
    // Only everyday answer words ("yes", "okay") need "Pip" then, so Pip can't trigger itself.
    const pipTalking = !!Voice.current || performance.now() - Voice.endedAt < 1200;
    if (cmd && pipTalking && !cmd.woke && cmd.answer) cmd = null;
    const did = cmd ? run(cmd) : false;
    micText(!cmd ? `🎤 "${shown}" (not a command)` : did ? `🎤 "${shown}" → ${LABEL[cmd.act] || cmd.act}`
      : `🎤 "${shown}" (nothing to do right now)`);
    console.info('[wm-voice] heard', JSON.stringify(text), '→', cmd ? cmd.act + (cmd.game ? ' ' + cmd.game.id : '') + (did ? '' : ' (nothing to do)') : 'nothing');
    return cmd ? { act: cmd.act, did } : null;
  }
  function onWorker(e) {
    const m = e.data;
    if (m.type !== 'text' && m.type !== 'error') return;
    busyHearing = false;
    if (listening) setMic('on');
    if (pending) { const p = pending; pending = null; hear(p); }
    handleHeard((m.text || '').trim());
    clearTimeout(onWorker.t); onWorker.t = setTimeout(() => listening && micText('🎤 Say "Pip…"'), 5000);
  }

  /** Testing without a microphone: play a recorded file through the same listening path.
      WM.Voice.testHear('shared/speech/test-command.wav') */
  async function testHear(url) {
    if (!worker || !listening) { await startWorker(); }
    worker.onmessage = onWorker;
    ratio = 1;
    const buf = await (await fetch(url)).arrayBuffer();
    const audio = (await new OfflineAudioContext(1, 16000 * 8, 16000).decodeAudioData(buf)).getChannelData(0);
    const quiet = new Float32Array(4096);
    for (let i = 0; i < 4; i++) onAudio(quiet);                                        // room noise before
    for (let i = 0; i < audio.length; i += 4096) {                                   // pad the last piece
      const c = new Float32Array(4096); c.set(audio.subarray(i, Math.min(audio.length, i + 4096))); onAudio(c);
    }
    for (let i = 0; i < 5; i++) onAudio(quiet);                                        // then quiet: phrase ends
  }

  window.WM = window.WM || {};
  WM.Voice = Object.assign(Voice, { understand, run, startListening, stopListening, clipsFor, testHear, isPipsOwnVoice,
    missing, spoken, announceHome, matchButton, forSpeech, handleHeard });
})();
