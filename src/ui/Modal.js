import { InputManager } from '../core/InputManager.js';

export class ModalManager {
  constructor({ input, gameState }) {
    this.input = input;
    this.gameState = gameState;

    this.layer = document.getElementById('modal-layer');
    this.content = document.getElementById('modal-content');
    this.closeBtn = document.getElementById('modal-close');

    this.closeBtn.addEventListener('click', () => this.close());
    this.layer.addEventListener('click', (e) => {
      if (e.target === this.layer) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen()) this.close();
    });
  }

  isOpen() {
    return !this.layer.classList.contains('hidden');
  }

  open(id) {
    this.content.innerHTML = '';
    const builders = {
      'poster-howto': () => this._howto(),
      'poster-controls': () => this._controls(),
      'poster-settings': () => this._settings(),
      bulletin: () => this._bulletin(),
      desk: () => this._desk(),
    };
    (builders[id] || (() => this._fallback(id)))();
    this.layer.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  close() {
    this.layer.classList.add('hidden');
  }

  _fallback(id) {
    this.content.innerHTML = `<h2>${id}</h2><p>Nothing to see here yet.</p>`;
  }

  _howto() {
    this.content.innerHTML = `
      <h2>How To Play</h2>
      <p>You keep a small wooden box. Climb into it and it becomes a place of its
      own &mdash; shelves, a desk, a corkboard of jobs to do. Climb the ladder to
      shrink back out into the real world, where a maze waits.</p>
      <p>Each maze is a ring. Find its far edge and the maze itself grows
      outward, wrapping a new, bigger ring around the one you just cleared.
      Clear three rings and the whole thing folds back to the start &mdash;
      a fresh maze, ready to run again.</p>
      <p>Pick up the Compass and Map lying on the shelves. Carry them with you,
      drop them wherever you like, and use them to find your way.</p>
      <ul>
        <li>WASD to move</li>
        <li>Mouse to look around (in the maze)</li>
        <li>E to interact with what's nearby</li>
        <li>Q to drop a carried item</li>
        <li>I to look into your box, or climb out of it</li>
        <li>1 / 2 to toggle the compass / map overlays</li>
      </ul>`;
  }

  _controls() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>Controls</h2><p>Click a binding, then press any key.</p>`;
    for (const action of InputManager.actionList) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const label = document.createElement('span');
      label.textContent = InputManager.actionLabels[action];
      const button = document.createElement('button');
      button.className = 'rebind';
      button.textContent = this.input.keyLabel(action);
      button.addEventListener('click', () => {
        button.textContent = '...';
        button.classList.add('listening');
        this.input.listenForRebind(action, () => {
          button.textContent = this.input.keyLabel(action);
          button.classList.remove('listening');
        });
      });
      row.append(label, button);
      wrap.appendChild(row);
    }
    this.content.appendChild(wrap);
  }

  _settings() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>Settings</h2>`;

    const sensRow = document.createElement('div');
    sensRow.className = 'keybind-row';
    const sensLabel = document.createElement('span');
    sensLabel.textContent = 'Mouse Sensitivity';
    const sensInput = document.createElement('input');
    sensInput.type = 'range';
    sensInput.min = '0.2';
    sensInput.max = '3';
    sensInput.step = '0.1';
    sensInput.value = String(this.input.sensitivity);
    sensInput.addEventListener('input', () => this.input.setSensitivity(parseFloat(sensInput.value)));
    sensRow.append(sensLabel, sensInput);
    wrap.appendChild(sensRow);

    const resetRow = document.createElement('div');
    resetRow.className = 'keybind-row';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'rebind';
    resetBtn.textContent = 'Reset Save Data';
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem('box-and-bones:save');
      window.location.reload();
    });
    resetRow.appendChild(resetBtn);
    wrap.appendChild(resetRow);

    this.content.appendChild(wrap);
  }

  _bulletin() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>Bulletin Board</h2>`;
    for (const obj of this.gameState.objectives) {
      const row = document.createElement('div');
      row.className = 'objective-row';
      row.innerHTML = `<span>${obj.done ? '✓' : '○'}</span><span class="${obj.done ? 'done' : ''}">${obj.text}</span>`;
      wrap.appendChild(row);
    }
    this.content.appendChild(wrap);
  }

  _desk() {
    const g = this.gameState;
    this.content.innerHTML = `
      <h2>Desk</h2>
      <p>A ledger, half-filled in your own hand.</p>
      <div class="objective-row"><span>Current maze layer:</span><span>${g.mazeLayer} / 3</span></div>
      <div class="objective-row"><span>Full runs completed:</span><span>${g.runsCompleted}</span></div>
      <div class="objective-row"><span>Items carried:</span><span>${g.carried.size ? [...g.carried].join(', ') : 'none'}</span></div>
    `;
  }
}
