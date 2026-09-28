import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FinalePhase } from '../../types';
import { getHeartGeometry, randomPointInHeart, heartCurvePoint } from './heartShape';
import { Heart3D } from './Heart3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';
import { Glow } from './Glow';

interface Props {
  phase: FinalePhase;
  photos: string[];
  onFormed: () => void;
  reducedMotion: boolean;
  glass: boolean;
  particleFactor: number;
  portrait: boolean;
}

const HEART_SCALE = 1.7;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Timeline (seconds). Reduced motion compresses everything. */
function timing(reduced: boolean) {
  return reduced
    ? { drift: 0.2, gather: 1.2, formed: 1.6 }
    : { drift: 1.6, gather: 3.6, formed: 5.6 };
}

/** The little hearts of the finale (exported so the shader can be compiled ahead of time). */
export function createSwarmMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color('#6d1f33'),
    emissiveIntensity: 0.4,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffd6de'),
  });
}

/* ── Many small hearts flying in and assembling into one big heart ───────── */
function HeartSwarm({ count, clock, t }: { count: number; clock: { current: number }; t: ReturnType<typeof timing> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const done = useRef(false);
  const geo = useMemo(() => getHeartGeometry('low'), []);
  const material = useMemo(createSwarmMaterial, []);
  useEffect(() => () => material.dispose(), [material]);
  const data = useMemo(() => {
    const start: THREE.Vector3[] = [];
    const end: THREE.Vector3[] = [];
    const delay = new Float32Array(count);
    const size = new Float32Array(count);
    const spin = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      start.push(new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 7));
      end.push(randomPointInHeart(new THREE.Vector3(), 0.82).multiplyScalar(HEART_SCALE));
      delay[i] = Math.random() * 0.4;
      size[i] = 0.05 + Math.pow(Math.random(), 2) * 0.07;
      spin[i] = (Math.random() - 0.5) * 8;
    }
    return { start, end, delay, size, spin };
  }, [count]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const palette = ['#f1d3d6', '#d49aa5', '#f7efe7', '#e7b3bd', '#fff4f1'].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) m.setColorAt(i, palette[i % palette.length]);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m || done.current) return;
    const T = clock.current;
    const span = t.gather;
    let finished = true;
    for (let i = 0; i < count; i++) {
      const local = THREE.MathUtils.clamp((T - t.drift - data.delay[i] * span * 0.5) / span, 0, 1);
      if (local < 1) finished = false;
      const e = easeInOut(local);
      p.copy(data.start[i]).lerp(data.end[i], e);
      // spiral in: rotate the path around Y, unwinding as it arrives
      const ang = (1 - e) * 1.6;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      dummy.position.set(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
      dummy.rotation.set(0, (1 - e) * data.spin[i], (1 - e) * data.spin[i] * 0.5);
      const appear = THREE.MathUtils.smoothstep(T, 0, 0.8);
      dummy.scale.setScalar(data.size[i] * appear * (0.6 + e * 0.4));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (finished) done.current = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geo, material, count]} frustumCulled={false} />
  );
}

/* ── Glowing dust tracing the heart outline ─────────────────────────────── */
const dustVertex = /* glsl */ `
  uniform float uT;
  uniform float uDrift;
  uniform float uSpan;
  uniform float uPixelRatio;
  uniform float uGlow;
  attribute vec3 aStart;
  attribute float aDelay;
  attribute float aSeed;
  varying float vA;
  void main() {
    float local = clamp((uT - uDrift - aDelay * uSpan * 0.6) / uSpan, 0.0, 1.0);
    float e = local < 0.5 ? 4.0 * local * local * local : 1.0 - pow(-2.0 * local + 2.0, 3.0) / 2.0;
    vec3 p = mix(aStart, position, e);
    p += vec3(sin(uT * 0.8 + aSeed * 30.0), cos(uT * 0.7 + aSeed * 20.0), 0.0) * 0.03 * e;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.6 + 0.4 * sin(uT * 2.0 + aSeed * 50.0);
    gl_PointSize = (2.0 + aSeed * 3.0) * uPixelRatio * (9.0 / -mv.z) * (1.0 + uGlow * 0.6);
    vA = tw * smoothstep(0.0, 0.6, uT) * (0.5 + 0.5 * e);
  }
`;
const dustFragment = /* glsl */ `
  uniform float uGlow;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(vec3(1.0, 0.8, 0.85), vec3(1.0, 0.97, 0.95), 0.5), a * a * vA * (0.8 + uGlow));
  }
`;

