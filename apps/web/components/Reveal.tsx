'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Children rise into place once when they scroll into view; with `stagger`, each direct child follows the one
 * before. The motion lives in CSS (a spring curve) and is off under prefers-reduced-motion.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  className,
  stagger = false,
}: {
  children: ReactNode;
  as?: 'div' | 'section' | 'ul' | 'header';
  className?: string | undefined;
  stagger?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stagger)
      Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            el.dataset.in = '';
            io.disconnect();
          }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stagger]);
  return (
    <Tag ref={ref as never} className={className} data-reveal={stagger ? 'stagger' : ''}>
      {children}
    </Tag>
  );
}
