const STORAGE_KEY = 'box-and-bones:save';

// Items that live in bookshelf slots when the game starts; putting them all
// back completes the tidy objective.
const SHELVED_ITEM_IDS = ['compass', 'map'];

// The bookshelf has this many item slots (two per shelf level).
export const SHELF_SLOT_COUNT = 4;

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

// Where each item lives on a fresh save. Shelf slots are stored by index —
// the bookshelf itself can be moved around the box, and everything resting
// on it rides along. Posters start on wall anchors matching their
// POSTER_IDS index.
const DEFAULT_ITEM_HOMES = {
  compass: { scene: 'inventory-shelf', slot: 0 },
  map: { scene: 'inventory-shelf', slot: 1 },
  'poster-howto': { scene: 'inventory-wall', anchor: 0 },
  'poster-controls': { scene: 'inventory-wall', anchor: 1 },
  'poster-settings': { scene: 'inventory-wall', anchor: 2 },
};

// Movable furniture, stored as the grid anchor (min col/row) of each
// piece's footprint on the box floor plus its orientation (quarter-turns
// clockwise). InventoryScene owns the footprint sizes and meshes; this is
// only where they stand and which way they face.
const DEFAULT_FURNITURE = {
  bookshelf: { col: 0, row: 4, rot: 0 },
  desk: { col: 8, row: 7, rot: 0 },
};

// Older saves stored shelved items at the old wall-board coordinates;
// map those onto bookshelf slot indices.
const LEGACY_SHELF_X = -5.47;
const LEGACY_SHELF_Z = [-2, -0.7, 0.6, 2];

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
    this.furniture = {
      ...JSON.parse(JSON.stringify(DEFAULT_FURNITURE)),
      ...(saved?.furniture ?? {}),
    };
    // Saves from before furniture could rotate carry no orientation.
    for (const f of Object.values(this.furniture)) f.rot = f.rot ?? 0;

    // Migrate pre-bookshelf saves: shelved items used to be stored at the
    // old wall boards' world coordinates.
    for (const [id, loc] of Object.entries(this.itemLocations)) {
      if (loc?.scene !== 'inventory' || Math.abs(loc.x - LEGACY_SHELF_X) > 0.25) continue;
      const slot = LEGACY_SHELF_Z.findIndex((z) => Math.abs(loc.z - z) < 0.25);
      if (slot !== -1 && !this.shelfSlotOccupant(slot)) {
        this.itemLocations[id] = { scene: 'inventory-shelf', slot };
      }
    }

    // Nothing is ever allowed to vanish: any known item that is neither in
    // a hand nor recorded anywhere is restored to a sensible home.
    for (const id of Object.keys(DEFAULT_ITEM_HOMES)) {
      if (!this.itemLocations[id] && !this.hasItem(id)) {
        this._sendHome(id);
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
      furniture: this.furniture,
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

  // Sort a hand's item into a bookshelf slot.
  shelveFromHand(side, slot) {
    const id = this.hands[side];
    if (!id || this.shelfSlotOccupant(slot)) return null;
    this.hands[side] = null;
    this.itemLocations[id] = { scene: 'inventory-shelf', slot };
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

  shelfSlotOccupant(slot) {
    for (const [id, loc] of Object.entries(this.itemLocations)) {
      if (loc?.scene === 'inventory-shelf' && loc.slot === slot) return id;
    }
    return null;
  }

  freeShelfSlot() {
    for (let i = 0; i < SHELF_SLOT_COUNT; i++) {
      if (!this.shelfSlotOccupant(i)) return i;
    }
    return null;
  }

  freeWallAnchor() {
    for (let i = 0; i < POSTER_IDS.length; i++) {
      if (!this.posterOnAnchor(i)) return i;
    }
    return null;
  }

  // Put an item somewhere sensible in the box: its own kind of home first
  // (shelf slot / wall hook), the box floor as a last resort.
  _sendHome(id) {
    if (POSTER_IDS.includes(id)) {
      const anchor = this.freeWallAnchor();
      if (anchor !== null) {
        this.itemLocations[id] = { scene: 'inventory-wall', anchor };
        return;
      }
    } else {
      const slot = this.freeShelfSlot();
      if (slot !== null) {
        this.itemLocations[id] = { scene: 'inventory-shelf', slot };
        return;
      }
    }
    this.itemLocations[id] = { scene: 'inventory', x: 2, z: 1 };
  }

  // A stranded item (e.g. left lying in a maze that no longer exists)
  // finds its way back to the box.
  returnItemHome(id) {
    if (this.hasItem(id)) return;
    this._sendHome(id);
    this._notify();
  }

  moveFurniture(id, col, row, rot = 0) {
    this.furniture[id] = { col, row, rot };
    this._notify();
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

  // Ending a run regenerates the maze, so anything left lying in it would
  // be lost forever — instead it finds its way back to the box. Returns
  // the ids that were brought home.
  completeRun() {
    this.runsCompleted += 1;
    this.mazeLayer = 1;
    this.objectives = [
      { id: 'escape-1', text: 'Find your way to the end of the maze', done: false },
    ];
    const returned = [];
    for (const [id, loc] of Object.entries(this.itemLocations)) {
      if (loc?.scene === 'maze') {
        this._sendHome(id);
        returned.push(id);
      }
    }
    this._notify();
    return returned;
  }

  setScene(name) {
    this.scene = name;
    this._notify();
  }
}
