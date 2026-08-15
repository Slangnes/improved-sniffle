import * as THREE from 'three';
import { makeLabelTexture } from '../ui/canvasLabel.js';
import { POSTER_IDS, ITEM_LABELS } from '../core/GameState.js';
import { buildItemMesh } from '../items/itemMeshes.js';
import { buildAvatar } from './avatar.js';

const ROOM_W = 12;
const ROOM_D = 9;

// The box floor is a walkable grid, one square per step — same movement
// language as the maze outside.
const CELL = 1.5;
const COLS = 8;
const ROWS = 6;
const TILE_CLEARANCE = 0.4;
const STEP_DURATION = 0.16;

const PICKUP_RADIUS = 2.0;
const SLOT_RADIUS = 2.0;
const ANCHOR_RADIUS = 1.5;

// Isometric camera: offset from the player toward the south-east, looking
// back down at them, with an orthographic projection. The south and east
// walls are low rims so the camera sees into the box like an open crate.
const CAM_OFFSET = new THREE.Vector3(7.5, 11, 7.5);
const FRUSTUM_HEIGHT = 9.5;

// World-grid facings: N, E, S, W.
const FACINGS = [
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
];

const WALL_ANCHORS = [
  { x: -4.5, z: -4.28 },
  { x: -1.4, z: -4.28 },
  { x: 1.7, z: -4.28 },
];

const POSTER_ART = {
  'poster-howto': { title: 'How To Play', subtitle: 'Read me first.' },
  'poster-controls': { title: 'Controls', subtitle: 'Keys can be changed.' },
  'poster-settings': { title: 'Settings', subtitle: 'Music, sound, and mute.' },
};

