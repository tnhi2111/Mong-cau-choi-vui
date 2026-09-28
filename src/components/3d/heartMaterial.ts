import * as THREE from 'three';

/**
 * The hero heart's material: a physically based, lacquered, slightly
 * translucent rose surface, extended with a few shader touches that PBR alone
 * does not give us:
 *
 *  • colour depth — deeper wine in the cleft and toward the tip, softer rose on the lobes
 *  • roughness variation — faint low-frequency "polish" so highlights never look stamped on
 *  • fresnel rim — warm light wrapping the silhouette, like light passing through the edge
 *  • core glow — light from inside, strongest where the heart faces the viewer
 *    (a cheap, stable stand-in for subsurface scattering)
 *
 * `uGlow` and `uRim` are animated by Heart3D (heartbeat, hover, charge).
 */
export interface HeartUniforms {
  uGlow: { value: number };
  uRim: { value: number };
  uCoreColor: { value: THREE.Color };
  uRimColor: { value: THREE.Color };
}

export function createHeartMaterial(glass: boolean): { material: THREE.MeshPhysicalMaterial; uniforms: HeartUniforms } {
  const uniforms: HeartUniforms = {
    uGlow: { value: 0.2 },
    uRim: { value: 0.35 },
    uCoreColor: { value: new THREE.Color('#ff4d70') },
    uRimColor: { value: new THREE.Color('#ff6f8e') },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: '#b52c4a',
    roughness: 0.2,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 0.12,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ffc6d1'),
    specularIntensity: 1,
    specularColor: new THREE.Color('#fff0f2'),
    ior: 1.45,
    emissive: new THREE.Color('#3d0714'),
    emissiveIntensity: 1,
    ...(glass
      ? {
          transmission: 0.32,
          thickness: 1.4,
          attenuationColor: new THREE.Color('#9e1834'),
          attenuationDistance: 0.55,
        }
      : {}),
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vObj;
        uniform float uGlow;
        uniform float uRim;
        uniform vec3 uCoreColor;
        uniform vec3 uRimColor;
        float hHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float hNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hHash(i), hHash(i + vec3(1,0,0)), f.x), mix(hHash(i + vec3(0,1,0)), hHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hHash(i + vec3(0,0,1)), hHash(i + vec3(1,0,1)), f.x), mix(hHash(i + vec3(0,1,1)), hHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          // deeper toward the tip and inside the cleft, lighter on the upper lobes
          float lobe = smoothstep(-0.55, 0.45, vObj.y);
          float cleft = 1.0 - smoothstep(0.0, 0.22, abs(vObj.x)) * 1.0;
          cleft *= smoothstep(0.1, 0.5, vObj.y);
          vec3 deep = vec3(0.42, 0.05, 0.13);
          diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.55, 1.08, lobe), deep, cleft * 0.35);
          diffuseColor.rgb *= 0.94 + 0.12 * hNoise(vObj * 3.5);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.7 + 0.65 * hNoise(vObj * 5.0 + 3.1)), 0.06, 0.6);`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
          vec3 vDir = normalize(vViewPosition);
          float facing = clamp(dot(normal, vDir), 0.0, 1.0);
          float fres = pow(1.0 - facing, 2.6);
          // light from within: brightest through the body, fading at grazing angles
          float core = pow(facing, 1.6) * (0.55 + 0.45 * smoothstep(-0.6, 0.3, vObj.y));
          outgoingLight += uCoreColor * core * uGlow;
          outgoingLight += uRimColor * fres * uRim;
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `hero-heart-${glass ? 'glass' : 'solid'}`;

  return { material, uniforms };
}
