import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  position: [number, number, number];
  lookAt?: [number, number, number];
  /** How much the camera sways with the pointer (world units). */
  parallax?: number;
  /** Higher = snappier. */
  speed?: number;
  fov?: number;
}

/** Eases the camera toward a target and adds a gentle pointer parallax. */
export function CameraRig({ position, lookAt = [0, 0, 0], parallax = 0.25, speed = 1.6, fov }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const look = useRef(new THREE.Vector3(...lookAt));
  const tmp = useRef(new THREE.Vector3());
  const tmpLook = useRef(new THREE.Vector3());

  useFrame((state, dt) => {
    const k = 1 - Math.exp(-dt * speed);
    const px = state.pointer.x * parallax;
    const py = state.pointer.y * parallax * 0.6;
    tmp.current.set(position[0] + px, position[1] + py, position[2]);
    camera.position.lerp(tmp.current, k);
    tmpLook.current.set(...lookAt);
    look.current.lerp(tmpLook.current, k);
    camera.lookAt(look.current);
    if (fov && Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
