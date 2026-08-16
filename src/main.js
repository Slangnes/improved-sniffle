import * as THREE from 'three';
import { InputManager } from './core/InputManager.js';
import { GameState } from './core/GameState.js';
import { AudioManager } from './audio/AudioManager.js';
import { MazeScene } from './maze/MazeScene.js';
import { InventoryScene } from './inventory/InventoryScene.js';
import { DetailView } from './ui/DetailView.js';
import { FlattenTransition } from './transition/FlattenTransition.js';
import { TouchControls } from './ui/TouchControls.js';
import * as HUD from './ui/HUD.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const input = new InputManager();
const gameState = new GameState();
const audio = new AudioManager();
const transition = new FlattenTransition();
const touchControls = new TouchControls({ input });
const detailView = new DetailView({ input, gameState, audio });

let current;

const inventoryScene = new InventoryScene({
  gameState,
  input,
  audio,
  onOpenDetail: (id) => detailView.open(id),
  onClimbOut: () => toggleBox(),
});

const mazeScene = new MazeScene({
  gameState,
  input,
  audio,
  onRequestBox: () => toggleBox(),
  onLayerComplete: () => audio.playLayerExtend(),
  onRunComplete: () => audio.playRunComplete(),
});

current = inventoryScene;
gameState.setScene('inventory');
document.body.classList.add('in-box');

const clock = new THREE.Clock(false);

detailView.attach({
  inventoryScene,
  mazeScene,
  touchControls,
  onBegin: () => {
    clock.start();
    audio.init();
    audio.resume();
    audio.startMusic('box');
  },
});

// The game opens on the title poster's detailed view; Begin zooms out
// into the isometric box.
detailView.openBoot();

async function toggleBox() {
  if (transition.playing || detailView.isOpen()) return;
  const goingToMaze = current === inventoryScene;
  audio.playClimb();
  await transition.play(current, goingToMaze ? mazeScene : inventoryScene, () => {
    current = goingToMaze ? mazeScene : inventoryScene;
    gameState.setScene(goingToMaze ? 'maze' : 'inventory');
    document.body.classList.toggle('in-box', !goingToMaze);
    if (!goingToMaze) inventoryScene.enterAtLadder();
    current.onResize();
    audio.startMusic(goingToMaze ? 'maze' : 'box');
  });
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  inventoryScene.onResize();
  mazeScene.onResize();
});

HUD.setHandTapHandler((id) => {
  if (transition.playing) return;
  detailView.openItem(id);
});

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.running ? clock.getDelta() : 0, 0.05);

  transition.update(dt);
  detailView.update(dt);

  if (clock.running && !detailView.isOpen() && !transition.playing) {
    current.update(dt);
  } else {
    input.endFrame();
  }

  renderer.render(current.scene, current.camera);

  HUD.updateModeAndObjective(gameState.scene, gameState);
  HUD.updateHands(gameState);
  HUD.setPrompt(current.toastMessage || current.prompt);

  const compassOn = gameState.hasItem('compass') && gameState.activeCompass;
  HUD.setCompassVisible(compassOn && current === mazeScene);
  if (compassOn && current === mazeScene) {
    HUD.setCompassBearing(mazeScene.exitWorldBearingFrom());
  }

  const mapOn = gameState.hasItem('map') && gameState.activeMap;
  HUD.setMinimapVisible(mapOn && current === mazeScene);
  if (mapOn && current === mazeScene) {
    HUD.drawMinimap(mazeScene.minimapData());
  }
}

window.addEventListener('keydown', (e) => {
  if (detailView.isOpen()) return;
  if (input.bindings.slot1 === e.code && gameState.hasItem('compass')) {
    gameState.activeCompass = !gameState.activeCompass;
    gameState.save();
    audio.playToggle(gameState.activeCompass);
  }
  if (input.bindings.slot2 === e.code && gameState.hasItem('map')) {
    gameState.activeMap = !gameState.activeMap;
    gameState.save();
    audio.playToggle(gameState.activeMap);
  }
  if (input.bindings.mute === e.code) {
    audio.toggleMuted();
  }
});

frame();

window.__box = {
  gameState,
  input,
  audio,
  touchControls,
  detailView,
  transition,
  inventoryScene,
  mazeScene,
  get current() {
    return current;
  },
};
