import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';

/*
 * A little golden retriever puppy made of light, sitting beside the heart and
 * waving one paw — a real 3D figure, so it turns with the world as she drags.
 *
 * It is built from soft ellipsoids (head, muzzle, floppy ears, chest fluff,
 * body, legs, a raised paw, a tail) whose *union surface* is sprinkled with
 * points: each point that lands inside another part is dropped, so the outline
 * stays clean. Eyes, nose and paw pads are carved out as holes — on a glowing
 * figure, darkness reads as the dark of a puppy's eyes — each with a tiny white
 * catch-light.
 *
 * Before the heart forms its points are faint dust across the sky; when the
 * heart gathers they light up and fly in, and a few more background points
 * light up where they are. Once formed: the paw waves, the tail wags, it breathes.
 */

type V3 = [number, number, number];
interface Part {
  c: V3;
  r: V3;
  /** colour key */
  col: 'gold' | 'deep' | 'cream' | 'pink';
  /** 0 still, 1 tail, 2 waving arm */
  anim?: number;
  /** relative point density */
  w?: number;
  /** fur texture: faint strands in the colour (ears, chest) */
  fur?: 'ear' | 'chest';
  /** fine detail: smaller, denser points so small shapes stay crisp */
  fine?: boolean;
}

// ── the puppy, ~1.45 units tall, sitting, facing +z, feet at y ≈ -0.42 ──────
const BACK_FEET: { c: V3; r: V3 }[] = [
  { c: [-0.25, -0.38, 0.16], r: [0.1, 0.055, 0.12] },
  { c: [0.25, -0.38, 0.16], r: [0.1, 0.055, 0.12] },
];
const FRONT_PAW = { c: [-0.13, -0.37, 0.28] as V3, r: [0.095, 0.06, 0.1] as V3 };
const FEET = [...BACK_FEET, FRONT_PAW];

/** Four rounded toes along the front of each standing foot. */
const TOES: Part[] = FEET.flatMap(({ c, r }) =>
  [-0.66, -0.22, 0.22, 0.66].map(
    (k): Part => ({
      c: [c[0] + k * r[0], c[1] - r[1] * 0.1, c[2] + r[2] * 0.92],
      r: [r[0] * 0.25, r[1] * 0.85, 0.055],
      col: 'cream',
      w: 3.2,
      fine: true,
    }),
  ),
);

const PARTS: Part[] = [
  { c: [0, 0.62, 0.02], r: [0.34, 0.3, 0.3], col: 'gold', w: 2.2 }, // head
  { c: [0, 0.5, 0.26], r: [0.17, 0.12, 0.13], col: 'cream', w: 4, fine: true }, // muzzle
  { c: [0, 0.73, 0.2], r: [0.09, 0.12, 0.1], col: 'cream', w: 0.8 }, // forehead blaze
  { c: [-0.31, 0.5, -0.02], r: [0.1, 0.23, 0.08], col: 'deep', fur: 'ear', w: 1.4 }, // ears, flopped down
  { c: [0.31, 0.5, -0.02], r: [0.1, 0.23, 0.08], col: 'deep', fur: 'ear', w: 1.4 },
  { c: [0, 0.06, -0.02], r: [0.3, 0.36, 0.28], col: 'gold' }, // body
  { c: [0, 0.2, 0.17], r: [0.19, 0.24, 0.13], col: 'cream', fur: 'chest', w: 1.4 }, // chest fluff
  { c: [-0.22, -0.22, -0.02], r: [0.17, 0.17, 0.21], col: 'gold' }, // haunches
  { c: [0.22, -0.22, -0.02], r: [0.17, 0.17, 0.21], col: 'gold' },
  ...BACK_FEET.map((f): Part => ({ ...f, col: 'cream', w: 2.2, fine: true })), // back feet
  { c: [-0.13, -0.12, 0.22], r: [0.085, 0.24, 0.085], col: 'gold', w: 1.3 }, // front leg (standing)
  { ...FRONT_PAW, col: 'cream', w: 2.2, fine: true }, // its paw
  ...TOES,
  { c: [0.27, 0.3, 0.15], r: [0.08, 0.19, 0.08], col: 'gold', anim: 2 }, // waving arm
  { c: [0.34, 0.5, 0.2], r: [0.1, 0.1, 0.07], col: 'cream', anim: 2, w: 4, fine: true }, // waving paw
  { c: [0.33, -0.3, -0.26], r: [0.2, 0.065, 0.07], col: 'deep', anim: 1 }, // tail
];

