import * as THREE from 'three';
import { sdEllipsoid, sdRoundCone, TAIL_BASE, type Cone, type DogPoint, type Ellipsoid, type Part, type V3 } from './dogModel';

/*
 * The puppy on its feet, running — a skinned figure of light.
 *
 * The sitting puppy (dogModel.ts) is the one she sees first. To run, every one of its
 * points also gets a place on a *standing* puppy built here, bound to a bone of a real
 * dog's skeleton: a spine in two halves (chest, hips), head, tail, and per leg three
 * segments — front: upper arm, forearm, paw (shoulder, elbow, wrist); hind: thigh, shin,
 * hock-to-paw (hip, stifle, hock). The head, bib and tail keep their exact points (they
 * just move); the body and legs are laid anew on the standing shapes and paired with
 * the sitting points region by region (top of the sitting leg ↔ top of the running
 * leg, the sitting chest ↔ the underside, …), so standing up reads as the same light
 * flowing into a new pose.
 *
 * poseRun() puts the skeleton through a gallop, like a real dog's: the two hind feet
 * land one just after the other, then the two front feet, then a moment with all four
 * in the air, legs gathered under the body. Each foot is planted: during its stance it
 * slides back under the body exactly as fast as the body moves forward, so it never
 * skates; during its swing it lifts on an arc and reaches forward, the wrist curling the
 * front paw under and the hock folding the hind one. Knees and elbows come out of a
 * two-bone IK, so every joint bends the way a dog's does (elbows back, stifles forward).
 * The spine flexes and stretches with the stride, the body rocks and bounces, the head
 * steadies itself against the rocking.
 *
 * Units and axes as in dogModel: facing +z, paws resting at y ≈ -0.38 (centre).
 */

export const BONE_COUNT = 16;
const CHEST = 0;
const HIPS = 1;
export const HEAD = 2;
const TAIL = 3;
type LegName = 'fl' | 'fr' | 'hl' | 'hr';
const LEG_BONE: Record<LegName, number> = { fl: 4, fr: 7, hl: 10, hr: 13 };

const GROUND = -0.38;
const SPINE_PIVOT: V3 = [0, 0.12, -0.02];
const NECK_PIVOT: V3 = [0, 0.36, 0.33];
/** Rigid parts: where they sit on the standing puppy, relative to the sitting one. */
export const HEAD_OFFSET: V3 = [0, -0.03, 0.5];
const BIB_OFFSET: V3 = [0, -0.08, 0.08];
const RUN_TAIL_BASE: V3 = [0, 0.24, -0.32];
const TAIL_OFFSET: V3 = [RUN_TAIL_BASE[0] - TAIL_BASE[0], RUN_TAIL_BASE[1] - TAIL_BASE[1], RUN_TAIL_BASE[2] - TAIL_BASE[2]];

interface LegRest {
  front: boolean;
  /** shoulder / hip, elbow / stifle, wrist / hock, paw centre */
  j: [V3, V3, V3, V3];
}
function legRest(leg: LegName): LegRest {
  const front = leg[0] === 'f';
  const x = (leg[1] === 'l' ? -1 : 1) * (front ? 0.13 : 0.15);
  return front
    ? { front, j: [[x, 0.17, 0.2], [x, -0.07, 0.16], [x, -0.31, 0.21], [x, GROUND, 0.25]] }
    : { front, j: [[x, 0.17, -0.23], [x, -0.06, -0.11], [x, -0.25, -0.29], [x, GROUND, -0.23]] };
}
const LEGS: LegName[] = ['fl', 'fr', 'hl', 'hr'];
const REST: Record<LegName, LegRest> = { fl: legRest('fl'), fr: legRest('fr'), hl: legRest('hl'), hr: legRest('hr') };

// ── the standing body ───────────────────────────────────────────────────────
type RunShape = (({ kind: 'e' } & Ellipsoid) | ({ kind: 'c' } & Cone)) & {
  part: Part;
  paw?: boolean;
  /** bone, or -1 for the trunk (blended between chest and hips along its length) */
  bone: number;
  /** for leg segments: where along the leg this segment starts (0, 1, 2) */
  seg?: number;
  /** relative point density */
  w?: number;
};

