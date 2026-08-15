// Generates a maze that grows outward in concentric rings, Talisman-style:
// layer 1 is a small maze at the center; layer 2 is a bigger maze that
// wraps entirely around layer 1 (which stays frozen, walls untouched);
// layer 3 wraps around layer 2. One doorway connects each ring to the next.

export const CELL_SIZE = 4;
export const WALL_HEIGHT = 3;

const DIRS = {
  N: { dx: 0, dy: -1, opposite: 'S' },
  S: { dx: 0, dy: 1, opposite: 'N' },
  E: { dx: 1, dy: 0, opposite: 'W' },
  W: { dx: -1, dy: 0, opposite: 'E' },
};

const LAYER_HALF_EXTENT = { 1: 3, 2: 7, 3: 11 };

function key(x, y) {
  return `${x},${y}`;
}

export class MazeWorld {
  constructor() {
    this.cells = new Map();
    this.layer = 0;
    this.halfExtent = 0;
    this.exit = null;
    this.startPosition = { x: 0, y: 0 };
  }

  cellAt(x, y) {
    return this.cells.get(key(x, y));
  }

  _ensureCell(x, y) {
    const k = key(x, y);
    let c = this.cells.get(k);
    if (!c) {
      c = { x, y, N: true, S: true, E: true, W: true, visited: false };
      this.cells.set(k, c);
    }
    return c;
  }

  _inBounds(x, y, half) {
    return x >= -half && x <= half && y >= -half && y <= half;
  }

  _carveFrom(startX, startY, half) {
    const start = this._ensureCell(startX, startY);
    start.visited = true;
    const stack = [start];

    while (stack.length) {
      const current = stack[stack.length - 1];
      const dirs = Object.keys(DIRS)
        .map((d) => d)
        .sort(() => Math.random() - 0.5);

      let advanced = false;
      for (const dName of dirs) {
        const { dx, dy, opposite } = DIRS[dName];
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (!this._inBounds(nx, ny, half)) continue;
        const existing = this.cells.get(key(nx, ny));
        if (existing && existing.visited) continue;

        const neighbor = this._ensureCell(nx, ny);
        current[dName] = false;
        neighbor[opposite] = false;
        neighbor.visited = true;
        stack.push(neighbor);
        advanced = true;
        break;
      }

      if (!advanced) stack.pop();
    }
  }

  generateFirstLayer() {
    this.layer = 1;
    this.halfExtent = LAYER_HALF_EXTENT[1];
    this._carveFrom(0, 0, this.halfExtent);
    this.startPosition = { x: 0, y: 0 };
    this.exit = { x: this.halfExtent, y: 0 };
    return this.exit;
  }

  extendToNextLayer() {
    const nextLayer = this.layer + 1;
    const nextHalf = LAYER_HALF_EXTENT[nextLayer];
    if (!nextHalf) return null;

    // Open a doorway from the old exit straight outward into the new ring.
    const oldExit = this.exit;
    const doorX = oldExit.x + 1;
    const doorY = oldExit.y;
    const oldExitCell = this._ensureCell(oldExit.x, oldExit.y);
    const doorCell = this._ensureCell(doorX, doorY);
    oldExitCell.E = false;
    doorCell.W = false;

    this._carveFrom(doorX, doorY, nextHalf);

    this.layer = nextLayer;
    this.halfExtent = nextHalf;
    this.exit = { x: nextHalf, y: 0 };
    return this.exit;
  }

  reset() {
    this.cells.clear();
    this.layer = 0;
    this.halfExtent = 0;
    this.exit = null;
  }

  worldPos(x, y) {
    return { x: x * CELL_SIZE, z: y * CELL_SIZE };
  }
}
