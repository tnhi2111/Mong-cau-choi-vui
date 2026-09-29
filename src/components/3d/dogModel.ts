import * as THREE from 'three';

/*
 * The golden retriever puppy of light — its shape, as points.
 *
 * The body is a signed distance field: rounded shapes (ellipsoids and tapered
 * "round cones") melted together with a smooth union, so head, cheeks, muzzle,
 * neck and legs flow into each other like a real, plush little dog instead of a
 * stack of balls. Points are sprinkled over that surface (each shape paints only
 * the part of the surface that is its own, so the density stays even).
 *
 * On top of the surface we draw what makes it *that* puppy:
 *   • long floppy ears — flattened, tapering leaves with fur strands running down
 *   • a fluffy bib — curved strands of cream fur falling in a V down the chest
 *   • big eyes — brown iris, darker pupil, two catch-lights
 *   • a big glossy nose — rounded triangle, nostrils, a highlight
 *   • an open, smiling mouth — line from the nose, curling lips, pink tongue
 *   • toes with gaps between them, dark paw pads on the waving paw
 *
 * A glowing figure shows darkness only as *less light*, so dark details are drawn
 * with dense, deep-brown points over a carved-out patch of fur (and an invisible
 * body behind them hides the light on the far side — see LightDog).
 *
 * Units: ~1.45 tall, sitting, facing +z, feet at y ≈ -0.42.
 */

export type V3 = [number, number, number];

type Col = 'gold' | 'deep' | 'cream' | 'pale';
/** 0 = body, 1 = tail (wags), 2 = waving arm */
type Group = 0 | 1 | 2;

export interface Ellipsoid {
  kind: 'e';
  c: V3;
  r: V3;
  /** turned about Y, then tilted about Z (radians) — for the ears */
  ry?: number;
  rz?: number;
}
export interface Cone {
  kind: 'c';
  a: V3;
  b: V3;
  r1: number;
  r2: number;
  /** squash in depth (for the thin ears: broad from the front, thin from the side) */
  flatZ?: number;
}
/** A long, flat, floppy ear: one continuous leaf (see earSd). */
interface Ear {
  kind: 'ear';
  side: 1 | -1;
}
/**
 * Which part of the body a point belongs to, so the running puppy (dogRun.ts) can
 * move it: the head, bib and tail move rigidly; the rest is re-laid on a standing body.
 * `paw` marks the paws within a leg.
 */
export type Part = 'head' | 'bib' | 'torso' | 'fl' | 'fr' | 'hl' | 'hr' | 'tail';
type Shape = (Ellipsoid | Cone | Ear) & {
  part: Part;
  paw?: boolean;
  col: Col;
  group: Group;
  /** smooth-union radius when melting into the rest */
  k?: number;
  /** relative point density */
  w?: number;
  /** fine detail: smaller, denser points, mostly on the front */
  fine?: boolean;
  fur?: 'ear';
};

export const SHOULDER: V3 = [0.21, 0.17, 0.14];
export const TAIL_BASE: V3 = [0.16, -0.3, -0.24];
/** The tail's spine, base to tip, and its thickness along it (fluffiest in the middle). */
// out behind the rump, then sweeping up in a long sickle curve to about shoulder height
const TAIL_CURVE: V3[] = [TAIL_BASE, [0.24, -0.31, -0.42], [0.3, -0.14, -0.56], [0.33, 0.1, -0.6], [0.3, 0.3, -0.54], [0.23, 0.42, -0.45]];
const TAIL_R = [0.045, 0.055, 0.056, 0.05, 0.038, 0.012];
const TAIL_SAMPLES = (() => {
  const pts: { p: THREE.Vector3; t: number }[] = [];
  const n = TAIL_CURVE.length - 1;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 10; k++) {
      const u = k / 10;
      pts.push({ p: new THREE.Vector3(...TAIL_CURVE[i]).lerp(new THREE.Vector3(...TAIL_CURVE[i + 1]), u), t: (i + u) / n });
    }
  pts.push({ p: new THREE.Vector3(...TAIL_CURVE[n]), t: 1 });
  return pts;
})();
/** 0 at the base of the tail, 1 at its tip — so the shader can make the tip lag like a whip. */
function alongTail(p: THREE.Vector3): number {
  let best = 0;
  let bd = Infinity;
  for (const s of TAIL_SAMPLES) {
    const d = s.p.distanceToSquared(p);
    if (d < bd) {
      bd = d;
      best = s.t;
    }
  }
  return best;
}

/** back left, back right, standing front (left) paw */
const FOOT_PART: Part[] = ['hl', 'hr', 'fl'];
const FEET: { c: V3; r: V3 }[] = [
  { c: [-0.25, -0.375, 0.18], r: [0.105, 0.058, 0.125] }, // back feet
  { c: [0.25, -0.375, 0.18], r: [0.105, 0.058, 0.125] },
  { c: [-0.135, -0.37, 0.29], r: [0.095, 0.06, 0.105] }, // standing front paw
];

