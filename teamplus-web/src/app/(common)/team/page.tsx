"use client";

/**
 * /team — 역할별 3분기
 *
 *  - 감독·코치(관리 팀 1개): 내 팀 홈(MyTeamHome). 팀 1개 원칙에서 목록은 카드 1장뿐이라
 *    목록 대신 팀 운영 허브를 그린다. 승인 대기 코치는 안내 화면.
 *  - ADMIN(팀 다건): 관리 팀 카드 목록 → /team/[id].
 *  - 학부모: 우리 아이 팀 카드 목록 → /team/[id].
 *
 * TEAMPLUS 디자인 7원칙 준수:
 *  ① 화면 분석 → 사용자 제공 HTML "팀 목록" 레퍼런스 기반
 *  ② 휴먼 디자인 → 카드 리스트 + 필터 칩, 과장 금지
 *  ③ AI 스타일 금지 → gradient / backdrop-blur / shadow-color/30 0건
 *  ④ 페르소나 융합 → frontend + architect + a11y
 *  ⑤ 명령어 필수 → 역할별 CRUD 분기 명령 중심
 *  ⑥ 원칙 표기 → 본 주석 + 하단 design-notes
 *  ⑦ 한글 존댓말 + MESSAGES 상수
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { SubmainAppBar } from "@/components/layout/SubmainAppBar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  MyTeamHome,
  TeamListCard,
  TeamSearchBar,
  formatNextEventDate,
  formatNextEventTime,
} from "@/components/team";
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/image-url";
import { MESSAGES } from "@/lib/messages";
import { useRefreshSubscription, REFRESH_KEYS } from "@/lib/refresh-bus";
import { isTeamManager } from "@/lib/team-roles";
import {
  listManagedTeams,
  listParentVisibleTeams,
  listPublicTeams,
  type MyChildInTeam,
  type ParentChildTeamItem,
  type TeamListItem,
} from "@/services/team.service";

// ─── 권한 유틸 ───────────────────────────────────────────
function useCanManageTeams() {
  const { user } = useSessionAuth();
  return isTeamManager(user);
}

function useIsParent() {
  const { user } = useSessionAuth();
  return user?.userType === "parent";
}

function useIsAdmin() {
  const { user } = useSessionAuth();
  return user?.userType === "admin";
}

// ─── 클라이언트 필터 로직 (공통) ──────────────────────
/**
 * 제네릭으로 구현하여 TeamListItem 또는 그 확장 타입(ParentChildTeamItem)을
 * 타입 보존한 채 필터링한다. `as unknown as` 같은 강제 캐스팅이 필요 없다.
 */
function applyClientFilter<T extends TeamListItem>(
  source: readonly T[],
  searchQuery: string,
): T[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return [...source];
  return source.filter(
    (t) =>
      (t.name ?? "").toLowerCase().includes(q) ||
      (t.shortName?.toLowerCase().includes(q) ?? false),
  );
}

