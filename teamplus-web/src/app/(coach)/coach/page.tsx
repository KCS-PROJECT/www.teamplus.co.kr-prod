'use client';

/**
 * 코치 메인화면 (2026-05-07 디자인 시스템 v2)
 * Pattern B `wallet-content` (단일 스크롤) — DESIGN.md §4 적용.
 *
 * 구성:
 *  1. Hero  — rink-800 다크 hero (역할 배지 + 이름 + 아이디 + 소속 팀)
 *  2. 수업 일정 — 캘린더 카드 (wsurface)
 *  3. 선택일 수업 — 수업 목록 카드 (wsurface)
 *
 * 제거: 4탭(매출/회원/문서/부가) · QR 발급 · 아이스+ 플로팅
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
import { DirectorEmptyCard } from '@/components/director/DirectorEmptyCard';
import { PendingApprovalsSection } from '@/components/dashboard/PendingApprovalsSection';
import { RecentNoticesSection } from '@/components/dashboard/RecentNoticesSection';
import { TeamClassesSummary } from '@/components/dashboard/TeamClassesSummary';
// [Step 10 2026-05-19] 미결제 학부모 위젯 — 매월 28일~다음달 5일 사이만 노출.
//   백엔드 API 404/500/조건 미충족 시 컴포넌트 자체 비노출 (graceful degradation).
import { UnpaidMembersSection } from '@/components/coach/UnpaidMembersSection';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useStableLayout } from '@/hooks/useStableLayout';
import { useImagesReady } from '@/hooks/useImagesReady';
import { useFontsReady } from '@/hooks/useFontsReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { MESSAGES } from '@/lib/messages';
import { listManagedTeams, type TeamListItem } from '@/services/team.service';

const GlobalMenu = dynamic(
  () => import('@/components/layout/GlobalMenu').then((m) => ({ default: m.GlobalMenu })),
  { ssr: false },
);

interface TeamRef {
  id: string;
  name: string;
  /** 팀 로고 URL — Hero 카드 우측에 표시 (2026-05-25) */
  logoUrl?: string | null;
  /** 본인의 TeamMember 상태 — 'pending' 이면 hero 에 "(승인 대기 중)" 표시 (2026-05-21) */
  myApprovalStatus: 'approved' | 'pending';
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
  // [2026-06-18] 이번주 수업 있는 날 그룹 — 홈 '이번주 일정' 표시용 (감독 홈과 동일).
  weekGroups: { dateKey: string; classes: CalendarClass[] }[];
}

