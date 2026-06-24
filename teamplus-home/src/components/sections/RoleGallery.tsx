'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { RinkLines } from '@/components/ui/RinkLines';
import { EASE_OUT } from '@/lib/motion';

/**
 * 역할별 화면 — 실제 앱 화면을 역할 탭으로 둘러보는 갤러리.
 * - 캡처(public/images/screens)된 진짜 화면 사용 · 역할당 6화면.
 * - 상단 3화면은 디바이스 프레임, 나머지는 썸네일 레일 → 클릭 시 라이트박스.
 * - gradient·blur·glow 0 · rink 시그니처 스테이지 · tablist 접근성 · reduced-motion.
 */

type Screen = { src: string; cap: string };
type Role = {
  id: string;
  tab: string;
  role: string;
  headline: string;
  desc: string;
  bullets: string[];
  screens: Screen[];
};

const S = '/images/screens';
const sc = (src: string, cap: string): Screen => ({ src, cap });

const ROLES: Role[] = [
  {
    id: 'parent',
    tab: '학부모',
    role: '보호자 화면',
    headline: '우리 아이의 하루를 한 화면에',
    desc: '자녀별 수업 일정과 출석, 수업권과 결제, 성장 리포트까지 보호자가 직접 확인하고 관리합니다.',
    bullets: ['자녀별 일정 · 출석', '결제권 · 결제 관리', '성장 · 기술 리포트'],
    screens: [
      sc(`${S}/parent/00-dashboard.png`, '학부모 홈'),
      sc(`${S}/parent/09-calendar.png`, '자녀 일정'),
      sc(`${S}/parent/06-credits.png`, '결제권'),
      sc(`${S}/parent/10-report.png`, '성장 리포트'),
      sc(`${S}/parent/04-rsvp.png`, '수업 신청'),
      sc(`${S}/parent/14-attendance-history.png`, '출석 확인'),
    ],
  },
  {
    id: 'coach',
    tab: '코치',
    role: '코치 화면',
    headline: '수업과 출석을 현장에서 정리',
    desc: '5분 일회용 QR로 출석을 받고, 수업과 정원·담당 학생을 한 화면에서 정리합니다.',
    bullets: ['QR 출석 기록', '수업 · 정원 관리', '담당 학생 현황'],
    screens: [
      sc(`${S}/coach/00-dashboard.png`, '코치 홈'),
      sc(`${S}/coach/04-qr-generate.png`, 'QR 출석'),
      sc(`${S}/coach/05-attendance.png`, '출석 관리'),
      sc(`${S}/coach/01-classes.png`, '수업 관리'),
      sc(`${S}/coach/06-members.png`, '담당 학생'),
      sc(`${S}/coach/08-training.png`, '훈련 관리'),
    ],
  },
  {
    id: 'director',
    tab: '감독',
    role: '감독 화면',
    headline: '클럽 전체를 숫자로 본다',
    desc: '운영 지표와 코치 진행률을 대시보드로 확인하고, 회원·팀·결제를 한곳에서 관리합니다.',
    bullets: ['운영 KPI 대시보드', '회원 · 코치 관리', '팀 편성 · 통계'],
    screens: [
      sc(`${S}/director/00-dashboard.png`, '감독 홈'),
      sc(`${S}/director/12-statistics.png`, '운영 통계'),
      sc(`${S}/director/13-team.png`, '팀 관리'),
      sc(`${S}/director/03-members.png`, '회원 관리'),
      sc(`${S}/director/10-credits.png`, '결제권'),
      sc(`${S}/director/08-notices.png`, '공지 관리'),
    ],
  },
];

const EASE = EASE_OUT;
const LIFT = ['sm:translate-y-3', 'sm:-translate-y-3', 'sm:translate-y-3'];