/*
 * The ear: one continuous flap of fur, like a golden retriever's — not a chain of blobs.
 * It is a thin sheet hung from a curved spine: it grows out of the side of the head
 * just above the eye, folds over and hangs down beside the cheek to below the jaw.
 * Narrow at the root, widest two-thirds of the way down, a soft round bottom; the
 * sheet turns from facing outward (at the root, wrapping round the skull) to facing
 * half forward (lower down), and its edges curl in toward the head, so it has a body.
 * Distances are measured in the sheet's own frame: v runs down the ear (0 → 1),
 * u across it, h through its thickness.
 */
const EAR_TOP = 0.85;
const EAR_BOTTOM = 0.2;
const EAR_LEN = 0.68;
const earX = (v: number) => 0.21 + 0.21 * Math.sin(Math.min(v / 0.5, 1) * Math.PI * 0.5) - 0.035 * Math.max(0, (v - 0.5) / 0.5) ** 2;
const earZ = (v: number) => -0.035 + 0.15 * v - 0.03 * v * v;
/** How far the sheet is turned to face forward (0 = straight out to the side). */
const earTurn = (v: number) => 1.1 - 0.5 * v;
/** Half-width across the ear: a leaf, round at the bottom. */
const earW = (v: number) => {
  const w = 0.118;
  if (v < 0.62) return w * (0.42 + 0.58 * Math.sin((v / 0.62) * Math.PI * 0.5));
  const t = (v - 0.62) / 0.38;
  return w * Math.sqrt(Math.max(0, 1 - t * t));
};
/** Half-thickness: a little fuller at the root. */
const earT = (v: number) => 0.024 - 0.01 * v;
/** How much the edges curl in toward the head. */
const EAR_CUP = 0.028;

interface EarFrame {
  c: THREE.Vector3;
  /** across the ear, and out of its face */
  a: THREE.Vector3;
  n: THREE.Vector3;
}
function earFrame(v: number, side: number, out: EarFrame): EarFrame {
  const th = earTurn(v);
  out.c.set(side * earX(v), EAR_TOP - v * (EAR_TOP - EAR_BOTTOM), earZ(v));
  out.a.set(side * Math.cos(th), 0, -Math.sin(th));
  out.n.set(side * Math.sin(th), 0, Math.cos(th));
  return out;
}
const earTmp: EarFrame = { c: new THREE.Vector3(), a: new THREE.Vector3(), n: new THREE.Vector3() };
const dTmp = new THREE.Vector3();

/** (u, v, h) of a point in the ear's frame — across, down, out of its face. */
function earLocal(x: number, y: number, z: number, side: number): [number, number, number] {
  const v = (EAR_TOP - y) / (EAR_TOP - EAR_BOTTOM);
  const f = earFrame(THREE.MathUtils.clamp(v, 0, 1), side, earTmp);
  dTmp.set(x, y, z).sub(f.c);
  const u = dTmp.dot(f.a);
  const w = Math.max(earW(THREE.MathUtils.clamp(v, 0, 1)), 1e-3);
  // the edges curl in toward the head
  const h = dTmp.dot(f.n) + EAR_CUP * Math.min(1, (u / w) ** 2);
  return [u, v, h];
}

function sdEar(x: number, y: number, z: number, e: Ear): number {
  const [u, v, h] = earLocal(x, y, z, e.side);
  const vc = THREE.MathUtils.clamp(v, 0, 1);
  const du = Math.abs(u) - earW(vc);
  const dh = Math.abs(h) - earT(vc);
  const dv = (Math.abs(v - 0.5) - 0.5) * EAR_LEN;
  const qx = Math.max(du, 0);
  const qy = Math.max(dh, 0);
  const qz = Math.max(dv, 0);
  return Math.hypot(qx, qy, qz) + Math.min(Math.max(du, dh, dv), 0);
}

/** Toe centres on the waving paw (front view). */
const PAW_TOES: [number, number][] = [
  [0.318, 0.598],
  [0.372, 0.635],
  [0.428, 0.635],
  [0.482, 0.598],
];

