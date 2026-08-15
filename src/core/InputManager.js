const DEFAULT_BINDINGS = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  interact: 'KeyE',
  inventory: 'KeyI',
  drop: 'KeyQ',
  slot1: 'Digit1',
  slot2: 'Digit2',
  mute: 'KeyM',
};

const ACTION_LABELS = {
  moveForward: 'Move Forward',
  moveBackward: 'Move Backward',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  interact: 'Interact',
  inventory: 'Open / Close Box',
  drop: 'Drop Item',
  slot1: 'Use Slot 1',
  slot2: 'Use Slot 2',
  mute: 'Toggle Mute',
};

const STORAGE_KEY = 'box-and-bones:bindings';

export class InputManager {
  constructor() {
    this.bindings = this._loadBindings();
    this.keysDown = new Set();
    this.actionsPressedThisFrame = new Set();
    this._listeningFor = null;
    this._listenCallback = null;

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
  }

  _loadBindings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
    } catch (e) {
      /* ignore corrupt storage */
    }
    return { ...DEFAULT_BINDINGS };
  }

  _saveBindings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
  }

  listenForRebind(action, callback) {
    this._listeningFor = action;
    this._listenCallback = callback;
  }

  _onKeyDown(e) {
    if (this._listeningFor) {
      const action = this._listeningFor;
      this.bindings[action] = e.code;
      this._saveBindings();
      this._listeningFor = null;
      if (this._listenCallback) this._listenCallback(action, e.code);
      return;
    }
    if (!this.keysDown.has(e.code)) {
      this.actionsPressedThisFrame.add(e.code);
    }
    this.keysDown.add(e.code);
  }

  _onKeyUp(e) {
    this.keysDown.delete(e.code);
  }

  isDown(action) {
    return this.keysDown.has(this.bindings[action]);
  }

  wasPressed(action) {
    return this.actionsPressedThisFrame.has(this.bindings[action]);
  }

  endFrame() {
    this.actionsPressedThisFrame.clear();
  }

  keyLabel(action) {
    const code = this.bindings[action];
    return code.replace('Key', '').replace('Digit', '').replace('Arrow', '');
  }

  static get actionLabels() {
    return ACTION_LABELS;
  }

  static get actionList() {
    return Object.keys(DEFAULT_BINDINGS);
  }
}
