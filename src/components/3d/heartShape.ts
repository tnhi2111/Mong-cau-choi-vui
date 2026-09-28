import * as THREE from 'three';

const cache = new Map<string, THREE.BufferGeometry>();

/*
 * The heart surface is the implicit "Taubin heart":
 *   F(x, y, z) = (x² + 9/4·y² + z² − 1)³ − x²·z³ − 9/80·y²·z³ = 0
 * (z is up, y is depth). Unlike a parametric heart it has no pole on its face,
 * so there is no seam down the middle and it looks right from every side.
 *
 * We shrink-wrap a UV sphere onto it: every sphere vertex is pushed along its
 * direction until it meets the surface, and the normal comes straight from the
 * gradient of F — perfectly smooth, including across the sphere's UV seam.
 */
const DEPTH = 9 / 4;

/*
 * We use the equivalent form G = A − z·∛(x² + 9/80·y²) with A = x² + 9/4·y² + z² − 1
 * (G = 0 ⇔ F = 0, since the cube root is monotonic). F's gradient vanishes on the
 * whole equator (where A = 0 and z = 0) and would leave a visible crease there;
 * G's gradient is only singular on the vertical axis — the cleft and the tip.
 */
function field(x: number, y: number, z: number): number {
  return x * x + DEPTH * y * y + z * z - 1 - z * Math.cbrt(x * x + (9 / 80) * y * y);
}

function gradient(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const q = x * x + (9 / 80) * y * y;
  if (q < 1e-12) return out.set(0, 0, 0);
  const c = Math.cbrt(q);
  const k = z / (3 * c * c);
  return out.set(2 * x - k * 2 * x, 2 * DEPTH * y - k * (9 / 40) * y, 2 * z - c);
}

/** Distance from the centre to the (outermost) surface along a unit direction. */
function radiusAlong(dx: number, dy: number, dz: number): number {
  const steps = 96;
  const max = 1.6;
  let inside = 0;
  for (let i = 1; i <= steps; i++) {
    const r = (i / steps) * max;
    if (field(dx * r, dy * r, dz * r) <= 0) inside = r;
  }
  let lo = inside;
  let hi = inside + max / steps;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (field(dx * mid, dy * mid, dz * mid) <= 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A smooth, plump 3D heart about 1.6 units wide, centred on the origin,
 * point facing down. `low` is for small instanced copies.
 */
export function getHeartGeometry(detail: 'high' | 'low' = 'high'): THREE.BufferGeometry {
  const key = `heart-${detail}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const hi = detail === 'high';
  const geo = new THREE.SphereGeometry(1, hi ? 176 : 36, hi ? 132 : 28);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const g = new THREE.Vector3();
  const d = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    // three: X right, Y up, Z toward viewer  →  Taubin: x = X, z = Y, y = Z
    d.fromBufferAttribute(pos, i).normalize();
    const r = radiusAlong(d.x, d.z, d.y);
    const X = d.x * r;
    const Y = d.y * r;
    const Z = d.z * r;
    pos.setXYZ(i, X, Y, Z);
    gradient(X, Z, Y, g);
    // the cleft and the tip are singular points of F — fall back to the ray direction there
    if (g.lengthSq() < 1e-12) nor.setXYZ(i, d.x, d.y, d.z);
    else {
      g.set(g.x, g.z, g.y).normalize();
      nor.setXYZ(i, g.x, g.y, g.z);
    }
  }

  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const scale = 1.6 / (box.max.x - box.min.x);
  const cy = (box.max.y + box.min.y) / 2;
  if (hi) norm = { scale, cy };
  geo.translate(0, -cy, 0);
  geo.scale(scale, scale, scale);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  cache.set(key, geo);
  return geo;
}

/** How the raw surface is centred and scaled to match getHeartGeometry('high'). */
let norm: { scale: number; cy: number } | null = null;

/**
 * Points filling the same heart as getHeartGeometry: most of them in a thin
 * shell just under the surface (so the silhouette reads crisply from any angle),
 * the rest spread through the volume for depth. Returned in the geometry's space.
 */
export function sampleHeartPoints(count: number, shell = 0.62): Float32Array {
  if (!norm) getHeartGeometry('high');
  const { scale, cy } = norm!;
  const out = new Float32Array(count * 3);
  const d = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    d.randomDirection();
    const R = radiusAlong(d.x, d.z, d.y);
    const k = Math.random() < shell ? 1 - Math.pow(Math.random(), 2) * 0.1 : Math.cbrt(Math.random()) * 0.95;
    const r = R * k;
    out[i * 3] = d.x * r * scale;
    out[i * 3 + 1] = (d.y * r - cy) * scale;
    out[i * 3 + 2] = d.z * r * scale;
  }
  return out;
}

/**
 * The heart's radius in every direction, baked into a small texture so a shader
 * can place a point exactly on the surface for any (θ, φ):
 *   dir = (sinθ·sinφ, cosθ, sinθ·cosφ), u = φ / 2π, v = θ / π, radius = texel · 1.6
 * Returned with the normalisation that maps it onto getHeartGeometry('high'):
 *   position = (dir · radius − (0, cy, 0)) · scale
 */
let radiusTex: { texture: THREE.DataTexture; scale: number; cy: number } | null = null;
export function getHeartRadiusTexture() {
  if (radiusTex) return radiusTex;
  if (!norm) getHeartGeometry('high');
  const W = 128;
  const H = 64;
  const data = new Uint8Array(W * H);
  for (let i = 0; i < H; i++) {
    const th = ((i + 0.5) / H) * Math.PI;
    for (let j = 0; j < W; j++) {
      const ph = ((j + 0.5) / W) * Math.PI * 2;
      const dx = Math.sin(th) * Math.sin(ph);
      const dy = Math.cos(th);
      const dz = Math.sin(th) * Math.cos(ph);
      data[i * W + j] = Math.round((radiusAlong(dx, dz, dy) / 1.6) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  radiusTex = { texture, scale: norm!.scale, cy: norm!.cy };
  return radiusTex;
}

/** Lowest point of the normalised heart (its tip), in geometry space. */
export function heartTipY(): number {
  return getHeartGeometry('high').boundingBox!.min.y;
}

/**
 * The parametric heart curve (x = 16 sin³t, y = 13cos t − 5cos2t − 2cos3t − cos4t),
 * normalised to ~1 unit tall. Used to place particles on/inside a heart.
 */
export function heartCurvePoint(t: number, out = new THREE.Vector2()): THREE.Vector2 {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return out.set(x / 17, (y + 2.5) / 17);
}

/** Random point filling a 3D heart volume (denser near the surface). */
export function randomPointInHeart(out = new THREE.Vector3(), shell = 0.7): THREE.Vector3 {
  const t = Math.random() * Math.PI * 2;
  const p = heartCurvePoint(t);
  // bias towards the outline so the silhouette reads clearly
  const r = shell + (1 - shell) * Math.sqrt(Math.random());
  const k = Math.random() < 0.55 ? 1 - Math.random() * 0.06 : r;
  const x = p.x * k;
  const y = p.y * k;
  const depth = 0.34 * Math.sqrt(Math.max(0, 1 - k * k * 0.9));
  return out.set(x, y, (Math.random() * 2 - 1) * depth);
}
