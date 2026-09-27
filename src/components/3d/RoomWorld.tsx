import { useMemo } from 'react';
import * as THREE from 'three';
import type { Gift } from '../../data/gifts';
import { Heart3D } from './Heart3D';
import { Gift3D } from './Gift3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';

interface Props {
  gifts: Gift[];
  opened: string[];
  openingId: string | null;
  focusId: string | null;
  allOpened: boolean;
  pulseKey: number;
  paused: boolean;
  onSelect: (id: string) => void;
  onOpened: (id: string) => void;
  onHeartTap: () => void;
  reducedMotion: boolean;
  glass: boolean;
  particleFactor: number;
  portrait: boolean;
}

/** Spread gifts on an ellipse around the heart, like a small constellation. */
function layout(n: number, portrait: boolean): [number, number, number][] {
  const rx = portrait ? 1.12 : 3.05;
  const ry = portrait ? 1.9 : 1.45;
  return Array.from({ length: n }, (_, i) => {
    // start at the top so no gift sits on the bottom-centre, where the hint text lives
    const a = Math.PI / 2 + (i / n) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry + 0.05, Math.sin(i * 2.3) * 0.45] as [number, number, number];
  });
}

function OrbitLine({ rx, ry }: { rx: number; ry: number }) {
  const line = useMemo(() => {
    const pts = new THREE.EllipseCurve(0, 0.05, rx, ry).getPoints(160);
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0)));
    const m = new THREE.LineBasicMaterial({ color: '#f1d3d6', transparent: true, opacity: 0.09, depthWrite: false });
    return new THREE.Line(g, m);
  }, [rx, ry]);
  return <primitive object={line} />;
}

/** Stage 4: the little room — a heart in the middle, memories floating around it. */
export function RoomWorld({
  gifts,
  opened,
  openingId,
  focusId,
  allOpened,
  pulseKey,
  paused,
  onSelect,
  onOpened,
  onHeartTap,
  reducedMotion,
  glass,
  particleFactor,
  portrait,
}: Props) {
  const homes = useMemo(() => layout(gifts.length, portrait), [gifts.length, portrait]);
  const showcase: [number, number, number] = portrait ? [0, 0.2, 4.6] : [0, 0.15, 4.0];
  const camBase: [number, number, number] = portrait ? [0, -0.35, 10.2] : [0, 0.25, 8.4];
  const camOpen: [number, number, number] = portrait ? [0, 0.2, 9.0] : [0, 0.2, 7.6];
  const opening = openingId !== null;

  return (
    <>
      <CameraRig
        position={opening ? camOpen : camBase}
        lookAt={opening ? showcase : [0, portrait ? -0.45 : 0.05, 0]}
        parallax={reducedMotion || opening ? 0 : 0.35}
        speed={opening ? 1.4 : 1.1}
      />
      <group position={[0, 0.05, 0]}>
        <Heart3D
          pulseKey={pulseKey}
          charge={allOpened ? 1 : 0.25 + (opened.length / gifts.length) * 0.5}
          interactive={allOpened && !opening && !paused}
          onTap={onHeartTap}
          reducedMotion={reducedMotion}
          glass={glass}
          scale={portrait ? 0.62 : 0.72}
          halo={allOpened ? 1.5 : 1}
        />
      </group>
      <OrbitLine rx={portrait ? 1.12 : 3.05} ry={portrait ? 1.9 : 1.45} />
      {gifts.map((g, i) => (
        <Gift3D
          key={g.id}
          gift={g}
          index={i}
          home={homes[i]}
          showcase={showcase}
          size={portrait ? 0.9 : 1}
          opened={opened.includes(g.id)}
          opening={openingId === g.id}
          disabled={opening || paused}
          focused={focusId === g.id}
          glass={glass}
          reducedMotion={reducedMotion}
          onSelect={onSelect}
          onOpened={onOpened}
        />
      ))}
      <ParticleField
        count={Math.round(700 * particleFactor)}
        radius={11}
        innerRadius={2.5}
        burstKey={pulseKey}
        intensity={0.55 + (opened.length / gifts.length) * 0.35}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
