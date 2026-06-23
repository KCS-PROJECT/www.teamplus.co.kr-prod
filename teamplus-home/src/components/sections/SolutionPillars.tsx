'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { SOLUTIONS } from '@/lib/content';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

/**
 * Solution pillars — 비대칭 editorial 레이아웃 (DESIGN.md SoT)
 * - 첫 pillar(Hybrid 아키텍처): dominant card (큰 영역)
 * - 나머지 3 pillars: light mini cards
 * - 4 등가 2x2 grid 탈피
 */
export function SolutionPillars() {
  const [hero, ...rest] = SOLUTIONS;

  return (
    <section
      aria-label="TEAMPLUS 기술 기반 4 기둥"
      className="section relative"
    >
      <BackgroundMesh variant="section" />
      <div className="container-site">
        <SectionHeading
          align="left"
          eyebrow="기술 기반"
          title={
            <>
              가볍게 시작, <span className="text-ice-500">엔터프라이즈까지</span>
              <br className="hidden sm:block" /> 확장되는 기술 기반
            </>
          }
          description="Flutter + Next.js 하이브리드 · 엔터프라이즈 보안 · 1초 SLA 성능 · 운영 자동화. 팀플러스+는 SaaS 의 편리함과 온프레미스의 견고함을 동시에 제공합니다."
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {/* Hero pillar — dominant dark hero (col-span-2 + row-span-2) */}
          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="group relative flex flex-col gap-7 overflow-hidden rounded-[var(--radius-card)] bg-rink-900 p-8 text-white shadow-sh-rink motion-reduce:transition-none motion-reduce:transform-none sm:p-10 lg:col-span-2 lg:row-span-2 lg:p-12"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="font-num flex h-14 w-14 items-center justify-center rounded-2xl bg-ice-500 text-lg font-black text-white shadow-sh-2">
                01
              </span>
              <span className="font-num text-xs font-bold text-ice-300">
                기반 01
              </span>
            </div>

            <div>
              <h3 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                {hero.title}
              </h3>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/70 sm:text-base sm:leading-8">
                {hero.description}
              </p>
            </div>

            <div className="mt-auto flex flex-wrap gap-2 border-t border-white/10 pt-7">
              {hero.highlights.map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  <span className="h-1 w-1 rounded-full bg-ice-300" />
                  {h}
                </span>
              ))}
            </div>
          </motion.article>

          {/* Supporting pillars — 3 mini cards (right column) */}
          {rest.map((s, i) => (
            <motion.article
              key={s.title}
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT}
              transition={{
                duration: DUR.fast,
                delay: stagger(i + 1),
                ease: EASE_OUT,
              }}
              className="group flex h-full flex-col gap-4 rounded-[var(--radius-card)] border border-wline bg-wsurface p-6 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-ice-100 hover:shadow-sh-2 motion-reduce:transition-none motion-reduce:transform-none lg:p-7"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-num flex h-11 w-11 items-center justify-center rounded-xl bg-rink-900 text-sm font-black text-white shadow-sh-rink">
                  0{i + 2}
                </span>
                <ArrowUpRight
                  className="text-wtext-4 transition-colors group-hover:text-ice-600"
                  size={16}
                  strokeWidth={2}
                />
              </div>

              <h3 className="text-lg font-extrabold leading-snug text-rink-900">
                {s.title}
              </h3>
              <p className="text-sm leading-6 text-wtext-3 line-clamp-3">{s.description}</p>

              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {s.highlights.slice(0, 4).map((h) => (
                  <span
                    key={h}
                    className="inline-flex items-center rounded-full border border-wline bg-wbg px-2.5 py-0.5 text-[11px] font-semibold text-rink-800"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