const SHAPES: RunShape[] = [
  // a round, well-fed puppy: as broad in the body as when it sits
  { kind: 'e', c: [0, 0.13, -0.02], r: [0.235, 0.215, 0.3], part: 'torso', bone: -1 },
  { kind: 'e', c: [0, 0.08, 0.19], r: [0.19, 0.2, 0.14], part: 'torso', bone: -1 },
  { kind: 'e', c: [0, 0.14, -0.22], r: [0.205, 0.185, 0.155], part: 'torso', bone: -1 },
  { kind: 'c', a: [0, 0.2, 0.19], b: [0, 0.42, 0.38], r1: 0.18, r2: 0.15, part: 'torso', bone: CHEST, w: 2 },
  ...LEGS.flatMap((leg): RunShape[] => {
    const { front, j } = REST[leg];
    const b = LEG_BONE[leg];
    const [r0, r1, r2, r3] = front ? [0.1, 0.078, 0.062, 0.06] : [0.145, 0.088, 0.062, 0.058];
    const p = j[3];
    return [
      { kind: 'c', a: j[0], b: j[1], r1: r0, r2: r1, part: leg, bone: b, seg: 0 },
      { kind: 'c', a: j[1], b: j[2], r1: r1 * 0.95, r2: r2, part: leg, bone: b + 1, seg: 1 },
      { kind: 'c', a: j[2], b: p, r1: r2 * 0.95, r2: r3, part: leg, bone: b + 2, seg: 2, paw: front },
      { kind: 'e', c: [p[0], p[1], p[2] + 0.015], r: [0.088, 0.052, 0.1], part: leg, bone: b + 2, paw: true },
      ...[-0.62, -0.21, 0.21, 0.62].map(
        (k): RunShape => ({ kind: 'e', c: [p[0] + k * 0.088, p[1] - 0.004, p[2] + 0.09], r: [0.025, 0.042, 0.038], part: leg, bone: b + 2, paw: true }),
      ),
    ];
  }),
];

const sd = (x: number, y: number, z: number, s: RunShape) => (s.kind === 'e' ? sdEllipsoid(x, y, z, s) : sdRoundCone(x, y, z, s));

function area(s: RunShape): number {
  if (s.kind === 'e') {
    const [a, b, c] = s.r;
    return 4 * Math.PI * Math.pow(((a * b) ** 1.6 + (a * c) ** 1.6 + (b * c) ** 1.6) / 3, 1 / 1.6);
  }
  const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
  return Math.PI * (s.r1 + s.r2) * len;
}

function onShape(s: RunShape, out: THREE.Vector3): number {
  if (s.kind === 'e') {
    out.randomDirection();
    out.set(s.c[0] + out.x * s.r[0], s.c[1] + out.y * s.r[1], s.c[2] + out.z * s.r[2]);
    return 0;
  }
  const t = Math.random();
  const a = new THREE.Vector3(...s.a);
  const b = new THREE.Vector3(...s.b);
  const axis = b.clone().sub(a).normalize();
  const side = new THREE.Vector3().randomDirection().projectOnPlane(axis).normalize();
  out.copy(a).lerp(b, t).addScaledVector(side, s.r1 + (s.r2 - s.r1) * t);
  return t;
}

/** The standing body's surface normal at p (from the whole union of shapes). */
const sdAll = (x: number, y: number, z: number) => SHAPES.reduce((m, o) => Math.min(m, sd(x, y, z, o)), Infinity);
export function normalAt(p: THREE.Vector3, out: THREE.Vector3) {
  const e = 0.003;
  return out
    .set(
      sdAll(p.x + e, p.y, p.z) - sdAll(p.x - e, p.y, p.z),
      sdAll(p.x, p.y + e, p.z) - sdAll(p.x, p.y - e, p.z),
      sdAll(p.x, p.y, p.z + e) - sdAll(p.x, p.y, p.z - e),
    )
    .normalize();
}

/**
 * A golden retriever's coat: a soft layer of fur all over, and long feathering where
 * the breed has it — the belly and chest, the backs of the legs, the britches.
 */
