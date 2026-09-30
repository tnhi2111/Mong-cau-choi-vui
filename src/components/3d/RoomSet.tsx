import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useShader } from './useShader';
import { birthdayConfig } from '../../config/birthday';
import { fill } from '../../lib/text';
import { sound } from '../../lib/audio';
import { getHeartGeometry } from './heartShape';

/*
 * The gift room's set: a small, warm room dressed for her birthday, at night.
 *
 *   • a wooden floor with a round rug under the ring of gifts, lit by pools of candlelight,
 *     a pink breath from the heart and a cool slant of moonlight from the window
 *   • a round wall — plaster over wood panelling — with an arched window onto a
 *     moonlit, starry sky, fairy lights and HAPPY BIRTHDAY bunting sagging along it
 *   • clusters of candles whose flames flicker irregularly (and their light with them)
 *   • a birthday cake on a little round table — touch it and its candles are blown out
 *     (a wisp of smoke), then catch again a few seconds later
 *   • balloons (round and heart-shaped) on ribbons, bobbing in the draught; touched, they
 *     bounce on their ribbons with a soft chime
 *   • a secret: a little glowing letter leaning against the cake table, only found by
 *     turning the room round
 *
 * Everything is drawn with small unlit shaders that fake their own light (so the room
 * adds no real lights and no heavy shaders — the gift materials stay the only lit ones).
 * The flicker function is shared by the flames and by the light they throw on floor/wall.
 */

const FLICK = /* glsl */ `
  float flick(float t, float s) {
    return 0.78 + 0.12 * sin(t * 7.3 + s * 13.0) + 0.07 * sin(t * 13.1 + s * 7.0)
         + 0.06 * sin(t * 23.7 + s * 3.0) * sin(t * 1.7 + s);
  }
`;

const WALL_R = 9;
const WALL_H = 6.2;
/** Direction of the window (the back of the room, as first seen). */
const WINDOW_ANGLE = 0; // measured as atan(x, -z)
const MAX_CANDLES = 12;

interface Candle {
  x: number;
  z: number;
  h: number;
  r: number;
  seed: number;
}

function placeCandles(rx: number, rz: number): Candle[] {
  // clusters of 2–3 between the gifts, just outside the rug
  const clusters = [0.62, 1.88, 3.14, 4.4, 5.66];
  const out: Candle[] = [];
  clusters.forEach((a, ci) => {
    const n = ci % 2 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const aa = a + (k - (n - 1) / 2) * 0.09 + (ci === 2 ? 0.25 : 0);
      const push = 1.35 + (k % 2) * 0.22;
      out.push({
        x: Math.sin(aa) * (rx + push),
        z: Math.cos(aa) * (rz + push),
        h: [0.42, 0.28, 0.2][k % 3] + (ci % 3) * 0.04,
        r: [0.065, 0.055, 0.05][k % 3],
        seed: ci * 3.1 + k * 1.7,
      });
    }
  });
  return out.slice(0, MAX_CANDLES);
}

