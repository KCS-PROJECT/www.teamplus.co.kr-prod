"use client";

/**
 * /team/[id] — 팀 상세 (정보 / 선수단 / 경기 일정)
 *
 * TEAMPLUS 디자인 7원칙:
 *  ① 화면 분석 — 사용자 제공 HTML "팀 상세 정보" 기반
 *  ② 휴먼 디자인 — 실제 정보 위주, 과장 금지
 *  ③ AI 스타일 금지 — backdrop-blur·gradient 0건 (헤더 스크롤 제외)
 *  ④ 페르소나 융합 — frontend + architect + security
 *  ⑤ 명령어 필수 — 탭 전환 / 선수 추가 모달 / 수정·삭제 명령
 *  ⑥ 원칙 표기 — 본 주석
 *  ⑦ 한글 존댓말 + MESSAGES 상수
 *
 * 권한:
 *  - ADMIN/DIRECTOR/COACH: 수정·삭제 + 선수 추가·제거
 *  - PARENT/TEEN/CHILD: 조회 전용 (선수단/경기 일정)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { resolveImageSrc } from '@/lib/image-url';
// 2026-04-12 재디자인 공통 컴포넌트
import {
  TeamHeroBanner,
  TeamTabBar,
  TeamSloganCard,
  TeamStatGrid,
  TeamStatCell,
  TeamHistoryTimeline,
  TeamCoachStaffRow,
  type TeamTab,
} from "@/components/team";
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useLoading } from '@/contexts/LoadingContext';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useViewId } from "@/hooks/useViewId";
import { MESSAGES } from "@/lib/messages";
import { useRefreshSubscription, REFRESH_KEYS } from "@/lib/refresh-bus";
import { isTeamManagerOf } from "@/lib/team-roles";
import { cn } from "@/lib/utils";
import {
  deleteTeam,
  divisionLabel,
  getTeam,
  getRoster,
  getAvailableMembers,
  addRosterMember,
  updateRosterMember,
  removeRosterMember,
  getTeamMatches,
  formatFoundingDate,
  type TeamDetail,
  type RosterMember,
  type AvailableMember,
  type RosterPosition,
  type UpdateRosterPayload,
  type TeamMatch,
  type MatchStatus,
  type TeamCoachStaff,
} from "@/services/team.service";

type TabKey = "info" | "roster" | "schedule";

const POSITION_LABEL: Record<RosterPosition, string> = {
  goalie: MESSAGES.team.positionGoalie,
  defense: MESSAGES.team.positionDefense,
  forward: MESSAGES.team.positionForward,
};

const POSITION_COLOR: Record<RosterPosition, { bg: string; text: string }> = {
  goalie: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-300",
  },
  defense: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-ice-500 dark:text-blue-300",
  },
  forward: {
    bg: "bg-rose-50 dark:bg-rose-900/20",
    text: "text-rose-700 dark:text-rose-300",
  },
};

export default function TeamDetailPage() {
  // viewId 명시 등록 — 동적 라우트([id])는 pathname fallback 시 cuid가 그대로 박혀
  // 서버 로그에 `team/cmoib.../page.tsx` 같이 깨진 viewId가 기록됨. 라우트 그룹
  // `(common)` 까지 포함한 정확한 SoT 경로를 명시 등록한다. (v8.7 2026-05-23)
  useViewId("teamplus-web/src/app/(common)/team/[id]/page.tsx");

  const params = useParams();
  const { navigate } = useNavigation();
  const { startLoading } = useLoading();
  const { toast } = useToast();
  const { modal } = useModal();
  const { user } = useSessionAuth();

  const teamId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : (raw ?? "");
  }, [params]);

  const [team, setTeam] = useState<TeamDetail | null>(null);
  // [수정 2026-05-21] 팀 단위 권한 — 본인 멤버십이 'approved' 인 매니저 역할만 통과.
  //  admin 은 글로벌 통과, 그 외 director/academy_director/coach 는 owner 또는 approved 멤버만.
  //  pending coach / 무관 팀 진입 director 등은 모두 차단.
  const canManage = isTeamManagerOf(user, team);
  // [추가 2026-05-21] 학부모는 자녀 소속 팀 조회 경로로 진입 — 진입 차단 대상 아님.
  const isParentUser = user?.userType === 'parent';
  // [추가 2026-05-21 v2] 권한 거부 토스트 1회만 노출 보장 (React StrictMode 재실행 + loadTeam 403
  //  + useEffect 진입 게이트 둘 다 트리거 시 중복 방지).
  const deniedToastShownRef = useRef(false);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // [추가 2026-05-11] 운영 현황 카드 — 감독·코치 / 학부모 / 선수 카운트.
  //  /teams/{id}/members?status=approved 에서 roleInTeam 별 집계.
  const [memberCounts, setMemberCounts] = useState<{
    staff: number;
    parents: number;
    players: number;
  }>({ staff: 0, parents: 0, players: 0 });
  // [추가 2026-05-16] 코치 staff 목록 — 기존 `useTeamStaff` 가 동일 URL 을 별도
  //  fetch 하던 문제 해결. loadTeam 에서 받은 members 응답을 그대로 derive 하여
  //  같은 페이지에서 `/teams/{id}/members?status=approved` 가 2회 호출되던 회귀 차단.
  const [coachStaff, setCoachStaff] = useState<TeamCoachStaff[]>([]);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // [2026-05-09] Native (Flutter WebView) UI 상태 복원 + 상세 페이지 정책.
  //   · 안드로이드: 상위 LoadingContext 가 enterFullscreen 으로 status bar/AppBar 모두
  //     숨긴 상태에서 이 페이지가 useNativeUI 를 호출하지 않으면 Flutter native AppBar 가
  //     계속 숨겨져 "상단 영역이 비어 있는" 화면 보고. 이 hook 으로 명시적으로
  //     status bar 표시 + native AppBar 숨김(웹 <PageAppBar forceNative/> 사용).
  //   · iOS: isDataLoaded 시그널로 ui.stopLoading() 트리거 → exitFullscreen 즉시 발생,
  //     status bar 노출 지연(2~3초) 해소.
  //   · BottomNav: hockey-matches/[id], tournaments/[id] 등 다른 detail 페이지와 동일한
  //     `showBottomNav: true` 컨벤션 유지 — (common)/layout.tsx 의 RoleBottomNav 와 정합.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false, // 웹 DOM <PageAppBar forceNative /> 사용
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  const [isMatchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const [isRosterModalOpen, setRosterModalOpen] = useState(false);
  const [editingRoster, setEditingRoster] = useState<RosterMember | null>(null);

  // ─── 데이터 로딩 ────────────────────────────────
  const loadTeam = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [teamRes, rosterRes] = await Promise.all([
        getTeam(teamId),
        getRoster(teamId),
      ]);

      if (!teamRes.success || !teamRes.data) {
        // [추가 2026-05-21] 백엔드 권한 가드(403) 응답 시 — 에러 화면 대신
        //  토스트 + /team redirect 로 UX 일관성 유지. StrictMode 재실행 시 토스트
        //  중복 방지를 위해 deniedToastShownRef 가드.
        if (teamRes.error?.statusCode === 403) {
          if (!deniedToastShownRef.current) {
            deniedToastShownRef.current = true;
            toast.info(MESSAGES.team.permissionDenied);
          }
          navigate('/team');
          return;
        }
        setError(teamRes.error?.message || MESSAGES.team.loadError);
        return;
      }

      setTeam(teamRes.data);
      if (rosterRes.success && rosterRes.data) {
        setRoster(rosterRes.data.roster);
      }

      // [수정 2026-05-16] 운영 현황 카드 카운트 + 코치 staff 목록을 동일 응답으로 한 번에 derive.
      //   이전: 페이지 마운트 시 loadTeam 에서 카운트용 fetch + TeamInfoPanel 의
      //         useTeamStaff 훅이 동일 URL 을 다시 fetch → 동일 GET 2회 호출.
      //   변경: 단일 fetch 결과로 memberCounts + coachStaff 모두 setState. useTeamStaff 제거.
      //  roleInTeam:
      //   · HEAD_COACH/COACH/MANAGER → 감독·코치(staff)
      //   · PARENT                    → 학부모
      //   · PLAYER                    → 선수
      try {
        const { api } = await import('@/services/api-client');
        type MemberRow = {
          id: string;
          roleInTeam?: string | null;
          user?: {
            id: string;
            firstName?: string | null;
            lastName?: string | null;
            email?: string;
          } | null;
        };
        const memRes = await api.get<
          MemberRow[] | { members?: MemberRow[]; data?: MemberRow[] }
        >(`/teams/${teamId}/members`, { params: { status: 'approved' } });
        if (memRes.success && memRes.data) {
          const list: MemberRow[] = Array.isArray(memRes.data)
            ? memRes.data
            : Array.isArray((memRes.data as { members?: MemberRow[] }).members)
              ? (memRes.data as { members: MemberRow[] }).members
              : Array.isArray((memRes.data as { data?: MemberRow[] }).data)
                ? (memRes.data as { data: MemberRow[] }).data
                : [];
          // 카운트 집계
          let staff = 0;
          let parents = 0;
          let players = 0;
          for (const m of list) {
            const role = (m.roleInTeam ?? '').toUpperCase();
            if (role === 'HEAD_COACH' || role === 'COACH' || role === 'MANAGER') staff++;
            else if (role === 'PARENT') parents++;
            else if (role === 'PLAYER') players++;
          }
          setMemberCounts({ staff, parents, players });

          // 코치 staff 목록 derive (HEAD_COACH 먼저, COACH 다음, 같은 직책 내 가나다순)
          const mappedStaff: TeamCoachStaff[] = list
            .filter((m) => m.roleInTeam === 'HEAD_COACH' || m.roleInTeam === 'COACH')
            .map((m) => ({
              id: m.id,
              userId: m.user?.id ?? m.id,
              isHead: m.roleInTeam === 'HEAD_COACH',
              user: {
                id: m.user?.id ?? '',
                firstName: m.user?.firstName ?? null,
                lastName: m.user?.lastName ?? null,
                email: m.user?.email ?? '',
              },
            }))
            .sort((a, b) => {
              if (a.isHead !== b.isHead) return a.isHead ? -1 : 1;
              const an = `${a.user.lastName ?? ''}${a.user.firstName ?? ''}`;
              const bn = `${b.user.lastName ?? ''}${b.user.firstName ?? ''}`;
              return an.localeCompare(bn, 'ko-KR');
            });
          setCoachStaff(mappedStaff);
        }
      } catch {
        /* 카운트/staff 실패는 무시 — 기본값 표시 */
      }
    } catch {
      setError(MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, [teamId, toast, navigate]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  // [추가 2026-05-23 hotfix] 팀 정보 변경 후 즉시 재fetch.
  //   edit page 가 emitRefresh(REFRESH_KEYS.TEAM) + [REFRESH_KEYS.TEAM, teamId] 발행 →
  //   본 detail page 가 두 키 구독하여 loadTeam 재실행.
  //   router.replace('/team/${teamId}') 만으로는 동일 경로라 컴포넌트 재마운트가 안 되어
  //   stale 데이터가 노출되던 회귀를 차단.
  useRefreshSubscription(REFRESH_KEYS.TEAM, () => {
    void loadTeam();
  });
  useRefreshSubscription([REFRESH_KEYS.TEAM, teamId], () => {
    void loadTeam();
  });

  // [추가 2026-05-21] 진입 게이트 (옵션 B) — 권한 없는 사용자 즉시 차단.
  //  team 로드 후 canManage(매니저 권한) 와 isParentUser(자녀 소속 학부모) 둘 다 false 면
  //  /team 으로 redirect + 안내 토스트. StrictMode 재실행 시 deniedToastShownRef 가드로
  //  토스트 중복 방지 (loadTeam 403 처리와도 공유).
  useEffect(() => {
    if (!team || !user) return;
    if (canManage || isParentUser) return;
    if (!deniedToastShownRef.current) {
      deniedToastShownRef.current = true;
      toast.info(MESSAGES.team.permissionDenied);
    }
    navigate('/team');
  }, [team, user, canManage, isParentUser, navigate, toast]);

  // 경기 일정 탭을 처음 열 때만 lazy 로드
  useEffect(() => {
    if (activeTab !== "schedule") return;
    if (!teamId) return;
    if (matches.length > 0 || isMatchesLoading) return;

    let cancelled = false;
    setMatchesLoading(true);
    getTeamMatches(teamId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setMatches(res.data.matches);
        }
      })
      .finally(() => {
        if (!cancelled) setMatchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, teamId, matches.length, isMatchesLoading]);

  // ─── 핸들러 ────────────────────────────────
  // [수정 2026-05-23] 사용자 보고: 수정하기 버튼 클릭 시 fullsize 로더 미표시.
  //   원인 추정: useNavigation.dispatch 가 async 라 performRoute 내부 startLoading 호출 시점이
  //   button click 동기 사이클 이후 → Next.js partial rendering 으로 edit page 가 즉시 swap →
  //   로더가 표시되기 전에 hide 되는 race.
  //   조치: navigate 호출 직전 startLoading 동기 호출 — click 이벤트 사이클 내에서 즉시 표시 보장.
  //   LoadingContext 는 idempotent (이미 로딩 중이면 no-op) 라 navigate 내부 중복 호출도 안전.
  const handleEdit = useCallback(() => {
    startLoading("navigation");
    navigate(`/team/${teamId}/edit`);
  }, [navigate, startLoading, teamId]);

  // ─── 팀 자체 삭제 (2단계 확인, 위험 작업) ───────────────────
  //  V01 (2026-05-15): 선수단 탭 하단 "삭제하기" 버튼이 팀 자체를 삭제하는 동작 →
  //   오클릭(선수 제거로 오해) 방지를 위해 2단계 confirm + 라벨 명확화 적용.
  //
  //   Step 1: 영향 범위 경고 (선수단·경기·운영 데이터 접근 불가)
  //   Step 2: 팀명 표기 + 영구 삭제 명시 + danger variant
  //
  //   각 단계는 modal.confirm danger variant 사용. 텍스트 입력 방식은 ModalContext
  //   schema 변경이 필요하므로 본 task 에서는 2-step confirm 으로 안전성 확보.
  const handleDelete = useCallback(async () => {
    // 1단계 — 영향 범위 경고
    const firstOk = await modal.confirm({
      title: MESSAGES.team.deleteTeamWarningTitle,
      message: MESSAGES.team.deleteTeamWarningFirst,
      confirmText: MESSAGES.team.deleteTeamFirstConfirmText,
      cancelText: MESSAGES.common.cancel,
      variant: "danger",
      icon: "warning",
    });
    if (!firstOk) return;

    // 2단계 — 팀명 표기 + 영구 삭제 최종 확인
    const finalOk = await modal.confirm({
      title: MESSAGES.team.deleteTeamFinalTitle,
      message: MESSAGES.team.deleteTeamFinalWarning(team?.name ?? ""),
      confirmText: MESSAGES.team.deleteTeamFinalConfirmText,
      cancelText: MESSAGES.common.cancel,
      variant: "danger",
      icon: "delete_forever",
    });
    if (!finalOk) return;

    try {
      const res = await deleteTeam(teamId);
      if (res.success) {
        toast.success(MESSAGES.team.deleteSuccess);
        navigate("/team");
      } else {
        toast.error(res.error?.message || MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.network);
    }
  }, [modal, team?.name, teamId, toast, navigate]);

  const handleRosterAdded = useCallback(async () => {
    setRosterModalOpen(false);
    toast.success(MESSAGES.team.rosterAddSuccess);
    // 로스터만 재조회 (팀 정보는 그대로)
    const rosterRes = await getRoster(teamId);
    if (rosterRes.success && rosterRes.data) {
      setRoster(rosterRes.data.roster);
    }
  }, [teamId, toast]);

  const handleRosterRemove = useCallback(
    async (item: RosterMember) => {
      const confirmed = await modal.confirm({
        title: MESSAGES.team.rosterRemoveTitle,
        message: MESSAGES.team.rosterRemoveConfirm,
        confirmText: MESSAGES.team.rosterRemoveConfirmText,
        cancelText: MESSAGES.common.cancel,
        variant: "danger",
      });
      if (!confirmed) return;

      try {
        const res = await removeRosterMember(teamId, item.id);
        if (res.success) {
          toast.success(MESSAGES.team.rosterRemoveSuccess);
          setRoster((prev) => prev.filter((r) => r.id !== item.id));
        } else {
          toast.error(res.error?.message || MESSAGES.error.general);
        }
      } catch {
        toast.error(MESSAGES.error.network);
      }
    },
    [modal, teamId, toast],
  );

  const handleRosterEdit = useCallback((item: RosterMember) => {
    setEditingRoster(item);
  }, []);

  const handleRosterEditSave = useCallback(
    async (rosterId: string, payload: UpdateRosterPayload) => {
      const res = await updateRosterMember(teamId, rosterId, payload);
      if (res.success && res.data) {
        toast.success(MESSAGES.team.rosterUpdateSuccess);
        // 낙관적 업데이트: 해당 로스터만 교체 (주장/부주장은 재조회로 동기화)
        if (payload.isCaptain || payload.isAltCaptain) {
          // 주장·부주장은 유일성 보장 로직(다른 로스터의 captain 해제)이 있으므로
          // 서버 재조회가 정확함
          const rosterRes = await getRoster(teamId);
          if (rosterRes.success && rosterRes.data) {
            setRoster(rosterRes.data.roster);
          }
        } else {
          setRoster((prev) =>
            prev.map((r) =>
              r.id === rosterId ? { ...r, ...(res.data as RosterMember) } : r,
            ),
          );
        }
        setEditingRoster(null);
      } else {
        toast.error(res.error?.message || MESSAGES.error.general);
      }
    },
    [teamId, toast],
  );

  // ─── Render: 로딩 ──────────────────────
  if (isLoading) {
    return null;
  }

  // ─── Render: 에러 ──────────────────────
  if (error || !team) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar
          title={MESSAGES.team.titleDetail}
          forceNative
          titleClassName="text-card-section font-bold"
        />
        <main
          className="flex flex-1 items-center justify-center bg-wbg px-4 dark:bg-rink-900"
          role="main"
          aria-label={MESSAGES.team.titleDetail}
        >
          <EmptyState
            icon="error_outline"
            title={error || MESSAGES.team.notFound}
            description={MESSAGES.team.retryHint}
            actionLabel={MESSAGES.team.backToList}
            onAction={() => navigate("/team")}
          />
        </main>
      </MobileContainer>
    );
  }

  // [추가 2026-05-21] 진입 권한 즉시 차단 — useEffect redirect 가 비동기로 트리거되는
  //  동안 콘텐츠가 한 프레임 보이는 회귀를 막기 위해 render 단계에서도 동일 가드.
  if (!canManage && !isParentUser) {
    return null;
  }

  // ─── Render: 성공 ──────────────────────

  // [변경 2026-05-21 시나리오 B] Hero 서브타이틀을 teamCode 중심으로 재구성.
  //   기존: shortName(약칭) 의존 — Phase 2 잔재 컬럼이라 거의 항상 NULL → division 분기로만 작동.
  //   변경: teamCode(가입 시 사용자 입력) + division 합성 — 팀 식별성을 명확히 노출.
  const heroSubtitle = team.teamCode
    ? team.division
      ? `${team.teamCode} · ${divisionLabel(team.division)}`
      : team.teamCode
    : team.division
      ? `${team.club.clubName} · ${divisionLabel(team.division)}`
      : team.club.clubName;
  // Hero 태그라인: "Since YYYY · 리그명" (foundingDate 우선, 없으면 createdAt)
  const foundingYear = new Date(
    team.foundingDate ?? team.createdAt,
  ).getFullYear();
  const heroTagline = `Since ${foundingYear} · ${MESSAGES.team.leagueTagFallback}`;

  // 탭 정의 (재디자인 공통 컴포넌트)
  const tabs: TeamTab<TabKey>[] = [
    { key: "info", label: MESSAGES.team.tabInfo },
    { key: "roster", label: MESSAGES.team.tabRoster, count: roster.length },
    {
      key: "schedule",
      label: MESSAGES.team.tabSchedule,
      count: (team._count?.homeMatches ?? 0) + (team._count?.awayMatches ?? 0),
    },
  ];

  // [수정 2026-05-18 W2.B #3] 모바일 셸 너비 720px 오버라이드 제거.
  //   기존: PC 화면 활용 의도로 720px override → 모바일 BottomNav (max-w 448px) 와
  //         가로 길이 불일치 → 카드/콘텐츠가 BottomNav 폭을 초과하여 잘려 보임.
  //   변경: 기본 448px (MobileContainer SoT) 그대로 사용 — BottomNav 와 정확히 일치.
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title={MESSAGES.team.titleDetail}
        forceNative
        titleClassName="text-card-section font-bold"
      />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-wbg dark:bg-rink-900"
        role="main"
        aria-label={MESSAGES.team.detailAriaLabel(team.name ?? "")}
      >
        {/* ─── Hero Card (v2 2026-05-23 휴먼 디자인 재설계) ─────────────────────────
            8 절대 규칙 준수:
              · gradient 금지 → solid bg-ice-500 (단일 인디고 #2f5fff)
              · backdrop-blur 금지
              · colored shadow 금지 → shadow-sh-rink (디자인 토큰)
              · 임의 hex 금지 → tailwind 토큰만 사용
            UX 개선:
              · 로고 박스 56→72px 확대 + rounded-w-2xl (28px) 라운드 = 휴먼한 풍부함
              · venue 칩을 카드 내 자연스러운 위치(우측 상단) — 흰 outline + 반투명
              · 팀명 위계 명확화 (h2 28px) + 약어를 메타 라인에 통합
              · Since/리그 메타 라인 정돈 (dot separator) ─── */}
        <div className="px-5 pt-3">
          <div className="relative overflow-hidden rounded-w-2xl bg-ice-500 px-5 pt-5 pb-6 text-white shadow-sh-rink dark:bg-rink-800">
            {/* 메인 정보 영역 — 로고 + 텍스트 */}
            <div className="flex items-center gap-4">
              {/* 로고 박스 — 72×72, rounded-w-2xl, 흰 배경 + 디자인 토큰 그림자 */}
              <div className="flex size-[72px] shrink-0 items-center justify-center rounded-w-2xl bg-white shadow-sh-2 dark:bg-wsurface">
                {resolveImageSrc(team.logoUrl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveImageSrc(team.logoUrl)}
                    alt=""
                    className="size-full rounded-w-2xl object-cover"
                  />
                ) : (
                  <Icon
                    name="sports_hockey"
                    aria-hidden="true"
                    className="text-[32px] text-ice-500"
                  />
                )}
              </div>

              {/* 텍스트 영역 — 위계 3단계 (팀명+위치 / 약어 / 메타) */}
              <div className="min-w-0 flex-1 pt-1">
                {/* [수정 2026-05-26 B4] 팀명 + 홈 경기장 칩을 같은 flex 행에 배치하여 겹침 제거.
                    기존: 경기장 칩이 `absolute top-4 right-4` 로 카드 우상단에 떠 있어
                          경기장명이 길면 팀명(h2) 우측과 겹쳐 보임 (fallback: venue.name →
                          homeArena → club.location).
                    변경: 팀명(min-w-0 flex-1 truncate) + 경기장 칩(shrink-0 max-w-[45%] truncate)을
                          flex 행으로 묶어 두 텍스트가 절대 겹치지 않도록 함. */}
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-w-h2 font-extrabold tracking-[-0.025em] text-white">
                    {team.name}
                  </h2>
                  {(team.venue?.name || team.homeArena || team.club?.location) && (
                    <span className="mt-1 inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-w-pill border border-white/30 bg-white/15 px-2.5 py-1">
                      <Icon
                        name="place"
                        size={13}
                        className="shrink-0 text-white"
                        aria-hidden="true"
                      />
                      <span className="truncate text-card-meta font-bold tracking-tight text-white">
                        {team.venue?.name || team.homeArena || team.club?.location}
                      </span>
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-card-body font-bold tabular-nums tracking-tight text-white/95">
                  {heroSubtitle}
                </div>
                <div className="mt-1 truncate text-card-meta font-medium text-white/75">
                  {heroTagline}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Tabs (04e inline) — 흰색 박스 안에 grid 1/1/1 + primary 활성 + 카운트 배지 ─── */}
        <section
          className="px-5 pt-4 pb-1"
          aria-label={MESSAGES.team.ariaTabMenu}
        >
          <div className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-1 grid grid-cols-3 gap-1">
            {tabs.map((t) => {
              const on = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "h-9 rounded-[10px] inline-flex items-center justify-center gap-1.5 text-card-body font-extrabold tracking-tight transition-colors motion-reduce:transition-none",
                    on
                      ? "bg-ice-500 text-white shadow-md"
                      : "bg-transparent text-wtext-3 dark:text-rink-300 hover:bg-wbg dark:hover:bg-rink-700/50",
                  )}
                  aria-pressed={on}
                  aria-controls={`tabpanel-${t.key}`}
                >
                  {t.label}
                  {typeof t.count === "number" && (
                    <span
                      className={cn(
                        "min-w-[18px] h-[18px] px-1.5 rounded-w-pill text-card-meta font-extrabold tabular-nums inline-flex items-center justify-center",
                        on
                          ? "bg-white/25 text-white"
                          : "bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Tab Content ──────────────── */}
        <section className="pt-2">
          {activeTab === "info" && (
            <div
              role="tabpanel"
              id="tabpanel-info"
              aria-labelledby="tab-info"
              tabIndex={0}
            >
              <TeamInfoPanel team={team} memberCounts={memberCounts} coachStaff={coachStaff} />
            </div>
          )}
          {activeTab === "roster" && (
            <div
              role="tabpanel"
              id="tabpanel-roster"
              aria-labelledby="tab-roster"
              tabIndex={0}
            >
              <RosterPanel
                roster={roster}
                canManage={canManage}
                onRemove={handleRosterRemove}
                onEdit={handleRosterEdit}
              />
            </div>
          )}
          {activeTab === "schedule" && (
            <div
              role="tabpanel"
              id="tabpanel-schedule"
              aria-labelledby="tab-schedule"
              tabIndex={0}
            >
              <SchedulePanel
                team={team}
                matches={matches}
                isLoading={isMatchesLoading}
              />
            </div>
          )}
        </section>

        {/* ─── Bottom CTA — body 흐름 마지막에 위치 (fixed 해제, 2026-05-09)
            기존 `fixed inset-x-0 bottom-[72px]` 화면 고정 → 사용자 요청에 따라
            본문 스크롤 흐름의 맨 아래로 이동. MobileContainer 의 [&>main]:pb-30 (120px)
            이 BottomNav 영역(60px+safe-area)을 자동 보전하므로 별도 보정 불필요.
            (50px h, rounded 14, 1fr 2fr — 참고자료 04e 비율 유지) */}
        <div
          className="px-5 mt-2"
          role="toolbar"
          aria-label={MESSAGES.team.ariaActions}
        >
          {canManage ? (
            // V01 (2026-05-15): 버튼 라벨을 "삭제하기" → "팀 자체 삭제" 로 명확화.
            //  사용자가 선수단 탭에 있을 때 "선수 제거"로 오해할 수 있어 스코프를
            //  명시. handleDelete 는 2단계 confirm (영향 경고 → 팀명 최종 확인) 적용.
            //  warning 아이콘으로 위험 작업 시각 신호 강화.
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleDelete}
                className="flex h-[50px] flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-red-200 bg-white text-card-body font-extrabold text-red-600 tracking-tight hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 active:scale-[0.98] dark:border-red-900/50 dark:bg-rink-800 dark:hover:bg-red-900/20"
                aria-label={MESSAGES.team.deleteTeamAriaLabel}
              >
                <Icon name="warning" className="text-[15px]" aria-hidden="true" />
                {MESSAGES.team.deleteTeamButtonLabel}
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="flex h-[50px] flex-[2] items-center justify-center gap-1.5 rounded-[14px] bg-ice-500 text-card-body font-extrabold text-white tracking-tight hover:bg-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 active:scale-[0.98] shadow-md"
                aria-label={MESSAGES.team.editTeamAriaLabel}
              >
                <Icon name="edit" className="text-[16px]" aria-hidden="true" />
                {MESSAGES.common.edit}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-ice-500 text-card-body font-bold text-white opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
              onClick={() => toast.info(MESSAGES.team.inquireJoinUnavailable)}
              aria-label={MESSAGES.team.inquireJoin}
              aria-disabled="true"
            >
              <Icon
                name="person_add"
                className="text-[18px]"
                aria-hidden="true"
              />
              {MESSAGES.team.inquireJoin}
            </button>
          )}
        </div>
      </main>

      {/* ─── Add Roster Modal ────────────────
          [수정 2026-05-18 W2.B #5] currentRoster prop 전달 — 모달이 이미 등록된 회원을
          클라이언트 차단(백엔드 backstop 외 2중 안전망)할 수 있도록 함.
            CoachProfileService.getAvailableTeamMembers 는 이미 roster member 를 제외하지만
            동시성 race condition 또는 stale 캐시 대비 클라이언트 사이드 가드를 둠. */}
      {isRosterModalOpen && (
        <AddRosterModal
          teamId={teamId}
          currentRoster={roster}
          onClose={() => setRosterModalOpen(false)}
          onAdded={handleRosterAdded}
        />
      )}

      {/* ─── Edit Roster Modal ──────────────── */}
      {editingRoster && (
        <EditRosterModal
          roster={editingRoster}
          onClose={() => setEditingRoster(null)}
          onSave={handleRosterEditSave}
        />
      )}
    </MobileContainer>
  );
}

// ─── Sub: TabButton ──────────────────────────────
// (2026-04-12) TabButton 은 `@/components/team/TeamTabBar` 로 이관됨.

/**
 * 본 팀에 실제 매핑된 감독·코치만 추출 (Team.coaches 모음이 아니라 TeamRoster 기반).
 * GET /api/v1/teams/:id/roster → roleInTeam in [HEAD_COACH, COACH] 필터.
 */
// [제거 2026-05-16] useTeamStaff 훅 — 동일 `/teams/{id}/members?status=approved` URL 을
//   부모 loadTeam 과 별도로 fetch 하여 같은 페이지에서 GET 2회 호출 회귀를 일으켰음.
//   부모 page state `coachStaff` 로 통합 (loadTeam 의 members 응답을 derive).

// ─── Sub: Info Panel (재디자인 v2 — 공통 컴포넌트 사용) ─
// 레퍼런스: 사용자 제공 HTML "팀 상세 정보" — Team Slogan / Quick Stats / Team History / Coaching Staff
function TeamInfoPanel({
  team,
  memberCounts,
  coachStaff,
}: {
  team: TeamDetail;
  memberCounts: { staff: number; parents: number; players: number };
  coachStaff: TeamCoachStaff[];
}) {
  // [04e 디자인 전면 적용 2026-05-09] 참고자료 "04e · 감독 팀 상세 (개선)"
  // 슬로건/2-grid/약력 빈상태/코치 빈상태/팀 정보 정의형 리스트/운영 현황/그룹 현황을
  // 모두 inline 으로 04e 패턴 직접 구현 (외부 공통 컴포넌트 의존성 제거).
  const router = useRouter();
  const foundingLabel = formatFoundingDate(team.foundingDate, team.createdAt);
  // [수정 2026-05-23] fallback 우선순위 — venue 마스터 우선 (legacy homeArena 와 sync 안 될 때
  //  정확한 venue.name 노출). VenuePicker 로 선택된 이름이 즉시 반영됨.
  const homeArenaLabel =
    team.venue?.name ||
    team.homeArena ||
    team.club.location ||
    team.club.clubName;
  const slogan = team.slogan?.trim() || "";

  return (
    <div className="flex flex-col gap-0 pb-6">
      {/* ─── 1) 팀 슬로건 — 좌측 3px primary 액센트 + italic 인용문 + 수정 버튼 (참고자료 04e) ─── */}
      <div className="px-5 pt-4">
        <div
          className="relative rounded-[14px] py-4 pl-[22px] pr-4"
          style={{ background: "rgb(47 95 255 / 0.05)", border: "1px solid rgb(47 95 255 / 0.15)" }}
        >
          <span
            className="absolute left-3 top-4 bottom-4 w-[3px] rounded-[2px] bg-ice-500"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between mb-2">
            <span className="text-card-meta font-extrabold text-wtext-1 dark:text-white tracking-tight">
              {MESSAGES.team.slogan}
            </span>
            <button
              type="button"
              onClick={() => router.push(`/team/${team.id}/edit`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-w-pill bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 text-card-meta font-bold hover:border-ice-500/40 transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label={MESSAGES.team.editSloganAriaLabel}
            >
              <Icon name="edit" size={11} aria-hidden="true" />
              {MESSAGES.common.edit}
            </button>
          </div>
          <p
            className="text-card-emphasis font-extrabold italic tracking-tight"
            style={{ color: "#1f47e6", letterSpacing: "-0.02em" }}
          >
            {slogan ? `"${slogan}"` : `"${MESSAGES.teamSlogan.placeholder}"`}
          </p>
        </div>
      </div>

      {/* ─── 2) 창단 + 홈 경기장 — 2-grid 카드 ─── */}
      <div className="px-5 pt-3 grid grid-cols-2 gap-2.5">
        {[
          { label: MESSAGES.team.founded, value: foundingLabel, icon: "event" },
          { label: MESSAGES.team.homeArena, value: homeArenaLabel, icon: "stadium" },
        ].map((it) => (
          <div
            key={it.label}
            className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-3.5 py-3.5"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon
                name={it.icon}
                size={14}
                className="text-wtext-3 dark:text-rink-300"
                aria-hidden="true"
              />
              <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 tracking-wider">
                {it.label}
              </span>
            </div>
            <div className="text-card-title font-extrabold text-wtext-1 dark:text-white tracking-tight truncate">
              {it.value}
            </div>
          </div>
        ))}
      </div>

      {/* ─── 3) 팀 소개 (선택) ─── */}
      {team.description && (
        <>
          <div className="px-5 pt-5 pb-2 flex items-center gap-2">
            <span className="inline-block w-[3px] h-[14px] rounded-[2px] bg-ice-500" aria-hidden="true" />
            <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
              {MESSAGES.team.aboutSection}
            </h3>
          </div>
          <div className="px-5">
            <div className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-4 py-4">
              <p className="text-card-body leading-relaxed text-wtext-2 dark:text-rink-100 whitespace-pre-wrap">
                {team.description}
              </p>
            </div>
          </div>
        </>
      )}

      {/* [수정 2026-05-12] 주요 약력 섹션 — 위치를 페이지 맨 아래로 이동 (그룹 현황 뒤). */}

      {/* ─── 5) 감독/코치 — 빈 상태 또는 row ─── */}
      <div className="px-5 pt-5 pb-2 flex items-center gap-2">
        <span className="inline-block w-[3px] h-[14px] rounded-[2px] bg-ice-500" aria-hidden="true" />
        <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
          {MESSAGES.team.coachStaff}
        </h3>
      </div>
      <div className="px-5">
        {coachStaff && coachStaff.length > 0 ? (
          <div className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-4 py-3 flex flex-col gap-2">
            {coachStaff.map((c) => {
              const fullName = `${c.user.lastName ?? ""}${c.user.firstName ?? ""}`.trim() || c.user.email;
              const role = c.isHead ? MESSAGES.team.headCoachBadge : MESSAGES.team.coachBadge;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 py-1.5"
                >
                  <div className="size-9 rounded-w-pill bg-ice-500/10 text-ice-500 flex items-center justify-center text-card-body font-extrabold">
                    {fullName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-card-body font-bold text-wtext-1 dark:text-white tracking-tight truncate">
                      {fullName}
                    </div>
                    <div className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                      {role}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-5 py-7 flex flex-col items-center gap-2">
            <div className="size-12 rounded-w-pill bg-wbg dark:bg-rink-900/40 flex items-center justify-center">
              <Icon
                name="person_off"
                size={24}
                className="text-wtext-3 dark:text-rink-300"
                aria-hidden="true"
              />
            </div>
            <div className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
              {MESSAGES.team.coachStaffEmpty}
            </div>
          </div>
        )}
      </div>

      {/* ─── 6) 팀 정보 — 정의형 리스트 ─── */}
      <div className="px-5 pt-5 pb-2 flex items-center gap-2">
        <span className="inline-block w-[3px] h-[14px] rounded-[2px] bg-ice-500" aria-hidden="true" />
        <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
          {MESSAGES.team.metaTeamInfo}
        </h3>
      </div>
      <div className="px-5">
        <div className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-4">
          {[
            {
              k: MESSAGES.team.metaDivision,
              v: team.division ? divisionLabel(team.division) : "-",
              tabular: true,
            },
            {
              // [변경 2026-05-21 시나리오 B] shortName(잔재) 행 제거 후 teamCode 노출.
              //   회원가입 시 입력한 팀 식별 코드를 명확히 표시.
              k: MESSAGES.team.metaTeamCode,
              v: team.teamCode || "-",
              tabular: true,
            },
            {
              k: MESSAGES.team.metaPrimaryColor,
              v: team.primaryColor ?? null,
              isColor: true,
            },
            {
              k: MESSAGES.team.metaSecondaryColor,
              v: team.secondaryColor ?? null,
              isColor: true,
            },
            {
              k: MESSAGES.team.metaStatus,
              v: team.isActive ? MESSAGES.team.metaActive : MESSAGES.team.metaInactive,
              isStatus: true,
            },
          ].map((row, i, arr) => (
            <div
              key={row.k}
              className={cn(
                "flex items-center justify-between py-3",
                i < arr.length - 1 && "border-b border-wline-2 dark:border-rink-700",
              )}
            >
              <span className="text-card-body font-semibold text-wtext-3 dark:text-rink-300">
                {row.k}
              </span>
              <span className="text-card-body">
                {row.isStatus ? (
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-md text-card-meta font-extrabold tracking-wider",
                      team.isActive
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                        : "bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300",
                    )}
                  >
                    {row.v}
                  </span>
                ) : row.isColor ? (
                  row.v ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block size-3.5 rounded-w-pill"
                        style={{
                          backgroundColor: row.v as string,
                          boxShadow: `0 2px 6px ${row.v}55`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="font-extrabold tabular-nums text-wtext-1 dark:text-white tracking-tight">
                        {row.v}
                      </span>
                    </span>
                  ) : (
                    <span className="font-bold text-wtext-3 dark:text-rink-300">—</span>
                  )
                ) : (
                  <span
                    className={cn(
                      "font-extrabold text-wtext-1 dark:text-white tracking-tight",
                      row.tabular && "tabular-nums",
                    )}
                  >
                    {row.v}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 7) 운영 현황 — 3 stats ─── */}
      <div className="px-5 pt-5 pb-2 flex items-center gap-2">
        <span className="inline-block w-[3px] h-[14px] rounded-[2px] bg-ice-500" aria-hidden="true" />
        <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
          {MESSAGES.team.operationStats}
        </h3>
      </div>
      <div className="px-5">
        <div className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-4 py-5 grid grid-cols-3 gap-2">
          {/* [수정 2026-05-11] 선수/홈경기/원정경기 → 감독·코치/학부모/선수 (역할별 인원) */}
          {[
            { label: MESSAGES.team.statStaff, v: memberCounts.staff, unit: MESSAGES.team.unitPerson, accent: false },
            { label: MESSAGES.team.statParent, v: memberCounts.parents, unit: MESSAGES.team.unitPerson, accent: false },
            { label: MESSAGES.team.statPlayer, v: memberCounts.players, unit: MESSAGES.team.unitPerson, accent: true },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 tracking-wider mb-1.5">
                {s.label}
              </div>
              <div className="inline-flex items-baseline gap-[3px]">
                <span
                  className={cn(
                    "text-w-h2 font-extrabold tabular-nums leading-none",
                    s.accent
                      ? "text-ice-500"
                      : "text-wtext-3 dark:text-rink-300",
                  )}
                  style={{ letterSpacing: "-0.03em" }}
                >
                  {s.v}
                </span>
                <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                  {s.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 8) 그룹 현황 — chip 리스트 (방패 아이콘 + 이름 + 연령) ─── */}
      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-[3px] h-[14px] rounded-[2px] bg-ice-500" aria-hidden="true" />
          <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
            {MESSAGES.team.groupStats}
          </h3>
          <span className="ml-1 px-1.5 py-px rounded-w-pill bg-wline-2 dark:bg-rink-700 text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tabular-nums">
            {team._count?.groups ?? 0}
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/team/${team.id}/groups`, { scroll: false })}
          aria-label={MESSAGES.team.groupsViewMore}
          className="size-7 flex items-center justify-center text-wtext-3 dark:text-rink-300 hover:text-ice-500"
        >
          <Icon name="chevron_right" size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="px-5">
        <button
          type="button"
          onClick={() => router.push(`/team/${team.id}/groups`, { scroll: false })}
          className="block w-full text-left rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-3.5 py-3.5 hover:border-ice-500/40 transition-colors motion-reduce:transition-none active:brightness-95"
          aria-label={MESSAGES.team.groupsViewMore}
        >
          {team.groups && team.groups.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {team.groups.map((g) => (
                <li
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-wbg dark:bg-rink-900/40 border border-wline-2 dark:border-rink-700 px-3 py-2"
                >
                  <Icon
                    name="shield"
                    size={13}
                    className="text-ice-500"
                    aria-hidden="true"
                  />
                  <span className="text-card-meta font-extrabold text-wtext-1 dark:text-white tracking-tight truncate">
                    {g.name}
                  </span>
                  {/* [2026-06-05] 출생연도(4자리)만 "년생" 표시. 레거시 U8~U12 는 숨김. */}
                  {g.ageGroup && /^\d{4}$/.test(g.ageGroup) && (
                    <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 tabular-nums">
                      · {g.ageGroup}년생
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-card-body text-wtext-3 dark:text-rink-300">
              {MESSAGES.team.groupsEmpty}
            </p>
          )}
        </button>
      </div>

      {/* ─── [재배치 2026-05-12] 주요 약력 — 페이지 맨 아래로 이동 ─── */}
      <div className="px-5 pt-5 pb-2 flex items-center gap-2">
        <span className="inline-block w-[3px] h-[14px] rounded-[2px] bg-ice-500" aria-hidden="true" />
        <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
          {MESSAGES.team.history}
        </h3>
      </div>
      <div className="px-5">
        <div className="rounded-[14px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-5 py-8 flex flex-col items-center gap-2">
          <div className="size-12 rounded-w-pill bg-wbg dark:bg-rink-900/40 flex items-center justify-center">
            <Icon
              name="emoji_events"
              size={24}
              className="text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          {team.teamAwards && team.teamAwards.length > 0 ? (
            <ul className="w-full flex flex-col gap-2 mt-2">
              {team.teamAwards.slice(0, 3).map((a) => {
                const awardYear = a.awardedAt
                  ? new Date(a.awardedAt).getFullYear()
                  : null;
                return (
                  <li key={a.id} className="flex items-start gap-2 text-card-body">
                    <span className="shrink-0 mt-0.5 size-1.5 rounded-w-pill bg-ice-500" aria-hidden="true" />
                    <span className="font-bold text-wtext-1 dark:text-white">{a.awardName}</span>
                    {awardYear && (
                      <span className="text-wtext-3 dark:text-rink-300 tabular-nums">· {awardYear}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <div className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
                {MESSAGES.team.historyEmpty}
              </div>
              <div className="text-card-meta text-wtext-3 dark:text-rink-300 text-center leading-relaxed">
                {MESSAGES.team.historyEmptyHint}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// InfoStat 은 TeamStatCell (공통 컴포넌트) 로 이관됨.

function SectionTitle({ label }: { label: string }) {
  // 참고자료 04e — 좌측 3×14 컬러 막대(rounded-sm) + 14px 라벨(font-extrabold).
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-[3px] h-[14px] rounded-[2px] bg-ice-500"
        aria-hidden="true"
      />
      <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight">
        {label}
      </h3>
    </div>
  );
}

function MetaRow({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-card-body">
      <dt className="font-medium text-wtext-3 dark:text-rink-300">
        {label}
      </dt>
      <dd className="font-bold text-wtext-1 dark:text-white">
        {valueNode ?? value ?? "-"}
      </dd>
    </div>
  );
}

function ColorSwatch({ hex }: { hex: string | null }) {
  if (!hex) return <span className="text-wtext-3">-</span>;
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block size-4 rounded-w-pill border border-wline dark:border-rink-700"
        style={{ backgroundColor: hex }}
        aria-hidden="true"
      />
      <span className="font-mono text-card-meta font-bold text-wtext-2 dark:text-rink-100">
        {hex}
      </span>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit: string;
  /** 첫 stat 등 강조용 — primary 컬러 적용 (참고자료 04e 패턴) */
  accent?: boolean;
}) {
  // 참고자료 04e — 큰 숫자(26px font-extrabold tabular) + 단위(11px baseline).
  // accent=true 인 경우 primary 색 (운영 현황의 "선수" 항목).
  return (
    <div className="text-center">
      <dt className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 tracking-wider mb-1.5">
        {label}
      </dt>
      <dd className="inline-flex items-baseline gap-[3px]">
        <span
          className={cn(
            "text-w-h2 font-extrabold tabular-nums leading-none",
            accent
              ? "text-ice-500"
              : "text-wtext-3 dark:text-rink-300",
          )}
          style={{ letterSpacing: "-0.03em" }}
        >
          {value}
        </span>
        <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300">
          {unit}
        </span>
      </dd>
    </div>
  );
}

// ─── Sub: Roster Panel ───────────────────────────
function RosterPanel({
  roster,
  canManage,
  onRemove,
  onEdit,
}: {
  roster: RosterMember[];
  canManage: boolean;
  onRemove: (item: RosterMember) => void;
  onEdit: (item: RosterMember) => void;
}) {
  if (roster.length === 0) {
    return (
      <EmptyState
        icon="group_off"
        title={MESSAGES.team.rosterEmpty}
        description={MESSAGES.team.rosterEmptyHint}
      />
    );
  }

  return (
    <div className="space-y-3 px-5">
      <ul className="space-y-3" aria-label={MESSAGES.team.ariaRosterList}>
        {roster.map((item) => (
          <li key={item.id}>
            <RosterCard
              item={item}
              canManage={canManage}
              onRemove={onRemove}
              onEdit={onEdit}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RosterCard({
  item,
  // [수정 2026-05-13] 선수단탭 학생 카드의 수정/삭제 버튼 제거에 따라 props 미사용.
  //  caller 인터페이스 호환을 위해 받기만 하고 사용하지 않음. underscore prefix 로 lint 통과.
  canManage: _canManage,
  onRemove: _onRemove,
  onEdit: _onEdit,
}: {
  item: RosterMember;
  canManage: boolean;
  onRemove: (item: RosterMember) => void;
  onEdit: (item: RosterMember) => void;
}) {
  const pos = item.position ? POSITION_COLOR[item.position] : null;
  // 메타 줄 — 있는 정보만 ' · ' 로 연결. 포지션은 기능 도입 시 자동 노출, 그 전엔 출생연도·그룹만.
  const metaParts = [
    item.position ? POSITION_LABEL[item.position] : null,
    item.member.birthYear
      ? MESSAGES.team.birthYearLabel(item.member.birthYear)
      : null,
    item.groupName ?? (item.isGrouped ? null : MESSAGES.team.groupUnassigned),
  ].filter(Boolean);

  return (
    <article className="rounded-2xl border border-wline-2 bg-white p-4 shadow-card dark:border-rink-700 dark:bg-rink-800">
      <div className="flex items-start gap-3">
        {/* Jersey Number / Avatar */}
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl font-extrabold",
            pos ? pos.bg : "bg-wline-2 dark:bg-rink-700",
            pos ? pos.text : "text-wtext-3",
          )}
          aria-label={MESSAGES.team.jerseyAriaLabel(item.jerseyNumber)}
        >
          {item.jerseyNumber != null ? (
            <span className="text-card-title tabular-nums">{item.jerseyNumber}</span>
          ) : (
            <Icon name="person" className="text-2xl" aria-hidden="true" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-card-body font-bold text-wtext-1 dark:text-white">
              {item.member.playerName}
            </h4>
            {item.isCaptain && (
              <span
                className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-card-meta font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                aria-label={MESSAGES.team.captain}
              >
                C
              </span>
            )}
            {item.isAltCaptain && (
              <span
                className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-card-meta font-bold text-ice-500 dark:bg-blue-900/20 dark:text-blue-300"
                aria-label={MESSAGES.team.altCaptain}
              >
                A
              </span>
            )}
          </div>
          {metaParts.length > 0 && (
            <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300">
              {metaParts.join(" · ")}
            </p>
          )}
        </div>

        {/* [수정 2026-05-13] 선수단탭에서 학생 카드 수정/삭제 버튼 제거.
            학생 정보 수정·삭제는 admin 학생관리(/dashboard/members) 페이지에서만 수행.
            (canManage/isGrouped 분기 자체 제거 — 화면이 코치/감독에게도 조회 전용.) */}
      </div>
    </article>
  );
}

// ─── Sub: Schedule Panel (실제 경기 데이터) ────────────

const MATCH_STATUS_BADGE: Record<
  MatchStatus,
  { label: string; className: string }
> = {
  scheduled: {
    label: MESSAGES.match.statusLabel.scheduled,
    className: "bg-blue-50 text-ice-500 dark:bg-blue-900/20 dark:text-blue-300",
  },
  warmup: {
    label: MESSAGES.match.statusLabel.warmup,
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  },
  in_progress: {
    label: MESSAGES.match.statusLabel.in_progress,
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  },
  intermission: {
    label: MESSAGES.match.statusLabel.intermission,
    className:
      "bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100",
  },
  completed: {
    label: MESSAGES.match.statusLabel.completed,
    className:
      "bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100",
  },
  postponed: {
    label: MESSAGES.match.statusLabel.postponed,
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  },
  cancelled: {
    label: MESSAGES.match.statusLabel.cancelled,
    className: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  },
};

function formatMatchDate(iso: string): {
  date: string;
  day: string;
  time: string;
} {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return {
    date: `${d.getFullYear()}.${month}.${day}`,
    day: MESSAGES.team.dayShort[d.getDay()],
    time: `${hours}:${minutes}`,
  };
}

function SchedulePanel({
  team,
  matches,
  isLoading,
}: {
  team: TeamDetail;
  matches: TeamMatch[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return null;
  }

  if (matches.length === 0) {
    return (
      <EmptyState
        icon="calendar_today"
        title={MESSAGES.team.scheduleEmptyTitle}
        description={MESSAGES.team.scheduleEmptyHint}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 상단 요약 카드 */}
      <div className="rounded-2xl border border-wline-2 bg-white p-5 shadow-card dark:border-rink-700 dark:bg-rink-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-5 w-1 rounded-w-pill bg-ice-500"
              aria-hidden="true"
            />
            <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
              {MESSAGES.team.matchesTotalLabel}
            </h3>
          </div>
          <span className="text-card-meta font-medium text-wtext-3">
            {MESSAGES.team.matchesTotal(matches.length)}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="text-center">
            <dt className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
              {MESSAGES.team.statHomeMatch}
            </dt>
            <dd className="mt-1 text-xl font-extrabold tabular-nums text-wtext-1 dark:text-white">
              {team._count?.homeMatches ?? 0}
              <span className="ml-0.5 text-card-meta font-medium text-wtext-3">
                {MESSAGES.team.unitCount}
              </span>
            </dd>
          </div>
          <div className="text-center">
            <dt className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
              {MESSAGES.team.statAwayMatch}
            </dt>
            <dd className="mt-1 text-xl font-extrabold tabular-nums text-wtext-1 dark:text-white">
              {team._count?.awayMatches ?? 0}
              <span className="ml-0.5 text-card-meta font-medium text-wtext-3">
                {MESSAGES.team.unitCount}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* 경기 목록 */}
      <ul className="space-y-3" aria-label={MESSAGES.team.ariaMatchList}>
        {matches.map((match) => (
          <li key={match.id}>
            <MatchCard match={match} teamId={team.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchCard({ match, teamId }: { match: TeamMatch; teamId: string }) {
  const { date, day, time } = formatMatchDate(match.scheduledAt);
  const isHome = match.homeTeamId === teamId;
  const myTeam = isHome ? match.homeTeam : match.awayTeam;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  const myScore = isHome ? match.homeScore : match.awayScore;
  const oppScore = isHome ? match.awayScore : match.homeScore;
  const statusBadge = MATCH_STATUS_BADGE[match.status];
  const isFinished = match.status === "completed";
  const isWin = isFinished && myScore > oppScore;
  const isDraw = isFinished && myScore === oppScore;

  const location = match.venue?.name || match.rink?.name || null;

  return (
    <article
      className="rounded-2xl border border-wline-2 bg-white p-4 shadow-card dark:border-rink-700 dark:bg-rink-800"
      aria-label={MESSAGES.team.matchAriaLabel(
        opponent?.name ?? MESSAGES.team.opponentTbdLong,
      )}
    >
      {/* 날짜/상태 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-card-meta text-wtext-3 dark:text-rink-300">
          <Icon name="event" className="text-[14px]" aria-hidden="true" />
          <time dateTime={match.scheduledAt}>
            {date} ({day}) {time}
          </time>
        </div>
        <span
          className={cn(
            "rounded-w-pill px-2 py-0.5 text-card-meta font-bold",
            statusBadge.className,
          )}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* 대진 + 스코어 */}
      <div className="flex items-center justify-between gap-3">
        {/* 우리 팀 */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ice-500/10 text-ice-500"
            aria-hidden="true"
          >
            <Icon name="sports_hockey" className="text-[20px]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-card-meta font-bold text-wtext-1 dark:text-white">
              {myTeam?.name ?? MESSAGES.team.ourTeamFallback}
            </p>
            <p className="text-card-meta font-medium text-ice-500">
              {isHome ? MESSAGES.team.locationHome : MESSAGES.team.locationAway}
            </p>
          </div>
        </div>

        {/* 스코어 */}
        <div className="flex shrink-0 items-center gap-2">
          {isFinished ? (
            <>
              <span
                className={cn(
                  "text-2xl font-extrabold tabular-nums",
                  isWin
                    ? "text-emerald-600 dark:text-emerald-400"
                    : isDraw
                      ? "text-wtext-3"
                      : "text-wtext-3",
                )}
              >
                {myScore}
              </span>
              <span className="text-card-body font-bold text-wtext-4">:</span>
              <span
                className={cn(
                  "text-2xl font-extrabold tabular-nums",
                  !isWin && !isDraw && isFinished
                    ? "text-wtext-2 dark:text-rink-100"
                    : "text-wtext-3",
                )}
              >
                {oppScore}
              </span>
            </>
          ) : (
            <span className="text-card-meta font-bold text-wtext-4">
              {MESSAGES.team.vsLabel}
            </span>
          )}
        </div>

        {/* 상대 팀 */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          <div className="min-w-0">
            <p className="truncate text-card-meta font-bold text-wtext-1 dark:text-white">
              {opponent?.name ?? MESSAGES.team.opponentTbd}
            </p>
            <p className="text-card-meta font-medium text-wtext-3">
              {isHome ? MESSAGES.team.locationAway : MESSAGES.team.locationHome}
            </p>
          </div>
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300"
            aria-hidden="true"
          >
            <Icon name="sports_hockey" className="text-[20px]" />
          </div>
        </div>
      </div>

      {/* 장소 + 대회 */}
      {(location || match.tournament) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-wline-2 pt-3 text-card-meta text-wtext-3 dark:border-rink-700 dark:text-rink-300">
          {location && (
            <div className="flex items-center gap-1">
              <Icon
                name="location_on"
                className="text-[13px]"
                aria-hidden="true"
              />
              <span className="truncate">{location}</span>
            </div>
          )}
          {match.tournament && (
            <div className="flex items-center gap-1">
              <Icon
                name="emoji_events"
                className="text-[13px]"
                aria-hidden="true"
              />
              <span className="truncate">{match.tournament.name}</span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Sub: Add Roster Modal ────────────────
function AddRosterModal({
  teamId,
  currentRoster,
  onClose,
  onAdded,
}: {
  teamId: string;
  /**
   * [추가 2026-05-18 W2.B #5] 현재 로스터 — 이미 등록된 회원을 후보에서 제외하기 위한 ID 셋 계산.
   *   백엔드(`/teams/:teamId/available-members`)가 1차 필터를 수행하지만, 동시성 race condition
   *   또는 stale 캐시 대비 클라이언트 사이드 2중 가드.
   */
  currentRoster: RosterMember[];
  onClose: () => void;
  onAdded: () => void;
}) {
  // [BUG FIX 2026-05-19 W3 #6] iOS/Android Flutter Native BottomNav 가 모달 z-50 위에 올라와
  //   등록 버튼이 잘려 보이는 회귀 해결. 모달 열린 동안 native BottomNav 숨김 + unmount 시 자동 복원.
  //   동일 패턴: BulkActionBar (components/shared/BulkActionBar.tsx) 가 같은 방식으로 BottomNav 회피.
  useNativeUI({
    showBottomNav: false,
    restoreOnUnmount: true,
  });

  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<AvailableMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // [수정 2026-05-18 W2.B #6] 단일 선택 — string | null 그대로 유지 (state key 충돌 없음).
  //   회귀: 기존엔 정상이었으나 candidate list 가 server 측에서 중복 ID 가 들어올 경우
  //   같은 ID 의 두 row 가 동시에 selected=true 로 렌더될 수 있음 → dedupe 로 차단.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [position, setPosition] = useState<RosterPosition | "">("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 현재 로스터 회원 ID 셋 (member.id 기준)
  const rosterMemberIds = useMemo(
    () => new Set(currentRoster.map((r) => r.member?.id).filter(Boolean) as string[]),
    [currentRoster],
  );

  // 후보 조회 (검색 디바운스 400ms)
  //   [수정 2026-05-18 W2.B #5/#6] 응답을 (1) 이미 로스터인 회원 제외 (2) 중복 ID dedupe 로 후처리.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      const res = await getAvailableMembers(teamId, search.trim() || undefined);
      if (cancelled) return;
      if (res.success && res.data) {
        // dedupe by id + 이미 로스터 회원 제외 (defensive)
        const seen = new Set<string>();
        const filtered = res.data.members.filter((m) => {
          if (!m.id) return false;
          if (seen.has(m.id)) return false;
          if (rosterMemberIds.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        setCandidates(filtered);
      } else {
        setCandidates([]);
      }
      setIsLoading(false);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [teamId, search, rosterMemberIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      toast.error(MESSAGES.team.rosterSelectPlayerRequired);
      return;
    }
    setSubmitting(true);
    const res = await addRosterMember(teamId, {
      memberId: selectedId,
      position: position || undefined,
      jerseyNumber: jerseyNumber ? parseInt(jerseyNumber, 10) : undefined,
    });
    setSubmitting(false);
    if (res.success) {
      onAdded();
    } else {
      toast.error(res.error?.message || MESSAGES.error.general);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-rink-900/60 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-roster-title"
    >
      {/* [hotfix 2026-05-15 T06-F] iPhone home indicator + Android navigation
          gesture bar 영역까지 모달 높이가 침범하지 않도록 safe-area 보강.
          기존 max-h-[85vh] 만으로는 iPhone 14 (852px) 의 home indicator 와
          겹쳐 등록 버튼이 가려져 "선수 추가 시 등록 버튼 미표시" 회귀 발생.
          · 컨테이너 max-h 에서 safe-area-inset-bottom 차감
          · submit 영역 padding-bottom 에 safe-area-inset-bottom 더하기

          [수정 2026-05-18 W2.B #7] 모달 높이 cap 추가 — 작은 폰에서 콘텐츠가 늘어나
          등록 버튼이 잘리는 회귀 차단.
            기존: 85vh 단일 cap → iPhone SE(667px) 등 small viewport 에서 후보 리스트가
                  화면 전체를 채울 때 sticky footer 가 밀려 등록 버튼 일부가 절단.
            변경: max-h = min(720px, calc(100vh - 80px)) 로 절대치 720px 와 viewport 기반
                  하한 동시 만족 → 모든 단말에서 등록 버튼이 항상 노출되도록 보장. */}
      <div
        className="flex w-full max-w-md flex-col rounded-t-2xl bg-white dark:bg-rink-800 sm:rounded-2xl"
        style={{
          maxHeight:
            'min(720px, calc(100vh - 80px - var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))))',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-wline-2 px-5 py-4 dark:border-rink-700">
          <h3
            id="add-roster-title"
            className="text-card-emphasis font-bold text-wtext-1 dark:text-white"
          >
            {MESSAGES.team.addMemberTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-w-pill p-1.5 text-wtext-3 hover:bg-wline-2 dark:hover:bg-rink-700"
            aria-label={MESSAGES.common.close}
          >
            <Icon name="close" className="text-[22px]" aria-hidden="true" />
          </button>
        </div>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
        >
          {/* Search */}
          <div className="border-b border-wline-2 px-5 py-3 dark:border-rink-700">
            <label className="relative block">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-wtext-3"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={MESSAGES.team.memberSearchPlaceholder}
                className="h-10 w-full rounded-lg bg-wline-2 pl-9 pr-3 text-card-body text-wtext-1 placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/40 dark:bg-rink-700 dark:text-white"
              />
            </label>
          </div>

          {/* Candidates List */}
          <div className="hide-scrollbar flex-1 overflow-y-auto px-3 py-2">
            {isLoading ? null : candidates.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Icon
                  name="group_off"
                  className="mx-auto text-3xl text-wtext-4 dark:text-rink-500"
                  aria-hidden="true"
                />
                <p className="mt-2 text-card-body font-semibold text-wtext-2 dark:text-rink-100">
                  {MESSAGES.team.availableEmpty}
                </p>
                <p className="mt-1 text-card-meta text-wtext-3">
                  {MESSAGES.team.availableHint}
                </p>
              </div>
            ) : (
              <ul role="listbox" aria-label={MESSAGES.team.ariaCandidateList}>
                {candidates.map((m) => {
                  const selected = selectedId === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => setSelectedId(m.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
                          selected
                            ? "bg-ice-500/5 dark:bg-ice-500/10"
                            : "hover:bg-wbg dark:hover:bg-rink-700/50",
                        )}
                      >
                        <div
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-w-pill font-bold",
                            selected
                              ? "bg-ice-500 text-white"
                              : "bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-100",
                          )}
                          aria-hidden="true"
                        >
                          <Icon name="person" className="text-[20px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-card-body font-bold text-wtext-1 dark:text-white">
                            {m.playerName}
                          </p>
                          <p className="truncate text-card-meta text-wtext-3 dark:text-rink-300">
                            {m.playerAge}세
                            {m.playerLevel && ` · ${m.playerLevel}`}
                          </p>
                        </div>
                        {selected && (
                          <Icon
                            name="check_circle"
                            className="shrink-0 text-[20px] text-ice-500"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Form Fields */}
          {selectedId && (
            <div className="border-t border-wline-2 px-5 py-3 dark:border-rink-700">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                    {MESSAGES.team.rosterFieldPosition}
                  </label>
                  <select
                    value={position}
                    onChange={(e) =>
                      setPosition(e.target.value as RosterPosition | "")
                    }
                    className="h-10 w-full rounded-lg border border-wline bg-white px-3 text-card-body text-wtext-1 focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-700 dark:text-white"
                  >
                    <option value="">{MESSAGES.team.rosterPositionNone}</option>
                    <option value="goalie">
                      {MESSAGES.team.positionGoalie}
                    </option>
                    <option value="defense">
                      {MESSAGES.team.positionDefense}
                    </option>
                    <option value="forward">
                      {MESSAGES.team.positionForward}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                    {MESSAGES.team.rosterFieldJersey}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder={MESSAGES.team.rosterJerseyPlaceholder}
                    className="h-10 w-full rounded-lg border border-wline bg-white px-3 text-card-body tabular-nums text-wtext-1 focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-700 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit
              [hotfix 2026-05-15 T06-F] iPhone home indicator 영역 회피
              padding-bottom 에 safe-area-inset-bottom 추가 — 등록 버튼 가려짐 차단.

              [수정 2026-05-18 W2.B #7] sticky bottom-0 + bg-white 강조 — 후보 리스트가
              많아도 footer 가 항상 화면 하단에 고정되어 등록 버튼이 절대 잘리지 않음. */}
          <div
            className="sticky bottom-0 border-t border-wline-2 bg-white px-5 pt-4 dark:border-rink-700 dark:bg-rink-800"
            style={{
              paddingBottom:
                'calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
            }}
          >
            <button
              type="submit"
              disabled={!selectedId || submitting}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-ice-500 text-card-body font-bold text-white hover:bg-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 disabled:opacity-50"
            >
              {submitting ? MESSAGES.team.rosterSubmitting : MESSAGES.team.rosterSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sub: Edit Roster Modal ────────────────────
/**
 * 로스터 인라인 수정 모달.
 *
 * 기존 값으로 폼을 초기화하고, 포지션·등번호·주장·부주장을
 * 각각 편집할 수 있다. 주장/부주장은 라디오 그룹처럼 동작하여
 * 동시에 둘 다 true 가 될 수 없다 (서버에서 보장하지만 UX 강제).
 */
function EditRosterModal({
  roster,
  onClose,
  onSave,
}: {
  roster: RosterMember;
  onClose: () => void;
  onSave: (rosterId: string, payload: UpdateRosterPayload) => Promise<void>;
}) {
  const [position, setPosition] = useState<RosterPosition | "">(
    roster.position ?? "",
  );
  const [jerseyNumber, setJerseyNumber] = useState<string>(
    roster.jerseyNumber != null ? String(roster.jerseyNumber) : "",
  );
  const [captainRole, setCaptainRole] = useState<"none" | "captain" | "alt">(
    roster.isCaptain ? "captain" : roster.isAltCaptain ? "alt" : "none",
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // 변경점만 payload 에 담아 전송 (API 는 undefined 필드는 무시)
    const payload: UpdateRosterPayload = {};

    const nextPosition = position || undefined;
    if (nextPosition !== (roster.position ?? undefined)) {
      payload.position = nextPosition;
    }

    const nextJersey =
      jerseyNumber === "" ? undefined : parseInt(jerseyNumber, 10);
    if (nextJersey !== (roster.jerseyNumber ?? undefined)) {
      payload.jerseyNumber = nextJersey;
    }

    const nextCaptain = captainRole === "captain";
    const nextAlt = captainRole === "alt";
    if (nextCaptain !== roster.isCaptain) payload.isCaptain = nextCaptain;
    if (nextAlt !== roster.isAltCaptain) payload.isAltCaptain = nextAlt;

    // 변경점이 전혀 없으면 조용히 닫기
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await onSave(roster.id, payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-rink-900/60 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-roster-title"
    >
      <div className="flex w-full max-w-md flex-col rounded-t-2xl bg-white dark:bg-rink-800 sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-wline-2 px-5 py-4 dark:border-rink-700">
          <div className="min-w-0">
            <h3
              id="edit-roster-title"
              className="truncate text-card-emphasis font-bold text-wtext-1 dark:text-white"
            >
              {MESSAGES.team.rosterEditTitle}
            </h3>
            <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300">
              {roster.member.playerName} · {MESSAGES.team.rosterEditDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 shrink-0 rounded-w-pill p-1.5 text-wtext-3 hover:bg-wline-2 dark:hover:bg-rink-700"
            aria-label={MESSAGES.common.close}
          >
            <Icon name="close" className="text-[22px]" aria-hidden="true" />
          </button>
        </div>

        {/* [hotfix 2026-05-15 T06-F] Edit 모달도 safe-area 보강.
            form 의 padding-bottom 에 safe-area-inset-bottom 추가. */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 px-5 pt-4"
          style={{
            paddingBottom:
              'calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          }}
        >
          {/* Position */}
          <div>
            <label className="mb-2 block text-card-meta font-bold text-wtext-2 dark:text-rink-100">
              {MESSAGES.team.rosterFieldPosition}
            </label>
            <div
              className="grid grid-cols-4 gap-2"
              role="radiogroup"
              aria-label={MESSAGES.team.rosterFieldPosition}
            >
              {[
                { key: "" as const, label: MESSAGES.team.rosterPositionNone },
                { key: "goalie" as const, label: MESSAGES.team.positionGoalie },
                {
                  key: "defense" as const,
                  label: MESSAGES.team.positionDefense,
                },
                {
                  key: "forward" as const,
                  label: MESSAGES.team.positionForward,
                },
              ].map((opt) => {
                const active = position === opt.key;
                return (
                  <button
                    key={opt.key || "none"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPosition(opt.key)}
                    className={cn(
                      "flex h-10 items-center justify-center rounded-lg text-card-meta font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/30",
                      active
                        ? "bg-ice-500 text-white"
                        : "border border-wline bg-white text-wtext-2 hover:border-ice-500/30 hover:bg-ice-500/5 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Jersey Number */}
          <div>
            <label
              htmlFor="edit-jersey-number"
              className="mb-2 block text-card-meta font-bold text-wtext-2 dark:text-rink-100"
            >
              {MESSAGES.team.rosterFieldJersey}{" "}
              <span className="text-card-meta font-medium text-wtext-3">
                (1-99)
              </span>
            </label>
            <input
              id="edit-jersey-number"
              type="number"
              min={1}
              max={99}
              value={jerseyNumber}
              onChange={(e) => setJerseyNumber(e.target.value)}
              placeholder={MESSAGES.team.jerseyUnassigned}
              className="h-11 w-full rounded-xl border border-wline bg-white px-4 text-card-body tabular-nums text-wtext-1 placeholder:text-wtext-3 focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-700 dark:text-white"
            />
          </div>

          {/* Captain Role */}
          <div>
            <label className="mb-2 block text-card-meta font-bold text-wtext-2 dark:text-rink-100">
              {MESSAGES.team.rosterFieldCaptain}
            </label>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label={MESSAGES.team.rosterFieldCaptain}
            >
              {[
                {
                  key: "none" as const,
                  label: MESSAGES.team.rosterCaptainNone,
                  icon: "person",
                },
                {
                  key: "captain" as const,
                  label: MESSAGES.team.rosterCaptainMain,
                  icon: "star",
                },
                {
                  key: "alt" as const,
                  label: MESSAGES.team.rosterCaptainAlt,
                  icon: "star_half",
                },
              ].map((opt) => {
                const active = captainRole === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCaptainRole(opt.key)}
                    className={cn(
                      "flex h-11 items-center justify-center gap-1 rounded-lg text-card-meta font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/30",
                      active
                        ? "bg-ice-500 text-white"
                        : "border border-wline bg-white text-wtext-2 hover:border-ice-500/30 hover:bg-ice-500/5 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700",
                    )}
                  >
                    <Icon
                      name={opt.icon}
                      className="text-[14px]"
                      aria-hidden="true"
                    />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-wline-2 text-card-body font-bold text-wtext-2 hover:bg-wline disabled:opacity-50 dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500"
            >
              {MESSAGES.team.rosterCancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-ice-500 text-card-body font-bold text-white hover:bg-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Icon
                    name="progress_activity"
                    className="animate-spin text-[18px] motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  {MESSAGES.team.rosterSavingEdit}
                </>
              ) : (
                <>
                  <Icon
                    name="save"
                    className="text-[18px]"
                    aria-hidden="true"
                  />
                  {MESSAGES.team.rosterSubmitEdit}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
