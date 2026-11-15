/* ==========================================================================
   Treasure Reach: data, settings and saved progress.
   ========================================================================== */
window.TR = window.TR || {};

/* Rarity tiers (same colours as Fossil Brush). */
TR.RARITIES = [
  { id: 'common',    name: 'Common',    color: '#C9B8A3', deep: '#8C7760', icon: '🪨', stars: 1 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#6FD68F', deep: '#2E9D5B', icon: '🍀', stars: 2 },
  { id: 'rare',      name: 'Rare',      color: '#5BC0F8', deep: '#1D7FC1', icon: '💠', stars: 3 },
  { id: 'epic',      name: 'Epic',      color: '#BC8CFA', deep: '#7D46CB', icon: '⚡', stars: 4 },
  { id: 'legendary', name: 'Legendary', color: '#FFC94A', deep: '#D99100', icon: '🌟', stars: 5 },
];

/* What can pop out of a chest. Swap emoji for art with `image`.
   Which rarity you get depends on the level (see `weights` in TR.DIFFICULTIES). */
TR.TREASURES = [
  { id: 'coins',   name: 'Gold Coins',        emoji: '💰', rarity: 'common',    image: null, fact: 'Pirates often split their gold coins evenly with the whole crew.' },
  { id: 'compass', name: 'Old Compass',       emoji: '🧭', rarity: 'common',    image: null, fact: 'A compass needle always points north, so sailors never get lost.' },
  { id: 'map',     name: 'Treasure Map',      emoji: '🗺️', rarity: 'common',    image: null, fact: 'X marks the spot! Treasure maps show where something is hidden.' },
  { id: 'pearl',   name: 'Ocean Pearl',       emoji: '🦪', rarity: 'uncommon',  image: null, fact: 'Pearls grow slowly inside oysters, layer by layer.' },
  { id: 'key',     name: 'Golden Key',        emoji: '🗝️', rarity: 'uncommon',  image: null, fact: 'This old key opens a very special lock somewhere on the island.' },
  { id: 'ring',    name: 'Magic Ring',        emoji: '💍', rarity: 'uncommon',  image: null, fact: 'Legend says this ring sparkles brighter when you smile.' },
  { id: 'gem',     name: 'Shiny Gem',         emoji: '💎', rarity: 'rare',      image: null, fact: 'Diamonds are the hardest natural thing on Earth.' },
  { id: 'star',    name: 'Lucky Star',        emoji: '⭐', rarity: 'rare',      image: null, fact: 'Sailors used the stars to find their way across the sea at night.' },
  { id: 'crown',   name: 'Royal Crown',       emoji: '👑', rarity: 'epic',      image: null, fact: 'This crown belonged to the Queen of the Seven Seas.' },
  { id: 'lamp',    name: 'Magic Lamp',        emoji: '🪔', rarity: 'epic',      image: null, fact: 'Rub it gently… who knows what might pop out!' },
  { id: 'trophy',  name: 'Champion Cup',      emoji: '🏆', rarity: 'legendary', image: null, fact: 'Only the biggest, bravest reachers ever find this cup!' },
  { id: 'trident', name: 'Sea King\'s Trident', emoji: '🔱', rarity: 'legendary', image: null, fact: 'The Sea King used this trident to calm stormy waves.' },
];

/* In-game difficulty. A chest opens when the reach is far enough AND held for `holdMs`.
   - With the board's Distance sensor: the camera moves the progress bar up to
     TR.SENSE.switchAt (it can't get closer), then the sensor takes over from
     handoffMm (100 mm) to openMm (50 mm). The chest opens at openMm or closer,
     held for `holdMs`; with the sensor, the levels only change the hold time.
   - Camera only (no board): both wrists must be `goalPct`% of the way from the start
     position to max forward.
   Max forward is the child's own comfortable maximum, so no level asks for more. */
TR.DIFFICULTIES = [
  // weights = chance of [common, uncommon, rare, epic, legendary]; harder levels find rarer treasure
  { id: 'easy',   name: 'Easy',   emoji: '🐢', lv: 1, blurb: 'Little reach, quick hold',   goalPct: 60,  holdMs: 300,  weights: [62, 28, 9, 1, 0] },
  { id: 'medium', name: 'Medium', emoji: '🦀', lv: 2, blurb: 'Comfy reach, hold a moment', goalPct: 80,  holdMs: 800,  weights: [42, 30, 17, 9, 2] },
  { id: 'hard',   name: 'Hard',   emoji: '🦈', lv: 3, blurb: 'All the way, hold it steady', goalPct: 100, holdMs: 1500, weights: [26, 26, 22, 16, 10] },
];
// Never beyond the child's calibrated maximum (WonderMoves evidence rule, docs/evidence-brief.html).
TR.MAX_GOAL_PCT = 100;

/* Reach measurement (camera + Distance sensor). Tune these for the kit. */
TR.SENSE = {
  handoffMm: 100,        // the sensor takes over the progress bar at this reading…
  openMm: 50,            // …and the chest opens at this reading or closer
  trustMm: 150,          // sensor readings farther than this are ignored (the chip only sees hands up close)
  freshMs: 400,          // a reading older than this means "sensor sees nothing"
  touchMm: 60,           // last reading this close, then silence = finger on the sensor (see TR.sensorTouchMm)
  touchHoldMs: 4000,     // …for at most this long (longer than the Hard level's 1.5 s hold)
  levelTol: 0.25,        // both wrists within this share of the start→max-forward travel = "level"
  switchAt: 0.7,         // camera movement alone fills the bar (and moves the circles) only up to here
  restBelow: 0.3,        // hands are "back at the start" below this share of the travel
};

TR.rarityById = id => TR.RARITIES.find(r => r.id === id);
TR.rarityIndex = id => TR.RARITIES.findIndex(r => r.id === id);
/** Levels on which a rarity can show up (for the collection hints). */
TR.levelsFor = rarityId => TR.DIFFICULTIES.filter(d => d.weights[TR.rarityIndex(rarityId)] > 0);

/* Settings (defaults). */
TR.DEFAULTS = {
  difficulty: 'easy',
  setSize: 5,         // chests per set before a celebration break
  restLevel: 0.25,    // hands must come back below this fraction of the goal before the next chest
};

TR.LINES = {
  rest: ['Push both hands toward the laptop! 🙌', 'Slide both hands forward on the table! 💰', 'Ready? Both hands, slide and reach! ✨'],
  uneven: ['Push with both hands together! 🙌', 'Keep both hands side by side! 🤝'],
  handsOut: ['Keep the tops of both hands in the picture 👀'],
  half: ['Halfway there! 💪', 'Keep reaching!', 'Ooh, the chest is wiggling!'],
  almost: ['Almost there! 🌟', 'So close!'],
  hold: ['Hold it… hold it…'],
  open: ['You did it! 🎉', 'Treasure time! 💰', 'Wow, great reach! ⭐', 'Amazing! 🙌'],
  back: ['Now rest your hands. A new chest is coming! 🔁', 'Bring your hands back to rest 🙌'],
  lost: ['I can\'t see your hands! Put them back on the table in front of me 👋'],
  mouse: ['Move the blue circle up to the chest! 🖱️'],
  effort: ['Great try! That was a big reach! ⭐', 'Ooh, so close! Here\'s a star for trying! ⭐', 'Nice reaching! Try again when you\'re ready ⭐'],
  switch: ['Press and hold the big button to open the chest! 🔘', 'Hold the button until the star fills! ⭐'],
  sensor: ['Reach out and touch the sensor to open the chest! 🖐️', 'Ready? Slide your hand all the way to the sensor! 💰', 'Touch the sensor with your fingers! ✨'],
};

TR.Store = {
  key: 'treasureReach.save.v1',
  data: null,
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { saved = {}; }
    this.data = Object.assign({
      inputMode: 'camera',      // 'camera' | 'mouse' | 'board' (camera + Distance sensor, chosen automatically on the UNO Q)
      calib: null,              // { v: 2, maxY: {left, right}, homeY: {left, right}, touchMm, at } (wrist heights in the camera picture)
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
