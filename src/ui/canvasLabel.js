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

// A poster that actually carries its information: a colored banner with the
// title, then wrapped paragraphs and key lines drawn straight onto the
// parchment. Zooming the camera onto the poster is what makes it readable —
// the words are really there.
export function makePosterTexture({
  banner,
  bannerColor = '#6b4a2b',
  bg = '#ece0bd',
  ink = '#241c10',
  border = '#6b4a2b',
  sections = [],
  width = 512,
  height = 672,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, width - 14, height - 14);

  // banner
  if (banner) {
    ctx.fillStyle = bannerColor;
    ctx.fillRect(14, 14, width - 28, height * 0.115);
    ctx.fillStyle = '#ece0bd';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.floor(width * 0.075)}px Georgia, serif`;
    ctx.fillText(banner, width / 2, 14 + height * 0.0575, width * 0.86);
  }

  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  let y = height * 0.115 + 14 + height * 0.07;
  const left = width * 0.09;
  const maxW = width * 0.82;

  for (const section of sections) {
    if (section.type === 'gap') {
      y += height * 0.02;
      continue;
    }
    if (section.type === 'big') {
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.floor(width * 0.12)}px Georgia, serif`;
      y += height * 0.06;
      wrapText(ctx, section.text, width / 2, y, maxW, width * 0.13);
      y += height * 0.08;
      continue;
    }
    if (section.type === 'k') {
      ctx.textAlign = 'left';
      ctx.font = `bold ${Math.floor(width * 0.042)}px 'Courier New', monospace`;
      ctx.fillText(section.key, left, y, maxW * 0.42);
      ctx.font = `${Math.floor(width * 0.042)}px Georgia, serif`;
      ctx.fillText(section.text, left + maxW * 0.4, y, maxW * 0.6);
      y += width * 0.062;
      continue;
    }
    // paragraph
    ctx.textAlign = 'left';
    ctx.font = `${Math.floor(width * 0.044)}px Georgia, serif`;
    y = wrapTextLeft(ctx, section.text, left, y, maxW, width * 0.058);
    y += height * 0.018;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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

function wrapTextLeft(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), x, y);
      y += lineHeight;
      line = word + ' ';
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y);
  return y + lineHeight;
}
