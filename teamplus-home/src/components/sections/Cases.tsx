'use client';

import { motion } from 'framer-motion';
import { Quote, ArrowUpRight } from 'lucide-react';
import { CASES } from '@/lib/content';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

/**
 * 도입 사례 — 비대칭 레이아웃 (DESIGN.md SoT)
 * - 첫 case(가장 큰 클럽 안양 ACE): dominant dark hero card (col-span-2)
 * - 나머지 3 cases: light mini cards
 * - C-01, C-02 ... signature
 * - templated 2x2 grid 탈피
 */
export function Cases() {
  const [hero, ...rest] = CASES;

  return (
    <section
      id="cases"
      aria-label="고객 도입 사례"
      className="section relative"
    >
      <BackgroundMesh variant="section" />
      <div className="container-site">
        <SectionHeading
          align="left"
          eyebrow="도입 사례"
          title={
            <>
              이미 수많은 클럽이
              <br className="hidden sm:block" />
              <span className="text-ice-500">팀플러스+</span>를 선택했습니다
            </>
          }
          description="유소년 아카데미부터 국내 최대 리그까지. 규모와 성격이 다른 클럽이 어떻게 팀플러스+로 운영을 바꿨는지 직접 들어보세요."
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          {/* Hero case — dark dominant card (col-span-2) */}
          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="group relative flex flex-col gap-7 overflow-hidden rounded-[var(--radius-card)] bg-rink-900 p-8 text-white shadow-sh-rink motion-reduce:transition-none motion-reduce:transform-none sm:p-10 lg:col-span-2 lg:flex-row lg:gap-10 lg:p-12"
          >
            <div className="flex shrink-0 flex-col gap-5 lg:w-[42%]">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ice-500 text-2xl font-black text-white shadow-sh-2">
                  {hero.logoLetter}
                </span>
                <span className="font-num text-xs font-bold text-ice-300">
                  C-01
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                  {hero.name}
                </h3>
                <p className="mt-1.5 text-xs font-semibold text-white/55">
                  {hero.type} · {hero.region}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-6">
                {hero.metrics.map((m) => (
                  <div key={m.label}>
                    <p className="font-num text-2xl font-black leading-none text-white sm:text-3xl">
                      {m.value}
                    </p>
                    <p className="mt-2 text-xs font-bold text-white/55">
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-7">
              <Quote
                className="absolute -top-3 left-6 h-6 w-6 rounded-full bg-rink-900 p-0.5 text-ice-300"
                strokeWidth={2}
              />
              <p className="mt-1 text-base leading-relaxed text-white/80 sm:text-lg">
                {hero.quote}
              </p>
              <p className="mt-5 flex items-center gap-2 text-xs font-semibold text-white/55">
                <span className="h-px w-6 bg-white/30" />
                {hero.author}
              </p>
            </div>
          </motion.article>

          {/* Supporting cases — 3 mini cards */}
          {rest.map((c, i) => (
            <motion.article
              key={c.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{
                duration: DUR.fast,
                delay: stagger(i + 1),
                ease: EASE_OUT,
              }}
              className="group flex h-full flex-col gap-5 rounded-[var(--radius-card)] border border-wline bg-wsurface p-6 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-ice-100 hover:shadow-sh-2 motion-reduce:transition-none motion-reduce:transform-none sm:p-7"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rink-900 text-base font-black text-white shadow-sh-rink">
                    {c.logoLetter}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-extrabold text-rink-900">
                      {c.name}
                    </h3>
                    <p className="truncate text-[11px] text-wtext-4">{c.region}</p>
                  </div>
                </div>
                <span className="font-num text-xs font-bold text-wtext-4">
                  C-0{i + 2}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 border-y border-wline py-4">
                {c.metrics.map((m) => (
                  <div key={m.label}>
                    <p className="font-num text-base font-black leading-none text-rink-900">
                      {m.value}
                    </p>
                    <p className="mt-1.5 text-xs font-semibold text-wtext-4">
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-sm leading-6 text-wtext-3 line-clamp-3">{c.quote}</p>
              <p className="mt-auto flex items-center gap-2 text-[11px] font-semibold text-wtext-4">
                <ArrowUpRight size={12} className="text-ice-500" strokeWidth={2.2} />
                {c.author}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
