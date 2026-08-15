import * as THREE from 'three';

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createWallTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(42);

  ctx.fillStyle = '#443a2c';
  ctx.fillRect(0, 0, size, size);

  const brickW = 64;
  const brickH = 32;
  const mortar = 4;

  for (let row = 0; row * brickH < size + brickH; row++) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = -1; col * brickW + offset < size + brickW; col++) {
      const x = col * brickW + offset;
      const y = row * brickH;
      const shade = 0.75 + rand() * 0.3;
      const r = Math.floor(120 * shade);
      const g = Math.floor(102 * shade);
      const b = Math.floor(78 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + mortar / 2, y + mortar / 2, brickW - mortar, brickH - mortar);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 0.9);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createFloorTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(7);

  ctx.fillStyle = '#3c372a';
  ctx.fillRect(0, 0, size, size);

  const tile = 64;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const shade = 0.85 + rand() * 0.25;
      const c = Math.floor(74 * shade);
      ctx.fillStyle = `rgb(${c},${Math.floor(c * 0.92)},${Math.floor(c * 0.72)})`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCeilingTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#221f28';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= size; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
