'use client';

import { motion } from 'framer-motion';
import {
  UsersRound,
  Shield,
  Baby,
  GraduationCap,
  Award,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { USER_VALUES } from '@/lib/content';
import { RinkLines } from '@/components/ui/RinkLines';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

const ICON_MAP: Record<string, LucideIcon> = {
  'users-round': UsersRound,
  whistle: Award,
  shield: Shield,
  baby: Baby,
  'graduation-cap': GraduationCap,
};

/**
 * Personas — editorial 2-분할 (dominant + support)
 * - 좌: 학부모 dominant 큰 카드 — 가족(자녀 프로필 · 청소년 선수)을 한 카드에 통합
 * - 우: Coach / Director 2 support 카드 (세로 스택, 불릿 리스트)
 * - 보호자 계정 아래 자녀·청소년이 묶이는 실제 데이터 구조를 카드 위계로 반영
 */
export function Personas() {
  const [hero, ...rest] = USER_VALUES;
  const HeroIcon = ICON_MAP[hero.iconName] ?? UsersRound;

  return (
    <section aria-label="5 페르소나별 화면 분리" className="section">
      <div className="container-site">
        <div className="max-w-3xl">
          <p className="section-eyebrow">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
            역할별 사용
          </p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight text-rink-900 sm:text-5xl">
            같은 데이터, 다른 시선
            <br className="hidden sm:block" />
            <span className="text-ice-500">역할별 화면</span>으로 정리합니다
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-8 text-wtext-3">
            학부모를 중심에 두고 코치 · 감독이 같은 클럽을 다른 관점으로 운영합니다.
            자녀와 청소년 선수는 보호자 계정 아래 가족 프로필로 함께합니다.
          </p>
        </div>

        {/* editorial split — dominant Parent(가족 통합) + 2 support */}
        <div className="mt-12 grid gap-4 lg:grid-cols-2 lg:items-stretch">
          {/* Hero persona — Parent dominant (col-span-3) */}
          <motion.article
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="group relative flex h-full flex-col gap-7 overflow-hidden rounded-[1.5rem] bg-rink-900 p-7 text-white shadow-sh-rink motion-reduce:transition-none motion-reduce:transform-none sm:p-8 lg:p-10"
          >
            <RinkLines
              variant="faceoff"
              className="absolute -bottom-20 -right-20 z-0 h-64 w-64 text-white/[0.05]"
            />
            <div className="relative z-10 flex items-start gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ice-500 shadow-sh-2">
                <HeroIcon size={22} className="text-white" strokeWidth={1.7} />
              </span>
            </div>

            <div className="relative z-10">
              <p className="text-sm font-bold text-ice-300">
                {hero.subtitle}
              </p>
              <h3 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
                {hero.role}
              </h3>
              <p className="mt-4 max-w-md text-sm leading-7 text-white/65 sm:text-base">
                팀플러스+의 중심 사용자. 자녀별 수업 일정과 출석을 함께 관리하고 결제 흐름을 직접
                통제합니다.
              </p>
            </div>

            <ul className="relative z-10 flex flex-col gap-3 border-t border-white/10 pt-6">
              {hero.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm leading-6 text-white/80">
                  <ArrowUpRight
                    size={14}
                    className="mt-1 shrink-0 text-ice-300"
                    strokeWidth={2.2}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {/* 가족 프로필 — 자녀·청소년을 보호자 카드 안에 통합 (중첩 카드 없이 라벨+태그) */}
            {hero.family && (
              <div className="relative z-10 mt-auto flex flex-col gap-5 border-t border-white/10 pt-6">
                <p className="text-sm font-bold text-ice-300">
                  한 계정으로 함께하는 가족
                </p>
                {hero.family.map((m) => {
                  const FamilyIcon = ICON_MAP[m.iconName] ?? Baby;
                  return (
                    <div key={m.role} className="flex gap-3.5">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-ice-300">
                        <FamilyIcon size={17} strokeWidth={1.7} />
                      </span>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <h4 className="text-base font-bold text-white">{m.role}</h4>
                          <span className="text-xs font-semibold text-white/55">
                            {m.subtitle}
                          </span>
                        </div>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {m.bullets.map((b) => (
                            <li
                              key={b}
                              className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/75"
                            >
                              {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.article>

          {/* Supporting personas — Coach / Director (우측 스택) */}
          <div className="flex flex-col gap-4 sm:flex-row lg:flex-col">
            {rest.map((p, i) => {
              const Icon = ICON_MAP[p.iconName] ?? UsersRound;
              return (
                <motion.article
                  key={p.role}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT}
                  transition={{
                    duration: DUR.fast,
                    delay: stagger(i + 1),
                    ease: EASE_OUT,
                  }}
                  className="group flex flex-1 flex-col gap-5 rounded-2xl border border-wline bg-wsurface p-6 shadow-sh-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-ice-100 hover:shadow-sh-2 motion-reduce:transition-none motion-reduce:transform-none lg:p-7"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rink-900 text-white">
                      <Icon size={19} strokeWidth={1.7} />
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-bold text-ice-600">
                      {p.subtitle}
                    </p>
                    <h3 className="mt-1.5 text-xl font-extrabold leading-snug text-rink-900">
                      {p.role}
                    </h3>
                  </div>

                  <ul className="mt-auto flex flex-col gap-2.5 border-t border-wline pt-5">
                    {p.bullets.slice(0, 3).map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2.5 text-sm leading-6 text-wtext-2"
                      >
                        <ArrowUpRight
                          size={14}
                          className="mt-1 shrink-0 text-ice-500"
                          strokeWidth={2.2}
                        />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </motion.article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