const colToX = (c) => -5.25 + c * CELL;
const rowToZ = (r) => -3.75 + r * CELL;

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class InventoryScene {
  constructor({ gameState, input, audio, onOpenDetail, onClimbOut }) {
    this.gameState = gameState;
    this.input = input;
    this.audio = audio;
    this.onOpenDetail = onOpenDetail;
    this.onClimbOut = onClimbOut;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b080c);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      (-FRUSTUM_HEIGHT * aspect) / 2,
      (FRUSTUM_HEIGHT * aspect) / 2,
      FRUSTUM_HEIGHT / 2,
      -FRUSTUM_HEIGHT / 2,
      0.1,
      60
    );
    this.cameraOverride = false; // true while DetailView owns the camera
    this.transitionZoom = 1;

    this.col = 3;
    this.row = 2;
    this.facing = 0;
    this.playerX = colToX(this.col);
    this.playerZ = rowToZ(this.row);

    this.isAnimating = false;
    this.animT = 0;
    this.animFrom = { x: 0, z: 0 };
    this.animTo = { x: 0, z: 0 };

    this.colliders = [];
    this.staticInteractables = [];
    this.posterInteractables = [];
    this.itemMeshes = new Map();
    this.posterMeshes = new Map();
    this.shelfSlots = [];
    this.focusPoses = new Map();

    this.prompt = null;
    this.toastMessage = null;
    this.toastTimer = 0;

    this._buildRoom();
    this._buildPlayer();
    this._syncItemMeshes();
    this._syncPosters();

    // Keep meshes in sync with state changes made outside this scene
    // (e.g. taking a poster down from inside its detailed view).
    this.gameState.onChange(() => {
      this._syncItemMeshes();
      this._syncPosters();
      this._syncHeldItems();
    });

    this._placeCamera(true);
  }

  _buildRoom() {
    const hemi = new THREE.HemisphereLight(0x9a8f70, 0x14100a, 0.95);
    this.scene.add(hemi);
    const lamp = new THREE.PointLight(0xffe3b0, 1.1, 20);
    lamp.position.set(0, 6, 0);
    this.scene.add(lamp);
    const fill = new THREE.DirectionalLight(0xfff2d0, 0.35);
    fill.position.set(6, 9, 6);
    this.scene.add(fill);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5636, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Faint tile seams so the walkable grid reads visually.
    const seamMat = new THREE.LineBasicMaterial({ color: 0x584730, transparent: true, opacity: 0.5 });
    const seamPts = [];
    for (let c = 0; c <= COLS; c++) {
      const x = -6 + c * CELL;
      seamPts.push(new THREE.Vector3(x, 0.005, -4.5), new THREE.Vector3(x, 0.005, 4.5));
    }
    for (let r = 0; r <= ROWS; r++) {
      const z = -4.5 + r * CELL;
      seamPts.push(new THREE.Vector3(-6, 0.005, z), new THREE.Vector3(6, 0.005, z));
    }
    const seamGeo = new THREE.BufferGeometry().setFromPoints(seamPts);
    this.scene.add(new THREE.LineSegments(seamGeo, seamMat));

    // Cardboard rim just outside the floor so the room reads as a box.
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 1 });
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W + 3, ROOM_D + 3), rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.02;
    this.scene.add(rim);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3b2f22, roughness: 1 });
    const tallWall = (w, d, x, z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), wallMat);
      wall.position.set(x, 1.6, z);
      this.scene.add(wall);
    };
    const lowRim = (w, d, x, z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), wallMat);
      wall.position.set(x, 0.25, z);
      this.scene.add(wall);
    };
    tallWall(ROOM_W + 0.6, 0.3, 0, -ROOM_D / 2);
    tallWall(0.3, ROOM_D + 0.6, -ROOM_W / 2, 0);
    lowRim(ROOM_W + 0.6, 0.3, 0, ROOM_D / 2);
    lowRim(0.3, ROOM_D + 0.6, ROOM_W / 2, 0);

    this._addBulletinBoard(4.6, -4.35);
    this._addTitlePoster(-5.84, 3.5);
    this._addShelves(-ROOM_W / 2 + 0.25, 0);
    this._addDesk(ROOM_W / 2 - 1.6, ROOM_D / 2 - 1.8);
    this._addLadder(0, ROOM_D / 2 - 0.3);
  }

  _addBulletinBoard(x, z) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3220 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 0.12), frameMat);
    frame.position.set(x, 1.9, z + 0.04);
    this.scene.add(frame);

    const tex = makeLabelTexture({ title: 'Objectives', subtitle: 'Pinned notes', bg: '#c9b98a' });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.6),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.position.set(x, 1.9, z + 0.11);
    this.scene.add(mesh);

    this.staticInteractables.push({ id: 'bulletin', kind: 'detail', x, z, radius: 1.5, label: 'Bulletin Board' });
    this.focusPoses.set('bulletin', {
      look: new THREE.Vector3(x, 1.9, z),
      camPos: new THREE.Vector3(x, 1.9, z + 3.4),
      viewHeight: 2.6,
      contentW: 1.4,
      contentH: 1.6,
      panelClass: 'panel-board',
    });
  }

  _addTitlePoster(x, z) {
    const tex = makeLabelTexture({ title: 'Box & Bones', subtitle: 'An old-school maze crawler', bg: '#20180f', border: '#e8c96a', ink: '#e8c96a' });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.7),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.position.set(x, 1.9, z);
    mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);

    this.staticInteractables.push({ id: 'title', kind: 'detail', x, z, radius: 1.5, label: 'Box & Bones poster' });
    this.focusPoses.set('title', {
      look: new THREE.Vector3(x, 1.9, z),
      camPos: new THREE.Vector3(x + 3.4, 1.9, z),
      viewHeight: 2.6,
      contentW: 1.3,
      contentH: 1.7,
      panelClass: 'panel-dark',
    });
  }

  _addShelves(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4326, roughness: 0.8 });
    [-2, -0.7, 0.6, 2].forEach((offset) => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 1.1), mat);
      shelf.position.set(x + 0.28, 1.1, z + offset);
      this.scene.add(shelf);
      this.shelfSlots.push({ x: x + 0.28, z: z + offset });
    });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), mat);
    post.position.set(x, 1.2, z - 2.5);
    this.scene.add(post.clone().translateZ(5.6));
    this.scene.add(post);

    this.colliders.push({ minX: x - 0.15, maxX: x + 0.7, minZ: z - 2.4, maxZ: z + 2.4 });
  }

  _addDesk(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x704d2a, roughness: 0.7 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), mat);
    top.position.set(x, 0.9, z);
    this.scene.add(top);
    // The ledger: a paper sheet on the desktop that the detailed view reads.
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xefe6c8, roughness: 0.9 })
    );
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.06;
    paper.position.set(x, 0.965, z);
    this.scene.add(paper);
    const legGeo = new THREE.BoxGeometry(0.1, 0.9, 0.1);
    [
      [-0.7, -0.35],
      [0.7, -0.35],
      [-0.7, 0.35],
      [0.7, 0.35],
    ].forEach(([dx, dz]) => {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(x + dx, 0.45, z + dz);
      this.scene.add(leg);
    });

    this.colliders.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.55, maxZ: z + 0.55 });
    this.staticInteractables.push({ id: 'desk', kind: 'detail', x, z, radius: 1.4, label: 'Desk' });
    this.focusPoses.set('desk', {
      look: new THREE.Vector3(x, 0.95, z),
      camPos: new THREE.Vector3(x, 3.4, z + 1.2),
      viewHeight: 2.0,
      contentW: 1.2,
      contentH: 0.75,
      panelClass: 'panel-paper',
    });
  }

  _addLadder(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8a06a, metalness: 0.2, roughness: 0.6 });
    const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8);
    const railL = new THREE.Mesh(railGeo, mat);
    railL.position.set(x - 0.35, 1.4, z);
    const railR = railL.clone();
    railR.position.x = x + 0.35;
    this.scene.add(railL, railR);
    for (let i = 0; i < 6; i++) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), mat);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(x, 0.4 + i * 0.42, z);
      this.scene.add(rung);
    }
    const glow = new THREE.PointLight(0xbfe8ff, 0.8, 4);
    glow.position.set(x, 2.4, z - 0.4);
    this.scene.add(glow);

    this.staticInteractables.push({ id: 'ladder', kind: 'ladder', x, z, radius: 1.3, label: 'Ladder' });
  }

  _buildPlayer() {
    const avatar = buildAvatar();
    this.scene.add(avatar.group);
    this.playerMesh = avatar.group;
    this.handAnchors = { left: avatar.handLeft, right: avatar.handRight };
    this._syncHeldItems();
  }

  // Whatever each hand holds is visible in the avatar's hands.
  _syncHeldItems() {
    for (const side of ['left', 'right']) {
      const anchor = this.handAnchors[side];
      anchor.clear();
      const id = this.gameState.hands[side];
      if (!id) continue;
      const mesh = buildItemMesh(id);
      if (!mesh) continue;
      mesh.scale.setScalar(0.7);
      mesh.position.y = 0.02;
      anchor.add(mesh);
    }
  }

  _syncItemMeshes() {
    for (const mesh of this.itemMeshes.values()) this.scene.remove(mesh);
    this.itemMeshes.clear();

    for (const [id, loc] of this.gameState.itemLocationIn('inventory')) {
      const mesh = buildItemMesh(id);
      if (!mesh) continue;
      const onShelf = this.shelfSlots.some(
        (s) => Math.abs(s.x - loc.x) < 0.05 && Math.abs(s.z - loc.z) < 0.05
      );
      mesh.position.set(loc.x, onShelf ? 1.16 : POSTER_IDS.includes(id) ? 0.1 : 0.02, loc.z);
      this.scene.add(mesh);
      this.itemMeshes.set(id, mesh);
    }
  }

  _syncPosters() {
    for (const mesh of this.posterMeshes.values()) this.scene.remove(mesh);
    this.posterMeshes.clear();
    this.posterInteractables = [];

    for (const id of POSTER_IDS) {
      const loc = this.gameState.itemLocations[id];
      if (loc?.scene !== 'inventory-wall') continue;
      const anchor = WALL_ANCHORS[loc.anchor];
      const art = POSTER_ART[id];
      const tex = makeLabelTexture({ title: art.title, subtitle: art.subtitle });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 1.7),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      mesh.position.set(anchor.x, 1.9, anchor.z + 0.02);
      this.scene.add(mesh);
      this.posterMeshes.set(id, mesh);

      this.posterInteractables.push({
        id,
        kind: 'detail',
        x: anchor.x,
        z: anchor.z,
        radius: ANCHOR_RADIUS,
        label: ITEM_LABELS[id],
      });
      this.focusPoses.set(id, {
        look: new THREE.Vector3(anchor.x, 1.9, anchor.z),
        camPos: new THREE.Vector3(anchor.x, 1.9, anchor.z + 3.4),
        viewHeight: 2.6,
        contentW: 1.3,
        contentH: 1.7,
        panelClass: 'panel-paper',
      });
    }
  }

  getFocusPose(id) {
    const pose = this.focusPoses.get(id);
    if (!pose) return null;
    return { ...pose, zoom: FRUSTUM_HEIGHT / pose.viewHeight };
  }

  getFollowPose() {
    return {
      camPos: new THREE.Vector3(this.playerX, 0, this.playerZ).add(CAM_OFFSET),
      look: new THREE.Vector3(this.playerX, 0.6, this.playerZ),
      zoom: 1,
    };
  }

  _placeCamera(snap = false) {
    const target = this.getFollowPose();
    if (snap) {
      this.camera.position.copy(target.camPos);
    } else {
      this.camera.position.lerp(target.camPos, 0.12);
    }
    this.camera.zoom = this.transitionZoom;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target.look);
  }

  transitionOut(t) {
    this.transitionZoom = 1 + 2.6 * t;
    this._placeCamera(true);
  }

  transitionIn(t) {
    this.transitionZoom = 1 + 2.6 * (1 - t);
    this._placeCamera(true);
  }

  transitionReset() {
    this.transitionZoom = 1;
    this._placeCamera(true);
  }

  setToast(message, seconds) {
    this.toastMessage = message;
    this.toastTimer = seconds;
  }

  _tileBlocked(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    const x = colToX(col);
    const z = rowToZ(row);
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      if (Math.hypot(x - cx, z - cz) < TILE_CLEARANCE) return true;
    }
    return false;
  }

  _beginStep(dCol, dRow) {
    this.animFrom = { x: this.playerX, z: this.playerZ };
    this.col += dCol;
    this.row += dRow;
    this.animTo = { x: colToX(this.col), z: rowToZ(this.row) };
    this.animT = 0;
    this.isAnimating = true;
    this.audio.footstep('wood');
  }

  _tryStep(directionIndex) {
    const dir = FACINGS[directionIndex];
    if (this._tileBlocked(this.col + dir.dx, this.row + dir.dz)) {
      this.audio.playBump();
      return;
    }
    this._beginStep(dir.dx, dir.dz);
  }

  _isSlotOccupied(slot) {
    for (const [, loc] of this.gameState.itemLocationIn('inventory')) {
      if (Math.abs(loc.x - slot.x) < 0.05 && Math.abs(loc.z - slot.z) < 0.05) return true;
    }
    return false;
  }

  _nearestEmptySlot() {
    let nearest = null;
    let nearestDist = SLOT_RADIUS;
    for (const slot of this.shelfSlots) {
      if (this._isSlotOccupied(slot)) continue;
      const d = Math.hypot(slot.x - this.playerX, slot.z - this.playerZ);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = slot;
      }
    }
    return nearest;
  }

  _nearestFreeAnchor() {
    let nearest = null;
    let nearestDist = ANCHOR_RADIUS;
    for (let i = 0; i < WALL_ANCHORS.length; i++) {
      if (this.gameState.posterOnAnchor(i)) continue;
      const a = WALL_ANCHORS[i];
      const d = Math.hypot(a.x - this.playerX, a.z - this.playerZ);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = { index: i, ...a };
      }
    }
    return nearest;
  }

  _checkTidyObjective() {
    const allShelved = ['compass', 'map'].every((id) => {
      const loc = this.gameState.itemLocations[id];
      if (!loc || loc.scene !== 'inventory') return false;
      return this.shelfSlots.some((s) => Math.abs(s.x - loc.x) < 0.05 && Math.abs(s.z - loc.z) < 0.05);
    });
    if (allShelved) this.gameState.completeObjective('tidy-shelf');
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastMessage = null;
    }

    let moved = false;
    if (this.isAnimating) {
      this.animT += dt / STEP_DURATION;
      if (this.animT >= 1) {
        this.animT = 1;
        this.isAnimating = false;
      }
      const t = easeInOutQuad(this.animT);
      this.playerX = this.animFrom.x + (this.animTo.x - this.animFrom.x) * t;
      this.playerZ = this.animFrom.z + (this.animTo.z - this.animFrom.z) * t;
      moved = true;
    } else if (this.input.isDown('moveForward')) {
      this._tryStep(this.facing);
    } else if (this.input.isDown('moveBackward')) {
      this._tryStep((this.facing + 2) % 4);
    } else if (this.input.isDown('strafeLeft')) {
      this._tryStep((this.facing + 3) % 4);
    } else if (this.input.isDown('strafeRight')) {
      this._tryStep((this.facing + 1) % 4);
    } else if (this.input.wasPressed('turnLeft')) {
      this.facing = (this.facing + 3) % 4;
    } else if (this.input.wasPressed('turnRight')) {
      this.facing = (this.facing + 1) % 4;
    }
    void moved;

    const dir = FACINGS[this.facing];
    this.playerMesh.position.set(this.playerX, 0, this.playerZ);
    this.playerMesh.rotation.y = Math.atan2(dir.dx, dir.dz);

    if (!this.cameraOverride) this._placeCamera();

    this._handleInteractions();
    this.input.endFrame();
  }

  // The hand whose item a prompt should name: right first.
  _promptHand() {
    if (this.gameState.hands.right) return 'right';
    if (this.gameState.hands.left) return 'left';
    return null;
  }

  _handAction(side) {
    const id = this.gameState.handItem(side);
    if (!id) return;
    const anchor = POSTER_IDS.includes(id) ? this._nearestFreeAnchor() : null;
    const slot = this._nearestEmptySlot();
    if (anchor) {
      this.gameState.hangPosterFromHand(side, anchor.index);
      this.setToast(`Hung the ${ITEM_LABELS[id]} back up.`, 2);
      this.audio.playDrop();
    } else if (slot) {
      this.gameState.dropFromHand(side, 'inventory', slot.x, slot.z);
      this.setToast(`Sorted the ${ITEM_LABELS[id]} onto the shelf.`, 2);
      this.audio.playDrop();
      this._checkTidyObjective();
    } else {
      const offset = side === 'left' ? -0.35 : 0.35;
      this.gameState.dropFromHand(side, 'inventory', this.playerX + offset, this.playerZ);
      this.setToast(`Put down the ${ITEM_LABELS[id]}.`, 2);
      this.audio.playDrop();
    }
  }

  _handleInteractions() {
    let nearestItem = null;
    let nearestItemDist = PICKUP_RADIUS;
    for (const [id, mesh] of this.itemMeshes.entries()) {
      const d = Math.hypot(mesh.position.x - this.playerX, mesh.position.z - this.playerZ);
      if (d < nearestItemDist) {
        nearestItemDist = d;
        nearestItem = id;
      }
    }

    let nearestSpot = null;
    let nearestSpotDist = Infinity;
    for (const spot of [...this.staticInteractables, ...this.posterInteractables]) {
      const d = Math.hypot(spot.x - this.playerX, spot.z - this.playerZ);
      if (d < spot.radius && d < nearestSpotDist) {
        nearestSpotDist = d;
        nearestSpot = spot;
      }
    }

    const promptHand = this._promptHand();
    const promptItem = promptHand ? this.gameState.handItem(promptHand) : null;
    const promptDropAction = promptHand === 'left' ? 'dropLeft' : 'dropRight';
    const anchor =
      promptItem && POSTER_IDS.includes(promptItem) ? this._nearestFreeAnchor() : null;
    const slot = promptItem ? this._nearestEmptySlot() : null;

    if (nearestItem) {
      if (this.gameState.freeHand()) {
        this.prompt = `${this.input.promptFor('interact')} to pick up the ${ITEM_LABELS[nearestItem]}`;
        if (this.input.wasPressed('interact')) {
          const hand = this.gameState.pickUp(nearestItem);
          this.setToast(`Picked up the ${ITEM_LABELS[nearestItem]} in your ${hand} hand.`, 2);
          this.audio.playPickup();
        }
      } else {
        this.prompt = `Your hands are full`;
      }
    } else if (anchor) {
      this.prompt = `${this.input.promptFor(promptDropAction)} to hang the ${ITEM_LABELS[promptItem]}`;
      if (this.input.wasPressed('interact') && nearestSpot && nearestSpot.kind === 'detail') {
        this.audio.playInteract();
        this.onOpenDetail(nearestSpot.id);
      }
    } else if (nearestSpot) {
      if (nearestSpot.kind === 'ladder') {
        this.prompt = `${this.input.promptFor('interact')} to climb out`;
        if (this.input.wasPressed('interact')) this.onClimbOut();
      } else {
        this.prompt = `${this.input.promptFor('interact')} to look at the ${nearestSpot.label}`;
        if (this.input.wasPressed('interact')) {
          this.audio.playInteract();
          this.onOpenDetail(nearestSpot.id);
        }
      }
    } else if (slot) {
      this.prompt = `${this.input.promptFor(promptDropAction)} to place the ${ITEM_LABELS[promptItem]} on the shelf`;
    } else {
      this.prompt = null;
    }

    if (this.input.wasPressed('dropLeft')) this._handAction('left');
    if (this.input.wasPressed('dropRight')) this._handAction('right');
  }

  onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = (-FRUSTUM_HEIGHT * aspect) / 2;
    this.camera.right = (FRUSTUM_HEIGHT * aspect) / 2;
    this.camera.top = FRUSTUM_HEIGHT / 2;
    this.camera.bottom = -FRUSTUM_HEIGHT / 2;
    this.camera.updateProjectionMatrix();
  }
}
