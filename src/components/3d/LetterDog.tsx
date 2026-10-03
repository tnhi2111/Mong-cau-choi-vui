import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { FACE, HEAD_PIVOT, HEAD_REST, TAIL_PIVOT, type V3 } from './letterDogModel';
import { loadLetterDog, letterDogReady, type LetterDogGeometry } from './letterDogGeometry';
import { getHeartGeometry } from './heartShape';
import { getPaperTexture } from './glowTexture';
import { surface, type GiftMaterials } from './Gift3D';

/*
 * The letter gift, delivered: a golden puppy standing on the floor of the gift room
 * with the love letter held in its mouth. It is lit by the same candles, fairy lights
 * and window as everything else in the room (real, lit materials — not light points).
 *
 * Alive, quietly — several independent motions on their own clocks, never a loop:
 * breathing, a slow weight shift, the head's small wanderings and curious tilt, the
 * eyes blinking at irregular moments, the tail wagging in bursts. When her hand comes
 * near it turns its head toward her, tilts it, and wags harder. Opened, it trots a few
 * steps closer, lifts its head to offer the letter, and the letter's flap opens.
 */

/** Its fur (with per-vertex colour) and its face — shared, and pre-compiled by Prewarm. */
export function createLetterDogMaterials() {
  const fur = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.74,
    sheen: 0.85,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color('#ffd6a0'),
    clearcoat: 0.02,
    clearcoatRoughness: 0.6,
    // the finest grain of the coat
    bumpMap: getPaperTexture(),
    bumpScale: 0.5,
    emissive: new THREE.Color('#000000'),
    emissiveIntensity: 0,
  });
  return {
    fur,
    eye: surface({ color: '#1a0c07', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, bumpScale: 0.001 }),
    nose: surface({ color: '#3a1c13', roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.25, bumpScale: 0.3 }),
    ribbon: surface({ color: '#a91f3c', roughness: 0.42, sheen: 1, sheenRoughness: 0.3, sheenColor: '#ff9fb4', clearcoat: 0.05, bumpScale: 0.2 }),
    bell: surface({ color: '#d9b25a', roughness: 0.28, metalness: 0.9, clearcoat: 0.3, clearcoatRoughness: 0.2, bumpScale: 0.001 }),
  };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** The envelope's flap: a soft triangle with a little thickness. */
function flapGeometry(w: number, h: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.quadraticCurveTo(w * 0.06, -h * 0.55, 0, -h * 0.62);
  s.quadraticCurveTo(-w * 0.06, -h * 0.55, -w / 2, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false });
}

interface Props {
  /** 0 → 1 while it is being opened */
  progress: { current: number };
  /** 0 → 1 while her hand is on it */
  hover: { current: number };
  /** where on it the pointer rests (-1…1) */
  aim: { current: { x: number; y: number } };
  mats: GiftMaterials;
  reducedMotion: boolean;
}

