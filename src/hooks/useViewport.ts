import { useEffect, useState } from 'react';

/** Coarse layout buckets used by the 3D scenes to frame themselves. */
export function useViewport() {
  const read = () => ({
    w: window.innerWidth,
    h: window.innerHeight,
    portrait: window.innerHeight > window.innerWidth,
    compact: window.innerWidth < 720,
  });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}
