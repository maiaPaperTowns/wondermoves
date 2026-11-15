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

/* In-game difficulty: how far to reach (% of the child's own comfortable reach
   from calibration) and how long to hold it. Kept within comfort: max 110%. */
TR.DIFFICULTIES = [
  // weights = chance of [common, uncommon, rare, epic, legendary]; harder levels find rarer treasure
  { id: 'easy',   name: 'Easy',   emoji: '🐢', lv: 1, blurb: 'Little reach, quick hold',   goalPct: 60,  holdMs: 300,  weights: [62, 28, 9, 1, 0] },
  { id: 'medium', name: 'Medium', emoji: '🦀', lv: 2, blurb: 'Comfy reach, hold a moment', goalPct: 80,  holdMs: 800,  weights: [42, 30, 17, 9, 2] },
  { id: 'hard',   name: 'Hard',   emoji: '🦈', lv: 3, blurb: 'Big reach, hold it steady',  goalPct: 100, holdMs: 1500, weights: [26, 26, 22, 16, 10] },
];
TR.MAX_GOAL_PCT = 110;

TR.rarityById = id => TR.RARITIES.find(r => r.id === id);
TR.rarityIndex = id => TR.RARITIES.findIndex(r => r.id === id);
/** Levels on which a rarity can show up (for the collection hints). */
TR.levelsFor = rarityId => TR.DIFFICULTIES.filter(d => d.weights[TR.rarityIndex(rarityId)] > 0);

/* Settings (defaults). */
TR.DEFAULTS = {
  difficulty: 'easy',
  hands: 'either',    // 'either' hand counts, or 'both' hands must reach
  setSize: 5,         // chests per set before a celebration break
  restLevel: 0.25,    // hands must come back below this fraction of the goal before the next chest
};

TR.LINES = {
  rest: ['Slide your hands toward the treasure! 🙌', 'Stretch toward the chest, hands on the table! 💰', 'Ready? Slide and reach! ✨'],
  half: ['Halfway there! 💪', 'Keep reaching!', 'Ooh, the chest is wiggling!'],
  almost: ['Almost there! 🌟', 'So close!'],
  hold: ['Hold it… hold it…'],
  open: ['You did it! 🎉', 'Treasure time! 💰', 'Wow, great reach! ⭐', 'Amazing! 🙌'],
  back: ['Now rest your hands. A new chest is coming! 🔁', 'Bring your hands back to rest 🙌'],
  lost: ['I can\'t see your hands! Hold them up for me 👋'],
  boardLost: ['I can\'t see your hand. Rest it on the towel, in front of the sensor 👋'],
  board: ['Reach along the tunnel toward the treasure! 🙌', 'Slide your hand toward the cave! 💰', 'Ready? Reach for it! ✨'],
  mouse: ['Move the blue circle up to the chest! 🖱️'],
};

TR.Store = {
  key: 'treasureReach.save.v1',
  data: null,
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { saved = {}; }
    this.data = Object.assign({
      inputMode: 'camera',      // 'camera' | 'mouse' | 'board' (Distance sensor, chosen automatically on the UNO Q)
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
