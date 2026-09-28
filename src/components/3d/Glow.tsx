import { forwardRef } from 'react';
import * as THREE from 'three';
import { getGlowTexture } from './glowTexture';

interface Props {
  color?: string;
  size?: number;
  opacity?: number;
  position?: [number, number, number];
}

/** Additive billboard halo — cheap stand-in for bloom. */
export const Glow = forwardRef<THREE.Sprite, Props>(function Glow(
  { color = '#ffd6dc', size = 3, opacity = 0.6, position },
  ref,
) {
  return (
    <sprite ref={ref} scale={[size, size, 1]} position={position} renderOrder={-1}>
      <spriteMaterial
        map={getGlowTexture()}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </sprite>
  );
});
