import * as THREE from 'three';

export function makeLabelTexture({
  title,
  subtitle = '',
  width = 256,
  height = 340,
  bg = '#ece0bd',
  border = '#6b4a2b',
  ink = '#241c10',
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, width - 10, height - 10);

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.floor(width * 0.11)}px Georgia, serif`;
  wrapText(ctx, title, width / 2, height * 0.4, width * 0.8, width * 0.13);

  if (subtitle) {
    ctx.font = `${Math.floor(width * 0.06)}px Georgia, serif`;
    ctx.fillText(subtitle, width / 2, height * 0.82, width * 0.8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line);
      line = word + ' ';
    } else {
      line = test;
    }
  }
  lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l.trim(), x, startY + i * lineHeight));
}
