"use client";

/**
 * /team/[id]/groups — 팀 하위 그룹 목록
 *
 * 감독·코치가 팀 안에 만든 하위 그룹(예: 선수반 A조)을 보여준다.
 * 같은 페이지에서 "그룹 만들기" 버튼으로 /team/[id]/groups/create 진입.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
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

  // [수정 2026-05-14] 컨테이너를 <main> 랜드마크로 변경 → MobileContainer 의
  //  `[&>main]:pb-30` 자동 BottomNav 여백 규칙 적용 + 시맨틱/A11y 보강.
  //  flex-1 overflow-y-auto 로 자연 스크롤 보장 (groups/create 와 동일 패턴).
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title={MESSAGES.team.groupListTitle}
        onBack={() => router.back()}
        forceNative
      />

      <main
        className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 space-y-4 hide-scrollbar"
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label={MESSAGES.team.groupListTitle}
      >
        {/* 액션 — 감독/코치만 그룹 생성 가능 */}
        {canManage && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/team/${teamId}/groups/create`)}
              className="bg-blue-700 text-white text-w-small font-bold px-4 py-2.5 rounded-lg hover:bg-blue-800 transition-colors"
            >
              + {MESSAGES.team.groupCreateButton}
            </button>
          </div>
        )}

        {/* 에러 */}
        {!isLoading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-w-small text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* 비어있음 */}
        {!isLoading && !error && groups.length === 0 && (
          <div className="rounded-2xl border border-wline bg-white p-10 text-center dark:border-rink-700 dark:bg-rink-800">
            <p className="text-w-small text-wtext-3 dark:text-rink-300">
              {MESSAGES.team.groupListEmpty}
            </p>
          </div>
        )}

        {/* 목록 */}
        {!isLoading && !error && groups.length > 0 && (
          <ul className="space-y-3">
            {groups.map((g) => (
              <li
                key={g.id}
                className="rounded-2xl border border-wline bg-white p-4 dark:border-rink-700 dark:bg-rink-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-w-body-lg font-bold text-wtext-1 dark:text-white truncate">
                        {g.name}
                      </h3>
                      {/* [2026-06-05] 출생연도(4자리)만 "년생" 으로 표시. 레거시 U8~U12 배지는 숨김. */}
                      {g.ageGroup && /^\d{4}$/.test(g.ageGroup) && (
                        <span className="inline-flex items-center text-w-caption font-bold bg-blue-100 text-ice-500 px-2 py-0.5 rounded dark:bg-blue-900/40 dark:text-blue-300">
                          {g.ageGroup}년생
                        </span>
                      )}
                    </div>
                    <p className="text-w-caption text-wtext-3 dark:text-rink-300 mt-1">
                      {MESSAGES.team.groupMemberCountLabel(g._count.members)}
                    </p>
                  </div>
                  {canManage && (
                    <div className="shrink-0 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/team/${teamId}/groups/${g.id}/edit`)
                        }
                        className="text-w-caption font-semibold text-ice-500 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      >
                        수정하기
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(g.id, g.name)}
                        className="text-w-caption font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                      >
                        삭제하기
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </MobileContainer>
  );
}
