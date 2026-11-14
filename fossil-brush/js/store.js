/* Saves progress (collection, settings) in the browser. */
window.FB = window.FB || {};

FB.Store = {
  key: 'fossilBrush.save.v1',
  data: null,

  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { saved = {}; }
    this.data = Object.assign(
      { found: {}, tutorialDone: false, level: 'beach', muted: false, digs: 0 },
      saved
    );
  },

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage blocked: play on */ }
  },

  /** Records a find. Returns true when it is the first time this item was found. */
  addFind(item, depth) {
    const rec = this.data.found[item.id] || { count: 0, best: 0, first: Date.now() };
    const isNew = rec.count === 0;
    rec.count += 1;
    rec.best = Math.max(rec.best, Math.round(depth));
    this.data.found[item.id] = rec;
    this.data.digs += 1;
    this.save();
    return isNew;
  },

  isFound(id) { return !!(this.data.found[id] && this.data.found[id].count); },
  record(id) { return this.data.found[id] || null; },

  reset() {
    this.data.found = {};
    this.data.digs = 0;
    this.save();
  },
};
