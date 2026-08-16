import * as THREE from 'three';
import { makeLabelTexture, makePosterTexture } from '../ui/canvasLabel.js';
import { POSTER_IDS, ITEM_LABELS } from '../core/GameState.js';
import { buildItemMesh } from '../items/itemMeshes.js';
import { buildAvatar } from './avatar.js';

const ROOM_W = 12;
const ROOM_D = 9;

// The box floor is a walkable grid, one square per step — same movement
// language as the maze outside, but with small, fine tiles so walking
// around the room feels precise rather than lurching.
const CELL = 1.0;
const COLS = 11;
const ROWS = 9;
const STEP_DURATION = 0.13;

const PICKUP_RADIUS = 1.6;
const SLOT_RADIUS = 1.6;
const ANCHOR_RADIUS = 1.5;
const GRAB_RADIUS = 1.4;

// The tile at the foot of the ladder must always stay clear — furniture
// can never be parked on the only way out.
const LADDER_TILE = { col: 5, row: 8 };

// The box is presented as a fixed diorama: an orthographic camera framing
// the WHOLE room, angled with a gentle 30° yaw so two walls show and the
// scene keeps its isometric character — but never so diagonal that the
// grid's north stops reading as "up" on screen. The camera does not follow
// the player; only the little avatar moves.
const CAM_YAW = Math.PI / 6;
const CAM_DIST = 10;
const CAM_HEIGHT = 11;
const CAM_DIR = new THREE.Vector3(Math.sin(CAM_YAW), 0, Math.cos(CAM_YAW));
const ROOM_CENTER = new THREE.Vector3(0, 0.6, 0);
const FRUSTUM_HEIGHT = 9.5;

// World-grid facings: N, E, S, W. All movement keys map to these
// absolutely — W north, D east, S south, A west, and (because the diorama
// never rotates, so there is nothing to turn) the turn keys and ←/→ also
// step sideways. The avatar turns to face its steps.
const FACINGS = [
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
];
const KEY_DIRS = [
  { action: 'moveForward', dir: 0 },
  { action: 'strafeRight', dir: 1 },
  { action: 'moveBackward', dir: 2 },
  { action: 'strafeLeft', dir: 3 },
  { action: 'turnRight', dir: 1 },
  { action: 'turnLeft', dir: 3 },
];

// Everything readable hangs on the north wall, facing the camera.
const WALL_ANCHORS = [
  { x: -2.9, z: -4.28 },
  { x: -0.9, z: -4.28 },
  { x: 1.1, z: -4.28 },
];

// Item slots inside the bookshelf, as offsets from the case's center:
// two per shelf level, lower level first.
const SHELF_SLOTS = [
  { dx: 0.04, dz: -0.62, y: 0.95 },
  { dx: 0.04, dz: 0.62, y: 0.95 },
  { dx: 0.04, dz: -0.62, y: 1.69 },
  { dx: 0.04, dz: 0.62, y: 1.69 },
];

// Full poster faces: the information is genuinely painted on the paper.
const POSTER_ART = {
  'poster-howto': {
    banner: 'How To Play',
    bannerColor: '#6b4a2b',
    sections: [
      {
        type: 'p',
        text: "The ladder leads out into the maze. Find the maze's far edge and it grows a new ring around itself. Three rings deep, the run is done, and a fresh maze awaits.",
      },
      {
        type: 'p',
        text: 'You have two hands. Each carries one thing, shown at its own side of the screen. Tap a held thing to look at it closely.',
      },
      { type: 'gap' },
      { type: 'k', key: 'W A S D', text: 'step around' },
      { type: 'k', key: 'Q  E', text: 'turn (in the maze)' },
      { type: 'k', key: 'F', text: 'use what is near' },
      { type: 'k', key: 'G', text: 'move furniture (in the box)' },
      { type: 'k', key: 'Z  C', text: 'left / right hand' },
      { type: 'k', key: '1  2', text: 'compass & map' },
      { type: 'k', key: 'ARROWS', text: 'always work' },
    ],
  },
  'poster-controls': {
    banner: 'Controls',
    bannerColor: '#3f5d7a',
    sections: [
      {
        type: 'p',
        text: 'Every key can be re-taught. Step close: tap a binding, then press the key you prefer.',
      },
    ],
  },
  'poster-settings': {
    banner: 'Settings',
    bannerColor: '#556b2f',
    sections: [
      { type: 'p', text: 'Sound, music, and the way you hold the box.' },
    ],
  },
};