function fluff(p: THREE.Vector3, s: RunShape) {
  const n = normalAt(p, new THREE.Vector3());
  let long = 0;
  // (and the ruff: a thick mane of fur down the front of the neck and chest)
  if (s.part === 'torso') long = Math.max(0, -n.y - 0.3) * 0.075 + Math.max(0, n.z - 0.3) * 0.06;
  else if (!s.paw && s.seg !== undefined && s.seg < 2) long = Math.max(0, -n.z - 0.2) * (s.seg === 0 ? 0.06 : 0.04);
  p.addScaledVector(n, 0.004 + Math.random() * 0.012 + Math.pow(Math.random(), 1.4) * long);
}

interface RunPoint {
  p: THREE.Vector3;
  bone: number;
  /** position along the leg (segment + fraction), for pairing */
  along: number;
}

/** `n` points over some of the standing shapes, spread by area, never buried inside another shape. */
function sample(shapes: RunShape[], n: number): RunPoint[] {
  const out: RunPoint[] = [];
  if (!n || !shapes.length) return out;
  const areas = shapes.map((s) => area(s) * (s.w ?? 1));
  const sum = areas.reduce((a, b) => a + b, 0);
  const p = new THREE.Vector3();
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    let r = Math.random() * sum;
    let i = 0;
    while (i < shapes.length - 1 && (r -= areas[i]) > 0) i++;
    const s = shapes[i];
    const t = onShape(s, p);
    if (SHAPES.some((o) => o !== s && sd(p.x, p.y, p.z, o) < -0.006)) continue;
    fluff(p, s);
    out.push({ p: p.clone(), bone: s.bone, along: s.seg !== undefined ? s.seg + t : 3 });
  }
  // (only if the shapes were nearly all buried) top up with anything
  while (out.length < n) out.push({ ...out[out.length % Math.max(1, out.length)] ?? { p: new THREE.Vector3(), bone: CHEST, along: 0 } });
  return out;
}

/** Pair two equal-sized sets by rank of a key, then by angle within slices of that rank. */
function pairUp<A, B>(a: A[], ka: (v: A) => number, aa: (v: A) => number, b: B[], kb: (v: B) => number, ab: (v: B) => number, emit: (x: A, y: B) => void) {
  const sa = [...a].sort((x, y) => ka(x) - ka(y));
  const sb = [...b].sort((x, y) => kb(x) - kb(y));
  const bins = Math.max(1, Math.round(sa.length / 50));
  for (let i = 0; i < bins; i++) {
    const from = Math.floor((i * sa.length) / bins);
    const to = Math.floor(((i + 1) * sa.length) / bins);
    const xa = sa.slice(from, to).sort((x, y) => aa(x) - aa(y));
    const xb = sb.slice(from, to).sort((x, y) => ab(x) - ab(y));
    xa.forEach((x, k) => emit(x, xb[k]));
  }
}

/** Where each leg starts on the sitting puppy (for pairing its points top to bottom). */
const SIT_ROOT: Record<LegName, V3> = { fl: [-0.13, 0.08, 0.14], fr: [0.21, 0.17, 0.14], hl: [-0.2, -0.03, -0.04], hr: [0.2, -0.03, -0.04] };

export interface RunBinding {
  pos: Float32Array;
  boneA: Float32Array;
  boneB: Float32Array;
  boneW: Float32Array;
}