const SHAPES: Shape[] = [
  // head: round, a little wider at the cheeks
  { kind: 'e', c: [0, 0.6, 0.0], r: [0.33, 0.3, 0.29], part: 'head', col: 'gold', group: 0, w: 2.2 },
  { kind: 'e', c: [-0.14, 0.5, 0.17], r: [0.13, 0.11, 0.12], part: 'head', col: 'cream', group: 0, k: 0.07, w: 1.6, fine: true }, // cheeks
  { kind: 'e', c: [0.14, 0.5, 0.17], r: [0.13, 0.11, 0.12], part: 'head', col: 'cream', group: 0, k: 0.07, w: 1.6, fine: true },
  { kind: 'e', c: [0, 0.47, 0.25], r: [0.13, 0.095, 0.12], part: 'head', col: 'cream', group: 0, k: 0.06, w: 3, fine: true }, // muzzle
  { kind: 'e', c: [0, 0.74, 0.2], r: [0.08, 0.1, 0.08], part: 'head', col: 'pale', group: 0, k: 0.08, w: 0.8 }, // blaze between the eyes
  // long floppy ears, like the photo: one flat, soft flap each, folding over from high on
  // the side of the head and hanging down beside the cheek, past the jaw
  { kind: 'ear', side: -1, part: 'head', col: 'deep', group: 0, k: 0.06, w: 3.2, fur: 'ear' },
  { kind: 'ear', side: 1, part: 'head', col: 'deep', group: 0, k: 0.06, w: 3.2, fur: 'ear' },
  // neck and body
  { kind: 'c', a: [0, 0.4, -0.02], b: [0, 0.05, -0.04], r1: 0.2, r2: 0.29, part: 'torso', col: 'gold', group: 0, k: 0.08 },
  { kind: 'e', c: [0, 0.02, -0.04], r: [0.29, 0.33, 0.27], part: 'torso', col: 'gold', group: 0, k: 0.08 },
  { kind: 'e', c: [0, 0.2, 0.13], r: [0.2, 0.24, 0.12], part: 'torso', col: 'cream', group: 0, k: 0.08, w: 1.3 }, // chest
  { kind: 'e', c: [-0.2, -0.2, -0.04], r: [0.17, 0.17, 0.21], part: 'hl', col: 'gold', group: 0, k: 0.07, w: 1.7 }, // haunches
  { kind: 'e', c: [0.2, -0.2, -0.04], r: [0.17, 0.17, 0.21], part: 'hr', col: 'gold', group: 0, k: 0.07, w: 1.7 },
  // standing front leg
  { kind: 'c', a: [-0.13, 0.08, 0.14], b: [-0.135, -0.32, 0.25], r1: 0.085, r2: 0.075, part: 'fl', col: 'gold', group: 0, k: 0.05, w: 2.2 },
  // feet, and four round toes on the front of each
  ...FEET.map((f, i): Shape => ({ kind: 'e', c: f.c, r: f.r, part: FOOT_PART[i], paw: true, col: 'cream', group: 0, k: 0.04, w: 2, fine: true })),
  ...FEET.flatMap(({ c, r }, i) =>
    [-0.66, -0.22, 0.22, 0.66].map(
      (k): Shape => ({
        kind: 'e',
        c: [c[0] + k * r[0], c[1] - r[1] * 0.1, c[2] + r[2] * 0.9],
        r: [r[0] * 0.26, r[1] * 0.85, 0.055],
        part: FOOT_PART[i],
        paw: true,
        col: 'cream',
        group: 0,
        k: 0.012,
        w: 2.6,
        fine: true,
      }),
    ),
  ),
  // the waving arm and its paw
  { kind: 'c', a: SHOULDER, b: [0.38, 0.45, 0.21], r1: 0.085, r2: 0.078, part: 'fr', col: 'gold', group: 2, k: 0.05, w: 2.2 },
  { kind: 'e', c: [0.4, 0.52, 0.23], r: [0.12, 0.1, 0.065], part: 'fr', paw: true, col: 'cream', group: 2, k: 0.05, w: 3, fine: true }, // palm
  // four round toes fanned over the top of the paw, with a gap between each
  ...PAW_TOES.map((t): Shape => ({ kind: 'e', c: [t[0], t[1], 0.25], r: [0.036, 0.042, 0.05], part: 'fr', paw: true, col: 'cream', group: 2, k: 0.012, w: 2.2, fine: true })),
  // fluffy tail curling up behind
  // a plumed tail: out from the rump, curving up in an S, the tip drooping a little
  ...TAIL_CURVE.slice(1).map(
    (b, i): Shape => ({ kind: 'c', a: TAIL_CURVE[i], b, r1: TAIL_R[i], r2: TAIL_R[i + 1], part: 'tail', col: 'gold', group: 1, k: 0.06, w: 2.6 }),
  ),
];

const COLORS: Record<Col, THREE.Color> = {
  gold: new THREE.Color('#ffb24f'),
  deep: new THREE.Color('#ec7a2c'),
  cream: new THREE.Color('#fff0d4'),
  pale: new THREE.Color('#ffd49a'),
};

// ── distance functions ────────────────────────────────────────────────────
/** Into an ellipsoid's own (unrotated) frame: undo the Z tilt and the Y turn. */
function toLocal(x: number, y: number, z: number, e: Ellipsoid): [number, number, number] {
  let qx = x - e.c[0];
  let qy = y - e.c[1];
  let qz = z - e.c[2];
  if (e.ry) {
    const c = Math.cos(-e.ry);
    const s = Math.sin(-e.ry);
    [qx, qz] = [qx * c + qz * s, -qx * s + qz * c];
  }
  if (e.rz) {
    const c = Math.cos(-e.rz);
    const s = Math.sin(-e.rz);
    [qx, qy] = [qx * c - qy * s, qx * s + qy * c];
  }
  return [qx, qy, qz];
}