/* ── the floor: planks, rug, pools of light ───────────────────────────────── */
const floorVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const floorFragment = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCandles[${MAX_CANDLES}];
  uniform int uCount;
  uniform vec2 uRug;
  uniform float uHeart;
  uniform float uMotion;
  varying vec3 vWorld;
  ${FLICK}
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 p = vWorld.xz;
    float r = length(p);
    // planks: 0.34 wide, staggered ends, grain running along them
    float row = floor(p.y / 0.34);
    float along = p.x + hash(row) * 3.0;
    float plank = floor(along / 2.2);
    float id = hash(row * 17.0 + plank);
    float seamW = smoothstep(0.0, 0.012, abs(fract(p.y / 0.34) - 0.5) * 0.34 - 0.155);
    float seamE = smoothstep(0.0, 0.01, abs(fract(along / 2.2) - 0.5) * 2.2 - 1.09);
    float grain = 0.5 + 0.5 * sin(along * 90.0 + sin(p.y * 40.0 + id * 9.0) * 2.4 + id * 20.0);
    vec3 wood = mix(vec3(0.19, 0.1, 0.06), vec3(0.3, 0.17, 0.1), id * 0.6 + grain * 0.25);
    wood *= 0.7 + 0.3 * (1.0 - seamW) * (1.0 - seamE);

    // the rug: a soft oval under the ring of gifts, with a patterned border and a fringe
    float e = length(p / uRug);
    vec3 rug = vec3(0.34, 0.14, 0.18);
    float ang = atan(p.y, p.x);
    // a wide soft border band, a thin cream line, and a faint floral repeat in it
    float band = smoothstep(0.8, 0.83, e) * (1.0 - smoothstep(0.95, 0.97, e));
    rug = mix(rug, vec3(0.42, 0.2, 0.22), band);
    rug = mix(rug, vec3(0.62, 0.46, 0.4), smoothstep(0.006, 0.0, abs(e - 0.8)) * 0.6);
    float motif = smoothstep(0.35, 0.0, length(vec2(fract(ang * 5.0) - 0.5, (e - 0.885) * 14.0)));
    rug = mix(rug, vec3(0.55, 0.32, 0.32), band * motif * 0.5);
    // the pile of the weave, and a soft dip toward the middle where it has been walked on
    rug *= 0.9 + 0.1 * fract(sin(dot(floor(p * 90.0), vec2(12.9, 78.2))) * 43758.5);
    rug *= 0.85 + 0.15 * smoothstep(0.0, 0.7, e);
    float onRug = 1.0 - smoothstep(0.985, 1.0, e);
    float fringe = smoothstep(1.0, 1.0, e) * (1.0 - smoothstep(1.0, 1.035, e)) * step(0.3, fract(ang * 90.0));
    vec3 base = mix(wood, rug, onRug);
    base = mix(base, vec3(0.62, 0.5, 0.44), fringe * 0.7);

    // light: a dim room, pools of candlelight, the heart's breath, a slant of moonlight
    vec3 light = vec3(0.1, 0.07, 0.09);
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      float d = length(p - c.xy);
      float f = flick(uTime * uMotion + 20.0, c.z);
      light += vec3(1.0, 0.68, 0.42) * f * (0.55 * exp(-d * d * 1.8) + 0.16 * exp(-d * d * 0.2));
    }
    light += vec3(1.0, 0.36, 0.52) * uHeart * exp(-r * r * 0.12) * 0.55;
    // moonlight from the window: a cool, soft shaft on the floor toward the back
    vec2 m = p - vec2(0.0, -5.6);
    light += vec3(0.35, 0.45, 0.8) * 0.4 * exp(-(m.x * m.x) * 0.5 - (m.y * m.y) * 0.12);
    vec3 col = base * light;
    // out toward the wall the room falls into darkness
    col *= 1.0 - smoothstep(6.0, 9.0, r) * 0.7;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── the wall: plaster, panelling, an arched window onto a starry night ──── */
const wallVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const wallFragment = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCandles[${MAX_CANDLES}];
  uniform int uCount;
  uniform float uFloorY;
  uniform float uMotion;
  varying vec3 vWorld;
  ${FLICK}
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float a = atan(vWorld.x, -vWorld.z) - ${WINDOW_ANGLE.toFixed(3)};
    float h = vWorld.y - uFloorY;
    float s = a * ${WALL_R.toFixed(1)};   // distance along the wall
    float t = uTime * uMotion;

    // plaster above, wood panelling below with a rail
    vec3 plaster = vec3(0.2, 0.11, 0.12) * (0.92 + 0.08 * hash2(floor(vec2(s, h) * 40.0)));
    vec3 panel = vec3(0.2, 0.1, 0.06);
    float panelLine = smoothstep(0.03, 0.0, abs(fract(s / 0.9) - 0.5) * 0.9 - 0.42);
    panel *= 0.8 + 0.2 * (1.0 - panelLine);
    vec3 col = mix(panel, plaster, smoothstep(1.08, 1.12, h));
    col = mix(col, vec3(0.34, 0.2, 0.12), smoothstep(0.035, 0.0, abs(h - 1.1)));

    // warm light from the candles below, climbing the wall
    vec3 light = vec3(0.12, 0.08, 0.1);
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      float ca = atan(c.x, -c.y);
      float d = abs(mod(a + ${WINDOW_ANGLE.toFixed(3)} - ca + 3.14159, 6.28318) - 3.14159) * ${WALL_R.toFixed(1)};
      float reach = length(c.xy) / ${WALL_R.toFixed(1)};
      light += vec3(1.0, 0.58, 0.3) * flick(t + 20.0, c.z) * 0.55 * reach * reach * exp(-d * d * 0.35) * exp(-h * 0.55);
    }
    col *= light * 1.6;

    // the arched window
    float wx = s;
    float wy = h - 2.5;
    float archTop = 1.35 + sqrt(max(0.0, 1.0 - (wx / 0.95) * (wx / 0.95))) * 0.75;
    float inWin = step(abs(wx), 0.95) * step(-1.3, wy) * step(wy, archTop);
    float frame = step(abs(wx), 1.07) * step(-1.42, wy) * step(wy, archTop + 0.12) * (1.0 - inWin);
    if (inWin > 0.5) {
      // the night: deep blue, a big soft moon, stars
      vec3 sky = mix(vec3(0.03, 0.04, 0.12), vec3(0.1, 0.13, 0.3), smoothstep(2.2, -1.3, wy));
      vec2 moon = vec2(0.42, 1.25);
      float md = length(vec2(wx, wy) - moon);
      sky += vec3(0.9, 0.92, 1.0) * smoothstep(0.24, 0.2, md) + vec3(0.3, 0.35, 0.6) * exp(-md * md * 3.0) * 0.6;
      vec2 sg = floor(vec2(wx, wy) * 22.0);
      sky += vec3(0.8) * step(0.985, hash2(sg)) * (0.5 + 0.5 * sin(t * 2.0 + hash2(sg) * 40.0));
      // mullions: a cross of glazing bars, and the city's faint glow low on the horizon
      float bars = smoothstep(0.025, 0.0, abs(wx)) + smoothstep(0.025, 0.0, abs(wy - 0.35));
      sky = mix(sky, vec3(0.2, 0.12, 0.08), clamp(bars, 0.0, 1.0));
      sky += vec3(0.25, 0.2, 0.35) * smoothstep(-0.9, -1.3, wy) * 0.2;
      col = sky;
    } else if (frame > 0.5) {
      col = vec3(0.3, 0.17, 0.1) * (light * 1.6 + vec3(0.1, 0.12, 0.2));
    }
    // the sill catches a little moonlight
    col += vec3(0.25, 0.3, 0.5) * smoothstep(0.05, 0.0, abs(wy + 1.36)) * step(abs(wx), 1.12) * 0.6;
    // up into the dark
    col *= 1.0 - smoothstep(3.6, ${WALL_H.toFixed(1)}, h) * 0.85;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── candles: wax that glows near the flame, flames that flicker ──────────── */
