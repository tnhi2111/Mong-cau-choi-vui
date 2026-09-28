import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { FinalePhase, Stage } from '../../types';
import type { Gift } from '../../data/gifts';
import { tierSettings, lowerTier, type Tier } from '../../lib/quality';
import { Lights, type Mood } from './Lights';
import { Atmosphere } from './Atmosphere';
import { Prewarm } from './Prewarm';
import { birthdayConfig } from '../../config/birthday';
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
  const mood: Mood = inIntro ? 'intro' : stage === 'room' ? 'room' : 'final';
  // a light that follows the mouse only makes sense with a real mouse
  // 0 → the glossy solid heart; otherwise the number of points of light it is made of
  const heartPoints = birthdayConfig.heart.style === 'particles' ? q.heartPoints : 0;
  const finePointer = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

  return (
    <Canvas
      className="scene"
      dpr={q.dpr}
      frameloop={paused ? 'demand' : 'always'}
      camera={{ position: [0, 0, 7], fov: 40, near: 0.1, far: 60 }}
      gl={{ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        // QA hook: lets the Playwright scripts read renderer stats
        if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
          Object.assign(window, { __gl: gl, __scene: scene });
        }
      }}
      aria-hidden="true"
    >
      <PerformanceMonitor flipflops={2} onDecline={() => onTierChange(lowerTier(tier))} />
      <Suspense fallback={null}>
        <Lights mood={mood} cursorLight={finePointer && tier !== 'low' && !reducedMotion} />
      </Suspense>
      <Atmosphere mood={mood} bokeh={tier === 'low' ? 6 : 14} stars={tier === 'low' ? 300 : 700} awake={stage !== 'intro' || props.taps >= 1} reducedMotion={reducedMotion} />
      {stage === 'welcome' && <Prewarm gifts={props.gifts} glass={q.transmission} solidHeart={heartPoints === 0} />}
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
          heartPoints={heartPoints}
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
          hoverFx={finePointer}
          heartPoints={Math.round(heartPoints * 0.75)}
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
          heartPoints={Math.round(heartPoints * 0.7)}
        />
      )}
    </Canvas>
  );
}
