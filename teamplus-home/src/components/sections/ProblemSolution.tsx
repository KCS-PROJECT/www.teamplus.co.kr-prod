'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { PROBLEM_SOLUTION } from '@/lib/content';
import { RinkLines } from '@/components/ui/RinkLines';
import { DUR, EASE_OUT, VIEWPORT, revealUp, stagger } from '@/lib/motion';

/**
 * Problem → Solution — 설득 깔때기 (A)(B): 문제 공감 + Before/After 전환.
 * - Hero 직후 첫 스크롤. 흩어진 운영의 고통을 담담히 명명(좌·라이트 muted)하고
 *   즉시 "한 흐름으로 모읍니다"로 전환(우·rink-900 다크 = 전환의 순간)한다.
 * - pairs 4행은 같은 인덱스(01~04)가 좌우로 마주보며 1:1 대응한다.
 * - 토큰 100% · 카피 content.ts SoT · 모션 motion.ts 상수 · reduced-motion 가드.
 */
export function ProblemSolution() {
  const { eyebrow, headline, subCopy, beforeLabel, afterLabel, pairs } = PROBLEM_SOLUTION;

  return (
    <section
      aria-label="흩어진 클럽 운영을 한 흐름으로 모으는 전환"
      className="section relative scroll-mt-24"
    >
      <div className="container-site">
        {/* heading */}
        <motion.div
          {...revealUp}
          viewport={VIEWPORT}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
          className="max-w-2xl motion-reduce:transition-none motion-reduce:transform-none"
        >
          <p className="section-eyebrow">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
            {eyebrow}
          </p>
          <h2 className="mt-5 text-3xl font-extrabold leading-tight text-rink-900 sm:text-5xl">
            {headline}
          </h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-wtext-3">{subCopy}</p>
        </motion.div>

        {/* Before ↔ After — 비대칭 2열 (다크 카드 = 전환의 순간) */}
        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[0.92fr_1.08fr] lg:gap-5">
          {/* Before — 라이트 muted 카드(흩어짐) */}
          <motion.div
            {...revealUp}
            viewport={VIEWPORT}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="group relative flex flex-col rounded-[1.6rem] border border-wline bg-wsurface p-7 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-ice-100 hover:shadow-sh-2 motion-reduce:transition-none motion-reduce:transform-none sm:p-8"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-wtext-4">
                {beforeLabel}
              </p>
              <span className="text-xs font-bold text-wtext-4">
                도입 전
              </span>
            </div>

            <ul className="mt-6 flex flex-col">
              {pairs.map((p, i) => (
                <motion.li
                  key={p.before}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={VIEWPORT}
                  transition={{ duration: DUR.fast, delay: stagger(i), ease: EASE_OUT }}
                  className="flex items-start gap-3.5 border-t border-dashed border-wline py-4 first:border-t-0 first:pt-0 motion-reduce:transition-none motion-reduce:transform-none"
                >
                  <span className="font-num mt-0.5 text-[11px] font-bold tracking-[0.12em] text-wtext-4">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm leading-6 text-wtext-2">{p.before}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* After — rink-900 다크 전환 카드(한 흐름) */}
          <motion.div
            {...revealUp}
            viewport={VIEWPORT}
            transition={{ duration: DUR.slow, delay: 0.08, ease: EASE_OUT }}
            className="relative isolate flex flex-col overflow-hidden rounded-[1.6rem] bg-rink-900 p-7 text-white shadow-sh-rink motion-reduce:transition-none motion-reduce:transform-none sm:p-9"
          >
            <RinkLines
              variant="faceoff"
              className="absolute -right-16 -top-16 z-0 h-56 w-56 text-white/[0.06]"
            />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ice-300">
                {afterLabel}
              </p>
              <span className="text-xs font-bold text-ice-300">
                도입 후
              </span>
            </div>

            <ul className="relative z-10 mt-6 flex flex-col">
              {pairs.map((p, i) => (
                <motion.li
                  key={p.after}
                  initial={{ opacity: 0, x: 8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={VIEWPORT}
                  transition={{ duration: DUR.fast, delay: stagger(i), ease: EASE_OUT }}
                  className="flex items-start gap-3.5 border-t border-white/10 py-4 first:border-t-0 first:pt-0 motion-reduce:transition-none motion-reduce:transform-none"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ice-500/15 ring-1 ring-ice-500/30">
                    <ArrowRight size={13} className="text-ice-300" strokeWidth={2.4} />
                  </span>
                  <span className="text-sm leading-6 text-white/85 sm:text-[15px]">{p.after}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
