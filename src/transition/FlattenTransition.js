const OUT_DURATION = 0.5;
const IN_DURATION = 0.7;

const ease = (t) => t * t * (3 - 2 * t);

// Scene-swap choreography, done in-engine rather than with CSS transforms:
// the outgoing scene animates its camera "flat" (the maze dolly-zooms to a
// telephoto crush; the box dives onto the player) while the screen dips to
// black, then the incoming scene animates back out to its natural framing.
// Scenes implement transitionOut(t) / transitionIn(t) / transitionReset().
export class FlattenTransition {
  constructor() {
    this.fade = document.getElementById('fade-overlay');
    this.playing = false;
    this.phase = null; // 'out' | 'in'
    this.t = 0;
    this.scene = null;
    this._resolve = null;
  }

  play(fromScene, toScene, onSwap) {
    if (this.playing) return Promise.resolve();
    this.playing = true;
    this.phase = 'out';
    this.t = 0;
    this.scene = fromScene;
    this.fade.classList.add('active');

    return new Promise((resolve) => {
      this._resolve = resolve;
      this._onSwap = onSwap;
      this._toScene = toScene;
    });
  }

  update(dt) {
    if (!this.playing || dt <= 0) return;

    if (this.phase === 'out') {
      this.t += dt / OUT_DURATION;
      if (this.t >= 1) {
        this.scene.transitionOut(1);
        this.scene.transitionReset();
        this._onSwap();
        this.scene = this._toScene;
        this.phase = 'in';
        this.t = 0;
        this.scene.transitionIn(0);
        this.fade.classList.remove('active');
      } else {
        this.scene.transitionOut(ease(this.t));
      }
    } else if (this.phase === 'in') {
      this.t += dt / IN_DURATION;
      if (this.t >= 1) {
        this.scene.transitionReset();
        this.playing = false;
        this.phase = null;
        this.scene = null;
        const resolve = this._resolve;
        this._resolve = null;
        if (resolve) resolve();
      } else {
        this.scene.transitionIn(ease(this.t));
      }
    }
  }
}
