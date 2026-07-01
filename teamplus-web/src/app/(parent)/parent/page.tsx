'use client';

/**
 * 학부모 메인화면 — DESIGN.md Pattern B `wallet-content` (단일 스크롤).
 * 감독/코치 대시보드 동일 구조 (회원 승인 영역 제외) + 자녀 칩 필터.
 *
 * 구성 (배너 → 공지 → 수업목록 → 자녀칩 → 월달력 → 선택일수업):
 *  0. 자녀 상태 배너 — pending/rejected/자녀0명일 때만 노출 (최상단 긴급 안내)
 *  1. 공지사항 — RecentNoticesSection (팀 단위 정보)
 *  2. 수업 목록 — TeamClassesSummary (팀 등록 수업 상위 5건 요약 + 전체보기)
 *  3. 자녀 칩 row — 승인된 자녀 2명 이상일 때만 (달력·선택일 수업 필터)
 *  4. 수업 일정 — ClassCalendarSection 월 달력 (자녀 등록 수업으로 필터링)
 *  5. 선택일 수업 — SelectedDayClassList (선택일 자녀 수업 + 출석 버튼)
 *
 * 백업: page.wallet-v1.tsx.bak (이전 Wallet 4탭 구조 보존, 빌드 제외)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { ChildChip } from '@/components/common/ChildChip';
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
import { resolveImageSrc } from '@/lib/image-url';
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

interface Selection {
  dateKey: string | null;
  classes: CalendarClass[];
  // [2026-06-10] 이번주 수업 있는 날 그룹 — 홈 '이번주 일정' 표시용.
  weekGroups: { dateKey: string; classes: CalendarClass[] }[];
}

/** GET /enrollments 응답 항목 — 자녀별 등록 수업 매핑용.
 *  백엔드 SoT: child/class 는 중첩 객체로 내려옴 (enrollments.service.ts:972 mapToEnrollmentResponse).
 *  flat childId/classId 는 레거시 호환을 위해 둘 다 허용. */
interface EnrollmentItem {
  id: string;
  childId?: string;
  classId?: string;
  status?: string;
  child?: { id?: string } | null;
  class?: { id?: string; billingMode?: string } | null;
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
  // 헤더 팀 로고 로드 실패(404/깨짐) 시 해당 URL 기억 → 영역 자체를 미렌더(원래 없던 것처럼).
  //   URL 값을 저장하므로 자녀 전환으로 다른 팀 로고가 되면 자동으로 다시 표시.
  const [brokenHeaderLogo, setBrokenHeaderLogo] = useState<string | null>(null);
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
  usePageReady(
    !isChildrenLoading &&
      teams !== null &&
      calendarReady &&
      summaryReady &&
      isLayoutStable &&
      imagesReady &&
      fontsReady,
  );
  const [selection, setSelection] = useState<Selection>({ dateKey: null, classes: [], weekGroups: [] });
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
        // 선불 paid OR 후불(POSTPAID) approved 만 캘린더 노출 (공통 SoT).
        if (!isActiveEnrollment(e.status, e.class?.billingMode)) return;
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

  // 헤더 타이틀 — 선택 자녀 "자녀명 · 소속팀". 소속(club)이 없으면 상태 라벨 노출:
  //   승인 대기는 "승인 대기", 거절·무소속은 "소속없음" (거절도 소속없음으로 통일 — 사용자 지시).
  //   자녀 없으면 기본값(팀플러스).
  const parentHeaderTitle = focusedChild
    ? focusedChild.club
      ? `${focusedChild.name} · ${focusedChild.club}`
      : `${focusedChild.name} · ${
          getChildInactiveReason(focusedChild) === 'pending'
            ? MESSAGES.team.childHeaderPendingLabel
            : MESSAGES.team.childHeaderNoTeamLabel
        }`
    : undefined;

  // 헤더 좌측 팀 로고 — 선택 자녀의 승인 대표 팀(clubIds[0], 부제 club과 동일 출처) 로고.
  //   teams(자녀 소속 팀·logoUrl 보유)에서 매칭. 무소속/미로딩/로고없음 → null(로고 미표시).
  const parentHeaderLogoUrl = focusedChild
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

