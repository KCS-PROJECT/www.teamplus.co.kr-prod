'use client';

/**
 * 학부모 메인화면 — DESIGN.md Pattern B `wallet-content` (단일 스크롤).
 * 감독/코치 대시보드 동일 구조 (회원 승인 영역 제외) + 자녀 칩 필터.
 *
 * 구성 (자녀스트립 → 배너 → 공지 → 수업목록 → 월달력 → 선택일수업):
 *  -1. 자녀 스트립 — 네이비 밴드(로고·이름·팀) + [선택] 버튼 → ChildPickerSheet 자녀 전환
 *  0. 자녀 상태 배너 — pending/rejected/자녀0명일 때만 노출 (최상단 긴급 안내)
 *  1. 공지사항 — RecentNoticesSection (팀 단위 정보)
 *  2. 수업 목록 — TeamClassesSummary (팀 등록 수업 상위 5건 요약 + 전체보기)
 *  3. 수업 일정 — ClassCalendarSection 월 달력 (자녀 등록 수업으로 필터링)
 *  4. 선택일 수업 — SelectedDayClassList (선택일 자녀 수업 + 출석 버튼)
 *
 * 백업: page.wallet-v1.tsx.bak (이전 Wallet 4탭 구조 보존, 빌드 제외)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ChildPickerSheet } from '@/components/parent/ChildPickerSheet';
import { HomeIdentityStrip } from '@/components/common/HomeIdentityStrip';
import { BrandWordmark } from '@/components/common/BrandWordmark';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SectionHead, WalletAppBar } from '@/components/wallet';
import {
  ClassCalendarSection,
  getDashboardScheduleView,
  SelectedDayClassList,
  type SelectedClassesPayload,
} from '@/components/dashboard/ClassCalendarSection';
import { WeekScheduleList } from '@/components/dashboard/WeekScheduleList';
import { RecentNoticesSection } from '@/components/dashboard/RecentNoticesSection';
import { TeamClassesSummary } from '@/components/dashboard/TeamClassesSummary';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { useChildren } from '@/hooks/useChildren';
import { useParentHome } from '@/hooks/useParentHome';
import { usePageReady } from '@/hooks/usePageReady';
import { useStableLayout } from '@/hooks/useStableLayout';
import { useImagesReady } from '@/hooks/useImagesReady';
import { useFontsReady } from '@/hooks/useFontsReady';
import { MESSAGES } from '@/lib/messages';
import { getChildInactiveReason } from '@/lib/child-status';
import { isActiveEnrollment } from '@/lib/enrollment-visibility';
import { api } from '@/services/api-client';
import {
  listParentVisibleTeams,
  type TeamListItem,
} from '@/services/team.service';

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

/** GET /enrollments 응답 항목 — 자녀별 등록 수업 매핑용.
 *  백엔드 SoT: child/class 는 중첩 객체로 내려옴 (enrollments.service.ts:972 mapToEnrollmentResponse).
 *  flat childId/classId 는 레거시 호환을 위해 둘 다 허용. */
interface EnrollmentItem {
  hasValidPass?: boolean | null;
  id: string;
  childId?: string;
  classId?: string;
  status?: string;
  child?: { id?: string } | null;
  class?: { id?: string; billingMode?: string } | null;
  product?: { billingTiming?: string } | null;
}

/** GET /payments/postpaid/my-pending 응답 항목 — 결제 요청 배너용.
 *  수업 후불 정산(CLASS) + 후불 대회 참가비(TOURNAMENT) 통합. paymentName 은
 *  결제 페이지(/payment/postpaid) name 파라미터 값(백엔드가 알림 링크와 동일 포맷으로 생성). */
interface PendingBilling {
  kind: 'CLASS' | 'TOURNAMENT';
  title: string;
  amount: number;
  orderNumber: string | null;
  paymentName: string;
  /** 청구 대상 자녀 이름 — 백엔드 append(child null 이면 미제공). */
  childName?: string | null;
}