export function LetterDog({ progress, hover, aim, mats, reducedMotion }: Props) {
  const [geo, setGeo] = useState<LetterDogGeometry | null>(letterDogReady);
  useEffect(() => {
    if (geo) return;
    let alive = true;
    void loadLetterDog().then((g) => alive && setGeo(g));
    return () => {
      alive = false;
    };
  }, [geo]);

  const m = useMemo(createLetterDogMaterials, []);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  const flap = useMemo(() => flapGeometry(FACE.letter.w * 0.98, FACE.letter.h), []);
  useEffect(() => () => flap.dispose(), [flap]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const lid = useRef<THREE.Group>(null);
  const clock = useRef({ blinkAt: 2 + Math.random() * 3, look: 0, tilt: 0, turn: 0 });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const motion = reducedMotion ? 0.2 : 1;
    const o = progress.current;
    const open = THREE.MathUtils.smoothstep(o, 0.45, 0.9);
    const h = hover.current;
    const c = clock.current;

    // breathing, and a slow shift of weight from one side to the other
    const breath = Math.sin(t * 1.55) * motion;
    if (body.current) body.current.scale.set(1 + breath * 0.006, 1 + breath * 0.009, 1 + breath * 0.008);
    if (root.current) {
      root.current.rotation.z = Math.sin(t * 0.37) * 0.012 * motion;
      // a few trotting steps while it comes closer to offer the letter
      const trot = o > 0 && o < 0.75 ? Math.abs(Math.sin(o * Math.PI * 7)) * 0.022 * (1 - o) : 0;
      root.current.position.y = trot * motion;
    }

    // the head: small wanderings, a curious tilt when her hand is near, turning toward it;
    // when opened, it lifts its chin to offer the letter
    const k = 1 - Math.exp(-dt * 4);
    c.turn += (HEAD_REST[1] + Math.sin(t * 0.29) * 0.07 * motion + THREE.MathUtils.clamp(aim.current.x, -1, 1) * 0.32 * h - c.turn) * k;
    c.look += (HEAD_REST[0] + Math.sin(t * 0.53 + 1) * 0.025 * motion - aim.current.y * 0.1 * h - open * 0.2 - c.look) * k;
    c.tilt += (HEAD_REST[2] + Math.sin(t * 0.41) * 0.03 * motion + h * 0.12 - c.tilt) * (1 - Math.exp(-dt * 2.5));
    if (head.current) head.current.rotation.set(c.look, c.turn, c.tilt, 'YXZ');

    // blinking, at irregular moments
    const since = t - c.blinkAt;
    const lidY = since > 0 && since < 0.15 ? 0.12 : 1;
    if (since > 0.15) c.blinkAt = t + 2.2 + Math.random() * 4.5;
    eyes.current.forEach((e) => e && (e.scale.y = lidY));

    // the tail: idle wags come in bursts; her hand makes it wag harder
    if (tail.current) {
      const burst = THREE.MathUtils.smoothstep(Math.sin(t * 0.23 + 2), 0.2, 0.8);
      const amp = (0.12 + 0.3 * burst + 0.35 * h + 0.3 * open) * motion;
      const freq = 6 + 4 * Math.max(h, open);
      tail.current.rotation.set(-0.08 + Math.sin(t * freq + 1.3) * 0.04 * amp, Math.sin(t * freq) * amp, 0);
    }

    // the letter's flap opens as the gift is opened
    if (lid.current) lid.current.rotation.x = -open * 2.5;
  });

  const L = FACE.letter;
  const P = HEAD_PIVOT;
  return (
    <group ref={root}>
      {geo && (
        <>
          <group ref={body}>
            <mesh geometry={geo.body} material={m.fur} />
            {/* a red satin bow at the collar, and a little gold bell */}
            <mesh position={FACE.collar.c} rotation-x={Math.PI / 2 - 0.42} material={m.ribbon}>
              <torusGeometry args={[FACE.collar.r, 0.016, 10, 36]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.05, 0.6, 0.33]} rotation={[0.3, s * 0.4, s * 0.6]} scale={[1, 0.62, 0.42]} material={m.ribbon}>
                <torusGeometry args={[0.042, 0.016, 10, 24]} />
              </mesh>
            ))}
            {[-1, 1].map((s) => (
              <mesh key={`t${s}`} position={[s * 0.028, 0.545, 0.335]} rotation={[0.25, 0, s * 0.35]} material={m.ribbon}>
                <boxGeometry args={[0.022, 0.075, 0.008]} />
              </mesh>
            ))}
            <mesh position={[0, 0.6, 0.335]} material={m.ribbon}>
              <sphereGeometry args={[0.02, 12, 10]} />
            </mesh>
            <mesh position={[0, 0.565, 0.34]} material={m.bell}>
              <sphereGeometry args={[0.022, 16, 12]} />
            </mesh>
          </group>
          <group ref={head} position={P}>
            <mesh geometry={geo.head} position={sub([0, 0, 0], P)} material={m.fur} />
            {FACE.eyes.map((e, i) => (
              <group key={i} ref={(g) => void (g && (eyes.current[i] = g))} position={sub(e, P)}>
                <mesh material={m.eye}>
                  <sphereGeometry args={[FACE.eyeR, 20, 16]} />
                </mesh>
                {/* a warm catch-light */}
                <mesh position={[0.008, 0.01, FACE.eyeR * 0.92]}>
                  <sphereGeometry args={[0.0055, 8, 6]} />
                  <meshBasicMaterial color="#fff4e6" />
                </mesh>
              </group>
            ))}
            <mesh position={sub(FACE.nose, P)} scale={[1.25, 0.82, 0.9]} material={m.nose}>
              <sphereGeometry args={[0.03, 20, 14]} />
            </mesh>
            {/* the letter, held crosswise between the jaws */}
            <group position={sub(L.c, P)} rotation={L.rot}>
              <RoundedBox args={[L.w, L.h, L.t]} radius={0.004} smoothness={2} material={mats.main} />
              <group ref={lid} position={[0, L.h / 2 - 0.004, L.t / 2 + 0.001]}>
                <mesh geometry={flap} material={mats.flap ?? mats.main} />
                <mesh geometry={getHeartGeometry('low')} position={[0, -L.h * 0.5, 0.008]} scale={[0.026, 0.026, 0.014]} material={mats.seal ?? mats.main} />
              </group>
            </group>
          </group>
          <group ref={tail} position={TAIL_PIVOT}>
            <mesh geometry={geo.tail} position={sub([0, 0, 0], TAIL_PIVOT)} material={m.fur} />
          </group>
        </>
      )}
    </group>
  );
}