/** The tongue hangs out of the open mouth — drawn after the carving, so nothing cuts it. */
const TONGUE: Part = { c: [0, 0.4, 0.37], r: [0.045, 0.052, 0.024], col: 'pink', w: 3, fine: true };

// Face and paw details. A glowing figure shows darkness as *absence of light*, so these
// are carved out of the fur and then filled with a few dim, dark-brown points (ink).
type Hole = { c: V3; r: V3; anim?: number };
const EYES: V3[] = [
  [-0.125, 0.665, 0.26],
  [0.125, 0.665, 0.26],
];
const NOSE: Hole = { c: [0, 0.552, 0.378], r: [0.082, 0.056, 0.055] };
const MOUTH: Hole = { c: [0, 0.428, 0.355], r: [0.07, 0.038, 0.06] };
const PADS: Hole[] = [
  { c: [0.34, 0.485, 0.27], r: [0.046, 0.036, 0.04], anim: 2 }, // palm pad
  { c: [0.285, 0.548, 0.265], r: [0.019, 0.021, 0.04], anim: 2 }, // toe pads
  { c: [0.32, 0.578, 0.265], r: [0.019, 0.021, 0.04], anim: 2 },
  { c: [0.36, 0.578, 0.265], r: [0.019, 0.021, 0.04], anim: 2 },
  { c: [0.395, 0.548, 0.265], r: [0.019, 0.021, 0.04], anim: 2 },
];
const HOLES: Hole[] = [...EYES.map((c) => ({ c, r: [0.07, 0.075, 0.08] as V3 })), NOSE, MOUTH, ...PADS];

/** Thin carved lines: the mouth (from the nose down, then a smile each side) and the gaps between toes. */
type Groove = { pts: V3[]; w: number };
const smile = (side: number): V3[] =>
  Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    return [side * t * 0.105, 0.462 - Math.sin(t * Math.PI * 0.8) * 0.03 + t * t * 0.02, 0.385 - t * t * 0.05];
  });
const GROOVES: Groove[] = [
  { pts: [[0, 0.5, 0.392], [0, 0.462, 0.388]], w: 0.015 },
  { pts: smile(-1), w: 0.015 },
  { pts: smile(1), w: 0.015 },
  ...FEET.flatMap(({ c, r }) =>
    [-0.44, 0, 0.44].map(
      (k): Groove => ({
        pts: [
          [c[0] + k * r[0], c[1] + r[1] * 0.75, c[2] + r[2] * 0.7],
          [c[0] + k * r[0], c[1] - r[1] * 0.7, c[2] + r[2] * 1.2],
        ],
        w: 0.017,
      }),
    ),
  ),
];

const SHOULDER: V3 = [0.22, 0.14, 0.13];
const TAIL_BASE: V3 = [0.18, -0.28, -0.22];

const COLORS: Record<Part['col'], THREE.Color> = {
  gold: new THREE.Color('#ffb24f'),
  deep: new THREE.Color('#e8742a'),
  cream: new THREE.Color('#fff0d4'),
  pink: new THREE.Color('#ff6f96'),
};
const INK = new THREE.Color('#b0603c');
const PAD = new THREE.Color('#e27470');

const inside = (p: THREE.Vector3, c: V3, r: V3, grow = 1) => {
  const x = (p.x - c[0]) / (r[0] * grow);
  const y = (p.y - c[1]) / (r[1] * grow);
  const z = (p.z - c[2]) / (r[2] * grow);
  return x * x + y * y + z * z < 1;
};

const seg = new THREE.Line3();
const closest = new THREE.Vector3();
function nearGroove(p: THREE.Vector3, g: Groove): boolean {
  for (let i = 1; i < g.pts.length; i++) {
    seg.set(new THREE.Vector3(...g.pts[i - 1]), new THREE.Vector3(...g.pts[i]));
    seg.closestPointToPoint(p, true, closest);
    if (closest.distanceTo(p) < g.w) return true;
  }
  return false;
}

