import { useEffect, useState } from 'react';
import { birthdayConfig } from '../config/birthday';

const query = '(prefers-reduced-motion: reduce)';

/**
 * Whether to calm the animation down.
 *
 * By default this gift ignores the system "reduce motion" setting, so it looks and moves
 * the same on every device (Windows turns that setting on when "Animation effects" is
 * off — and then the puppy only barked instead of running round the heart).
 * Set `motion.respectReducedMotion: true` in birthday.ts to honour it again.
 */
export function useReducedMotion(): boolean {
  const honour: boolean = birthdayConfig.motion.respectReducedMotion;
  const [reduced, setReduced] = useState<boolean>(() => honour && typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    if (!honour) return;
    const mq = matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [honour]);
  return reduced;
}
