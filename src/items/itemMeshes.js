import * as THREE from 'three';
import { POSTER_IDS } from '../core/GameState.js';

// Shared item models, used everywhere an item appears: on shelves and
// floors in the box, on the maze floor, in the avatar's hands, and as
// first-person "held" view-models in the maze.

function buildCompass() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.5, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.07, 18), gold);
  base.position.y = 0.035;
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.125, 0.075, 18),
    new THREE.MeshStandardMaterial({ color: 0xefe6c8, roughness: 0.7 })
  );
  face.position.y = 0.04;
  const needleN = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.012, 0.095),
    new THREE.MeshStandardMaterial({ color: 0xb53b2c })
  );
  needleN.position.set(0, 0.082, -0.048);
  const needleS = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.012, 0.095),
    new THREE.MeshStandardMaterial({ color: 0x4a4238 })
  );
  needleS.position.set(0, 0.082, 0.048);
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x2c2018 })
  );
  pin.position.y = 0.085;
  group.add(base, face, needleN, needleS, pin);
  return group;
}

function makeMapSheetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8dcb0';
  ctx.fillRect(0, 0, 96, 64);
  ctx.strokeStyle = '#8a6f3f';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, 86, 54);
  ctx.strokeStyle = '#6b4a2b';
  ctx.beginPath();
  ctx.moveTo(14, 46);
  ctx.lineTo(14, 24);
  ctx.lineTo(38, 24);
  ctx.lineTo(38, 38);
  ctx.lineTo(62, 38);
  ctx.lineTo(62, 16);
  ctx.lineTo(80, 16);
  ctx.stroke();
  ctx.fillStyle = '#b53b2c';
  ctx.beginPath();
  ctx.arc(80, 16, 3.4, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildMap() {
  const group = new THREE.Group();
  // A partially unrolled chart: flat sheet between two curls.
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.28),
    new THREE.MeshStandardMaterial({ map: makeMapSheetTexture(), roughness: 0.85, side: THREE.DoubleSide })
  );
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = 0.045;
  const curlMat = new THREE.MeshStandardMaterial({ color: 0xd9cb9c, roughness: 0.85 });
  const curlL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), curlMat);
  curlL.rotation.x = Math.PI / 2;
  curlL.position.set(-0.19, 0.045, 0);
  const curlR = curlL.clone();
  curlR.position.x = 0.19;
  group.add(sheet, curlL, curlR);
  return group;
}

function buildScroll() {
  const group = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.62, 12),
    new THREE.MeshStandardMaterial({ color: 0xe6d9b2, roughness: 0.85 })
  );
  paper.rotation.z = Math.PI / 2;
  const capMat = new THREE.MeshStandardMaterial({ color: 0xcdbd8d, roughness: 0.9 });
  const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), capMat);
  capL.rotation.z = Math.PI / 2;
  capL.position.x = -0.33;
  const capR = capL.clone();
  capR.position.x = 0.33;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.098, 0.098, 0.13, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.7 })
  );
  band.rotation.z = Math.PI / 2;
  const seal = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.5 })
  );
  seal.position.set(0, 0.095, 0);
  group.add(paper, capL, capR, band, seal);
  return group;
}

const BUILDERS = { compass: buildCompass, map: buildMap };
for (const id of POSTER_IDS) BUILDERS[id] = buildScroll;

export function buildItemMesh(id) {
  const build = BUILDERS[id];
  return build ? build() : null;
}
