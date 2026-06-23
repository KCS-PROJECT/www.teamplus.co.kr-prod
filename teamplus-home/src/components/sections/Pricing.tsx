'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { PRICING } from '@/lib/content';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';
import { cn } from '@/lib/utils';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

export function Pricing() {
  return (
    <section id="pricing" aria-label="요금제 3 플랜" className="section relative">
      <BackgroundMesh variant="section" />
      <div className="container-site">
        <SectionHeading
          eyebrow="요금제"
          title={
            <>
              <span className="text-ice-600">클럽 규모</span>에 맞춰 선택하세요
            </>
          }
          description="모든 플랜은 14일 무료 체험 · 온보딩 매니저 무상 지원 · 데이터 이관 대행을 포함합니다. 언제든 상·하위 플랜으로 변경할 수 있습니다."
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PRICING.map((p, i) => (
            <motion.article
              key={p.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: DUR.fast, delay: stagger(i), ease: EASE_OUT }}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border p-7 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sh-2 motion-reduce:transition-none motion-reduce:transform-none sm:p-8',
                p.featured
                  ? 'border-ice-200 bg-ice-50'
                  : 'border-wline bg-wsurface hover:border-ice-100',
              )}
            >
              {p.featured && (
                <span className="absolute right-6 top-6 inline-flex items-center rounded-full bg-ice-500 px-3 py-1 text-[11px] font-bold text-white">
                  가장 많이 선택
                </span>
              )}

              <p className="text-sm font-bold text-wtext-3">
                {p.name}
              </p>
              <p className="mt-2 text-sm text-wtext-3">{p.tagline}</p>

              <div className="mt-7 flex items-baseline gap-2">
                <span className={cn('font-num text-5xl font-black tracking-normal', p.featured ? 'text-ice-600' : 'text-rink-900')}>
                  {p.price}
                </span>
                <span className="text-sm text-wtext-3">{p.priceUnit}</span>
              </div>

              <p className="mt-5 min-h-[60px] text-sm leading-relaxed text-wtext-3">
                {p.description}
              </p>

              <div className="my-7 divider" />

              <ul className="flex-1 space-y-3">
                {p.includes.map((inc) => (
                  <li key={inc} className="flex items-start gap-2.5 text-sm text-wtext-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-ice-600" strokeWidth={2.5} />
                    <span>{inc}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={p.ctaHref}
                className={cn(
                  'mt-8 w-full',
                  p.featured ? 'btn-primary !justify-center' : 'btn-ghost !justify-center',
                )}
              >
                {p.ctaLabel}
              </Link>
            </motion.article>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-wtext-4">
          부가세 별도 · 결제 수수료는 KG이니시스 공식 수수료만 적용 · 연간 계약 시 15% 추가 할인
        </p>
      </div>
    </section>
  );
}
