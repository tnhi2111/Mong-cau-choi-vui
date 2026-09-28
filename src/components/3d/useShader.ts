import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * A ShaderMaterial whose `uniforms` object is exactly the one passed in.
 *
 * Why not `<shaderMaterial uniforms={u} />`? React Three Fiber (v9) copies each
 * uniform into a new object when it applies that prop, so writing
 * `u.uTime.value = …` in useFrame would never reach the GPU. Building the
 * material ourselves keeps the reference, so animation code can simply mutate
 * the uniforms it created.
 */
export function useShader<U extends Record<string, THREE.IUniform>>(
  vertexShader: string,
  fragmentShader: string,
  uniforms: U,
  { additive = true, side = THREE.FrontSide }: { additive?: boolean; side?: THREE.Side } = {},
): THREE.ShaderMaterial & { uniforms: U } {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        side,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [vertexShader, fragmentShader, uniforms, additive, side],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material as THREE.ShaderMaterial & { uniforms: U };
}