  // [Phase B] 후불(POSTPAID) 일정의 scheduleId 집합 — SelectedDayClassList 출석 모달
  //   "결제권 차감" 문구 분기용. CalendarClass.id 가 scheduleId 와 동일하므로 직접 매칭.
  const postpaidScheduleIds = useMemo(() => {
    const s = new Set<string>();
    upcomingSchedules.forEach((u) => {
      if (u.billingMode === 'POSTPAID') s.add(u.scheduleId);
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
      <WalletAppBar
        title={parentHeaderTitle}
        titleLeading={
          // URL 없음 또는 로드 실패한 URL → undefined 반환 → PageAppBar 가 leading span 자체를
          //   렌더하지 않음(잔여 여백 0, 로고 영역이 원래 없던 것처럼).
          parentHeaderLogoUrl && parentHeaderLogoUrl !== brokenHeaderLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveImageSrc(parentHeaderLogoUrl)}
              alt=""
              onError={() => setBrokenHeaderLogo(parentHeaderLogoUrl)}
              className="size-6 rounded-md object-cover"
            />
          ) : undefined
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

        {/* ① 공지사항 — 팀 단위 정보 (최상단 배너 다음). 자녀 칩 필터와 무관.
              학부모는 "공지사항" 타이틀(타 역할은 기본 "팀 공지사항"). */}
        <RecentNoticesSection title={MESSAGES.dashboard.notices} iceTheme />

        {/* ② 수업 목록 — 팀 등록 수업 상위 5건 요약 + 전체보기.
              팀 전체 카탈로그라 자녀 칩 필터와 무관 → 칩보다 위에 배치. */}
        <TeamClassesSummary selectedChildId={selectedChildId} onReady={setSummaryReady} iceTheme />

        {/* ③ 자녀 칩 row — 승인 자녀 2명+ 일 때만.
              달력 바로 위 = 탭이 아래 일정(달력·선택일 수업)을 제어한다는 시각 단서. */}
        {approvedChildren.length >= 2 && (
          <div className="pt-6">
            <div
              className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-4 sm:px-5"
              role="tablist"
              aria-label={MESSAGES.drawer.selectChild}
            >
              {approvedChildren.map((c) => (
                <ChildChip
                  key={c.id}
                  iceTheme
                  active={selectedChildId === c.id}
                  label={c.name}
                  onClick={() => setSelectedChildId(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ④ 수업 일정 — full-bleed flat 섹션(ICETIMES). 월 달력. 자녀 등록 수업 필터.
              날짜 클릭 → onSelectionChange 로 아래 선택일 수업 갱신(초기값 오늘). */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <SectionHead title={MESSAGES.dashboard.classSchedule} iceTheme />
          <div className="px-4 sm:px-5 pb-3">
            <ClassCalendarSection
              teamIds={teams ?? []}
              academies={academies}
              enabledClassIds={enabledClassIds}
              enabledChildId={selectedChildId}
              onSelectionChange={setSelection}
              onReady={setCalendarReady}
              iceTheme
            />
          </div>
        </section>

        {/* ⑤ [2026-06-10] 이번주 일정 — full-bleed flat 섹션(ICETIMES). 수업 있는 날만 그룹 + 출석 버튼. */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <SectionHead
            title="이번주 일정"
            action="전체 일정 보기 ›"
            onActionClick={() => navigate('/parent-calendar')}
            iceTheme
          />
          <div className="px-4 sm:px-5 pb-3">
            {selection.weekGroups.length === 0 ? (
            <SelectedDayClassList
              classes={[]}
              scheduleIdToChildIds={scheduleIdToChildIds}
              attendanceMap={attendanceMap}
              childIdToName={childIdToName}
              selectedChildId={selectedChildId}
              todayKey={todayKey}
              onCheckIn={checkInChild}
              postpaidScheduleIds={postpaidScheduleIds}
              iceTheme
            />
          ) : (
            <WeekScheduleList
              groups={selection.weekGroups}
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
                  postpaidScheduleIds={postpaidScheduleIds}
                  bare
                  iceTheme
                />
              )}
            />
          )}
          </div>
        </section>

      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
