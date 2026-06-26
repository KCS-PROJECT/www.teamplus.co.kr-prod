'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { FINAL_CTA, APP_DOWNLOAD } from '@/lib/content';
import { RinkLines } from '@/components/ui/RinkLines';
import { StoreBadge } from '@/components/ui/StoreBadge';
import { DUR, EASE_OUT, VIEWPORT } from '@/lib/motion';

/**
 * Final CTA — 밝은 ice 표면 + 단일 ice 강조
 * - 이모지 ✓ 제거 (DESIGN.md §7.5.1 AI slop)
 * - 컬러 그림자 없음 (RULE-1)
 * - 단일 액센트 ice-500 CTA 유지 (DESIGN.md §7.5.2 절제)
 */
export function FinalCta() {
  return (
    <section aria-label="도입 문의 안내" className="relative py-20 sm:py-28">
      <div className="container-site">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: DUR.slow, ease: EASE_OUT }}
          className="relative overflow-hidden rounded-[2rem] border border-ice-100 bg-ice-50 px-6 py-14 shadow-sh-2 sm:px-12 sm:py-20 motion-reduce:transition-none motion-reduce:transform-none"
        >
          {/* Subtle ice accent — top-left corner panel (장식, gradient 아님) */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-1 -top-1 h-24 w-32 rounded-br-[2.5rem] bg-wsurface"
          />
          {/* 브랜드 시그니처 — 링크 라인 (센터/블루라인, 아주 옅게) */}
          <RinkLines
            variant="lines"
            className="absolute inset-y-0 right-0 h-full w-[62%] text-ice-200/70"
          />

          <div className="relative mx-auto max-w-3xl text-center">
            <h2 className="text-display-lg font-black text-rink-900 text-balance break-keep">
              {FINAL_CTA.headlineLead}{' '}
              <span className="whitespace-nowrap">{FINAL_CTA.headlineBrand}</span>{' '}
              {FINAL_CTA.headlineTail}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-wtext-3 sm:text-lg">
              {FINAL_CTA.subCopy}
            </p>

            {/* 1차 행동 — 작동하는 도입 상담(/contact) + 2차 기능 보기. 카피·칩과 정합. */}
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/contact"
                className="btn-primary group w-full px-8 py-3.5 text-base sm:w-auto"
              >
                도입 상담 신청
                <ArrowRight
                  size={18}
                  strokeWidth={2.4}
                  className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none"
                  aria-hidden
                />
              </Link>
              <Link
                href="/features"
                className="btn-ghost w-full px-8 py-3.5 text-base sm:w-auto"
              >
                앱 기능 둘러보기
              </Link>
            </div>

            {/* 앱 다운로드 — 출시 전 '출시 예정' 비활성 표기 */}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-wtext-4">
                <Sparkles size={13} aria-hidden />앱 출시 예정
              </span>
              <div className="flex gap-2.5">
                <StoreBadge store="apple" href={APP_DOWNLOAD.appStore} tone="dark" className="scale-90" />
                <StoreBadge store="google" href={APP_DOWNLOAD.googlePlay} tone="dark" className="scale-90" />
              </div>
            </div>

            {/* Trailing trust signals — 이모지 제거, dot 마커로 대체 */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-wtext-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-ice-500" />
                클럽별 도입 상담
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-ice-500" />앱 화면 안내
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-ice-500" />
                학부모·코치 온보딩 지원
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
