import * as THREE from 'three';
import { MazeWorld, CELL_SIZE, WALL_HEIGHT } from './MazeGenerator.js';
import { createWallTexture, createFloorTexture, createCeilingTexture } from './textures.js';
import { POSTER_IDS, ITEM_LABELS } from '../core/GameState.js';

const BASE_FOV = 72;
const FLAT_FOV = 16;
const DOLLY_BACK = 2.4;

const WALL_THICKNESS = 0.25;
const PLAYER_HEIGHT = 1.65;
const MAX_INSTANCES = 2400;
const STEP_DURATION = 0.22;
const TURN_DURATION = 0.16;

// N/E/S/W in generator-grid order; yaw values match the existing worldPos/forward-vector convention.
const FACINGS = [
  { wall: 'N', dx: 0, dy: -1, yaw: 0 },
  { wall: 'E', dx: 1, dy: 0, yaw: -Math.PI / 2 },
  { wall: 'S', dx: 0, dy: 1, yaw: Math.PI },
  { wall: 'W', dx: -1, dy: 0, yaw: Math.PI / 2 },
];

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
const ITEM_MESH_DEFS = {
  compass: () => {
    const g = new THREE.ConeGeometry(0.22, 0.4, 6);
    const m = new THREE.MeshStandardMaterial({ color: 0xd9b24c, emissive: 0x2a1c00 });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = Math.PI;
    return mesh;
  },
  map: () => {
    const g = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
    const m = new THREE.MeshStandardMaterial({ color: 0xe8dcb0 });
    return new THREE.Mesh(g, m);
  },
};

// Posters dropped in the maze lie on the floor as rolled scrolls.
for (const posterId of POSTER_IDS) {
  ITEM_MESH_DEFS[posterId] = () => {
    const group = new THREE.Group();
    const paper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.66, 10),
      new THREE.MeshStandardMaterial({ color: 0xe6d9b2 })
    );
    paper.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.13, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a4a2a })
    );
    band.rotation.z = Math.PI / 2;
    group.add(paper, band);
    return group;
  };
}

export class MazeScene {
  constructor({ gameState, input, audio, onLayerComplete, onRunComplete, onRequestBox }) {
    this.gameState = gameState;
    this.input = input;
    this.audio = audio;
    this.onLayerComplete = onLayerComplete;
    this.onRunComplete = onRunComplete;
    this.onRequestBox = onRequestBox;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14121a);
    this.scene.fog = new THREE.Fog(0x14121a, 7, 24);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.rotation.order = 'YXZ';
    this.transitionBack = 0;

    this.world = new MazeWorld();

    this.wallMesh = null;
    this.floorMesh = null;
    this.ceilingMesh = null;
    this.exitMarker = null;
    this.itemMeshes = new Map();

    this.visitedCells = new Set();

    this.cellX = 0;
    this.cellY = 0;
    this.facing = 0;
    this.yaw = 0;
    this.playerX = 0;
    this.playerZ = 0;

    this.isAnimating = false;
    this.animT = 0;
    this.animDuration = STEP_DURATION;
    this.animFrom = { x: 0, z: 0, yaw: 0 };
    this.animTo = { x: 0, z: 0, yaw: 0 };

    this.toastMessage = null;
    this.toastTimer = 0;
    this.prompt = null;

    this._buildLights();
    this._buildWallPool();
    this._restoreLayerFromState();
    this._rebuildStaticGeometry();
    this._syncItemMeshes();