/** Give every sitting point its place (and bones) on the running puppy. */
export function bindRun(dog: DogPoint[], total: number): RunBinding {
  const pos = new Float32Array(total * 3);
  const boneA = new Float32Array(total);
  const boneB = new Float32Array(total);
  const boneW = new Float32Array(total);
  const set = (i: number, p: THREE.Vector3 | V3, a: number, b = a, w = 0) => {
    if (p instanceof THREE.Vector3) pos.set([p.x, p.y, p.z], i * 3);
    else pos.set(p, i * 3);
    boneA[i] = a;
    boneB[i] = b;
    boneW[i] = w;
  };
  const byPart = new Map<string, number[]>();
  dog.forEach((d, i) => {
    const part = d.part ?? 'torso';
    const key = part + (d.paw ? ':paw' : '');
    if (!byPart.has(key)) byPart.set(key, []);
    byPart.get(key)!.push(i);
  });
  const at = (i: number) => dog[i].p;
  const offset = (i: number, o: V3): V3 => [at(i).x + o[0], at(i).y + o[1], at(i).z + o[2]];

  byPart.get('head')?.forEach((i) => set(i, offset(i, HEAD_OFFSET), HEAD));
  byPart.get('bib')?.forEach((i) => set(i, offset(i, BIB_OFFSET), CHEST));
  byPart.get('tail')?.forEach((i) => set(i, offset(i, TAIL_OFFSET), TAIL));

  // trunk: the sitting body top → bottom becomes the standing body front → back, and
  // the side facing her (the sitting chest) becomes the underside
  const trunkBone = (p: THREE.Vector3) => {
    const w = THREE.MathUtils.smoothstep(p.z, -0.25, 0.15);
    return [HIPS, CHEST, w] as const;
  };
  const sit = byPart.get('torso') ?? [];
  const run = sample(
    SHAPES.filter((s) => s.part === 'torso'),
    sit.length,
  );
  pairUp(
    sit,
    (i) => -at(i).y,
    (i) => Math.atan2(at(i).x, at(i).z),
    run,
    (r) => -r.p.z,
    (r) => Math.atan2(r.p.x, -(r.p.y - 0.08)),
    (i, r) => (r.bone === CHEST ? set(i, r.p, CHEST) : set(i, r.p, ...trunkBone(r.p))),
  );

  for (const leg of LEGS) {
    const root = SIT_ROOT[leg];
    const lx = REST[leg].j[0][0];
    for (const paw of [false, true]) {
      const sitIdx = byPart.get(leg + (paw ? ':paw' : '')) ?? [];
      const pts = sample(
        SHAPES.filter((s) => s.part === leg && !!s.paw === paw),
        sitIdx.length,
      );
      const centre = sitIdx.reduce((c, i) => c.add(at(i)), new THREE.Vector3()).divideScalar(Math.max(1, sitIdx.length));
      pairUp(
        sitIdx,
        // down the leg; on the (raised) waving paw its toes are at the top, so "front" there is up
        (i) => (paw ? (leg === 'fr' ? -at(i).y : -at(i).z) : Math.hypot(at(i).x - root[0], at(i).y - root[1], at(i).z - root[2])),
        (i) => Math.atan2(at(i).x - centre.x, at(i).z - centre.z),
        pts,
        (r) => (paw ? -r.p.z : r.along),
        (r) => Math.atan2(r.p.x - lx, r.p.z - (paw ? REST[leg].j[3][2] : 0)),
        (i, r) => set(i, r.p, r.bone),
      );
    }
  }
  return { pos, boneA, boneB, boneW };
}

// ── the gallop ─────────────────────────────────────────────────────────────
/** Strides per second, the share of a stride each foot is on the ground, half a stride's reach. */
export const GALLOP = { freq: 2.1, duty: 0.3, reach: 0.2 };
/** Body speed at full gallop (model units / s): exactly what keeps planted feet from skating. */
export const RUN_SPEED = (2 * GALLOP.reach * GALLOP.freq) / GALLOP.duty;
/**
 * When each foot lands in the stride: a playful puppy's bounding gallop — the hind pair
 * almost together, then the front pair, then a long, high leap with every foot in the air.
 */
const FOOTFALL: Record<LegName, number> = { hl: 0, hr: 0.05, fl: 0.38, fr: 0.43 };
/** When the last front foot leaves the ground and the leap begins. */
const LEAP_START = 0.43 + GALLOP.duty;
/** How high it springs at the top of the leap (model units). */
const LEAP_HEIGHT = 0.17;
/** The leap's rise and fall span a little more than the flight itself (phase units). */
const LEAP_RISE = LEAP_START - 0.08;
const LEAP_SPAN = 1 - LEAP_RISE + 0.06;

const TAU = Math.PI * 2;
const v3 = (p: V3) => new THREE.Vector3(...p);
const ang = (y: number, z: number) => Math.atan2(z, y); // angle in the side (y, z) plane
const REST_ANG: Record<LegName, [number, number, number]> = Object.fromEntries(
  LEGS.map((leg) => {
    const j = REST[leg].j;
    return [leg, [0, 1, 2].map((i) => ang(j[i + 1][1] - j[i][1], j[i + 1][2] - j[i][2])) as [number, number, number]];
  }),
) as Record<LegName, [number, number, number]>;
const LEN: Record<LegName, [number, number, number]> = Object.fromEntries(
  LEGS.map((leg) => {
    const j = REST[leg].j;
    return [leg, [0, 1, 2].map((i) => v3(j[i + 1]).distanceTo(v3(j[i]))) as [number, number, number]];
  }),
) as Record<LegName, [number, number, number]>;

