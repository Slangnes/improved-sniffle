// On-screen controls for touch devices. Buttons synthesize KeyboardEvents
// carrying the *current* binding for each action, so every downstream
// consumer works identically to a physical keyboard, and rebinding keys
// re-routes the touch buttons too.
//
// One thumb per cluster: the left side of the screen carries the movement
// pad, the right side the action cluster. The pad is a single crawler
// rose — turn buttons sit in the top corners, each between the forward
// key and its strafe key (⟲ between ▲ and ◀, ⟳ between ▲ and ▶) — and
// drives every scene the same way. The action cluster pairs the two hand
// drop buttons side by side (L·DROP left, R·DROP right, mirroring the
// hands) above USE and BOX. The left-handed setting swaps the two
// clusters between the sides.

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
        <div id="tc-move">
          <div id="tc-dpad">
            <button type="button" class="tc-btn tc-turn" data-action="turnLeft" style="grid-area: tl">&#10226;</button>
            <button type="button" class="tc-btn" data-action="moveForward" style="grid-area: up">&#9650;</button>
            <button type="button" class="tc-btn tc-turn" data-action="turnRight" style="grid-area: tr">&#10227;</button>
            <button type="button" class="tc-btn" data-action="strafeLeft" style="grid-area: left">&#9664;</button>
            <button type="button" class="tc-btn" data-action="moveBackward" style="grid-area: down">&#9660;</button>
            <button type="button" class="tc-btn" data-action="strafeRight" style="grid-area: right">&#9654;</button>
          </div>
        </div>
      </div>
      <div id="tc-right" class="tc-side">
        <div id="tc-act">
          <div id="tc-drops">
            <button type="button" class="tc-btn tc-wide" data-action="dropLeft">L·DROP</button>
            <button type="button" class="tc-btn tc-wide" data-action="dropRight">R·DROP</button>
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

  // Swap the movement pad and the action cluster (drops/use/box) between
  // the two sides.
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
