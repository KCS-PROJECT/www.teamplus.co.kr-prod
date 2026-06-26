'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles,
  QrCode,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { HERO, HERO_FEATURES, HERO_PROOF, APP_DOWNLOAD } from '@/lib/content';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { StoreBadge } from '@/components/ui/StoreBadge';
import { DUR, EASE_OUT, stagger } from '@/lib/motion';

/** 피처 카드 아이콘 — content.ts 의 icon 문자열 → lucide 컴포넌트 매핑 */
const FEATURE_ICONS: Record<string, LucideIcon> = {
  QrCode,
  TrendingUp,
  ShieldCheck,
};

export function Hero() {
  return (
    <section
      aria-label="TEAMPLUS 메인 소개"
      className="relative isolate overflow-hidden pt-24 pb-20 sm:pt-32 lg:pb-28"
    >
      <BackgroundMesh variant="hero" />

      <div className="container-site">
        <div className="grid items-center gap-14 md:grid-cols-[0.86fr_1.14fr] md:items-start md:gap-8 lg:grid-cols-[0.98fr_1.02fr] lg:items-center lg:gap-16">
          {/* Left — copy block */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE_OUT }}
            className="max-w-2xl md:max-w-none lg:max-w-2xl"
          >
            <h1 className="text-[clamp(2.15rem,4.9vw,4.25rem)] font-black leading-[1.04] tracking-normal text-rink-900">
              <span className="block">{HERO.headlineTop}</span>
              <span className="mt-1.5 block pb-1 text-ice-600">
                {HERO.headlineAccent}
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-wtext-3 sm:text-lg">
              {HERO.subCopy}
            </p>

            {/* CTA — 작동하는 1차 행동(도입 상담) + 2차(기능 보기). 앱 다운로드는 출시 전이라 하단에 '출시 예정'으로 분리. */}
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/contact"
                className="btn-primary group w-full px-7 py-3.5 text-base sm:w-auto"
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
                className="btn-ghost w-full px-7 py-3.5 text-base sm:w-auto"
              >
                앱 기능 둘러보기
              </Link>
            </div>

            {/* 핵심 기능 — 카드 장식 대신 운영 메모처럼 가볍게 노출 */}
            <div className="mt-10 grid grid-cols-1 border-y border-wline sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              {HERO_FEATURES.map((f, i) => {
                const Icon = FEATURE_ICONS[f.icon] ?? Sparkles;
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: DUR.fast,
                      delay: 0.3 + stagger(i),
                      ease: EASE_OUT,
                    }}
                    className="flex h-full items-start gap-3 border-t border-wline py-4 first:border-t-0 motion-reduce:transition-none motion-reduce:transform-none sm:border-t-0 sm:border-l sm:px-5 sm:first:border-l-0 md:border-l-0 md:border-t md:px-0 md:first:border-t-0 lg:border-l lg:border-t-0 lg:px-5 lg:first:border-l-0"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ice-50 text-ice-600 ring-1 ring-ice-100">
                      <Icon size={18} aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-rink-900">{f.title}</p>
                      <p className="mt-1.5 text-[13px] leading-5 text-wtext-3">{f.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* 신뢰 라인 — 검증 가능한 제품 사실만(날조 수치 제거). dot 마커로 절제 노출. */}
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-wline pt-6"
            >
              {HERO_PROOF.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-wtext-2"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ice-500" aria-hidden />
                  {p}
                </li>
              ))}
            </motion.ul>

            {/* 앱 다운로드 — 출시 전이라 '출시 예정' 비활성 상태로 정직하게 표기(깨진 버튼 인상 방지) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-wtext-4">
                <Sparkles size={13} aria-hidden />앱 출시 예정
              </span>
              <div className="flex gap-2.5">
                <StoreBadge
                  store="apple"
                  href={APP_DOWNLOAD.appStore}
                  className="scale-90 origin-left"
                />
                <StoreBadge
                  store="google"
                  href={APP_DOWNLOAD.googlePlay}
                  className="scale-90 origin-left"
                />
              </div>
            </motion.div>
          </motion.div>

          {/* Right — reference-style dual device showcase */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, delay: 0.15, ease: EASE_OUT }}
            className="relative mx-auto h-[420px] w-full max-w-[440px] overflow-visible sm:h-[540px] sm:max-w-[580px] md:h-[520px] md:max-w-[500px] lg:h-[620px] lg:max-w-[700px]"
          >
            {/* calm product stage, clipped by the hero section like the reference image */}
            <div
              aria-hidden
              className="absolute bottom-8 left-[7%] right-[-10%] top-[13%] rounded-[2.75rem] bg-ice-50 ring-1 ring-ice-100 sm:bottom-10 sm:right-[-7%] lg:left-[4%] lg:right-[-20%]"
            />

            {/* secondary phone — right device, deliberately larger and partly outside the stage */}
            <div
              aria-hidden
              className="absolute right-[-4%] top-[22%] z-[1] w-[48%] min-w-[182px] max-w-[290px] sm:right-[-7%] sm:top-[19%] sm:w-[46%] sm:max-w-[320px] lg:right-[-18%] lg:top-[17%] lg:w-[44%]"
            >
              <PhoneFrame
                src="/images/app-schedule.png"
                alt=""
                sizes="(max-width: 768px) 48vw, 320px"
                side="right"
                className="origin-center [transform:perspective(980px)_rotateY(-16deg)_rotateZ(15deg)]"
              />
            </div>

            {/* primary phone — current app home, forward and larger like the supplied reference */}
            <div className="absolute left-[7%] top-[5%] z-[3] w-[64%] min-w-[238px] max-w-[350px] sm:left-[6%] sm:top-[2%] sm:w-[60%] sm:max-w-[380px] lg:left-[3%] lg:top-[1%] lg:w-[58%]">
              <PhoneFrame
                src="/images/app-home.png"
                alt="팀플러스 감독 홈 대시보드: 팀 공지·승인 대기·오늘의 훈련"
                priority
                sizes="(max-width: 768px) 64vw, 380px"
                side="right"
                className="origin-center [transform:perspective(1280px)_rotateX(1.5deg)_rotateY(-6deg)_rotateZ(-8deg)]"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
