import * as THREE from 'three';

/* Small textures generated once on a canvas — nothing to download. */

let glow: THREE.Texture | null = null;
let shadow: THREE.Texture | null = null;
let paper: THREE.Texture | null = null;
let floor: THREE.Texture | null = null;

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** A soft radial falloff used for glows and halos. */
export function getGlowTexture(): THREE.Texture {
  if (glow) return glow;
  const size = 128;
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

/** A contact shadow blob: dense in the middle, long soft penumbra. */
export function getShadowTexture(): THREE.Texture {
  if (shadow) return shadow;
  const size = 128;
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.3, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.14)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  shadow = new THREE.CanvasTexture(c);
  return shadow;
}

/** Fine paper / card fibre noise, used as a bump map for wrapping paper and the envelope. */
export function getPaperTexture(): THREE.Texture {
  if (paper) return paper;
  const size = 256;
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // grain + a few longer fibres
    const x = i % size;
    const y = (i / size) | 0;
    const fibre = Math.sin(x * 0.21 + Math.sin(y * 0.05) * 6) * 0.5 + 0.5;
    const v = 128 + (Math.random() - 0.5) * 70 + (fibre - 0.5) * 22;
    img.data.set([v, v, v, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  paper = new THREE.CanvasTexture(c);
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  paper.repeat.set(2, 2);
  return paper;
}

/** The floor: a warm pool of light fading to nothing at the edges (used as an alpha map). */
export function getFloorTexture(): THREE.Texture {
  if (floor) return floor;
  const size = 256;
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, '#9a9a9a');
  grad.addColorStop(0.8, '#2a2a2a');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  floor = new THREE.CanvasTexture(c);
  return floor;
}
