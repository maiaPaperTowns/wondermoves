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
  // Lift mode must ALWAYS be false: the timed game is Bubble Pop's mode (product decision).
  // Don't switch it back on here; the line in Store.load() below also forces it off for saved games.
  lift: false,
  seconds: 0,           // round length in seconds; 0 = no timer (default: the child decides when to stop)
  bubbleSize: 'medium', // small | medium | big (accessibility)
  popWhileMoving: false,// only pop while the hand is moving (see BP.canPop)
};

BP.LINES = {
  liftStart: ['Rest your hands, then lift the one under the bubble! 🫧', 'Bubbles are coming! Lift your hand straight up to pop them 🫧'],
  liftLeft: ['Lift your left hand to the bubble! 🫧'],
  liftRight: ['Lift your right hand to the bubble! 🫧'],
  liftPair: ['Both hands up together! 🫧🫧'],
  liftHold: ['Hold it there! Now lift the other hand too ✋'],
  liftRest: ['Rest your hands on the table so I can find them 🙌'],
  liftBreak: ['So many pops! Want a little break? 🐢'],
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
    this.data.settings.lift = false; // lift mode always off (see BP.DEFAULTS), even if an older save had it on
    // One-time switch to "No timer" for saves from before it existed (WonderMoves rule: no timers).
    if (!this.data.noTimerV1) { this.data.settings.seconds = 0; this.data.noTimerV1 = true; this.save(); }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  get s() { return this.data.settings; },
  logSession(rec) {
    this.data.log.push(rec);
    if (this.data.log.length > 1000) this.data.log.splice(0, this.data.log.length - 1000);
    this.save();
  },
};
