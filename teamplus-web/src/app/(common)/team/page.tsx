"use client";

/**
 * /team — 팀 목록 (관리 + 조회 겸용)
 *
 * TEAMPLUS 디자인 7원칙 준수:
 *  ① 화면 분석 → 사용자 제공 HTML "팀 목록" 레퍼런스 기반
 *  ② 휴먼 디자인 → 카드 리스트 + 필터 칩, 과장 금지
 *  ③ AI 스타일 금지 → gradient / backdrop-blur / shadow-color/30 0건
 *  ④ 페르소나 융합 → frontend + architect + a11y
 *  ⑤ 명령어 필수 → 역할별 CRUD 분기 명령 중심
 *  ⑥ 원칙 표기 → 본 주석 + 하단 design-notes
 *  ⑦ 한글 존댓말 + MESSAGES 상수
 *
 * 권한 분기:
 *  - ADMIN/DIRECTOR/COACH: FAB(등록하기) + 카드 진입 시 관리 메뉴 노출
 *  - PARENT/TEEN/CHILD: 조회 전용
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { SubmainAppBar } from "@/components/layout/SubmainAppBar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
// 2026-04-12 재디자인 공통 컴포넌트 (학부모/일반 조회 뷰용)
import { TeamListCard, TeamSearchBar } from "@/components/team";
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
import { teamGroupService, type TeamGroupSummary } from "@/services/team-group.service";

// ─── 필터 정의 ───────────────────────────────────────────
// [수정 2026-05-18 W2.B #1] 팀 카테고리 vs 하위그룹 카테고리 혼재 해소.
//   기존: 팀 카테고리 칩에 U8/U9 등 하위그룹 카테고리가 표시되어 선택 시 리스트 비어짐.
//   변경: 팀 카테고리는 '전체' 단일 (또는 부문 단일 필터)로 변경.
//          하위그룹 U8/U9 는 팀 상세 화면(/team/[id]/groups) 내에서만 표시.
// ─── 권한 유틸 ───────────────────────────────────────────
function useCanManageTeams() {
  const { user } = useSessionAuth();
  return isTeamManager(user);
}

function useIsParent() {
  const { user } = useSessionAuth();
  return user?.userType === "parent";
}

// 로고 폴백 컬러 및 `resolveLogoColor` 는 `TeamListCard` 로 이관 (2026-04-12).

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
  // [BUG FIX 2026-05-19 W3 #5] 가입 신청 처리 라우팅 분기를 위해 user 가져옴 — 역할별 분기.
  const { user } = useSessionAuth();

  const [teams, setTeams] = useState<TeamListItem[]>([]);
  // 학부모 전용 뷰 상태
  const [myChildTeams, setMyChildTeams] = useState<ParentChildTeamItem[]>([]);
  const [clubTeams, setClubTeams] = useState<TeamListItem[]>([]);
  const [totalChildren, setTotalChildren] = useState(0);

  const [isLoading, setIsLoading] = useState(true);


  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF

  usePageReady(!isLoading);

  // [2026-05-09] Native (Flutter WebView) UI 상태 복원.
  //   탭 전환 시 LoadingContext 가 ui.enterFullscreen() 으로 status bar 를 숨겼지만,
  //   이 페이지가 useNativeUI 호출이 없으면 exitFullscreen 이 트리거되지 않아
  //   iOS 시뮬레이터에서 status bar 가 ~2-3초 후에야 노출되는 현상 발생.
  //   isDataLoaded 를 fetch 완료 신호로 전달 → useNativeUI 가 적시에 ui.stopLoading()
  //   + exitFullscreen 을 호출하여 status bar 즉시 복원.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false, // SubmainAppBar (web DOM 헤더) 사용
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
          setClubTeams(res.data.clubTeams);
          setTotalChildren(res.data.totalChildren);
        } else {
          setMyChildTeams([]);
          setClubTeams([]);
          setTotalChildren(0);
          if (res.error) {
            setError(res.error.message || MESSAGES.team.loadError);
          }
        }
      } else if (canManage) {
        // [수정 2026-05-21] ADMIN/DIRECTOR/COACH 는 본인의 관리/소속 팀만 표시.
        //  - includePending: true → 코치 가입 직후 'pending' 상태 팀도 함께 노출
        //    (감독 승인 대기 안내).
        //  - listPublicTeams 폴백 제거 → 가입 신청도 하지 않은 팀이 노출되어
        //    "내가 어느 팀에 가입했는지" 가 흐려지는 문제 해결 (사용자 요청 2026-05-21).
        //  - ADMIN 은 백엔드 getManageableTeams 의 ADMIN 분기에서 모든 active 팀을 반환하므로
        //    이 변경의 영향을 받지 않음.
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
      setClubTeams([]);
    } finally {
      setIsLoading(false);
    }
  }, [canManage, isParent]);

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  // [추가 2026-05-23 hotfix] 팀 정보 변경 후 목록 자동 갱신.
  //   team/[id]/edit 의 emitRefresh(REFRESH_KEYS.TEAM) 발화 시 본 목록 페이지가 자동 재 fetch.
  //   기존: list → detail → edit → save 후 list 로 돌아왔을 때 stale 이름·로고 노출.
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

  const filteredClubTeams = useMemo(
    () => applyClientFilter<TeamListItem>(clubTeams, searchQuery),
    [clubTeams, searchQuery],
  );

  const hasAnyParentResult =
    filteredMyChildTeams.length > 0 || filteredClubTeams.length > 0;

  // ─── 핸들러 ────────────────────────────────────────
  //  [수정 2026-05-21 v2] pending 팀 카드 클릭 시 진입 자체 차단 (옵션 B).
  //   백엔드 권한 가드(`assertTeamDetailViewable`)가 pending coach 의 getTeam 호출을
  //   403 으로 차단하므로 진입해도 즉시 redirect 됨 → 어차피 의미 없음.
  //   카드 단계에서 차단하면 토스트 중복(handleCardClick + loadTeam 403 + StrictMode 재실행)
  //   문제 해소. 안내 토스트만 1회 노출.
  const handleCardClick = useCallback(
    (teamId: string, myApprovalStatus?: 'approved' | 'pending' | null) => {
      if (myApprovalStatus === 'pending') {
        toast.info(MESSAGES.team.pendingClickHelperToast);
        return; // navigate 차단 — 백엔드 가드와 중복되는 진입 시도 방지
      }
      navigate(`/team/${teamId}`);
    },
    [navigate, toast],
  );

  // [BUG FIX 2026-05-19 W3 #5] 가입 신청 처리 페이지로 라우팅 (팀 상세가 아닌 승인 페이지).
  //   기존: handleCardClick → /team/:id (팀 상세로 이동, 가입 신청 처리 UI 없음).
  //   [2026-06-23 통합] 매니저(director/academy_director/admin/coach) 전원 → /director-approvals
  //     단일 승인 페이지. 코치 전용 /approval 분기 제거(전 계층 COACH 권한 보강으로 C1 해소).
  //     기타 역할 → /team/:id fallback (가입 신청 처리 권한 없음).
  //   [수정 2026-05-21 v3] pending coach 차단 — 본인 멤버십이 승인되지 않은 상태에서
  //   다른 가입 신청을 처리할 권한이 없으므로 안내 토스트만 노출하고 navigate 차단.
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
    : MESSAGES.team.titleList;

  // 카테고리별 카운트 (코치/관리자 뷰 04c 칩 배지용)
  //  [수정 2026-05-18 W2.B #1] 팀 카테고리는 '전체' 단일 — U8/U9 등 하위그룹 카테고리는
  //  팀 상세 (/team/[id]) 내부에서만 표시되므로 여기서는 전체 count 만 노출.
  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={appBarTitle} />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={appBarTitle}
      >
        {/* ─── 검색바 ─── 팀이 2개 이상일 때만 노출 (1개면 검색 불필요). 부문 필터 칩은 제거됨. ─── */}
        {canManage && !isParent
          ? teams.length > 1 && (
              <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-4" aria-label="팀 검색">
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
                    placeholder="팀 이름으로 검색"
                    aria-label="팀 이름으로 검색"
                    className="w-full h-12 bg-it-fill dark:bg-it-blue-950 border-[1.5px] border-it-line-strong dark:border-it-blue-900 rounded-w-md pl-11 pr-10 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="검색어 지우기"
                      className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-w-pill text-it-ink-400 hover:bg-it-line dark:hover:bg-it-blue-900 transition-colors motion-reduce:transition-none"
                    >
                      <Icon name="close" className="text-[18px]" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </section>
            )
          : myChildTeams.length + clubTeams.length > 1 && (
              <section
                className="border-b border-it-line bg-it-surface px-5 pb-3 pt-4 dark:border-it-blue-900 dark:bg-it-blue-950"
                aria-label="팀 검색"
              >
                <TeamSearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={MESSAGES.team.searchPlaceholder}
                />
              </section>
            )}

        {/* flat 섹션 사이 8px 회색 갭 (관리자 검색바 ↔ 목록) */}
        {canManage && !isParent && teams.length > 1 && (
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        )}

        {/* ─── 본문 ────────────────────────────── */}
        <section
          className={cn(
            canManage && !isParent
              ? 'bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-30'
              : 'px-4 pb-30 pt-4',
          )}
          aria-label="팀 목록"
        >
          {isLoading ? null : error ? (
            <ErrorView message={error} onRetry={fetchTeams} />
          ) : isParent ? (
            // ─── 학부모 전용 뷰 ─────────────────
            totalChildren === 0 ? (
              <EmptyState
                icon="child_care"
                title={MESSAGES.team.parentNoChildren}
                description={MESSAGES.team.parentNoChildrenHint}
              />
            ) : !hasAnyParentResult ? (
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
              <div className="flex flex-col gap-8">
                {/* 우리 아이 팀 섹션 */}
                <div className="flex flex-col gap-3">
                  <SectionHeader
                    icon="favorite"
                    title={MESSAGES.team.myChildTeamsSection}
                    hint={MESSAGES.team.myChildTeamsSectionHint}
                    count={filteredMyChildTeams.length}
                  />
                  {filteredMyChildTeams.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <h3 className="text-card-title font-bold text-it-ink-800 dark:text-white">
                        {MESSAGES.team.noChildTeamsYet}
                      </h3>
                      <p className="mt-2 text-card-body text-it-ink-500 dark:text-it-ink-400">
                        {MESSAGES.team.noChildTeamsHint}
                      </p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-3" aria-label="내 자녀 팀">
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
                                    aria-label="이 팀에 소속된 내 자녀 목록"
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
                  )}
                </div>

                {/* 같은 팀의 다른 팀 섹션 */}
                <div className="flex flex-col gap-3">
                  <SectionHeader
                    icon="apartment"
                    title={MESSAGES.team.teamsSection}
                    hint={MESSAGES.team.teamsSectionHint}
                    count={filteredClubTeams.length}
                  />
                  {filteredClubTeams.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <h3 className="text-card-title font-bold text-it-ink-800 dark:text-white">
                        {MESSAGES.team.noOtherTeams}
                      </h3>
                      <p className="mt-2 text-card-body text-it-ink-500 dark:text-it-ink-400">
                        {MESSAGES.team.emptyHint}
                      </p>
                    </div>
                  ) : (
                    <ul
                      className="flex flex-col gap-3"
                      aria-label="같은 팀의 다른 팀"
                    >
                      {filteredClubTeams.map((team) => (
                        <li key={team.id}>
                          <TeamListCard
                            team={team}
                            onClick={() => handleCardClick(team.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
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
          ) : canManage && !isParent ? (
            // ─── 04c 감독 팀 관리 카드 (코치/감독/관리자 전용) ───
            <ul className="flex flex-col gap-3" aria-label="팀 카드 목록">
              {filteredTeams.map((team) => (
                <li key={team.id} className="flex flex-col gap-2">
                  <CoachTeamManageCard
                    team={team}
                    onClick={() => handleCardClick(team.id, team.myApprovalStatus)}
                    onPendingClick={() => handlePendingClick(team.id, team.myApprovalStatus)}
                  />
                  {/* [추가 2026-05-11] 하위그룹 카드 — 각 팀 아래에 노출.
                      예) 블리자드 → 블랙 블리자드(U12), 화이트 블리자드(U11) */}
                  <TeamSubGroupsCard teamId={team.id} teamName={team.name ?? '팀'} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="팀 카드 목록">
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

      {/* [제거] 팀 추가 생성 FAB — 설계상 감독 1인 = 가입 시 1팀 운영(멀티 팀 없음).
          가입 후 별도 팀 생성 기능은 존재하지 않으므로 진입점(FAB)을 전 역할에서 제거.
          근거: docs/Planning/SPEC_COACH_INVITE_SIGNUP.md(§감독 1인=1팀) ·
                docs/specs/260423_회의_기능재설계_설계서.md(팀 생성=가입 시 1회). */}
    </MobileContainer>
  );
}

// ─── 다음 일정 날짜·시간 포맷 헬퍼 ─────────────────────
function formatNextDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '내일';
  if (diffDays > 1 && diffDays < 7) {
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `${dayNames[d.getDay()]} ${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function formatNextTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── 04c 감독 팀 관리 카드 (Coach/Admin/Director 전용) ───────────
// 참고 디자인 "04c · 감독 팀 관리 (개선)" 100% 매칭.
// 데이터 미연결 영역(승무패·출석률·일정·gender·pending)은 placeholder/기본값으로
// 시각 골격을 유지. 실제 백엔드 응답이 추가되면 props 매핑만으로 대체 가능.
//
// 그라디언트 정책: TEAMPLUS 토큰 SoT 준수 → linear-gradient 금지, 솔리드 + alpha hex.
function CoachTeamManageCard({
  team,
  onClick,
  onPendingClick,
}: {
  team: TeamListItem;
  onClick: () => void;
  /**
   * [추가 2026-05-18 W2.B #2] 가입 신청 처리하기 핸들러.
   *   기존: pending footer "처리 →" 가 span 으로 렌더되어 onClick 누락 → 동작 없음.
   *   변경: 별도 button 으로 분리 + onPendingClick 으로 위임.
   *          기본 동작: 팀 상세 페이지 진입(onClick 과 동일 — pending 회원 처리는 상세 페이지 내에서 진행)
   */
  onPendingClick?: () => void;
}) {
  const teamColor = (team.primaryColor && /^#[0-9a-fA-F]{6}$/.test(team.primaryColor))
    ? team.primaryColor
    : '#2f5fff'; // ice-500 폴백
  const logoSrc = resolveImageSrc(team.logoUrl);
  const memberCount = team._count?.roster ?? 0;
  const division = team.division ?? null;

  // 04c 메타 필드 매핑 (백엔드 합성 → 프론트 표시)
  // 모든 필드가 실데이터 — 하드코딩 폴백 제거 (2026-05-09 Phase B)
  const gender = (team.genderType ?? 'MIX') as 'MIX' | 'M' | 'F';
  const record = {
    w: team.seasonWins ?? 0,
    l: team.seasonLosses ?? 0,
    d: team.seasonDraws ?? 0,
  };
  // [제거 2026-06-17] recentAttendanceRate 표시 제거 — 카드 하단 출석률 블록 삭제.
  const pending = team.pendingApplications ?? 0;

  // 다음 일정 — 백엔드 nextEvent 응답을 04c 시각 모델로 변환
  type NextSchedule = { type: '연습' | '경기'; date: string; time: string; place: string; urgent: boolean };
  const next: NextSchedule | null = team.nextEvent
    ? {
        type: team.nextEvent.eventType === 'tournament' || team.nextEvent.eventType === 'friendly' ? '경기' : '연습',
        date: formatNextDate(team.nextEvent.startAt),
        time: formatNextTime(team.nextEvent.startAt),
        place: team.nextEvent.location ?? team.nextEvent.title,
        urgent: team.nextEvent.isUrgent,
      }
    : null;

  return (
    <article className="relative overflow-hidden rounded-w-md bg-it-surface dark:bg-it-blue-950 border-[1.5px] border-it-line dark:border-it-blue-900">
      <button
        type="button"
        onClick={onClick}
        aria-label={`${team.name ?? '팀'} 상세 보기`}
        className="block w-full text-left active:brightness-95"
      >
        {/* 헤더: 로고 + 이름 + 칩 + 상세 이동 표시 — 패딩 16/16/12 */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          {/* 로고 타일 (56x56, radius 16) — 업로드된 팀 로고 우선, 없으면 솔리드 + 하키 아이콘 폴백 */}
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt={`${team.name ?? '팀'} 로고`}
              className="w-14 h-14 rounded-w-md object-cover shrink-0 border border-it-line dark:border-it-blue-900"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-w-md flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: teamColor }}
              aria-hidden="true"
            >
              <Icon name="sports_hockey" className="text-[26px]" aria-hidden="true" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* 팀명 + age + gender — 팀명 17px (참고 동일) */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <h3 className="text-card-emphasis font-extrabold text-it-ink-800 dark:text-white tracking-[-0.03em] truncate">
                {team.name ?? '팀명 미지정'}
              </h3>
              {/* [수정 2026-05-11] 팀(상위) 의 division 은 "전체" 로 통일 표기.
                  연령별 구분(U8~U12)은 TeamGroup(블랙 블리자드 U12 등) 레벨에서 노출 */}
              <span
                className="px-1.5 py-0.5 rounded text-card-meta font-extrabold tracking-[0.02em] shrink-0"
                style={{ color: teamColor, backgroundColor: `${teamColor}18` }}
              >
                전체
              </span>
              <span className="px-1.5 py-0.5 rounded bg-it-line dark:bg-it-blue-900 text-card-meta font-extrabold tracking-[0.04em] text-it-ink-500 dark:text-it-ink-400 shrink-0">
                {gender}
              </span>
            </div>
            {/* 인원수 + 승무패 record */}
            <div className="flex items-center gap-1.5 text-card-meta text-it-ink-500 dark:text-it-ink-400 min-w-0">
              <span className="font-bold text-it-ink-700 dark:text-it-ink-400 tabular-nums shrink-0">
                {memberCount}명
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {record.w}승 {record.l}패 {record.d}무
              </span>
            </div>
            {/* [추가 2026-05-21 시나리오 B] 팀 코드 — 회원가입 시 입력한 식별 코드.
                 감독/코치/관리자 카드에 노출하여 가입 안내 시 즉시 공유 가능하도록. */}
            {team.teamCode && (
              <div className="mt-1 inline-flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-it-ink-400 min-w-0">
                <Icon
                  name="qr_code_2"
                  className="shrink-0 text-[12px]"
                  aria-hidden="true"
                />
                <span className="font-bold tabular-nums uppercase tracking-wider truncate">
                  {team.teamCode}
                </span>
              </div>
            )}
          </div>

          {/* 상세 이동 표시 */}
          <span
            className="w-8 h-8 inline-flex items-center justify-center text-it-ink-500 dark:text-it-ink-400 shrink-0"
            aria-hidden="true"
          >
            <Icon name="chevron_right" className="text-[28px]" aria-hidden="true" />
          </span>
        </div>

        {/* 다음 일정 인라인 배너 — 예정된 일정이 있을 때만 표시.
            [2026-06-17] '예정된 일정 없음' 빈 상태 박스 삭제 (사용자 직접 지시) — next 없으면 배너 자체 미렌더. */}
        {next && (
          <div
            className={cn(
              'mx-4 mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2.5 border',
              !next.urgent && 'bg-it-fill dark:bg-it-blue-900/40 border-it-line dark:border-it-blue-900',
            )}
            style={
              next.urgent
                ? { borderColor: `${teamColor}30`, backgroundColor: `${teamColor}10` }
                : undefined
            }
          >
            {/* 좌측 8x8 캘린더 박스 */}
            <div
              className={cn(
                'w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0',
                !next.urgent && 'bg-it-surface dark:bg-it-blue-950 border border-it-line dark:border-it-blue-900 text-it-ink-700 dark:text-it-ink-400',
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
                    color: next.type === '경기' ? '#ff5a36' : teamColor,
                    backgroundColor: next.type === '경기' ? '#fee4dc' : `${teamColor}18`,
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
                오늘
              </span>
            )}
          </div>
        )}

        {/* [제거 2026-06-17] 하단 '최근 출석률' + placeholder 아바타 스택 삭제 (사용자 직접 지시) */}
      </button>

      {/* 가입 신청 footer — pending > 0 일 때만 표시 (조건부)
          [수정 2026-05-18 W2.B #2] "처리 →" 텍스트 → 실제 button 으로 교체.
            기존: span 으로 렌더되어 클릭이 외부 button(상세 진입)에 의해서만 작동하거나
                  중첩 button 으로 인해 동작 안 함.
            변경: <button onClick={onPendingClick}> 로 분리, e.stopPropagation 으로 외부 카드
                  클릭 이벤트와 분리. 기본은 팀 상세 페이지로 이동. */}
      {/* [수정 2026-05-21 v3] pending coach 에게는 footer 자체 미노출 — 본인 승인되지
          않은 상태에서 다른 가입 신청 정보를 알 필요 없음 (옵션 B 진입 차단 정책과 정렬). */}
      {pending > 0 && team.myApprovalStatus !== 'pending' && (
        <div className="border-t border-it-line dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-900/40 px-4 py-2.5 flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-w-pill bg-flame-100 dark:bg-flame-500/15 text-flame-500 inline-flex items-center justify-center text-card-meta font-extrabold shrink-0"
            aria-hidden="true"
          >
            !
          </span>
          <span className="flex-1 text-card-meta font-semibold text-it-ink-700 dark:text-it-ink-400">
            가입 신청{' '}
            <span className="font-extrabold text-flame-500">{pending}건</span>{' '}
            승인 대기
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onPendingClick) onPendingClick();
              else onClick();
            }}
            aria-label={MESSAGES.team.pendingHandleAria(team.name ?? '팀')}
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

// ─── 하위그룹 카드 (2026-05-11 추가) ──────────────────────
// 각 팀 카드 아래에 노출 — "하위그룹" 라벨 + 그룹 칩 리스트 (이름, 연령, 인원).
// 예: 블리자드 팀 아래 → 블랙 블리자드(U12, 2명) · 화이트 블리자드(U11, 2명)
// 그룹이 0개면 컴포넌트 자체 미렌더 (시각 노이즈 최소화).
function TeamSubGroupsCard({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { navigate } = useNavigation();
  const [groups, setGroups] = useState<TeamGroupSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await teamGroupService.listByTeam(teamId);
        if (cancelled) return;
        // [2026-06-05] 출생연도(4자리) 우선 정렬 — 최신 출생연도부터. 레거시 U8~U12 는 뒤로.
        const ageOrder: Record<string, number> = { U8: 0, U9: 1, U10: 2, U11: 3, U12: 4 };
        const rank = (ag: string | null | undefined): number => {
          if (ag && /^\d{4}$/.test(ag)) return 10000 - Number(ag);
          return ageOrder[ag ?? ''] ?? 99;
        };
        const active = list
          .filter((g) => g.isActive !== false)
          .sort((a, b) => rank(a.ageGroup) - rank(b.ageGroup));
        setGroups(active);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (isLoading) return null;
  if (groups.length === 0) return null;

  return (
    <section
      aria-label={`${teamName} 하위그룹`}
      className="rounded-[14px] border border-it-line dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-900/40 px-3 py-2.5"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon
            name="folder_open"
            className="text-[14px] text-it-ink-500 dark:text-it-ink-400"
            aria-hidden="true"
          />
          <span className="text-card-meta font-extrabold uppercase tracking-[0.04em] text-it-ink-700 dark:text-white">
            하위그룹
          </span>
          <span className="text-card-meta font-bold text-it-ink-500 dark:text-it-ink-400 tabular-nums">
            {groups.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/team/${teamId}/groups`)}
          className="text-card-meta font-bold text-it-blue-500 hover:text-it-blue-600 transition-colors motion-reduce:transition-none"
          aria-label={`${teamName} 그룹 관리`}
        >
          관리하기
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-1.5" role="list">
        {groups.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => navigate(`/team/${teamId}/groups/${g.id}/edit`)}
              className="w-full h-full rounded-[10px] border border-it-line dark:border-it-blue-900 bg-it-surface dark:bg-it-blue-950 px-2.5 py-2 text-left flex items-center gap-2 hover:border-it-blue-500 hover:bg-it-blue-500/[0.04] transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label={`${g.name} 그룹 상세`}
            >
              <span
                className="shrink-0 w-7 h-7 rounded-[8px] bg-it-blue-500/10 text-it-blue-500 inline-flex items-center justify-center"
                aria-hidden="true"
              >
                <Icon name="groups" className="text-[14px]" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-card-meta font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em] truncate">
                  {g.name}
                </span>
                <span className="block mt-0.5 text-card-meta font-semibold text-it-ink-500 dark:text-it-ink-400 tabular-nums">
                  {g.ageGroup && /^\d{4}$/.test(g.ageGroup)
                    ? `${g.ageGroup}년생`
                    : '연령 미지정'}{' '}
                  · {g._count?.members ?? 0}명
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Sub Components ──────────────────────────────────────
// (2026-04-12) 레거시 inline TeamCard / ParentTeamCard 는 `@/components/team/TeamListCard` 로 이관.
// 이 페이지는 공통 컴포넌트만 임포트하여 렌더링 로직을 위임한다.

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
          <h2 className="text-card-emphasis font-bold text-it-ink-800 dark:text-white">
            {title}
          </h2>
          <span
            className="inline-flex items-center justify-center rounded-w-pill bg-it-line px-2 py-0.5 text-card-meta font-bold font-num tabular-nums text-it-ink-700 dark:bg-it-blue-900 dark:text-it-ink-400"
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
// (2026-04-12) ParentTeamCard 는 TeamListCard(highlight=true) + footerSlot 으로 대체.
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
