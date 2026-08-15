const STORAGE_KEY = 'box-and-bones:save';

const DEFAULT_ITEM_HOMES = {
  compass: { scene: 'inventory', x: -3.2, z: -1.6 },
  map: { scene: 'inventory', x: -3.2, z: 0.6 },
};

export class GameState {
  constructor() {
    this.listeners = new Set();
    const saved = this._load();

    this.scene = saved?.scene ?? 'inventory';
    this.mazeLayer = saved?.mazeLayer ?? 1;
    this.runsCompleted = saved?.runsCompleted ?? 0;
    this.carried = new Set(saved?.carried ?? []);
    this.activeCompass = saved?.activeCompass ?? true;
    this.activeMap = saved?.activeMap ?? true;
    this.itemLocations = saved?.itemLocations ?? JSON.parse(JSON.stringify(DEFAULT_ITEM_HOMES));
    this.objectives = saved?.objectives ?? [
      { id: 'escape-1', text: 'Find your way to the end of the maze', done: false },
    ];
    this.stepsTaken = saved?.stepsTaken ?? 0;
    this.hasEnteredMazeBefore = saved?.hasEnteredMazeBefore ?? false;
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
      carried: [...this.carried],
      activeCompass: this.activeCompass,
      activeMap: this.activeMap,
      itemLocations: this.itemLocations,
      objectives: this.objectives,
      stepsTaken: this.stepsTaken,
      hasEnteredMazeBefore: this.hasEnteredMazeBefore,
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
    return this.carried.has(id);
  }

  pickUp(id) {
    this.carried.add(id);
    delete this.itemLocations[id];
    this._notify();
  }

  drop(id, sceneName, x, z) {
    this.carried.delete(id);
    this.itemLocations[id] = { scene: sceneName, x, z };
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
