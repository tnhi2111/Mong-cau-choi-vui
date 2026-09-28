import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { sampleHeartPoints } from './heartShape';

/**
 * The heart as a cloud of light: thousands of glowing points filling the same
 * 3D heart as the solid version (dense just under the surface, sparse inside),
 * so it keeps its volume from any angle while looking made of light.
 *
 * Driven from outside (Heart3D) through `ParticleHeartHandle`:
 *  • beat   0..1 — points spring outward and flare on each heartbeat
 *  • glow   0..1 — overall brightness (charge, hover)
 *  • hover  a local-space point + strength: nearby points part and brighten
 */
export interface ParticleHeartHandle {
  set(beat: number, glow: number, hoverPos: THREE.Vector3 | null, hover: number): void;
}

const PALETTE = ['#ff2e74', '#ff4a8c', '#ff6fa3', '#ff95bd', '#ffc2da', '#fff0f6'];

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  uniform float uGlow;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform vec3 uHoverPos;
  uniform float uHover;
  attribute float aSeed;
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;

  void main() {
    vec3 p = position;
    float t = uTime;
    // every point shimmers on its own tiny orbit — the heart feels alive, not static
    p += vec3(sin(t * 1.3 + aSeed * 40.0), cos(t * 1.1 + aSeed * 23.0), sin(t * 0.9 + aSeed * 11.0)) * 0.012 * uMotion;
    // heartbeat: spring outward, outer points a little more, with per-point variation
    p *= 1.0 + uBeat * (0.05 + 0.09 * aSeed);
    // her finger / cursor parts the light
    vec3 d = p - uHoverPos;
    float near = uHover * exp(-dot(d, d) * 16.0);
    p += normalize(d + 1e-4) * near * 0.09;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (10.5 / -mv.z) * (1.0 + uBeat * 0.5 + near * 1.2);

    float twinkle = 0.65 + 0.35 * sin(t * (1.2 + aSeed * 2.5) + aSeed * 60.0);
    vAlpha = twinkle * (0.8 + 0.5 * uGlow);
    vHot = clamp(near * 1.4 + uBeat * 0.6, 0.0, 1.0);
    vColor = aColor;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // a bright core with a soft halo — reads as light, not as dots
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.55;
    float a = (core + halo) * vAlpha;
    vec3 col = mix(vColor, vec3(1.0, 0.95, 0.97), core * 0.35 + vHot * 0.5);
    gl_FragColor = vec4(col, a);
  }
`;

export const ParticleHeart = forwardRef<ParticleHeartHandle, { count: number; reducedMotion: boolean }>(function ParticleHeart(
  { count, reducedMotion },
  ref,
) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = sampleHeartPoints(count);
    const seed = new Float32Array(count);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      seed[i] = Math.random();
      // mostly fine dust, a few larger "petals" of light
      size[i] = 1.1 + Math.pow(Math.random(), 3) * 3.4;
      // brighter, paler points toward the surface and the top of the lobes
      const y = pos[i * 3 + 1];
      const lift = THREE.MathUtils.clamp((y + 0.6) / 1.2, 0, 1);
      const idx = Math.min(PALETTE.length - 1, Math.floor(Math.pow(Math.random(), 1.6 - lift * 0.6) * PALETTE.length));
      c.set(PALETTE[idx]);
      color.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uGlow: { value: 0.5 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: reducedMotion ? 0.2 : 1 },
      uHoverPos: { value: new THREE.Vector3(0, 0, 9) },
      uHover: { value: 0 },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    uniforms.uMotion.value = reducedMotion ? 0.2 : 1;
  }, [reducedMotion, uniforms]);

  useImperativeHandle(
    ref,
    () => ({
      set(beat, glow, hoverPos, hover) {
        uniforms.uBeat.value = beat;
        uniforms.uGlow.value = glow;
        if (hoverPos) uniforms.uHoverPos.value.copy(hoverPos);
        uniforms.uHover.value = hover;
      },
    }),
    [uniforms],
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
  });

  const heartMat = useShader(vertex, fragment, uniforms);
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={1} material={heartMat} />
  );
});
