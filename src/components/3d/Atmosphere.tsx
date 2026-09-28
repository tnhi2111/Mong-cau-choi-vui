import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { getGlowTexture } from './glowTexture';
import type { Mood } from './Lights';

/*
 * Depth without a "world": distant out-of-focus lights on a shell around the
 * scene (they parallax naturally as the camera moves), and a soft beam of light
 * falling on the heart, as if through dusty air.
 */

const BOKEH = ['#ff9fb4', '#ffc9a8', '#fff0ea', '#e98aa5', '#ffd6de'];

function Bokeh({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // a wide ring all around (the room can be orbited), a little above/below;
        // the first half sits behind the heart where the intro camera looks
        const a = i < count / 2 ? Math.PI + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 8; // far beyond any camera position, so they never loom
        return {
          pos: new THREE.Vector3(Math.sin(a) * r, (Math.random() - 0.35) * 12, Math.cos(a) * r),
          size: 1.8 + Math.pow(Math.random(), 2) * 4,
          opacity: 0.05 + Math.random() * 0.1,
          color: BOKEH[i % BOKEH.length],
          phase: Math.random() * Math.PI * 2,
        };
      }),
    [count],
  );

  useFrame((state) => {
    const g = group.current;
    if (!g || reducedMotion) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((c, i) => {
      const it = items[i];
      c.position.set(it.pos.x + Math.sin(t * 0.05 + it.phase) * 0.6, it.pos.y + Math.cos(t * 0.07 + it.phase) * 0.4, it.pos.z);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = it.opacity * (0.75 + 0.25 * Math.sin(t * 0.3 + it.phase));
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <sprite key={i} position={it.pos} scale={[it.size, it.size, 1]} renderOrder={-2}>
          <spriteMaterial map={getGlowTexture()} color={it.color} transparent opacity={it.opacity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
        </sprite>
      ))}
    </group>
  );
}

const beamVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  varying float vH;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vH = uv.y;
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFragment = /* glsl */ `
  uniform float uOpacity;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vN;
  varying vec3 vView;
  varying float vH;
  void main() {
    // brightest through the middle of the cone, fading to nothing at its edges
    float core = pow(abs(dot(vN, vView)), 2.2);
    float fall = smoothstep(0.0, 0.55, vH) * smoothstep(1.0, 0.8, vH);
    float drift = 0.85 + 0.15 * sin(vH * 9.0 - uTime * 0.35);
    gl_FragColor = vec4(uColor, core * fall * drift * uOpacity);
  }
`;

function Beam({ opacity }: { opacity: number }) {
  const uniforms = useMemo(
    () => ({ uOpacity: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffd3dc') } }),
    [],
  );
  const geo = useMemo(() => new THREE.CylinderGeometry(0.35, 2.1, 9, 48, 1, true), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uOpacity.value += (opacity - uniforms.uOpacity.value) * (1 - Math.exp(-Math.min(dt, 0.05) * 1.5));
  });
  const beamMat = useShader(beamVertex, beamFragment, uniforms, { side: THREE.DoubleSide });
  return (
    <mesh geometry={geo} position={[0, 3.4, -0.6]} renderOrder={-1} material={beamMat} />
  );
}

const starVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.8 + aSeed * aSeed * 1.8) * uPixelRatio;
    vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.4 + aSeed * 1.6) + aSeed * 90.0));
  }
`;
const starFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0, 0.94, 0.97), smoothstep(0.5, 0.0, d) * vA * 0.9);
  }
`;

/** A far, crisp night sky — tiny twinkling stars all around. */
function Stars({ count }: { count: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(34 + Math.random() * 10);
      pos.set([v.x, v.y, v.z], i * 3);
      seed[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  useEffect(() => () => geo.dispose(), [geo]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } }), []);
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
  });
  const starMat = useShader(starVertex, starFragment, uniforms);
  return (
    <points geometry={geo} frustumCulled={false} renderOrder={-3} material={starMat} />
  );
}

const streakFragment = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    // bright head on the right, a long fading tail to the left
    float tail = pow(vUv.x, 2.2);
    float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.96), tail * across * across * uAlpha);
  }
`;
const streakVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/** Now and then, a single shooting star crosses the far sky. Rare on purpose. */
function ShootingStar() {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({ uAlpha: { value: 0 } }), []);
  const run = useRef({ start: 4 + Math.random() * 4, from: new THREE.Vector3(), dir: new THREE.Vector3() });
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const r = run.current;
    const life = 1.1;
    let k = (t - r.start) / life;
    if (k > 1) {
      // next one in 8–16 s, somewhere in the upper sky in front of the camera
      r.start = t + 8 + Math.random() * 8;
      const cam = state.camera;
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      const side = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
      r.from.copy(cam.position).addScaledVector(fwd, 30).addScaledVector(side, -6 - Math.random() * 6).add(new THREE.Vector3(0, 7 + Math.random() * 5, 0));
      r.dir.copy(side).multiplyScalar(1).add(new THREE.Vector3(0, -0.35, 0)).normalize();
      m.quaternion.copy(cam.quaternion);
      m.rotateZ(-0.33);
      k = -1;
    }
    m.visible = k >= 0;
    if (k < 0) return;
    m.position.copy(r.from).addScaledVector(r.dir, k * 16);
    uniforms.uAlpha.value = Math.sin(Math.PI * k) * 0.8;
  });
  const streakMat = useShader(streakVertex, streakFragment, uniforms);
  return (
    <mesh ref={mesh} visible={false} renderOrder={-2} material={streakMat}>
      <planeGeometry args={[3.2, 0.05]} />
    </mesh>
  );
}

export function Atmosphere({
  mood,
  bokeh = 14,
  stars = 700,
  reducedMotion,
}: {
  mood: Mood;
  bokeh?: number;
  stars?: number;
  reducedMotion: boolean;
}) {
  const beam = mood === 'intro' ? 0.1 : mood === 'room' ? 0.06 : 0.12;
  return (
    <>
      <Stars count={stars} />
      {!reducedMotion && mood !== 'room' && <ShootingStar />}
      <Bokeh count={bokeh} reducedMotion={reducedMotion} />
      <Beam opacity={beam} />
    </>
  );
}
