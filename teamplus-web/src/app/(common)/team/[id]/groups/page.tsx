"use client";

/**
 * /team/[id]/groups — 팀 하위 그룹 목록
 *
 * 감독·코치가 팀 안에 만든 하위 그룹(예: 선수반 A조)을 보여준다.
 * 같은 페이지에서 "그룹 만들기" 버튼으로 /team/[id]/groups/create 진입.
 *
 * [디자인 2026-06-25] ICETIMES flat 재스킨 — 회색 캔버스 + full-bleed 흰 섹션 +
 *   hairline 행(카드 박스 제거). it-* 토큰. 기능/로직/라우팅 동결, 비주얼만.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { cn } from "@/lib/utils";
import { MESSAGES } from "@/lib/messages";
import { isTeamManager } from "@/lib/team-roles";
import {
  teamGroupService,
  type TeamGroupSummary,
} from "@/services/team-group.service";

export default function TeamGroupsListPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const params = useParams<{ id: string }>();
  const teamId = params?.id;
  const router = useRouter();
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const { user } = useSessionAuth();
  const canManage = isTeamManager(user);

  const [groups, setGroups] = useState<TeamGroupSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await teamGroupService.listByTeam(teamId);
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : MESSAGES.team.loadError);
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const handleDelete = async (groupId: string, groupName: string) => {
    if (!window.confirm(`'${groupName}' ${MESSAGES.team.groupDeleteConfirm}`)) {
      return;
    }
    try {
      await teamGroupService.delete(groupId);
      toast.success(MESSAGES.team.groupDeleteSuccess);
      void loadGroups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : MESSAGES.common.unknown);
    }
  };

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title={MESSAGES.team.groupListTitle}
        onBack={() => router.back()}
        forceNative
      />

      <main
        className="flex-1 overflow-y-auto overscroll-contain bg-it-canvas dark:bg-puck hide-scrollbar"
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label={MESSAGES.team.groupListTitle}
      >
        {/* 그룹 목록 — flat 흰 섹션 (헤더 + 그룹 생성 버튼 + hairline 행) */}
        <section
          className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7"
          aria-label="하위그룹 목록"
        >
          {/* 섹션 헤더 — 제목 + 카운트 + 그룹 만들기 */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                하위그룹
              </h2>
              {!isLoading && (
                <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                  {groups.length}
                </span>
              )}
            </div>
            {/* 감독/코치만 그룹 생성 가능 */}
            {canManage && (
              <button
                type="button"
                onClick={() => navigate(`/team/${teamId}/groups/create`)}
                className="inline-flex h-[34px] items-center gap-1 rounded-w-md bg-it-blue-500 px-3 text-[13px] font-bold text-white transition-colors duration-150 ease-ios motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95"
              >
                <Icon name="add" className="text-[16px]" aria-hidden="true" />
                <span>{MESSAGES.team.groupCreateButton}</span>
              </button>
            )}
          </div>

          {/* 에러 */}
          {!isLoading && error && (
            <div className="mt-4 rounded-w-md border-[1.5px] border-it-red-200 bg-it-red-50 px-4 py-3 text-[14px] font-semibold text-it-red-600 dark:border-it-red-500/40 dark:bg-it-red-500/10 dark:text-it-red-300">
              {error}
            </div>
          )}

          {/* 비어있음 — 1줄 텍스트 */}
          {!isLoading && !error && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-center text-[14px] font-medium text-it-ink-700 dark:text-it-ink-300">
                {MESSAGES.team.groupListEmpty}
              </p>
            </div>
          )}

          {/* 목록 — hairline 행 */}
          {!isLoading && !error && groups.length > 0 && (
            <div className="flex flex-col">
              {groups.map((g, idx) => {
                const isLast = idx === groups.length - 1;
                return (
                  <div
                    key={g.id}
                    className={cn(
                      "flex w-full items-center gap-3 py-[13px] min-h-[56px]",
                      !isLast && "border-b border-it-line dark:border-it-blue-900",
                    )}
                  >
                    {/* 그룹 아이콘 타일 */}
                    <div
                      className="flex size-11 shrink-0 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15"
                      aria-hidden="true"
                    >
                      <Icon name="groups" className="text-[20px] text-it-blue-500" />
                    </div>

                    {/* 그룹 정보 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="truncate text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                          {g.name}
                        </h3>
                        {/* [2026-06-05] 출생연도(4자리)만 "년생" 표시. 레거시 U8~U12 배지는 숨김. */}
                        {g.ageGroup && /^\d{4}$/.test(g.ageGroup) && (
                          <span className="inline-flex items-center rounded-w-md bg-it-blue-50 px-2 py-0.5 text-[12px] font-bold tabular-nums text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-300">
                            {g.ageGroup}년생
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] font-medium text-it-ink-500 dark:text-it-ink-300">
                        {MESSAGES.team.groupMemberCountLabel(g._count.members)}
                      </p>
                    </div>

                    {/* 관리 버튼 (감독/코치만) */}
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/team/${teamId}/groups/${g.id}/edit`)
                          }
                          className="inline-flex h-8 items-center rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface px-3 text-[12px] font-bold text-it-blue-500 transition-colors motion-reduce:transition-none hover:bg-it-fill active:brightness-95 dark:border-it-blue-900 dark:bg-it-blue-950 dark:text-it-blue-300 dark:hover:bg-it-blue-900"
                        >
                          수정하기
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(g.id, g.name)}
                          className="inline-flex h-8 items-center rounded-w-md border-[1.5px] border-it-red-200 bg-it-surface px-3 text-[12px] font-bold text-it-red-500 transition-colors motion-reduce:transition-none hover:bg-it-red-50 active:brightness-95 dark:border-it-red-500/40 dark:bg-it-blue-950 dark:text-it-red-300 dark:hover:bg-it-red-500/10"
                        >
                          삭제하기
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="h-6" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