    this.cellX = this.world.startPosition.x;
    this.cellY = this.world.startPosition.y;
    this.facing = this._openFacingIndex(this.cellX, this.cellY);
    this.yaw = FACINGS[this.facing].yaw;
    const start = this.world.worldPos(this.cellX, this.cellY);
    this.playerX = start.x;
    this.playerZ = start.z;
  }

  _openFacingIndex(x, y) {
    const cell = this.world.cellAt(x, y);
    if (!cell) return 0;
    const idx = FACINGS.findIndex((f) => !cell[f.wall]);
    return idx === -1 ? 0 : idx;
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0x6b6478, 0.9);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x8a8fa8, 0x2a2620, 0.7);
    this.scene.add(hemi);

    this.torch = new THREE.PointLight(0xffc98f, 3.2, 16, 1.6);
    this.torch.position.set(0, PLAYER_HEIGHT, 0);
    this.scene.add(this.torch);
  }

  _buildWallPool() {
    const geometry = new THREE.BoxGeometry(1, WALL_HEIGHT, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      map: createWallTexture(),
    });
    this.wallMesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    this.wallMesh.count = 0;
    this.wallMesh.castShadow = false;
    this.scene.add(this.wallMesh);

    this.floorTexture = createFloorTexture();
    this.ceilingTexture = createCeilingTexture();
  }

  _restoreLayerFromState() {
    this.world.generateFirstLayer();
    const targetLayer = this.gameState.mazeLayer;
    while (this.world.layer < targetLayer) {
      this.world.extendToNextLayer();
    }
  }

  _rebuildStaticGeometry() {
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    const addWall = (edgeCx, edgeCz, w, d) => {
      dummy.position.set(edgeCx, WALL_HEIGHT / 2, edgeCz);
      dummy.scale.set(w, 1, d);
      dummy.updateMatrix();
      if (instanceIndex < MAX_INSTANCES) {
        this.wallMesh.setMatrixAt(instanceIndex, dummy.matrix);
        instanceIndex += 1;
      }
    };

    for (const cell of this.world.cells.values()) {
      const { x: cx, z: cz } = this.world.worldPos(cell.x, cell.y);
      const half = CELL_SIZE / 2;

      if (cell.N) addWall(cx, cz - half, CELL_SIZE + WALL_THICKNESS, WALL_THICKNESS);
      if (cell.S) addWall(cx, cz + half, CELL_SIZE + WALL_THICKNESS, WALL_THICKNESS);
      if (cell.E) addWall(cx + half, cz, WALL_THICKNESS, CELL_SIZE + WALL_THICKNESS);
      if (cell.W) addWall(cx - half, cz, WALL_THICKNESS, CELL_SIZE + WALL_THICKNESS);
    }

    this.wallMesh.count = instanceIndex;
    this.wallMesh.instanceMatrix.needsUpdate = true;

    this._rebuildFloorCeiling();
    this._rebuildExitMarker();
  }

  _rebuildFloorCeiling() {
    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
      this.floorMesh.geometry.dispose();
    }
    if (this.ceilingMesh) {
      this.scene.remove(this.ceilingMesh);
      this.ceilingMesh.geometry.dispose();
    }

    const span = this.world.halfExtent * 2 * CELL_SIZE + CELL_SIZE * 2;
    const tiles = span / CELL_SIZE;

    this.floorTexture.repeat.set(tiles, tiles);
    const floorGeo = new THREE.PlaneGeometry(span, span);
    const floorMat = new THREE.MeshStandardMaterial({ map: this.floorTexture, roughness: 1 });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.floorMesh);

    this.ceilingTexture.repeat.set(tiles, tiles);
    const ceilGeo = new THREE.PlaneGeometry(span, span);
    const ceilMat = new THREE.MeshStandardMaterial({ map: this.ceilingTexture, roughness: 1 });
    this.ceilingMesh = new THREE.Mesh(ceilGeo, ceilMat);
    this.ceilingMesh.rotation.x = Math.PI / 2;
    this.ceilingMesh.position.y = WALL_HEIGHT;
    this.scene.add(this.ceilingMesh);
  }

  _rebuildExitMarker() {
    if (this.exitMarker) {
      this.scene.remove(this.exitMarker);
    }
    const pos = this.world.worldPos(this.world.exit.x, this.world.exit.y);
    const geo = new THREE.CylinderGeometry(0.05, 0.3, WALL_HEIGHT * 0.95, 10, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7ee8c6, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    this.exitMarker = new THREE.Mesh(geo, mat);
    this.exitMarker.position.set(pos.x, WALL_HEIGHT / 2, pos.z);
    const light = new THREE.PointLight(0x7ee8c6, 1.2, 6);
    light.position.set(0, 0, 0);
    this.exitMarker.add(light);
    this.scene.add(this.exitMarker);
  }

  _syncItemMeshes() {
    for (const mesh of this.itemMeshes.values()) this.scene.remove(mesh);
    this.itemMeshes.clear();

    for (const [id, loc] of this.gameState.itemLocationIn('maze')) {
      const build = ITEM_MESH_DEFS[id];
      if (!build) continue;
      const mesh = build();
      mesh.position.set(loc.x, POSTER_IDS.includes(id) ? 0.14 : 0.4, loc.z);
      this.scene.add(mesh);
      this.itemMeshes.set(id, mesh);
    }
  }

  setToast(message, seconds) {
    this.toastMessage = message;
    this.toastTimer = seconds;
  }

  currentCellCoord() {
    return { x: this.cellX, y: this.cellY };
  }

  _beginStep(dCellX, dCellY) {
    const target = this.world.worldPos(this.cellX + dCellX, this.cellY + dCellY);
    this.animFrom = { x: this.playerX, z: this.playerZ, yaw: this.yaw };
    this.animTo = { x: target.x, z: target.z, yaw: this.yaw };
    this.animDuration = STEP_DURATION;
    this.animT = 0;
    this.isAnimating = true;
    this.cellX += dCellX;
    this.cellY += dCellY;
    this.audio.footstep('stone');
  }

  _beginTurn(newFacing) {
    this.facing = newFacing;
    const delta = angleDelta(this.yaw, FACINGS[newFacing].yaw);
    this.animFrom = { x: this.playerX, z: this.playerZ, yaw: this.yaw };
    this.animTo = { x: this.playerX, z: this.playerZ, yaw: this.yaw + delta };
    this.animDuration = TURN_DURATION;
    this.animT = 0;
    this.isAnimating = true;
  }

  _tryStep(directionIndex) {
    const cell = this.world.cellAt(this.cellX, this.cellY);
    const dir = FACINGS[directionIndex];
    if (cell[dir.wall]) {
      this.audio.playBump();
      return;
    }
    this._beginStep(dir.dx, dir.dy);
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastMessage = null;
    }

    if (this.isAnimating) {
      this.animT += dt / this.animDuration;
      if (this.animT >= 1) {
        this.animT = 1;
        this.isAnimating = false;
      }
      const t = easeInOutQuad(this.animT);
      this.playerX = this.animFrom.x + (this.animTo.x - this.animFrom.x) * t;
      this.playerZ = this.animFrom.z + (this.animTo.z - this.animFrom.z) * t;
      this.yaw = this.animFrom.yaw + (this.animTo.yaw - this.animFrom.yaw) * t;
    } else if (this.input.isDown('moveForward')) {
      this._tryStep(this.facing);
    } else if (this.input.isDown('moveBackward')) {
      this._tryStep((this.facing + 2) % 4);
    } else if (this.input.isDown('moveLeft')) {
      this._beginTurn((this.facing + 3) % 4);
    } else if (this.input.isDown('moveRight')) {
      this._beginTurn((this.facing + 1) % 4);
    }

    this.visitedCells.add(`${this.cellX},${this.cellY}`);

    this._applyCamera();
    this.torch.position.set(this.playerX, PLAYER_HEIGHT, this.playerZ);

    this._handleInteractions();
    if (!this.isAnimating) this._checkExit();

    this.input.endFrame();
  }

  _handleInteractions() {
    let nearestId = null;
    let nearestDist = 1.3;
    for (const [id, mesh] of this.itemMeshes.entries()) {
      const d = Math.hypot(mesh.position.x - this.playerX, mesh.position.z - this.playerZ);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = id;
      }
    }

    if (nearestId) {
      this.prompt = `${this.input.promptFor('interact')} to pick up the ${ITEM_LABELS[nearestId]}`;
      if (this.input.wasPressed('interact')) {
        this.gameState.pickUp(nearestId);
        this.scene.remove(this.itemMeshes.get(nearestId));
        this.itemMeshes.delete(nearestId);
        this.setToast(`Picked up the ${ITEM_LABELS[nearestId]}.`, 2);
        this.audio.playPickup();
      }
    } else {
      this.prompt = `${this.input.promptFor('inventory')} to look into your box`;
    }

    if (this.input.wasPressed('drop')) {
      const toDrop = this.gameState.topCarried();
      if (toDrop) {
        this.gameState.drop(toDrop, 'maze', this.playerX, this.playerZ);
        this._syncItemMeshes();
        this.setToast(`Dropped the ${ITEM_LABELS[toDrop]}.`, 2);
        this.audio.playDrop();
      }
    }

    if (this.input.wasPressed('inventory') && this.onRequestBox) {
      this.onRequestBox();
    }
  }

  _checkExit() {
    if (this.cellX !== this.world.exit.x || this.cellY !== this.world.exit.y) return;

    if (this.world.layer < 3) {
      const prevLayer = this.world.layer;
      this.world.extendToNextLayer();
      this.gameState.advanceLayer();
      this._rebuildStaticGeometry();
      this._syncItemMeshes();
      this.setToast(`Layer ${prevLayer} cleared. The maze extends outward...`, 3.5);
      if (this.onLayerComplete) this.onLayerComplete(this.world.layer);
    } else {
      this.gameState.completeRun();
      this.world.reset();
      this.world.generateFirstLayer();
      this._rebuildStaticGeometry();
      this._syncItemMeshes();
      this.cellX = this.world.startPosition.x;
      this.cellY = this.world.startPosition.y;
      this.facing = this._openFacingIndex(this.cellX, this.cellY);
      this.yaw = FACINGS[this.facing].yaw;
      const start = this.world.worldPos(this.cellX, this.cellY);
      this.playerX = start.x;
      this.playerZ = start.z;
      this.visitedCells.clear();
      this.setToast('You escaped the depths! The maze reshapes itself...', 4);
      if (this.onRunComplete) this.onRunComplete();
    }
  }

  exitWorldBearingFrom() {
    const exitPos = this.world.worldPos(this.world.exit.x, this.world.exit.y);
    const angle = Math.atan2(exitPos.x - this.playerX, -(exitPos.z - this.playerZ));
    return angle - this.yaw;
  }

  minimapData() {
    return {
      cells: this.world.cells,
      visited: this.visitedCells,
      player: this.currentCellCoord(),
      exit: this.world.exit,
      halfExtent: this.world.halfExtent,
    };
  }

  _applyCamera() {
    // Forward vector for the current yaw (yaw 0 looks down -z).
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.camera.position.set(
      this.playerX - fx * this.transitionBack,
      PLAYER_HEIGHT,
      this.playerZ - fz * this.transitionBack
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = 0;
  }

  // Dolly-zoom "flatten": narrowing the FOV while pulling the camera back
  // crushes the perspective until the corridor reads as a flat picture —
  // the world going 2D as you shrink into the box (and the reverse on the
  // way out).
  transitionOut(t) {
    this.camera.fov = BASE_FOV - (BASE_FOV - FLAT_FOV) * t;
    this.transitionBack = DOLLY_BACK * t;
    this.camera.updateProjectionMatrix();
    this._applyCamera();
  }

  transitionIn(t) {
    this.camera.fov = FLAT_FOV + (BASE_FOV - FLAT_FOV) * t;
    this.transitionBack = DOLLY_BACK * (1 - t);
    this.camera.updateProjectionMatrix();
    this._applyCamera();
  }

  transitionReset() {
    this.camera.fov = BASE_FOV;
    this.transitionBack = 0;
    this.camera.updateProjectionMatrix();
    this._applyCamera();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