// Movable furniture: each piece occupies a rectangle of floor tiles
// (w columns × h rows) anchored at its min col/row, and can be picked up
// and walked to a new spot with the grab key.
const FURNITURE_DEFS = {
  bookshelf: { label: 'Bookshelf', w: 1, h: 3 },
  desk: { label: 'Desk', w: 2, h: 1 },
};

const colToX = (c) => -5 + c * CELL;
const rowToZ = (r) => -4 + r * CELL;
const xToCol = (x) => Math.round((x + 5) / CELL);
const zToRow = (z) => Math.round((z + 4) / CELL);

// Rotate a local (dx, dz) offset by a furniture orientation: one step is a
// quarter-turn clockwise on screen, matching a group rotation.y of -π/2.
function rotOffset(dx, dz, rot) {
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) {
    [dx, dz] = [-dz, dx];
  }
  return { dx, dz };
}

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

    this.col = 5;
    this.row = 4;
    this.facing = 0;
    this.playerX = colToX(this.col);
    this.playerZ = rowToZ(this.row);

    this.isAnimating = false;
    this.animT = 0;
    this.animFrom = { x: 0, z: 0 };
    this.animTo = { x: 0, z: 0 };

    this.staticInteractables = [];
    this.posterInteractables = [];
    this.itemMeshes = new Map();
    this.posterMeshes = new Map();
    this.furnitureGroups = {};
    this.focusPoses = new Map();

    this.grabbing = null; // furniture id while carrying a piece
    this.grabOffset = { x: 0, z: 0 };

    this.prompt = null;
    this.promptHint = null;
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

    this._fitRoom();
    this._placeCamera();
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
    const seamMat = new THREE.LineBasicMaterial({ color: 0x584730, transparent: true, opacity: 0.35 });
    const seamPts = [];
    const gridMinX = colToX(0) - CELL / 2;
    const gridMaxX = colToX(COLS - 1) + CELL / 2;
    const gridMinZ = rowToZ(0) - CELL / 2;
    const gridMaxZ = rowToZ(ROWS - 1) + CELL / 2;
    for (let c = 0; c <= COLS; c++) {
      const x = gridMinX + c * CELL;
      seamPts.push(new THREE.Vector3(x, 0.005, gridMinZ), new THREE.Vector3(x, 0.005, gridMaxZ));
    }
    for (let r = 0; r <= ROWS; r++) {
      const z = gridMinZ + r * CELL;
      seamPts.push(new THREE.Vector3(gridMinX, 0.005, z), new THREE.Vector3(gridMaxX, 0.005, z));
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
    tallWall(0.3, ROOM_D + 0.6, ROOM_W / 2, 0);
    lowRim(ROOM_W + 0.6, 0.3, 0, ROOM_D / 2);

    this._addBulletinBoard(4.6, -4.35);
    this._addTitlePoster(-5.0, -4.28);
    this._addLadder(0, ROOM_D / 2 - 0.3);
    this._buildFurniture();
  }

  _addBulletinBoard(x, z) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3220 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 0.12), frameMat);
    frame.position.set(x, 1.9, z + 0.04);
    this.scene.add(frame);

    const tex = makePosterTexture({
      banner: 'Objectives',
      bannerColor: '#8a2a1e',
      bg: '#c9b98a',
      sections: [{ type: 'p', text: 'Pinned jobs, in charcoal. Step close to read them.' }],
      width: 512,
      height: 585,
    });
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
    const tex = makePosterTexture({
      bg: '#20180f',
      ink: '#e8c96a',
      border: '#e8c96a',
      sections: [
        { type: 'gap' },
        { type: 'big', text: 'Box & Bones' },
        { type: 'p', text: 'an old-school maze crawler.' },
        { type: 'gap' },
        {
          type: 'p',
          text: 'Somewhere past the cardboard rim, a maze is waiting. Press BEGIN when you are ready to be small.',
        },
      ],
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.7),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.position.set(x, 1.9, z + 0.02);
    this.scene.add(mesh);

    this.staticInteractables.push({ id: 'title', kind: 'detail', x, z, radius: 1.5, label: 'Box & Bones poster' });
    this.focusPoses.set('title', {
      look: new THREE.Vector3(x, 1.9, z),
      camPos: new THREE.Vector3(x, 1.9, z + 3.4),
      viewHeight: 2.6,
      contentW: 1.3,
      contentH: 1.7,
      panelClass: 'panel-dark',
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

  // ---------- furniture ----------

  _buildFurniture() {
    this.furnitureGroups.bookshelf = this._buildBookshelfGroup();
    this.furnitureGroups.desk = this._buildDeskGroup();
    for (const id of Object.keys(this.furnitureGroups)) {
      this.scene.add(this.furnitureGroups[id]);
      this._placeFurniture(id);
    }
  }

  // Footprint dimensions in tiles for a given orientation: a quarter-turn
  // swaps width and depth.
  _furnitureDims(id, rot) {
    const def = FURNITURE_DEFS[id];
    return rot % 2 === 0 ? { w: def.w, h: def.h } : { w: def.h, h: def.w };
  }

  _furnitureCenter(id) {
    const at = this.gameState.furniture[id];
    const dims = this._furnitureDims(id, at.rot);
    return {
      x: colToX(at.col) + ((dims.w - 1) / 2) * CELL,
      z: rowToZ(at.row) + ((dims.h - 1) / 2) * CELL,
    };
  }

  _placeFurniture(id) {
    const c = this._furnitureCenter(id);
    const g = this.furnitureGroups[id];
    g.position.set(c.x, 0, c.z);
    g.rotation.y = (-this.gameState.furniture[id].rot * Math.PI) / 2;
  }

  _furnitureTiles(id) {
    const at = this.gameState.furniture[id];
    const dims = this._furnitureDims(id, at.rot);
    const tiles = [];
    for (let c = at.col; c < at.col + dims.w; c++) {
      for (let r = at.row; r < at.row + dims.h; r++) tiles.push({ col: c, row: r });
    }
    return tiles;
  }

  // A proper bookcase: side panels, a back, a top, and shelf boards — with
  // a row of old books along the bottom and item slots on the two middle
  // shelves. Group origin is the footprint's center; the open face looks
  // east into the room.
  _buildBookshelfGroup() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5c4326, roughness: 0.8 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x443122, roughness: 0.9 });

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    add(new THREE.BoxGeometry(0.06, 2.3, 2.9), woodDark, -0.3, 1.15, 0); // back
    add(new THREE.BoxGeometry(0.7, 2.3, 0.07), wood, 0, 1.15, -1.45); // left side
    add(new THREE.BoxGeometry(0.7, 2.3, 0.07), wood, 0, 1.15, 1.45); // right side
    add(new THREE.BoxGeometry(0.76, 0.08, 3.04), wood, 0, 2.33, 0); // top
    add(new THREE.BoxGeometry(0.64, 0.07, 2.82), wood, 0.01, 0.12, 0); // bottom board
    add(new THREE.BoxGeometry(0.64, 0.07, 2.82), wood, 0.01, 0.91, 0); // shelf 1
    add(new THREE.BoxGeometry(0.64, 0.07, 2.82), wood, 0.01, 1.65, 0); // shelf 2

    // Old books leaning along the bottom board.
    const spineColors = [0x8a2a1e, 0x3f5d7a, 0x556b2f, 0x9a7b2f, 0x6b4a5a, 0x4a5a6b, 0x7a3a2a];
    let z = -1.24;
    spineColors.forEach((color, i) => {
      const h = 0.34 + (i % 3) * 0.05;
      const t = 0.09 + (i % 2) * 0.04;
      const book = add(
        new THREE.BoxGeometry(0.44, h, t),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
        0.02,
        0.155 + h / 2,
        z + t / 2
      );
      book.rotation.x = (i % 3 === 2 ? 0.06 : 0);
      z += t + 0.05;
    });

    return g;
  }

  // A proper writing desk: an overhanging top on two drawer pedestals,
  // with the ledger, an inkwell, and a quill laid out on it.
  _buildDeskGroup() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x704d2a, roughness: 0.7 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x53381e, roughness: 0.8 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.5, roughness: 0.4 });

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    add(new THREE.BoxGeometry(1.8, 0.1, 0.95), wood, 0, 0.9, 0); // top
    add(new THREE.BoxGeometry(1.84, 0.04, 0.99), woodDark, 0, 0.84, 0); // apron trim

    // Drawer pedestals with fronts and brass knobs.
    for (const side of [-0.62, 0.62]) {
      add(new THREE.BoxGeometry(0.52, 0.82, 0.8), wood, side, 0.41, 0);
      for (const dy of [0.6, 0.34]) {
        add(new THREE.BoxGeometry(0.44, 0.2, 0.03), woodDark, side, dy, 0.41);
        add(new THREE.SphereGeometry(0.025, 8, 8), brass, side, dy, 0.44);
      }
      add(new THREE.BoxGeometry(0.56, 0.05, 0.84), woodDark, side, 0.025, 0); // plinth
    }

    // The ledger: a paper sheet on the desktop that the detailed view reads.
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xefe6c8, roughness: 0.9 })
    );
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.06;
    paper.position.set(-0.15, 0.955, 0.02);
    g.add(paper);

    // Inkwell and a resting quill.
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 10), woodDark, 0.62, 1.0, -0.28);
    add(new THREE.CylinderGeometry(0.02, 0.03, 0.02, 8), brass, 0.62, 1.05, -0.28);
    const quill = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 })
    );
    quill.position.set(0.55, 1.01, -0.1);
    quill.rotation.z = 1.35;
    quill.rotation.y = 0.5;
    g.add(quill);

    return g;
  }

  shelfSlotWorld(i) {
    const c = this._furnitureCenter('bookshelf');
    const s = SHELF_SLOTS[i];
    const o = rotOffset(s.dx, s.dz, this.gameState.furniture.bookshelf.rot);
    return { x: c.x + o.dx, z: c.z + o.dz, y: s.y };
  }

  // ---------- player ----------

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
    for (const mesh of this.itemMeshes.values()) mesh.removeFromParent();
    this.itemMeshes.clear();

    for (const [id, loc] of this.gameState.itemLocationIn('inventory')) {
      const mesh = buildItemMesh(id);
      if (!mesh) continue;
      mesh.position.set(loc.x, POSTER_IDS.includes(id) ? 0.1 : 0.02, loc.z);
      this.scene.add(mesh);
      this.itemMeshes.set(id, mesh);
    }

    // Shelved items are children of the bookshelf itself, so they ride
    // along when it is carried to a new spot.
    for (const [id, loc] of this.gameState.itemLocationIn('inventory-shelf')) {
      const mesh = buildItemMesh(id);
      if (!mesh) continue;
      const s = SHELF_SLOTS[loc.slot];
      mesh.scale.setScalar(0.85);
      mesh.position.set(s.dx, s.y, s.dz);
      this.furnitureGroups.bookshelf.add(mesh);
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
      const tex = makePosterTexture({
        banner: art.banner,
        bannerColor: art.bannerColor,
        sections: art.sections,
      });
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
    // The furniture moves (and turns), so its poses are computed fresh
    // from wherever each piece stands right now.
    if (id === 'desk') {
      const c = this._furnitureCenter('desk');
      const rot = this.gameState.furniture.desk.rot;
      const o = rotOffset(0, 1.2, rot); // hover behind the ledger's edge
      return {
        look: new THREE.Vector3(c.x, 0.95, c.z),
        camPos: new THREE.Vector3(c.x + o.dx, 3.4, c.z + o.dz),
        viewHeight: 2.0,
        contentW: 1.0,
        contentH: 0.68,
        panelClass: 'panel-paper',
        zoom: FRUSTUM_HEIGHT / 2.0,
      };
    }
    if (id === 'bookshelf') {
      const c = this._furnitureCenter('bookshelf');
      const rot = this.gameState.furniture.bookshelf.rot;
      const o = rotOffset(3.4, 0, rot); // face the open side, wherever it points
      return {
        look: new THREE.Vector3(c.x, 1.2, c.z),
        camPos: new THREE.Vector3(c.x + o.dx, 1.2, c.z + o.dz),
        viewHeight: 3.3,
        contentW: 3.04,
        contentH: 2.45,
        panelClass: 'panel-shelf',
        zoom: FRUSTUM_HEIGHT / 3.3,
      };
    }
    const pose = this.focusPoses.get(id);
    if (!pose) return null;
    return { ...pose, zoom: FRUSTUM_HEIGHT / pose.viewHeight };
  }

  _roomCamPos() {
    return ROOM_CENTER.clone().add(
      new THREE.Vector3(CAM_DIR.x * CAM_DIST, CAM_HEIGHT, CAM_DIR.z * CAM_DIST)
    );
  }

  // The resting pose: whole room in frame, camera still.
  getFollowPose() {
    return {
      camPos: this._roomCamPos(),
      look: ROOM_CENTER.clone(),
      zoom: this.roomZoom,
    };
  }

  // Compute the zoom that fits the whole room (with walls) in the frame,
  // whatever the window's aspect ratio.
  _fitRoom() {
    this.camera.zoom = 1;
    this.camera.position.copy(this._roomCamPos());
    this.camera.lookAt(ROOM_CENTER);
    this.camera.updateMatrixWorld(true);
    const inv = this.camera.matrixWorldInverse;
    let maxX = 0;
    let maxY = 0;
    for (const cx of [-6.4, 6.4]) {
      for (const cy of [0, 3.4]) {
        for (const cz of [-4.9, 4.9]) {
          const v = new THREE.Vector3(cx, cy, cz).applyMatrix4(inv);
          maxX = Math.max(maxX, Math.abs(v.x));
          maxY = Math.max(maxY, Math.abs(v.y));
        }
      }
    }
    const aspect = window.innerWidth / window.innerHeight;
    const halfW = (FRUSTUM_HEIGHT * aspect) / 2;
    const halfH = FRUSTUM_HEIGHT / 2;
    this.roomZoom = Math.min(halfW / maxX, halfH / maxY) * 0.96;
  }

  _placeCamera() {
    const pose = this.getFollowPose();
    this.camera.position.copy(pose.camPos);
    this.camera.zoom = pose.zoom * this.transitionZoom;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(pose.look);
  }

  // Transitions dive toward / pull away from the player (who stands at the
  // ladder when climbing either way).
  _applyTransitionPose(t) {
    const playerLook = new THREE.Vector3(this.playerX, 0.6, this.playerZ);
    const playerCam = playerLook
      .clone()
      .add(new THREE.Vector3(CAM_DIR.x * CAM_DIST, CAM_HEIGHT, CAM_DIR.z * CAM_DIST));
    const room = this.getFollowPose();
    this.camera.position.lerpVectors(room.camPos, playerCam, t);
    this.camera.zoom = this.roomZoom * (1 + 2.6 * t);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(new THREE.Vector3().lerpVectors(room.look, playerLook, t));
  }

  transitionOut(t) {
    this._applyTransitionPose(t);
  }

  transitionIn(t) {
    this._applyTransitionPose(1 - t);
  }

  transitionReset() {
    this.transitionZoom = 1;
    this._placeCamera();
  }

  // Climbing into the box always lands you at the foot of the ladder.
  enterAtLadder() {
    this.col = LADDER_TILE.col;
    this.row = LADDER_TILE.row;
    this.facing = 0;
    this.playerX = colToX(this.col);
    this.playerZ = rowToZ(this.row);
    this.isAnimating = false;
    this.grabbing = null;
    document.body.classList.remove('carrying');
  }

  setToast(message, seconds) {
    this.toastMessage = message;
    this.toastTimer = seconds;
  }

  // ---------- movement & collision ----------

  _tileBlocked(col, row, ignoreFurnitureId = null) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    for (const id of Object.keys(FURNITURE_DEFS)) {
      if (id === ignoreFurnitureId) continue;
      if (this._furnitureTiles(id).some((t) => t.col === col && t.row === row)) return true;
    }
    return false;
  }

  // Whether a piece of furniture could stand with its footprint anchored
  // at (col, row) in orientation rot: inside the room, off the ladder's
  // tile, clear of other furniture and of anything lying on the floor.
  _furniturePlacementBlocked(id, col, row, rot) {
    const dims = this._furnitureDims(id, rot);
    for (let c = col; c < col + dims.w; c++) {
      for (let r = row; r < row + dims.h; r++) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
        if (c === LADDER_TILE.col && r === LADDER_TILE.row) return true;
        if (this._tileBlocked(c, r, id)) return true;
        for (const [, loc] of this.gameState.itemLocationIn('inventory')) {
          if (xToCol(loc.x) === c && zToRow(loc.z) === r) return true;
        }
      }
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
    this.gameState.stepsTaken += 1;
    this.audio.footstep('wood');
  }

  _tryStep(directionIndex) {
    const dir = FACINGS[directionIndex];
    if (this.grabbing) {
      // Carrying furniture: the player and the piece move as one, and the
      // step only happens if both destinations are clear.
      const at = this.gameState.furniture[this.grabbing];
      const fCol = at.col + dir.dx;
      const fRow = at.row + dir.dz;
      if (
        this._tileBlocked(this.col + dir.dx, this.row + dir.dz, this.grabbing) ||
        this._furniturePlacementBlocked(this.grabbing, fCol, fRow, at.rot)
      ) {
        this.audio.playBump();
        return;
      }
      this.gameState.furniture[this.grabbing] = { ...at, col: fCol, row: fRow };
      this._beginStep(dir.dx, dir.dz);
      return;
    }
    if (this._tileBlocked(this.col + dir.dx, this.row + dir.dz)) {
      this.audio.playBump();
      return;
    }
    this._beginStep(dir.dx, dir.dz);
  }

  // Rotate the carried piece a quarter-turn (dir +1 is clockwise on
  // screen). It pivots about its center when it can; if the swung
  // footprint would land on you, the carrier holds it at arm's length —
  // the pivot nudges a tile away from you (or wherever else it fits).
  // Refused only if no pivot is clear of walls, furniture, floor items,
  // the ladder tile, and you.
  _tryRotate(dir) {
    const id = this.grabbing;
    if (!id) return;
    const at = this.gameState.furniture[id];
    const newRot = (at.rot + dir + 4) % 4;
    const oldDims = this._furnitureDims(id, at.rot);
    const newDims = this._furnitureDims(id, newRot);
    const centerCol = at.col + (oldDims.w - 1) / 2;
    const centerRow = at.row + (oldDims.h - 1) / 2;
    const baseCol = Math.floor(centerCol - (newDims.w - 1) / 2 + 0.001);
    const baseRow = Math.floor(centerRow - (newDims.h - 1) / 2 + 0.001);

    const awayC = Math.sign(centerCol - this.col);
    const awayR = Math.sign(centerRow - this.row);
    const nudges = [
      [0, 0],
      ...(awayC ? [[awayC, 0]] : []),
      ...(awayR ? [[0, awayR]] : []),
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dc, dr], i, arr) => arr.findIndex(([c, r]) => c === dc && r === dr) === i);

    for (const [dc, dr] of nudges) {
      const col = baseCol + dc;
      const row = baseRow + dr;
      let coversPlayer = false;
      for (let c = col; c < col + newDims.w && !coversPlayer; c++) {
        for (let r = row; r < row + newDims.h; r++) {
          if (c === this.col && r === this.row) {
            coversPlayer = true;
            break;
          }
        }
      }
      if (coversPlayer || this._furniturePlacementBlocked(id, col, row, newRot)) continue;
      this.gameState.furniture[id] = { col, row, rot: newRot };
      const c = this._furnitureCenter(id);
      this.grabOffset = { x: c.x - colToX(this.col), z: c.z - rowToZ(this.row) };
      this.furnitureGroups[id].rotation.y = (-newRot * Math.PI) / 2;
      this.audio.playInteract();
      return;
    }
    this.audio.playBump();
  }

  _isSlotOccupied(slot) {
    return !!this.gameState.shelfSlotOccupant(slot);
  }

  _nearestEmptySlot() {
    let nearest = null;
    let nearestDist = SLOT_RADIUS;
    for (let i = 0; i < SHELF_SLOTS.length; i++) {
      if (this._isSlotOccupied(i)) continue;
      const s = this.shelfSlotWorld(i);
      const d = Math.hypot(s.x - this.playerX, s.z - this.playerZ);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = { index: i, ...s };
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

  _nearestFurniture() {
    let nearest = null;
    let nearestDist = GRAB_RADIUS;
    for (const id of Object.keys(FURNITURE_DEFS)) {
      for (const t of this._furnitureTiles(id)) {
        const d = Math.hypot(colToX(t.col) - this.playerX, rowToZ(t.row) - this.playerZ);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = id;
        }
      }
    }
    return nearest;
  }

  _checkTidyObjective() {
    const allShelved = ['compass', 'map'].every(
      (id) => this.gameState.itemLocations[id]?.scene === 'inventory-shelf'
    );
    if (allShelved) this.gameState.completeObjective('tidy-shelf');
  }

  _processMovementInput() {
    // While carrying furniture the turn inputs get a real job again:
    // rotating the carried piece a quarter-turn at a time.
    if (this.grabbing) {
      if (this.input.wasPressed('turnLeft')) this._tryRotate(-1);
      else if (this.input.wasPressed('turnRight')) this._tryRotate(1);
      const held = this.input.latestDown(
        KEY_DIRS.slice(0, 4).map((k) => k.action)
      );
      if (held) {
        const dir = KEY_DIRS.find((k) => k.action === held).dir;
        this.facing = dir;
        this._tryStep(dir);
      }
      return;
    }
    // Absolute, screen-aligned steps: last direction pressed wins. The
    // diorama never rotates, so with empty arms the turn keys (and ←/→)
    // step sideways instead of spinning the avatar in place.
    const held = this.input.latestDown(KEY_DIRS.map((k) => k.action));
    if (held) {
      const dir = KEY_DIRS.find((k) => k.action === held).dir;
      this.facing = dir; // the avatar turns to face the way it walks
      this._tryStep(dir);
    }
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastMessage = null;
    }

    let hop = 0;
    if (this.isAnimating) {
      this.animT += dt / STEP_DURATION;
      if (this.animT >= 1) {
        this.animT = 1;
        this.isAnimating = false;
      }
      const t = easeInOutQuad(this.animT);
      this.playerX = this.animFrom.x + (this.animTo.x - this.animFrom.x) * t;
      this.playerZ = this.animFrom.z + (this.animTo.z - this.animFrom.z) * t;
      hop = Math.sin(Math.min(this.animT, 1) * Math.PI) * 0.05;
    }
    // Process input the same frame a step finishes, so held keys chain
    // steps with no dead frame between them.
    if (!this.isAnimating) {
      this._processMovementInput();
    }

    const dir = FACINGS[this.facing];
    this.playerMesh.position.set(this.playerX, hop, this.playerZ);
    // face along the walk direction (the face is on the avatar's -z side)
    this.playerMesh.rotation.y = Math.atan2(-dir.dx, -dir.dz);

    // Carried furniture keeps its grip offset and rides the step tween,
    // floating slightly off the floor until it is set down.
    if (this.grabbing) {
      const g = this.furnitureGroups[this.grabbing];
      g.position.set(this.playerX + this.grabOffset.x, 0.12, this.playerZ + this.grabOffset.z);
    }

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
      this.gameState.shelveFromHand(side, slot.index);
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

  _grabRelease() {
    const id = this.grabbing;
    this.grabbing = null;
    document.body.classList.remove('carrying');
    this._placeFurniture(id);
    const at = this.gameState.furniture[id];
    this.gameState.moveFurniture(id, at.col, at.row, at.rot);
    this.setToast(`Set the ${FURNITURE_DEFS[id].label} down.`, 2);
    this.audio.playDrop();
  }

  _grabStart(id) {
    this.grabbing = id;
    document.body.classList.add('carrying');
    const g = this.furnitureGroups[id];
    this.grabOffset = { x: g.position.x - this.playerX, z: g.position.z - this.playerZ };
    this.setToast(`Picked the ${FURNITURE_DEFS[id].label} up. Walk it somewhere new.`, 2.5);
    this.audio.playPickup();
  }

  // How the rotate control reads in the carrying prompt: the visible ⟲ ⟳
  // buttons on touch, the bound turn keys otherwise.
  _rotateHintText() {
    if (document.body.classList.contains('touch')) return '⟲ ⟳ to rotate it';
    return `${this.input.keyLabel('turnLeft')} / ${this.input.keyLabel('turnRight')} to rotate it`;
  }

  _handleInteractions() {
    this.promptAction = null;
    this.promptHint = null;
    this.promptHintAction = null;

    // While carrying furniture, setting it down (or turning it) is the
    // only interaction.
    if (this.grabbing) {
      this.prompt = `${this.input.promptFor('grab')} to set the ${FURNITURE_DEFS[this.grabbing].label} down`;
      this.promptAction = 'grab';
      this.promptHint = this._rotateHintText();
      this.promptHintAction = 'turnLeft';
      if (this.input.wasPressed('grab')) this._grabRelease();
      return;
    }

    // Quick pickup applies to things lying on the floor; whatever rests
    // in the bookshelf is taken from the bookshelf's own detailed view.
    const worldPos = new THREE.Vector3();
    let nearestItem = null;
    let nearestItemDist = PICKUP_RADIUS;
    for (const [id, mesh] of this.itemMeshes.entries()) {
      if (this.gameState.itemLocations[id]?.scene !== 'inventory') continue;
      mesh.getWorldPosition(worldPos);
      const d = Math.hypot(worldPos.x - this.playerX, worldPos.z - this.playerZ);
      if (d < nearestItemDist) {
        nearestItemDist = d;
        nearestItem = id;
      }
    }

    const deskCenter = this._furnitureCenter('desk');
    const shelfCenter = this._furnitureCenter('bookshelf');
    const spots = [
      ...this.staticInteractables,
      { id: 'desk', kind: 'detail', x: deskCenter.x, z: deskCenter.z, radius: 1.6, label: 'Desk' },
      { id: 'bookshelf', kind: 'detail', x: shelfCenter.x, z: shelfCenter.z, radius: 1.6, label: 'Bookshelf' },
      ...this.posterInteractables,
    ];
    let nearestSpot = null;
    let nearestSpotDist = Infinity;
    for (const spot of spots) {
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

    // The prompt names the most pressing action; F ("use") is handled
    // below regardless of which action the prompt happens to advertise.
    if (nearestItem && this.gameState.freeHand()) {
      this.prompt = `${this.input.promptFor('interact')} to pick up the ${ITEM_LABELS[nearestItem]}`;
      this.promptAction = 'interact';
    } else if (anchor) {
      this.prompt = `${this.input.promptFor(promptDropAction)} to hang the ${ITEM_LABELS[promptItem]}`;
      this.promptAction = promptDropAction;
    } else if (slot) {
      this.prompt = `${this.input.promptFor(promptDropAction)} to place the ${ITEM_LABELS[promptItem]} on the shelf`;
      this.promptAction = promptDropAction;
    } else if (nearestSpot) {
      if (nearestSpot.kind === 'ladder') {
        this.prompt = `${this.input.promptFor('interact')} to climb out`;
      } else {
        this.prompt = `${this.input.promptFor('interact')} to look at the ${nearestSpot.label}`;
      }
      this.promptAction = 'interact';
    } else if (nearestItem) {
      this.prompt = `Your hands are full`;
    } else {
      this.prompt = null;
    }

    if (this.input.wasPressed('interact')) {
      if (nearestItem && this.gameState.freeHand()) {
        const hand = this.gameState.pickUp(nearestItem);
        this.setToast(`Picked up the ${ITEM_LABELS[nearestItem]} in your ${hand} hand.`, 2);
        this.audio.playPickup();
      } else if (nearestSpot && nearestSpot.kind === 'ladder') {
        this.onClimbOut();
      } else if (nearestSpot) {
        this.audio.playInteract();
        this.onOpenDetail(nearestSpot.id);
      }
    }

    // Standing beside furniture, the grab hint rides under whatever the
    // main prompt says (or becomes the prompt when there is nothing else).
    const nearFurniture = this._nearestFurniture();
    if (nearFurniture) {
      const line = `${this.input.promptFor('grab')} to move the ${FURNITURE_DEFS[nearFurniture].label}`;
      if (this.prompt) {
        this.promptHint = line;
        this.promptHintAction = 'grab';
      } else {
        this.prompt = line;
        this.promptAction = 'grab';
      }
      if (this.input.wasPressed('grab')) this._grabStart(nearFurniture);
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
    this._fitRoom();
    if (!this.cameraOverride) this._placeCamera();
  }
}
