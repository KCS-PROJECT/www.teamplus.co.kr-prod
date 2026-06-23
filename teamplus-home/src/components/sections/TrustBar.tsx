'use client';

import { motion } from 'framer-motion';
import {
  ShieldCheck,
  CreditCard,
  Bell,
  Accessibility,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { TRUST_INDICATORS } from '@/lib/content';
import { DUR, EASE_OUT, VIEWPORT, revealUp, stagger } from '@/lib/motion';

const ICON_MAP: Record<string, LucideIcon> = {
  'shield-check': ShieldCheck,
  'credit-card': CreditCard,
  bell: Bell,
  accessibility: Accessibility,
};

/**
 * Trust indicators — editorial 비대칭 레이아웃
 * - 좌측: 가장 중요한 1 dominant(보안)을 크게 + 헤딩 통합
 * - 우측: 나머지 3 mini 카드를 세로 stack
 * - 4 등가 grid에서 벗어남으로써 SaaS 템플릿 탈피
 */
export function TrustBar() {
  const [hero, ...rest] = TRUST_INDICATORS;
  const HeroIcon = ICON_MAP[hero.iconName] ?? ShieldCheck;

  return (
    <section aria-label="TEAMPLUS 신뢰 지표" className="relative py-14 sm:py-20">
      <div className="container-site">
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          {/* Left — dominant trust hero (보안) */}
          <motion.article
            {...revealUp}
            viewport={VIEWPORT}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="group relative overflow-hidden rounded-[1.75rem] border border-wline bg-wsurface p-7 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-ice-100 hover:shadow-sh-2 motion-reduce:transform-none sm:p-10"
          >
            <div className="flex h-full flex-col gap-7">
              <div>
                <p className="section-eyebrow">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
                  검증 기준
                </p>
                <h2 className="mt-4 text-2xl font-extrabold leading-tight text-rink-900 sm:text-3xl">
                  표어가 아닌, 인증과 정책으로 증명합니다
                </h2>
                <p className="mt-3 max-w-md text-sm leading-7 text-wtext-3">
                  KG이니시스 공식 · 카카오 Alimtalk · OWASP Top 10 · WCAG AAA. 도입 결정에 필요한
                  검증 기준만 모았습니다.
                </p>
              </div>

              <div className="mt-auto flex items-end justify-between gap-6 border-t border-wline pt-6">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rink-900 text-white shadow-sh-rink">
                    <HeroIcon size={22} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-wtext-4">
                      {hero.label}
                    </p>
                    <p className="mt-1 truncate text-lg font-extrabold text-rink-900">
                      {hero.value}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-wtext-3">{hero.description}</p>
                  </div>
                </div>
                <ArrowUpRight
                  className="hidden shrink-0 text-wtext-4 transition-colors group-hover:text-ice-600 sm:block"
                  size={18}
                />
              </div>
            </div>
          </motion.article>

          {/* Right — 3 mini cards stack */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {rest.map((t, i) => {
              const Icon = ICON_MAP[t.iconName] ?? ShieldCheck;
              return (
                <motion.article
                  key={t.label}
                  {...revealUp}
                  viewport={VIEWPORT}
                  transition={{ duration: DUR.fast, delay: stagger(i + 1), ease: EASE_OUT }}
                  className="group flex items-start gap-4 rounded-2xl border border-wline bg-wsurface p-5 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-ice-100 hover:shadow-sh-2 motion-reduce:transform-none"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ice-50 text-ice-600 ring-1 ring-ice-100">
                    <Icon size={20} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-xs font-bold text-wtext-4">
                        {t.label}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-sm font-extrabold text-rink-900">
                      {t.value}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-5 text-wtext-3">{t.description}</p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
