'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';

type Props = React.HTMLAttributes<HTMLDivElement> & {
  intensity?: number;
};

export function TiltCard({
  className,
  children,
  intensity = 6,
  onMouseMove,
  onMouseLeave,
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * intensity;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -intensity;
    el.style.transform = `perspective(900px) rotateY(${x}deg) rotateX(${y}deg) translateZ(0)`;
    // glow cursor
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--mx', `${mx}%`);
    el.style.setProperty('--my', `${my}%`);
    onMouseMove?.(e);
  };

  const handleLeave: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const el = ref.current;
    if (el) el.style.transform = '';
    onMouseLeave?.(e);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn(
        'group/tilt relative transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none',
        className,
      )}
      {...rest}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover/tilt:opacity-100"
        style={{
          background:
            'radial-gradient(400px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.08), transparent 40%)',
        }}
      />
      {children}
    </div>
  );
}
