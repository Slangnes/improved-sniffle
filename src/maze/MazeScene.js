import * as THREE from 'three';
import { MazeWorld, CELL_SIZE, WALL_HEIGHT } from './MazeGenerator.js';
import { createWallTexture, createFloorTexture, createCeilingTexture } from './textures.js';

const WALL_THICKNESS = 0.25;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.65;
const MOVE_SPEED = 4.6;
const MAX_INSTANCES = 2400;
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

const ITEM_LABELS = { compass: 'Compass', map: 'Map' };

export class MazeScene {
  constructor({ gameState, input, onLayerComplete, onRunComplete, onRequestBox }) {
    this.gameState = gameState;
    this.input = input;
    this.onLayerComplete = onLayerComplete;
    this.onRunComplete = onRunComplete;
    this.onRequestBox = onRequestBox;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14121a);
    this.scene.fog = new THREE.Fog(0x14121a, 7, 24);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.rotation.order = 'YXZ';

    this.world = new MazeWorld();

    this.wallMesh = null;
    this.floorMesh = null;
    this.ceilingMesh = null;
    this.exitMarker = null;
    this.itemMeshes = new Map();

    this.collidersByCell = new Map();
    this.visitedCells = new Set();

    this.yaw = 0;
    this.pitch = 0;
    this.playerX = 0;
    this.playerZ = 0;

    this.toastMessage = null;
    this.toastTimer = 0;
    this.prompt = null;

    this._buildLights();
    this._buildWallPool();
    this._restoreLayerFromState();
    this._rebuildStaticGeometry();
    this._syncItemMeshes();

