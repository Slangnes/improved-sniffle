import * as THREE from 'three';
import { makeLabelTexture } from '../ui/canvasLabel.js';

const ROOM_W = 12;
const ROOM_D = 9;
const PLAYER_RADIUS = 0.32;
const MOVE_SPEED = 3.4;
const SLOT_RADIUS = 1.1;
const SHELVED_ITEM_IDS = ['compass', 'map'];

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
const ITEM_LABELS = { compass: 'Compass', map: 'Map' };

export class InventoryScene {
  constructor({ gameState, input, audio, onOpenModal, onClimbOut }) {
    this.gameState = gameState;
    this.input = input;
    this.audio = audio;
    this.onOpenModal = onOpenModal;
    this.onClimbOut = onClimbOut;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x100c10);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 60);

    this.playerX = 0;
    this.playerZ = 0;
    this.facing = 0;

    this.colliders = [];
    this.interactables = [];
    this.itemMeshes = new Map();
    this.shelfSlots = [];

    this.prompt = null;
    this.toastMessage = null;
    this.toastTimer = 0;

    this._buildRoom();
    this._buildPlayer();
    this._syncItemMeshes();
  }

  _buildRoom() {
    const hemi = new THREE.HemisphereLight(0x9a8f70, 0x14100a, 0.9);
    this.scene.add(hemi);
    const lamp = new THREE.PointLight(0xffe3b0, 1.1, 20);
    lamp.position.set(0, 6, 0);
    this.scene.add(lamp);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5636, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3b2f22, roughness: 1 });
    const wallHeight = 3.2;
    const makeWall = (w, d, x, z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMat);
      wall.position.set(x, wallHeight / 2, z);
      this.scene.add(wall);
    };
    makeWall(ROOM_W + 0.6, 0.3, 0, -ROOM_D / 2);
    makeWall(ROOM_W + 0.6, 0.3, 0, ROOM_D / 2);
    makeWall(0.3, ROOM_D + 0.6, -ROOM_W / 2, 0);
    makeWall(0.3, ROOM_D + 0.6, ROOM_W / 2, 0);

    this._addPoster('poster-howto', -4.5, -ROOM_D / 2 + 0.2, 'How To Play', 'Explore the maze. Find the exit of each ring to push deeper. Press E near objects to interact.');
    this._addPoster('poster-controls', -1.4, -ROOM_D / 2 + 0.2, 'Controls', 'Click a poster to rebind keys.');
    this._addPoster('poster-settings', 1.7, -ROOM_D / 2 + 0.2, 'Settings', 'Music, sound, and mute.');
    this._addBulletinBoard(4.6, -ROOM_D / 2 + 0.2);

    this._addShelves(-ROOM_W / 2 + 0.25, 0);
    this._addDesk(ROOM_W / 2 - 1.6, ROOM_D / 2 - 1.8);
    this._addLadder(0, ROOM_D / 2 - 0.3);
  }

  _addPoster(id, x, z, title, subtitle) {
    const tex = makeLabelTexture({ title, subtitle });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), mat);
    mesh.position.set(x, 1.9, z + 0.06);
    mesh.rotation.x = -0.05;
    this.scene.add(mesh);
    this.interactables.push({ id, kind: 'modal', modal: id, x, z, radius: 1.4, label: title });
  }

  _addBulletinBoard(x, z) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3220 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 0.12), frameMat);
    frame.position.set(x, 1.9, z + 0.1);
    this.scene.add(frame);

    const tex = makeLabelTexture({ title: 'Objectives', subtitle: 'Pinned notes', bg: '#c9b98a' });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), mat);
    mesh.position.set(x, 1.9, z + 0.17);
    this.scene.add(mesh);

    this.interactables.push({ id: 'bulletin', kind: 'modal', modal: 'bulletin', x, z, radius: 1.5, label: 'Bulletin Board' });
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
    this.interactables.push({ id: 'desk', kind: 'modal', modal: 'desk', x, z, radius: 1.4, label: 'Desk' });
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

    this.interactables.push({ id: 'ladder', kind: 'ladder', x, z, radius: 1.3, label: 'Ladder' });
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
      mesh.position.set(loc.x, 1.18, loc.z);
      this.scene.add(mesh);
      this.itemMeshes.set(id, mesh);
    }
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

  _checkTidyObjective() {
    const allShelved = SHELVED_ITEM_IDS.every((id) => {
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
      const desiredX = this.playerX + ix * MOVE_SPEED * dt;
      const desiredZ = this.playerZ + iz * MOVE_SPEED * dt;
      const resolved = this._resolveCollisions(desiredX, desiredZ);
      this.playerX = resolved.x;
      this.playerZ = resolved.z;
      this.facing = Math.atan2(ix, iz);
    }

    this.playerMesh.position.set(this.playerX, 0, this.playerZ);
    this.playerMesh.rotation.y = this.facing;
    this.audio.updateFootsteps(ix !== 0 || iz !== 0, 'wood', dt);

    const camDist = 6.5;
    const camHeight = 7.5;
    this.camera.position.set(this.playerX, camHeight, this.playerZ + camDist * 0.55);
    this.camera.lookAt(this.playerX, 0, this.playerZ);

    this._handleInteractions();
    this.input.endFrame();
  }

  _handleInteractions() {
    let nearestId = null;
    let nearestDist = 1.1;
    for (const [id, mesh] of this.itemMeshes.entries()) {
      const d = Math.hypot(mesh.position.x - this.playerX, mesh.position.z - this.playerZ);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = { kind: 'item', id };
      }
    }

    let nearestInteractable = null;
    let nearestIDist = Infinity;
    for (const spot of this.interactables) {
      const d = Math.hypot(spot.x - this.playerX, spot.z - this.playerZ);
      if (d < spot.radius && d < nearestIDist) {
        nearestIDist = d;
        nearestInteractable = spot;
      }
    }

    const order = ['compass', 'map'];
    const carrying = order.find((id) => this.gameState.hasItem(id));
    const nearestSlot = carrying ? this._nearestEmptySlot(this.playerX, this.playerZ) : null;

    if (nearestId) {
      this.prompt = `${this.input.promptFor('interact')} to pick up the ${ITEM_LABELS[nearestId.id]}`;
      if (this.input.wasPressed('interact')) {
        this.gameState.pickUp(nearestId.id);
        this.scene.remove(this.itemMeshes.get(nearestId.id));
        this.itemMeshes.delete(nearestId.id);
        this.setToast(`Picked up the ${ITEM_LABELS[nearestId.id]}.`, 2);
        this.audio.playPickup();
      }
    } else if (nearestSlot) {
      this.prompt = `${this.input.promptFor('drop')} to place the ${ITEM_LABELS[carrying]} on the shelf`;
    } else if (nearestInteractable) {
      if (nearestInteractable.kind === 'ladder') {
        this.prompt = `${this.input.promptFor('interact')} to climb out`;
        if (this.input.wasPressed('interact')) this.onClimbOut();
      } else {
        this.prompt = `${this.input.promptFor('interact')} to look at the ${nearestInteractable.label}`;
        if (this.input.wasPressed('interact')) {
          this.audio.playInteract();
          this.onOpenModal(nearestInteractable.modal);
        }
      }
    } else {
      this.prompt = null;
    }

    if (this.input.wasPressed('drop') && carrying) {
      if (nearestSlot) {
        this.gameState.drop(carrying, 'inventory', nearestSlot.x, nearestSlot.z);
        this._syncItemMeshes();
        this.setToast(`Sorted the ${ITEM_LABELS[carrying]} onto the shelf.`, 2);
        this.audio.playDrop();
        this._checkTidyObjective();
      } else {
        this.gameState.drop(carrying, 'inventory', this.playerX, this.playerZ);
        this._syncItemMeshes();
        this.setToast(`Put down the ${ITEM_LABELS[carrying]}.`, 2);
        this.audio.playDrop();
      }
    }

    if (this.input.wasPressed('inventory')) {
      this.onClimbOut();
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
