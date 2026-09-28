import { Environment, Lightformer } from '@react-three/drei';

/**
 * Studio-like reflections without downloading an HDR: a few soft light panels
 * rendered once into an environment map. Gives glossy objects their sheen.
 */
export function Lights({ warm = 1 }: { warm?: number }) {
  return (
    <>
      <ambientLight intensity={0.25} color="#ffe6ea" />
      <directionalLight position={[3, 4, 5]} intensity={1.1 * warm} color="#fff1ec" />
      <pointLight position={[-4, -1, -3]} intensity={18} distance={12} color="#c2566f" />
      <pointLight position={[4, 2, -4]} intensity={12} distance={12} color="#f2b8c3" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#fff3ef" position={[0, 3, 4]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffc7d2" position={[-5, 0, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="rect" intensity={1.0} color="#f4d8c6" position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="ring" intensity={1.6} color="#ffffff" position={[0, 0, -6]} scale={3} />
      </Environment>
    </>
  );
}