const waxVertex = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  void main() {
    vY = uv.y;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const waxFragment = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  void main() {
    // lit from its own flame above: translucent, warm at the top, cooler below
    vec3 wax = mix(vec3(0.3, 0.2, 0.17), vec3(0.95, 0.72, 0.5), pow(vY, 4.0));
    float rim = pow(1.0 - abs(vN.z), 2.0) * 0.25;
    gl_FragColor = vec4(wax + rim * vec3(1.0, 0.6, 0.35), 1.0);
  }
`;
const flameVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aSeed;
  varying float vF;
  varying float vSeed;
  ${FLICK}
  void main() {
    vF = flick(uTime * uMotion + 20.0, aSeed);
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 300.0 * uPixelRatio / -mv.z;
  }
`;
const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform float uLit;
  varying float vF;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5, 0.62);
    c.y = -c.y;
    // the flame sways a little from side to side
    c.x += sin(uTime * uMotion * 5.0 + vSeed * 9.0) * 0.012 * (c.y + 0.1) * 6.0;
    // a teardrop: round at the bottom, drawn up to a point
    float w = 0.055 * (1.0 - smoothstep(-0.06, 0.2, c.y)) + 0.012;
    float body = smoothstep(w, w * 0.4, abs(c.x)) * smoothstep(-0.075, -0.045, c.y) * smoothstep(0.22 * vF, 0.08, c.y);
    float core = smoothstep(0.03, 0.0, length(c - vec2(0.0, -0.02)));
    float blue = smoothstep(0.03, 0.0, length(c - vec2(0.0, -0.058))) * 0.6;
    float halo = exp(-dot(c, c) * 22.0) * 0.35 * vF;
    vec3 col = vec3(1.0, 0.62, 0.22) * body + vec3(1.0, 0.95, 0.8) * core * body + vec3(0.3, 0.45, 1.0) * blue + vec3(1.0, 0.55, 0.25) * halo;
    float a = clamp(body + halo + blue * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col * uLit, a * uLit);
  }
`;

/* ── little lights: fairy lights, the tree's lights and star ─────────────── */
const twinkleVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aSeed;
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // each bulb breathes at its own pace, now and then dipping low
    float tw = 0.65 + 0.35 * sin(uTime * uMotion * (0.8 + aSeed * 1.6) + aSeed * 30.0);
    tw *= 0.8 + 0.2 * step(0.2, fract(uTime * 0.13 * uMotion + aSeed * 5.0));
    vA = tw;
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio * (24.0 / -mv.z) * (0.8 + 0.3 * tw);
  }
`;
const twinkleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.16, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.5), (core + halo * halo * 0.5) * vA);
  }
