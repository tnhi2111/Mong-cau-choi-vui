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
}

// ── the puppy, ~1.45 units tall, sitting, facing +z, feet at y ≈ -0.42 ──────
const PARTS: Part[] = [
  { c: [0, 0.62, 0.02], r: [0.34, 0.3, 0.3], col: 'gold', w: 1.2 }, // head
  { c: [0, 0.5, 0.26], r: [0.17, 0.12, 0.13], col: 'cream', w: 1.4 }, // muzzle
  { c: [0, 0.73, 0.2], r: [0.09, 0.12, 0.1], col: 'cream', w: 0.8 }, // forehead blaze
  { c: [0, 0.42, 0.33], r: [0.055, 0.045, 0.03], col: 'pink', w: 2.2 }, // tongue
  { c: [-0.31, 0.5, -0.02], r: [0.1, 0.23, 0.08], col: 'deep' }, // ears, flopped down
  { c: [0.31, 0.5, -0.02], r: [0.1, 0.23, 0.08], col: 'deep' },
  { c: [0, 0.06, -0.02], r: [0.3, 0.36, 0.28], col: 'gold' }, // body
  { c: [0, 0.2, 0.17], r: [0.19, 0.24, 0.13], col: 'cream', w: 1.3 }, // chest fluff
  { c: [-0.22, -0.22, -0.02], r: [0.17, 0.17, 0.21], col: 'gold' }, // haunches
  { c: [0.22, -0.22, -0.02], r: [0.17, 0.17, 0.21], col: 'gold' },
  { c: [-0.25, -0.38, 0.16], r: [0.1, 0.055, 0.12], col: 'cream', w: 1.3 }, // back feet
  { c: [0.25, -0.38, 0.16], r: [0.1, 0.055, 0.12], col: 'cream', w: 1.3 },
  { c: [-0.12, -0.14, 0.17], r: [0.08, 0.22, 0.08], col: 'gold' }, // front leg (standing)
  { c: [-0.12, -0.37, 0.23], r: [0.085, 0.055, 0.1], col: 'cream', w: 1.3 }, // its paw
  { c: [0.27, 0.3, 0.15], r: [0.08, 0.19, 0.08], col: 'gold', anim: 2 }, // waving arm
  { c: [0.34, 0.5, 0.2], r: [0.1, 0.1, 0.07], col: 'cream', anim: 2, w: 1.5 }, // waving paw
  { c: [0.33, -0.3, -0.26], r: [0.2, 0.065, 0.07], col: 'deep', anim: 1 }, // tail
];

/** Carved out: points inside these are removed (and a catch-light added for eyes). */
const HOLES: { c: V3; r: V3; light?: V3 }[] = [
  { c: [-0.125, 0.665, 0.26], r: [0.07, 0.075, 0.08], light: [-0.105, 0.69, 0.33] }, // big round eyes
  { c: [0.125, 0.665, 0.26], r: [0.07, 0.075, 0.08], light: [0.145, 0.69, 0.33] },
  { c: [0, 0.55, 0.38], r: [0.06, 0.042, 0.05], light: [0.015, 0.565, 0.43] }, // nose
  { c: [0.34, 0.5, 0.27], r: [0.045, 0.04, 0.04] }, // paw pad (palm)
  { c: [0.29, 0.57, 0.26], r: [0.022, 0.022, 0.04] }, // toe pads
  { c: [0.34, 0.59, 0.26], r: [0.022, 0.022, 0.04] },
  { c: [0.39, 0.57, 0.26], r: [0.022, 0.022, 0.04] },
];

const SHOULDER: V3 = [0.22, 0.14, 0.13];
const TAIL_BASE: V3 = [0.18, -0.28, -0.22];

const COLORS: Record<Part['col'], THREE.Color> = {
  gold: new THREE.Color('#ffb24f'),
  deep: new THREE.Color('#e8742a'),
  cream: new THREE.Color('#fff0d4'),
  pink: new THREE.Color('#ff6f96'),
};

const inside = (p: THREE.Vector3, c: V3, r: V3, grow = 1) => {
  const x = (p.x - c[0]) / (r[0] * grow);
  const y = (p.y - c[1]) / (r[1] * grow);
  const z = (p.z - c[2]) / (r[2] * grow);
  return x * x + y * y + z * z < 1;
};

function buildDog(total: number) {
  const areas = PARTS.map((p) => (p.w ?? 1) * Math.pow((p.r[0] * p.r[1]) ** 1.6 + (p.r[0] * p.r[2]) ** 1.6 + (p.r[1] * p.r[2]) ** 1.6, 1 / 1.6));
  const sum = areas.reduce((a, b) => a + b, 0);
  const out: { p: THREE.Vector3; col: THREE.Color; anim: number; size: number }[] = [];
  const v = new THREE.Vector3();
  PARTS.forEach((part, i) => {
    const want = Math.round((areas[i] / sum) * total);
    let made = 0;
    let tries = 0;
    while (made < want && tries < want * 12) {
      tries++;
      v.randomDirection();
      const p = new THREE.Vector3(part.c[0] + v.x * part.r[0], part.c[1] + v.y * part.r[1], part.c[2] + v.z * part.r[2]);
      // keep only the outer surface of the union — skip points buried in another part
      // (the tongue and the paw sit on top of everything, so nothing hides them)
      if (part.col !== 'pink' && part.anim !== 2 && PARTS.some((o, j) => j !== i && o.col !== 'pink' && o.anim !== 2 && inside(p, o.c, o.r, 0.97))) continue;
      if (HOLES.some((h) => inside(p, h.c, h.r))) continue;
      const col = COLORS[part.col].clone();
      // a touch of variation, and the top of the head a little lighter
      col.offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.08 + (p.y > 0.8 ? 0.04 : 0));
      out.push({ p, col, anim: part.anim ?? 0, size: 1.1 + Math.pow(Math.random(), 3) * 1.6 });
      made++;
    }
  });
  // catch-lights in the eyes and on the nose
  for (const h of HOLES) if (h.light) out.push({ p: new THREE.Vector3(...h.light), col: new THREE.Color('#ffffff'), anim: 0, size: 4.5 });
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
    const dog = buildDog(Math.round(6500 * density));
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
  });

  return (
    <group ref={group} position={position} rotation-y={facing} scale={scale}>
      <group ref={body} visible={false}>
        {PARTS.filter((p) => !p.anim && p.col !== 'pink').map((p, i) => (
          <mesh key={i} geometry={sphere} material={occluder} position={p.c} scale={[p.r[0] * 0.93, p.r[1] * 0.93, p.r[2] * 0.93]} renderOrder={-2} />
        ))}
      </group>
      <points geometry={points} material={material} frustumCulled={false} renderOrder={-1} />
    </group>
  );
}