export function sdEllipsoid(x: number, y: number, z: number, e: Ellipsoid): number {
  const [lx, ly, lz] = toLocal(x, y, z, e);
  const px = lx / e.r[0];
  const py = ly / e.r[1];
  const pz = lz / e.r[2];
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / e.r[0], py / e.r[1], pz / e.r[2]);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
}

/** Round cone (iq): a capsule whose radius tapers from r1 at a to r2 at b. */
export function sdRoundCone(x: number, y: number, z: number, s: Cone): number {
  const px = x;
  let pz = z;
  if (s.flatZ) pz = (s.a[2] + s.b[2]) / 2 + (z - (s.a[2] + s.b[2]) / 2) * s.flatZ;
  const bax = s.b[0] - s.a[0];
  const bay = s.b[1] - s.a[1];
  const baz = s.b[2] - s.a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = s.r1 - s.r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - s.a[0];
  const pay = y - s.a[1];
  const paz = pz - s.a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const xvx = pax * l2 - bax * yy;
  const xvy = pay * l2 - bay * yy;
  const xvz = paz * l2 - baz * yy;
  const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  let d: number;
  if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - s.r2;
  else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - s.r1;
  else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - s.r1;
  return s.flatZ ? d / s.flatZ : d;
}

const sdShape = (x: number, y: number, z: number, s: Shape) =>
  s.kind === 'e' ? sdEllipsoid(x, y, z, s) : s.kind === 'ear' ? sdEar(x, y, z, s) : sdRoundCone(x, y, z, s);

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const byGroup: Record<Group, Shape[]> = { 0: [], 1: [], 2: [] };
SHAPES.forEach((s) => byGroup[s.group].push(s));

function sdGroup(x: number, y: number, z: number, g: Group): number {
  const list = byGroup[g];
  let d = sdShape(x, y, z, list[0]);
  for (let i = 1; i < list.length; i++) d = smin(d, sdShape(x, y, z, list[i]), list[i].k ?? 0.05);
  return d;
}

const EPS = 0.002;
function normal(p: THREE.Vector3, g: Group, out: THREE.Vector3): THREE.Vector3 {
  return out
    .set(
      sdGroup(p.x + EPS, p.y, p.z, g) - sdGroup(p.x - EPS, p.y, p.z, g),
      sdGroup(p.x, p.y + EPS, p.z, g) - sdGroup(p.x, p.y - EPS, p.z, g),
      sdGroup(p.x, p.y, p.z + EPS, g) - sdGroup(p.x, p.y, p.z - EPS, g),
    )
    .normalize();
}

const nTmp = new THREE.Vector3();
/** Slide a point onto the group's surface. Returns the remaining distance. */
function project(p: THREE.Vector3, g: Group, iters = 7): number {
  let d = 0;
  for (let i = 0; i < iters; i++) {
    d = sdGroup(p.x, p.y, p.z, g);
    if (Math.abs(d) < 1e-4) break;
    normal(p, g, nTmp);
    p.addScaledVector(nTmp, -d);
  }
  return Math.abs(sdGroup(p.x, p.y, p.z, g));
}

/** The surface point straight in front of (x, y), found by sliding in from the front. */
function onFront(x: number, y: number, g: Group = 0): THREE.Vector3 {
  const p = new THREE.Vector3(x, y, 0.6);
  // march in along -z, then settle onto the surface
  for (let i = 0; i < 40; i++) {
    const d = sdGroup(p.x, p.y, p.z, g);
    if (d < 0.002) break;
    p.z -= Math.max(d, 0.002);
  }
  project(p, g, 4);
  return p;
}

// ── features, in front-view (x, y) coordinates ───────────────────────────────
const EYE_R = 0.066;
const EYES: [number, number][] = [
  [-0.122, 0.645],
  [0.122, 0.645],
];
const NOSE_C: [number, number] = [0, 0.535];
const inNose = (x: number, y: number) => {
  const u = x - NOSE_C[0];
  const v = y - NOSE_C[1];
  // a rounded triangle: wide at the top, narrowing to the bottom
  return (u / 0.078) ** 2 + (v / 0.05) ** 2 < 1 && Math.abs(u) < 0.078 - Math.max(0, -v) * 1.1;
};
const inNostril = (x: number, y: number) => [-1, 1].some((s) => ((x - s * 0.029) / 0.017) ** 2 + ((y - (NOSE_C[1] - 0.013)) / 0.01) ** 2 < 1);

/** Upper lip: from under the nose, curving down and back up to smiling corners. */
const lip = (side: number, t: number): [number, number] => [side * t * 0.13, 0.458 - Math.sin(t * Math.PI * 0.85) * 0.028 + t * t * 0.03];
const lipAt = (x: number) => {
  const t = Math.min(1, Math.abs(x) / 0.13);
  return lip(1, t)[1];
};
/** The open mouth: below the lip line, above a round lower edge. */
const inMouth = (x: number, y: number) => Math.abs(x) < 0.105 && y < lipAt(x) - 0.004 && y > 0.4 + 0.045 * (x / 0.105) ** 2;
const TONGUE_C: [number, number] = [0, 0.405];
const inTongue = (x: number, y: number) => ((x - TONGUE_C[0]) / 0.05) ** 2 + ((y - TONGUE_C[1]) / 0.045) ** 2 < 1 && y < lipAt(x) - 0.012;

