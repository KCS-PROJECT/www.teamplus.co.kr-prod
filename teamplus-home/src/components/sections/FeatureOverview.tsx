'use client';

import { motion } from 'framer-motion';
import { ArrowDownRight } from 'lucide-react';
import { FEATURE_GROUPS, FEATURES } from '@/lib/content';
import { ACCENT_CLASSES } from '@/lib/utils';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

/**
 * 기능 인덱스 — 8개 모듈을 "4개의 일"로 묶어 한눈에 보여주는 오버뷰 + 인페이지 내비.
 * - 카드 그리드 아님: 상단 hairline(top-border) 기반 에디토리얼 인덱스 컬럼.
 * - 큰 라운드 아이콘 / 영어 eyebrow / 모듈 넘버링 0 (AI 템플릿 텔 제거).
 * - 각 그룹 점만 accent 색(의미별 분류) · 나머지는 중성 + ice 인터랙션.
 */
export function FeatureOverview() {
  return (
    <section aria-label="기능 한눈에 보기" className="section">
      <div className="container-site">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-extrabold leading-tight text-rink-900 sm:text-3xl">
            8개 모듈을 <span className="text-ice-500">4개의 일</span>로 묶었습니다
          </h2>
          <p className="mt-4 text-base leading-7 text-wtext-3">
            클럽 운영을 회원 · 결제 · 소통 · 경기로 나누고, 필요한 모듈만 골라 씁니다. 묶음을
            눌러 자세한 기능으로 바로 이동하세요.
          </p>
        </div>

        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_GROUPS.map((g, i) => {
            const dot = ACCENT_CLASSES[g.accent].dot;
            const names = g.moduleIds
              .map((id) => FEATURES.find((f) => f.id === id)?.title)
              .filter(Boolean) as string[];
            return (
              <motion.a
                key={g.id}
                href={`#${g.id}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: DUR.fast, delay: stagger(i), ease: EASE_OUT }}
                className="group block border-t-2 border-rink-900/10 pt-5 motion-reduce:transition-none motion-reduce:transform-none"
              >
                <div className="flex items-baseline gap-2">
                  <span className={`mt-px h-2 w-2 shrink-0 self-center rounded-full ${dot}`} />
                  <span className="text-base font-extrabold text-rink-900 transition-colors group-hover:text-ice-600">
                    {g.label}
                  </span>
                  <span className="font-num text-xs font-bold text-wtext-4">{g.moduleIds.length}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-wtext-3">{g.caption}</p>
                <ul className="mt-4 flex flex-col gap-1.5">
                  {names.map((n) => (
                    <li key={n} className="text-sm font-medium text-wtext-2">
                      {n}
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-wtext-4 transition-colors group-hover:text-ice-600">
                  자세히
                  <ArrowDownRight size={13} strokeWidth={2.4} />
                </span>
              </motion.a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
