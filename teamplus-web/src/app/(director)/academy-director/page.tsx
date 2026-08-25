'use client';

/**
 * 오픈클래스 감독 메인화면 (P1 — 2026-05-13)
 *
 * DirectorDashboardPage 의 `isAcademyDirector` 분기를 단독 페이지로 추출.
 * (director) 라우트 그룹 내부에 위치하므로 layout 가드는 동일하게 통과한다.
 *
 * 회의록(2026-04-23) 정책 반영 포인트:
 *  · 운영 단위 = Academy (팀 아님) → listMyAcademies()
 *  · "오픈클래스" 사용자 노출 라벨 (URL/식별자는 academy 유지)
 *
 * 진행 예정 (P2~P3):
 *  · DirectorPendingApprovals → AcademyEnrollments 교체 (회의록상 오픈클래스은 멤버 승인 없음)
 *  · 결제/이월 패널 추가 (선불·다음 달 이월 정책)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SectionHead, WalletAppBar } from '@/components/wallet';
import { HomeIdentityStrip } from '@/components/common/HomeIdentityStrip';
import { BrandWordmark } from '@/components/common/BrandWordmark';
import {
  ClassCalendarSection,
  getDashboardScheduleView,
  SelectedDayClassList,
  type SelectedClassesPayload,
} from '@/components/dashboard/ClassCalendarSection';
import { WeekScheduleList } from '@/components/dashboard/WeekScheduleList';
import { RecentNoticesSection } from '@/components/dashboard/RecentNoticesSection';
import {
  TeamClassesSummary,
  type TeamClassesSummaryActivity,
} from '@/components/dashboard/TeamClassesSummary';
import { ReadingContentSection } from '@/components/dashboard/ReadingContentSection';
// PR-E M1 보정 (2026-05-15): DirectorPendingApprovals 제거.
//   회의록 §4.6 정합 — 오픈클래스는 멤버 승인 절차가 없음 (학원 가입 ≠ 팀 가입 승인).
//   기존 컴포넌트는 academyId 를 teamId 로 잘못 매핑하여 /teams/{academyId}/members 404 가능성.
//   향후 P2 작업에서 AcademyEnrollments (수강 신청 관리) 신규 위젯 도입 시 이 자리에 추가.
import { DirectorEmptyCard } from '@/components/director/DirectorEmptyCard';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useStableLayout } from '@/hooks/useStableLayout';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { MESSAGES } from '@/lib/messages';
import { listMyAcademies, type AcademyListItem } from '@/services/academy.service';

const GlobalMenu = dynamic(
  () => import('@/components/layout/GlobalMenu').then((m) => ({ default: m.GlobalMenu })),
  { ssr: false },
);

interface AcademyRef {
  id: string;
  name: string;
  /** 오픈클래스(아카데미) 대표 이미지 — Hero 카드 우측 표시 (2026-05-25) */
  imageUrl?: string | null;
}

function pickAcademyName(a: AcademyListItem): string {
  const base = a.name?.trim() || MESSAGES.dashboard.unspecifiedTeam;
  const code = a.code?.trim();
  return code ? `${base}(${code})` : base;
}

