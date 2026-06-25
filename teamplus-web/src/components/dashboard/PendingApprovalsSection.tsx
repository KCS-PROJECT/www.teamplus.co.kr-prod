'use client';

/**
 * PendingApprovalsSection — 코치/감독 홈 승인 대기 배너
 *  - 관리 가능한 팀들의 status=pending 회원 수를 합산해 "N명이 승인 대기 중입니다" 배너로 노출.
 *  - 탭하면 targetPath(기본 /director-approvals, 코치는 /approval)로 이동.
 *  - 0건이면 숨김. 처리 완료된 반려는 포함하지 않는다(대기만 = 처리할 일).
 */

import { useEffect, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';

interface ApiTeamMember {
  id: string;
}

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

interface ApiMembersWrapper<T> {
  total?: number;
  members?: T;
}

// `/teams/:teamId/members` 응답 형태 3종(배열·{members}·{data})을 모두 흡수.
function unwrapMembers(payload: unknown): ApiTeamMember[] {
  if (Array.isArray(payload)) return payload as ApiTeamMember[];
  if (payload && typeof payload === 'object') {
    const wrapped = payload as ApiMembersWrapper<ApiTeamMember[]> &
      ApiDataWrapper<ApiTeamMember[] | ApiMembersWrapper<ApiTeamMember[]>>;
    if (Array.isArray(wrapped.members)) return wrapped.members;
    if (Array.isArray(wrapped.data)) return wrapped.data;
    if (wrapped.data && typeof wrapped.data === 'object') {
      const inner = wrapped.data as ApiMembersWrapper<ApiTeamMember[]>;
      if (Array.isArray(inner.members)) return inner.members;
    }
  }
  return [];
}

interface Props {
  /** 관리 대상 팀 목록 (홈 hero 와 동일 데이터 재사용) */
  teamIds: { id: string; name: string }[];
  /** 데이터 로딩 중 여부 (teamIds 가 아직 안 들어왔을 때 true) */
  isTeamsLoading?: boolean;
  /**
   * "전체 보기" 이동 경로.
   * 기본값: '/director-approvals' (감독). 코치는 본인 전용 '/approval' 로 분기 (C1 fix 2026-05-14).
   */
  targetPath?: string;
  /**
   * [ICETIMES Phase 2] flat 테마. 기본 false = 기존 떠있는 rounded 배너 1:1 보존(회귀 0).
   *   true 시 full-bleed 흰 섹션 안의 it-red attention 행 (DirectorPendingApprovals iceTheme 와 톤 일치).
   */
  iceTheme?: boolean;
}

export function PendingApprovalsSection({
  teamIds,
  isTeamsLoading,
  targetPath = '/director-approvals',
  iceTheme = false,
}: Props) {
  const { navigate } = useNavigation();
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isTeamsLoading) return;
    let cancelled = false;
    (async () => {
      if (teamIds.length === 0) {
        setTotal(0);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const counts = await Promise.all(
        teamIds.map(async (team) => {
          const res = await api.get(`/teams/${team.id}/members`, {
            params: { status: 'pending' },
            retry: false,
          });
          return res.success ? unwrapMembers(res.data).length : 0;
        }),
      );
      if (cancelled) return;
      setTotal(counts.reduce((sum, n) => sum + n, 0));
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamIds, isTeamsLoading]);

  // 승인 대기 0건(또는 로딩 중)이면 배너를 숨긴다 — 처리할 일이 있을 때만 노출.
  if (isTeamsLoading || isLoading || total === 0) return null;

  // ICETIMES flat: 떠있는 rounded 배너 → full-bleed 흰 섹션 안의 it-red attention 행.
  //   카드 박스(rounded/border) 제거, it-red 틴트는 행 배경으로만(주의 강조 1요소).
  //   DirectorPendingApprovals iceTheme 분기와 동일 톤.
  if (iceTheme) {
    return (
      <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
        <button
          type="button"
          onClick={() => navigate(targetPath)}
          className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left bg-it-red-500/[0.07] dark:bg-it-red-500/[0.12] hover:bg-it-red-500/[0.12] transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-red-500"
          aria-label={`${total}명이 승인 대기 중입니다 — 전체 보기`}
        >
          <Icon name="how_to_reg" className="text-[20px] shrink-0 text-it-red-500" aria-hidden="true" />
          <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white">
            {MESSAGES.dashboard.pendingMembersBanner(total)}
          </span>
          <Icon name="chevron_right" className="text-[20px] shrink-0 text-it-red-500" aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <div className="px-4 sm:px-5 pt-3">
      <button
        type="button"
        onClick={() => navigate(targetPath)}
        className="w-full flex items-center gap-2.5 rounded-w-xl bg-flame-500/10 dark:bg-flame-500/15 border border-flame-500/20 dark:border-flame-500/25 px-4 py-3.5 text-left hover:bg-flame-500/[0.14] transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-flame-500"
        aria-label={`${total}명이 승인 대기 중입니다 — 전체 보기`}
      >
        <Icon name="how_to_reg" className="text-[20px] text-flame-500 shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white">
          {MESSAGES.dashboard.pendingMembersBanner(total)}
        </span>
        <Icon name="chevron_right" className="text-[20px] text-flame-500 shrink-0" aria-hidden="true" />
      </button>
    </div>
  );
}