// ─── Main Page ───────────────────────────────────────────
export default function TeamListPage() {
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const canManage = useCanManageTeams();
  const isParent = useIsParent();
  const isAdmin = useIsAdmin();
  const { user } = useSessionAuth();

  const [teams, setTeams] = useState<TeamListItem[]>([]);
  // 학부모 전용 뷰 상태
  const [myChildTeams, setMyChildTeams] = useState<ParentChildTeamItem[]>([]);
  const [totalChildren, setTotalChildren] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // 내 팀 홈은 상세·멤버 집계를 추가로 fetch 하므로, 홈이 준비됐다고 알릴 때까지 로더 유지.
  const [homeReady, setHomeReady] = useState(false);

  // 감독·코치가 관리 팀 1개를 가진 경우 → 목록 대신 내 팀 홈. ADMIN 은 전체 팀 다건이라 목록 유지.
  const isManagerView = canManage && !isParent;
  const soloTeam = isManagerView && !isAdmin && teams.length === 1 ? teams[0] : null;
  const isPendingSolo = soloTeam?.myApprovalStatus === 'pending';
  const showHome = !!soloTeam && !isPendingSolo;

  const isReady = !isLoading && (!showHome || homeReady);

  // 풀스크린 로더 fast-path (v11) — 목록 fetch + (홈이면) 홈 데이터까지 끝난 뒤 OFF
  usePageReady(isReady);

  // Native (Flutter WebView) UI 상태 복원 — isDataLoaded 시그널로 status bar 즉시 복원.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false, // SubmainAppBar (web DOM 헤더) 사용
    showBottomNav: true,
    isDataLoaded: isReady,
  });

  const handleHomeLoaded = useCallback(() => setHomeReady(true), []);

  // ─── 데이터 로딩 ───────────────────────────────────
  const fetchTeams = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 학부모: 학부모 특화 뷰 / 관리자: 관리 팀 / 그 외: 공개 팀 목록
      if (isParent) {
        const res = await listParentVisibleTeams();
        if (res.success && res.data) {
          setMyChildTeams(res.data.myChildTeams);
          setTotalChildren(res.data.totalChildren);
        } else {
          setMyChildTeams([]);
          setTotalChildren(0);
          if (res.error) {
            setError(res.error.message || MESSAGES.team.loadError);
          }
        }
      } else if (canManage) {
        // ADMIN/DIRECTOR/COACH 는 본인의 관리/소속 팀만 표시.
        //  - includePending: true → 코치 가입 직후 'pending' 상태 팀도 함께 노출(승인 대기 안내).
        //  - ADMIN 은 백엔드 getManageableTeams 의 ADMIN 분기에서 모든 active 팀을 반환.
        const managedRes = await listManagedTeams({ includePending: true });
        if (managedRes.success && managedRes.data) {
          setTeams(managedRes.data);
        } else {
          setTeams([]);
          if (managedRes.error) {
            setError(managedRes.error.message || MESSAGES.team.loadError);
          }
        }
      } else {
        const res = await listPublicTeams({ limit: 100 });
        if (res.success && res.data) {
          setTeams(res.data);
        } else {
          setTeams([]);
          if (res.error) {
            setError(res.error.message || MESSAGES.team.loadError);
          }
        }
      }
    } catch {
      setError(MESSAGES.error.network);
      setTeams([]);
      setMyChildTeams([]);
    } finally {
      setIsLoading(false);
    }
  }, [canManage, isParent]);

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  // 팀 정보 변경 후 목록 자동 갱신 — team/[id]/edit 의 emitRefresh(REFRESH_KEYS.TEAM).
  useRefreshSubscription(REFRESH_KEYS.TEAM, () => {
    void fetchTeams();
  });

  // ─── 클라이언트 필터 ───────────────────────────────
  const filteredTeams = useMemo(
    () => applyClientFilter(teams, searchQuery),
    [teams, searchQuery],
  );

  const filteredMyChildTeams = useMemo<ParentChildTeamItem[]>(
    () => applyClientFilter<ParentChildTeamItem>(myChildTeams, searchQuery),
    [myChildTeams, searchQuery],
  );

  // ─── 핸들러 ────────────────────────────────────────
  //  pending 팀 카드 클릭 시 진입 자체 차단 — 백엔드 가드(`assertTeamDetailViewable`)가
  //  pending coach 의 getTeam 을 403 으로 막으므로 카드 단계에서 안내 토스트만 1회 노출.
  const handleCardClick = useCallback(
    (teamId: string, myApprovalStatus?: 'approved' | 'pending' | null) => {
      if (myApprovalStatus === 'pending') {
        toast.info(MESSAGES.team.pendingClickHelperToast);
        return;
      }
      navigate(`/team/${teamId}`);
    },
    [navigate, toast],
  );

  // 가입 신청 처리 — 매니저 전원 /director-approvals 단일 승인 페이지, 그 외 /team/:id fallback.
  const handlePendingClick = useCallback(
    (teamId: string, myApprovalStatus?: 'approved' | 'pending' | null) => {
      if (myApprovalStatus === 'pending') {
        toast.info(MESSAGES.team.pendingClickHelperToast);
        return;
      }
      const role = (user?.userType ?? '').toLowerCase();
      if (
        role === 'director' ||
        role === 'academy_director' ||
        role === 'admin' ||
        role === 'coach'
      ) {
        navigate('/director-approvals');
      } else {
        navigate(`/team/${teamId}`);
      }
    },
    [navigate, user?.userType, toast],
  );

  // ─── Render ────────────────────────────────────────
  const appBarTitle = isParent
    ? MESSAGES.team.titleParent
    : soloTeam
      ? MESSAGES.team.titleHome
      : MESSAGES.team.titleList;

  // 검색바 — 목록이 2건 이상일 때만 (홈·단건이면 검색 불필요)
  const showManagerSearch = isManagerView && !soloTeam && teams.length > 1;
  const showParentSearch = isParent && myChildTeams.length > 1;

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={appBarTitle} />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={appBarTitle}
      >
        {/* ─── 검색바 ─── */}
        {showManagerSearch && (
          <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-4" aria-label={MESSAGES.team.searchPlaceholder}>
            <div className="relative">
              <Icon
                name="search"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-it-ink-300 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={MESSAGES.team.searchPlaceholder}
                aria-label={MESSAGES.team.searchPlaceholder}
                className="w-full h-12 bg-it-fill dark:bg-it-blue-950 border-[1.5px] border-it-line-strong dark:border-it-blue-900 rounded-w-md pl-11 pr-10 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 outline-none focus:outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={MESSAGES.search.clear}
                  className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-w-pill text-it-ink-400 hover:bg-it-line dark:hover:bg-it-blue-900 transition-colors motion-reduce:transition-none"
                >
                  <Icon name="close" className="text-[18px]" aria-hidden="true" />
                </button>
              )}
            </div>
          </section>
        )}
        {showParentSearch && (
          <section
            className="border-b border-it-line bg-it-surface px-5 pb-3 pt-4 dark:border-it-blue-900 dark:bg-it-blue-950"
            aria-label={MESSAGES.team.searchPlaceholder}
          >
            <TeamSearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={MESSAGES.team.searchPlaceholder}
            />
          </section>
        )}

        {/* flat 섹션 사이 8px 회색 갭 (관리자 검색바 ↔ 목록) */}
        {showManagerSearch && (
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        )}

        {/* ─── 본문 ────────────────────────────── */}
        <section
          className={cn(
            // 하단 여백은 MobileContainer 가 main 에 pb-30 자동 부여 → 페이지에서 중복 금지.
            isManagerView ? (showHome ? undefined : 'pt-2') : 'px-4 pt-4',
          )}
          aria-label={appBarTitle}
        >
          {isLoading ? null : error ? (
            <ErrorView message={error} onRetry={fetchTeams} />
          ) : isParent ? (
            // ─── 학부모 전용 뷰 — 우리 아이 팀만 ─────────────────
            totalChildren === 0 ? (
              <EmptyState
                icon="child_care"
                title={MESSAGES.team.parentNoChildren}
                description={MESSAGES.team.parentNoChildrenHint}
              />
            ) : filteredMyChildTeams.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <h3 className="text-card-title font-bold text-it-ink-800 dark:text-white">
                  {searchQuery.trim()
                    ? MESSAGES.team.noSearchResults
                    : MESSAGES.team.noChildTeamsYet}
                </h3>
                <p className="mt-2 text-card-body text-it-ink-500 dark:text-it-ink-400">
                  {searchQuery.trim()
                    ? MESSAGES.team.searchResultHint
                    : MESSAGES.team.noChildTeamsHint}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <SectionHeader
                  icon="favorite"
                  title={MESSAGES.team.myChildTeamsSection}
                  hint={MESSAGES.team.myChildTeamsSectionHint}
                  count={filteredMyChildTeams.length}
                />
                <ul className="flex flex-col gap-3" aria-label={MESSAGES.team.myChildTeamsSection}>
                  {filteredMyChildTeams.map((team) => {
                    const myChildren = Array.isArray(team.myChildren)
                      ? team.myChildren
                      : [];

                    return (
                      <li key={team.id}>
                        <TeamListCard
                          team={team}
                          onClick={() => handleCardClick(team.id)}
                          highlight
                          footerSlot={
                            myChildren.length > 0 ? (
                              <ul
                                className="mt-3 flex flex-wrap gap-2"
                                aria-label={MESSAGES.team.myChildTeamsSectionHint}
                              >
                                {myChildren.map((child) => (
                                  <li key={child.rosterId}>
                                    <ChildChip child={child} />
                                  </li>
                                ))}
                              </ul>
                            ) : null
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : soloTeam && isPendingSolo ? (
            // ─── 승인 대기 코치 — 상세는 백엔드 403 이라 홈 대신 안내 ───
            <EmptyState
              icon="hourglass_top"
              title={MESSAGES.team.homePendingTitle}
              description={MESSAGES.team.homePendingHint}
            />
          ) : soloTeam ? (
            // ─── 감독·코치 내 팀 홈 ───
            <MyTeamHome team={soloTeam} onLoaded={handleHomeLoaded} />
          ) : filteredTeams.length === 0 ? (
            // ─── 관리자/기타 조회자 빈 상태 ───
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <h3 className="text-card-title font-bold text-it-ink-800 dark:text-white">
                {searchQuery.trim()
                  ? MESSAGES.team.noSearchResults
                  : MESSAGES.team.empty}
              </h3>
              <p className="mt-2 text-card-body text-it-ink-500 dark:text-it-ink-400">
                {searchQuery.trim()
                  ? MESSAGES.team.searchResultHint
                  : MESSAGES.team.emptyHint}
              </p>
            </div>
          ) : isManagerView ? (
            // ─── 04c 팀 관리 카드 (ADMIN 다건 · 코치 다팀 예외) ───
            <ul className="flex flex-col gap-2" aria-label={MESSAGES.team.titleList}>
              {filteredTeams.map((team) => (
                <li key={team.id} className="bg-it-surface dark:bg-it-blue-950">
                  <CoachTeamManageCard
                    team={team}
                    onClick={() => handleCardClick(team.id, team.myApprovalStatus)}
                    onPendingClick={() => handlePendingClick(team.id, team.myApprovalStatus)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-3" aria-label={MESSAGES.team.titleList}>
              {filteredTeams.map((team) => (
                <li key={team.id}>
                  <TeamListCard
                    team={team}
                    onClick={() => handleCardClick(team.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* 팀 추가 생성 FAB 없음 — 감독 1인 = 가입 시 1팀 운영(멀티 팀 없음).
          근거: docs/Planning/SPEC_COACH_INVITE_SIGNUP.md(§감독 1인=1팀) ·
                docs/specs/260423_회의_기능재설계_설계서.md(팀 생성=가입 시 1회). */}
    </MobileContainer>
  );
}

// ─── 04c 팀 관리 카드 (ADMIN 다건 목록 전용) ───────────
// 참고 디자인 "04c · 감독 팀 관리 (개선)" 매칭. 솔리드 + alpha hex (gradient 금지).
function CoachTeamManageCard({
  team,
  onClick,
  onPendingClick,
}: {
  team: TeamListItem;
  onClick: () => void;
  /** 가입 신청 처리하기 — 별도 button 으로 분리, 기본 동작은 onClick 과 동일 */
  onPendingClick?: () => void;
}) {
  const teamColor = (team.primaryColor && /^#[0-9a-fA-F]{6}$/.test(team.primaryColor))
    ? team.primaryColor
    : '#2f5fff'; // ice-500 폴백
  const logoSrc = resolveImageSrc(team.logoUrl);
  const memberCount = team._count?.roster ?? 0;
  const pending = team.pendingApplications ?? 0;

  // 다음 일정 — 백엔드 nextEvent 응답을 04c 시각 모델로 변환
  type NextSchedule = { type: string; isMatch: boolean; date: string; time: string; place: string; urgent: boolean };
  const next: NextSchedule | null = team.nextEvent
    ? (() => {
        const isMatch = team.nextEvent.eventType === 'tournament' || team.nextEvent.eventType === 'friendly';
        return {
          type: isMatch ? MESSAGES.team.homeEventMatch : MESSAGES.team.homeEventPractice,
          isMatch,
          date: formatNextEventDate(team.nextEvent.startAt),
          time: formatNextEventTime(team.nextEvent.startAt),
          place: team.nextEvent.location ?? team.nextEvent.title,
          urgent: team.nextEvent.isUrgent,
        };
      })()
    : null;

  return (
    <article className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={MESSAGES.team.detailAriaLabel(team.name ?? '')}
        className="block w-full text-left active:brightness-95"
      >
        {/* 헤더: 로고 + 이름 + 인원 + 상세 이동 표시 */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt=""
              className="w-14 h-14 rounded-2xl object-cover shrink-0 border border-it-line dark:border-it-blue-900"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: teamColor }}
              aria-hidden="true"
            >
              <Icon name="sports_hockey" className="text-[26px]" aria-hidden="true" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 min-w-0">
              <h3 className="text-[16px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em] truncate">
                {team.name ?? MESSAGES.team.titleList}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-card-meta text-it-ink-500 dark:text-it-ink-400 min-w-0">
              <span className="font-bold text-it-ink-700 dark:text-it-ink-400 tabular-nums shrink-0">
                {MESSAGES.team.homeMenuRosterMeta(memberCount)}
              </span>
            </div>
          </div>

          <span
            className="w-8 h-8 inline-flex items-center justify-center text-it-ink-300 dark:text-it-ink-400 shrink-0"
            aria-hidden="true"
          >
            <Icon name="chevron_right" className="text-[20px]" aria-hidden="true" />
          </span>
        </div>

        {/* 다음 일정 인라인 배너 — 예정된 일정이 있을 때만 표시 */}
        {next && (
          <div className="border-t border-it-line dark:border-it-blue-900 px-4 py-3 flex items-center gap-2.5">
            <div
              className={cn(
                'w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0',
                !next.urgent && 'bg-it-fill dark:bg-it-blue-900/40 text-it-ink-700 dark:text-it-ink-400',
              )}
              style={
                next.urgent
                  ? { backgroundColor: teamColor, color: '#ffffff' }
                  : undefined
              }
              aria-hidden="true"
            >
              <Icon name="calendar_today" className="text-[14px]" aria-hidden="true" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-card-meta font-extrabold px-1.5 py-0.5 rounded"
                  style={{
                    color: next.isMatch ? '#ff5a36' : teamColor,
                    backgroundColor: next.isMatch ? '#fee4dc' : `${teamColor}18`,
                  }}
                >
                  {next.type}
                </span>
                <span className="text-card-meta font-bold text-it-ink-800 dark:text-white tabular-nums">
                  {next.date} {next.time}
                </span>
              </div>
              <div className="text-card-meta text-it-ink-500 dark:text-it-ink-400 mt-0.5 truncate">
                {next.place}
              </div>
            </div>

            {next.urgent && (
              <span
                className="px-2 py-1 rounded-md text-card-meta font-extrabold tracking-[0.02em] text-white shrink-0"
                style={{ backgroundColor: teamColor }}
              >
                {MESSAGES.team.homeNextToday}
              </span>
            )}
          </div>
        )}
      </button>

      {/* 가입 신청 footer — pending > 0 이고 본인이 승인된 상태일 때만 */}
      {pending > 0 && team.myApprovalStatus !== 'pending' && (
        <div className="border-t border-it-line dark:border-it-blue-900 px-4 py-3 flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-w-pill bg-flame-100 dark:bg-flame-500/15 text-flame-500 inline-flex items-center justify-center text-card-meta font-extrabold shrink-0"
            aria-hidden="true"
          >
            !
          </span>
          <span className="flex-1 text-card-meta font-semibold text-it-ink-700 dark:text-it-ink-400">
            {MESSAGES.team.homeTodoPending(pending)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onPendingClick) onPendingClick();
              else onClick();
            }}
            aria-label={MESSAGES.team.pendingHandleAria(team.name ?? '')}
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-card-meta font-bold text-it-blue-500 hover:bg-it-blue-500/10 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 transition-colors motion-reduce:transition-none"
          >
            {MESSAGES.team.pendingHandleLabel}
            <Icon name="arrow_forward" className="text-[14px]" aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
}

// ─── Sub Components ──────────────────────────────────────
// 레거시 inline TeamCard / ParentTeamCard 는 `@/components/team/TeamListCard` 로 이관.

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex size-20 items-center justify-center rounded-w-pill bg-flame-100 dark:bg-flame-500/15">
        <Icon
          name="error_outline"
          className="text-[36px] text-flame-500 dark:text-flame-500"
          aria-hidden="true"
        />
      </div>
      <p className="text-card-body font-bold text-it-ink-800 dark:text-white">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-w-md border border-it-blue-500 bg-it-surface px-4 py-2 text-card-body font-bold text-it-blue-500 transition-colors duration-200 ease-wallet motion-reduce:transition-none hover:bg-it-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 dark:bg-it-blue-950 dark:hover:bg-it-blue-500/15"
      >
        {MESSAGES.dashboard.errorRetry}
      </button>
    </div>
  );
}

// ─── 학부모 전용 섹션 헤더 ────────────────────────────
function SectionHeader({
  icon,
  title,
  hint,
  count,
}: {
  icon: string;
  title: string;
  hint?: string;
  count: number;
}) {
  return (
    <header className="flex items-start gap-3 px-1">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-w-md bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15"
        aria-hidden="true"
      >
        <Icon name={icon} className="text-[22px]" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {/* [ICETIMES 시안] 섹션 제목 17/800 + 카운트 plain 15/800 it-blue-500 */}
          <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
            {title}
          </h2>
          <span
            className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500 dark:text-it-blue-300"
            aria-label={MESSAGES.team.teamCountLabel(count)}
          >
            {count}
          </span>
        </div>
        {hint && (
          <p className="mt-0.5 text-card-meta text-it-ink-500 dark:text-it-ink-400">
            {hint}
          </p>
        )}
      </div>
    </header>
  );
}

// ─── 학부모 "우리 아이 팀" 카드 ───────────────────────
// ParentTeamCard 는 TeamListCard(highlight=true) + footerSlot 으로 대체.
// ChildChip 은 footerSlot 내부에서만 사용되므로 이 파일에 남겨둔다.

function ChildChip({ child }: { child: MyChildInTeam }) {
  const name = child.playerName ?? MESSAGES.team.defaultChildName;
  const jersey =
    child.jerseyNumber != null
      ? MESSAGES.team.jerseyLabel(child.jerseyNumber)
      : MESSAGES.team.jerseyUnassigned;
  const position = child.position
    ? child.position === "goalie"
      ? MESSAGES.team.positionGoalie
      : child.position === "defense"
        ? MESSAGES.team.positionDefense
        : MESSAGES.team.positionForward
    : null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-w-pill border border-it-blue-500/30 bg-it-blue-50 px-3 py-1 text-card-meta font-bold text-it-blue-500 dark:border-it-blue-500/40 dark:bg-it-blue-500/15 dark:text-it-blue-500"
      aria-label={`${name}, ${jersey}${position ? `, ${position}` : ""}`}
    >
      <Icon name="face" className="text-[14px]" aria-hidden="true" />
      <span className="font-bold">{name}</span>
      <span className="text-it-ink-500 dark:text-it-ink-400">·</span>
      <span className="font-num tabular-nums">{jersey}</span>
      {position && (
        <>
          <span className="text-it-ink-500 dark:text-it-ink-400">·</span>
          <span>{position}</span>
        </>
      )}
      {child.isCaptain && (
        <span className="ml-1 rounded-w-pill bg-sun-500 px-1.5 py-0.5 text-card-meta font-extrabold text-it-blue-950">
          C
        </span>
      )}
      {child.isAltCaptain && !child.isCaptain && (
        <span className="ml-1 rounded-w-pill bg-sun-100 px-1.5 py-0.5 text-card-meta font-extrabold text-sun-500">
          A
        </span>
      )}
    </span>
  );
}