function postpaidPayLink(b: PendingBilling): string {
  return `/payment/postpaid?orderNumber=${encodeURIComponent(b.orderNumber ?? '')}&amount=${b.amount}&name=${encodeURIComponent(b.paymentName)}`;
}

function pickTeamName(team: TeamListItem): string {
  const base =
    team.name?.trim() ||
    team.club?.clubName?.trim() ||
    MESSAGES.dashboard.unspecifiedTeam;
  const code = team.teamCode?.trim();
  return code ? `${base}(${code})` : base;
}

export default function ParentDashboardPage() {
  const { navigate } = useNavigation();
  const { unreadCount } = useNotificationContext();
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  const {
    children: allChildren,
    selectableChildren,
    isLoading: isChildrenLoading,
  } = useChildren();
  // Phase 1 (2026-05-11): 학부모 출석 처리 — upcomingSchedules 의 scheduleId/childIds/attendanceByChild
  // 를 SelectedDayClassList 에 매핑해서 [출석하기] 버튼을 노출한다. checkInChild 은 POST
  // /attendance/parent-check-in 으로 위임. 캘린더 fetch 와 분리(이중 fetch) — 옵션 A.
  const { upcomingSchedules, checkInChild } = useParentHome();

  const [teams, setTeams] = useState<TeamRef[] | null>(null);
  // 자녀 선택 바텀시트 — 자녀 스트립 우측 [선택] 버튼으로 열림 (승인 자녀 2명+ 일 때만 노출)
  const [isChildSheetOpen, setIsChildSheetOpen] = useState(false);
  // 미납 후불 청구(수업 정산 + 후불 대회 참가비) — 결제 요청 배너. null=로딩(배너·페이지 ready 보류).
  const [pendingBillings, setPendingBillings] = useState<PendingBilling[] | null>(null);
  const [isBillingSheetOpen, setIsBillingSheetOpen] = useState(false);
  const [childClassMap, setChildClassMap] = useState<Map<string, Set<string>>>(
    new Map(),
  );
  const [calendarReady, setCalendarReady] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);

  // v16.3 (2026-05-16): useStableLayout — main wrapper 의 ResizeObserver 기반 layout 안정화 감지.
  // sub-component (BannerCarousel, ChildrenSwipeCards, ClassCalendarSection, RecentNoticesSection
  // 등) mount/paint 완료 보장. SoT: SPEC_LOADING_STABLE_PAINT.md §2.1.
  const mainRef = useRef<HTMLElement>(null);
  // [성능 2026-05-28 P0-A] 400→220ms. [2026-05-30 LD-04] 220→150ms. 레이아웃 디바운스
  //   윈도우 단축 (데이터·이미지·폰트는 별도 신호가 보장). child/teen 은 WCAG AAA 로 220+ 유지.
  const isLayoutStable = useStableLayout(mainRef, { stableMs: 150 });

  // 풀스크린 로더 fast-path — 7중 안전망 합성:
  //   ① 자녀 목록 (useChildren) ② 자녀 소속 팀 (listParentVisibleTeams)
  //   ③ ClassCalendarSection(월 달력) 첫 fetch + 첫 paint 완료 (onReady=>calendarReady)
  //   ④ TeamClassesSummary 첫 fetch 완료 (onReady=>summaryReady — 빈/에러 응답에도 발화)
  //   ⑤ main wrapper ResizeObserver stable (useStableLayout — 모든 sub-component paint 완료 보장)
  //   ⑥ Banner/Notice 이미지 모두 decode 완료 (useImagesReady — SPEC §3.1 v18)
  //   ⑦ Pretendard 폰트 swap 완료 (useFontsReady — 텍스트 깜빡임 방지)
  // 일곱 신호 모두 충족 시점에 PageTransitionLoader OFF. 빈 카드/이미지 깜빡임/폰트 swap 차단.
  // SoT: docs/Design/LOADING_TIMING_POLICY.md §11 (사용자 직접 지시 — 데이터+셋팅 완료 전 hide 금지)
  const imagesReady = useImagesReady([allChildren, teams, isLayoutStable]);
  const fontsReady = useFontsReady();
  // ⑧ 결제 요청 배너 데이터(pendingBillings) — 최상단 배너가 로더 해제 후 늦게 붙으면
  //    레이아웃 점프가 생기므로 ready 게이트에 포함 (LOADING_TIMING_POLICY §11).
  usePageReady(
    !isChildrenLoading &&
      teams !== null &&
      pendingBillings !== null &&
      calendarReady &&
      summaryReady &&
      isLayoutStable &&
      imagesReady &&
      fontsReady,
  );
  const [selection, setSelection] = useState<SelectedClassesPayload>({ dateKey: null, classes: [], weekGroups: [] });
  const scheduleView = getDashboardScheduleView(selection);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 선택 대상 자녀를 칩에 노출 — 무소속 포함, pending/rejected(관계 미확정)만 제외.
  //   drawer·전역 Context 와 동일 기준(useChildren.selectableChildren). 무소속이어도 오픈클래스를
  //   수강할 수 있어 선택 가능해야 한다.
  const approvedChildren = useMemo(
    () => {
      // [2026-06-16] 자녀 필터 칩을 출생연도 오름차순(나이 많은 순: 2017 → 2018 → 2021)으로 정렬.
      //   출생일 미상은 맨 뒤로.
      const yearOf = (c: (typeof selectableChildren)[number]) =>
        c.birthDate
          ? new Date(c.birthDate).getFullYear()
          : Number.POSITIVE_INFINITY;
      return [...selectableChildren].sort((a, b) => yearOf(a) - yearOf(b));
    },
    [selectableChildren],
  );

  // 미승인 자녀 목록 (배너 표시용) — [2026-06-18] 배너에 실제 자녀 이름 노출용으로 목록 보유.
  const pendingChildren = useMemo(
    () => allChildren.filter((c) => c.pendingClubName && !c.club),
    [allChildren],
  );
  const pendingCount = pendingChildren.length;
  const rejectedChildren = useMemo(
    () => allChildren.filter((c) => c.rejectedClubName && !c.club),
    [allChildren],
  );
  const rejectedCount = rejectedChildren.length;
  // 반려 배너 클릭 시 이동할 대상 — 첫 반려 자녀의 정보 수정(재신청) 페이지.
  const firstRejectedChildId = rejectedChildren[0]?.id ?? null;

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: false,
    showMenuButton: false,
  });

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // 자녀 소속 팀 fetch — 마운트 + REFRESH_KEYS.TEAM 발화 시 재실행.
  // [2026-05-28] 폴백 정책: myChildTeams 가 비어있으면(자녀 0명/자녀 팀 미승인)
  //   학부모 본인 가입 팀(myParentTeams · 회원가입 teamCode 로 자동 가입된 PARENT 멤버십)
  //   을 폴백으로 사용. 자녀 팀이 1개라도 있으면 자녀 팀만 노출(정보 위계 우선).
  const loadParentTeams = useCallback(async () => {
    const res = await listParentVisibleTeams();
    if (!res.success || !res.data) {
      setTeams([]);
      return;
    }
    const childTeams = Array.isArray(res.data.myChildTeams)
      ? res.data.myChildTeams
      : [];
    const parentTeams = Array.isArray(res.data.myParentTeams)
      ? res.data.myParentTeams
      : [];
    const effective = childTeams.length > 0 ? childTeams : parentTeams;
    setTeams(
      effective.map((t) => ({
        id: t.id,
        name: pickTeamName(t),
        logoUrl: t.logoUrl ?? null,
      })),
    );
  }, []);

  useEffect(() => {
    void loadParentTeams();
  }, [loadParentTeams]);

  // [추가 2026-05-23 hotfix] 팀 정보 변경 → 학부모 대시보드 자녀 소속 팀 자동 갱신
  useRefreshSubscription(REFRESH_KEYS.TEAM, () => {
    void loadParentTeams();
  });

  // 미납 후불 청구 fetch — 결제 완료 시 pending 이 사라져 배너가 자동 소멸한다.
  //   비학부모(ADMIN 시뮬레이션 등) 403 은 빈 배열 처리 → 배너 미노출.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.get<PendingBilling[]>('/payments/postpaid/my-pending');
      if (cancelled) return;
      const list = res.success && Array.isArray(res.data) ? res.data : [];
      // orderNumber 없는 항목은 결제 페이지로 연결할 수 없어 제외.
      setPendingBillings(list.filter((b) => !!b.orderNumber));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 자녀별 등록 수업 매핑 fetch (승인된 자녀만 대상)
  useEffect(() => {
    if (approvedChildren.length === 0) {
      setChildClassMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      // 백엔드 응답: { success, data: EnrollmentItem[], total } — api.get 은 unwrap 하지 않음.
      // 혹시 모를 변형(직접 배열 반환) 대응 위해 양쪽 케이스 모두 처리.
      const res = await api.get<EnrollmentItem[] | { data?: EnrollmentItem[] }>(
        '/enrollments',
      );
      if (cancelled || !res.success) return;
      const raw = res.data;
      const list: EnrollmentItem[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { data?: EnrollmentItem[] } | undefined)?.data)
        ? (raw as { data: EnrollmentItem[] }).data
        : [];
      const approvedIds = new Set(approvedChildren.map((c) => c.id));
      const map = new Map<string, Set<string>>();
      list.forEach((e) => {
        // nested(child.id/class.id) 우선, flat(childId/classId) fallback. + 노출 자격 필터.
        const childId = e.child?.id ?? e.childId;
        const classId = e.class?.id ?? e.classId;
        if (!childId || !classId) return;
        // 선불 paid OR 후불(POSTPAID·BOTH 후불상품) approved 만 캘린더 노출 (공통 SoT).
        if (
          !isActiveEnrollment(
            e.status,
            e.class?.billingMode,
            e.product?.billingTiming,
            e.hasValidPass,
          )
        )
          return;
        if (!approvedIds.has(childId)) return;
        if (!map.has(childId)) map.set(childId, new Set());
        map.get(childId)!.add(classId);
      });
      setChildClassMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [approvedChildren]);

  // 단일 자녀 모델 — 선택 자녀의 등록 수업 classId 집합. 검증·폴백(첫 자녀 자동 선택)은
  //  전역 SelectedChildContext 가 담당. 자녀 0명(selectedChildId=null)일 때만 빈 Set(일정 0건).
  const enabledClassIds = useMemo<Set<string>>(() => {
    if (selectedChildId === null) return new Set();
    return childClassMap.get(selectedChildId) ?? new Set();
  }, [selectedChildId, childClassMap]);

  // 2026-05-14: 자녀가 결제한 학원 ID 집합 — ClassCalendarSection 이 학원 endpoint 도 호출하도록.
  //   useParentHome 의 upcomingSchedules 는 BE 의 enrollment paid 격리를 이미 통과한 결과이므로
  //   academyId 가 있는 schedule 만 뽑아 owner 집합 도출.
  const academies = useMemo<TeamRef[]>(() => {
    const seen = new Set<string>();
    const list: TeamRef[] = [];
    (upcomingSchedules ?? []).forEach((s) => {
      if (s.academyId && !seen.has(s.academyId)) {
        seen.add(s.academyId);
        // 이름은 응답에 없으므로 '오픈클래스' 라벨 사용 (캘린더 location 표시용).
        list.push({ id: s.academyId, name: '오픈클래스' });
      }
    });
    return list;
  }, [upcomingSchedules]);

  // 단일 자녀 모델 — 항상 선택된 자녀(또는 자녀 1명)를 헤더·카드에 노출. 검증·폴백은
  //  전역 SelectedChildContext 가 담당하므로 selectedChildId 는 활성 자녀를 가리킨다.
  const focusedChild =
    selectedChildId !== null
      ? approvedChildren.find((c) => c.id === selectedChildId) ?? null
      : approvedChildren.length === 1
      ? approvedChildren[0]
      : null;

  // 자녀 스트립 서브라인 — 소속팀명. 소속(club)이 없으면 상태 라벨 노출:
  //   승인 대기는 "승인 대기", 거절·무소속은 "소속없음" (거절도 소속없음으로 통일 — 사용자 지시).
  const stripIsPending =
    !!focusedChild &&
    !focusedChild.club &&
    getChildInactiveReason(focusedChild) === 'pending';
  const stripSubline = focusedChild
    ? focusedChild.club ||
      (stripIsPending
        ? MESSAGES.team.childHeaderPendingLabel
        : MESSAGES.team.childHeaderNoTeamLabel)
    : null;

  // 자녀 스트립 팀 로고 — 선택 자녀의 승인 대표 팀(clubIds[0], 서브라인 club과 동일 출처) 로고.
  //   teams(자녀 소속 팀·logoUrl 보유)에서 매칭. 무소속/미로딩/로고없음 → 이니셜 플레이스홀더.
  const stripTeamLogoUrl = focusedChild
    ? teams?.find((t) => t.id === focusedChild.clubIds?.[0])?.logoUrl ?? null
    : null;

  // ─── Phase 1 (2026-05-11): SelectedDayClassList 출석 prop 빌드 ───
  // upcomingSchedules 는 ParentUpcomingSchedule[] — scheduleId/childIds/attendanceByChild 보유.
  // ClassCalendarSection 이 만드는 CalendarClass.id 가 scheduleId 와 동일하므로 직접 Map 매핑.
  const scheduleIdToChildIds = useMemo(() => {
    const m = new Map<string, string[]>();
    upcomingSchedules.forEach((s) => m.set(s.scheduleId, s.childIds));
    return m;
  }, [upcomingSchedules]);

  const attendanceMap = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    upcomingSchedules.forEach((s) => m.set(s.scheduleId, s.attendanceByChild ?? {}));
    return m;
  }, [upcomingSchedules]);

  // "결제권 차감" 안내 표시 대상 scheduleId 집합(opt-in) — 발급형 상품이 확인된
  //   크레딧 수업만. 미포함이면 SelectedDayClassList 가 차감 안내를 생략한다.
  //   CalendarClass.id 가 scheduleId 와 동일하므로 직접 매칭.
  const creditNoticeScheduleIds = useMemo(() => {
    const s = new Set<string>();
    upcomingSchedules.forEach((u) => {
      if (u.classRequiresCredit === true && u.billingMode !== 'POSTPAID') {
        s.add(u.scheduleId);
      }
    });
    return s;
  }, [upcomingSchedules]);

  const childIdToName = useMemo(() => {
    const m = new Map<string, string>();
    approvedChildren.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [approvedChildren]);

  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <MobileContainer hasBottomNav>
      {/* 헤더 — 좌측 '팀플러스+' 이미지 워드마크 (h1 시맨틱 유지). 정체성(이름·자녀)은 HomeIdentityStrip 전담. */}
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
        // QR 출석 — 선택된 자녀로 스캐너 진입(일정은 코치 QR 스캔이 결정). 자녀 0명이면 미노출.
        onQr={
          selectedChildId
            ? () => {
                const params = new URLSearchParams({ childId: selectedChildId });
                if (focusedChild?.name) params.set('childName', focusedChild.name);
                navigate(`/qr-scan?${params.toString()}`);
              }
            : undefined
        }
      />
      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="학부모 홈"
      >
        {/* 선택 자녀 스트립 — 헤더에서 분리한 자녀 정체성 표시 + [선택] 자녀 전환.
              공용 HomeIdentityStrip(4개 역할 홈 공유). 자녀 0명이면 미렌더. */}
        {focusedChild && (
          <HomeIdentityStrip
            logoUrl={stripTeamLogoUrl}
            fallbackInitial={focusedChild.club || focusedChild.name}
            title={focusedChild.name}
            subline={stripSubline}
            sublineTone={stripIsPending ? 'warning' : 'default'}
            ariaLabel={`선택된 자녀 ${focusedChild.name}`}
            action={
              // [선택] — 자녀 전환 바텀시트 열기 (전환 대상이 있는 2명+ 일 때만)
              approvedChildren.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => setIsChildSheetOpen(true)}
                  aria-label={MESSAGES.team.childStripSheetTitle}
                  aria-haspopup="dialog"
                  className="shrink-0 inline-flex items-center justify-center h-9 px-4 rounded-w-pill bg-white/[0.12] text-[13.5px] font-bold text-white hover:bg-white/[0.18] active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  {MESSAGES.team.childStripSelectAction}
                </button>
              ) : undefined
            }
          />
        )}

        {/* 0. 자녀 상태 배너 — 2026-05-16: 섹션 간 gap-6(24px) 통일 (pt-4 → pt-6)
             [2026-05-28] 자녀 0명 등록 유도 배너 추가 — 신규 학부모 진입 시 다음 액션 가이드.
             자녀가 등록되어 있으면 미승인 자녀 배너(pending/rejected)만 노출. */}
        {/* [2026-06-17] 빈 자녀 배너는 자녀 목록 로딩이 끝난 뒤에만 노출.
              새로고침 시 allChildren 초기값([])로 인해 '등록된 자녀가 없어요' 가 잠깐
              깜빡였다 사라지던 회귀 차단 (isChildrenLoading 가드). */}
        {((!isChildrenLoading && allChildren.length === 0) ||
          rejectedCount > 0 ||
          pendingCount > 0) && (
          /* ICETIMES flat: 떠 있는 rounded 카드 → full-bleed 흰 섹션 안의 attention 행.
               director 승인대기 배너(DirectorPendingApprovals iceTheme)와 동일 패턴 —
               rounded/border 제거, 의미색은 행 배경 틴트 1요소로만 유지. */
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 flex flex-col">
            {!isChildrenLoading && allChildren.length === 0 && (
              /* 빈 자녀 배너 — flat 톤 유지하되 안내(제목+보조 hint) + 명시 primary CTA 복원.
                   rejected/pending 단일 행과 달리 신규 학부모에게 다음 액션 가이드가 필요. */
              <div className="px-4 sm:px-5 py-4 flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <Icon
                    name="person_add"
                    className="text-[20px] shrink-0 text-it-blue-600 dark:text-it-blue-300 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-card-body font-semibold text-wtext-1 dark:text-white break-keep">
                      {MESSAGES.team.parentNoChildren}
                    </p>
                    <p className="text-card-meta text-it-ink-500 dark:text-it-blue-300 break-keep">
                      {MESSAGES.team.parentNoChildrenHint}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/children/add')}
                  aria-label="선수 등록하기"
                  className="inline-flex w-full min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-it-blue-500 text-white text-card-emphasis font-bold shadow-sm hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                >
                  <Icon
                    name="add"
                    className="text-white text-w-body"
                    aria-hidden="true"
                  />
                  선수 등록하기
                </button>
              </div>
            )}
            {rejectedCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    firstRejectedChildId
                      ? `/children/${firstRejectedChildId}/edit`
                      : '/children',
                  )
                }
                className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left bg-it-red-500/[0.07] dark:bg-it-red-500/[0.12] hover:bg-it-red-500/[0.12] transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-red-500"
              >
                <Icon
                  name="block"
                  className="text-[20px] shrink-0 text-it-red-500 dark:text-it-red-300"
                  aria-hidden="true"
                />
                <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white break-keep">
                  {MESSAGES.team.dashboardRejectedBanner(
                    rejectedChildren[0]?.name ?? '자녀',
                    rejectedCount - 1,
                    rejectedChildren[0]?.rejectionReason,
                  )}
                </span>
                <Icon
                  name="chevron_right"
                  className="text-[20px] shrink-0 text-it-red-500 dark:text-it-red-300"
                  aria-hidden="true"
                />
              </button>
            )}
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('/children')}
                className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left bg-amber-500/[0.08] dark:bg-amber-500/[0.12] hover:bg-amber-500/[0.13] transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500"
              >
                <Icon
                  name="hourglass_top"
                  className="text-[20px] shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white break-keep">
                  {MESSAGES.team.dashboardPendingBanner(
                    pendingChildren[0]?.name ?? '자녀',
                    pendingCount - 1,
                  )}
                </span>
                <Icon
                  name="chevron_right"
                  className="text-[20px] shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              </button>
            )}
          </section>
        )}

        {/* 0-1. 결제 요청 배너 — 미납 후불 청구(수업 정산·후불 대회 참가비)가 있을 때만.
              결제 완료 시 pending 이 사라져 자동 소멸(닫기 상태 관리 불필요).
              1건=결제 페이지 직행 · 2건+=건별 목록 바텀시트. */}
        {pendingBillings !== null && pendingBillings.length > 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <button
              type="button"
              onClick={() =>
                pendingBillings.length === 1
                  ? navigate(postpaidPayLink(pendingBillings[0]))
                  : setIsBillingSheetOpen(true)
              }
              className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left bg-amber-500/[0.08] dark:bg-amber-500/[0.12] hover:bg-amber-500/[0.13] transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500"
            >
              <Icon
                name="payments"
                className="text-[20px] shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white break-keep">
                {pendingBillings.length === 1
                  ? MESSAGES.payment2.pendingBannerSingle(
                      pendingBillings[0].title,
                      pendingBillings[0].amount,
                    )
                  : MESSAGES.payment2.pendingBannerMulti(
                      pendingBillings.length,
                      pendingBillings.reduce((sum, b) => sum + b.amount, 0),
                    )}
              </span>
              <Icon
                name="chevron_right"
                className="text-[20px] shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            </button>
          </section>
        )}

        {/* ① 공지사항 — 팀 단위 정보 (최상단 배너 다음). 자녀 칩 필터와 무관.
              학부모는 "공지사항" 타이틀(타 역할은 기본 "팀 공지사항"). */}
        <RecentNoticesSection title={MESSAGES.dashboard.notices} iceTheme />

        {/* ② 수업 목록 — 팀 등록 수업 상위 5건 요약 + 전체보기.
              팀 전체 카탈로그라 자녀 칩 필터와 무관 → 칩보다 위에 배치. */}
        <TeamClassesSummary selectedChildId={selectedChildId} classLimit={7} tournamentLimit={3} onReady={setSummaryReady} iceTheme />

        {/* (자녀 전환은 상단 자녀 스트립 [선택] 버튼 → ChildPickerSheet 로 이동 — 2026-07-06) */}

        {/* ④ 수업 일정 — 기본은 이번 주, 날짜 선택 중에는 해당 날짜 일정으로 하단 목록 동기화. */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <SectionHead title={MESSAGES.dashboard.classSchedule} iceTheme />
          <div className="px-4 sm:px-5 pb-3">
            <ClassCalendarSection
              teamIds={teams ?? []}
              academies={academies}
              enabledClassIds={enabledClassIds}
              enabledChildId={selectedChildId}
              onSelectionChange={setSelection}
              selectionMode="week-default"
              onReady={setCalendarReady}
              iceTheme
            />
          </div>
        </section>

        {/* ⑤ 선택 없음=이번 주, 선택 있음=해당 날짜 일정. 출석·자녀 매핑은 동일하게 유지. */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <SectionHead
            title={scheduleView.title}
            action="전체 일정 보기 ›"
            onActionClick={() => navigate('/parent-calendar')}
            iceTheme
          />
          <div className="px-4 sm:px-5 pb-3">
            {scheduleView.groups.length === 0 ? (
              <SelectedDayClassList
                classes={[]}
                scheduleIdToChildIds={scheduleIdToChildIds}
                attendanceMap={attendanceMap}
                childIdToName={childIdToName}
                selectedChildId={selectedChildId}
                todayKey={todayKey}
                onCheckIn={checkInChild}
                creditNoticeScheduleIds={creditNoticeScheduleIds}
                emptyMessage={MESSAGES.dashboard.weekSchedule.noRemaining}
                iceTheme
              />
            ) : (
              <WeekScheduleList
                groups={scheduleView.groups}
                collapsePast={!scheduleView.isDateSelected}
                todayKey={todayKey}
                iceTheme
                renderDayClasses={(classes) => (
                  <SelectedDayClassList
                    classes={classes}
                    scheduleIdToChildIds={scheduleIdToChildIds}
                    attendanceMap={attendanceMap}
                    childIdToName={childIdToName}
                    selectedChildId={selectedChildId}
                    todayKey={todayKey}
                    onCheckIn={checkInChild}
                    creditNoticeScheduleIds={creditNoticeScheduleIds}
                    emptyMessage={scheduleView.isDateSelected ? MESSAGES.calendar.noEvents : undefined}
                    bare
                    iceTheme
                  />
                )}
              />
            )}
          </div>
        </section>

      </main>

      {/* 자녀 선택 바텀시트 — 스트립 [선택] 버튼. 행 탭 시 전역 전환 + 닫기 */}
      <ChildPickerSheet
        isOpen={isChildSheetOpen}
        onClose={() => setIsChildSheetOpen(false)}
        items={approvedChildren.map((c) => ({
          id: c.id,
          name: c.name,
          club: c.club || null,
          logoUrl: teams?.find((t) => t.id === c.clubIds?.[0])?.logoUrl ?? null,
        }))}
        selectedChildId={selectedChildId}
        onSelect={(id) => {
          setSelectedChildId(id);
          setIsChildSheetOpen(false);
        }}
      />

      {/* 결제 요청 목록 바텀시트 — 미납 청구 2건+ 일 때 건별 결제 진입 */}
      <BottomSheet
        isOpen={isBillingSheetOpen}
        onClose={() => setIsBillingSheetOpen(false)}
        title={MESSAGES.payment2.pendingSheetTitle}
      >
        <ul className="flex flex-col" role="list">
          {(pendingBillings ?? []).map((b) => (
            <li
              key={b.orderNumber}
              className="border-b border-wline-2 dark:border-rink-700 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => {
                  setIsBillingSheetOpen(false);
                  navigate(postpaidPayLink(b));
                }}
                className="w-full flex items-center gap-3 py-3.5 text-left active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500"
                aria-label={`${b.paymentName} ${b.amount.toLocaleString()}원 ${MESSAGES.payment2.pendingPayCta}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-card-body font-semibold text-wtext-1 dark:text-white truncate">
                    {b.title}
                  </p>
                  {/* 출처(수업/대회) 배지 + 청구 대상 자녀명 — 후불 전용 배너라 선후불 배지는 생략. */}
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-flex shrink-0 items-center rounded-w-pill bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-card-meta font-semibold text-wtext-2 dark:text-rink-100">
                      {b.kind === 'TOURNAMENT'
                        ? MESSAGES.payment2.sourceTournament
                        : MESSAGES.payment2.sourceClass}
                    </span>
                    {b.childName && (
                      <span className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                        {b.childName}
                      </span>
                    )}
                  </div>
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                    {b.paymentName}
                  </p>
                </div>
                <span className="shrink-0 text-card-body font-extrabold text-wtext-1 dark:text-white tabular-nums">
                  {b.amount.toLocaleString()}원
                </span>
                <Icon
                  name="chevron_right"
                  className="text-[18px] shrink-0 text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
