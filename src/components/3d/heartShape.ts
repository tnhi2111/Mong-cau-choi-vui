import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * A smooth, puffy 3D heart from a parametric surface:
 *   x = sin u · (15 sin v − 4 sin 3v)
 *   y = sin u · (15 cos v − 5 cos 2v − 2 cos 3v − cos 4v)
 *   z = 8 cos u
 * Normalised to about 1.35 units tall, point facing down.
 */
export function getHeartGeometry(detail: 'high' | 'low' = 'high'): THREE.BufferGeometry {
  const key = `heart-${detail}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const k = 1 / 23.5;
  const depth = 0.72;
  const fn = (u: number, v: number, target: THREE.Vector3) => {
    const U = u * Math.PI;
    const V = v * Math.PI * 2;
    const su = Math.sin(U);
    const x = su * (15 * Math.sin(V) - 4 * Math.sin(3 * V));
    const y = su * (15 * Math.cos(V) - 5 * Math.cos(2 * V) - 2 * Math.cos(3 * V) - Math.cos(4 * V));
    const z = 8 * Math.cos(U) * depth;
    target.set(x * k, (y + 3.1) * k, z * k);
  };
  const hi = detail === 'high';
  const geo = new ParametricGeometry(fn, hi ? 72 : 24, hi ? 96 : 32);
  geo.computeVertexNormals();
  cache.set(key, geo);
  return geo;
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
