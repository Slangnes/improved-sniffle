// On-screen controls for touch devices. Buttons synthesize KeyboardEvents
// carrying the *current* binding for each action, so every downstream
// consumer works identically to a physical keyboard, and rebinding keys
// re-routes the touch buttons too.
//
// Layout mirrors the hands: the left side of the screen carries the left
// hand's drop button (plus, by default, the movement pad); the right side
// carries the right hand's drop button with the turn/use cluster. The
// left-handed setting swaps the movement and action clusters between the
// sides — the hand drop buttons stay on their own hand's side.

export class TouchControls {
  constructor({ input }) {
    this.input = input;

    const isTouch =
      'ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) document.body.classList.add('touch');

    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.innerHTML = `
      <div id="tc-left" class="tc-side">
        <button type="button" class="tc-btn tc-wide" data-action="dropLeft">L·DROP</button>
        <div id="tc-move">
          <div id="tc-dpad">
            <button type="button" class="tc-btn" data-action="moveForward" style="grid-area: up">&#9650;</button>
            <button type="button" class="tc-btn" data-action="strafeLeft" style="grid-area: left">&#9664;</button>
            <button type="button" class="tc-btn" data-action="strafeRight" style="grid-area: right">&#9654;</button>
            <button type="button" class="tc-btn" data-action="moveBackward" style="grid-area: down">&#9660;</button>
          </div>
        </div>
      </div>
      <div id="tc-right" class="tc-side">
        <button type="button" class="tc-btn tc-wide" data-action="dropRight">R·DROP</button>
        <div id="tc-act">
          <div id="tc-turns">
            <button type="button" class="tc-btn" data-action="turnLeft">&#10226;</button>
            <button type="button" class="tc-btn" data-action="turnRight">&#10227;</button>
          </div>
          <button type="button" class="tc-btn tc-wide" data-action="interact">USE</button>
          <button type="button" class="tc-btn tc-wide tc-box" data-action="inventory">BOX</button>
        </div>
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

    this.applyHandedness(localStorage.getItem('box-and-bones:leftHanded') === '1');
  }

  // Swap the movement pad and the turn/use cluster between the two sides.
  // Each side's hand-drop button stays put.
  applyHandedness(leftHanded) {
    const leftSide = this.root.querySelector('#tc-left');
    const rightSide = this.root.querySelector('#tc-right');
    const move = this.root.querySelector('#tc-move');
    const act = this.root.querySelector('#tc-act');
    if (leftHanded) {
      leftSide.appendChild(act);
      rightSide.appendChild(move);
    } else {
      leftSide.appendChild(move);
      rightSide.appendChild(act);
    }
    document.body.classList.toggle('left-handed', leftHanded);
  }

  _dispatch(type, action) {
    window.dispatchEvent(new KeyboardEvent(type, { code: this.input.bindings[action] }));
  }
}
