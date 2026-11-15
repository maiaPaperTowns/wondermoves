/* ==========================================================================
   Fossil Brush — game data
   --------------------------------------------------------------------------
   Everything here is safe to edit. To swap a placeholder emoji for real art,
   set `image: 'assets/items/your-file.png'` on an item (PNG/SVG/WebP all work).
   When `image` is set it is used everywhere (dig site, catalog, found card).
   ========================================================================== */
window.FB = window.FB || {};

FB.MAX_DEPTH = 100; // metres shown on the depth meter

FB.MASCOT = {
  name: 'Pip',
  image: 'assets/mascot.svg', // replace with your mascot art
};

/* Rarity tiers. Each tier owns a band of the depth meter (min..max metres).
   A treasure is always buried inside its tier's band, so digging deeper on
   the meter = rarer treasure. */
FB.RARITIES = [
  { id: 'common',    name: 'Common',    color: '#C9B8A3', deep: '#8C7760', icon: '🪨', stars: 1, min: 0,  max: 20 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#6FD68F', deep: '#2E9D5B', icon: '🍀', stars: 2, min: 20, max: 40 },
  { id: 'rare',      name: 'Rare',      color: '#5BC0F8', deep: '#1D7FC1', icon: '💠', stars: 3, min: 40, max: 60 },
  { id: 'epic',      name: 'Epic',      color: '#BC8CFA', deep: '#7D46CB', icon: '⚡', stars: 4, min: 60, max: 80 },
  { id: 'legendary', name: 'Legendary', color: '#FFC94A', deep: '#D99100', icon: '🌟', stars: 5, min: 80, max: 100 },
];

/* Dig sites. Difficulty knobs:
   brushRadius  – brush size as a fraction of the sand pile (bigger = easier)
   strength     – how much sand each swipe removes
   rockiness    – 0..1, amount of hard rocky clumps that need extra brushing
   weights      – chance of each rarity [common, uncommon, rare, epic, legendary]
   background   – optional image URL to replace the drawn scenery            */
FB.LEVELS = [
  {
    id: 'beach',
    name: 'Sunny Beach',
    emoji: '🏖️',
    difficulty: 'Easy',
    diffLevel: 1,
    blurb: 'Soft sand and seashells. A great place to start!',
    brushRadius: 0.13,
    strength: 1.2,
    rockiness: 0,
    weights: [52, 26, 13, 7, 2],
    background: null,
    theme: {
      skyTop: '#6EC9F5', skyBottom: '#D9F4FF', sun: '#FFE066',
      far: '#3BB0E0', mid: '#9EDCEB', ground: '#F7E3B5',
      strata: ['#FBE9C0', '#F3D59B', '#E7BD78', '#D6A05B', '#BF8545'],
      rock: '#A39A8F', bed: '#A88560', bedDark: '#7F6142',
    },
    decor: [
      { e: '🌴', x: 2, b: 30, s: 17 },
      { e: '⛵', x: 71, b: 46, s: 5 },
      { e: '🦀', x: 8, b: 8, s: 6 },
      { e: '🐚', x: 74, b: 6, s: 4.5 },
    ],
    items: [
      { id: 'beach-shell',    name: 'Spiral Shell',      emoji: '🐚', rarity: 'common',    image: null, fact: 'Some seashells are millions of years old — older than the dinosaurs!' },
      { id: 'beach-tooth',    name: 'Shark Tooth',       emoji: '🦷', rarity: 'common',    image: null, fact: 'Sharks can lose thousands of teeth in their lives. That\'s why we find so many!' },
      { id: 'beach-crab',     name: 'Fossil Crab',       emoji: '🦀', rarity: 'uncommon',  image: null, fact: 'Crabs have been scuttling sideways for more than 200 million years.' },
      { id: 'beach-ammonite', name: 'Ammonite',          emoji: '🐌', rarity: 'rare',      image: null, fact: 'Ammonites were squid-like sea animals that lived inside curly, coiled shells.' },
      { id: 'beach-turtle',   name: 'Giant Sea Turtle',  emoji: '🐢', rarity: 'epic',      image: null, fact: 'Archelon was an ancient sea turtle as big as a car!' },
      { id: 'beach-plesio',   name: 'Plesiosaur',        emoji: '🦕', rarity: 'legendary', image: null, fact: 'Plesiosaurs had super-long necks and swam with four big flippers.' },
    ],
  },
  {
    id: 'desert',
    name: 'Desert Dunes',
    emoji: '🏜️',
    difficulty: 'Medium',
    diffLevel: 2,
    blurb: 'Dinosaurs once stomped here. Can you find their bones?',
    brushRadius: 0.11,
    strength: 0.95,
    rockiness: 0.15,
    weights: [44, 26, 16, 10, 4],
    background: null,
    theme: {
      skyTop: '#7CC4EF', skyBottom: '#FFE9C4', sun: '#FFD34D',
      far: '#F0B97A', mid: '#E9A660', ground: '#F2C58A',
      strata: ['#FBDCA6', '#F2BF7A', '#E3A05A', '#CC8040', '#A9622E'],
      rock: '#9B8774', bed: '#9A6A44', bedDark: '#6F4A2E',
    },
    decor: [
      { e: '🌵', x: 3, b: 30, s: 14 },
      { e: '🐫', x: 70, b: 33, s: 7 },
      { e: '🦂', x: 10, b: 8, s: 5 },
      { e: '🌵', x: 77, b: 12, s: 8 },
    ],
    items: [
      { id: 'desert-bone',      name: 'Dino Bone',       emoji: '🦴', rarity: 'common',    image: null, fact: 'Fossil bones are made of stone! Minerals slowly replaced the bone over millions of years.' },
      { id: 'desert-footprint', name: 'Dino Footprint',  emoji: '🐾', rarity: 'common',    image: null, fact: 'Footprints tell us how fast dinosaurs walked — and whether they travelled in herds.' },
      { id: 'desert-egg',       name: 'Dino Egg',        emoji: '🥚', rarity: 'uncommon',  image: null, fact: 'Some dinosaur eggs were as big as a football!' },
      { id: 'desert-lizard',    name: 'Ancient Lizard',  emoji: '🦎', rarity: 'rare',      image: null, fact: 'Lizards lived alongside the dinosaurs — and they are still around today.' },
      { id: 'desert-scarab',    name: 'Golden Scarab',   emoji: '🪲', rarity: 'epic',      image: null, fact: 'Long ago, people thought scarab beetles were lucky charms.' },
      { id: 'desert-trex',      name: 'T. rex Skull',    emoji: '🦖', rarity: 'legendary', image: null, fact: 'A T. rex skull could be as long as a grown-up is tall!' },
    ],
  },
  {
    id: 'canyon',
    name: 'Rocky Canyon',
    emoji: '🏞️',
    difficulty: 'Hard',
    diffLevel: 3,
    blurb: 'Rocky clumps make digging tricky. Brush extra hard!',
    brushRadius: 0.095,
    strength: 0.8,
    rockiness: 0.5,
    weights: [36, 26, 19, 13, 6],
    background: null,
    theme: {
      skyTop: '#8CCBE8', skyBottom: '#FFD9BF', sun: '#FFE08A',
      far: '#C9785A', mid: '#B65F45', ground: '#DC9A73',
      strata: ['#EFC2A0', '#DD9F78', '#C47F5B', '#A5644A', '#82493A'],
      rock: '#8D8580', bed: '#7D5544', bedDark: '#563A2F',
    },
    decor: [
      { e: '⛰️', x: 1, b: 35, s: 17 },
      { e: '🦅', x: 22, y: 14, s: 6 },
      { e: '🪨', x: 8, b: 8, s: 7 },
      { e: '🌵', x: 74, b: 20, s: 8 },
    ],
    items: [
      { id: 'canyon-wood',      name: 'Petrified Wood',    emoji: '🪵', rarity: 'common',    image: null, fact: 'Petrified wood is a tree that slowly turned into rock!' },
      { id: 'canyon-trilobite', name: 'Trilobite',         emoji: '🦐', rarity: 'common',    image: null, fact: 'Trilobites crawled on the sea floor more than 500 million years ago.' },
      { id: 'canyon-mammoth',   name: 'Mammoth Tusk',      emoji: '🦣', rarity: 'uncommon',  image: null, fact: 'Woolly mammoth tusks could grow longer than a car!' },
      { id: 'canyon-saber',     name: 'Saber-tooth Skull', emoji: '🐯', rarity: 'rare',      image: null, fact: 'Saber-toothed cats had fangs as long as a banana.' },
      { id: 'canyon-geode',     name: 'Crystal Geode',     emoji: '💎', rarity: 'epic',      image: null, fact: 'Geodes look like plain rocks outside, but are full of sparkly crystals inside!' },
      { id: 'canyon-crown',     name: 'Ancient Crown',     emoji: '👑', rarity: 'legendary', image: null, fact: 'Legends say a canyon king hid his crown where only the bravest diggers could reach.' },
    ],
  },
  {
    id: 'volcano',
    name: 'Volcano Valley',
    emoji: '🌋',
    difficulty: 'Expert',
    diffLevel: 4,
    blurb: 'Hard lava rock hides the rarest treasures of all!',
    brushRadius: 0.085,
    strength: 0.7,
    rockiness: 0.75,
    weights: [28, 25, 21, 16, 10],
    background: null,
    theme: {
      skyTop: '#3B2049', skyBottom: '#FF9566', sun: '#FF6B3D',
      far: '#5A3A4A', mid: '#4A3036', ground: '#6D4C45',
      strata: ['#A99790', '#8C7A73', '#6F5B55', '#57423D', '#3F2D2A'],
      rock: '#2F2A2A', bed: '#4A332D', bedDark: '#2E1F1B',
    },
    decor: [
      { e: '🌋', x: 1, b: 35, s: 19 },
      { e: '🔥', x: 10, b: 8, s: 6 },
      { e: '🦕', x: 70, b: 30, s: 8 },
      { e: '🪨', x: 76, b: 6, s: 5 },
    ],
    items: [
      { id: 'volcano-rock',   name: 'Lava Rock',      emoji: '🪨', rarity: 'common',    image: null, fact: 'Lava rock has tiny holes made by gas bubbles when the lava cooled.' },
      { id: 'volcano-fern',   name: 'Ancient Fern',   emoji: '🌿', rarity: 'common',    image: null, fact: 'Ferns grew on Earth before there were any flowers at all.' },
      { id: 'volcano-amber',  name: 'Amber Bug',      emoji: '🦟', rarity: 'uncommon',  image: null, fact: 'Amber is old tree sap that turned hard — sometimes with a tiny bug trapped inside!' },
      { id: 'volcano-idol',   name: 'Stone Idol',     emoji: '🗿', rarity: 'rare',      image: null, fact: 'Some ancient stone statues are taller than a house.' },
      { id: 'volcano-orb',    name: 'Mystic Orb',     emoji: '🔮', rarity: 'epic',      image: null, fact: 'Volcanoes can make shiny glass called obsidian when lava cools super fast.' },
      { id: 'volcano-dragon', name: 'Dragon Skull',   emoji: '🐉', rarity: 'legendary', image: null, fact: 'Long ago, people who found giant dinosaur bones thought they belonged to dragons!' },
    ],
  },
];

/* Things the mascot says. Feel free to add more lines. */
FB.LINES = {
  start: [
    'Brush the sand pile to see what\'s hiding! 🖌️',
    'Something is buried in there… let\'s dig!',
    'New dig site! Swish swish! 🖌️',
  ],
  peek: [
    'I see something! Keep brushing! 👀',
    'Ooh, what could it be?!',
    'Almost there — careful now!',
  ],
  idle: [
    'Keep brushing, explorer! You\'re doing great!',
    'Swish back and forth to clear the sand!',
  ],
  found: {
    common: 'Nice find! Every treasure counts! 🎉',
    uncommon: 'Ooh, an Uncommon treasure! 🍀',
    rare: 'Wow, a RARE treasure! 💠',
    epic: 'WHOA! An EPIC discovery! ⚡',
    legendary: 'LEGENDARY!!! You\'re a super digger! 🌟',
  },
};

/* Lookup helpers */
FB.rarityById = id => FB.RARITIES.find(r => r.id === id);
FB.rarityIndex = id => FB.RARITIES.findIndex(r => r.id === id);
FB.levelById = id => FB.LEVELS.find(l => l.id === id);
FB.allItems = () => FB.LEVELS.flatMap(l => l.items);
