const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class FlattenTransition {
  constructor() {
    this.viewport = document.getElementById('viewport');
    this.fade = document.getElementById('fade-overlay');
    this.playing = false;
  }

  async play(onSwap) {
    this.playing = true;

    this.viewport.style.transform = 'scaleY(0.02) rotateX(58deg)';
    this.viewport.style.filter = 'brightness(0.2) saturate(0.5)';
    this.fade.classList.add('active');

    await wait(520);

    onSwap();

    // Force reflow so the reverse transition actually animates.
    // eslint-disable-next-line no-unused-expressions
    this.viewport.offsetHeight;

    this.fade.classList.remove('active');
    this.viewport.style.transform = 'scaleY(1) rotateX(0deg)';
    this.viewport.style.filter = 'brightness(1) saturate(1)';

    await wait(520);
    this.playing = false;
  }
}
