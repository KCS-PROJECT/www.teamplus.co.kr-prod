'use client';

import { motion } from 'framer-motion';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';
import { DUR, EASE_OUT } from '@/lib/motion';

type Props = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description }: Props) {
  return (
    <section className="relative isolate pt-40 pb-16 sm:pt-48 sm:pb-20">
      <BackgroundMesh variant="hero" />
      <div className="container-site">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.slow, ease: EASE_OUT }}
          className="mx-auto max-w-3xl text-center motion-reduce:transition-none motion-reduce:transform-none"
        >
          {eyebrow && (
            <span className="section-eyebrow">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
              {eyebrow}
            </span>
          )}
          <h1 className="mt-6 text-display-xl font-black tracking-normal text-balance text-rink-900">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-wtext-3 sm:text-lg">
              {description}
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
