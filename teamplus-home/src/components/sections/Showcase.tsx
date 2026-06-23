'use client';

import { motion } from 'framer-motion';
import { Bell, CalendarCheck, ShieldCheck, type LucideIcon } from 'lucide-react';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { DUR, EASE_OUT, VIEWPORT, revealUp, stagger } from '@/lib/motion';

/**
 * 실제 앱 화면 — 스크린샷 3화면 (일정 · 수업/결제 · 팀 관리)
 * - 손으로 그린 가짜 UI 대신 실제 캡처를 프리미엄 디바이스 프레임에 담음
 * - gradient 0 · blur 0 · 컬러 그림자 0 · 카드별 stagger
 */

type Screen = {
  src: string;
  title: string;
  description: string;
  badge: string;
  badgeTone: 'ice' | 'mint' | 'flame';
};

const screens: Screen[] = [
  {
    src: '/images/app-schedule.png',
    title: '수업 일정',
    description: '정규·스팟훈련·대회를 한 캘린더에서 한눈에 관리합니다.',
    badge: '일정',
    badgeTone: 'ice',
  },
  {
    src: '/images/app-classes.png',
    title: '수업 · 결제',
    description: '수강 신청부터 크레딧·결제까지 하나의 흐름으로 이어집니다.',
    badge: '수업',
    badgeTone: 'mint',
  },
  {
    src: '/images/app-team.png',
    title: '팀 관리',
    description: '선수·하위그룹·전적·출석률을 한 화면에서 정리합니다.',
    badge: '클럽',
    badgeTone: 'flame',
  },
];

// 토큰 규율(P1-6): Tailwind 기본 팔레트(emerald/rose -50/700/200) 대신 정의된
// accent.* 토큰을 마커 수준(텍스트·링·옅은 tint)으로만 사용. 면 채움·무지개 금지.
const BADGE_TONES: Record<Screen['badgeTone'], string> = {
  ice: 'bg-ice-50 text-ice-700 ring-ice-100',
  // 밝은 액센트 텍스트는 옅은 동색 tint 위 대비 미달(2.5~3.7:1) → 어두운 텍스트로 가독성 확보,
  // 색 정체성은 tint(bg)+ring 으로 유지 (ice 칩과 동일한 dark-text 패턴)
  mint: 'bg-accent-emerald/10 text-rink-800 ring-accent-emerald/30',
  flame: 'bg-accent-rose/10 text-rink-800 ring-accent-rose/30',
};

// 중앙 카드를 살짝 띄워 비대칭 리듬 부여
const LIFT = ['lg:translate-y-4', 'lg:-translate-y-4', 'lg:translate-y-4'];

const traits: { icon: LucideIcon; label: string; description: string }[] = [
  {
    icon: CalendarCheck,
    label: '수업 전 확인',
    description: '수업 일정과 준비 상태를 보호자가 먼저 확인합니다.',
  },
  {
    icon: ShieldCheck,
    label: '아동 화면 인증',
    description: '72×72dp 터치 · 7:1 대비 · WCAG AAA 기준으로 설계합니다.',
  },
  {
    icon: Bell,
    label: '알림 자동화',
    description: '출석·공지·결제 알림이 클럽 운영 흐름과 연결됩니다.',
  },
];

export function Showcase() {
  return (
    <section
      id="app-preview"
      aria-label="실제 앱 화면 미리보기"
      className="section scroll-mt-24 bg-wsurface"
    >
      <div className="container-site">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">실제 앱 화면</p>
            <h2 className="mt-5 max-w-2xl text-3xl font-extrabold leading-tight text-rink-900 sm:text-5xl">
              실제 앱의 표정이
              <br className="hidden sm:block" />
              홈페이지의 중심이 됩니다
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-wtext-3">
            연출된 목업이 아니라, 감독·코치·학부모가 매일 마주하는 실제 화면 그대로를 보여줍니다.
          </p>
        </div>

        <div className="mt-16 grid gap-12 sm:gap-8 md:grid-cols-3">
          {screens.map((screen, i) => (
            <motion.div
              key={screen.title}
              {...revealUp}
              viewport={VIEWPORT}
              transition={{
                duration: DUR.slow,
                delay: stagger(i),
                ease: EASE_OUT,
              }}
              className={`flex flex-col items-center ${LIFT[i]} motion-reduce:transform-none motion-reduce:transition-none`}
            >
              <div className="w-full max-w-[260px] transition-transform duration-500 ease-out hover:-translate-y-2 motion-reduce:transform-none">
                <PhoneFrame
                  src={screen.src}
                  alt={`팀플러스 ${screen.title} 화면`}
                  sizes="(max-width: 768px) 70vw, 260px"
                />
              </div>

              <div className="mt-7 w-full max-w-[300px] text-center">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${
                    BADGE_TONES[screen.badgeTone]
                  }`}
                >
                  {screen.badge}
                </span>
                <h3 className="mt-3 text-lg font-extrabold text-rink-900">{screen.title}</h3>
                <p className="mt-2 text-sm leading-6 text-wtext-3">{screen.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-wline bg-wline sm:grid-cols-3">
          {traits.map((t) => (
            <div
              key={t.label}
              className="flex gap-3 bg-wsurface p-6"
            >
              <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-ice-600" />
              <div>
                <p className="text-sm font-extrabold text-rink-900">
                  {t.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-wtext-3">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
