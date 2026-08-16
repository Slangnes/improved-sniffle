import { ITEM_LABELS, POSTER_IDS } from '../core/GameState.js';

const modeLabel = document.getElementById('hud-mode');
const objectiveLabel = document.getElementById('hud-objective');
const handLeftEl = document.getElementById('hand-left');
const handRightEl = document.getElementById('hand-right');
const promptEl = document.getElementById('prompt');

const SLOT_ICONS = { compass: '⟐', map: '⚑' };
for (const id of POSTER_IDS) SLOT_ICONS[id] = '☰';

let handTapHandler = null;

// Tapping a hand's held item slides it up for a closer look.
export function setHandTapHandler(fn) {
  handTapHandler = fn;
}

for (const el of [handLeftEl, handRightEl]) {
  el.addEventListener('click', () => {
    if (el.dataset.item && handTapHandler) handTapHandler(el.dataset.item, el);
  });
}

// The prompt line doubles as a button: tapping it performs the action it
// names. The handler receives the action the current prompt implies.
let promptTapHandler = null;

export function setPromptTapHandler(fn) {
  promptTapHandler = fn;
}

promptEl.addEventListener('click', () => {
  if (promptEl.dataset.action && promptTapHandler) {
    promptTapHandler(promptEl.dataset.action);
  }
});

export function updateModeAndObjective(sceneName, gameState) {
  modeLabel.textContent = sceneName === 'maze' ? 'The Maze' : 'Inside The Box';
  objectiveLabel.textContent = gameState.currentObjectiveText();
}

let handsCacheKey = null;

// Each hand's item shows on that hand's side of the screen. The map and
// compass are not icons but the items themselves: an awake map shows the
// live inked minimap, an awake compass its needle, right in the slot.
export function updateHands(gameState) {
  const activeFor = (id) =>
    id === 'compass' ? gameState.activeCompass : id === 'map' ? gameState.activeMap : false;
  const { left, right } = gameState.hands;
  const cacheKey = `${left}:${left ? activeFor(left) : ''}|${right}:${right ? activeFor(right) : ''}`;
  if (cacheKey === handsCacheKey) return;
  handsCacheKey = cacheKey;

  const apply = (el, id, sideLabel) => {
    el.classList.toggle('empty', !id);
    el.classList.toggle('active', !!id && activeFor(id));
    const face = el.querySelector('.hand-face');
    const showFace = (id === 'map' || id === 'compass') && activeFor(id);
    el.classList.toggle('has-face', showFace);
    face.innerHTML = '';
    if (showFace && id === 'map') {
      const canvas = document.createElement('canvas');
      canvas.className = 'hand-minimap';
      canvas.width = 112;
      canvas.height = 112;
      face.appendChild(canvas);
    } else if (showFace && id === 'compass') {
      face.innerHTML = '<span class="hand-dial"><span class="hand-needle"></span></span>';
    }
    el.querySelector('.hand-icon').textContent = id ? SLOT_ICONS[id] || '?' : '';
    el.title = id ? ITEM_LABELS[id] : `${sideLabel} hand (empty)`;
    if (id) el.dataset.item = id;
    else delete el.dataset.item;
  };
  apply(handLeftEl, left, 'Left');
  apply(handRightEl, right, 'Right');
}

// Per-frame refresh of the live item faces: redraw the map's corridors,
// point the compass needle (in the box it only drifts).
export function updateHandFaces({ mazeScene, inMaze, time }) {
  const mapCanvas = document.querySelector('.hand-slot .hand-minimap');
  if (mapCanvas) drawMinimapInto(mapCanvas, mazeScene.minimapData());

  const needle = document.querySelector('.hand-slot .hand-needle');
  if (needle) {
    const rad = inMaze ? mazeScene.exitWorldBearingFrom() : Math.sin(time * 0.7) * 0.6;
    needle.style.transform = `rotate(${(rad * 180) / Math.PI}deg)`;
  }
}

export function setPrompt(text, action) {
  if (text) {
    promptEl.textContent = text;
    promptEl.classList.remove('hidden');
    promptEl.classList.toggle('actionable', !!action);
    if (action) promptEl.dataset.action = action;
    else delete promptEl.dataset.action;
  } else {
    promptEl.classList.add('hidden');
    promptEl.classList.remove('actionable');
    delete promptEl.dataset.action;
  }
}

export function drawMinimapInto(canvas, { cells, visited, player, exit, halfExtent }) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(5,5,10,0.6)';
  ctx.fillRect(0, 0, size, size);

  const span = halfExtent * 2 + 1;
  const cell = size / span;
  const toPx = (x, y) => ({
    px: (x + halfExtent) * cell,
    py: (y + halfExtent) * cell,
  });

  ctx.strokeStyle = '#cbb97a';
  ctx.lineWidth = Math.max(1, cell * 0.12);

  for (const key of visited) {
    const [cx, cy] = key.split(',').map(Number);
    const c = cells.get(key);
    if (!c) continue;
    const { px, py } = toPx(cx, cy);
    const half = cell / 2;
    ctx.beginPath();
    if (c.N) {
      ctx.moveTo(px - half, py - half);
      ctx.lineTo(px + half, py - half);
    }
    if (c.S) {
      ctx.moveTo(px - half, py + half);
      ctx.lineTo(px + half, py + half);
    }
    if (c.E) {
      ctx.moveTo(px + half, py - half);
      ctx.lineTo(px + half, py + half);
    }
    if (c.W) {
      ctx.moveTo(px - half, py - half);
      ctx.lineTo(px - half, py + half);
    }
    ctx.stroke();
  }

  const exitPx = toPx(exit.x, exit.y);
  ctx.fillStyle = '#7ee8c6';
  ctx.beginPath();
  ctx.arc(exitPx.px, exitPx.py, cell * 0.25, 0, Math.PI * 2);
  ctx.fill();

  const playerPx = toPx(player.x, player.y);
  ctx.fillStyle = '#e8c96a';
  ctx.beginPath();
  ctx.arc(playerPx.px, playerPx.py, cell * 0.3, 0, Math.PI * 2);
  ctx.fill();
}