type DogPoint = { p: THREE.Vector3; col: THREE.Color; anim: number; size: number };

/** Fill an ellipse on the front of a carved hole with dim points (nose, pads, irises). */
function fillHole(out: DogPoint[], h: Hole, col: THREE.Color, n: number, skip?: (x: number, y: number) => boolean) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * 0.85;
    const x = h.c[0] + Math.cos(a) * h.r[0] * rr;
    const y = h.c[1] + Math.sin(a) * h.r[1] * rr;
    if (skip?.(x, y)) continue;
    const c = col.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
    out.push({ p: new THREE.Vector3(x, y, h.c[2] + h.r[2] * 0.72), col: c, anim: h.anim ?? 0, size: 1.1 + Math.random() * 0.9 });
  }
}

function buildDog(total: number) {
  const parts = [...PARTS, TONGUE];
  const areas = parts.map((p) => (p.w ?? 1) * Math.pow((p.r[0] * p.r[1]) ** 1.6 + (p.r[0] * p.r[2]) ** 1.6 + (p.r[1] * p.r[2]) ** 1.6, 1 / 1.6));
  const sum = areas.reduce((a, b) => a + b, 0);
  const out: DogPoint[] = [];
  const v = new THREE.Vector3();
  const solid = (o: Part) => o.col !== 'pink' && o.anim !== 2;
  parts.forEach((part, i) => {
    const want = Math.round((areas[i] / sum) * total);
    const tongue = part === TONGUE;
    let made = 0;
    let tries = 0;
    while (made < want && tries < want * 14) {
      tries++;
      v.randomDirection();
      // detail parts face her: put most of their light on the front, where the features are
      if (part.fine && v.z < 0.1 && Math.random() < 0.75) continue;
      const p = new THREE.Vector3(part.c[0] + v.x * part.r[0], part.c[1] + v.y * part.r[1], part.c[2] + v.z * part.r[2]);
      if (tongue) {
        // only the front of the tongue shows, and not above the mouth line
        if (v.z < -0.2 || p.y > 0.43) continue;
      } else {
        // keep only the outer surface of the union — skip points buried in another part
        if (solid(part) && parts.some((o, j) => j !== i && solid(o) && inside(p, o.c, o.r, 0.97))) continue;
        if (HOLES.some((h) => inside(p, h.c, h.r))) continue;
        if (GROOVES.some((g) => nearGroove(p, g))) continue;
      }
      const col = COLORS[part.col].clone();
      // a touch of variation, and the top of the head a little lighter
      let light = (Math.random() - 0.5) * 0.08 + (p.y > 0.8 ? 0.04 : 0);
      // fur: long soft strands running down the ears, feathered waves on the chest
      if (part.fur === 'ear') light += Math.sin((p.x - part.c[0]) * 70 + p.y * 9) > 0.35 ? -0.1 : 0.05;
      if (part.fur === 'chest') light += Math.sin(p.x * 55 + Math.sin(p.y * 22) * 2.2) > 0.5 ? 0.06 : -0.06;
      col.offsetHSL((Math.random() - 0.5) * 0.02, 0, light);
      out.push({ p, col, anim: part.anim ?? 0, size: part.fine ? 0.8 + Math.random() * 0.7 : 1.1 + Math.pow(Math.random(), 3) * 1.6 });
      made++;
    }
  });

  // dark details: irises, the nose (with two nostrils), the inside of the mouth, the grooves
  for (const c of EYES) fillHole(out, { c, r: [0.062, 0.066, 0.08] }, new THREE.Color('#8c4526'), 170);
  const nostril = (x: number, y: number) => [-1, 1].some((s) => ((x - s * 0.03) / 0.016) ** 2 + ((y - 0.54) / 0.011) ** 2 < 1);
  fillHole(out, NOSE, new THREE.Color('#9a4a30'), 380, nostril);
  fillHole(out, { c: [MOUTH.c[0], MOUTH.c[1] + 0.008, MOUTH.c[2]], r: [MOUTH.r[0], MOUTH.r[1] * 0.6, MOUTH.r[2]] }, new THREE.Color('#8a2e38'), 120);
  for (const g of GROOVES)
    for (let i = 1; i < g.pts.length; i++) {
      const a = new THREE.Vector3(...g.pts[i - 1]);
      const b = new THREE.Vector3(...g.pts[i]);
      const n = Math.ceil(a.distanceTo(b) / 0.004);
      for (let k = 0; k <= n; k++) out.push({ p: a.clone().lerp(b, k / n), col: INK.clone(), anim: 0, size: 1.5 });
    }
  // soft pink-brown paw pads on the waving paw
  for (const h of PADS) fillHole(out, h, PAD, h.r[0] > 0.03 ? 90 : 26);

  // catch-lights: eyes and the top of the nose
  const lights: V3[] = [
    [-0.1, 0.69, 0.335],
    [0.15, 0.69, 0.335],
    [0.016, 0.568, 0.425],
  ];
  for (const l of lights) out.push({ p: new THREE.Vector3(...l), col: new THREE.Color('#ffffff'), anim: 0, size: 4.5 });
  return out;
}

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAwake;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform float uShown;
  attribute vec3 aStart;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aAnim;  // 0 still, 1 tail, 2 waving arm, 3 cheek glow, 4 background point
  attribute float aSize;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSoft;

  vec3 rotZ(vec3 p, vec3 o, float a) {
    vec3 q = p - o;
    return o + vec3(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a), q.z);
  }
  vec3 rotY(vec3 p, vec3 o, float a) {
    vec3 q = p - o;
    return o + vec3(q.x * cos(a) + q.z * sin(a), q.y, -q.x * sin(a) + q.z * cos(a));
  }

  void main() {
    float t = uTime;
    vec3 target = position;
    // waving: the raised paw swings back and forth from the shoulder, a little pause between waves
    if (aAnim > 1.5 && aAnim < 2.5) {
      float wave = sin(t * 5.5) * smoothstep(-0.2, 0.4, sin(t * 0.9));
      target = rotZ(target, vec3(${SHOULDER.join(', ')}), wave * 0.32 * uMotion);
    }
    // wagging
    if (aAnim > 0.5 && aAnim < 1.5) target = rotY(target, vec3(${TAIL_BASE.join(', ')}), sin(t * 7.0) * 0.45 * uMotion);
    // breathing
    target.y += sin(t * 1.7) * 0.006 * uMotion * (target.y + 0.42);
    target += vec3(sin(t * 0.9 + aSeed * 30.0), cos(t * 0.8 + aSeed * 17.0), sin(t * 0.7 + aSeed * 11.0)) * 0.004 * uMotion;

    float e = clamp((uAwake - aDelay * 0.5) / 0.5, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 drift = aStart + vec3(sin(t * 0.2 + aSeed * 9.0), cos(t * 0.17 + aSeed * 5.0), 0.0) * 0.15 * uMotion;
    vec3 p = aAnim > 3.5 ? drift : mix(drift, target, e);
    p.z += sin(e * 3.14159) * 0.4;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (12.0 / -mv.z) * mix(0.7, 1.0, e);

    float twinkle = 0.75 + 0.25 * sin(t * (1.1 + aSeed * 2.0) + aSeed * 40.0);
    float lit = aAnim > 3.5 ? 0.55 : aAnim > 2.5 ? 0.35 : 1.0;
    // faint dust while asleep, bright once awake
    vAlpha = twinkle * mix(0.1, lit, smoothstep(0.0, 0.3, uAwake)) * uShown * mix(0.6, 1.0, e);
    vColor = aAnim > 3.5 ? vec3(1.0, 0.9, 0.85) : aColor;
    vSoft = aAnim > 2.5 && aAnim < 3.5 ? 1.0 : 0.0;
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSoft;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.22, 0.0, d) * (1.0 - vSoft);
    float halo = smoothstep(0.5, 0.1, d) * mix(0.5, 1.0, vSoft);
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.3), (core + halo) * vAlpha);
  }
