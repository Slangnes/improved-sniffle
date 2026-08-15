import * as THREE from 'three';
import { makeLabelTexture } from '../ui/canvasLabel.js';
import { POSTER_IDS, ITEM_LABELS } from '../core/GameState.js';

const ROOM_W = 12;
const ROOM_D = 9;
const PLAYER_RADIUS = 0.32;
const MOVE_SPEED = 3.4;
const SLOT_RADIUS = 1.1;
const ANCHOR_RADIUS = 1.4;

// Isometric camera: offset from the player toward the south-east, looking
// back down at them, with an orthographic projection. The south and east
// walls are low rims so the camera sees into the box like an open crate.
const CAM_OFFSET = new THREE.Vector3(7.5, 11, 7.5);
const FRUSTUM_HEIGHT = 9.5;

// Camera-relative movement basis: pressing "up" walks toward the top of the
// screen, which in world space is away from the camera offset.
const CAM_FORWARD = new THREE.Vector2(-Math.SQRT1_2, -Math.SQRT1_2); // screen-up
const CAM_RIGHT = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2); // screen-right

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

const ITEM_MESH_DEFS = {
  compass: () => {
    const g = new THREE.ConeGeometry(0.2, 0.36, 6);
    const m = new THREE.MeshStandardMaterial({ color: 0xd9b24c, emissive: 0x2a1c00 });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = Math.PI;
    return mesh;
  },
  map: () => {
    const g = new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8);
    const m = new THREE.MeshStandardMaterial({ color: 0xe8dcb0 });
    return new THREE.Mesh(g, m);
  },
};

// Posters not on a wall render as rolled-up scrolls.
function buildScrollMesh() {
  const group = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.62, 10),
    new THREE.MeshStandardMaterial({ color: 0xe6d9b2 })
  );
  paper.rotation.z = Math.PI / 2;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a4a2a })
  );
  band.rotation.z = Math.PI / 2;
  group.add(paper, band);
  return group;
}

