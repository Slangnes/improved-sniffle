import * as THREE from 'three';
import { InputManager } from '../core/InputManager.js';
import { POSTER_IDS, ITEM_LABELS } from '../core/GameState.js';
import { drawMinimapInto } from './HUD.js';

const ZOOM_IN_DURATION = 0.55;
const ZOOM_OUT_DURATION = 0.45;

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// The "detailed view": walking up to something and looking at it closely.
// For objects in the box (posters, bulletin board, desk) the isometric
// camera physically flies up to the object, then the readable panel fades
// in over it. For carried items (compass, map, rolled posters) the panel
// opens directly with a slight push-in on the viewport.
export class DetailView {
  constructor({ input, gameState, audio }) {
    this.input = input;
    this.gameState = gameState;
    this.audio = audio;

    this.layer = document.getElementById('modal-layer');
    this.content = document.getElementById('modal-content');
    this.closeBtn = document.getElementById('modal-close');
    this.viewport = document.getElementById('viewport');

    this.state = 'closed'; // closed | zoomIn | open | zoomOut
    this.currentId = null;
    this.usesCamera = false;
    this.started = false;
    this.tween = null;

    this.inventoryScene = null;
    this.mazeScene = null;
    this.onBegin = null;

    this.closeBtn.addEventListener('click', () => this.requestClose());
    this.layer.addEventListener('click', (e) => {
      if (e.target === this.layer) this.requestClose();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.requestClose();
    });
  }

  attach({ inventoryScene, mazeScene, touchControls, onBegin }) {
    this.inventoryScene = inventoryScene;
    this.mazeScene = mazeScene;
    this.touchControls = touchControls;
    this.onBegin = onBegin;
  }

  isOpen() {
    return this.state !== 'closed';
  }

  _applyPose(pose) {
    const cam = this.inventoryScene.camera;
    cam.position.copy(pose.camPos);
    cam.zoom = pose.zoom;
    cam.updateProjectionMatrix();
    cam.lookAt(pose.look);
  }

  // Boot: the game wakes up already looking at the title poster.
  openBoot() {
    const pose = this.inventoryScene.getFocusPose('title');
    this.inventoryScene.cameraOverride = true;
    this._applyPose(pose);
    this.currentId = 'title';
    this.currentPose = pose;
    this.usesCamera = true;
    this.currentLook = pose.look.clone();
    this.state = 'open';
    this._showPanel();
  }

  open(id) {
    if (this.isOpen()) return;
    const pose = this.inventoryScene.getFocusPose(id);
    if (!pose) return this.openItem(id);
    this.currentId = id;
    this.currentPose = pose;
    this.usesCamera = true;
    this.state = 'zoomIn';
    this.inventoryScene.cameraOverride = true;
    const cam = this.inventoryScene.camera;
    this.tween = {
      t: 0,
      duration: ZOOM_IN_DURATION,
      fromPos: cam.position.clone(),
      fromLook: new THREE.Vector3(
        this.inventoryScene.playerX,
        0.6,
        this.inventoryScene.playerZ
      ),
      fromZoom: cam.zoom,
      toPos: pose.camPos.clone(),
      toLook: pose.look.clone(),
      toZoom: pose.zoom,
    };
    this.audio.playModalOpen();
  }

  openItem(id) {
    if (this.isOpen()) return;
    this.currentId = id;
    this.currentPose = null;
    this.usesCamera = false;
    this.state = 'open';
    this.viewport.classList.add('inspect');
    this._showPanel();
    this.audio.playModalOpen();
  }

  requestClose() {
    if (this.state !== 'open') return;
    if (this.currentId === 'title' && !this.started) return; // must Begin first
    this._beginClose();
  }

  _beginClose() {
    this.layer.classList.add('hidden');
    this.viewport.classList.remove('inspect');
    this.audio.playModalClose();
    if (!this.usesCamera) {
      this.state = 'closed';
      this.currentId = null;
      return;
    }
    const cam = this.inventoryScene.camera;
    const follow = this.inventoryScene.getFollowPose();
    this.state = 'zoomOut';
    this.tween = {
      t: 0,
      duration: ZOOM_OUT_DURATION,
      fromPos: cam.position.clone(),
      fromLook: (this.currentLook ?? follow.look).clone(),
      fromZoom: cam.zoom,
      toPos: follow.camPos.clone(),
      toLook: follow.look.clone(),
      toZoom: follow.zoom,
    };
  }

