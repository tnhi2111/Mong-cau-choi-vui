import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { buildDog, occluders, SHOULDER, TAIL_BASE } from './dogModel';

/*
 * A little golden retriever puppy made of light, sitting beside the heart and
 * waving one paw — a real 3D figure, so it turns with the world as she drags.
 * Its shape lives in dogModel.ts; this file brings it to life.
 *
 * Before the heart forms its points are faint dust across the sky; when the
 * heart gathers they light up and fly in, and a few more background points
 * light up where they are. Once formed: the paw waves, the tail wags, it breathes.
 */

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAwake;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform float uShown;
  attribute vec3 aStart;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aAnim;  // 0 still, 1 tail, 2 waving arm, 4 background point
  attribute float aSize;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;

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
    // a happy wag: the whole tail sweeps side to side from its root; further along it lags
    // behind and swings wider, so it bends like a whip; bursts of wagging, then easier
    if (aAnim > 0.5 && aAnim < 1.5) {
      float along = (aAnim - 1.0) / 0.49;
      float mood = 0.65 + 0.35 * sin(t * 0.45);
      float ph = t * 9.5 - along * 1.7;
      target = rotY(target, vec3(${TAIL_BASE.join(', ')}), sin(ph) * (0.3 + 0.45 * along) * mood * uMotion);
      target.y += sin(ph + 1.3) * 0.02 * along * uMotion;
    }
    // breathing
    target.y += sin(t * 1.7) * 0.006 * uMotion * (target.y + 0.42);
    target += vec3(sin(t * 0.9 + aSeed * 30.0), cos(t * 0.8 + aSeed * 17.0), sin(t * 0.7 + aSeed * 11.0)) * 0.003 * uMotion;

    float e = clamp((uAwake - aDelay * 0.5) / 0.5, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 drift = aStart + vec3(sin(t * 0.2 + aSeed * 9.0), cos(t * 0.17 + aSeed * 5.0), 0.0) * 0.15 * uMotion;
    vec3 p = aAnim > 3.5 ? drift : mix(drift, target, e);
    p.z += sin(e * 3.14159) * 0.4;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (12.0 / -mv.z) * mix(0.7, 1.0, e);

    float twinkle = 0.8 + 0.2 * sin(t * (1.1 + aSeed * 2.0) + aSeed * 40.0);
    float lit = aAnim > 3.5 ? 0.55 : 1.0;
    // faint dust while asleep, bright once awake
    vAlpha = twinkle * mix(0.1, lit, smoothstep(0.0, 0.3, uAwake)) * uShown * mix(0.6, 1.0, e);
    vColor = aAnim > 3.5 ? vec3(1.0, 0.9, 0.85) : aColor;
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.5;
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
    const dog = buildDog(Math.round(12000 * density));
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
  // side of the puppy is hidden — and the dark eyes, nose and pads read as dark.
  const occluder = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false }), []);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 24, 16), []);
  const flesh = useMemo(occluders, []);
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

  const mesh = (o: (typeof flesh)[number], i: number, origin: [number, number, number] = [0, 0, 0]) => (
    <mesh
      key={i}
      geometry={sphere}
      material={occluder}
      position={[o.position[0] - origin[0], o.position[1] - origin[1], o.position[2] - origin[2]]}
      scale={o.scale}
      rotation={o.rot ? new THREE.Euler(0, o.rot[0], o.rot[1], 'YZX') : undefined}
      renderOrder={-2}
    />
  );

  return (
    <group ref={group} position={position} rotation-y={facing} scale={scale}>
      <group ref={body} visible={false}>
        {flesh.filter((o) => o.group === 0).map((o, i) => mesh(o, i))}
        <group ref={arm} position={SHOULDER}>
          {flesh.filter((o) => o.group === 2).map((o, i) => mesh(o, i, SHOULDER))}
        </group>
      </group>
      <points geometry={points} material={material} frustumCulled={false} renderOrder={-1} />
    </group>
  );
}