/** Pads on the waving paw (front view), dark brown like the photo. */
const PALM_C: [number, number] = [0.4, 0.506];
/** The big pad: rounded, narrow at the top and three soft lobes along the bottom. */
const inPalm = (x: number, y: number) => {
  const u = x - PALM_C[0];
  const v = y - PALM_C[1];
  if ((u / 0.068) ** 2 + (v / 0.05) ** 2 > 1) return false;
  if (Math.abs(u) > 0.068 - Math.max(0, v) * 0.75) return false;
  // notches between the lobes at the bottom
  return !(v < -0.032 && [-0.023, 0.023].some((n) => Math.abs(u - n) < 0.007));
};
const inToePad = (x: number, y: number) => PAW_TOES.some(([tx, ty]) => ((x - tx) / 0.025) ** 2 + ((y - ty + 0.005) / 0.029) ** 2 < 1);
const inPad = (x: number, y: number) => inPalm(x, y) || inToePad(x, y);
/** Gaps between the toes of the waving paw. */
const PAW_GAPS = PAW_TOES.slice(1).map(([x, y], i): [number, number][] => {
  const [px, py] = PAW_TOES[i];
  const mx = (x + px) / 2;
  const my = (y + py) / 2;
  return [
    [mx, my + 0.05],
    [mx, my - 0.024],
  ];
});
const inPawGap = (x: number, y: number) => PAW_GAPS.some(([[gx, y1], [, y0]]) => Math.abs(x - gx) < 0.008 && y < y1 && y > y0);

/** Gaps between toes, as short vertical lines on the front of each foot. */
const TOE_GAPS = FEET.flatMap(({ c, r }) => [-0.44, 0, 0.44].map((k) => ({ x: c[0] + k * r[0], y0: c[1] - r[1] * 0.75, y1: c[1] + r[1] * 0.1, zMin: c[2] + r[2] * 0.6 })));

/** Is a (front-facing) fur point sitting where a dark detail will be drawn? */
function carved(p: THREE.Vector3, g: Group): boolean {
  if (g === 2) return p.z > 0.2 && (inPad(p.x, p.y) || inPawGap(p.x, p.y));
  if (g !== 0) return false;
  if (p.z > 0.15 && EYES.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < EYE_R * 1.08)) return true;
  if (p.z > 0.25 && (inNose(p.x, p.y) || inMouth(p.x, p.y))) return true;
  if (p.z > 0.28 && Math.abs(p.x) < 0.14 && Math.abs(p.y - lipAt(p.x)) < 0.007) return true; // lip line
  if (p.z > 0.28 && Math.abs(p.x) < 0.007 && p.y < NOSE_C[1] - 0.04 && p.y > 0.455) return true; // line under the nose
  return TOE_GAPS.some((t) => p.z > t.zMin && Math.abs(p.x - t.x) < 0.011 && p.y > t.y0 && p.y < t.y1);
}

/** Point roles for the shader: 0 body, 1…1.49 tail (base → tip), 2 waving arm. */
export const ANIM_TONGUE = 0.2;
export const ANIM_PAD = 2.2;
export const ANIM_EAR = 0.3;
/** Where the ears hang from (their flap turns about a line across here). */
export const EAR_ROOT_Y = 0.85;

const mark = (out: DogPoint[], from: number, part: Part, paw = false, to = out.length) => {
  for (let i = from; i < to; i++) {
    out[i].part = part;
    out[i].paw = paw;
  }
};

