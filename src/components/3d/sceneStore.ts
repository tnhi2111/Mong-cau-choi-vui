import * as THREE from 'three';

/**
 * Tiny shared state between 3D worlds and the light rig.
 *
 * The rig always owns the same set of lights, in every scene: three bakes the
 * number of lights into each shader, so a light that comes and goes would force
 * every material to recompile (a visible freeze on Windows/ANGLE). Worlds steer
 * those lights through here instead.
 */
export const hoverLight = {
  /** Where the hover rim light should glide to, or null when nothing is hovered. */
  target: null as THREE.Vector3 | null,
};
