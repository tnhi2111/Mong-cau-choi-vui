import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';

/*
 * A little cat made of light, beside the heart.
 *
 * Before the heart forms, its points are just faint dust scattered across the
 * background. When the heart gathers, they light up and drift together into a
 * sitting cat — ears, round head, body, a curled tail that sways, whiskers,
 * two eyes that blink now and then — and faint constellation lines join them.
 * A few more background points simply light up where they are, so the whole
 * sky gets a little brighter.
 */

type Pt = [number, number];
interface Stroke {
  pts: Pt[];
  /** draw a faint line through it once gathered */
  line: boolean;
  tail?: boolean;
  eye?: boolean;
}

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

const quad = (p0: Pt, p1: Pt, p2: Pt, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  });

/** A sitting cat, facing us — big round head, small body, happy closed eyes. Feet at y ≈ -0.46. */
function catStrokes(): Stroke[] {
  const d = Math.PI / 180;
  const hx = 0.4;
  const hy = 0.34;
  const hcY = 0.5;
  const head = (deg: number): Pt => [Math.cos(deg * d) * hx, hcY + Math.sin(deg * d) * hy];
  return [
    // head, open at the top where the ears grow from it
    { pts: arc(0, hcY, hx, hy, 68 * d, 112 * d - 360 * d, 30).reverse(), line: true },
    // short, wide, softly rounded cat ears
    { pts: [head(112), [-0.27, 0.93], [-0.32, 0.955], [-0.355, 0.925], head(148)], line: true },
    { pts: [head(68), [0.27, 0.93], [0.32, 0.955], [0.355, 0.925], head(32)], line: true },
    // a small round body tucked under the head
    { pts: arc(0, -0.13, 0.33, 0.34, 120 * d, 420 * d, 26), line: true },
    // front paws
    { pts: arc(-0.11, -0.46, 0.08, 0.05, 0, Math.PI, 6), line: true },
    { pts: arc(0.11, -0.46, 0.08, 0.05, 0, Math.PI, 6), line: true },
    // tail: curls up on the right, with a little hook at the end
    { pts: [...quad([0.3, -0.36], [0.78, -0.42], [0.66, 0.06], 14), [0.6, 0.12], [0.55, 0.1]], line: true, tail: true },
    // happy closed eyes  ^ ^
    { pts: arc(-0.15, 0.5, 0.065, 0.05, 20 * d, 160 * d, 8), line: true, eye: true },
    { pts: arc(0.15, 0.5, 0.065, 0.05, 20 * d, 160 * d, 8), line: true, eye: true },
    // a tiny nose and an ω mouth
    { pts: [[0, 0.43]], line: false },
    { pts: arc(-0.035, 0.405, 0.035, 0.03, 200 * d, 340 * d, 5), line: true },
    { pts: arc(0.035, 0.405, 0.035, 0.03, 200 * d, 340 * d, 5), line: true },
    // whiskers
    { pts: [[-0.24, 0.45], [-0.52, 0.5]], line: true },
    { pts: [[-0.24, 0.41], [-0.5, 0.37]], line: true },
    { pts: [[0.24, 0.45], [0.52, 0.5]], line: true },
    { pts: [[0.24, 0.41], [0.5, 0.37]], line: true },
  ];
}

/** Soft light filling the head and body, so the cat reads as made of light, not drawn. */
function catFill(n: number): Pt[] {
  const out: Pt[] = [];
  while (out.length < n) {
    const inHead = Math.random() < 0.55;
    const [cx, cy, rx, ry] = inHead ? [0, 0.5, 0.38, 0.32] : [0, -0.13, 0.31, 0.32];
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return out;
}

const BLUSH: Pt[] = [
  [-0.26, 0.4],
  [0.26, 0.4],
];

/** Points spaced evenly along a polyline. */
function resample(pts: Pt[], spacing: number): Pt[] {
  if (pts.length < 2) return pts;
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let at = spacing - carry;
    while (at <= len) {
      const t = at / len;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      at += spacing;
    }
    carry = len - (at - spacing);
  }
  return out;
}

