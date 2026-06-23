'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { resolveImageSrc } from '@/lib/image-url';
import { MESSAGES } from '@/lib/messages';
import { useRefreshSubscription, emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';

import { usePageReady } from '@/hooks/usePageReady';

interface Coach {
  id: string;
  name: string;
  /** 배정된 수업 수 */
  weeklyClasses: number;
  avatarUrl?: string | null;
  /** HEAD_COACH(감독) 여부 — 정렬 시 우선 */
  isHead?: boolean;
  /** MANAGER(단장) 여부 — 코치와 동일 취급, 배지만 '단장' */
  isManager?: boolean;
  /**
   * userType==='COACH' 인 경우만 수정/삭제 가능.
   * 감독 본인(DIRECTOR) 등은 /admin/coaches 전용 API 대상이 아니라 버튼을 숨긴다.
   */
  editable: boolean;
}

export default function DirectorCoachManagePage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  const { navigate } = useNavigation();
  const { toast } = useToast();

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [searchQuery, setSearchQuery] = useState('');

  // 삭제 확인 시트 상태
  const [deleteTarget, setDeleteTarget] = useState<Coach | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCoaches = useCallback(async () => {
    setIsLoading(true);
    try {
      // 본인 관리 팀 (감독은 자기 팀만 봐야 함)
      const teamsRes = await api.get<Array<{ id: string; name: string }>>('/teams/my/managed');
      if (!teamsRes.success || !Array.isArray(teamsRes.data) || teamsRes.data.length === 0) {
        setCoaches([]);
        return;
      }

      // /roster 는 PLAYER 만 돌려주므로 /teams/:id/members 로 전체 멤버 받고
      //  roleInTeam='COACH'|'HEAD_COACH'|'MANAGER' 만 필터링한다.
      type TeamMemberRow = {
        id: string;
        playerName?: string;
        roleInTeam?: string;
        approvalStatus?: string;
        user?: {
          id?: string;
          firstName?: string;
          lastName?: string;
          avatarUrl?: string | null;
          userType?: string;
        };
      };
      type MembersResponse = {
        total?: number;
        members?: TeamMemberRow[];
      };
      // 코치별 배정 수업 개수 집계용 — 팀 /classes 응답의 coachId 기준.
      type ClassRow = {
        coachId?: string | null;
        coaches?: Array<{ coachId?: string; userId?: string }>;
      };

      const allCoaches: Coach[] = [];
      const coachClassCount = new Map<string, number>();

      for (const t of teamsRes.data) {
        const memberPromise = api.get<MembersResponse | TeamMemberRow[]>(
          `/teams/${t.id}/members`,
        );
        const classesPromise = api
          .get<ClassRow[] | { data?: ClassRow[]; classes?: ClassRow[] }>(
            `/teams/${t.id}/classes`,
          )
          .catch(() => null);
        const [r, cr] = await Promise.all([memberPromise, classesPromise]);
        if (!r.success || !r.data) continue;
        const memList: TeamMemberRow[] = Array.isArray(r.data)
          ? r.data
          : Array.isArray((r.data as MembersResponse).members)
            ? (r.data as MembersResponse).members!
            : [];

        // 수업 데이터 → 코치별 배정 개수 집계
        if (cr?.success && cr.data) {
          const classList: ClassRow[] = Array.isArray(cr.data)
            ? cr.data
            : Array.isArray((cr.data as { classes?: ClassRow[] }).classes)
              ? (cr.data as { classes: ClassRow[] }).classes
              : Array.isArray((cr.data as { data?: ClassRow[] }).data)
                ? (cr.data as { data: ClassRow[] }).data ?? []
                : [];
          for (const c of classList) {
            const assignedCoachIds = new Set<string>();
            if (c.coachId) assignedCoachIds.add(c.coachId);
            for (const cc of c.coaches ?? []) {
              const cid = cc.userId ?? cc.coachId;
              if (cid) assignedCoachIds.add(cid);
            }
            for (const cid of assignedCoachIds) {
              coachClassCount.set(cid, (coachClassCount.get(cid) ?? 0) + 1);
            }
          }
        }

        const teamCoaches = memList
          .filter(
            (row) =>
              row.roleInTeam === 'COACH' ||
              row.roleInTeam === 'HEAD_COACH' ||
              row.roleInTeam === 'MANAGER',
          )
          .filter((row) => (row.approvalStatus ?? 'approved') === 'approved')
          .map((row) => {
            const userId = row.user?.id ?? row.id;
            return {
              id: userId,
              name:
                row.playerName ??
                `${row.user?.lastName ?? ''}${row.user?.firstName ?? ''}`.trim(),
              weeklyClasses: coachClassCount.get(userId) ?? 0,
              avatarUrl: row.user?.avatarUrl ?? null,
              isHead: row.roleInTeam === 'HEAD_COACH',
              isManager: row.roleInTeam === 'MANAGER',
              // COACH 계정만 코치 전용 API 로 수정/삭제 가능 (감독 본인 DIRECTOR 등 제외)
              editable: row.user?.userType === 'COACH',
            };
          });
        allCoaches.push(...teamCoaches);
      }

      // 동일 user.id 중복 제거 + 감독 우선 + 수업 수 합산
      const uniq = new Map<string, Coach>();
      for (const c of allCoaches) {
        const prev = uniq.get(c.id);
        if (prev) {
          uniq.set(c.id, {
            ...prev,
            isHead: prev.isHead || c.isHead,
            isManager: prev.isManager || c.isManager,
            weeklyClasses: prev.weeklyClasses + c.weeklyClasses,
          });
        } else {
          uniq.set(c.id, c);
        }
      }
      setCoaches(Array.from(uniq.values()));
    } catch {
      setCoaches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoaches();
  }, [loadCoaches]);

  // 코치 등록/삭제/수정 이벤트 수신 시 즉시 재 fetch (register 페이지에서 emitRefresh 발화).
  useRefreshSubscription(REFRESH_KEYS.COACHES, () => {
    void loadCoaches();
  });

  // 이름 검색 + 감독 우선 이름순 정렬 (고정)
  const filteredCoaches = useMemo(() => {
    let list = coaches;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    const headFirst = (a: Coach, b: Coach) => {
      if ((a.isHead ?? false) !== (b.isHead ?? false)) return a.isHead ? -1 : 1;
      return 0;
    };
    return [...list].sort(
      (a, b) => headFirst(a, b) || a.name.localeCompare(b.name, 'ko-KR'),
    );
  }, [coaches, searchQuery]);

  /** 코치 삭제 */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/admin/coaches/${deleteTarget.id}`);
      if (res.success) {
        toast.success(MESSAGES.delete.success);
        setCoaches((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        // 다른 화면(코치 detail, 대시보드 카운트)에도 갱신 신호.
        emitRefresh(REFRESH_KEYS.COACHES);
      } else {
        toast.error(MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, isDeleting, toast]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="코치 관리" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck pb-[calc(80px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+72px)]"
        role="main"
        aria-label="감독 코치 관리"
      >
        {/* 검색바 */}
        <section className="px-5 pt-5" aria-label="코치 검색">
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
              placeholder="코치 이름 검색"
              aria-label="코치 검색"
              className="h-12 w-full rounded-w-md border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 pl-11 pr-4 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-4 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20"
            />
          </div>
        </section>

        {/* 목록 헤더 — SectionHead 위계 통일 (SPEC §2.3) */}
        <section className="flex items-center justify-between px-4 sm:px-5 pt-4 sm:pt-[18px] pb-2" aria-label="코치 목록 헤더">
          <div className="flex items-baseline gap-2">
            <h2 className="text-wtext-1 dark:text-white tracking-[-0.02em] font-extrabold text-card-title sm:text-card-title">
              코치 목록
            </h2>
            {!isLoading && (
              <span className="text-card-body font-bold font-num tabular-nums text-ice-500">
                {filteredCoaches.length}
              </span>
            )}
          </div>
        </section>

        {/* 코치 리스트 — 1줄 카드 (아바타 · 이름 · 역할 / 배정 수업 수 / 수정·삭제) */}
        <section className="flex flex-col gap-2.5 px-5" aria-label="코치 목록">
          {isLoading ? null : filteredCoaches.length === 0 ? (
            // 빈 상태 — 1줄 텍스트 (§7.5.3)
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-card-body font-medium text-wtext-2 dark:text-wtext-4 text-center">
                {searchQuery.trim()
                  ? `"${searchQuery.trim()}" 검색 결과가 없습니다.`
                  : MESSAGES.empty('코치')}
              </p>
            </div>
          ) : (
            filteredCoaches.map((coach, idx) => {
              const initial = coach.name?.charAt(0) || '?';

              return (
                <article
                  key={coach.id}
                  style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                  className="flex items-center gap-3 rounded-w-lg bg-wsurface dark:bg-rink-800 p-3.5 shadow-sh-1 border border-wline-2 dark:border-rink-700 transition-shadow duration-200 ease-wallet motion-reduce:transition-none hover:shadow-sh-2"
                >
                  {/* 프로필 (아바타 + 이름 + 역할 배지) — 탭 시 상세 */}
                  <NavLink
                    href={`/director-coaches/${coach.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                    aria-label={`${coach.name} 코치 상세 보기`}
                  >
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-w-md bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                      {resolveImageSrc(coach.avatarUrl) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resolveImageSrc(coach.avatarUrl)}
                          alt={`${coach.name} 코치`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-card-body font-bold text-ice-500">
                          {initial}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="text-card-body font-bold leading-tight truncate text-wtext-1 dark:text-white">
                        {coach.name}
                      </h3>
                      {/* 역할 뱃지 — 감독(HEAD_COACH) 인디고 강조 · 단장(MANAGER) 채움 강조 · 일반 코치 중성 슬레이트 */}
                      {coach.isHead ? (
                        <span className="inline-flex items-center shrink-0 rounded-w-xs bg-ice-500/10 dark:bg-ice-500/20 px-1.5 py-0.5 text-card-meta font-bold text-ice-500">
                          감독
                        </span>
                      ) : coach.isManager ? (
                        <span className="inline-flex items-center shrink-0 rounded-w-xs bg-wline-2 dark:bg-rink-700 px-1.5 py-0.5 text-card-meta font-bold text-wtext-1 dark:text-rink-100">
                          단장
                        </span>
                      ) : (
                        <span className="inline-flex items-center shrink-0 rounded-w-xs border border-wline-2 dark:border-rink-600 px-1.5 py-0.5 text-card-meta font-bold text-wtext-2 dark:text-rink-200">
                          코치
                        </span>
                      )}
                    </div>
                  </NavLink>

                  {/* 배정 수업 개수 */}
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-card-meta font-bold text-wtext-2 dark:text-wtext-4"
                    aria-label={`배정 수업 ${coach.weeklyClasses}개`}
                  >
                    <Icon name="calendar_month" className="text-[15px] text-ice-500" aria-hidden="true" />
                    <span className="font-num tabular-nums">{coach.weeklyClasses}</span>개
                  </span>

                  {/* 수정/삭제 아이콘 — 코치(COACH) 계정만. 감독 본인 등은 숨김 */}
                  {coach.editable && (
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/director-coaches/${coach.id}/edit`)}
                        className="flex size-9 items-center justify-center text-wtext-3 dark:text-wtext-4 hover:text-ice-500 dark:hover:text-ice-500 transition-colors motion-reduce:transition-none rounded-w-md hover:bg-wline-2/40 dark:hover:bg-rink-700 active:brightness-95"
                        aria-label={`${coach.name} 수정`}
                      >
                        <Icon name="edit" className="text-[18px]" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(coach)}
                        className="flex size-9 items-center justify-center text-wtext-3 dark:text-wtext-4 hover:text-flame-500 dark:hover:text-flame-500 transition-colors motion-reduce:transition-none rounded-w-md hover:bg-wline-2/40 dark:hover:bg-rink-700 active:brightness-95"
                        aria-label={`${coach.name} 삭제`}
                      >
                        <Icon name="delete" className="text-[18px]" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        <div className="h-6" aria-hidden="true" />
      </main>

      {/* Circular FAB — wallet floating action.
          iOS safe-area + BottomNav(80px) + 16px 여유까지 반영해
          BottomNav 와 겹치지 않는 위치로 고정. (children/page.tsx 표준 패턴 정렬) */}
      <NavLink
        href="/director-coaches/register"
        aria-label="신규 코치 등록하기"
        style={{
          bottom:
            'calc(80px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 16px)',
        }}
        className="fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500 hover:bg-ice-600 text-white shadow-sh-blue transition-colors duration-200 ease-ios-spring motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-puck"
      >
        <Icon name="add" className="text-[28px]" aria-hidden="true" />
      </NavLink>

      {/* 삭제 확인 시트 */}
      <ConfirmSheet
        open={!!deleteTarget}
        title={MESSAGES.delete.confirm}
        description={deleteTarget ? `${deleteTarget.name} 코치를 삭제하면 배정된 수업 정보도 함께 해제됩니다.` : undefined}
        confirmLabel="삭제하기"
        cancelLabel="취소"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </MobileContainer>
  );
}