export interface DogPoint {
  p: THREE.Vector3;
  col: THREE.Color;
  anim: number;
  size: number;
  part?: Part;
  paw?: boolean;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function randomOnShape(s: Shape, out: THREE.Vector3): THREE.Vector3 {
  if (s.kind === 'ear') {
    // anywhere on either face of the flap (or its rim), then settled onto the surface
    const v = Math.random();
    const f = earFrame(v, s.side, earTmp);
    const w = earW(v);
    const u = (Math.random() * 2 - 1) * w;
    const h = (Math.random() < 0.5 ? -1 : 1) * earT(v) - EAR_CUP * Math.min(1, (u / Math.max(w, 1e-3)) ** 2);
    return out.copy(f.c).addScaledVector(f.a, u).addScaledVector(f.n, h);
  }
  if (s.kind === 'e') {
    out.randomDirection();
    out.set(out.x * s.r[0], out.y * s.r[1], out.z * s.r[2]);
    if (s.rz) out.applyAxisAngle(Z_AXIS, s.rz);
    if (s.ry) out.applyAxisAngle(Y_AXIS, s.ry);
    return out.add(new THREE.Vector3(...s.c));
  }
  const t = Math.random();
  const a = new THREE.Vector3(...s.a);
  const b = new THREE.Vector3(...s.b);
  const axis = b.clone().sub(a).normalize();
  const side = new THREE.Vector3().randomDirection().projectOnPlane(axis).normalize();
  const r = s.r1 + (s.r2 - s.r1) * t;
  out.copy(a).lerp(b, t).addScaledVector(side, r);
  if (s.flatZ) out.z = (s.a[2] + s.b[2]) / 2 + (out.z - (s.a[2] + s.b[2]) / 2) / s.flatZ;
  return out;
}

function shapeArea(s: Shape): number {
  if (s.kind === 'ear') return 2 * 2 * 0.118 * 0.72 * EAR_LEN; // both faces of the leaf
  if (s.kind === 'e') {
    const [a, b, c] = s.r;
    return 4 * Math.PI * Math.pow(((a * b) ** 1.6 + (a * c) ** 1.6 + (b * c) ** 1.6) / 3, 1 / 1.6);
  }
  const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
  return (Math.PI * (s.r1 + s.r2) * len + 2 * Math.PI * (s.r1 * s.r1 + s.r2 * s.r2)) / (s.flatZ ? s.flatZ * 0.6 : 1);
}

const tint = (c: THREE.Color, l: number) => c.clone().offsetHSL((Math.random() - 0.5) * 0.02, 0, l);

/** Points along a curve, lying on the surface (a fur strand or an ink line). */
function strokeOnSurface(out: DogPoint[], pts: [number, number][], col: THREE.Color, size: number, lift: number, g: Group = 0, spacing = 0.006) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / spacing));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const p = onFront(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, g);
      normal(p, g, nTmp);
      p.addScaledVector(nTmp, lift);
      out.push({ p, col: col.clone(), anim: g, size });
    }
  }
}

/** Fill a front-view region with points lying on the surface (nose, eyes, pads…). */
function fillOnSurface(out: DogPoint[], n: number, box: [number, number, number, number], test: (x: number, y: number) => boolean, color: (x: number, y: number) => THREE.Color, size: () => number, g: Group = 0) {
  let made = 0;
  let tries = 0;
  while (made < n && tries < n * 30) {
    tries++;
    const x = box[0] + Math.random() * (box[2] - box[0]);
    const y = box[1] + Math.random() * (box[3] - box[1]);
    if (!test(x, y)) continue;
    const p = onFront(x, y, g);
    normal(p, g, nTmp);
    p.addScaledVector(nTmp, 0.004);
    out.push({ p, col: color(x, y), anim: g, size: size() });
    made++;
  }
}

const quad = (p0: [number, number], p1: [number, number], p2: [number, number], n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  });

