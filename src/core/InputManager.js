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
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this._listeningFor = null;
    this._listenCallback = null;
    this.sensitivity = this._loadSensitivity();

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
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

  _loadSensitivity() {
    const raw = localStorage.getItem('box-and-bones:sensitivity');
    return raw ? parseFloat(raw) : 1.0;
  }

  setSensitivity(value) {
    this.sensitivity = value;
    localStorage.setItem('box-and-bones:sensitivity', String(value));
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

  _onMouseMove(e) {
    this.mouseDeltaX += e.movementX || 0;
    this.mouseDeltaY += e.movementY || 0;
  }

  isDown(action) {
    return this.keysDown.has(this.bindings[action]);
  }

  wasPressed(action) {
    return this.actionsPressedThisFrame.has(this.bindings[action]);
  }

  consumeMouseDelta() {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
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
