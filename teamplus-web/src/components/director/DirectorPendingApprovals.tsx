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
import { cn } from '@/lib/utils';
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
  /**
   * [ICETIMES Phase 2b] ICETIMES flat 테마. 기본 false = 기존 스타일 그대로.
   *   true 시 승인 대기 배너 강조색 flame → it-red 로 통일(주의 강조).
   */
  iceTheme?: boolean;
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

export function DirectorPendingApprovals({ teamIds, isTeamsLoading, iceTheme = false }: Props) {
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

  // ICETIMES flat: 떠 있는 rounded 카드 → full-bleed 흰 섹션 안의 attention 행.
  //   카드 박스(rounded/border) 제거, it-red 틴트는 행 배경으로만 유지(주의 강조 1요소).
  //   기본 테마는 기존 rounded 배너 유지(픽셀 동일 — 타 역할 회귀 0).
  if (iceTheme) {
    return (
      <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
        <button
          type="button"
          onClick={() => navigate('/director-approvals')}
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
        onClick={() => navigate('/director-approvals')}
        className={cn(
          'w-full flex items-center gap-2.5 rounded-w-xl border px-4 py-3.5 text-left transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2',
          'bg-flame-500/10 dark:bg-flame-500/15 border-flame-500/20 dark:border-flame-500/25 hover:bg-flame-500/[0.14] focus-visible:ring-flame-500',
        )}
        aria-label={`${total}명이 승인 대기 중입니다 — 전체 보기`}
      >
        <Icon name="how_to_reg" className="text-[20px] shrink-0 text-flame-500" aria-hidden="true" />
        <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white">
          {MESSAGES.dashboard.pendingMembersBanner(total)}
        </span>
        <Icon name="chevron_right" className="text-[20px] shrink-0 text-flame-500" aria-hidden="true" />
      </button>
    </div>
  );
}

export default DirectorPendingApprovals;
