import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getHeartGeometry } from './heartShape';
import { Glow } from './Glow';

interface Props {
  /** Increment to make the heart beat once, strongly. */
  pulseKey?: number;
  /** 0..1 how "awake" the heart is — drives inner light. */
  charge?: number;
  interactive?: boolean;
  onTap?: () => void;
  reducedMotion?: boolean;
  /** Glass-like refraction (costs an extra render pass → high tier only). */
  glass?: boolean;
  scale?: number;
  /** Extra halo size multiplier. */
  halo?: number;
  lowDetail?: boolean;
  /** Multiplier for the light glowing from inside the heart. */
  innerLight?: number;
}

const ROSE = new THREE.Color('#d9909d');
const DEEP = new THREE.Color('#6d1f33');

/** Idle heartbeat: two soft beats, then rest. */
function heartbeat(t: number): number {
  const c = t % 2.4;
  const b1 = Math.exp(-Math.pow((c - 0.15) * 11, 2));
  const b2 = Math.exp(-Math.pow((c - 0.45) * 11, 2)) * 0.6;
  return b1 + b2;
}

export function Heart3D({
  pulseKey = 0,
  charge = 0,
  interactive = false,
  onTap,
  reducedMotion = false,
  glass = false,
  scale = 1,
  halo = 1,
  lowDetail = false,
  innerLight = 1,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);
  const glow = useRef<THREE.Sprite>(null);
  const inner = useRef<THREE.PointLight>(null);
  const [hovered, setHovered] = useState(false);
  const pulse = useRef(0);
  const s = useRef(scale * 0.6);
  const geometry = useMemo(() => getHeartGeometry(lowDetail ? 'low' : 'high'), [lowDetail]);

  useEffect(() => {
    if (pulseKey > 0) pulse.current = 1;
  }, [pulseKey]);

  useEffect(() => {
    if (!interactive) return;
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, interactive]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const k = Math.min(1, dt * 6);

    pulse.current = Math.max(0, pulse.current - dt * 1.1);
    const p = pulse.current;
    // damped wobble: big squeeze then settle
    const pulseScale = reducedMotion ? p * 0.06 : Math.sin((1 - p) * Math.PI * 3) * p * 0.2 + p * 0.08;
    const beat = reducedMotion ? 0 : heartbeat(t) * (0.025 + charge * 0.03);
    const target = scale * (1 + beat + pulseScale + (hovered && interactive ? 0.06 : 0));
    s.current += (target - s.current) * Math.min(1, dt * 9);
    g.scale.setScalar(s.current);

    // look toward the pointer — tiny, never dizzy
    const motion = reducedMotion ? 0.15 : 1;
    const ry = Math.sin(t * 0.35) * 0.35 * motion + state.pointer.x * 0.45 * motion + p * 0.6 * motion;
    const rx = -state.pointer.y * 0.22 * motion + Math.sin(t * 0.5) * 0.04 * motion;
    g.rotation.y += (ry - g.rotation.y) * k * 0.5;
    g.rotation.x += (rx - g.rotation.x) * k * 0.5;
    g.position.y = reducedMotion ? 0 : Math.sin(t * 0.8) * 0.05;

    const light = 0.1 + charge * 0.3 + p * 0.9 + (hovered && interactive ? 0.1 : 0);
    if (mat.current) {
      mat.current.emissiveIntensity += (light * Math.min(1, 0.4 + innerLight) - mat.current.emissiveIntensity) * k;
    }
    if (glow.current) {
      const m = glow.current.material as THREE.SpriteMaterial;
      m.opacity += (0.2 + charge * 0.25 + p * 0.5 - m.opacity) * k;
      const gs = (2.6 + charge * 1.2 + p * 1.6) * halo;
      glow.current.scale.setScalar(gs);
    }
    if (inner.current) inner.current.intensity = (1.5 + light * 6) * innerLight;
  });

  const handle = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    onTap?.();
  };

  return (
    <group ref={group}>
      <Glow ref={glow} color="#ffc9d3" size={2.6} opacity={0.25} />
      <mesh
        ref={mesh}
        geometry={geometry}
        onClick={handle}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        {glass ? (
          <meshPhysicalMaterial
            ref={mat}
            color={ROSE}
            emissive={DEEP}
            emissiveIntensity={0.12}
            roughness={0.12}
            metalness={0}
            transmission={0.55}
            thickness={1.2}
            ior={1.35}
            attenuationColor="#c24a64"
            attenuationDistance={0.9}
            clearcoat={1}
            clearcoatRoughness={0.08}
            sheen={0.6}
            sheenColor="#ffe2e7"
            iridescence={0.25}
            iridescenceIOR={1.25}
          />
        ) : (
          <meshPhysicalMaterial
            ref={mat}
            color={ROSE}
            emissive={DEEP}
            emissiveIntensity={0.12}
            roughness={0.22}
            metalness={0.02}
            clearcoat={1}
            clearcoatRoughness={0.1}
            sheen={1}
            sheenRoughness={0.4}
            sheenColor="#ffe2e7"
          />
        )}
      </mesh>
      <pointLight ref={inner} color="#ff8fa6" intensity={2} distance={3.2} position={[0, 0, 0.9]} />
    </group>
  );
}
