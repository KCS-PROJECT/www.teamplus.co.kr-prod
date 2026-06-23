'use client';

import { motion } from 'framer-motion';
import {
  Users,
  CalendarDays,
  ScanLine,
  CreditCard,
  BellRing,
  ShoppingBag,
  Trophy,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { FEATURE_GROUPS, FEATURES, type FeatureItem } from '@/lib/content';
import { ACCENT_CLASSES } from '@/lib/utils';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

const ICON: Record<string, LucideIcon> = {
  users: Users,
  calendar: CalendarDays,
  qr: ScanLine,
  card: CreditCard,
  bell: BellRing,
  shop: ShoppingBag,
  trophy: Trophy,
  chat: MessageCircle,
};

const byId = (id: string) => FEATURES.find((f) => f.id === id);

/**
 * 8개 모듈 상세 — "스펙 시트(원장)" 에디토리얼.
 * - 동일 카드 그리드 탈피: 바운드 박스 0 · 그룹별 연속 원장(top-border + hairline row).
 * - 모듈 행 = [작은 인라인 아이콘 + 제목 + 한 줄 설명] | [2열 기능 리스트].
 * - 큰 라운드 아이콘 / pill 도배 / 영어 eyebrow / 모듈 넘버링 0.
 */
export function FeatureLedger() {
  return (
    <section aria-label="8개 모듈 상세" className="section bg-wbg">
      <div className="container-site">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold leading-tight text-rink-900 sm:text-4xl">
            기능 전부를 펼쳐보기
          </h2>
          <p className="mt-5 text-base leading-8 text-wtext-3">
            필요한 모듈만 골라 시작하고, 함께 묶을수록 운영이 한 흐름으로 이어집니다. 같은 회원,
            같은 결제선, 같은 알림 위에서 동작합니다.
          </p>
        </div>

        <div className="mt-14 flex flex-col gap-16">
          {FEATURE_GROUPS.map((g) => {
            const dot = ACCENT_CLASSES[g.accent].dot;
            const mods = g.moduleIds.map(byId).filter(Boolean) as FeatureItem[];
            return (
              <div key={g.id} id={g.id} className="scroll-mt-28">
                {/* group header */}
                <div className="flex flex-col gap-2 border-t-2 border-rink-900/10 pt-6 sm:flex-row sm:items-baseline sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                    <h3 className="text-xl font-extrabold text-rink-900 sm:text-2xl">{g.label}</h3>
                    <span className="font-num text-sm font-bold text-wtext-4">모듈 {mods.length}</span>
                  </div>
                  <p className="max-w-md text-sm leading-6 text-wtext-3">{g.caption}</p>
                </div>

                {/* module rows */}
                <div>
                  {mods.map((m, i) => {
                    const Icon = ICON[m.icon] ?? ScanLine;
                    return (
                      <motion.article
                        key={m.id}
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={VIEWPORT}
                        transition={{ duration: DUR.fast, delay: stagger(i), ease: EASE_OUT }}
                        className="grid gap-x-8 gap-y-3 border-t border-wline py-7 motion-reduce:transition-none motion-reduce:transform-none lg:grid-cols-12"
                      >
                        <div className="lg:col-span-5">
                          <div className="flex items-center gap-2.5">
                            <Icon
                              size={18}
                              strokeWidth={1.8}
                              className="shrink-0 text-wtext-3"
                              aria-hidden
                            />
                            <h4 className="text-lg font-extrabold leading-snug text-rink-900 sm:text-xl">
                              {m.title}
                            </h4>
                          </div>
                          <p className="mt-2.5 max-w-sm text-sm leading-6 text-wtext-3">
                            {m.description}
                          </p>
                        </div>
                        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:col-span-7 lg:pt-1">
                          {m.bullets.map((b) => (
                            <li
                              key={b}
                              className="flex items-start gap-2 text-sm leading-6 text-wtext-2"
                            >
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ice-400" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </motion.article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
