import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Stage } from '../../types';
import { Heart3D } from './Heart3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';
import { HeartVortex } from './HeartVortex';
import { CatConstellation } from './CatConstellation';
import { heartTipY } from './heartShape';
import { birthdayConfig } from '../../config/birthday';

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
  heartPoints: number;
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
  heartPoints,
}: Props) {
  const holder = useRef<THREE.Group>(null);
  const charge = stage === 'intro' ? Math.min(1, taps / tapsNeeded) : 1;
  const unlocked = stage === 'intro' && taps >= tapsNeeded;
  // she can turn the heart in her hands only while it is the whole scene
  const orbit = usePointerOrbit({ enabled: stage === 'intro', pitch: [-1.1, 1.1], zoom: [0.82, 1.2] });

  const heartPos: [number, number, number] =
    stage === 'intro'
      ? heartPoints > 0
        ? [0, portrait ? 0.75 : 0.62, 0] // lifted: the ring of words sits beneath it
        : [0, portrait ? 0.15 : 0.1, 0]
      : stage === 'gate'
        ? [0, portrait ? 1.55 : 1.2, -1.2]
        : [0, portrait ? 1.7 : 1.35, -1.6];
  const heartScale = stage === 'intro' ? 0.98 + charge * 0.14 + (unlocked ? 0.06 : 0) : 0.55;

  // The heart of light begins scattered: the first touch gathers it.
  const lightHeart = heartPoints > 0;
  const awake = stage !== 'intro' || taps >= 1;
  const [formed, setFormed] = useState(!lightHeart);
  const ready = formed || !awake; // touches go to the heart only before gathering, or once it is whole
  const drop = portrait ? 0.5 : 0.45;
  const ringR = portrait ? 1.05 : 1.3;
  const tip = heartTipY() * heartScale;
  // where the scattered light waits, in the heart's own space (it scales with the heart)
  const ring = useMemo(() => ({ y: (tip - drop) / heartScale, radius: (ringR * 0.9) / heartScale, tilt: 0.2 }), [tip, drop, ringR, heartScale]);

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
        position={[0, heartPoints > 0 && stage === 'intro' ? 1.25 : 0.15, camZ]}
        lookAt={[0, stage === 'intro' ? (heartPoints > 0 ? -0.05 : 0) : 0.35, 0]}
        parallax={reducedMotion ? 0 : 0.22}
        speed={stage === 'intro' ? 1.1 : 1.5}
        orbit={orbit}
      />
      <group ref={holder}>
        <Heart3D
          // the first touch gathers the light; the heart beats from the second on
          pulseKey={lightHeart && taps < 2 ? 0 : pulseKey}
          charge={charge}
          interactive={stage === 'intro' && !unlocked && ready}
          onTap={onHeartTap}
          reducedMotion={reducedMotion}
          glass={glass}
          scale={heartScale}
          halo={stage === 'intro' ? 1 : 0.8}
          orbit={orbit}
          particles={heartPoints}
          assembled={awake}
          onAssembled={() => setFormed(true)}
          ring={ring}
        />
        {heartPoints > 0 && (
          <HeartVortex
            tipY={tip}
            drop={drop}
            radius={ringR}
            drip={formed}
            words={birthdayConfig.heart.words}
            visible={stage === 'intro'}
            density={Math.max(0.35, heartPoints / 9000)}
            reducedMotion={reducedMotion}
          />
        )}
        {heartPoints > 0 && stage === 'intro' && !unlocked && ready && (
          // The heart of light has gaps, and the stream and ring beneath it belong to it too:
          // an invisible panel behind them makes the whole figure answer a touch.
          // (A tap on the heart itself is handled — and stopped — by the heart.)
          <mesh
            position={[0, -0.45, -0.9]}
            onClick={(e) => {
              e.stopPropagation();
              if (e.delta > 8 || orbit.travel > 10) return;
              onHeartTap();
            }}
          >
            <planeGeometry args={[portrait ? 2.6 : 3.2, 3.6]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
          </mesh>
        )}
      </group>
      {lightHeart && (
        // a little cat of light beside the heart — for her
        <CatConstellation
          awake={awake}
          visible={stage === 'intro'}
          position={portrait ? [-0.72, 2.0, -0.5] : [2.45, -0.05, -0.4]}
          scale={portrait ? 0.6 : 1.1}
          density={Math.max(0.4, heartPoints / 9000)}
          reducedMotion={reducedMotion}
        />
      )}
      <ParticleField
        count={Math.round(700 * particleFactor)}
        radius={10}
        innerRadius={1.8}
        burstKey={pulseKey}
        burstDelay={reducedMotion ? 0 : 0.26}
        intensity={stage === 'intro' ? (awake ? 0.55 + charge * 0.3 : 0.22) : 0.5}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