export function RoleGallery() {
  const [active, setActive] = useState(0);
  const [lb, setLb] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = ROLES[active];
  const screens = role.screens;

  const close = useCallback(() => setLb(null), []);
  const go = useCallback(
    (d: number) => setLb((i) => (i === null ? i : (i + d + screens.length) % screens.length)),
    [screens.length],
  );

  useEffect(() => {
    if (lb === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lb, close, go]);

  // 탭 변경 시 라이트박스 닫기
  useEffect(() => setLb(null), [active]);

  return (
    <section id="role-screens" aria-label="역할별 앱 화면" className="section scroll-mt-24 bg-wsurface">
      <div className="container-site">
        {/* heading */}
        <div className="max-w-2xl">
          <p className="section-eyebrow">화면 둘러보기</p>
          <h2 className="mt-5 text-3xl font-extrabold leading-tight text-rink-900 sm:text-5xl">
            역할마다 다른 화면,
            <br className="hidden sm:block" />한 앱 안에서
          </h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-wtext-3">
            학부모 · 코치 · 감독이 같은 클럽을 각자의 화면으로 운영합니다. 실제 앱 화면을
            눌러 크게 살펴보세요.
          </p>
        </div>

        {/* segmented tabs */}
        <div
          role="tablist"
          aria-label="역할 선택"
          className="no-scrollbar mt-9 flex gap-1.5 overflow-x-auto rounded-full border border-wline bg-wbg p-1.5"
        >
          {ROLES.map((r, i) => {
            const on = i === active;
            return (
              <button
                key={r.id}
                role="tab"
                type="button"
                aria-selected={on}
                aria-controls={`panel-${r.id}`}
                onClick={() => setActive(i)}
                className={[
                  'shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus-visible:ring-offset-wbg',
                  on ? 'bg-ice-500 text-white shadow-sh-2' : 'text-wtext-2 hover:text-rink-900',
                ].join(' ')}
              >
                {r.tab}
              </button>
            );
          })}
        </div>

        {/* panel */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-12">
          {/* left — narrative */}
          <div id={`panel-${role.id}`} role="tabpanel" aria-label={`${role.tab} 화면`} className="relative min-h-[240px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.38, ease: EASE }}
                className="motion-reduce:transition-none"
              >
                <span className="text-sm font-bold text-ice-600">
                  {role.role}
                </span>
                <h3 className="mt-3 text-2xl font-extrabold leading-snug text-rink-900 sm:text-3xl">
                  {role.headline}
                </h3>
                <p className="mt-4 max-w-md text-sm leading-7 text-wtext-3 sm:text-base">{role.desc}</p>
                <ul className="mt-6 flex flex-col gap-2.5">
                  {role.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-3 text-sm font-semibold text-rink-900">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ice-50 ring-1 ring-ice-100">
                        <span className="h-1.5 w-1.5 rounded-full bg-ice-500" />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/features"
                  className="mt-7 inline-flex items-center gap-1.5 text-sm font-bold text-ice-600 transition-colors hover:text-ice-700"
                >
                  앱 기능 자세히 보기
                  <ArrowUpRight size={15} strokeWidth={2.4} />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* right — phone stage */}
          <div className="relative isolate overflow-hidden rounded-[2rem] border border-wline bg-wbg p-6 sm:p-8">
            <RinkLines variant="faceoff" className="absolute -right-16 -top-16 z-0 h-64 w-64 text-ice-200/70" />
            <AnimatePresence mode="wait">
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.42, ease: EASE }}
                className="relative z-10"
              >
                {/* featured 3 */}
                <div className="no-scrollbar flex justify-start gap-4 overflow-x-auto sm:justify-center sm:overflow-visible">
                  {screens.slice(0, 3).map((s, i) => (
                    <figure key={s.src} className={`flex shrink-0 flex-col items-center ${LIFT[i]} motion-reduce:transform-none`}>
                      <button
                        type="button"
                        onClick={() => setLb(i)}
                        aria-label={`${s.cap} 화면 크게 보기`}
                        className="group relative w-[150px] rounded-[2.4rem] transition-transform duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-4 focus-visible:ring-offset-wbg motion-reduce:transform-none sm:w-[168px]"
                      >
                        <PhoneFrame src={s.src} alt={`${role.tab} ${s.cap} 화면`} sizes="168px" />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[2.4rem] bg-rink-900/0 opacity-0 transition-all duration-300 group-hover:bg-rink-900/15 group-hover:opacity-100">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-wsurface text-rink-900 shadow-sh-2">
                            <Maximize2 size={15} />
                          </span>
                        </span>
                      </button>
                      <figcaption className="mt-3.5 inline-flex items-center rounded-full bg-wsurface px-3 py-1 text-[11px] font-bold text-wtext-2 ring-1 ring-wline">
                        {s.cap}
                      </figcaption>
                    </figure>
                  ))}
                </div>

                {/* thumbnail rail — 나머지 화면 */}
                {screens.length > 3 && (
                  <div className="mt-7 border-t border-wline pt-5">
                    <p className="mb-3 text-xs font-bold text-wtext-4">
                      더 많은 화면
                    </p>
                    <div className="no-scrollbar flex gap-3 overflow-x-auto">
                      {screens.slice(3).map((s, j) => (
                        <button
                          key={s.src}
                          type="button"
                          onClick={() => setLb(3 + j)}
                          aria-label={`${s.cap} 화면 크게 보기`}
                          className="group shrink-0 focus-visible:outline-none"
                          title={s.cap}
                        >
                          <span className="relative block aspect-[1320/2868] w-[64px] overflow-hidden rounded-xl border border-wline bg-wbg ring-0 transition-all group-hover:border-ice-300 group-focus-visible:ring-2 group-focus-visible:ring-ice-500">
                            <Image src={s.src} alt={`${role.tab} ${s.cap}`} fill sizes="64px" className="object-cover object-top" />
                          </span>
                          <span className="mt-1.5 block max-w-[64px] truncate text-center text-[10px] font-semibold text-wtext-3">
                            {s.cap}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 라이트박스 — 화면 크게 보기 (portal → 고정 헤더 위로 보장) */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {lb !== null && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="앱 화면 크게 보기"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            style={{ backgroundColor: 'rgba(20, 24, 38, 0.92)' }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-5 motion-reduce:transition-none"
          >
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={20} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label="이전 화면"
              className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-8"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label="다음 화면"
              className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-8"
            >
              <ChevronRight size={24} />
            </button>

            <motion.figure
              key={screens[lb].src}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center motion-reduce:transition-none"
            >
              <div className="w-[clamp(220px,72vw,300px)]">
                <PhoneFrame src={screens[lb].src} alt={`${role.tab} ${screens[lb].cap} 화면`} priority sizes="300px" />
              </div>
              <figcaption className="mt-5 flex items-center gap-2.5 text-sm font-bold text-white">
                <span className="text-xs font-bold text-ice-300">
                  {role.role}
                </span>
                {screens[lb].cap}
                <span className="font-num text-[11px] font-medium text-white/55">
                  {lb + 1} / {screens.length}
                </span>
              </figcaption>
            </motion.figure>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </section>
  );
}