  update(dt) {
    if (this.state !== 'zoomIn' && this.state !== 'zoomOut') return;
    const tw = this.tween;
    tw.t = Math.min(1, tw.t + (dt > 0 ? dt : 1 / 60) / tw.duration);
    const k = ease(tw.t);
    const cam = this.inventoryScene.camera;
    cam.position.lerpVectors(tw.fromPos, tw.toPos, k);
    cam.zoom = Math.exp(lerp(Math.log(tw.fromZoom), Math.log(tw.toZoom), k));
    cam.updateProjectionMatrix();
    const look = new THREE.Vector3().lerpVectors(tw.fromLook, tw.toLook, k);
    cam.lookAt(look);

    if (tw.t >= 1) {
      if (this.state === 'zoomIn') {
        this.state = 'open';
        this.currentLook = tw.toLook.clone();
        this._showPanel();
      } else {
        this.state = 'closed';
        this.currentId = null;
        this.inventoryScene.cameraOverride = false;
        this.inventoryScene.transitionReset();
      }
    }
  }

  _showPanel() {
    this.content.innerHTML = '';
    const box = document.getElementById('modal-box');
    box.className = '';
    // The info lives ON the object: size the panel to the zoomed object's
    // projected screen rectangle so the text sits on the actual poster /
    // board / desk paper rather than in a floating card.
    if (this.currentPose) {
      const scale = window.innerHeight / this.currentPose.viewHeight;
      box.style.width = `${Math.round(this.currentPose.contentW * scale)}px`;
      box.style.height = `${Math.round(this.currentPose.contentH * scale)}px`;
      box.classList.add('panel-world', this.currentPose.panelClass || 'panel-paper');
    } else {
      box.style.width = '';
      box.style.height = '';
      box.classList.add('panel-item');
    }
    const builders = {
      title: () => this._title(),
      'poster-howto': () => this._howto(),
      'poster-controls': () => this._controls(),
      'poster-settings': () => this._settings(),
      bulletin: () => this._bulletin(),
      desk: () => this._desk(),
      compass: () => this._compassItem(),
      map: () => this._mapItem(),
    };
    (builders[this.currentId] || (() => this._fallback()))();
    if (POSTER_IDS.includes(this.currentId)) this._posterFooter(this.currentId);
    this.layer.classList.remove('hidden');
  }

  _fallback() {
    this.content.innerHTML = `<h2>${this.currentId}</h2><p>Nothing to see here yet.</p>`;
  }

