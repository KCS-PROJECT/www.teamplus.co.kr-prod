'use client';

/**
 * 감독 메인화면 (2026-05-09 v3 — 참고자료 "05 · 감독 홈" 100% 매칭)
 * Pattern B `wallet-content` (단일 스크롤) — DESIGN.md §4 적용.
 *
 * 구성 (body / contents 영역만 변경, AppBar/BottomNav 불가침):
 *  1. Profile Card — 다크 네이비 그라디언트 + 데코 3원형 (DIRECTOR · 이름 · 이메일 ·
 *     divider · 소속팀 아이콘 · 팀명with(CODE) 강조)
 *  2. 수업 일정 — 캘린더 카드 (ClassCalendarSection · 기능 변경 없음)
 *  3. 선택일 수업 — 수업 목록 (SelectedDayClassList · 기능 변경 없음)
 *  4. 승인 대기 회원 — PendingApprovalsSection · 기능 변경 없음
 *  5. 공지사항 — RecentNoticesSection · 기능 변경 없음
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
// [2026-05-12] DirectorClassCalendar 사용 중단 — 코치/학부모와 동일 ClassCalendarSection 으로 통일.
import { DirectorPendingApprovals } from '@/components/director/DirectorPendingApprovals';
import { DirectorEmptyCard } from '@/components/director/DirectorEmptyCard';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useStableLayout } from '@/hooks/useStableLayout';
import { useImagesReady } from '@/hooks/useImagesReady';
import { useFontsReady } from '@/hooks/useFontsReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { MESSAGES } from '@/lib/messages';
import { listManagedTeams, type TeamListItem } from '@/services/team.service';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';

const GlobalMenu = dynamic(
  () => import('@/components/layout/GlobalMenu').then((m) => ({ default: m.GlobalMenu })),
  { ssr: false },
);

interface TeamRef {
  id: string;
  name: string;
  /** 팀 로고 URL — Hero 카드 우측 표시 (2026-05-25) */
  logoUrl?: string | null;
}

function pickTeamName(team: TeamListItem): string {
  const base =
    team.name?.trim() ||
    team.club?.clubName?.trim() ||
    MESSAGES.dashboard.unspecifiedTeam;
  const code = team.teamCode?.trim();
  return code ? `${base}(${code})` : base;
}

interface Selection {
  dateKey: string | null;
  classes: CalendarClass[];
  // [2026-06-10] 이번주 수업 있는 날 그룹 — 홈 '이번주 일정' 표시용.
  weekGroups: { dateKey: string; classes: CalendarClass[] }[];
}

