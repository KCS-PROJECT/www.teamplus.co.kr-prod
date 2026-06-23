'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { WHY_TEAMPLUS } from '@/lib/content';
import { DUR, EASE_OUT, VIEWPORT, revealUp, stagger } from '@/lib/motion';

/**
 * Why TEAMPLUS — 설득 깔때기 (C)(D): 범용 앱과의 차별점(moat) 4가지를 선언.
 * - editorial 비대칭: 좌측 sticky 헤딩 + support 스트립 / 우측 4 reason 카드(2×2).
 * - marker 배지는 ice tint(면 채움 금지) · 데코 인덱스 라벨 제거(핀테크 미니멀 레인 정렬).
 * - 하단 support 스트립으로 도입 장벽 해소(D)를 별도 섹션 없이 흡수한다.
 * - 토큰 100% · 카피 content.ts SoT · 모션 motion.ts 상수 · reduced-motion 가드.
 */
export function WhyTeamplus() {
  const { eyebrow, headline, subCopy, reasons, support } = WHY_TEAMPLUS;

  return (
    <section
      aria-label="범용 앱이 아니라 팀플러스여야 하는 이유"
      className="section relative scroll-mt-24 bg-wsurface"
    >
      <div className="container-site">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start lg:gap-14">
          {/* Left — sticky 헤딩 + support 스트립 */}
          <motion.div
            {...revealUp}
            viewport={VIEWPORT}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="motion-reduce:transition-none motion-reduce:transform-none lg:sticky lg:top-28"
          >
            <p className="section-eyebrow">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
              {eyebrow}
            </p>
            <h2 className="mt-5 max-w-md text-3xl font-extrabold leading-tight text-rink-900 sm:text-5xl">
              {headline}
            </h2>
            <p className="mt-6 max-w-md text-base leading-8 text-wtext-3">{subCopy}</p>

            {/* support reassurance — (D) 도입 장벽 해소 흡수 */}
            <div className="mt-8 flex max-w-md items-start gap-3 rounded-2xl border border-wline bg-wbg p-5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ice-50 ring-1 ring-ice-100">
                <span className="h-1.5 w-1.5 rounded-full bg-ice-500" />
              </span>
              <p className="text-sm leading-6 text-wtext-3">{support}</p>
            </div>
          </motion.div>

          {/* Right — 4 reason 카드 (2×2) */}
          <div className="grid gap-4 sm:grid-cols-2">
            {reasons.map((r, i) => (
              <motion.article
                key={r.title}
                {...revealUp}
                viewport={VIEWPORT}
                transition={{ duration: DUR.fast, delay: stagger(i), ease: EASE_OUT }}
                className="group relative flex flex-col gap-5 rounded-[1.4rem] border border-wline bg-wbg p-6 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-ice-100 hover:shadow-sh-2 motion-reduce:transition-none motion-reduce:transform-none sm:p-7"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-ice-50 px-3 py-1 text-[11px] font-bold tracking-[0.02em] text-ice-700 ring-1 ring-ice-100">
                    {r.marker}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-extrabold leading-snug text-rink-900 sm:text-xl">
                    {r.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-7 text-wtext-3">{r.description}</p>
                </div>

                <ArrowUpRight
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden
                  className="mt-auto text-wtext-4 transition-colors group-hover:text-ice-600"
                />
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
