import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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
  return (
    <mesh geometry={geo} position={[0, 3.4, -0.6]} renderOrder={-1}>
      <shaderMaterial
        vertexShader={beamVertex}
        fragmentShader={beamFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export function Atmosphere({ mood, bokeh = 14, reducedMotion }: { mood: Mood; bokeh?: number; reducedMotion: boolean }) {
  const beam = mood === 'intro' ? 0.1 : mood === 'room' ? 0.06 : 0.12;
  return (
    <>
      <Bokeh count={bokeh} reducedMotion={reducedMotion} />
      <Beam opacity={beam} />
    </>
  );
}
