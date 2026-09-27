/**
 * Picks a starting render quality from what we can cheaply learn about the
 * device. `PerformanceMonitor` then adjusts it live from the real FPS.
 */

export type Tier = 'high' | 'medium' | 'low';

export function hasWebGL(): boolean {
  try {
    if (new URLSearchParams(location.search).has('nogl')) return false;
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function isTouchDevice(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

export function initialTier(): Tier {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const small = Math.min(screen.width, screen.height) < 500;

  if (cores <= 2 || memory <= 2) return 'low';
  if (small || isTouchDevice() || cores <= 4) return 'medium';
  return 'high';
}

export const tierSettings: Record<Tier, { dpr: [number, number]; particles: number; transmission: boolean }> = {
  high: { dpr: [1, 2], particles: 1, transmission: true },
  medium: { dpr: [1, 1.5], particles: 0.6, transmission: false },
  low: { dpr: [0.75, 1], particles: 0.3, transmission: false },
};

export function lowerTier(t: Tier): Tier {
  return t === 'high' ? 'medium' : 'low';
}
