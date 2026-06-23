'use client';

/**
 * DirectorPendingApprovals — 감독 홈 승인 대기 배너 (2026-05-09 → 2026-06-18 배너화)
 *  - 관리 팀들의 status=pending 회원 수를 합산해 "N명이 승인 대기 중입니다" 배너로 노출.
 *  - 탭하면 /director-approvals 로 이동. 0건이면 숨김.
 *  - 반려(rejected)는 이미 처리 완료 + 영구 잔존이라 제외 — 대기만 = 실제 처리할 일.
 *
 * 데이터 의존: 기존 API `/teams/:id/members?status=pending`.
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
  members?: T;
}

interface Props {
  teamIds: { id: string; name: string }[];
  isTeamsLoading: boolean;
}

function unwrapMembers(payload: unknown): ApiTeamMember[] {
  if (Array.isArray(payload)) return payload as ApiTeamMember[];
  if (payload && typeof payload === 'object') {
    const w = payload as ApiDataWrapper<ApiTeamMember[]>;
    if (Array.isArray(w.members)) return w.members;
    if (Array.isArray(w.data)) return w.data;
    if (w.data && typeof w.data === 'object') {
      const inner = w.data as ApiDataWrapper<ApiTeamMember[]>;
      if (Array.isArray(inner.members)) return inner.members;
    }
  }
  return [];
}

export function DirectorPendingApprovals({ teamIds, isTeamsLoading }: Props) {
  const { navigate } = useNavigation();
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isTeamsLoading) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      if (teamIds.length === 0) {
        if (!cancelled) {
          setTotal(0);
          setIsLoading(false);
        }
        return;
      }
      // 승인 대기(pending)만 조회 — 반려는 처리 완료 상태라 대시보드 알림에서 제외.
      const counts = await Promise.all(
        teamIds.map(async (team) => {
          const res = await api.get(`/teams/${team.id}/members?status=pending`, {
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

  if (isTeamsLoading || isLoading) return null;
  // 승인 대기 0건이면 배너를 숨긴다 — 처리할 일이 있을 때만 노출.
  if (total === 0) return null;

  return (
    <div className="px-4 sm:px-5 pt-3">
      <button
        type="button"
        onClick={() => navigate('/director-approvals')}
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

export default DirectorPendingApprovals;