`;

interface Props {
  /** Starts the gathering (and keeps it lit). */
  awake: boolean;
  /** Fades the whole puppy out (e.g. when the story moves on). */
  visible: boolean;
  position: [number, number, number];
  /** Turn toward the heart (radians around Y). */
  facing?: number;
  scale: number;
  density: number;
  reducedMotion: boolean;
}

export function LightDog({ awake, visible, position, facing = 0, scale, density, reducedMotion }: Props) {
  const group = useRef<THREE.Group>(null);
  const awakeP = useRef(0);
  const shown = useRef(visible ? 1 : 0);

  const points = useMemo(() => {
    const dog = buildDog(Math.round(11000 * density));
    const extra = Math.round(260 * density);
    const n = dog.length + extra;
    const pos = new Float32Array(n * 3);
    const start = new Float32Array(n * 3);
    const delay = new Float32Array(n);
    const seed = new Float32Array(n);
    const anim = new Float32Array(n);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = dog[i];
      if (d) {
        pos.set([d.p.x, d.p.y, d.p.z], i * 3);
        color.set([d.col.r, d.col.g, d.col.b], i * 3);
      }
      // scattered across the sky around (and behind) the puppy, in its local units
      start.set([(Math.random() - 0.5) * 9, (Math.random() - 0.4) * 5, -1 - Math.random() * 3], i * 3);
      delay[i] = Math.random();
      seed[i] = Math.random();
      anim[i] = d ? d.anim : 4;
      size[i] = d ? d.size : 0.8 + Math.pow(Math.random(), 3) * 2.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    return g;
  }, [density]);
  useEffect(() => () => points.dispose(), [points]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAwake: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: 1 },
      uShown: { value: 1 },
    }),
    [],
  );
  const material = useShader(vertex, fragment, uniforms);

  // An invisible body just beneath the fur: it writes depth only, so light on the far
  // side of the puppy is hidden — and the carved eyes and nose read as real dark spots.
  const occluder = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false }), []);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 24, 16), []);
  useEffect(
    () => () => {
      occluder.dispose();
      sphere.dispose();
    },
    [occluder, sphere],
  );
  const body = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (awake) awakeP.current = Math.min(1, awakeP.current + Math.min(rawDt, 0.25) / (reducedMotion ? 1.2 : 4.2));
    shown.current += ((visible ? 1 : 0) - shown.current) * (1 - Math.exp(-dt * 1.5));
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uAwake.value = awakeP.current;
    uniforms.uMotion.value = reducedMotion ? 0.15 : 1;
    uniforms.uShown.value = shown.current;
    if (group.current) group.current.visible = shown.current > 0.01;
    // the body only exists once the light has gathered into it
    if (body.current) body.current.visible = awakeP.current > 0.85 && shown.current > 0.5;
    // the waving arm's hidden body follows the same wave as its light (see the shader)
    if (arm.current) {
      const t = state.clock.elapsedTime;
      const wave = Math.sin(t * 5.5) * THREE.MathUtils.smoothstep(Math.sin(t * 0.9), -0.2, 0.4);
      arm.current.rotation.z = wave * 0.32 * uniforms.uMotion.value;
    }
  });

  return (
    <group ref={group} position={position} rotation-y={facing} scale={scale}>
      <group ref={body} visible={false}>
        {PARTS.filter((p) => !p.anim && p.col !== 'pink').map((p, i) => (
          <mesh key={i} geometry={sphere} material={occluder} position={p.c} scale={[p.r[0] * 0.93, p.r[1] * 0.93, p.r[2] * 0.93]} renderOrder={-2} />
        ))}
        <group ref={arm} position={SHOULDER}>
          {PARTS.filter((p) => p.anim === 2).map((p, i) => (
            <mesh
              key={i}
              geometry={sphere}
              material={occluder}
              position={[p.c[0] - SHOULDER[0], p.c[1] - SHOULDER[1], p.c[2] - SHOULDER[2]]}
              scale={[p.r[0] * 0.9, p.r[1] * 0.9, p.r[2] * 0.9]}
              renderOrder={-2}
            />
          ))}
        </group>
      </group>
      <points geometry={points} material={material} frustumCulled={false} renderOrder={-1} />
    </group>
  );
}
