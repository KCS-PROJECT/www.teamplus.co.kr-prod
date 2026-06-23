'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DUR, EASE_OUT, VIEWPORT } from '@/lib/motion';

type Props = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
      className={cn(
        'flex flex-col gap-5 motion-reduce:transition-none motion-reduce:transform-none',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow && (
        <span className="section-eyebrow">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
          {eyebrow}
        </span>
      )}
      <h2 className="text-display-lg font-bold text-balance text-rink-900">
        {title}
      </h2>
      {description && (
        <p className={cn(
          'max-w-2xl text-base leading-relaxed text-wtext-3 sm:text-lg',
          align === 'center' ? 'mx-auto' : '',
        )}>
          {description}
        </p>
      )}
    </motion.div>
  );
}
