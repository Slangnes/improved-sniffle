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
  slot1: 'Wake / Stow the Compass',
  slot2: 'Wake / Stow the Map',
  mute: 'Toggle Mute',
};

// Actions with a named on-screen button. Anything else (interact, the
// box) is triggered by tapping the prompt line itself, or the object.
const TOUCH_NAMES = {
  dropLeft: 'L·DROP',
  dropRight: 'R·DROP',
  turnLeft: '⟲',
  turnRight: '⟳',
};

// The arrow keys always work, on top of whatever is bound: up/down step,
// left/right turn — the classic crawler layout.
const FIXED_ALIASES = {
  moveForward: ['ArrowUp'],
  moveBackward: ['ArrowDown'],
  turnLeft: ['ArrowLeft'],
  turnRight: ['ArrowRight'],
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

  _codesFor(action) {
    return [this.bindings[action], ...(FIXED_ALIASES[action] || [])];
  }

  isDown(action) {
    return this._codesFor(action).some((c) => this.keysDown.has(c));
  }

  wasPressed(action) {
    return this._codesFor(action).some((c) => this.actionsPressedThisFrame.has(c));
  }

  // Of the given actions currently held, the one whose key was pressed most
  // recently — so a newly pressed direction always wins over one still held.
  latestDown(actions) {
    let latest = null;
    for (const code of this.keysDown) {
      for (const action of actions) {
        if (this._codesFor(action).includes(code)) latest = action;
      }
    }
    return latest;
  }

  endFrame() {
    this.actionsPressedThisFrame.clear();
  }

  keyLabel(action) {
    const code = this.bindings[action];
    return code.replace('Key', '').replace('Digit', '').replace('Arrow', '');
  }

  // Prompt prefix for an action: on touch layouts it names the on-screen
  // button, or invites tapping the prompt itself when the action has no
  // button of its own; otherwise it names the bound key.
  promptFor(action) {
    if (document.body.classList.contains('touch')) {
      return TOUCH_NAMES[action] ? `Tap ${TOUCH_NAMES[action]}` : 'Tap here';
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
