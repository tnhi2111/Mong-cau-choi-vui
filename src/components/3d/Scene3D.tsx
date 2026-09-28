import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { FinalePhase, Stage } from '../../types';
import type { Gift } from '../../data/gifts';
import { tierSettings, lowerTier, type Tier } from '../../lib/quality';
import { Lights } from './Lights';
import { IntroWorld } from './IntroWorld';
import { RoomWorld } from './RoomWorld';
import { FinalWorld } from './FinalWorld';

export interface SceneProps {
  stage: Stage;
  taps: number;
  tapsNeeded: number;
  pulseKey: number;
  onHeartTap: () => void;
  gifts: Gift[];
  opened: string[];
  openingId: string | null;
  focusId: string | null;
  allOpened: boolean;
  onGiftSelect: (id: string) => void;
  onGiftOpened: (id: string) => void;
  finalePhase: FinalePhase;
  finalePhotos: string[];
  onFinaleFormed: () => void;
  /** An overlay covers the scene: render on demand only, to save battery. */
  paused: boolean;
  reducedMotion: boolean;
  tier: Tier;
  onTierChange: (t: Tier) => void;
  portrait: boolean;
}

/** One persistent WebGL canvas; the "world" inside changes with the stage. */
export default function Scene3D(props: SceneProps) {
  const { stage, tier, onTierChange, paused, reducedMotion, portrait } = props;
  const q = tierSettings[tier];
  const inIntro = stage === 'intro' || stage === 'gate' || stage === 'welcome';

  return (
    <Canvas
      className="scene"
      dpr={q.dpr}
      frameloop={paused ? 'demand' : 'always'}
      camera={{ position: [0, 0, 7], fov: 40, near: 0.1, far: 60 }}
      gl={{ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      aria-hidden="true"
    >
      <PerformanceMonitor flipflops={2} onDecline={() => onTierChange(lowerTier(tier))} />
      <Suspense fallback={null}>
        <Lights />
      </Suspense>
      {inIntro && (
        <IntroWorld
          stage={stage}
          taps={props.taps}
          tapsNeeded={props.tapsNeeded}
          pulseKey={props.pulseKey}
          onHeartTap={props.onHeartTap}
          reducedMotion={reducedMotion}
          glass={q.transmission}
          particleFactor={q.particles}
          portrait={portrait}
        />
      )}
      {stage === 'room' && (
        <RoomWorld
          gifts={props.gifts}
          opened={props.opened}
          openingId={props.openingId}
          focusId={props.focusId}
          allOpened={props.allOpened}
          pulseKey={props.pulseKey}
          paused={paused}
          onSelect={props.onGiftSelect}
          onOpened={props.onGiftOpened}
          onHeartTap={props.onHeartTap}
          reducedMotion={reducedMotion}
          glass={q.transmission}
          particleFactor={q.particles}
          portrait={portrait}
        />
      )}
      {stage === 'final' && (
        <FinalWorld
          phase={props.finalePhase}
          photos={props.finalePhotos}
          onFormed={props.onFinaleFormed}
          reducedMotion={reducedMotion}
          glass={q.transmission}
          particleFactor={q.particles}
          portrait={portrait}
        />
      )}
    </Canvas>
  );
}