export default function DirectorDashboardPage() {
  const { navigate } = useNavigation();
  const { unreadCount } = useNotificationContext();
  const [teams, setTeams] = useState<TeamRef[] | null>(null);
  const [selection, setSelection] = useState<Selection>({ dateKey: null, classes: [], weekGroups: [] });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);

  // v16.3 (2026-05-16): useStableLayout — main wrapper ResizeObserver 기반 layout 안정화 감지.
  // sub-component (ClassCalendarSection, DirectorPendingApprovals, RecentNoticesSection 등)
  // mount/paint 완료 보장. SoT: SPEC_LOADING_STABLE_PAINT.md §2.1.
  const mainRef = useRef<HTMLElement>(null);
  // [성능 2026-05-28 P0-A] 400→220ms. [2026-05-30 LD-04] 220→150ms. 레이아웃 디바운스 윈도우 단축 (데이터·이미지·폰트는 별도 신호가 보장).
  const isLayoutStable = useStableLayout(mainRef, { stableMs: 150 });

  // 풀스크린 로더 fast-path (v18, 2026-05-20) — 5중 안전망 합성:
  //   ① teams 도착 ② ClassCalendarSection 첫 fetch + 첫 paint 완료
  //   ③ main wrapper ResizeObserver stable ④ 이미지 decode 완료
  //   ⑤ Pretendard 폰트 swap 완료
  // SoT: LOADING_TIMING_POLICY.md §11 (데이터+셋팅 완료 전 hide 절대 금지)
  const imagesReady = useImagesReady([teams, isLayoutStable]);
  const fontsReady = useFontsReady();
  usePageReady(
    teams !== null &&
      calendarReady &&
      summaryReady &&
      isLayoutStable &&
      imagesReady &&
      fontsReady,
  );

  // 본 페이지의 AppBar 는 wallet WalletAppBar (4-icon main 헤더) 사용 →
  // 네이티브 AppBar 는 비활성화 (Flutter 환경에서 PageAppBar 가 forceNative 로 그려짐)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: false,
    showMenuButton: false,
    isDataLoaded: teams !== null,
  });

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // [2026-05-16] ACADEMY_DIRECTOR `/director` 진입 가드는 `src/middleware.ts` 의
  //  서버사이드 가드(JWT 쿠키 base64 디코딩 → role==='academy_director' 분기)로 이전됨.
  //  이전 client-side useEffect 는 React 마운트 → 페이지 1프레임 노출 → router.replace
  //  의 깜빡임을 유발했고, 미들웨어는 SSR before render 단계라 visible flash 0.
  //  안전망 중복 제거(SoT 단일화) 효과.

  // 팀 목록 fetch — 마운트 + REFRESH_KEYS.TEAM 발화 시
  const loadTeams = useCallback(async () => {
    const res = await listManagedTeams();
    if (res.success && Array.isArray(res.data)) {
      setTeams(
        res.data.map((t) => ({
          id: t.id,
          name: pickTeamName(t),
          logoUrl: t.logoUrl ?? null,
        })),
      );
    } else {
      setTeams([]);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  // [추가 2026-05-23 hotfix] 팀 정보 변경 → 감독 대시보드 자동 갱신
  useRefreshSubscription(REFRESH_KEYS.TEAM, () => {
    void loadTeams();
  });

  // 헤더 타이틀 — "{이름} 감독 / {팀명}" (팀명 끝의 (코드) 표기는 제거). 팀 없으면 직책만.
  const { user } = useSessionAuth();
  const userName = user?.name?.trim();
  const namePart = userName ? `${userName} 감독` : '감독';
  const teamNames =
    teams && teams.length > 0
      ? teams.map((t) => t.name.replace(/\s*\([^()]*\)\s*$/, '').trim()).join(' · ')
      : null;
  const headerTitle = teamNames ? `${namePart} / ${teamNames}` : namePart;

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
        aria-label="감독 홈"
      >
        {/* 캘린더 데이터·풀스크린 로더 신호는 아래 월 달력 섹션이 함께 공급한다. */}

        {/* 1. 회원 승인 — 처리 필요 알림이라 최상단 노출 (승인 대기 0건이면 섹션 전체 숨김). */}
        <DirectorPendingApprovals
          teamIds={teams ?? []}
          isTeamsLoading={teams === null}
        />

        {/* 2. 공지사항 — 감독은 작성 권한 보유 → 카드 하단 작성 버튼 노출.
              전체보기는 수정/삭제 가능한 관리 페이지(/director-notices)로 이동. */}
        <RecentNoticesSection
          viewAllHref="/director-notices"
          onCreateNotice={() => navigate('/notices-create')}
        />

        {/* 3. 수업 목록 — 내 팀 정규수업 요약 (달력 위, 운영자라 등록완료 배지 미표시).
            classesCategory='regular' → 오픈클래스 제외, '/classes-manage'(정규+대회) 와 동일 기준. */}
        <TeamClassesSummary showEnrollment={false} classesCategory="regular" targetPath="/classes-manage" onReady={setSummaryReady} />

        {/* 4. 수업 일정 — 월 달력. 날짜 클릭 시 아래 선택일 일정 갱신(초기값 오늘). */}
        <SectionHead title={MESSAGES.dashboard.classSchedule} />
        <div className="px-4 sm:px-5 pt-1">
          <ClassCalendarSection
            teamIds={teams ?? []}
            onSelectionChange={setSelection}
            onReady={setCalendarReady}
            legendVariant="team-only"
          />
        </div>

        {/* 4. [2026-06-10] 이번주 일정 — 수업 있는 날만 그룹 표시. 전체 일정은 일정 페이지로. */}
        <SectionHead
          title="이번주 일정"
          action="전체 일정 보기 ›"
          onActionClick={() => navigate('/director-schedules')}
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

        {/* [2026-05-16] BottomNav · iOS safe-area 통합 여백 — pb 24px + safe-area inset.
              SCREEN_METRICS SoT (`var(--safe-area-inset-bottom, 0px)`) 폴백 패턴. */}
        <div
          className="pb-[calc(var(--safe-area-inset-bottom,0px)+24px)]"
          aria-hidden="true"
        />
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}

// [추가 2026-05-12] 코치/학부모 홈과 동일한 Hero 배경 데코.
