import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageHero';
import { SolutionPillars } from '@/components/sections/SolutionPillars';
import { Stats } from '@/components/sections/Stats';
import { RoleGallery } from '@/components/sections/RoleGallery';
import { StoreBadge } from '@/components/ui/StoreBadge';
import { APP_DOWNLOAD } from '@/lib/content';

export const metadata: Metadata = {
  title: '솔루션 소개',
  description:
    'Flutter + Next.js 하이브리드 아키텍처, 엔터프라이즈 보안, 1초 SLA 성능, 운영 자동화 — TEAMPLUS 이 왜 아이스하키 클럽에 최적의 선택인지 자세히 알려드립니다.',
};

const TIMELINE = [
  {
    year: '2024',
    phase: 'Foundation',
    items: [
      '아이스하키 클럽 현장 리서치 · 코치 · 학부모 50명 인터뷰',
      'Flutter + Next.js 하이브리드 아키텍처 설계',
    ],
  },
  {
    year: '2025',
    phase: 'MVP',
    items: [
      '회원·수업·출석·결제·크레딧 MVP 출시',
      'KG이니시스 · 카카오 Alimtalk 공식 연동',
    ],
  },
  {
    year: '2026 Q1',
    phase: 'Growth',
    items: [
      '대회·리그·픽업매치 런칭',
      '관리자 대시보드 86개 페이지 전면 개편',
    ],
  },
  {
    year: '2026 Q2',
    phase: 'Scale',
    items: [
      'API Lifecycle · 1초 SLA 성능 세트',
      'ISMS 인증 준비 · Enterprise 플랜 공개',
    ],
  },
];

const HERO_TRUST = ['운영 진단 후 도입 설계', '데이터 이관·권한 세팅 지원', '학부모·코치 온보딩 제공'];

export default function SolutionPage() {
  return (
    <>
      <PageHero
        eyebrow="클럽 도입"
        title={
          <>
            빙상 위 모든 순간을,{' '}
            <br className="hidden sm:block" />
            <span className="text-ice-500">한 플랫폼에서</span>
          </>
        }
        description="팀플러스+는 회원 모집, 수업 편성, QR 출석, 결제·크레딧, 공지까지 클럽 운영의 반복 업무를 하나의 운영 흐름으로 연결합니다. 작은 아카데미부터 복수 팀을 운영하는 클럽까지, 권한과 화면을 역할별로 나눠 안정적으로 도입할 수 있습니다."
        primary={{ src: '/images/app-team.png', alt: '팀플러스 팀 관리 앱 화면' }}
        secondary={{ src: '/images/app-home.png', alt: '' }}
      >
        {/* 히어로 도입 CTA */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <StoreBadge
            store="apple"
            href={APP_DOWNLOAD.appStore}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
          <StoreBadge
            store="google"
            href={APP_DOWNLOAD.googlePlay}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-wtext-4">
          {HERO_TRUST.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-ice-500" />
              {t}
            </span>
          ))}
        </div>
      </PageHero>

      <Stats />
      <SolutionPillars />
      <RoleGallery />

      {/*
       * Journey timeline — horizontal step flow (editorial)
       * - 좌측 sticky 헤딩 + 우측 4 step 가로 흐름 (연결선 포함)
       * - 4 등가 stack 탈피 → progress sequence 강조
       */}
      <section aria-label="TEAMPLUS 발전 타임라인" className="section relative">
        <div className="container-site">
          <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:gap-16">
            <div className="lg:sticky lg:top-32">
              <span className="section-eyebrow">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
                JOURNEY
              </span>
              <h2 className="mt-6 text-3xl font-extrabold leading-tight text-rink-900 sm:text-4xl lg:text-5xl">
                우리가 걸어온
                <br className="hidden sm:block" />
                <span className="text-ice-500">발자취</span>
              </h2>
              <p className="mt-6 max-w-md text-sm leading-7 text-wtext-3">
                현장 인터뷰부터 ISMS 인증 준비까지, 4 단계 흐름으로 정리한 TEAMPLUS의 24개월
                여정입니다.
              </p>
            </div>

            <ol className="relative space-y-4">
              {/* 연결선 */}
              <span
                aria-hidden
                className="absolute left-[27px] top-4 bottom-4 hidden w-px bg-wline lg:block"
              />
              {TIMELINE.map((t, i) => (
                <li
                  key={t.year}
                  className="relative flex gap-5 rounded-[var(--radius-card)] border border-wline bg-wsurface p-6 shadow-sh-1 transition-colors hover:border-ice-100 sm:p-7"
                >
                  {/* Step number */}
                  <div className="flex shrink-0 flex-col items-center gap-3">
                    <span className="font-num relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-rink-900 text-xs font-black uppercase tracking-wider text-white shadow-sh-rink">
                      0{i + 1}
                    </span>
                    {i < TIMELINE.length - 1 && (
                      <span
                        aria-hidden
                        className="h-full min-h-4 w-px bg-wline lg:hidden"
                      />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-baseline gap-3">
                      <span className="font-num text-lg font-black tracking-tight text-rink-900">
                        {t.year}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ice-600">
                        {t.phase}
                      </span>
                    </div>

                    <ul className="mt-4 space-y-2.5 text-sm text-wtext-2 sm:text-[15px]">
                      {t.items.map((item) => (
                        <li key={item} className="flex items-start gap-2.5">
                          <span
                            className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-ice-500"
                            aria-hidden
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
