/* ==========================================================================
   Bubble Pop: data, settings and saved progress.
   ========================================================================== */
window.BP = window.BP || {};

/* Difficulty = how fast bubbles rise and how often they appear.
   speed: fraction of the play-area height per second; every: seconds between bubbles. */
BP.DIFFICULTIES = [
  { id: 'easy',   name: 'Easy',   emoji: '🐢', lv: 1, blurb: 'Slow, big bubbles',   speed: [0.08, 0.11], every: 1.5, size: 1.15 },
  { id: 'medium', name: 'Medium', emoji: '🐠', lv: 2, blurb: 'Bubbles drift by',    speed: [0.13, 0.18], every: 1.05, size: 1.0 },
  { id: 'hard',   name: 'Hard',   emoji: '🐬', lv: 3, blurb: 'Speedy bubbles!',     speed: [0.2, 0.28],  every: 0.7, size: 0.85 },
];

/* Bubble kinds. `w` = how often; `pts` = score. */
BP.KINDS = [
  { id: 'plain', w: 78, pts: 1 },
  { id: 'fish',  w: 15, pts: 2, emoji: ['🐠', '🐟', '🐡', '🦀', '🐙', '🐢'] },
  { id: 'star',  w: 7,  pts: 3, emoji: ['⭐'] },
];

BP.DEFAULTS = {
  difficulty: 'easy',
  seconds: 60,          // session length
  bubbleSize: 'medium', // small | medium | big (accessibility)
  popWhileMoving: false,// only pop while the hand is moving (see BP.canPop)
};

BP.LINES = {
  start: ['Pop as many bubbles as you can! 🫧', 'Here come the bubbles! 🫧'],
  pop: ['Pop! 🫧', 'Nice one!', 'Great reach! 🙌', 'Bubble-tastic!', 'Wow! ✨'],
  ten: ['10 seconds left! Keep popping! ⏱️'],
  lost: ['I can\'t see your hands! Hold them up for me 👋'],
  mouse: ['Move the blue circle onto the bubbles! 🖱️'],
  end: ['Time\'s up! Great popping! 🎉'],
};

BP.Store = {
  key: 'bubblePop.save.v1',
  data: null,
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { saved = {}; }
    this.data = Object.assign({
      inputMode: 'camera',
      range: null,          // calibrated comfortable hand area {x0,x1,y0,y1} in camera space
      settings: {},
      tutorialDone: false,
      muted: false,
      best: {},             // best score per difficulty
      log: [],              // one record per session
    }, saved);
    this.data.settings = Object.assign({}, BP.DEFAULTS, this.data.settings);
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  get s() { return this.data.settings; },
  logSession(rec) {
    this.data.log.push(rec);
    if (this.data.log.length > 1000) this.data.log.splice(0, this.data.log.length - 1000);
    this.save();
  },
};