  _title() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <h2>Box &amp; Bones</h2>
      <p><em>An old-school maze crawler.</em></p>
      <p>You keep a small wooden box, and inside it, a whole room. Beyond the
      box: a maze that grows every time you beat it.</p>`;
    if (!this.started) {
      const begin = document.createElement('button');
      begin.id = 'detail-begin';
      begin.className = 'rebind';
      begin.textContent = 'BEGIN';
      begin.style.cssText = 'display:block;margin:18px auto 0;font-size:16px;padding:12px 34px;letter-spacing:3px;';
      begin.addEventListener('click', () => {
        this.started = true;
        if (this.onBegin) this.onBegin();
        this._beginClose();
      });
      wrap.appendChild(begin);
    } else {
      const p = document.createElement('p');
      p.textContent = 'The poster that started it all. It is glued down firmly.';
      wrap.appendChild(p);
    }
    this.content.appendChild(wrap);
  }

  _howto() {
    this.content.innerHTML = `
      <h2>How To Play</h2>
      <p>You keep a small wooden box. Climb into it and it becomes a place of its
      own &mdash; shelves, a desk, a corkboard of jobs to do. Climb the ladder to
      shrink back out into the real world, where a maze waits.</p>
      <p>Each maze is a ring. Find its far edge and the maze itself grows
      outward, wrapping a new, bigger ring around the one you just cleared.
      Clear three rings and the whole thing folds back to the start &mdash;
      a fresh maze, ready to run again.</p>
      <p>You move one square at a time, everywhere. In the box, what you
      press is where you go on screen: W walks up, S down, A left, D right.
      In the maze it's first-person: W/S step forward and back, A/D
      sidestep, Q/E turn you in place. The arrow keys always work too
      (&#8593;&#8595; step, &#8592;&#8594; turn). The ladder is the only way
      out of the box.</p>
      <p>You have two hands, and each can hold one thing. What your left
      hand holds sits at the left of the screen, your right at the right.
      F picks things up into a free hand; Z sets down (or shelves, or
      hangs) what's in your left hand, C your right. Tap a held item to
      look at it closely.</p>
      <p>Pick up the Compass and Map from the shelves and use them to find
      your way. Posters come off the walls too &mdash; carry them rolled up
      and hang them back on any empty hook.</p>
      <ul>
        <li>W / S &mdash; step forward / back</li>
        <li>A / D &mdash; sidestep left / right</li>
        <li>Q / E &mdash; turn left / right</li>
        <li>F &mdash; use what's in front of you</li>
        <li>Z / C &mdash; left / right hand: drop, shelve, or hang</li>
        <li>I &mdash; look into your box (from the maze)</li>
        <li>1 / 2 &mdash; toggle the compass / map overlays</li>
        <li>M &mdash; mute all audio</li>
      </ul>
      <p>On a touch screen: the pad steps and sidesteps, ⟲⟳ turn, USE
      interacts, and each hand has its own DROP button on its own side.</p>`;
  }

  _controls() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>Controls</h2><p>Click a binding, then press any key.</p>`;
    for (const action of InputManager.actionList) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const label = document.createElement('span');
      label.textContent = InputManager.actionLabels[action];
      const button = document.createElement('button');
      button.className = 'rebind';
      button.textContent = this.input.keyLabel(action);
      button.addEventListener('click', () => {
        button.textContent = '...';
        button.classList.add('listening');
        this.input.listenForRebind(action, () => {
          button.textContent = this.input.keyLabel(action);
          button.classList.remove('listening');
          this.audio.playRebindConfirm();
        });
      });
      row.append(label, button);
      wrap.appendChild(row);
    }
    this.content.appendChild(wrap);
  }

  _settings() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>Settings</h2>`;

    const musicRow = document.createElement('div');
    musicRow.className = 'keybind-row';
    const musicLabel = document.createElement('span');
    musicLabel.textContent = 'Music Volume';
    const musicInput = document.createElement('input');
    musicInput.type = 'range';
    musicInput.min = '0';
    musicInput.max = '1';
    musicInput.step = '0.05';
    musicInput.value = String(this.audio.musicVolume);
    musicInput.addEventListener('input', () => this.audio.setMusicVolume(parseFloat(musicInput.value)));
    musicRow.append(musicLabel, musicInput);
    wrap.appendChild(musicRow);

    const sfxRow = document.createElement('div');
    sfxRow.className = 'keybind-row';
    const sfxLabel = document.createElement('span');
    sfxLabel.textContent = 'Sound Effects Volume';
    const sfxInput = document.createElement('input');
    sfxInput.type = 'range';
    sfxInput.min = '0';
    sfxInput.max = '1';
    sfxInput.step = '0.05';
    sfxInput.value = String(this.audio.sfxVolume);
    sfxInput.addEventListener('input', () => {
      this.audio.setSfxVolume(parseFloat(sfxInput.value));
      this.audio.playInteract();
    });
    sfxRow.append(sfxLabel, sfxInput);
    wrap.appendChild(sfxRow);

    const muteRow = document.createElement('div');
    muteRow.className = 'keybind-row';
    const muteLabel = document.createElement('span');
    muteLabel.textContent = `Mute All Audio (${this.input.keyLabel('mute')})`;
    const muteInput = document.createElement('input');
    muteInput.type = 'checkbox';
    muteInput.checked = this.audio.muted;
    muteInput.addEventListener('change', () => this.audio.setMuted(muteInput.checked));
    muteRow.append(muteLabel, muteInput);
    wrap.appendChild(muteRow);

    const handRow = document.createElement('div');
    handRow.className = 'keybind-row';
    const handLabel = document.createElement('span');
    handLabel.textContent = 'Left-Handed Touch Layout';
    const handInput = document.createElement('input');
    handInput.type = 'checkbox';
    handInput.checked = localStorage.getItem('box-and-bones:leftHanded') === '1';
    handInput.addEventListener('change', () => {
      localStorage.setItem('box-and-bones:leftHanded', handInput.checked ? '1' : '0');
      this.touchControls?.applyHandedness(handInput.checked);
    });
    handRow.append(handLabel, handInput);
    wrap.appendChild(handRow);

    const resetRow = document.createElement('div');
    resetRow.className = 'keybind-row';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'rebind';
    resetBtn.textContent = 'Reset Save Data';
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem('box-and-bones:save');
      window.location.reload();
    });
    resetRow.appendChild(resetBtn);
    wrap.appendChild(resetRow);

    this.content.appendChild(wrap);
  }

  _bulletin() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>Bulletin Board</h2>`;
    for (const obj of this.gameState.objectives) {
      const row = document.createElement('div');
      row.className = 'objective-row';
      row.innerHTML = `<span>${obj.done ? '✓' : '○'}</span><span class="${obj.done ? 'done' : ''}">${obj.text}</span>`;
      wrap.appendChild(row);
    }
    this.content.appendChild(wrap);
  }

  _desk() {
    const g = this.gameState;
    const carriedNames = g.carriedList().map((id) => ITEM_LABELS[id]).join(', ');
    this.content.innerHTML = `
      <h2>Desk</h2>
      <p>A ledger, half-filled in your own hand.</p>
      <div class="objective-row"><span>Current maze layer:</span><span>${g.mazeLayer} / 3</span></div>
      <div class="objective-row"><span>Full runs completed:</span><span>${g.runsCompleted}</span></div>
      <div class="objective-row"><span>Items carried:</span><span>${carriedNames || 'none'}</span></div>
    `;
  }

  _compassItem() {
    const inMaze = this.gameState.scene === 'maze';
    const bearing = inMaze ? this.mazeScene.exitWorldBearingFrom() : null;
    const deg = bearing === null ? -35 : (bearing * 180) / Math.PI;
    this.content.innerHTML = `
      <h2>Compass</h2>
      <div style="width:150px;height:150px;margin:14px auto;border-radius:50%;border:4px solid #6b4a2b;background:radial-gradient(circle,#f3ead0 0%,#ded0a8 100%);position:relative;">
        <div style="position:absolute;left:50%;top:50%;width:6px;height:58px;margin:-58px 0 0 -3px;background:linear-gradient(to bottom,#b53b2c 0%,#b53b2c 50%,#6b4a2b 50%,#6b4a2b 100%);transform-origin:bottom center;transform:rotate(${deg}deg);"></div>
        <div style="position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#6b4a2b;"></div>
      </div>
      <p>${
        inMaze
          ? 'The needle strains toward the way out of the maze.'
          : 'In here the needle only drifts. It wants the maze.'
      }</p>`;
  }

  _mapItem() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>Map</h2>`;
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 360;
    canvas.style.cssText = 'display:block;margin:12px auto;border:3px solid #6b4a2b;background:#efe6c8;max-width:100%;';
    wrap.appendChild(canvas);
    drawMinimapInto(canvas, this.mazeScene.minimapData());
    const note = document.createElement('p');
    note.textContent =
      this.gameState.scene === 'maze'
        ? 'Your own hand has inked in every corridor you have walked.'
        : 'A charcoal record of the maze beyond the box.';
    wrap.appendChild(note);
    this.content.appendChild(wrap);
  }

  _posterFooter(id) {
    const loc = this.gameState.itemLocations[id];
    if (loc?.scene === 'inventory-wall') {
      if (this.gameState.freeHand()) {
        const btn = document.createElement('button');
        btn.className = 'rebind';
        btn.dataset.takeDown = id;
        btn.textContent = 'Take it off the wall';
        btn.style.cssText = 'display:block;margin:16px auto 0;';
        btn.addEventListener('click', () => {
          this.gameState.takeIntoHand(id);
          this.audio.playPickup();
          this._beginClose();
        });
        this.content.appendChild(btn);
      } else {
        const p = document.createElement('p');
        p.innerHTML = `<em>You would take it down, but your hands are full.</em>`;
        this.content.appendChild(p);
      }
    } else {
      const p = document.createElement('p');
      p.innerHTML = `<em>Unrolled in your hands. It can hang on any empty hook.</em>`;
      this.content.appendChild(p);
    }
  }
}