const m1 = new THREE.Matrix4();
const m2 = new THREE.Matrix4();
/** A bone turning about X at `pivot` (rest) that has moved to `to`: T(to)·Rx(θ)·T(-pivot). */
function hinge(out: THREE.Matrix4, pivot: V3, to: THREE.Vector3, theta: number) {
  out.makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
  out.premultiply(m1.makeRotationX(theta));
  out.premultiply(m2.makeTranslation(to.x, to.y, to.z));
  return out;
}

/** Two-bone IK in the side plane: the middle joint for a root, a target and two lengths. */
function ik(root: THREE.Vector3, target: THREE.Vector3, a: number, b: number, bendBack: boolean, mid: THREE.Vector3, end: THREE.Vector3) {
  const dy = target.y - root.y;
  const dz = target.z - root.z;
  const d0 = Math.hypot(dy, dz) || 1e-4;
  // a real leg never locks straight: near full reach it eases toward it instead of snapping
  const reach = a + b;
  const soft = reach * 0.88;
  const d = Math.max(Math.abs(a - b) + 1e-3, d0 < soft ? d0 : soft + (reach - 1e-3 - soft) * Math.tanh((d0 - soft) / (reach - soft)));
  const uy = dy / d0;
  const uz = dz / d0;
  const A = Math.acos(THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  // the two ways the joint could bend; elbows point back, stifles forward
  const pick = (s: number) => [uy * Math.cos(s * A) - uz * Math.sin(s * A), uy * Math.sin(s * A) + uz * Math.cos(s * A)];
  let [my, mz] = pick(1);
  const midZ = root.z + mz * a - (root.z + uz * d * 0.5);
  if ((midZ > 0) === bendBack) [my, mz] = pick(-1);
  mid.set(root.x, root.y + my * a, root.z + mz * a);
  end.set(root.x, root.y + uy * d, root.z + uz * d);
}

const tv = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
const ease = (x: number) => x * x * (3 - 2 * x);

/**
 * Pose the skeleton. `phase` counts strides (it only matters mod 1), `k` is how hard it
 * runs (0 standing … 1 full gallop). Writes one matrix per bone: rest → posed.
 */
export function poseRun(out: THREE.Matrix4[], phase: number, k: number) {
  const f = ((phase % 1) + 1) % 1;
  // the body: a little sink over each pair of planted feet, then a high, arcing leap
  // (smooth at both ends: it starts rising while the front feet still push, and is still
  //  settling as the hind feet take its weight — no thud on landing, no jerk on take-off)
  const leapU = (((f - LEAP_RISE) % 1) + 1) % 1 / LEAP_SPAN;
  const bounce =
    k * (leapU <= 1 ? LEAP_HEIGHT * Math.pow(Math.sin(Math.PI * leapU), 1.6) : -0.015 * Math.sin((Math.PI * (leapU - 1) * LEAP_SPAN) / (1 - LEAP_SPAN)) ** 2);
  // nose up as the hind legs land and drive, down while the front legs take the weight
  const pitchUp = k * 0.15 * Math.sin(TAU * (f + 0.22));
  // the spine curls (legs gathered under) at the top of the leap, stretches as the fronts reach out
  const flex = k * 0.24 * Math.cos(TAU * (f - 0.93));
  const lift = new THREE.Vector3(0, bounce, 0);
  hinge(out[CHEST], SPINE_PIVOT, tv[0].set(...SPINE_PIVOT).add(lift), -pitchUp + flex);
  hinge(out[HIPS], SPINE_PIVOT, tv[0].set(...SPINE_PIVOT).add(lift), -pitchUp - flex);
  // the head holds steadier than the body, a little lower when it runs
  const neck = tv[1].set(...NECK_PIVOT).applyMatrix4(out[CHEST]);
  hinge(out[HEAD], NECK_PIVOT, neck, pitchUp * 0.7 + k * (0.1 + 0.04 * Math.sin(TAU * (f + 0.2))));
  // the tail streams out behind, bobbing with the stride
  const base = tv[2].set(...RUN_TAIL_BASE).applyMatrix4(out[HIPS]);
  hinge(out[TAIL], RUN_TAIL_BASE, base, -(0.3 + 0.4 * k) + k * 0.12 * Math.sin(TAU * (f + 0.4)) - pitchUp - flex);

  const stride = GALLOP.reach * k;
  const D = GALLOP.duty;
  for (const leg of LEGS) {
    const { front, j } = REST[leg];
    const b = LEG_BONE[leg];
    const [a0, a1, a2] = REST_ANG[leg];
    const [l0, l1, l2] = LEN[leg];
    const lf = (((f - FOOTFALL[leg]) % 1) + 1) % 1;
    // where the paw is (dog frame) and how far the last joint is folded
    const paw = tv[3].set(j[3][0], GROUND, j[3][2]);
    let fold: number;
    if (lf < D) {
      // planted: sliding back under the body as it passes over
      paw.z += stride * (1 - (2 * lf) / D);
      // the hind hock straightens as the leg drives back
      fold = front ? 0 : -0.6 * k * ease(lf / D);
    } else {
      const u = (lf - D) / (1 - D);
      // back to the front on a smooth curve that carries on from the planted foot's own
      // backward sweep (and meets the next landing the same way), so it never snaps
      const m = ((-2 * stride) / D) * (1 - D) * 0.8;
      const u2 = u * u;
      const u3 = u2 * u;
      paw.z += (2 * u3 - 3 * u2 + 1) * -stride + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * stride + (u3 - u2) * m;
      // lifted and set down gently, and carried up with the body in the leap (tucked, not dangling)
      paw.y += (front ? 0.17 : 0.14) * k * 0.5 * (1 - Math.cos(TAU * u)) + Math.max(0, bounce) * 0.9 * Math.sin(Math.PI * u);
      // front: the wrist curls the paw under; hind: the hock folds, the paw trails
      const curl = Math.sin(Math.PI * u) ** 2;
      fold = front ? 1.7 * k * curl : -0.6 * k * (1 - ease(u)) + 1.3 * k * curl;
    }
    // the joint above the paw, from the paw and that last segment's fold
    const lastAng = a2 + fold;
    const target = tv[4].set(paw.x, paw.y - l2 * Math.cos(lastAng), paw.z - l2 * Math.sin(lastAng));
    const root = tv[5].set(...j[0]).applyMatrix4(out[front ? CHEST : HIPS]);
    const mid = new THREE.Vector3();
    const end = new THREE.Vector3();
    ik(root, target, l0, l1, front, mid, end);
    hinge(out[b], j[0], root, ang(mid.y - root.y, mid.z - root.z) - a0);
    hinge(out[b + 1], j[1], mid, ang(end.y - mid.y, end.z - mid.z) - a1);
    hinge(out[b + 2], j[2], end, ang(paw.y - end.y, paw.z - end.z) - a2);
  }
}

/** Simple shapes just inside the standing body, per bone, for the invisible depth-only "flesh". */
export interface RunOccluder {
  bone: number;
  position: V3;
  scale: V3;
}
export function runOccluders(): RunOccluder[] {
  const out: RunOccluder[] = [];
  for (const s of SHAPES) {
    if (s.kind === 'e') {
      if (s.r[0] < 0.05) continue; // toes
      if (s.bone < 0 && s.r[2] > 0.25) {
        // the long trunk: its front half rides the chest, its back half the hips
        for (const [bone, side] of [[CHEST, 1], [HIPS, -1]] as const)
          out.push({ bone, position: [s.c[0], s.c[1], s.c[2] + side * s.r[2] * 0.45], scale: [s.r[0] * 0.88, s.r[1] * 0.88, s.r[2] * 0.55] });
        continue;
      }
      const bone = s.bone >= 0 ? s.bone : s.c[2] > -0.05 ? CHEST : HIPS;
      out.push({ bone, position: s.c, scale: [s.r[0] * 0.9, s.r[1] * 0.9, s.r[2] * 0.9] });
    } else {
      // (the neck stays hollow at the front, so the bib and chin in front of it still show)
      const inset = s.part === 'torso' ? 0.6 : 0.85;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const r = (s.r1 + (s.r2 - s.r1) * t) * inset;
        out.push({ bone: s.bone, position: [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + (s.b[2] - s.a[2]) * t], scale: [r, r, r] });
      }
    }
  }
  return out;
}
