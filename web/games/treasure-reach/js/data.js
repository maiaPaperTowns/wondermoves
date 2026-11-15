/* ==========================================================================
   Treasure Reach: data, settings and saved progress.
   ========================================================================== */
window.TR = window.TR || {};

/* What can pop out of a chest. `w` = how often (weight). Swap emoji for art with `image`. */
TR.TREASURES = [
  { id: 'coins',  name: 'Gold Coins',   emoji: '🪙', w: 30, image: null },
  { id: 'gem',    name: 'Shiny Gem',    emoji: '💎', w: 16, image: null },
  { id: 'ring',   name: 'Magic Ring',   emoji: '💍', w: 12, image: null },
  { id: 'pearl',  name: 'Ocean Pearl',  emoji: '🦪', w: 12, image: null },
  { id: 'key',    name: 'Golden Key',   emoji: '🗝️', w: 10, image: null },
  { id: 'star',   name: 'Lucky Star',   emoji: '⭐', w: 10, image: null },
  { id: 'crown',  name: 'Royal Crown',  emoji: '👑', w: 6,  image: null },
  { id: 'trophy', name: 'Champion Cup', emoji: '🏆', w: 4,  image: null },
];

/* In-game difficulty: how far to reach (% of the child's own comfortable reach
   from calibration) and how long to hold it. Kept within comfort: max 120%. */
TR.DIFFICULTIES = [
  { id: 'easy',   name: 'Easy',   emoji: '🐢', blurb: 'Little reach, quick hold', goalPct: 75,  holdMs: 300 },
  { id: 'medium', name: 'Medium', emoji: '🦀', blurb: 'Comfy reach, hold a moment', goalPct: 95,  holdMs: 800 },
  { id: 'hard',   name: 'Hard',   emoji: '🦈', blurb: 'Big reach, hold it steady', goalPct: 115, holdMs: 1500 },
];
TR.MAX_GOAL_PCT = 120;

/* Settings (defaults). */
TR.DEFAULTS = {
  difficulty: 'easy',
  hands: 'either',    // 'either' hand counts, or 'both' hands must reach
  setSize: 5,         // chests per set before a celebration break
  restLevel: 0.25,    // hands must come back below this fraction of the goal before the next chest
};

TR.LINES = {
  rest: ['Reach for the treasure! 🙌', 'Stretch toward the chest! 💰', 'Ready? Reach out! ✨'],
  half: ['Halfway there! 💪', 'Keep reaching!', 'Ooh, the chest is wiggling!'],
  almost: ['Almost there! 🌟', 'So close!'],
  hold: ['Hold it… hold it…'],
  open: ['You did it! 🎉', 'Treasure time! 💰', 'Wow, great reach! ⭐', 'Amazing! 🙌'],
  back: ['Now rest your hands. A new chest is coming! 🔁', 'Bring your hands back to rest 🙌'],
  lost: ['I can\'t see your hands! Hold them up for me 👋'],
  mouse: ['Move the blue circle up to the chest! 🖱️'],
};

TR.Store = {
  key: 'treasureReach.save.v1',
  data: null,
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { saved = {}; }
    this.data = Object.assign({
      inputMode: 'camera',      // 'camera' | 'mouse'
      calib: null,              // { goal (palm growth fraction), reps: [], at }
      settings: {},
      tutorialDone: false,
      muted: false,
      camHidden: false,
      totals: { chests: 0, treasures: {} },
      log: [],                  // one record per opened chest
    }, saved);
    this.data.settings = Object.assign({}, TR.DEFAULTS, this.data.settings);
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  get s() { return this.data.settings; },
  logRep(rec) {
    this.data.log.push(rec);
    if (this.data.log.length > 2000) this.data.log.splice(0, this.data.log.length - 2000);
    this.save();
  },
};