`;

/* ── glossy latex: the balloons ────────────────────────────────────────────── */
const glassVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const glassFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float facing = clamp(dot(vN, vView), 0.0, 1.0);
    float fres = pow(1.0 - facing, 3.0);
    // warm candle light from below, cool moonlight from the back window, a crisp highlight
    float warm = clamp(-vN.y * 0.6 + 0.4, 0.0, 1.0);
    vec3 col = uColor * (0.18 + 0.5 * warm) + vec3(1.0, 0.7, 0.45) * fres * 0.8;
    vec3 hl = normalize(vec3(-0.4, 0.6, 0.7));
    col += vec3(1.0, 0.95, 0.9) * pow(max(dot(reflect(-vView, vN), hl), 0.0), 60.0) * 1.4;
    col += uColor * uGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A balloon on a ribbon, tied down near the floor — it bobs in the draught and bounces when touched. */
function Balloon({
  at,
  length,
  color,
  heart,
  pitch,
  motion,
  hoverFx,
}: {
  at: [number, number, number];
  length: number;
  color: string;
  heart: boolean;
  pitch: number;
  motion: number;
  hoverFx: boolean;
}) {
  const pivot = useRef<THREE.Group>(null);
  // held up by its ribbon: a damped spring on two angles, like an upside-down pendulum
  const s = useRef({ ax: 0, az: 0, vx: 0, vz: 0, glow: 0 });
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uGlow: { value: 0 } }), [color]);
  const latex = useShader(glassVertex, glassFragment, uniforms, { opaque: true });
  const seed = useMemo(() => Math.random() * 10, []);
  const ribbon = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e8c9b0', transparent: true, opacity: 0.35, depthWrite: false }), []);
  const knot = useMemo(() => new THREE.MeshBasicMaterial({ color }), [color]);
  const heartGeo = useMemo(() => (heart ? getHeartGeometry('low') : null), [heart]);
  useEffect(
    () => () => {
      ribbon.dispose();
      knot.dispose();
    },
    [ribbon, knot],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = s.current;
    const t = state.clock.elapsedTime;
    const k = 5.5 / length;
    // a lazy bob and a faint draught keep it alive
    const breeze = (Math.sin(t * 0.6 + seed) * 0.006 + Math.sin(t * 1.7 + seed * 2) * 0.003) * motion;
    p.vx += (-k * Math.sin(p.ax) - p.vx * 0.9) * dt + breeze * dt * 10;
    p.vz += (-k * Math.sin(p.az) - p.vz * 0.9) * dt + breeze * dt * 6;
    p.ax += p.vx * dt;
    p.az += p.vz * dt;
    p.glow *= Math.exp(-dt * 2.5);
    uniforms.uGlow.value = p.glow * 0.5;
    if (pivot.current) {
      pivot.current.rotation.set(p.ax, 0, p.az);
      pivot.current.position.y = Math.sin(t * 0.9 + seed) * 0.03 * motion;
    }
  });

  const push = (strength: number, e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = s.current;
    const dir = e.ray.direction;
    p.vz += -dir.x * strength;
    p.vx += dir.z * strength;
    p.glow = Math.min(1, p.glow + strength);
  };

  return (
    <group position={at}>
      <group ref={pivot}>
        <mesh position={[0, length / 2, 0]} material={ribbon}>
          <cylinderGeometry args={[0.004, 0.004, length, 4, 1, true]} />
        </mesh>
        <mesh position={[0, length + 0.01, 0]} material={knot}>
          <coneGeometry args={[0.03, 0.05, 10]} />
        </mesh>
        <mesh
          position={[0, length + (heart ? 0.25 : 0.27), 0]}
          scale={heart ? [0.24, 0.24, 0.17] : [0.19, 0.23, 0.19]}
          geometry={heartGeo ?? undefined}
          material={latex}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 8) return;
            push(1.2, e);
            sound.chime(pitch, 0.04);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (!hoverFx) return;
            push(0.3, e);
            sound.hover(`balloon-${pitch}`);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            sound.hoverEnd(`balloon-${pitch}`);
            document.body.style.cursor = '';
          }}
        >
          {!heart && <sphereGeometry args={[1, 32, 24]} />}
        </mesh>
      </group>
    </group>
  );
}

/* ── smoke curling up from blown-out candles ──────────────────────────────── */
const smokeVertex = /* glsl */ `
  uniform float uTime;
  uniform float uBlown;      // seconds since the candles were blown out (large = never)
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vA;
  void main() {
    float life = fract(aSeed * 3.7);
    float t = uBlown - life * 0.8;
    float rise = clamp(t, 0.0, 3.0);
    vec3 p = position + vec3(sin(rise * 2.2 + aSeed * 20.0) * 0.05 * rise, rise * 0.35, cos(rise * 1.7 + aSeed * 9.0) * 0.04 * rise);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (4.0 + rise * 10.0) * uPixelRatio * (6.0 / -mv.z);
    vA = step(0.0, t) * (1.0 - smoothstep(0.4, 3.0, rise)) * 0.35;
  }