const TAIL_BASE: Pt = [0.34, -0.38];

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAwake;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform float uShown;
  attribute vec3 aStart;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aKind;   // 0 outline, 1 tail, 2 eyes, 3 extra (lights up in place), 4 blush, 5 fill
  attribute float aSize;
  varying float vAlpha;
  varying float vWarm;
  varying float vKind;

  vec3 tailSway(vec3 p, float t) {
    vec2 base = vec2(${TAIL_BASE[0].toFixed(2)}, ${TAIL_BASE[1].toFixed(2)});
    float a = sin(t * 1.3) * 0.18 * uMotion;
    vec2 q = p.xy - base;
    q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
    return vec3(base + q, p.z);
  }

  void main() {
    float t = uTime;
    vec3 target = position;
    if (aKind > 0.5 && aKind < 1.5) target = tailSway(target, t);
    // breathing
    target.y *= 1.0 + sin(t * 1.6) * 0.008 * uMotion;
    target += vec3(sin(t * 0.9 + aSeed * 30.0), cos(t * 0.8 + aSeed * 17.0), 0.0) * 0.006 * uMotion;

    float e = clamp((uAwake - aDelay * 0.5) / 0.5, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 drift = aStart + vec3(sin(t * 0.2 + aSeed * 9.0), cos(t * 0.17 + aSeed * 5.0), 0.0) * 0.15 * uMotion;
    vec3 p = aKind > 2.5 ? drift : mix(drift, target, e);
    p.z += sin(e * 3.14159) * 0.4;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (13.0 / -mv.z) * mix(0.7, 1.0, e);

    float twinkle = 0.7 + 0.3 * sin(t * (1.1 + aSeed * 2.0) + aSeed * 40.0);
    // faint dust while asleep, bright once awake
    float lit = aKind > 4.5 ? 0.5 : aKind > 3.5 ? 1.0 : aKind > 2.5 ? 0.55 : 1.0;
    vAlpha = twinkle * mix(0.12, lit, smoothstep(0.0, 0.3, uAwake)) * uShown;
    vWarm = aSeed;
    vKind = aKind;
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying float vWarm;
  varying float vKind;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.5;
    // moonlight white with a warm glow — softer than the heart's pink; rosy cheeks
    vec3 col = mix(vec3(1.0, 0.9, 0.95), vec3(1.0, 0.86, 0.72), vWarm * 0.6);
    if (vKind > 3.5 && vKind < 4.5) { col = vec3(1.0, 0.45, 0.62); core *= 0.5; halo *= 1.6; }
    gl_FragColor = vec4(mix(col, vec3(1.0), core * 0.4), (core + halo) * vAlpha);
  }
`;

const lineVertex = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  attribute float aTail;
  vec3 tailSway(vec3 p, float t) {
    vec2 base = vec2(${TAIL_BASE[0].toFixed(2)}, ${TAIL_BASE[1].toFixed(2)});
    float a = sin(t * 1.3) * 0.18 * uMotion;
    vec2 q = p.xy - base;
    q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
    return vec3(base + q, p.z);
  }
  void main() {
    vec3 p = aTail > 0.5 ? tailSway(position, uTime) : position;
    p.y *= 1.0 + sin(uTime * 1.6) * 0.008 * uMotion;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const lineFragment = /* glsl */ `
  uniform float uOpacity;
  void main() { gl_FragColor = vec4(1.0, 0.88, 0.93, uOpacity); }
`;

interface Props {
  /** Starts the gathering (and keeps it lit). */
  awake: boolean;
  /** Fades the whole cat out (e.g. when the story moves on). */
  visible: boolean;
  position: [number, number, number];
  scale: number;
  density: number;
  reducedMotion: boolean;
}

export function CatConstellation({ awake, visible, position, scale, density, reducedMotion }: Props) {
  const group = useRef<THREE.Group>(null);
  const awakeP = useRef(0);
  const shown = useRef(visible ? 1 : 0);

  const { points, lines } = useMemo(() => {
    const strokes = catStrokes();
    const P: { x: number; y: number; kind: number }[] = [];
    const L: number[] = [];
    const tailFlags: number[] = [];
    for (const s of strokes) {
      const pts = s.pts.length > 1 ? resample(s.pts, 0.035) : s.pts;
      const kind = s.eye ? 2 : s.tail ? 1 : 0;
      pts.forEach(([x, y]) => P.push({ x, y, kind }));
      if (s.line) {
        for (let i = 1; i < s.pts.length; i++) {
          L.push(s.pts[i - 1][0], s.pts[i - 1][1], 0, s.pts[i][0], s.pts[i][1], 0);
          tailFlags.push(s.tail ? 1 : 0, s.tail ? 1 : 0);
        }
      }
    }
    for (const [x, y] of BLUSH) for (let k = 0; k < 3; k++) P.push({ x: x + (Math.random() - 0.5) * 0.04, y: y + (Math.random() - 0.5) * 0.03, kind: 4 });
    for (const [x, y] of catFill(Math.round(170 * density))) P.push({ x, y, kind: 5 });
    // extra background points that simply light up where they are
    const extra = Math.round(260 * density);
    const n = P.length + extra;
    const pos = new Float32Array(n * 3);
    const start = new Float32Array(n * 3);
    const delay = new Float32Array(n);
    const seed = new Float32Array(n);
    const kind = new Float32Array(n);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = P[i];
      if (p) pos.set([p.x, p.y, 0], i * 3);
      // scattered across the sky around (and behind) the cat, in the cat's local units
      start.set([(Math.random() - 0.5) * 9, (Math.random() - 0.4) * 5, -1 - Math.random() * 3], i * 3);
      delay[i] = Math.random();
      seed[i] = Math.random();
      kind[i] = p ? p.kind : 3;
      size[i] = !p
        ? 0.8 + Math.pow(Math.random(), 3) * 2.2
        : p.kind === 4
          ? 7
          : p.kind === 5
            ? 1.0 + Math.random() * 1.6
            : p.kind === 2
              ? 1.8
              : 1.3 + Math.random() * 1.6;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    pg.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    pg.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    pg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L), 3));
    lg.setAttribute('aTail', new THREE.BufferAttribute(new Float32Array(tailFlags), 1));
    return { points: pg, lines: lg };
  }, [density]);
  useEffect(
    () => () => {
      points.dispose();
      lines.dispose();
    },
    [points, lines],
  );

  const pu = useMemo(
    () => ({ uTime: { value: 0 }, uAwake: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uMotion: { value: 1 }, uShown: { value: 1 } }),
    [],
  );
  const lu = useMemo(() => ({ uTime: { value: 0 }, uMotion: { value: 1 }, uOpacity: { value: 0 } }), []);
  const pointMat = useShader(vertex, fragment, pu);
  const lineMat = useShader(lineVertex, lineFragment, lu);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    if (awake) awakeP.current = Math.min(1, awakeP.current + Math.min(rawDt, 0.25) / (reducedMotion ? 1.2 : 4.2));
    shown.current += ((visible ? 1 : 0) - shown.current) * (1 - Math.exp(-dt * 1.5));
    const motion = reducedMotion ? 0.15 : 1;
    pu.uTime.value = t;
    pu.uAwake.value = awakeP.current;
    pu.uMotion.value = motion;
    lu.uTime.value = t;
    lu.uMotion.value = motion;
    lu.uOpacity.value = THREE.MathUtils.smoothstep(awakeP.current, 0.75, 1) * 0.28 * shown.current;
    pu.uShown.value = shown.current;
    if (group.current) group.current.visible = shown.current > 0.01;
  });

  return (
    <group ref={group} position={position} scale={scale}>
      <points geometry={points} material={pointMat} frustumCulled={false} renderOrder={-1} />
      <lineSegments geometry={lines} material={lineMat} frustumCulled={false} renderOrder={-1} />
    </group>
  );
}
