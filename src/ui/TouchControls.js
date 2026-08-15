// On-screen controls for touch devices. Buttons synthesize KeyboardEvents
// carrying the *current* binding for each action, so every downstream
// consumer (InputManager, the global slot/mute handler, scene logic) works
// identically to a physical keyboard, and rebinding keys in the Controls
// poster automatically re-routes the touch buttons too.

export class TouchControls {
  constructor({ input }) {
    this.input = input;

    const isTouch =
      'ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) document.body.classList.add('touch');

    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.innerHTML = `
      <div id="tc-dpad">
        <button type="button" class="tc-btn" data-action="moveForward" style="grid-area: up">&#9650;</button>
        <button type="button" class="tc-btn" data-action="moveLeft" style="grid-area: left">&#9664;</button>
        <button type="button" class="tc-btn" data-action="moveRight" style="grid-area: right">&#9654;</button>
        <button type="button" class="tc-btn" data-action="moveBackward" style="grid-area: down">&#9660;</button>
      </div>
      <div id="tc-actions">
        <button type="button" class="tc-btn tc-wide" data-action="interact">USE</button>
        <button type="button" class="tc-btn tc-wide" data-action="drop">DROP</button>
        <button type="button" class="tc-btn tc-wide" data-action="inventory">BOX</button>
      </div>`;
    document.body.appendChild(this.root);

    for (const btn of this.root.querySelectorAll('.tc-btn')) {
      const action = btn.dataset.action;
      const press = (e) => {
        e.preventDefault();
        btn.classList.add('held');
        this._dispatch('keydown', action);
      };
      const release = (e) => {
        e.preventDefault();
        if (!btn.classList.contains('held')) return;
        btn.classList.remove('held');
        this._dispatch('keyup', action);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  _dispatch(type, action) {
    window.dispatchEvent(new KeyboardEvent(type, { code: this.input.bindings[action] }));
  }
}