`;
const smokeFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(0.75, 0.72, 0.74), smoothstep(0.5, 0.0, d) * vA);
  }
`;

/** A birthday cake on a little round table. Touch it: the candles are blown out, then relit. */
function Cake({ at, motion, secretFound, onSecret }: { at: [number, number, number]; motion: number; secretFound: boolean; onSecret: () => void }) {
  const TABLE_H = 0.72;
  const wood = useMemo(() => new THREE.MeshBasicMaterial({ color: '#2c170d' }), []);
  const cloth = useShader(
    waxVertex,
    /* glsl */ `
      varying float vY;
      varying vec3 vN;
      void main() {
        // an ivory tablecloth, warmer where the candlelight falls from above
        vec3 c = mix(vec3(0.34, 0.26, 0.24), vec3(0.78, 0.66, 0.58), 0.35 + 0.65 * vY);
        gl_FragColor = vec4(c * (0.7 + 0.3 * abs(vN.x)), 1.0);
      }
    `,
    useMemo(() => ({}), []),
    { opaque: true },
  );
  const sponge = useShader(
    waxVertex,
    /* glsl */ `
      varying float vY;
      varying vec3 vN;
      void main() {
        // pink buttercream, a darker berry drip round the top edge, lit from above
        vec3 cream = vec3(0.96, 0.66, 0.72);
        float drip = step(0.78, vY + 0.08 * sin(vN.x * 30.0 + vN.z * 21.0));
        vec3 c = mix(cream, vec3(0.62, 0.12, 0.25), drip);
        float lit = 0.55 + 0.45 * vY + 0.15 * abs(vN.z);
        gl_FragColor = vec4(c * lit, 1.0);
      }
    `,
    useMemo(() => ({}), []),
    { opaque: true },
  );
  const icing = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fbe6ea' }), []);
  const berry = useMemo(() => new THREE.MeshBasicMaterial({ color: '#b4122e' }), []);
  const stripe = useShader(
    waxVertex,
    /* glsl */ `
      varying float vY;
      void main() {
        // a twisted candy-stripe birthday candle
        float s = step(0.5, fract(vY * 5.0));
        gl_FragColor = vec4(mix(vec3(0.95, 0.9, 0.85), vec3(0.9, 0.35, 0.5), s), 1.0);
      }
    `,
    useMemo(() => ({}), []),
    { opaque: true },
  );
  useEffect(
    () => () => {
      wood.dispose();
      icing.dispose();
      berry.dispose();
    },
    [wood, icing, berry],
  );

  const top = TABLE_H + 0.02;
  const candleTops = useMemo(
    () => [-0.14, -0.05, 0.05, 0.14].map((x, i) => [x, top + 0.46 + 0.14, (i % 2 ? 0.05 : -0.04)] as [number, number, number]),
    [top],
  );
  const flames = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(candleTops.flatMap((p) => [p[0], p[1] + 0.03, p[2]]), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(candleTops.map((_, i) => 40 + i * 2.3), 1));
    return g;
  }, [candleTops]);
  const smoke = useMemo(() => {
    const n = 60;
    const pos: number[] = [];
    const seed: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = candleTops[i % candleTops.length];
      pos.push(c[0], c[1] + 0.04, c[2]);
      seed.push(Math.random());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    return g;
  }, [candleTops]);
  useEffect(
    () => () => {
      flames.dispose();
      smoke.dispose();
    },
    [flames, smoke],
  );
  const flameU = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uMotion: { value: 1 }, uLit: { value: 1 } }), []);
  const flameMat = useShader(flameVertex, flameFragment, flameU);
  const smokeU = useMemo(() => ({ uTime: { value: 0 }, uBlown: { value: 999 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } }), []);
  const smokeMat = useShader(smokeVertex, smokeFragment, smokeU, { additive: false });

  const blownAt = useRef<number | null>(null);
  const now = useRef(0);
  const letter = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    now.current = t;
    flameU.uTime.value = t;
    flameU.uMotion.value = motion;
    smokeU.uTime.value = t;
    const since = blownAt.current === null ? 999 : t - blownAt.current;
    smokeU.uBlown.value = since;
    // out in a breath; after a few seconds they catch again, one by one-ish
    flameU.uLit.value = since < 0.12 ? 1 - since / 0.12 : since < 4 ? 0 : Math.min(1, (since - 4) / 0.6);
    if (letter.current) (letter.current.material as THREE.MeshBasicMaterial).color.setScalar(0.75 + 0.25 * Math.sin(t * 2.2));
  });

  const blow = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    const since = blownAt.current === null ? 999 : now.current - blownAt.current;
    if (since < 5) return;
    blownAt.current = now.current;
    sound.blow();
    setTimeout(() => sound.flourish(), 450);
  };

  // outward from the room's centre, and along the wall — the secret hides beside the table
  const out = new THREE.Vector2(at[0], at[2]).normalize();
  const along = new THREE.Vector2(-out.y, out.x);

  return (
    <group position={at}>
      {/* the little round table with its cloth */}
      <mesh position={[0, TABLE_H / 2, 0]} material={wood}>
        <cylinderGeometry args={[0.05, 0.1, TABLE_H, 12]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} material={wood}>
        <cylinderGeometry args={[0.28, 0.32, 0.04, 24]} />
      </mesh>
      <mesh position={[0, TABLE_H - 0.1, 0]} material={cloth}>
        <cylinderGeometry args={[0.55, 0.62, 0.24, 40, 1, true]} />
      </mesh>
      <mesh position={[0, TABLE_H + 0.015, 0]} rotation-x={-Math.PI / 2} material={icing}>
        <circleGeometry args={[0.56, 40]} />
      </mesh>
      {/* the cake: two tiers, a cream rim, berries on top, candles */}
      <group onClick={blow} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <mesh position={[0, top + 0.13, 0]} material={sponge}>
          <cylinderGeometry args={[0.34, 0.35, 0.26, 40]} />
        </mesh>
        <mesh position={[0, top + 0.26, 0]} rotation-x={-Math.PI / 2} material={icing}>
          <circleGeometry args={[0.34, 40]} />
        </mesh>
        <mesh position={[0, top + 0.36, 0]} material={sponge}>
          <cylinderGeometry args={[0.22, 0.23, 0.2, 36]} />
        </mesh>
        <mesh position={[0, top + 0.46, 0]} rotation-x={-Math.PI / 2} material={icing}>
          <circleGeometry args={[0.22, 36]} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.sin(a) * 0.3, top + 0.28, Math.cos(a) * 0.3]} material={berry}>
              <sphereGeometry args={[0.03, 10, 8]} />
            </mesh>
          );
        })}
        {candleTops.map((p, i) => (
          <mesh key={i} position={[p[0], p[1] - 0.07, p[2]]} material={stripe}>
            <cylinderGeometry args={[0.012, 0.012, 0.14, 8]} />
          </mesh>
        ))}
        {/* a generous invisible target, so the whole cake answers a touch */}
        <mesh position={[0, top + 0.3, 0]}>
          <sphereGeometry args={[0.5, 10, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
      <points geometry={flames} material={flameMat} frustumCulled={false} />
      <points geometry={smoke} material={smokeMat} frustumCulled={false} />

      {/* the secret: a little glowing letter leaning against the table leg, on the far side */}
      <group position={[along.x * 0.45 + out.x * 0.3, 0.09, along.y * 0.45 + out.y * 0.3]} rotation={[-0.25, Math.atan2(along.x, along.y), 0.08]}>
        <mesh
          ref={letter}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 8) return;
            onSecret();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <planeGeometry args={[0.26, 0.17]} />
          <meshBasicMaterial color="#fff2e2" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <planeGeometry args={[0.05, 0.045]} />
          <meshBasicMaterial color="#b3223c" side={THREE.DoubleSide} />
        </mesh>
        {secretFound && (
          <Html center position={[0, 0.55, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
            <div className="room-secret">
              <p className="room-secret__title">{fill(birthdayConfig.room.secret.title)}</p>
              <p className="room-secret__text">{fill(birthdayConfig.room.secret.text)}</p>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

/** Bunting — little pennants spelling HAPPY BIRTHDAY, sagging across the wall. */
function Bunting({ floorY }: { floorY: number }) {
  const { geo, mat } = useMemo(() => {
    const word = 'HAPPY BIRTHDAY';
    const letters = [...word];
    const n = letters.length;
    // one strip of pennants on a canvas: each cell is a coloured triangle with its letter
    const cell = 128;
    const c = document.createElement('canvas');
    c.width = cell * n;
    c.height = cell;
    const g = c.getContext('2d')!;
    const colours = ['#e8a0b4', '#f4e2cf', '#d9b36a', '#c95f7e'];
    letters.forEach((ch, i) => {
      if (ch === ' ') return;
      const x = i * cell;
      g.fillStyle = colours[i % colours.length];
      g.beginPath();
      g.moveTo(x + 8, 4);
      g.lineTo(x + cell - 8, 4);
      g.lineTo(x + cell / 2, cell - 6);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(74, 22, 34, 0.85)';
      g.font = `600 ${cell * 0.42}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, x + cell / 2, cell * 0.36);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    const pos: number[] = [];
    const uv: number[] = [];
    const r = WALL_R - 0.15;
    const span = 1.15; // radians either side of the window
    const w = (2 * span) / n;
    const sag = (a: number) => floorY + 1.95 - Math.cos((a / span) * (Math.PI / 2)) * 0.3;
    letters.forEach((_, i) => {
      const a0 = -span + i * w + w * 0.08;
      const a1 = -span + (i + 1) * w - w * 0.08;
      const y0 = sag(a0);
      const y1 = sag(a1);
      const h = 0.42;
      const p = (a: number, y: number) => [Math.sin(a) * r, y, -Math.cos(a) * r];
      const [tl, tr, br, bl] = [p(a0, y0), p(a1, y1), p(a1, y1 - h), p(a0, y0 - h)];
      pos.push(...tl, ...bl, ...tr, ...tr, ...bl, ...br);
      const u0 = i / n;
      const u1 = (i + 1) / n;
      uv.push(u0, 1, u0, 0, u1, 1, u1, 1, u0, 0, u1, 0);
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // dimmed to the room's light: they sit in the glow of the fairy lights, not a spotlight
    const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, color: '#8c7676' });
    return { geo: geom, mat: material };
  }, [floorY]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.map?.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} />;
}

/** A garland of fairy lights sagging between hooks along the wall. */
function Garland({ floorY }: { floorY: number }) {
  const geo = useMemo(() => {
    const hooks = 9;
    const per = 16;
    const pts: number[] = [];
    const seed: number[] = [];
    const color: number[] = [];
    const size: number[] = [];
    const palette = ['#ffd9a0', '#ffb070', '#fff2d8', '#ff9fb5'].map((c) => new THREE.Color(c));
    const r = WALL_R - 0.08;
    // along the back two thirds of the wall
    const a0 = -2.1;
    const a1 = 2.1;
    for (let hk = 0; hk < hooks; hk++) {
      for (let k = 0; k < per; k++) {
        const u = k / per;
        const a = a0 + ((hk + u) / hooks) * (a1 - a0);
        const sag = Math.sin(u * Math.PI) * 0.32;
        const y = floorY + 3.55 - sag;
        pts.push(Math.sin(a) * r, y, -Math.cos(a) * r);
        seed.push(Math.random());
        const c = palette[(hk * per + k) % palette.length];
        color.push(c.r, c.g, c.b);
        size.push(2.4 + Math.random() * 0.8);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    return g;
  }, [floorY]);
  useEffect(() => () => geo.dispose(), [geo]);
  const u = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uMotion: { value: 1 } }), []);
  const mat = useShader(twinkleVertex, twinkleFragment, u);
  useFrame((state) => {
    u.uTime.value = state.clock.elapsedTime;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

interface Props {
  floorY: number;
  rx: number;
  rz: number;
  /** 0..1 how awake the heart is (its pink breath on the floor). */
  heart: number;
  reducedMotion: boolean;
  hoverFx: boolean;
  portrait: boolean;
}

export function RoomSet({ floorY, rx, rz, heart, reducedMotion, hoverFx, portrait }: Props) {
  const motion = reducedMotion ? 0.15 : 1;
  const candles = useMemo(() => placeCandles(rx, rz), [rx, rz]);
  const candleVec = useMemo(() => {
    const arr = Array.from({ length: MAX_CANDLES }, () => new THREE.Vector4());
    candles.forEach((c, i) => arr[i].set(c.x, c.z, c.seed, c.h));
    return arr;
  }, [candles]);

  const floorU = useMemo(
    () => ({
      uTime: { value: 0 },
      uCandles: { value: candleVec },
      uCount: { value: candles.length },
      uRug: { value: new THREE.Vector2(rx + 0.95, rz + 0.95) },
      uHeart: { value: heart },
      uMotion: { value: motion },
    }),
    [candleVec, candles.length, rx, rz], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const wallU = useMemo(
    () => ({ uTime: { value: 0 }, uCandles: { value: candleVec }, uCount: { value: candles.length }, uFloorY: { value: floorY }, uMotion: { value: motion } }),
    [candleVec, candles.length, floorY], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const floorMat = useShader(floorVertex, floorFragment, floorU, { opaque: true });
  const wallMat = useShader(wallVertex, wallFragment, wallU, { side: THREE.BackSide, opaque: true });
  const waxMat = useShader(waxVertex, waxFragment, useMemo(() => ({}), []), { opaque: true });

  const flames = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(candles.flatMap((c) => [c.x, floorY + c.h + 0.06, c.z]), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(candles.map((c) => c.seed), 1));
    return g;
  }, [candles, floorY]);
  useEffect(() => () => flames.dispose(), [flames]);
  const flameU = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uMotion: { value: 1 }, uLit: { value: 1 } }), []);
  const flameMat = useShader(flameVertex, flameFragment, flameU);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    floorU.uTime.value = t;
    wallU.uTime.value = t;
    flameU.uTime.value = t;
    floorU.uMotion.value = wallU.uMotion.value = flameU.uMotion.value = motion;
    floorU.uHeart.value += (heart - floorU.uHeart.value) * 0.05;
  });

  // balloons: round and heart-shaped, tied down toward the back and sides, at different heights
  const balloons = useMemo(
    () =>
      [1.5, 2.25, 2.85, 3.5, 4.1, 4.75].map((a, i) => ({
        at: [Math.sin(a) * (WALL_R - 1.4 - (i % 2) * 0.5), floorY, Math.cos(a) * (WALL_R - 1.4 - (i % 2) * 0.5)] as [number, number, number],
        length: 1.6 + ((i * 7) % 3) * 0.3,
        color: ['#f4a6b8', '#e8c07a', '#d9476a', '#fbe7ea', '#c9859e', '#e46b86'][i],
        heart: i % 3 === 1,
        pitch: [2, 4, 5, 3, 6, 1][i],
      })),
    [rx, rz, floorY],
  );

  const [secretFound, setSecretFound] = useState(false);
  const findSecret = () => {
    if (!secretFound) sound.flourish();
    setSecretFound(true);
  };

  const cakeAt: [number, number, number] = portrait ? [-1.35, floorY, -4.6] : [-4.6, floorY, -4.4];

  // The room's own shaders (floor, wall, wax, flames, cake, balloons…) are compiled in the
  // background first — the dark veil still covers the scene — and only then shown, so
  // stepping into the room never stalls on a dozen shader compilations at once.
  const root = useRef<THREE.Group>(null);
  const gl = useThree((st) => st.gl);
  const camera = useThree((st) => st.camera);
  const scene = useThree((st) => st.scene);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    let alive = true;
    const show = () => alive && setReady(true);
    g.visible = true;
    gl.compileAsync(g, camera, scene).then(show, show);
    g.visible = false;
    const fallback = setTimeout(show, 1500);
    return () => {
      alive = false;
      clearTimeout(fallback);
    };
  }, [gl, camera, scene]);

  return (
    <group ref={root} visible={ready}>
      <mesh rotation-x={-Math.PI / 2} position-y={floorY - 0.002} material={floorMat} renderOrder={-4}>
        <circleGeometry args={[WALL_R, 96]} />
      </mesh>
      <mesh position-y={floorY + WALL_H / 2} material={wallMat} renderOrder={-5}>
        <cylinderGeometry args={[WALL_R, WALL_R, WALL_H, 96, 1, true]} />
      </mesh>
      {candles.map((c, i) => (
        <mesh key={i} position={[c.x, floorY + c.h / 2, c.z]} material={waxMat}>
          <cylinderGeometry args={[c.r, c.r * 1.04, c.h, 18]} />
        </mesh>
      ))}
      <points geometry={flames} material={flameMat} frustumCulled={false} />
      <Garland floorY={floorY} />
      <Bunting floorY={floorY} />
      <Cake at={cakeAt} motion={motion} secretFound={secretFound} onSecret={findSecret} />
      {balloons.map((b, i) => (
        <Balloon key={i} {...b} motion={motion} hoverFx={hoverFx} />
      ))}
    </group>
  );
}
