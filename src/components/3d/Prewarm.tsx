import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Gift } from '../../data/gifts';
import { createGiftMaterials } from './Gift3D';
import { createFloorMaterial } from './RoomWorld';
import { createSwarmMaterial } from './FinalWorld';
import { createHeartMaterial } from './heartMaterial';

/*
 * Compiling a physically based shader takes a few hundred milliseconds on some
 * systems (Windows turns GLSL into HLSL), and the gift room introduces about ten
 * of them at once — enough to freeze the fade-in. So while she is still looking
 * at the heart, we compile every material the later scenes will need, in the
 * background (KHR_parallel_shader_compile), against the real scene so the lights
 * and environment match. Programs are shared by parameters, so the real
 * materials reuse them the moment they appear.
 *
 * The warm-up materials are kept alive on purpose: disposing them could release
 * a program before its real user arrives.
 */
const keepAlive: THREE.Material[] = [];

export function Prewarm({ gifts, glass, delay = 1800 }: { gifts: Gift[]; glass: boolean; delay?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      const temp = new THREE.Scene();
      const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      const add = (m: THREE.Material) => {
        keepAlive.push(m);
        const mesh = new THREE.Mesh(box, m);
        mesh.position.set(0, 0, -1);
        temp.add(mesh);
      };
      for (const g of gifts) Object.values(createGiftMaterials(g, glass)).forEach((m) => m && add(m));
      add(createFloorMaterial());
      add(createHeartMaterial(glass).material);
      const swarm = createSwarmMaterial();
      keepAlive.push(swarm);
      const inst = new THREE.InstancedMesh(box, swarm, 1);
      inst.setColorAt(0, new THREE.Color('#ffffff'));
      temp.add(inst);
      const ignore = () => {
        /* nothing lost: the shaders simply compile on first use */
      };
      gl.compileAsync(temp, camera, scene).catch(ignore);
      // Glass (transmission) renders the opaque world once more into a linear,
      // un-tonemapped target — a second variant of each shader. Warm that one too.
      if (glass) {
        const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
        const prev = gl.getRenderTarget();
        gl.setRenderTarget(rt);
        const done = gl.compileAsync(temp, camera, scene).catch(ignore);
        gl.setRenderTarget(prev);
        void done.finally(() => rt.dispose());
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [gl, scene, camera, gifts, glass, delay]);

  return null;
}