export function buildDog(total: number): DogPoint[] {
  const out: DogPoint[] = [];
  const areas = SHAPES.map((s) => shapeArea(s) * (s.w ?? 1));
  const sum = areas.reduce((a, b) => a + b, 0);
  const p = new THREE.Vector3();

  // ── fur over the surface ────────────────────────────────────────────────
  SHAPES.forEach((s, i) => {
    const want = Math.round((areas[i] / sum) * total);
    let made = 0;
    let tries = 0;
    while (made < want && tries < want * 10) {
      tries++;
      randomOnShape(s, p);
      if (project(p, s.group) > 0.004) continue;
      // each shape paints only the part of the surface that is its own
      const own = sdShape(p.x, p.y, p.z, s);
      if (byGroup[s.group].some((o) => o !== s && sdShape(p.x, p.y, p.z, o) < own - 1e-4)) continue;
      // fine areas face her: most of their light goes on the front
      const cz = s.kind === 'e' ? s.c[2] : s.kind === 'c' ? (s.a[2] + s.b[2]) / 2 : 0;
      if (s.fine && p.z < cz && Math.random() < 0.7) continue;
      if (carved(p, s.group)) continue;
      let light = (Math.random() - 0.5) * 0.08 + (p.y > 0.8 ? 0.04 : 0);
      // long soft strands running down the ears
      if (s.kind === 'ear') {
        const [u, v, h] = earLocal(p.x, p.y, p.z, s.side);
        const edge = Math.abs(u) / Math.max(earW(THREE.MathUtils.clamp(v, 0, 1)), 1e-3);
        // strands flowing down the flap, a lighter rim of fur at its edges, the inside darker
        light += Math.sin(u * 120 + Math.sin(v * 9) * 2.2) > 0.35 ? -0.1 : 0.04;
        light += edge > 0.82 || v > 0.9 ? 0.08 : 0;
        if (h < 0) light -= 0.06;
      }
      const pt = p.clone();
      let anim: number = s.group;
      if (s.group === 1) {
        const a = alongTail(pt);
        anim = 1 + a * 0.49;
        // feathery: a long fringe of fur streams out behind and below the tail, like the photo
        normal(pt, 1, nTmp);
        const fringe = Math.max(0, -nTmp.z * 0.8 - nTmp.y * 0.5);
        pt.addScaledVector(nTmp, Math.pow(Math.random(), 1.6) * (0.012 + fringe * 0.07) * (0.5 + a));
        light += a * 0.06 + (Math.sin(a * 60 + pt.x * 40) > 0.4 ? -0.08 : 0.03);
      }
      out.push({
        p: pt,
        col: tint(COLORS[s.col], light),
        anim: s.fur === 'ear' ? ANIM_EAR : anim,
        part: s.part,
        paw: s.paw,
        size: s.fine ? 0.8 + Math.random() * 0.7 : 1.1 + Math.pow(Math.random(), 3) * 1.6,
      });
      made++;
    }
  });

  // ── the fluffy bib: curved strands falling in a V down the chest ─────────
  const bibFrom = out.length;
  const bib = new THREE.Color('#fff7ea');
  for (let row = 0; row < 3; row++) {
    const n = 9 - row;
    const top = 0.4 - row * 0.07;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1; // -1..1 across the chest
      const x0 = u * (0.17 - row * 0.025);
      const len = 0.16 + (1 - Math.abs(u)) * 0.1 - row * 0.02;
      const x2 = x0 * 0.45 + (Math.random() - 0.5) * 0.02;
      const y2 = top - len;
      // each strand bows outward and curls in at the tip, like the photo's fur
      const strand = quad([x0, top], [x0 * 1.18 + Math.sign(u || 1) * 0.015, top - len * 0.55], [x2, y2], 12);
      strokeOnSurface(out, strand, tint(bib, (Math.random() - 0.5) * 0.06), 1.05, 0.012 + row * 0.006);
    }
  }
  // a few shorter tufts at the sides of the neck
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const y = 0.4 - i * 0.05;
      strokeOnSurface(out, quad([s * 0.2, y], [s * 0.235, y - 0.05], [s * 0.2, y - 0.1], 8), tint(bib, -0.04), 1, 0.01);
    }

  mark(out, bibFrom, 'bib');

  // ── ears: a glowing rim round each flap and soft strands down its face ──
  // (a figure of light shows a shape best by its outline — this is what makes the
  // flap read as one long, flat, hanging ear from the front)
  const earsFrom = out.length;
  const earRim = new THREE.Color('#ffc46e');
  const earStrand = new THREE.Color('#ffa347');
  const onEar = (side: number, v: number, uf: number, lift: number) => {
    const f = earFrame(v, side, earTmp);
    const w = earW(v);
    const u = uf * w;
    const h = earT(v) + lift - EAR_CUP * Math.min(1, uf * uf);
    return f.c.clone().addScaledVector(f.a, u).addScaledVector(f.n, h);
  };
  for (const side of [-1, 1]) {
    // the rim: down one edge, round the bottom, up the other
    const N = 150;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // t 0→1 walks the outline: v goes 0→1 along the front edge, then back up the rear edge
      const v = t < 0.5 ? t * 2 : (1 - t) * 2;
      const uf = t < 0.5 ? -1 : 1;
      out.push({ p: onEar(side, Math.min(v, 0.995), uf * 0.96, 0.004), col: tint(earRim, (Math.random() - 0.5) * 0.06), anim: 0, size: 1.15 + Math.random() * 0.4 });
    }
    // strands flowing down the flap, fanning out a little toward its round bottom
    for (const k of [-0.62, -0.3, 0, 0.3, 0.62])
      for (let i = 0; i <= 60; i++) {
        const v = 0.08 + (i / 60) * 0.86;
        const uf = k * (0.9 + 0.1 * Math.sin(v * 7 + k * 5));
        if (Math.abs(uf) * earW(v) > earW(v) * 0.9) continue;
        out.push({ p: onEar(side, v, uf, 0.006), col: tint(earStrand, (Math.random() - 0.5) * 0.08), anim: 0, size: 0.9 + Math.random() * 0.4 });
      }
  }

  for (let i = earsFrom; i < out.length; i++) out[i].anim = ANIM_EAR;

  // ── eyes: brown iris, darker pupil, two catch-lights ─────────────────────
  for (const [ex, ey] of EYES) {
    fillOnSurface(
      out,
      260,
      [ex - EYE_R, ey - EYE_R, ex + EYE_R, ey + EYE_R],
      (x, y) => Math.hypot(x - ex, y - ey) < EYE_R,
      (x, y) => {
        const r = Math.hypot(x - ex, y - ey) / EYE_R;
        // a warm rim at the edge, deep brown iris, near-black pupil
        return (r > 0.86 ? new THREE.Color('#9a5230') : r > 0.5 ? new THREE.Color('#d0783c') : new THREE.Color('#6a2c14')).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
      },
      () => 1 + Math.random() * 0.8,
    );
    const big = onFront(ex + 0.02, ey + 0.024);
    const small = onFront(ex - 0.022, ey - 0.022);
    normal(big, 0, nTmp);
    out.push({ p: big.addScaledVector(nTmp, 0.01), col: new THREE.Color('#ffffff'), anim: 0, size: 6.5 });
    out.push({ p: small.addScaledVector(nTmp, 0.01), col: new THREE.Color('#ffffff'), anim: 0, size: 3 });
  }

  // ── nose: big, glossy, with nostrils and a highlight ─────────────────────
  fillOnSurface(
    out,
    520,
    [NOSE_C[0] - 0.08, NOSE_C[1] - 0.052, NOSE_C[0] + 0.08, NOSE_C[1] + 0.052],
    (x, y) => inNose(x, y) && !inNostril(x, y),
    (_, y) => new THREE.Color('#7a3420').lerp(new THREE.Color('#c86c48'), THREE.MathUtils.clamp((y - NOSE_C[1] + 0.03) / 0.08, 0, 1)),
    () => 0.9 + Math.random() * 0.7,
  );
  const shine = onFront(NOSE_C[0] + 0.012, NOSE_C[1] + 0.028);
  normal(shine, 0, nTmp);
  out.push({ p: shine.addScaledVector(nTmp, 0.012), col: new THREE.Color('#fff6f0'), anim: 0, size: 5 });

  // ── mouth: line under the nose, smiling lips, dark inside, pink tongue ───
  const ink = new THREE.Color('#c0663c');
  strokeOnSurface(out, [[0, NOSE_C[1] - 0.045], [0, 0.458]], ink, 1.3, 0.004);
  for (const side of [-1, 1])
    strokeOnSurface(out, Array.from({ length: 12 }, (_, i) => lip(side, i / 11)), ink, 1.3, 0.004);
  fillOnSurface(out, 220, [-0.105, 0.39, 0.105, 0.47], (x, y) => inMouth(x, y) && !inTongue(x, y), () => new THREE.Color('#8e2436'), () => 0.9 + Math.random() * 0.6);
  const tongueFrom = out.length;
  fillOnSurface(
    out,
    260,
    [-0.05, 0.36, 0.05, 0.46],
    inTongue,
    (x) => new THREE.Color('#ff6f96').offsetHSL(0, 0, Math.abs(x) < 0.006 ? -0.18 : (Math.random() - 0.5) * 0.06),
    () => 0.9 + Math.random() * 0.7,
  );

  // the tongue can stick out (see LightDog): mark it
  for (let i = tongueFrom; i < out.length; i++) out[i].anim = ANIM_TONGUE;

  mark(out, earsFrom, 'head');

  // ── toes: dark gaps between them ─────────────────────────────────────────
  TOE_GAPS.forEach((t, i) => {
    const from = out.length;
    strokeOnSurface(out, [[t.x, t.y1], [t.x, t.y0]], ink, 1.2, 0.004);
    mark(out, from, FOOT_PART[Math.floor(i / 3)], true);
  });

  // ── paw pads on the waving paw ───────────────────────────────────────────
  // dark brown, dense, a little raised and glossy toward the top — like the photo
  const padsFrom = out.length;
  fillOnSurface(
    out,
    1100,
    [0.3, 0.44, 0.51, 0.68],
    inPad,
    (_, y) =>
      new THREE.Color('#a8482a')
        .lerp(new THREE.Color('#e08a60'), THREE.MathUtils.clamp((y - PALM_C[1] - 0.01) / 0.04, 0, 1) * (y > 0.54 ? 0.5 : 1))
        .offsetHSL(0, 0, (Math.random() - 0.5) * 0.05),
    () => 1 + Math.random() * 0.7,
    2,
  );
  for (const g of PAW_GAPS) strokeOnSurface(out, g, ink, 1.2, 0.004, 2);
  // when the paw is put down its pads turn away from her (see LightDog): mark them
  for (let i = padsFrom; i < out.length; i++) out[i].anim = ANIM_PAD;
  mark(out, padsFrom, 'fr', true);

  return out;
}

