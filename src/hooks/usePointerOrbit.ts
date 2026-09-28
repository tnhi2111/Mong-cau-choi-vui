import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';

export interface OrbitOptions {
  enabled: boolean;
  /** Radians per pixel dragged. */
  sensitivity?: number;
  /** Allowed pitch range (radians). Going past it springs back softly. */
  pitch?: [number, number];
  /** Allowed zoom multiplier range (1 = default framing). */
  zoom?: [number, number];
  /** Friction after release: higher stops sooner. */
  friction?: number;
}

const MAX_SPEED = 3.2; // rad/s — fast enough to feel free, never dizzying

/**
 * Drag-to-rotate with inertia, wheel / pinch zoom. Framework-free state that a
 * `useFrame` consumer reads (`yaw`, `pitch`, `zoom`) after calling `step(dt)`.
 * The same input drives the hero heart (object rotation) and the gift room
 * (camera orbit).
 */
export class OrbitInput {
  yaw = 0;
  pitch = 0;
  zoom = 1;
  /** where the pointer wants yaw/pitch/zoom to be; the visible values glide toward it */
  tYaw = 0;
  tPitch = 0;
  tZoom = 1;
  vYaw = 0;
  vPitch = 0;
  dragging = false;
  /** Pixels travelled in the current gesture — lets clicks ignore drags. */
  travel = 0;
  lastInput = -Infinity;
  opts: Required<OrbitOptions>;

  constructor(opts: OrbitOptions) {
    this.opts = { sensitivity: 0.006, pitch: [-0.9, 0.9], zoom: [0.8, 1.25], friction: 2.6, ...opts };
  }

  /** Seconds since the last user input. */
  idle(now = performance.now()): number {
    return (now - this.lastInput) / 1000;
  }

  drag(dxPx: number, dyPx: number, dtMs: number) {
    const s = this.opts.sensitivity;
    const dy = dxPx * s;
    const dp = dyPx * s;
    this.tYaw += dy;
    this.tPitch += dp;
    const inv = 1000 / Math.max(8, dtMs);
    // smoothed release velocity
    this.vYaw = this.vYaw * 0.4 + dy * inv * 0.6;
    this.vPitch = this.vPitch * 0.4 + dp * inv * 0.6;
    this.travel += Math.abs(dxPx) + Math.abs(dyPx);
    this.lastInput = performance.now();
  }

  zoomBy(factor: number) {
    const [lo, hi] = this.opts.zoom;
    this.tZoom = Math.min(hi, Math.max(lo, this.tZoom * factor));
    this.lastInput = performance.now();
  }

  /** Glide the yaw somewhere (e.g. to face a gift) — used by cinematic moves. */
  steerYaw(target: number) {
    // keep the move short: go the nearest way around
    const turn = Math.round((this.tYaw - target) / (Math.PI * 2)) * Math.PI * 2;
    this.tYaw = target + turn;
    this.vYaw = 0;
  }

  step(dt: number) {
    const { friction, pitch } = this.opts;
    if (!this.dragging) {
      this.vYaw = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this.vYaw));
      this.vPitch = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this.vPitch));
      this.tYaw += this.vYaw * dt;
      this.tPitch += this.vPitch * dt;
      const f = Math.exp(-dt * friction);
      this.vYaw *= f;
      this.vPitch *= f;
      // soft limits: spring back instead of a hard wall
      if (this.tPitch < pitch[0]) this.tPitch += (pitch[0] - this.tPitch) * Math.min(1, dt * 6);
      if (this.tPitch > pitch[1]) this.tPitch += (pitch[1] - this.tPitch) * Math.min(1, dt * 6);
    } else {
      // while held, allow only a little overshoot past the limits
      this.tPitch = Math.max(pitch[0] - 0.15, Math.min(pitch[1] + 0.15, this.tPitch));
    }
    const k = 1 - Math.exp(-dt * 12);
    this.yaw += (this.tYaw - this.yaw) * k;
    this.pitch += (this.tPitch - this.pitch) * k;
    this.zoom += (this.tZoom - this.zoom) * (1 - Math.exp(-dt * 6));
  }
}

/** Creates an OrbitInput and wires it to the canvas' pointer / wheel events. */
export function usePointerOrbit(options: OrbitOptions): OrbitInput {
  const el = useThree((s) => s.gl.domElement);
  const input = useMemo(() => new OrbitInput(options), []); // eslint-disable-line react-hooks/exhaustive-deps
  input.opts = { ...input.opts, ...options };
  const { enabled } = options;

  useEffect(() => {
    if (!enabled) {
      input.dragging = false;
      return;
    }
    const prevTouch = el.style.touchAction;
    el.style.touchAction = 'none';
    const pointers = new Map<number, { x: number; y: number; t: number }>();
    let pinch = 0;

    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (pointers.size === 1) {
        input.dragging = true;
        input.travel = 0;
        input.vYaw = 0;
        input.vPitch = 0;
      }
      if (pointers.size === 2) pinch = spread();
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      const dt = e.timeStamp - p.t;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (pointers.size === 2) {
        const now = spread();
        if (pinch > 0 && now > 0) input.zoomBy(pinch / now);
        pinch = now;
        input.travel += 10; // a pinch is never a tap
        return;
      }
      if (pointers.size === 1) input.drag(dx, dy, dt);
    };
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (pointers.size === 0) {
        input.dragging = false;
        // the pointer rested before letting go → no fling
        if (p && e.timeStamp - p.t > 90) {
          input.vYaw = 0;
          input.vPitch = 0;
        }
      }
    };
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // browser zoom
      input.zoomBy(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0022));
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.style.touchAction = prevTouch;
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      input.dragging = false;
    };
  }, [el, enabled, input]);

  return input;
}
