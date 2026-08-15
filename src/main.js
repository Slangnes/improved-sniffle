import * as THREE from 'three';
import { InputManager } from './core/InputManager.js';
import { GameState } from './core/GameState.js';
import { AudioManager } from './audio/AudioManager.js';
import { MazeScene } from './maze/MazeScene.js';
import { InventoryScene } from './inventory/InventoryScene.js';
import { ModalManager } from './ui/Modal.js';
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
const modal = new ModalManager({ input, gameState, audio });
const transition = new FlattenTransition();
const touchControls = new TouchControls({ input });

let current;

const inventoryScene = new InventoryScene({
  gameState,
  input,
  audio,
  onOpenModal: (id) => modal.open(id),
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

async function toggleBox() {
  if (transition.playing || modal.isOpen()) return;
  const goingToMaze = current === inventoryScene;
  audio.playClimb();
  await transition.play(() => {
    current = goingToMaze ? mazeScene : inventoryScene;
    gameState.setScene(goingToMaze ? 'maze' : 'inventory');
    current.onResize();
    audio.startMusic(goingToMaze ? 'maze' : 'box');
  });
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  inventoryScene.onResize();
  mazeScene.onResize();
});

document.getElementById('start-button').addEventListener('click', () => {
  document.getElementById('start-overlay').classList.add('hidden');
  clock.start();
  audio.init();
  audio.resume();
  audio.startMusic('box');
});

const clock = new THREE.Clock(false);

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.running ? clock.getDelta() : 0, 0.05);

  if (clock.running && !modal.isOpen() && !transition.playing) {
    current.update(dt);
  } else {
    input.endFrame();
  }

  renderer.render(current.scene, current.camera);

  HUD.updateModeAndObjective(gameState.scene, gameState);
  HUD.updateSlots(gameState, input);
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
  if (modal.isOpen()) return;
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

window.__box = { gameState, input, audio, touchControls, inventoryScene, mazeScene, get current() { return current; } };
