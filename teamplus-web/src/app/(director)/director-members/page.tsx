'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useNavigation } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';

// ── 타입 정의 ──

interface Member {
  id: string;
  name: string;
  role: MemberRole;
  /** 생년월일 (ISO) — 회원가입 시 미입력이면 빈 문자열 */
  birthDate: string;
  avatarUrl?: string | null;
}

// "회원 관리" → "선수 관리". 학생(TEEN/CHILD) 만 표시.
//   학부모·코치는 BottomNav `/team` 상세 + `/director-coaches` 로 동선 분리.
//   청소년/어린이 구분 라벨도 제거 — 모두 "선수" 단일 라벨.
type MemberRole = 'TEEN' | 'CHILD';
type SortKey = 'name' | 'birthDate';

// 모든 학생은 "선수" 로 통합 표시 (역할 배지 자체는 단일 라벨이라 별도 표시 안 함)
const ROLE_STYLE = { bg: 'bg-wline-2 dark:bg-rink-700', text: 'text-wtext-2 dark:text-wtext-4' };

const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: 'name', label: '이름순', icon: 'sort_by_alpha' },
  { key: 'birthDate', label: '생년월일순', icon: 'cake' },
];

const PAGE_SIZE = 20;

export default function DirectorMembersPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  useNativeUI({ showStatusBar: true, showBottomNav: true });
  const { navigate } = useNavigation();

  // ── 데이터 상태 ──
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ── 정렬 필터 시트 ──
  // [2026-06-18] 기본 정렬을 '생년월일순'(출생연도 오름차순 = 나이 많은 순)으로 변경 (사용자 직접 지시).
  const [sortKey, setSortKey] = useState<SortKey>('birthDate');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [draftSortKey, setDraftSortKey] = useState<SortKey>('birthDate');

  // ── 데이터 로드 ──
  const loadMembers = useCallback(async (currentPage = 1) => {
    setIsLoading(true);
    try {
      // 감독 본인이 관리하는 팀의 roster 조회
      const teamsRes = await api.get<Array<{ id: string; name?: string }>>('/teams/my/managed');
      if (!teamsRes.success || !Array.isArray(teamsRes.data) || teamsRes.data.length === 0) {
        setMembers([]);
        setTotalCount(0);
        setIsLoading(false);
        return;
      }

      // `/teams/:id/members?status=approved` 사용 — TeamMember 전체 반환
      //   (roleInTeam 으로 PLAYER/COACH/MANAGER 구분). 여기서는 PLAYER(선수)만 추린다.
      interface TeamMemberRow {
        id: string;
        roleInTeam?: string | null;
        playerName?: string;
        user?: {
          id?: string;
          userType?: string;
          firstName?: string;
          lastName?: string;
          // 출생연도 표기용 — TEEN/CHILD 회원가입 시 저장된 생년월일 (없으면 null)
          birthDate?: string | null;
        };
      }
      const allMembers: TeamMemberRow[] = [];
      for (const t of teamsRes.data) {
        const r = await api.get<
          TeamMemberRow[] | { members?: TeamMemberRow[]; data?: TeamMemberRow[] }
        >(`/teams/${t.id}/members`, { params: { status: 'approved' } });
        if (!r.success || !r.data) continue;
        const list = Array.isArray(r.data)
          ? r.data
          : Array.isArray((r.data as { members?: TeamMemberRow[] }).members)
            ? (r.data as { members: TeamMemberRow[] }).members
            : Array.isArray((r.data as { data?: TeamMemberRow[] }).data)
              ? (r.data as { data: TeamMemberRow[] }).data
              : [];
        allMembers.push(...list);
      }

      // 선수(학생)만 표시 — TEEN/CHILD 가 아닌 멤버는 제외.
      const toStudentRole = (
        roleInTeam?: string | null,
        userType?: string,
      ): MemberRole | null => {
        // PLAYER (선수) 만 통과 — HEAD_COACH/COACH/MANAGER 는 제외
        if (roleInTeam && roleInTeam !== 'PLAYER') return null;
        if (userType === 'CHILD') return 'CHILD';
        if (userType === 'TEEN') return 'TEEN';
        return null;
      };

      const mapped: Member[] = allMembers
        .map((m): Member | null => {
          const u = m.user;
          const role = toStudentRole(m.roleInTeam, u?.userType);
          if (!role) return null;
          return {
            id: m.id,
            name: m.playerName ?? `${u?.lastName ?? ''}${u?.firstName ?? ''}`.trim(),
            role,
            birthDate: u?.birthDate ?? '',
            avatarUrl: null,
          };
        })
        .filter((x): x is Member => x !== null);

      // 검색어 (클라이언트 사이드) — 이름만
      let visible = mapped;
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        visible = visible.filter((x) => x.name.toLowerCase().includes(q));
      }

      setMembers(visible);
      setTotalCount(visible.length);
    } catch {
      setMembers([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    void loadMembers(1);
  }, [loadMembers]);

  // ── 페이지네이션 ──
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const goToPage = useCallback((p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    void loadMembers(p);
  }, [totalPages, loadMembers]);

  // ── 클라이언트 정렬 ──
  const sortedMembers = useMemo(() => {
    const sorted = [...members];
    switch (sortKey) {
      case 'birthDate':
        // 생년월일 오름차순(연장자 먼저). 미입력(빈 값)은 뒤로.
        sorted.sort((a, b) => {
          if (!a.birthDate && !b.birthDate) return 0;
          if (!a.birthDate) return 1;
          if (!b.birthDate) return -1;
          return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
        });
        break;
      case 'name':
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
        break;
    }
    return sorted;
  }, [members, sortKey]);

  // ── 필터 시트 핸들러 ──
  const openFilterSheet = useCallback(() => {
    setDraftSortKey(sortKey);
    setIsFilterSheetOpen(true);
  }, [sortKey]);

  const applyFilter = useCallback(() => {
    setSortKey(draftSortKey);
    setIsFilterSheetOpen(false);
  }, [draftSortKey]);

  const resetFilter = useCallback(() => {
    setDraftSortKey('birthDate');
    setSortKey('birthDate');
  }, []);

  // ── 날짜 포맷 (YYYY.MM.DD) ──
  // [2026-06-17] 생년월일은 '날짜 그대로' 표기해야 함 — ISO 날짜 부분(YYYY-MM-DD)을 직접 추출.
  //   new Date(iso).getDate() 는 UTC 자정 ISO 를 로컬 타임존으로 변환해 하루 밀리는 버그 유발
  //   (예: 2020-08-28T00:00:00.000Z → UTC 환경에서 2020.08.27 로 오표기).
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return '-';
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return '-';
    }
  };

  const activeFilterCount = sortKey !== 'birthDate' ? 1 : 0;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title="선수 관리"
        showNotification
        forceNative
        extraActions={[
          {
            icon: 'campaign',
            label: `${MESSAGES.memberPush.pageTitle} ${MESSAGES.memberPush.entryAction}하기`,
            onClick: () => navigate('/director-members/push'),
          },
        ]}
      />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck" role="main" aria-label="선수 관리">
        {/* 검색바 */}
        <section className="px-5 pt-5" aria-label="선수 검색">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-card-title text-wtext-3 dark:text-wtext-4"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름으로 검색"
              aria-label="선수 이름 검색"
              className="h-12 w-full rounded-w-md border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 pl-11 pr-10 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-4 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
                className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-w-pill text-wtext-3 transition-colors motion-reduce:transition-none hover:bg-wline-2 hover:text-wtext-1 dark:hover:bg-rink-700 dark:hover:text-white"
              >
                <Icon name="close" className="text-[18px]" aria-hidden="true" />
              </button>
            )}
          </div>
        </section>

        {/* 목록 헤더 — SectionHead 위계 통일 (SPEC §2.3) */}
        <section className="flex items-center justify-between px-4 sm:px-5 pt-4 sm:pt-[18px] pb-2" aria-label="선수 목록 헤더">
          <div className="flex items-baseline gap-2">
            <h2 className="text-wtext-1 dark:text-white tracking-[-0.02em] font-extrabold text-card-title sm:text-card-title">
              선수 목록
            </h2>
            {!isLoading && (
              <span className="text-card-body font-bold font-num tabular-nums text-ice-500">
                {sortedMembers.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={openFilterSheet}
            aria-label="선수 목록 필터링"
            className="inline-flex h-9 items-center gap-1.5 rounded-w-md bg-wsurface px-3 text-card-meta font-bold text-wtext-2 border border-wline-2 transition-colors motion-reduce:transition-none hover:bg-wline-2/40 active:brightness-95 dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700"
          >
            <Icon name="filter_list" className="text-[16px]" aria-hidden="true" />
            <span>필터링</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-w-pill bg-ice-500 px-1 text-card-meta font-bold font-num tabular-nums text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </section>

        {/* 선수 리스트 — 1줄 카드 (아바타 · 이름 / 생년월일) */}
        <section className="flex flex-col gap-2.5 px-5" aria-label="선수 목록">
          {isLoading ? null : sortedMembers.length === 0 ? (
            // 빈 상태 — 1줄 텍스트 + 인라인 링크 (§7.5.3)
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-card-body font-medium text-wtext-2 dark:text-wtext-4 text-center">
                {searchQuery.trim()
                  ? `"${searchQuery.trim()}" 검색 결과가 없습니다.`
                  : MESSAGES.empty('선수')}
              </p>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 text-card-meta font-bold text-ice-500 transition-colors motion-reduce:transition-none hover:text-ice-600 underline underline-offset-2"
                >
                  검색어 초기화
                </button>
              )}
            </div>
          ) : (
            sortedMembers.map((member, idx) => {
              const initial = member.name?.charAt(0) || '?';

              return (
                <div
                  key={member.id}
                  style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                  className="flex w-full items-center gap-3 rounded-w-lg bg-wsurface dark:bg-rink-800 p-3.5 border border-wline-2 dark:border-rink-700 shadow-sh-1"
                >
                  {/* 아바타 */}
                  <div className={cn(
                    'relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-w-pill',
                    ROLE_STYLE.bg,
                  )}>
                    {resolveImageSrc(member.avatarUrl) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={resolveImageSrc(member.avatarUrl)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className={cn('text-card-body font-bold', ROLE_STYLE.text)}>{initial}</span>
                    )}
                  </div>

                  {/* 선수 이름 (좌측) */}
                  <h3 className="flex-1 min-w-0 truncate text-card-body font-bold text-wtext-1 dark:text-white">
                    {member.name}
                  </h3>

                  {/* 생년월일 (우측) */}
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-card-meta font-medium text-wtext-3 dark:text-wtext-4"
                    aria-label={`생년월일 ${formatDate(member.birthDate)}`}
                  >
                    <Icon name="cake" className="text-[15px] text-ice-500" aria-hidden="true" />
                    <span className="font-num tabular-nums">{formatDate(member.birthDate)}</span>
                  </span>
                </div>
              );
            })
          )}
        </section>

        {/* 페이지네이션 */}
        {!isLoading && totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 px-5 pt-8 pb-4" aria-label="페이지 이동">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex size-11 items-center justify-center rounded-w-md border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-wtext-4 transition-colors motion-reduce:transition-none hover:bg-wline-2/40 dark:hover:bg-rink-700 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="이전 페이지"
            >
              <Icon name="chevron_left" className="text-[18px]" aria-hidden="true" />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              const isCurrent = page === pageNum;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => goToPage(pageNum)}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-w-md text-card-body font-bold font-num tabular-nums transition-colors motion-reduce:transition-none active:brightness-95',
                    isCurrent
                      ? 'bg-ice-500 text-white shadow-sh-1'
                      : 'border border-wline-2 bg-wsurface text-wtext-2 hover:bg-wline-2/40 dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700',
                  )}
                  aria-label={`${pageNum} 페이지`}
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="flex size-11 items-center justify-center rounded-w-md border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-wtext-4 transition-colors motion-reduce:transition-none hover:bg-wline-2/40 dark:hover:bg-rink-700 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="다음 페이지"
            >
              <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
            </button>
          </nav>
        )}

        <div className="h-6" aria-hidden="true" />
      </main>

      {/* 신규 선수 등록 FAB 제거 — 코치/감독이 직접 학생을 생성하는 시나리오 없음.
          학생 가입은 학부모 회원가입 + 자녀 등록 경로로만 진행. */}

      {/* 정렬 BottomSheet */}
      <BottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="필터링"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetFilter}
              className="flex-1 rounded-w-md border border-wline-2 bg-wsurface py-3 text-card-body font-bold text-wtext-1 transition-colors motion-reduce:transition-none hover:bg-wline-2/40 dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:hover:bg-rink-700"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={applyFilter}
              className="flex-[2] rounded-w-md bg-ice-500 py-3 text-card-body font-bold text-white transition-colors duration-200 ease-ios motion-reduce:transition-none hover:bg-ice-600 active:brightness-95"
            >
              적용하기
            </button>
          </div>
        }
      >
        <section aria-label="정렬 기준" className="pt-2">
          <h3 className="mb-3 text-card-meta font-bold uppercase tracking-[0.12em] text-wtext-3 dark:text-wtext-4">
            정렬 기준
          </h3>
          <div
            role="radiogroup"
            aria-label="정렬 기준 선택"
            className="flex flex-col gap-2"
          >
            {SORT_OPTIONS.map((opt) => {
              const selected = draftSortKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDraftSortKey(opt.key)}
                  className={cn(
                    'flex items-center gap-3 rounded-w-md border px-4 py-3 text-left transition-colors duration-200 ease-wallet motion-reduce:transition-none active:brightness-95',
                    selected
                      ? 'border-ice-500 bg-ice-50 dark:border-ice-500 dark:bg-ice-500/15'
                      : 'border-wline-2 bg-wsurface hover:bg-wline-2/40 dark:border-rink-700 dark:bg-rink-800 dark:hover:bg-rink-700',
                  )}
                >
                  <Icon
                    name={opt.icon}
                    className={cn(
                      'text-card-section',
                      selected ? 'text-ice-500' : 'text-wtext-3 dark:text-wtext-4',
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'flex-1 text-card-body font-bold',
                      selected
                        ? 'text-ice-500'
                        : 'text-wtext-1 dark:text-white',
                    )}
                  >
                    {opt.label}
                  </span>
                  {selected && (
                    <Icon
                      name="check_circle"
                      className="text-card-title text-ice-500"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </BottomSheet>
    </MobileContainer>
  );
}