function HeartDust({ count, clock, t, glow }: { count: number; clock: { current: number }; t: ReturnType<typeof timing>; glow: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const start = new Float32Array(count * 3);
    const delay = new Float32Array(count);
    const seed = new Float32Array(count);
    const v2 = new THREE.Vector2();
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      heartCurvePoint(Math.random() * Math.PI * 2, v2);
      const jitter = 1 + (Math.random() - 0.5) * 0.08;
      pos.set([v2.x * HEART_SCALE * 1.04 * jitter, v2.y * HEART_SCALE * 1.04 * jitter, (Math.random() - 0.5) * 0.3], i * 3);
      v.randomDirection().multiplyScalar(5 + Math.random() * 9);
      start.set([v.x, v.y, v.z], i * 3);
      delay[i] = Math.random();
      seed[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uT: { value: 0 },
      uDrift: { value: t.drift },
      uSpan: { value: t.gather },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uGlow: { value: 0 },
    }),
    [t],
  );

  useFrame((_, dt) => {
    uniforms.uT.value = clock.current;
    uniforms.uGlow.value += (glow - uniforms.uGlow.value) * Math.min(1, dt * 2);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={dustVertex}
        fragmentShader={dustFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── Memory photos drifting in and dissolving into the heart ───────────── */
function MemoryFragments({
  urls,
  clock,
  t,
  ringX,
  ringY,
}: {
  urls: string[];
  clock: { current: number };
  t: ReturnType<typeof timing>;
  ringX: number;
  ringY: number;
}) {
  const [textures, setTextures] = useState<THREE.Texture[]>([]);
  const refs = useRef<(THREE.Group | null)[]>([]);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    const loaded: THREE.Texture[] = [];
    Promise.all(
      urls.map(
        (u) =>
          new Promise<THREE.Texture | null>((res) =>
            loader.load(
              u,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                loaded.push(tex);
                res(tex);
              },
              undefined,
              () => res(null),
            ),
          ),
      ),
    ).then((all) => {
      if (alive) setTextures(all.filter((x): x is THREE.Texture => !!x));
    });
    return () => {
      alive = false;
      loaded.forEach((x) => x.dispose());
    };
  }, [urls]);

  const starts = useMemo(
    () =>
      textures.map((_, i) => {
        const a = (i / Math.max(1, textures.length)) * Math.PI * 2 + 0.4;
        return new THREE.Vector3(Math.cos(a) * ringX, Math.sin(a) * ringY, (i % 2) * 0.5 - 0.2);
      }),
    [textures, ringX, ringY],
  );

  useFrame(() => {
    const T = clock.current;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const appear = THREE.MathUtils.smoothstep(T, 0.2 + i * 0.15, 1.2 + i * 0.15);
      const local = THREE.MathUtils.clamp((T - t.drift - 0.2 - i * 0.12) / (t.gather * 0.75), 0, 1);
      const e = easeInOut(local);
      m.position.copy(starts[i]).multiplyScalar(1 - e);
      m.position.y += Math.sin(T * 0.8 + i) * 0.06 * (1 - e);
      m.rotation.z = Math.sin(i * 1.3) * 0.18 * (1 - e) + e * 1.2;
      m.scale.setScalar(Math.max(0.0001, 1 - e * 0.9));
      const o = appear * (1 - THREE.MathUtils.smoothstep(e, 0.55, 0.95));
      m.children.forEach((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = o);
      m.visible = o > 0.01;
    });
  });

  return (
    <>
      {textures.map((tex, i) => {
        const img = tex.image as { width: number; height: number };
        const aspect = img && img.height ? img.width / img.height : 0.8;
        const h = 0.78;
        const w = h * aspect;
        return (
          <group key={i} ref={(el) => void (refs.current[i] = el)} position={starts[i]} visible={false}>
            {/* polaroid frame */}
            <mesh position={[0, -0.05, -0.002]}>
              <planeGeometry args={[w + 0.1, h + 0.22]} />
              <meshBasicMaterial color="#f7efe7" transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial map={tex} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** Stage 5: the finale. */
export function FinalWorld({ phase, photos, onFormed, reducedMotion, glass, particleFactor, portrait }: Props) {
  const clock = useRef(0);
  const formed = useRef(false);
  const [burst, setBurst] = useState(0);
  const group = useRef<THREE.Group>(null);
  const coreGroup = useRef<THREE.Group>(null);
  const coreGlow = useRef<THREE.Sprite>(null);
  const t = useMemo(() => timing(reducedMotion), [reducedMotion]);
  const [isFormed, setIsFormed] = useState(false);

  useFrame((state, dt) => {
    // real time, but ignore huge gaps (tab in background). If the page already
    // moved on (very slow device → safety timeout), hurry the formation along.
    const hurry = phase !== 'gather' && !formed.current ? 4 : 1;
    clock.current += Math.min(dt, 0.12) * hurry;
    const T = clock.current;
    if (!formed.current && T >= t.formed) {
      formed.current = true;
      setIsFormed(true);
      setBurst((b) => b + 1);
      onFormed();
    }
    if (group.current) {
      const target = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.25) * 0.35;
      group.current.rotation.y += (target - group.current.rotation.y) * Math.min(1, dt * 0.8);
    }
    if (coreGroup.current) {
      const s = THREE.MathUtils.smoothstep(T, t.drift + t.gather * 0.6, t.formed + 0.3);
      coreGroup.current.scale.setScalar(Math.max(0.0001, s));
    }
    if (coreGlow.current) {
      const m = coreGlow.current.material as THREE.SpriteMaterial;
      const flash = formed.current ? Math.max(0, 1 - (T - t.formed) * 0.8) : 0;
      const base = THREE.MathUtils.smoothstep(T, t.drift, t.formed) * 0.28 + (phase === 'secret' ? 0.12 : 0);
      m.opacity = base + flash * 0.5;
      coreGlow.current.scale.setScalar(6 + flash * 4 + (phase === 'secret' ? 1.5 : 0));
    }
  });

  // Frame the heart in the upper part of the screen, leaving the lower part for words.
  const frame = portrait
    ? { gather: 12, formed: 11.2, secret: 12.4, look: -1.05, lookSecret: -1.5, heartY: 0.55 }
    : { gather: 8.6, formed: 9.6, secret: 10.6, look: -0.62, lookSecret: -0.95, heartY: 0.42 };
  const camZ = !isFormed ? frame.gather : phase === 'secret' ? frame.secret : frame.formed;
  const lookY = phase === 'secret' ? frame.lookSecret : frame.look;

  return (
    <>
      <CameraRig
        position={[0, lookY, camZ]}
        lookAt={[0, lookY, 0]}
        parallax={reducedMotion ? 0 : 0.35}
        speed={isFormed ? 0.45 : 0.6}
      />
      <group ref={group} position={[0, frame.heartY, 0]}>
        <Glow ref={coreGlow} color="#ffc4cf" size={7} opacity={0} />
        <HeartSwarm count={Math.max(160, Math.round(520 * particleFactor))} clock={clock} t={t} />
        <HeartDust count={Math.max(500, Math.round(2200 * particleFactor))} clock={clock} t={t} glow={phase === 'secret' ? 1 : isFormed ? 0.5 : 0} />
        <group ref={coreGroup} scale={0.0001}>
          <Heart3D
            pulseKey={burst + (phase === 'secret' ? 1 : 0)}
            charge={phase === 'secret' ? 0.8 : 0.5}
            reducedMotion={reducedMotion}
            glass={glass}
            scale={0.95}
            halo={1.3}
            innerLight={0.35}
          />
        </group>
        <MemoryFragments urls={photos} clock={clock} t={t} ringX={portrait ? 1.3 : 2.9} ringY={portrait ? 2.0 : 1.3} />
      </group>
      <ParticleField
        count={Math.round(800 * particleFactor)}
        radius={14}
        innerRadius={4}
        burstKey={burst + (phase === 'secret' ? 1 : 0)}
        intensity={isFormed ? 0.9 : 0.5}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
