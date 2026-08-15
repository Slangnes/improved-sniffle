import { ITEM_LABELS, POSTER_IDS } from '../core/GameState.js';

const modeLabel = document.getElementById('hud-mode');
const objectiveLabel = document.getElementById('hud-objective');
const slotsWrap = document.getElementById('hud-slots');
const promptEl = document.getElementById('prompt');
const minimapWrap = document.getElementById('minimap-wrap');
const minimapCanvas = document.getElementById('minimap');
const compassWrap = document.getElementById('compass-wrap');
const compassNeedle = document.getElementById('compass-needle');

const SLOT_ICONS = { compass: '⟐', map: '⚑' };
for (const id of POSTER_IDS) SLOT_ICONS[id] = '☰';

let slotTapHandler = null;

// Tapping a carried item's icon opens its detailed view.
export function setSlotTapHandler(fn) {
  slotTapHandler = fn;
}

slotsWrap.addEventListener('click', (e) => {
  const id = e.target.closest('.slot')?.dataset.item;
  if (id && slotTapHandler) slotTapHandler(id);
});

export function updateModeAndObjective(sceneName, gameState) {
  modeLabel.textContent = sceneName === 'maze' ? 'The Maze' : 'Inside The Box';
  objectiveLabel.textContent = gameState.currentObjectiveText();
}

let slotsCacheKey = null;

export function updateSlots(gameState) {
  const activeFor = (id) =>
    id === 'compass' ? gameState.activeCompass : id === 'map' ? gameState.activeMap : false;
  const cacheKey = gameState.carried.map((id) => `${id}:${activeFor(id) ? 1 : 0}`).join('|');
  if (cacheKey === slotsCacheKey) return;
  slotsCacheKey = cacheKey;

  slotsWrap.innerHTML = '';
  for (const id of gameState.carried) {
    const el = document.createElement('div');
    el.className = 'slot' + (activeFor(id) ? ' active' : '');
    el.textContent = SLOT_ICONS[id] || '?';
    el.title = ITEM_LABELS[id] || id;
    el.dataset.item = id;
    slotsWrap.appendChild(el);
  }
}

export function setPrompt(text) {
  if (text) {
    promptEl.textContent = text;
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }
}

export function setCompassVisible(visible) {
  compassWrap.classList.toggle('hidden', !visible);
}

export function setCompassBearing(radians) {
  const deg = (radians * 180) / Math.PI;
  compassNeedle.style.transform = `rotate(${deg}deg)`;
}

export function setMinimapVisible(visible) {
  minimapWrap.classList.toggle('hidden', !visible);
}

export function drawMinimap(data) {
  drawMinimapInto(minimapCanvas, data);
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
