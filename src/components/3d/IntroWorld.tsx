import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Stage } from '../../types';
import { Heart3D } from './Heart3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';

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

const target = new THREE.Vector3();

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
  // she can turn the heart in her hands only while it is the whole scene
  const orbit = usePointerOrbit({ enabled: stage === 'intro', pitch: [-1.1, 1.1], zoom: [0.82, 1.2] });

  const heartPos: [number, number, number] =
    stage === 'intro'
      ? [0, portrait ? 0.15 : 0.1, 0]
      : stage === 'gate'
        ? [0, portrait ? 1.55 : 1.2, -1.2]
        : [0, portrait ? 1.7 : 1.35, -1.6];
  const heartScale = stage === 'intro' ? 0.98 + charge * 0.14 + (unlocked ? 0.06 : 0) : 0.55;

  const dist = portrait ? 1.3 : 1;
  // each beat draws the camera a little closer, the last one most of all
  const camZ = stage === 'intro' ? (6.4 - charge * 0.9 - (unlocked ? 0.5 : 0)) * dist : 6.6 * dist;
  if (stage !== 'intro') orbit.tZoom = 1;

  useFrame((_, dt) => {
    const h = holder.current;
    if (!h) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 1.8);
    h.position.lerp(target.set(...heartPos), k);
  });

  return (
    <>
      <CameraRig
        position={[0, 0.15, camZ]}
        lookAt={[0, stage === 'intro' ? 0 : 0.35, 0]}
        parallax={reducedMotion ? 0 : 0.22}
        speed={stage === 'intro' ? 1.1 : 1.5}
        orbit={orbit}
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
          orbit={orbit}
        />
      </group>
      <ParticleField
        count={Math.round(700 * particleFactor)}
        radius={10}
        innerRadius={1.8}
        burstKey={pulseKey}
        burstDelay={reducedMotion ? 0 : 0.26}
        intensity={stage === 'intro' ? 0.3 + charge * 0.4 : 0.5}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
