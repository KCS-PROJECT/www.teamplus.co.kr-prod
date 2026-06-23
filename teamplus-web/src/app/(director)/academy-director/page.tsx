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

import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SectionHead, WalletAppBar } from '@/components/wallet';
import {
  ClassCalendarSection,
  SelectedDayClassList,
  type CalendarClass,
} from '@/components/dashboard/ClassCalendarSection';
import { WeekScheduleList } from '@/components/dashboard/WeekScheduleList';
import { RecentNoticesSection } from '@/components/dashboard/RecentNoticesSection';
import { TeamClassesSummary } from '@/components/dashboard/TeamClassesSummary';
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

interface Selection {
  dateKey: string | null;
  classes: CalendarClass[];
  // [2026-06-09] 이번주 수업 있는 날 그룹 — 홈 '이번주 일정' 표시용.
  weekGroups: { dateKey: string; classes: CalendarClass[] }[];
}

export default function AcademyDirectorDashboardPage() {
  const { navigate } = useNavigation();
  const { unreadCount } = useNotificationContext();
  const [academies, setAcademies] = useState<AcademyRef[] | null>(null);
  const [selection, setSelection] = useState<Selection>({ dateKey: null, classes: [], weekGroups: [] });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);

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
        setAcademies(
          res.data.map((a) => ({
            id: a.id,
            name: pickAcademyName(a),
            imageUrl: a.imageUrl ?? null,
          })),
        );
      } else {
        setAcademies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 헤더 타이틀 — "{이름} 감독 / {오픈클래스명}" (끝의 (코드) 표기는 제거). 없으면 직책만.
  const { user } = useSessionAuth();
  const userName = user?.name?.trim();
  const namePart = userName ? `${userName} 감독` : '감독';
  const academyNames =
    academies && academies.length > 0
      ? academies.map((a) => a.name.replace(/\s*\([^()]*\)\s*$/, '').trim()).join(' · ')
      : null;
  const headerTitle = academyNames ? `${namePart} / ${academyNames}` : namePart;

  return (
    <MobileContainer hasBottomNav>
      <WalletAppBar
        title={headerTitle}
        timelineBadge={unreadCount > 0 ? unreadCount : undefined}
        onSearch={() => navigate('/search')}
        onTimeline={() => navigate('/timeline')}
        onMy={() => navigate('/notifications')}
        onMenu={openMenu}
      />
      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto bg-wbg dark:bg-puck"
        role="main"
        aria-label="오픈클래스 감독 홈"
      >
        {/* 캘린더 데이터·풀스크린 로더 신호는 아래 월 달력 섹션이 함께 공급한다. */}

        {/* [2026-06-09] 오픈클래스 홈 — 공지사항 숨김 처리 (사용자 요청). */}
        {false && <RecentNoticesSection viewAllHref="/director-notices" />}

        {/* 회원 승인 영역 — 오픈클래스는 멤버 승인 절차 없음 (회의록 §4.6).
              P2 에서 AcademyEnrollments(수강 신청 관리) 위젯 신설 후 이 자리에 추가 예정. */}

        {/* 1. 수업 목록 — 오픈클래스 수업 요약 (달력 위). 대회·등록완료 배지 없음. */}
        {academyId && (
          <TeamClassesSummary
            classesEndpoint={`/academies/${academyId}/classes`}
            showTournament={false}
            showEnrollment={false}
            targetPath="/classes-manage"
            onReady={setSummaryReady}
          />
        )}

        {/* 2. 수업 일정 — 월 달력. 날짜 클릭 시 아래 오늘 수업 갱신(초기값 오늘). */}
        <SectionHead title={MESSAGES.dashboard.classSchedule} />
        <div className="px-4 sm:px-5 pt-1">
          <ClassCalendarSection
            teamIds={[]}
            academies={academies ?? []}
            onSelectionChange={setSelection}
            onReady={setCalendarReady}
            legendVariant="academy"
          />
        </div>

        {/* 3. [2026-06-09] 이번주 일정 — 수업 있는 날만 그룹 표시. 전체 일정은 일정 페이지로. */}
        <SectionHead
          title="이번주 일정"
          action="전체 일정 보기 ›"
          onActionClick={() => navigate('/academy-schedules')}
        />
        <div className="px-4 sm:px-5">
          {selection.weekGroups.length === 0 ? (
            <DirectorEmptyCard variant="today-class" />
          ) : (
            <WeekScheduleList
              groups={selection.weekGroups}
              renderDayClasses={(classes) => (
                <SelectedDayClassList classes={classes} canManage bare />
              )}
            />
          )}
        </div>

        {/* [수정 2026-05-30] 하단 여백 — BottomNav · iOS safe-area 통합.
              종전 `h-8`(32px 고정)은 노치/홈인디케이터 단말에서 마지막 카드가 BottomNav 에
              가려지던 회귀를 유발(코치·감독 홈과 동일 패턴으로 정렬). SCREEN_METRICS SoT. */}
        <div
          className="pb-[calc(var(--safe-area-inset-bottom,0px)+24px)]"
          aria-hidden="true"
        />
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