export default function AcademyDirectorDashboardPage() {
  const { navigate } = useNavigation();
  const { unreadCount } = useNotificationContext();
  const [academies, setAcademies] = useState<AcademyRef[] | null>(null);
  // 아카데미 조회 실패를 빈 목록(미생성 확정)과 구분 — 실패를 미생성으로 오인하면 포스트가
  //   잘못 승격되고 '오픈클래스 만들기' CTA 가 잘못 노출된다 (SPEC_DASHBOARD_READING_CONTENT §2-4 v1.4).
  const [academiesError, setAcademiesError] = useState(false);
  const [selection, setSelection] = useState<SelectedClassesPayload>({ dateKey: null, classes: [], weekGroups: [] });
  const scheduleView = getDashboardScheduleView(selection);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);
  // 포스트 배치 판정용 훈련 조회 결과 — TeamClassesSummary 첫 조회 1회 발화(대회 축 없음).
  const [activity, setActivity] = useState<TeamClassesSummaryActivity | null>(null);

  // v16.3 (2026-05-16): useStableLayout — main wrapper ResizeObserver 기반 layout 안정화 감지.
  // sub-component (ClassCalendarSection, RecentNoticesSection 등) mount/paint 완료 보장.
  // SoT: SPEC_LOADING_STABLE_PAINT.md §2.1.
  const mainRef = useRef<HTMLElement>(null);
  // [성능 2026-05-28 P0-A] 400→220ms. [2026-05-30 LD-04] 220→150ms. 레이아웃 디바운스 윈도우 단축 (데이터·이미지·폰트는 별도 신호가 보장).
  const isLayoutStable = useStableLayout(mainRef, { stableMs: 150 });

  // 풀스크린 로더 fast-path (v16.3, 2026-05-16) — academies + 캘린더 paint + layout stable 합성.
  // SoT: LOADING_TIMING_POLICY.md §11 (데이터+셋팅 완료 전 hide 절대 금지)
  // 오픈클래스 수업 목록 카드 — 운영 academy 단일 가정(첫 academy 기준).
  const academyId = academies?.[0]?.id ?? null;
  usePageReady(
    academies !== null && calendarReady && isLayoutStable && (!academyId || summaryReady),
  );

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: false,
    showMenuButton: false,
    isDataLoaded: academies !== null,
  });

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listMyAcademies();
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setAcademiesError(false);
        setAcademies(
          res.data.map((a) => ({
            id: a.id,
            name: pickAcademyName(a),
            imageUrl: a.imageUrl ?? null,
          })),
        );
      } else {
        // 조회 실패 — 화면 골격 유지를 위해 빈 목록은 그대로 두되, 실패 플래그로
        //   "미생성 확정(success-empty)" 판정과 분리한다.
        setAcademiesError(true);
        setAcademies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 정체성 스트립 — "{이름} 감독" + 오픈클래스명(끝의 (코드) 표기는 제거). 없으면 직책만.
  const { user } = useSessionAuth();
  const userName = user?.name?.trim();
  const namePart = userName ? `${userName} 감독` : '감독';
  const academyNames =
    academies && academies.length > 0
      ? academies.map((a) => a.name.replace(/\s*\([^()]*\)\s*$/, '').trim()).join(' · ')
      : null;

  // 미생성 확정(success-empty) = 목록 조회가 정상 완료된 뒤의 빈 결과만. 실패는 미생성이 아니다.
  const noAcademyConfirmed =
    academies !== null && !academiesError && academies.length === 0;
  // 포스트 배치 — loading(null)=미확정(미렌더) / 미생성 확정=승격 / 조회 실패=기본 최하단 /
  //   아카데미 존재 시 훈련 조회 결과(success && 0건)만 승격 (SPEC §2-4 v1.4).
  const readingPlacement: 'promoted' | 'footer' | null = (() => {
    if (academies === null) return null;
    if (academiesError) return 'footer';
    if (academies.length === 0) return 'promoted';
    if (activity === null) return null;
    return activity.status === 'success' && activity.classCount === 0
      ? 'promoted'
      : 'footer';
  })();

  return (
    <MobileContainer hasBottomNav>
      {/* 헤더 — 좌측 '팀플러스+' 이미지 워드마크 (h1 시맨틱 유지). 정체성(이름·오픈클래스)은 HomeIdentityStrip 전담. */}
      <WalletAppBar
        title=""
        titleLeading={
          <h1 className="flex items-center">
            <BrandWordmark className="h-5" />
          </h1>
        }
        timelineBadge={unreadCount > 0 ? unreadCount : undefined}
        onSearch={() => navigate('/search')}
        onTimeline={() => navigate('/timeline')}
        onMy={() => navigate('/notifications')}
        onMenu={openMenu}
      />
      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="오픈클래스 감독 홈"
      >
        {/* 정체성 스트립 — 헤더에서 분리한 이름·직책·오픈클래스 표시 (공용 HomeIdentityStrip). */}
        <HomeIdentityStrip
          logoUrl={academies?.[0]?.imageUrl ?? null}
          // fallbackInitial 미전달 = 아이콘 폴백. 오픈클래스는 팀이 아니므로 팀 아이콘이 아니라
          //  academies/[id]·academy/[id]·AcademyCard 와 같은 `school` 을 쓴다.
          fallbackIcon="school"
          title={namePart}
          subline={academyNames}
        />
        {/* 캘린더 데이터·풀스크린 로더 신호는 아래 월 달력 섹션이 함께 공급한다. */}

        {/* [2026-06-09] 오픈클래스 홈 — 공지사항 숨김 처리 (사용자 요청). */}
        {false && <RecentNoticesSection viewAllHref="/director-notices" iceTheme />}

        {/* 회원 승인 영역 — 오픈클래스는 멤버 승인 절차 없음 (회의록 §4.6).
              P2 에서 AcademyEnrollments(수강 신청 관리) 위젯 신설 후 이 자리에 추가 예정. */}

        {/* 0. 미생성 확정 — 선행 필수 행동(오픈클래스 생성) CTA 를 먼저, 그 다음 포스트.
            /academy-classes/create 는 아카데미가 없으면 훈련 폼 대신 생성 안내를 표시하므로
            여기서는 훈련 등록 CTA 를 노출하지 않는다 (SPEC §2-4 v1.4 · classes-manage/create 와 동일 문구). */}
        {noAcademyConfirmed && (
          <section
            className="mt-2 flex flex-col items-center bg-it-surface px-8 py-10 text-center dark:bg-it-blue-950"
            aria-label={MESSAGES.academy.noAcademyTitle}
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
              <Icon name="school" className="text-3xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
            </div>
            <h2 className="mb-2 text-card-section font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
              {MESSAGES.academy.noAcademyTitle}
            </h2>
            <p className="mb-6 text-card-body leading-relaxed text-it-ink-500 dark:text-rink-300">
              {MESSAGES.academy.noAcademyDescription}
            </p>
            <NavLink
              href="/academy/create"
              className="inline-flex h-12 items-center justify-center rounded-w-md bg-it-blue-500 px-6 text-card-body font-extrabold tracking-[-0.02em] text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50 focus-visible:ring-offset-2"
            >
              {MESSAGES.academy.createAcademyCta}
            </NavLink>
          </section>
        )}

        {/* 0.5 포스트(승격 · 미생성) — 오픈클래스 생성 CTA 다음. */}
        {noAcademyConfirmed && readingPlacement === 'promoted' && (
          <ReadingContentSection placement="promoted" iceTheme />
        )}

        {/* 1. 수업 목록 — 오픈클래스 수업 요약 (달력 위). 대회·등록완료 배지 없음. */}
        {academyId && (
          <TeamClassesSummary
            classesEndpoint={`/academies/${academyId}/classes`}
            showTournament={false}
            showEnrollment={false}
            targetPath="/classes-manage"
            onReady={setSummaryReady}
            onActivityResolved={setActivity}
            emptyActions={[
              // 오픈클래스 감독 — 훈련 등록만(대회 축 없음). 오픈클래스 전용 등록 화면으로 이동.
              { label: MESSAGES.classesEdit.addSheet.classRegister, href: '/academy-classes/create' },
            ]}
            iceTheme
          />
        )}

        {/* 1.5 포스트(승격 · 훈련 0건) — 훈련 등록 CTA 다음, 캘린더 이전. */}
        {academyId && readingPlacement === 'promoted' && (
          <ReadingContentSection placement="promoted" iceTheme />
        )}

        {/* 2. 수업 일정 — 기본은 이번 주, 날짜 선택 중에는 해당 날짜 일정으로 하단 목록 동기화. */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <SectionHead title={MESSAGES.dashboard.classSchedule} iceTheme />
          <div className="px-4 sm:px-5 pb-3">
            <ClassCalendarSection
              teamIds={[]}
              academies={academies ?? []}
              onSelectionChange={setSelection}
              selectionMode="week-default"
              onReady={setCalendarReady}
              legendVariant="academy"
              iceTheme
            />
          </div>
        </section>

        {/* 3. 선택 없음=이번 주, 선택 있음=해당 날짜 일정. 오픈클래스 관리 액션 유지. */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <SectionHead
            title={scheduleView.title}
            action="전체 일정 보기 ›"
            onActionClick={() => navigate('/academy-schedules')}
            iceTheme
          />
          <div className="px-4 sm:px-5 pb-3">
            {scheduleView.groups.length === 0 ? (
              <DirectorEmptyCard
                variant="today-class"
                message={MESSAGES.dashboard.weekSchedule.noRemaining}
                iceTheme
              />
            ) : (
              <WeekScheduleList
                groups={scheduleView.groups}
                collapsePast={!scheduleView.isDateSelected}
                renderDayClasses={(classes) => (
                  <SelectedDayClassList
                    classes={classes}
                    canManage
                    bare
                    emptyMessage={scheduleView.isDateSelected ? MESSAGES.calendar.noEvents : undefined}
                    iceTheme
                  />
                )}
                iceTheme
              />
            )}
          </div>
        </section>

        {/* 포스트(기본 최하단) — 훈련 존재 또는 조회 실패(미생성 오인 금지) 시 여기. */}
        {readingPlacement === 'footer' && (
          <ReadingContentSection placement="footer" iceTheme />
        )}

      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
