import * as THREE from 'three';
import { sitNormal, type DogPoint, type Part } from './dogModel';
import { normalAt, type RunBinding } from './dogRun';

/*
 * Fur: a golden retriever's coat, as strands of light.
 *
 * The body is a surface sprinkled with points; on its own that reads as smooth plush.
 * Here short strands grow out of it — a few points in a row from a root on the body,
 * leaning the way a dog's hair lies (down the flanks and legs, back along the body),
 * darker at the root and lighter, sun-bleached gold at the tip. Longer on the chest,
 * belly and the backs of the legs (the breed's feathering), short on the paws' tops.
 *
 * Every strand is grown twice from the same root: once on the sitting puppy and once on
 * the running one (where its hair streams back), and it rides the same bone as its root,
 * so the coat stays on the dog in both poses and everything in between.
 */

export interface FurPoints {
  sit: DogPoint[];
  run: RunBinding;
}

const FURRY: Part[] = ['torso', 'fl', 'fr', 'hl', 'hr'];
const tmp = new THREE.Vector3();

/** Lay a hair direction along the surface (normal n) toward `flow`, lifted off it a little. */
function hairDir(n: THREE.Vector3, flow: THREE.Vector3, lift: number): THREE.Vector3 {
  const t = flow.clone().addScaledVector(n, -flow.dot(n));
  if (t.lengthSq() < 1e-4) t.set(Math.random() - 0.5, -1, Math.random() - 0.5).addScaledVector(n, -n.y);
  t.normalize();
  // a little wander, so the coat isn't combed flat
  t.add(tmp.randomDirection().multiplyScalar(0.35)).addScaledVector(n, -t.dot(n)).normalize();
  return t.multiplyScalar(1 - lift).addScaledVector(n, lift).normalize();
}

/** Strands grown from about `share` of the body's points. */
export function growFur(dog: DogPoint[], run: RunBinding, share: number): FurPoints {
  const sit: DogPoint[] = [];
  const runPos: number[] = [];
  const boneA: number[] = [];
  const boneB: number[] = [];
  const boneW: number[] = [];
  const sitDown = new THREE.Vector3(0, -1, -0.15);
  const runBack = new THREE.Vector3(0, -0.55, -1);
  const runDown = new THREE.Vector3(0, -1, -0.3);

  dog.forEach((d, i) => {
    const part = d.part;
    if (!part || !FURRY.includes(part) || d.paw) return;
    if (d.anim !== 0 && d.anim !== 2) return; // not the pads, ears or tongue
    if (Math.random() > share) return;
    const leg = part !== 'torso';
    const ns = sitNormal(d.p.clone(), part);
    const rp = new THREE.Vector3(run.pos[i * 3], run.pos[i * 3 + 1], run.pos[i * 3 + 2]);
    const nr = normalAt(rp, new THREE.Vector3());
    // how long: longest where a retriever is feathered (belly, chest, backs of legs)
    const feather = leg ? Math.max(0, -nr.z - 0.2) * 0.5 : Math.max(0, -nr.y - 0.2) * 0.6 + Math.max(0, nr.z - 0.4) * 0.35;
    const len = (0.026 + Math.random() * 0.026) * (1 + feather * 1.7);
    const ds = hairDir(ns, sitDown, 0.35);
    const dr = hairDir(nr, leg ? runDown : runBack, 0.3);
    // strands droop a little toward their tips
    // close-set points, so each strand reads as one hair and not a row of dots
    const steps = Math.max(3, Math.ceil(len / 0.0085));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const droop = 0.25 * u * u * len;
      sit.push({
        p: d.p.clone().addScaledVector(ds, len * u).add(tmp.set(0, -droop, 0)),
        // darker at the root, sun-bleached gold at the tip
        col: d.col.clone().offsetHSL(0.004 * u, -0.04 * u, -0.03 + 0.1 * u),
        anim: d.anim,
        size: (1 - 0.35 * u) * (0.85 + Math.random() * 0.3),
        part,
      });
      const p = rp.clone().addScaledVector(dr, len * u).add(tmp.set(0, -droop, 0));
      runPos.push(p.x, p.y, p.z);
      boneA.push(run.boneA[i]);
      boneB.push(run.boneB[i]);
      boneW.push(run.boneW[i]);
    }
  });
  return {
    sit,
    run: { pos: new Float32Array(runPos), boneA: new Float32Array(boneA), boneB: new Float32Array(boneB), boneW: new Float32Array(boneW) },
  };
}