export default function CoachDashboardPage() {
  const { navigate } = useNavigation();
  const { unreadCount } = useNotificationContext();
  const [teams, setTeams] = useState<TeamRef[] | null>(null);
  const [selection, setSelection] = useState<Selection>({ dateKey: null, classes: [], weekGroups: [] });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);

  // v16.3 (2026-05-16): useStableLayout — main wrapper ResizeObserver 기반 layout 안정화 감지.
  // sub-component (ClassCalendarSection, PendingApprovalsSection, RecentNoticesSection 등)
  // mount/paint 완료 보장. SoT: SPEC_LOADING_STABLE_PAINT.md §2.1.
  const mainRef = useRef<HTMLElement>(null);
  // [성능 2026-05-28 P0-A] 400→220ms. [2026-05-30 LD-04] 220→150ms. 레이아웃 디바운스 윈도우 단축 (데이터·이미지·폰트는 별도 신호가 보장).
  const isLayoutStable = useStableLayout(mainRef, { stableMs: 150 });

  // 풀스크린 로더 fast-path (v18, 2026-05-20) — 5중 안전망 합성:
  //   ① teams 도착 ② ClassCalendarSection 첫 fetch + 첫 paint 완료
  //   ③ main wrapper ResizeObserver stable (모든 sub-component paint 완료 보장)
  //   ④ Hero/Banner/Notice 이미지 모두 decode 완료 (useImagesReady — SPEC §3.1 v18)
  //   ⑤ Pretendard 폰트 swap 완료 (useFontsReady — 텍스트 깜빡임 방지)
  // 다섯 신호 모두 충족 시점에 OFF. SoT: LOADING_TIMING_POLICY.md §11.
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
  });

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // [수정 2026-05-21] includePending=true — 가입 직후 'pending' 팀도 hero 에 표시.
  //  감독 승인 대기 중인 코치가 본인의 신청 팀을 확인할 수 있도록.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listManagedTeams({ includePending: true });
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setTeams(
          res.data.map((t) => ({
            id: t.id,
            name: pickTeamName(t),
            logoUrl: t.logoUrl ?? null,
            myApprovalStatus: t.myApprovalStatus ?? 'approved',
          })),
        );
      } else {
        setTeams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // [수정 2026-05-21] approved / pending 분리 — pending 인 팀은 "○○팀 (승인 대기 중)" 으로 표시.
  //  approved 팀이 1개 이상이면 그것을 우선 표시, 아니면 pending 만으로 표시.
  const approvedTeams = teams?.filter((t) => t.myApprovalStatus === 'approved') ?? [];
  const pendingTeams = teams?.filter((t) => t.myApprovalStatus === 'pending') ?? [];
  // 헤더 타이틀 — "{이름} 코치 / {팀명}" (팀명 끝의 (코드) 표기는 제거). approved 우선, 팀 없으면 직책만.
  const { user } = useSessionAuth();
  const userName = user?.name?.trim();
  const namePart = userName ? `${userName} 코치` : '코치';
  const teamNames =
    approvedTeams.length > 0
      ? approvedTeams.map((t) => t.name.replace(/\s*\([^()]*\)\s*$/, '').trim()).join(' · ')
      : pendingTeams.length > 0
      ? pendingTeams.map((t) => t.name.replace(/\s*\([^()]*\)\s*$/, '').trim()).join(' · ')
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
        aria-label="코치 홈"
      >
        {/* 캘린더 데이터·풀스크린 로더 신호는 아래 월 달력 섹션이 함께 공급한다.
              pending 팀은 권한 없으므로 approved 팀만 전달. */}

        {/* 1. 회원 승인 — 처리 필요 알림이라 최상단 노출 (승인 대기 0건이면 숨김).
         *    [2026-06-23 통합] 코치도 /director-approvals 단일 페이지 사용 — 전 팀 통합·일괄·이력
         *    제공. 과거 C1(코치→감독 도메인 권한차로 앱 오류)은 전 계층 COACH 권한 보강으로 해소됨. */}
        <PendingApprovalsSection
          teamIds={approvedTeams}
          isTeamsLoading={teams === null}
          targetPath="/director-approvals"
        />

        {/* 2. 공지사항 — 코치는 작성 권한 보유 → 카드 하단 작성 버튼 노출.
              전체보기는 수정/삭제 가능한 관리 페이지(/director-notices)로 이동. */}
        <RecentNoticesSection
          viewAllHref="/director-notices"
          onCreateNotice={() => navigate('/notices-create')}
        />

        {/* 3. 수업 일정 — 월 달력. 날짜 클릭 시 아래 선택일 일정 갱신(초기값 오늘). */}
        {/* 수업 목록 — 내 팀 정규수업 요약 (달력 위, 운영자라 등록완료 배지 미표시).
            classesCategory='regular' → 오픈클래스 제외, '/classes-manage'(정규+대회) 와 동일 기준. */}
        <TeamClassesSummary showEnrollment={false} classesCategory="regular" targetPath="/classes-manage" onReady={setSummaryReady} />

        <SectionHead title={MESSAGES.dashboard.classSchedule} />
        <div className="px-4 sm:px-5 pt-1">
          <ClassCalendarSection
            teamIds={approvedTeams}
            onSelectionChange={setSelection}
            onReady={setCalendarReady}
            legendVariant="team-only"
          />
        </div>

        {/* 4. [2026-06-18] 이번주 일정 — 수업 있는 날만 그룹 표시 (감독 홈과 동일). 전체 일정은 일정 페이지로. */}
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

        {/* 4-α. 미결제 학부모 위젯 (Step 10 · 2026-05-19)
              · 매월 28일~다음달 5일 등록 마감 그레이스 기간에만 자동 노출.
              · 위 기간 외 또는 API 실패/0건 시 컴포넌트 내부에서 return null. */}
        <UnpaidMembersSection />

        {/* [2026-05-16] BottomNav · iOS safe-area 통합 여백 — pb 24px + safe-area inset.
              이전 `h-8` 고정 32px 은 노치/홈인디케이터 단말기에서 마지막 카드가
              BottomNav 에 가려지던 회귀를 일으킴. var(--safe-area-inset-bottom) 폴백
              패턴 (SCREEN_METRICS SoT) 으로 통일. */}
        <div
          className="pb-[calc(var(--safe-area-inset-bottom,0px)+24px)]"
          aria-hidden="true"
        />
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}