    const start = this.world.worldPos(this.world.startPosition.x, this.world.startPosition.y);
    this.playerX = start.x;
    this.playerZ = start.z;
    this.yaw = this._openFacingYaw(this.world.startPosition.x, this.world.startPosition.y);
  }

  _openFacingYaw(x, y) {
    const cell = this.world.cellAt(x, y);
    if (!cell) return 0;
    if (!cell.N) return 0;
    if (!cell.E) return -Math.PI / 2;
    if (!cell.S) return Math.PI;
    if (!cell.W) return Math.PI / 2;
    return 0;
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
    this.collidersByCell.clear();
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (const cell of this.world.cells.values()) {
      const { x: cx, z: cz } = this.world.worldPos(cell.x, cell.y);
      const half = CELL_SIZE / 2;
      const colliders = [];

      const addWall = (edgeCx, edgeCz, w, d) => {
        dummy.position.set(edgeCx, WALL_HEIGHT / 2, edgeCz);
        dummy.scale.set(w, 1, d);
        dummy.updateMatrix();
        if (instanceIndex < MAX_INSTANCES) {
          this.wallMesh.setMatrixAt(instanceIndex, dummy.matrix);
          instanceIndex += 1;
        }
        colliders.push({
          minX: edgeCx - w / 2,
          maxX: edgeCx + w / 2,
          minZ: edgeCz - d / 2,
          maxZ: edgeCz + d / 2,
        });
      };

      if (cell.N) addWall(cx, cz - half, CELL_SIZE + WALL_THICKNESS, WALL_THICKNESS);
      if (cell.S) addWall(cx, cz + half, CELL_SIZE + WALL_THICKNESS, WALL_THICKNESS);
      if (cell.E) addWall(cx + half, cz, WALL_THICKNESS, CELL_SIZE + WALL_THICKNESS);
      if (cell.W) addWall(cx - half, cz, WALL_THICKNESS, CELL_SIZE + WALL_THICKNESS);

      this.collidersByCell.set(`${cell.x},${cell.y}`, colliders);
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
      mesh.position.set(loc.x, 0.4, loc.z);
      this.scene.add(mesh);
      this.itemMeshes.set(id, mesh);
    }
  }

  setToast(message, seconds) {
    this.toastMessage = message;
    this.toastTimer = seconds;
  }

  currentCellCoord() {
    return {
      x: Math.round(this.playerX / CELL_SIZE),
      y: Math.round(this.playerZ / CELL_SIZE),
    };
  }

  _nearbyColliders() {
    const { x, y } = this.currentCellCoord();
    const colliders = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.collidersByCell.get(`${x + dx},${y + dy}`);
        if (list) colliders.push(...list);
      }
    }
    return colliders;
  }

  _resolveCollisions(x, z, colliders) {
    for (let iter = 0; iter < 3; iter++) {
      for (const c of colliders) {
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq < PLAYER_RADIUS * PLAYER_RADIUS && distSq > 1e-9) {
          const dist = Math.sqrt(distSq);
          const push = PLAYER_RADIUS - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        }
      }
    }
    return { x, z };
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastMessage = null;
    }

    const { dx, dy } = this.input.consumeMouseDelta();
    if (document.pointerLockElement) {
      const sens = this.input.sensitivity * 0.0022;
      this.yaw -= dx * sens;
      this.pitch -= dy * sens;
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    }

    let ix = 0;
    let iz = 0;
    if (this.input.isDown('moveForward')) iz -= 1;
    if (this.input.isDown('moveBackward')) iz += 1;
    if (this.input.isDown('moveLeft')) ix -= 1;
    if (this.input.isDown('moveRight')) ix += 1;

    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const moveX = (forward.x * -iz + right.x * ix) * MOVE_SPEED * dt;
      const moveZ = (forward.z * -iz + right.z * ix) * MOVE_SPEED * dt;

      const desiredX = this.playerX + moveX;
      const desiredZ = this.playerZ + moveZ;
      const colliders = this._nearbyColliders();
      const resolved = this._resolveCollisions(desiredX, desiredZ, colliders);
      this.playerX = resolved.x;
      this.playerZ = resolved.z;
    }

    const cell = this.currentCellCoord();
    this.visitedCells.add(`${cell.x},${cell.y}`);

    this.camera.position.set(this.playerX, PLAYER_HEIGHT, this.playerZ);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.torch.position.set(this.playerX, PLAYER_HEIGHT, this.playerZ);

    this._handleInteractions();
    this._checkExit();

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
      this.prompt = `Press ${this.input.keyLabel('interact')} to pick up the ${ITEM_LABELS[nearestId]}`;
      if (this.input.wasPressed('interact')) {
        this.gameState.pickUp(nearestId);
        this.scene.remove(this.itemMeshes.get(nearestId));
        this.itemMeshes.delete(nearestId);
        this.setToast(`Picked up the ${ITEM_LABELS[nearestId]}.`, 2);
      }
    } else {
      this.prompt = `Press ${this.input.keyLabel('inventory')} to look into your box`;
    }

    if (this.input.wasPressed('drop')) {
      const order = ['compass', 'map'];
      const toDrop = order.find((id) => this.gameState.hasItem(id));
      if (toDrop) {
        this.gameState.drop(toDrop, 'maze', this.playerX, this.playerZ);
        this._syncItemMeshes();
        this.setToast(`Dropped the ${ITEM_LABELS[toDrop]}.`, 2);
      }
    }

    if (this.input.wasPressed('inventory') && this.onRequestBox) {
      this.onRequestBox();
    }
  }

  _checkExit() {
    const exitPos = this.world.worldPos(this.world.exit.x, this.world.exit.y);
    const d = Math.hypot(exitPos.x - this.playerX, exitPos.z - this.playerZ);
    if (d < 1.1) {
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
        const start = this.world.worldPos(this.world.startPosition.x, this.world.startPosition.y);
        this.playerX = start.x;
        this.playerZ = start.z;
        this.visitedCells.clear();
        this.setToast('You escaped the depths! The maze reshapes itself...', 4);
        if (this.onRunComplete) this.onRunComplete();
      }
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

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
