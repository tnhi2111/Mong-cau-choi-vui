import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { fill } from '../../lib/text';

/*
 * Beneath the heart of light: a thin stream of light drips from its tip into a
 * slowly turning spiral disc, with words drifting around the ring — as if the
 * heart were quietly filling a small galaxy of the things you want to say.
 *
 * The disc is tilted toward the viewer so it reads as a surface, not a line.
 */

interface Props {
  /** Y of the heart's tip (holder space) — where the drip starts. */
  tipY: number;
  /** How far below the tip the disc floats. */
  drop?: number;
  radius?: number;
  words: readonly string[];
  /** 0..1 — fades the whole thing in/out (it belongs to the intro only). */
  visible: boolean;
  density: number;
  reducedMotion: boolean;
}

const DISC_COLORS = ['#ff4d8d', '#ff7aa8', '#ffa9c6', '#ffd3e2', '#fff0f5', '#ff9aa0'];

const discVertex = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aR;
  attribute float aA;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // inner rings turn faster — a gentle galaxy, not a spinning plate
    float a = aA + uTime * uMotion * (0.12 + 0.28 / (0.45 + aR));
    vec3 p = vec3(sin(a) * aR, sin(uTime * 0.8 + aSeed * 30.0) * 0.015, cos(a) * aR);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.3 + aSeed * 2.6) * uPixelRatio * (10.0 / -mv.z);
    float edge = smoothstep(0.15, 0.45, aR) * (1.0 - smoothstep(1.3, 1.45, aR));
    vAlpha = edge * uOpacity * (0.7 + 0.3 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 50.0));
    vColor = aColor;
  }
`;

const dripVertex = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform float uTop;
  uniform float uBottom;
  attribute float aSeed;
  attribute vec2 aJitter;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float ph = fract(uTime * (0.16 + aSeed * 0.1) * max(uMotion, 0.25) + aSeed * 7.0);
    float fall = ph * ph;
    // leaves the tip in a thin thread, loosening as it falls
    vec2 xz = aJitter * (0.02 + fall * 0.35);
    vec3 p = vec3(xz.x, mix(uTop, uBottom, fall), xz.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.6 + aSeed * 2.6) * uPixelRatio * (10.0 / -mv.z) * (1.0 - ph * 0.35);
    vAlpha = uOpacity * smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.75, 1.0, ph));
    vColor = aColor;
  }
`;

const pointFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.4;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.3), (core + halo) * vAlpha);
  }
