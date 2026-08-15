// Classic dungeon-crawler binding scheme: WASD moves and strafes, Q/E turn
// in place, F uses, and each hand has its own drop/place key (Z for the
// left hand, C for the right — mirroring where each hand's item sits on
// screen).
const DEFAULT_BINDINGS = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  strafeLeft: 'KeyA',
  strafeRight: 'KeyD',
  turnLeft: 'KeyQ',
  turnRight: 'KeyE',
  interact: 'KeyF',
  dropLeft: 'KeyZ',
  dropRight: 'KeyC',
  inventory: 'KeyI',
  slot1: 'Digit1',
  slot2: 'Digit2',
  mute: 'KeyM',
};

const ACTION_LABELS = {
  moveForward: 'Step Forward',
  moveBackward: 'Step Backward',
  strafeLeft: 'Strafe Left',
  strafeRight: 'Strafe Right',
  turnLeft: 'Turn Left',
  turnRight: 'Turn Right',
  interact: 'Use / Interact',
  dropLeft: 'Left Hand: Drop / Place',
  dropRight: 'Right Hand: Drop / Place',
  inventory: 'Look Into Box (in maze)',
  slot1: 'Toggle Compass Overlay',
  slot2: 'Toggle Map Overlay',
  mute: 'Toggle Mute',
};

const TOUCH_NAMES = {
  interact: 'USE',
  dropLeft: 'L·DROP',
  dropRight: 'R·DROP',
  inventory: 'BOX',
  turnLeft: '⟲',
  turnRight: '⟳',
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

  // Prompt prefix for an action: names the on-screen button on touch
  // layouts, the bound key otherwise.
  promptFor(action) {
    if (document.body.classList.contains('touch') && TOUCH_NAMES[action]) {
      return `Tap ${TOUCH_NAMES[action]}`;
    }
    return `Press ${this.keyLabel(action)}`;
  }

  static get actionLabels() {
    return ACTION_LABELS;
  }

  static get actionList() {
    return Object.keys(DEFAULT_BINDINGS);
  }
}