/** Simple shapes just inside the body, for the invisible depth-only "flesh". */
export interface Occluder {
  group: Group;
  part: Part;
  position: V3;
  scale: V3;
  /** [ry, rz]: turn about Y, then tilt about Z (Euler order 'YZX') */
  rot?: [number, number];
}
export function occluders(): Occluder[] {
  const out: Occluder[] = [];
  for (const s of SHAPES) {
    if (s.group === 1) continue; // the thin tail hides nothing
    if (s.kind === 'ear') {
      // a row of flat discs along the flap
      for (let i = 0; i < 7; i++) {
        const v = (i + 0.5) / 7;
        const f = earFrame(v, s.side, earTmp);
        out.push({
          group: s.group,
          part: s.part,
          position: [f.c.x, f.c.y, f.c.z],
          scale: [earW(v) * 0.85, EAR_LEN / 7 * 0.8, earT(v) * 0.6],
          rot: [s.side * earTurn(v), 0],
        });
      }
    } else if (s.kind === 'e') {
      out.push({ group: s.group, part: s.part, position: s.c, scale: [s.r[0] * 0.92, s.r[1] * 0.92, s.r[2] * 0.92], rot: [s.ry ?? 0, s.rz ?? 0] });
    } else {
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const r = (s.r1 + (s.r2 - s.r1) * t) * 0.9;
        out.push({
          group: s.group,
          part: s.part,
          position: [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + (s.b[2] - s.a[2]) * t],
          scale: [r, r, r / (s.flatZ ?? 1)],
        });
      }
    }
  }
  return out;
}