`;

function usePointUniforms<E extends Record<string, { value: number }>>(reducedMotion: boolean, extra: E = {} as E) {
  return useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: reducedMotion ? 0.15 : 1 },
      ...extra,
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** A word drawn once on a canvas, in the handwriting font once it has loaded. */
async function wordTexture(text: string): Promise<{ tex: THREE.CanvasTexture; aspect: number }> {
  const font = '500 72px "Dancing Script", "Segoe Script", cursive';
  try {
    await document.fonts?.load(font, text);
  } catch {
    /* fall back to whatever is available */
  }
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 48;
  c.width = w;
  c.height = 128;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255, 110, 160, 0.95)';
  g.shadowBlur = 18;
  g.fillStyle = '#ffe3ee';
  g.fillText(text, w / 2, 66);
  g.shadowBlur = 0;
  g.fillStyle = '#fff6fa';
  g.fillText(text, w / 2, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / 128 };
}

function Words({ words, radius, opacity }: { words: readonly string[]; radius: number; opacity: { current: number } }) {
  const [items, setItems] = useState<{ tex: THREE.CanvasTexture; aspect: number }[]>([]);
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  useEffect(() => {
    let alive = true;
    const made: THREE.CanvasTexture[] = [];
    Promise.all(words.map((w) => wordTexture(fill(w)))).then((all) => {
      all.forEach((a) => made.push(a.tex));
      if (alive) setItems(all);
      else made.forEach((t) => t.dispose());
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, [words]);

  useFrame(() => {
    mats.current.forEach((m) => {
      if (m) m.opacity = opacity.current;
    });
  });

  const h = 0.26;
  return (
    <>
      {items.map((it, i) => {
        const a = (i / items.length) * Math.PI * 2;
        const r = radius * (0.78 + (i % 2) * 0.1);
        return (
          <group key={i} rotation-y={a}>
            {/* lying on the disc, reading along the ring, top toward the centre */}
            <mesh position={[0, 0.02, r]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[h * it.aspect, h]} />
              <meshBasicMaterial
                ref={(m) => void (mats.current[i] = m)}
                map={it.tex}
                transparent
                opacity={0}
                depthWrite={false}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

export function HeartVortex({ tipY, drop = 0.7, radius = 1.15, words, visible, density, reducedMotion }: Props) {
  const disc = useRef<THREE.Group>(null);
  const wordRing = useRef<THREE.Group>(null);
  const opacity = useRef(0);
  const discCount = Math.round(2600 * density);
  const dripCount = Math.round(260 * density);
  const bottom = tipY - drop;

  const discGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const r = new Float32Array(discCount);
    const a = new Float32Array(discCount);
    const seed = new Float32Array(discCount);
    const color = new Float32Array(discCount * 3);
    const c = new THREE.Color();
    for (let i = 0; i < discCount; i++) {
      // most of the light gathers in a ring where the words drift; a fainter swirl fills the middle
      const ring = Math.random() < 0.6;
      const rr = ring ? 1.05 + (Math.random() - 0.5) * 0.55 : 0.2 + Math.pow(Math.random(), 0.8) * 1.3;
      r[i] = rr;
      // many soft, overlapping spiral arms — a swirl, not a pinwheel
      const arm = (i % 6) * ((Math.PI * 2) / 6);
      a[i] = arm + Math.log(rr + 0.2) * 1.8 + (Math.random() - 0.5) * 1.6;
      seed[i] = Math.random();
      c.set(DISC_COLORS[(Math.random() * DISC_COLORS.length) | 0]);
      color.set([c.r, c.g, c.b], i * 3);
    }
    // positions are computed in the shader; three still needs a position attribute
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(discCount * 3), 3));
    g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
    g.setAttribute('aA', new THREE.BufferAttribute(a, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    return g;
  }, [discCount]);

  const dripGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(dripCount);
    const jitter = new Float32Array(dripCount * 2);
    const color = new Float32Array(dripCount * 3);
    const c = new THREE.Color();
    for (let i = 0; i < dripCount; i++) {
      seed[i] = Math.random();
      const ang = Math.random() * Math.PI * 2;
      const m = Math.sqrt(Math.random());
      jitter.set([Math.cos(ang) * m, Math.sin(ang) * m], i * 2);
      c.set(DISC_COLORS[(Math.random() * 4) | 0]);
      color.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dripCount * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    return g;
  }, [dripCount]);

  useEffect(
    () => () => {
      discGeo.dispose();
      dripGeo.dispose();
    },
    [discGeo, dripGeo],
  );

  const discU = usePointUniforms(reducedMotion);
  const dripU = usePointUniforms(reducedMotion, { uTop: { value: tipY + 0.05 }, uBottom: { value: bottom } });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    opacity.current += ((visible ? 1 : 0) - opacity.current) * (1 - Math.exp(-dt * 1.8));
    const motion = reducedMotion ? 0.15 : 1;
    for (const u of [discU, dripU]) {
      u.uTime.value = t;
      u.uOpacity.value = opacity.current;
      u.uMotion.value = motion;
    }
    dripU.uTop.value = tipY + 0.05;
    dripU.uBottom.value = bottom;
    if (wordRing.current) wordRing.current.rotation.y = t * 0.08 * motion;
    if (disc.current) disc.current.visible = opacity.current > 0.01;
  });

  const discMat = useShader(discVertex, pointFragment, discU);
  const dripMat = useShader(dripVertex, pointFragment, dripU);
  return (
    <group ref={disc}>
      <points geometry={dripGeo} frustumCulled={false} material={dripMat} />
      {/* tilted toward her so the disc reads as a surface */}
      <group position={[0, bottom, 0]} rotation-x={0.2} scale={radius / 1.6}>
        <points geometry={discGeo} frustumCulled={false} material={discMat} />
        <group ref={wordRing}>
          <Words words={words} radius={1.6} opacity={opacity} />
        </group>
      </group>
    </group>
  );
}
