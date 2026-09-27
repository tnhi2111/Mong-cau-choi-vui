import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Gift } from '../../data/gifts';
import { Glow } from './Glow';
import { getHeartGeometry } from './heartShape';

interface Props {
  gift: Gift;
  index: number;
  home: [number, number, number];
  showcase: [number, number, number];
  size: number;
  opened: boolean;
  opening: boolean;
  disabled: boolean;
  focused: boolean;
  glass: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onOpened: (id: string) => void;
}

/** 0 → 1 while the gift is being opened. Shared with the shape so lids/flaps can move. */
type Progress = { current: number };

function starGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 === 0 ? 0.36 : 0.16;
    const a = (i / (spikes * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.05,
    bevelSegments: 4,
  });
  g.center();
  return g;
}

function flapGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.4, 0);
  s.lineTo(0.4, 0);
  s.lineTo(0, -0.3);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function GiftBody({ gift, progress, glass }: { gift: Gift; progress: Progress; glass: boolean }) {
  const lid = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.Sprite>(null);
  const tint = useMemo(() => new THREE.Color(gift.tint), [gift.tint]);
  const star = useMemo(() => (gift.shape === 'star' ? starGeometry() : null), [gift.shape]);
  const flap = useMemo(() => (gift.shape === 'envelope' ? flapGeometry() : null), [gift.shape]);

  useEffect(
    () => () => {
      star?.dispose();
      flap?.dispose();
    },
    [star, flap],
  );

  useFrame((state) => {
    const o = progress.current;
    const open = THREE.MathUtils.smoothstep(o, 0.45, 0.9);
    if (lid.current) {
      if (gift.shape === 'box') {
        lid.current.rotation.x = -open * 1.25;
        lid.current.position.y = 0.24 + open * 0.12;
      }
      if (gift.shape === 'envelope') lid.current.rotation.x = open * Math.PI * 0.92;
    }
    if (light.current) {
      (light.current.material as THREE.SpriteMaterial).opacity = open * 0.9;
      light.current.scale.setScalar(0.4 + open * 1.4);
      light.current.position.y = 0.1 + open * 0.35;
    }
    if (core.current) {
      const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.2);
      (core.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.25 + open * 0.2;
      const base = (core.current.userData.base as number | undefined) ?? (core.current.userData.base = core.current.scale.x);
      core.current.scale.setScalar(base * (1 + open * 0.5));
    }
  });

  const surface = (
    <meshPhysicalMaterial
      color={tint}
      roughness={0.32}
      clearcoat={1}
      clearcoatRoughness={0.15}
      sheen={0.8}
      sheenColor="#fff2ee"
      emissive={tint}
      emissiveIntensity={0.08}
    />
  );
  const ribbon = <meshStandardMaterial color="#8f3c50" roughness={0.45} metalness={0.1} />;

  switch (gift.shape) {
    case 'box':
      return (
        <group>
          <RoundedBox args={[0.6, 0.48, 0.6]} radius={0.05} smoothness={3}>
            {surface}
          </RoundedBox>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.1, 0.49, 0.61]} />
            {ribbon}
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.61, 0.49, 0.1]} />
            {ribbon}
          </mesh>
          <Glow ref={light} color="#fff1ee" size={0.4} opacity={0} />
          {/* lid hinged on the back edge */}
          <group ref={lid} position={[0, 0.24, -0.33]}>
            <group position={[0, 0.06, 0.33]}>
              <RoundedBox args={[0.66, 0.13, 0.66]} radius={0.04} smoothness={3}>
                {surface}
              </RoundedBox>
              <mesh>
                <boxGeometry args={[0.1, 0.135, 0.67]} />
                {ribbon}
              </mesh>
              <mesh>
                <boxGeometry args={[0.67, 0.135, 0.1]} />
                {ribbon}
              </mesh>
              <mesh position={[-0.07, 0.1, 0]} rotation={[0, 0, 0.6]}>
                <torusGeometry args={[0.07, 0.022, 8, 20]} />
                {ribbon}
              </mesh>
              <mesh position={[0.07, 0.1, 0]} rotation={[0, 0, -0.6]}>
                <torusGeometry args={[0.07, 0.022, 8, 20]} />
                {ribbon}
              </mesh>
            </group>
          </group>
        </group>
      );
    case 'capsule':
      return (
        <group rotation={[0, 0, 0.5]}>
          <mesh>
            <capsuleGeometry args={[0.2, 0.42, 8, 24]} />
            <meshPhysicalMaterial
              color={tint}
              roughness={0.05}
              transmission={glass ? 0.9 : 0}
              thickness={0.4}
              transparent
              opacity={glass ? 1 : 0.42}
              clearcoat={1}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={core} geometry={getHeartGeometry('low')} scale={0.18}>
            <meshBasicMaterial color="#ffd9df" transparent opacity={0.7} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'star':
      return (
        <group>
          <mesh geometry={star!}>
            <meshPhysicalMaterial
              color={tint}
              roughness={0.2}
              metalness={0.35}
              clearcoat={1}
              iridescence={0.6}
              iridescenceIOR={1.3}
              emissive={tint}
              emissiveIntensity={0.18}
            />
          </mesh>
          <mesh ref={core} position={[0, 0, 0.12]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color="#fff6ea" transparent opacity={0.7} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'orb':
      return (
        <group>
          <mesh>
            <sphereGeometry args={[0.32, 32, 32]} />
            <meshPhysicalMaterial
              color={tint}
              roughness={0.04}
              transmission={glass ? 0.95 : 0}
              thickness={0.6}
              transparent
              opacity={glass ? 1 : 0.35}
              iridescence={0.5}
              clearcoat={1}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={core}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#fbe7ff" transparent opacity={0.7} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'envelope':
      return (
        <group>
          <mesh>
            <boxGeometry args={[0.8, 0.52, 0.04]} />
            <meshStandardMaterial color="#f4e8dc" roughness={0.7} />
          </mesh>
          <mesh ref={core} position={[0, 0.05, 0.005]}>
            <planeGeometry args={[0.66, 0.36]} />
            <meshBasicMaterial color="#fffaf4" transparent opacity={0.6} toneMapped={false} />
          </mesh>
          <group ref={lid} position={[0, 0.26, 0.025]}>
            <mesh geometry={flap!}>
              <meshStandardMaterial color="#eadbcb" roughness={0.7} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={getHeartGeometry('low')} position={[0, -0.26, 0.03]} scale={0.1}>
              <meshPhysicalMaterial color="#7d2438" roughness={0.3} clearcoat={1} />
            </mesh>
          </group>
        </group>
      );
  }
}

/** One floating gift in the room: hover glow, click to fly forward and open. */
export function Gift3D({
  gift,
  index,
  home,
  showcase,
  size,
  opened,
  opening,
  disabled,
  focused,
  glass,
  reducedMotion,
  onSelect,
  onOpened,
}: Props) {
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Sprite>(null);
  const progress = useRef(0);
  const notified = useRef(false);
  const [hovered, setHovered] = useState(false);
  const phase = useMemo(() => index * 1.7, [index]);
  const homeV = useMemo(() => new THREE.Vector3(...home), [home]);
  const showV = useMemo(() => new THREE.Vector3(...showcase), [showcase]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const active = hovered || focused;

  useEffect(() => {
    if (!opening) notified.current = false;
  }, [opening]);

  useEffect(() => {
    if (disabled) setHovered(false);
  }, [disabled]);

  useFrame((state, dt) => {
    const r = root.current;
    const s = spin.current;
    if (!r || !s) return;
    const t = state.clock.elapsedTime;

    const speed = reducedMotion ? 2.2 : 0.95;
    progress.current = opening
      ? Math.min(1, progress.current + dt * speed)
      : Math.max(0, progress.current - dt * 1.6);
    const o = progress.current;
    const e = o * o * (3 - 2 * o);

    // float at home, fly to the showcase point while opening
    const bob = reducedMotion ? 0 : Math.sin(t * 0.9 + phase) * 0.08;
    tmp.copy(homeV).setY(homeV.y + bob).lerp(showV, e);
    r.position.copy(tmp);

    const hoverBoost = active && !disabled ? 0.14 : 0;
    const targetScale = size * (1 + hoverBoost + e * 0.35);
    r.scale.setScalar(THREE.MathUtils.lerp(r.scale.x || size, targetScale, Math.min(1, dt * 8)));

    // idle sway; face the camera while opening
    const idleY = reducedMotion ? 0.3 : Math.sin(t * 0.45 + phase) * 0.6;
    s.rotation.y = THREE.MathUtils.lerp(s.rotation.y, opening ? 0 : idleY + (active ? 0.4 : 0), Math.min(1, dt * 3));
    s.rotation.x = THREE.MathUtils.lerp(s.rotation.x, opening ? 0.35 * (1 - e) + 0.25 : 0.12, Math.min(1, dt * 3));

    if (glow.current) {
      const m = glow.current.material as THREE.SpriteMaterial;
      const base = opened ? 0.18 : 0.34;
      const target = base + (active && !disabled ? 0.3 : 0) + THREE.MathUtils.smoothstep(o, 0.5, 1) * 1.2;
      m.opacity += (target - m.opacity) * Math.min(1, dt * 5);
      glow.current.scale.setScalar(1.7 + (active ? 0.5 : 0) + THREE.MathUtils.smoothstep(o, 0.55, 1) * 4);
    }

    if (opening && o >= 1 && !notified.current) {
      notified.current = true;
      onOpened(gift.id);
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (disabled || e.delta > 8) return;
    onSelect(gift.id);
  };

  useEffect(() => {
    if (disabled) return;
    document.body.style.cursor = hovered ? 'pointer' : '';
  }, [hovered, disabled]);

  const number = String(index + 1).padStart(2, '0');

  return (
    <group ref={root} position={home}>
      <Glow ref={glow} color={gift.tint} size={1.7} opacity={0.3} />
      <group
        ref={spin}
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!disabled) setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <GiftBody gift={gift} progress={progress} glass={glass} />
        {/* generous invisible hit area — easier to tap on phones */}
        <mesh>
          <sphereGeometry args={[0.62, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
      {!opening && (
        <Html center position={[0, -0.72, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
          <div className={`gift-label${active ? ' is-active' : ''}${opened ? ' is-opened' : ''}`}>
            <span className="gift-label__num">{opened ? '✓' : number}</span>
            <span className="gift-label__title">{gift.title}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