for (const id of POSTER_IDS) {
  ITEM_MESH_DEFS[id] = buildScrollMesh;
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

    this.playerX = 0;
    this.playerZ = 0;
    this.facing = 0;

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
    // (e.g. taking a poster down from inside its detail view).
    this.gameState.onChange(() => {
      this._syncItemMeshes();
      this._syncPosters();
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
    // North and west walls are full height (they face the camera); the
    // camera-side walls are low rims so we can see into the box.
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
      camPos: new THREE.Vector3(x, 3.4, z + 1.6),
      viewHeight: 2.4,
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
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.4, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x9fd0d8 })
    );
    body.position.y = 0.5;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xe9c9a3 })
    );
    head.position.y = 0.86;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.16, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8443a })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.86, -0.2);
    group.add(body, head, nose);
    this.scene.add(group);
    this.playerMesh = group;
  }

  _syncItemMeshes() {
    for (const mesh of this.itemMeshes.values()) this.scene.remove(mesh);
    this.itemMeshes.clear();

    for (const [id, loc] of this.gameState.itemLocationIn('inventory')) {
      const build = ITEM_MESH_DEFS[id];
      if (!build) continue;
      const mesh = build();
      const onShelf = this.shelfSlots.some(
        (s) => Math.abs(s.x - loc.x) < 0.05 && Math.abs(s.z - loc.z) < 0.05
      );
      mesh.position.set(loc.x, onShelf ? 1.25 : POSTER_IDS.includes(id) ? 0.12 : 0.2, loc.z);
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
    // Leaving the box: the camera dives toward the player (you grow back up).
    this.transitionZoom = 1 + 2.6 * t;
    this._placeCamera(true);
  }

  transitionIn(t) {
    // Entering the box: start tight on the player, pull up and out to iso.
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

  _isSlotOccupied(slot) {
    for (const [, loc] of this.gameState.itemLocationIn('inventory')) {
      if (Math.abs(loc.x - slot.x) < 0.05 && Math.abs(loc.z - slot.z) < 0.05) return true;
    }
    return false;
  }

  _nearestEmptySlot(px, pz) {
    let nearest = null;
    let nearestDist = SLOT_RADIUS;
    for (const slot of this.shelfSlots) {
      if (this._isSlotOccupied(slot)) continue;
      const d = Math.hypot(slot.x - px, slot.z - pz);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = slot;
      }
    }
    return nearest;
  }

  _nearestFreeAnchor(px, pz) {
    let nearest = null;
    let nearestDist = ANCHOR_RADIUS;
    for (let i = 0; i < WALL_ANCHORS.length; i++) {
      if (this.gameState.posterOnAnchor(i)) continue;
      const a = WALL_ANCHORS[i];
      const d = Math.hypot(a.x - px, a.z - pz);
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

  _resolveCollisions(x, z) {
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.colliders) {
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
    const margin = 0.5;
    x = Math.max(-ROOM_W / 2 + margin, Math.min(ROOM_W / 2 - margin, x));
    z = Math.max(-ROOM_D / 2 + margin, Math.min(ROOM_D / 2 - margin, z));
    return { x, z };
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastMessage = null;
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
      // Screen-relative: "up" walks toward the top of the isometric view.
      const moveX = CAM_FORWARD.x * -iz + CAM_RIGHT.x * ix;
      const moveZ = CAM_FORWARD.y * -iz + CAM_RIGHT.y * ix;
      const desiredX = this.playerX + moveX * MOVE_SPEED * dt;
      const desiredZ = this.playerZ + moveZ * MOVE_SPEED * dt;
      const resolved = this._resolveCollisions(desiredX, desiredZ);
      this.playerX = resolved.x;
      this.playerZ = resolved.z;
      this.facing = Math.atan2(moveX, moveZ);
    }

    this.playerMesh.position.set(this.playerX, 0, this.playerZ);
    this.playerMesh.rotation.y = this.facing;
    this.audio.updateFootsteps(ix !== 0 || iz !== 0, 'wood', dt);

    if (!this.cameraOverride) this._placeCamera();

    this._handleInteractions();
    this.input.endFrame();
  }

  _handleInteractions() {
    let nearestItem = null;
    let nearestItemDist = 1.1;
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

    const topItem = this.gameState.topCarried();
    const carriedPoster = this.gameState.topCarriedPoster();
    const nearestAnchor = carriedPoster ? this._nearestFreeAnchor(this.playerX, this.playerZ) : null;
    const nearestSlot = topItem ? this._nearestEmptySlot(this.playerX, this.playerZ) : null;

    if (nearestItem) {
      this.prompt = `${this.input.promptFor('interact')} to pick up the ${ITEM_LABELS[nearestItem]}`;
      if (this.input.wasPressed('interact')) {
        this.gameState.pickUp(nearestItem);
        this.setToast(`Picked up the ${ITEM_LABELS[nearestItem]}.`, 2);
        this.audio.playPickup();
      }
    } else if (nearestAnchor) {
      // Hanging intent is more specific than looking at a neighbouring spot.
      this.prompt = `${this.input.promptFor('drop')} to hang the ${ITEM_LABELS[carriedPoster]}`;
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
    } else if (nearestSlot) {
      this.prompt = `${this.input.promptFor('drop')} to place the ${ITEM_LABELS[topItem]} on the shelf`;
    } else {
      this.prompt = null;
    }

    if (this.input.wasPressed('drop') && topItem) {
      if (nearestAnchor && carriedPoster) {
        this.gameState.hangPoster(carriedPoster, nearestAnchor.index);
        this.setToast(`Hung the ${ITEM_LABELS[carriedPoster]} back up.`, 2);
        this.audio.playDrop();
      } else if (nearestSlot) {
        this.gameState.drop(topItem, 'inventory', nearestSlot.x, nearestSlot.z);
        this.setToast(`Sorted the ${ITEM_LABELS[topItem]} onto the shelf.`, 2);
        this.audio.playDrop();
        this._checkTidyObjective();
      } else {
        this.gameState.drop(topItem, 'inventory', this.playerX, this.playerZ);
        this.setToast(`Put down the ${ITEM_LABELS[topItem]}.`, 2);
        this.audio.playDrop();
      }
    }

    if (this.input.wasPressed('inventory')) {
      this.onClimbOut();
    }
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
