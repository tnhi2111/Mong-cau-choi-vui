import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

interface Props {
  children: ReactNode;
  as?: 'div' | 'li' | 'figure';
  className?: string;
  style?: CSSProperties;
  /** Root element to observe within (the scrolling overlay). */
  root?: React.RefObject<HTMLElement | null>;
}

/** Fades/slides its content in the first time it scrolls into view. */
export function Reveal({ children, as: Tag = 'div', className = '', style, root }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') return setInView(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { root: root?.current ?? null, threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, root]);

  return (
    <Tag ref={ref as React.RefObject<never>} className={`reveal${inView ? ' is-in' : ''} ${className}`} style={style}>
      {children}
    </Tag>
  );
}
