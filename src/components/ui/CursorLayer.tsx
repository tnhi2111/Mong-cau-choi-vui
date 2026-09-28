import { useEffect, useRef } from 'react';

/**
 * The page's "touch of light":
 *  • a soft rose glow that follows the mouse with a little inertia (it lives *under*
 *    the text layer, so it lights the scene, never the words)
 *  • a sparse trail of tiny sparkles, spawned by distance travelled — not per frame —
 *    so a still or slow cursor makes almost none
 *  • a small ripple where any button is pressed (this one also on touch)
 *
 * Cursor effects exist only for a real mouse and are off with reduced motion.
 * The loop sleeps whenever nothing is moving.
 */

const MAX_SPARKS = 44;
const SPACING = 16; // px travelled per sparkle
const COLORS = ['255,214,222', '255,244,241', '255,184,200', '255,226,210'];

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  c: string;
}

export function CursorLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const glow = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // ripple on press — useful feedback everywhere, including phones
  useEffect(() => {
    if (reducedMotion) return;
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('.btn, .gift-nav__btn, .music, .icon-btn');
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple';
      const size = Math.max(rect.width, rect.height);
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - rect.left - size / 2}px`;
      dot.style.top = `${e.clientY - rect.top - size / 2}px`;
      el.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [reducedMotion]);

  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const g = glow.current;
    const c = canvas.current;
    if (!fine || reducedMotion || !g || !c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(innerWidth * dpr);
      c.height = Math.round(innerHeight * dpr);
    };
    resize();

    const target = { x: innerWidth / 2, y: innerHeight / 2 };
    const pos = { ...target };
    let visible = 0;
    let wantVisible = 0;
    let lift = 0; // brighter over something interactive
    let travel = 0;
    let last: { x: number; y: number } | null = null;
    const sparks: Spark[] = [];
    let raf = 0;
    let prev = performance.now();

    const wake = () => {
      if (!raf) {
        prev = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const spawn = (x: number, y: number, dx: number, dy: number) => {
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 14;
      sparks.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * sp - dx * 0.4,
        vy: Math.sin(a) * sp - dy * 0.4 - 6, // light things drift up
        r: 0.6 + Math.pow(Math.random(), 2) * 1.6,
        life: 0.5 + Math.random() * 0.7,
        age: 0,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      });
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      target.x = e.clientX;
      target.y = e.clientY;
      wantVisible = 1;
      if (last) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        travel += Math.hypot(dx, dy);
        const len = Math.hypot(dx, dy) || 1;
        // at most two per event — a fast flick stays elegant
        let n = 0;
        while (travel > SPACING && n < 2) {
          travel -= SPACING;
          n++;
          spawn(e.clientX, e.clientY, dx / len, dy / len);
        }
        if (travel > SPACING) travel = SPACING;
      }
      last = { x: e.clientX, y: e.clientY };
      const hit = (e.target as Element | null)?.closest?.('button, a, [role="button"], input');
      lift = hit || document.body.style.cursor === 'pointer' ? 1 : 0;
      wake();
    };
    const onLeave = () => {
      wantVisible = 0;
      last = null;
      wake();
    };

    function tick(now: number) {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const k = 1 - Math.exp(-dt * 11);
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
      visible += (wantVisible - visible) * (1 - Math.exp(-dt * 4));
      if (document.body.style.cursor === 'pointer') lift = 1;
      const scale = 1 + lift * 0.25;
      g!.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      g!.style.opacity = String(visible * (0.55 + lift * 0.25));

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, innerWidth, innerHeight);
      ctx!.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.life) {
          sparks.splice(i, 1);
          continue;
        }
        const f = Math.exp(-dt * 2.2);
        s.vx *= f;
        s.vy *= f;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const t = s.age / s.life;
        const a = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t);
        ctx!.fillStyle = `rgba(${s.c},${(a * 0.18).toFixed(3)})`;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r * 3.2, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = `rgba(${s.c},${(a * 0.9).toFixed(3)})`;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      const settled =
        sparks.length === 0 && Math.abs(target.x - pos.x) < 0.3 && Math.abs(target.y - pos.y) < 0.3 && Math.abs(wantVisible - visible) < 0.01;
      raf = settled ? 0 : requestAnimationFrame(tick);
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  return (
    <>
      <div ref={glow} className="cursor-glow" aria-hidden="true" />
      <canvas ref={canvas} className="sparkle-trail" aria-hidden="true" />
    </>
  );
}
