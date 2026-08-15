const STORAGE_KEY = 'box-and-bones:save';

// Items that live on shelf slots when the game starts; putting them all back
// completes the tidy objective.
const SHELVED_ITEM_IDS = ['compass', 'map'];

// Posters that hang on wall anchors and can be taken down, carried rolled
// up, dropped, shelved, or re-hung. The title poster is fixed to the wall.
export const POSTER_IDS = ['poster-howto', 'poster-controls', 'poster-settings'];

export const ITEM_LABELS = {
  compass: 'Compass',
  map: 'Map',
  'poster-howto': 'How To Play poster',
  'poster-controls': 'Controls poster',
  'poster-settings': 'Settings poster',
};

// Must match InventoryScene's shelf slot coordinates (slots 0 and 1) so items
// start out actually resting on the shelf. Posters start on wall anchors
// matching their POSTER_IDS index.
const DEFAULT_ITEM_HOMES = {
  compass: { scene: 'inventory', x: -5.47, z: -2 },
  map: { scene: 'inventory', x: -5.47, z: -0.7 },
  'poster-howto': { scene: 'inventory-wall', anchor: 0 },
  'poster-controls': { scene: 'inventory-wall', anchor: 1 },
  'poster-settings': { scene: 'inventory-wall', anchor: 2 },
};

export class GameState {
  constructor() {
    this.listeners = new Set();
    const saved = this._load();

    this.scene = saved?.scene ?? 'inventory';
    this.mazeLayer = saved?.mazeLayer ?? 1;
    this.runsCompleted = saved?.runsCompleted ?? 0;
    // The player has two hands; each can hold one item. The right hand is
    // the preferred (first-filled) one.
    if (saved?.hands) {
      this.hands = { left: saved.hands.left ?? null, right: saved.hands.right ?? null };
    } else if (Array.isArray(saved?.carried)) {
      // migrate pre-hands saves
      this.hands = { right: saved.carried[0] ?? null, left: saved.carried[1] ?? null };
    } else {
      this.hands = { left: null, right: null };
    }
    this.activeCompass = saved?.activeCompass ?? true;
    this.activeMap = saved?.activeMap ?? true;
    this.itemLocations = saved?.itemLocations ?? JSON.parse(JSON.stringify(DEFAULT_ITEM_HOMES));
    // Older saves predate movable posters: hang any poster that has no
    // recorded location and is not carried.
    for (const id of POSTER_IDS) {
      if (!this.itemLocations[id] && !this.hasItem(id)) {
        this.itemLocations[id] = JSON.parse(JSON.stringify(DEFAULT_ITEM_HOMES[id]));
      }
    }
    this.objectives = saved?.objectives ?? [
      { id: 'escape-1', text: 'Find your way to the end of the maze', done: false },
    ];
    this.stepsTaken = saved?.stepsTaken ?? 0;
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  save() {
    const payload = {
      scene: this.scene,
      mazeLayer: this.mazeLayer,
      runsCompleted: this.runsCompleted,
      hands: { ...this.hands },
      activeCompass: this.activeCompass,
      activeMap: this.activeMap,
      itemLocations: this.itemLocations,
      objectives: this.objectives,
      stepsTaken: this.stepsTaken,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    this.save();
    for (const fn of this.listeners) fn(this);
  }

  hasItem(id) {
    return this.hands.left === id || this.hands.right === id;
  }

  handOf(id) {
    if (this.hands.left === id) return 'left';
    if (this.hands.right === id) return 'right';
    return null;
  }

  handItem(side) {
    return this.hands[side];
  }

  // The hand a new pickup would go into (right first), or null if full.
  freeHand() {
    if (!this.hands.right) return 'right';
    if (!this.hands.left) return 'left';
    return null;
  }

  handsFull() {
    return !!(this.hands.left && this.hands.right);
  }

  carriedList() {
    return [this.hands.left, this.hands.right].filter(Boolean);
  }

  // Picks an item into the free hand; returns the hand used, or null if
  // both hands are full (nothing happens).
  pickUp(id) {
    const hand = this.freeHand();
    if (!hand) return null;
    this.hands[hand] = id;
    delete this.itemLocations[id];
    if (SHELVED_ITEM_IDS.includes(id)) {
      this.addObjective('tidy-shelf', 'Return everything to its place on the shelf');
    }
    this._notify();
    return hand;
  }

  dropFromHand(side, sceneName, x, z) {
    const id = this.hands[side];
    if (!id) return null;
    this.hands[side] = null;
    this.itemLocations[id] = { scene: sceneName, x, z };
    this._notify();
    return id;
  }

  hangPosterFromHand(side, anchorIndex) {
    const id = this.hands[side];
    if (!id || !POSTER_IDS.includes(id)) return null;
    this.hands[side] = null;
    this.itemLocations[id] = { scene: 'inventory-wall', anchor: anchorIndex };
    this._notify();
    return id;
  }

  // Used when a poster is taken off the wall from its detailed view.
  takeIntoHand(id) {
    return this.pickUp(id);
  }

  posterOnAnchor(anchorIndex) {
    for (const id of POSTER_IDS) {
      const loc = this.itemLocations[id];
      if (loc?.scene === 'inventory-wall' && loc.anchor === anchorIndex) return id;
    }
    return null;
  }

  itemLocationIn(sceneName) {
    return Object.entries(this.itemLocations).filter(([, loc]) => loc.scene === sceneName);
  }

  addObjective(id, text) {
    if (this.objectives.find((o) => o.id === id)) return;
    this.objectives.push({ id, text, done: false });
    this._notify();
  }

  completeObjective(id) {
    const obj = this.objectives.find((o) => o.id === id);
    if (obj && !obj.done) {
      obj.done = true;
      this._notify();
    }
  }

  currentObjectiveText() {
    const open = this.objectives.find((o) => !o.done);
    return open ? open.text : 'All objectives complete. Find the way out.';
  }

  advanceLayer() {
    this.mazeLayer += 1;
    this.completeObjective(`escape-${this.mazeLayer - 1}`);
    if (this.mazeLayer <= 3) {
      this.addObjective(`escape-${this.mazeLayer}`, `Escape maze layer ${this.mazeLayer}`);
    }
    this._notify();
  }

  completeRun() {
    this.runsCompleted += 1;
    this.mazeLayer = 1;
    this.objectives = [
      { id: 'escape-1', text: 'Find your way to the end of the maze', done: false },
    ];
    this._notify();
  }

  setScene(name) {
    this.scene = name;
    this._notify();
  }
}
