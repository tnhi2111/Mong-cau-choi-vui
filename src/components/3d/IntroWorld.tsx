import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Stage } from '../../types';
import { Heart3D } from './Heart3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';

interface Props {
  stage: Stage;
  taps: number;
  tapsNeeded: number;
  pulseKey: number;
  onHeartTap: () => void;
  reducedMotion: boolean;
  glass: boolean;
  particleFactor: number;
  portrait: boolean;
}

/** Stage 1–3: the lone heart in the dark, then the gate and the welcome. */
export function IntroWorld({
  stage,
  taps,
  tapsNeeded,
  pulseKey,
  onHeartTap,
  reducedMotion,
  glass,
  particleFactor,
  portrait,
}: Props) {
  const holder = useRef<THREE.Group>(null);
  const charge = stage === 'intro' ? Math.min(1, taps / tapsNeeded) : 1;
  const unlocked = stage === 'intro' && taps >= tapsNeeded;

  const heartPos: [number, number, number] =
    stage === 'intro'
      ? [0, portrait ? 0.15 : 0.1, 0]
      : stage === 'gate'
        ? [0, portrait ? 1.55 : 1.2, -1.2]
        : [0, portrait ? 1.7 : 1.35, -1.6];
  const heartScale = stage === 'intro' ? 0.72 + charge * 0.28 + (unlocked ? 0.12 : 0) : 0.5;

  const dist = portrait ? 1.3 : 1;
  const camZ = stage === 'intro' ? (6.4 - charge * 1.2 - (unlocked ? 0.5 : 0)) * dist : 6.6 * dist;

  useFrame((_, dt) => {
    const h = holder.current;
    if (!h) return;
    const k = 1 - Math.exp(-dt * 1.8);
    h.position.lerp(new THREE.Vector3(...heartPos), k);
  });

  return (
    <>
      <CameraRig
        position={[0, 0, camZ]}
        lookAt={[0, stage === 'intro' ? 0 : 0.35, 0]}
        parallax={reducedMotion ? 0 : 0.3}
        speed={stage === 'intro' ? 1.2 : 1.6}
      />
      <group ref={holder}>
        <Heart3D
          pulseKey={pulseKey}
          charge={charge}
          interactive={stage === 'intro' && !unlocked}
          onTap={onHeartTap}
          reducedMotion={reducedMotion}
          glass={glass}
          scale={heartScale}
          halo={stage === 'intro' ? 1 : 0.8}
        />
      </group>
      <ParticleField
        count={Math.round(900 * particleFactor)}
        radius={10}
        innerRadius={1.8}
        burstKey={pulseKey}
        intensity={stage === 'intro' ? 0.35 + charge * 0.5 : 0.6}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
