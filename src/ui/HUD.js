const modeLabel = document.getElementById('hud-mode');
const objectiveLabel = document.getElementById('hud-objective');
const slotsWrap = document.getElementById('hud-slots');
const promptEl = document.getElementById('prompt');
const minimapWrap = document.getElementById('minimap-wrap');
const minimapCanvas = document.getElementById('minimap');
const compassWrap = document.getElementById('compass-wrap');
const compassNeedle = document.getElementById('compass-needle');

export function updateModeAndObjective(sceneName, gameState) {
  modeLabel.textContent = sceneName === 'maze' ? 'The Maze' : 'Inside The Box';
  objectiveLabel.textContent = gameState.currentObjectiveText();
}

// Tapping a slot icon toggles that overlay — same path as pressing its key.
slotsWrap.addEventListener('click', (e) => {
  const code = e.target.closest('.slot')?.dataset.code;
  if (!code) return;
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
});

let slotsCacheKey = null;

export function updateSlots(gameState, input) {
  const defs = [
    { id: 'compass', key: 'slot1', icon: '⟐', active: gameState.activeCompass },
    { id: 'map', key: 'slot2', icon: '⚑', active: gameState.activeMap },
  ];
  const cacheKey = defs
    .map((d) => (gameState.hasItem(d.id) ? `${d.id}:${d.active ? 1 : 0}:${input.bindings[d.key]}` : ''))
    .join('|');
  if (cacheKey === slotsCacheKey) return;
  slotsCacheKey = cacheKey;

  slotsWrap.innerHTML = '';
  for (const d of defs) {
    if (!gameState.hasItem(d.id)) continue;
    const el = document.createElement('div');
    el.className = 'slot' + (d.active ? ' active' : '');
    el.textContent = d.icon;
    el.title = `${d.id} (${input.keyLabel(d.key)})`;
    el.dataset.code = input.bindings[d.key];
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

export function drawMinimap({ cells, visited, player, exit, halfExtent }) {
  const ctx = minimapCanvas.getContext('2d');
  const size = minimapCanvas.width;
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
