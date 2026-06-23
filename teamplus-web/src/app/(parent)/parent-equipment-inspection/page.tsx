'use client';

/**
 * 장비 점검 조회 (학부모)
 *
 * - 자녀가 소속된 팀(들)의 점검 이력만 read-only 조회
 * - 상세 페이지로 진입은 가능 (수정/삭제 권한 없음)
 *
 * Backend: GET /api/v1/equipment-inspections/teams/:teamId
 * (백엔드는 PARENT 역할 조회 허용 — equipment-inspection.controller.ts @Roles)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { listParentVisibleTeams } from '@/services/team.service';
import type { ParentChildTeamItem } from '@/services/team.service';
import {
  equipmentInspectionService,
  type EquipmentInspection,
  type InspectionStatus,
} from '@/services/equipment-inspection.service';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<InspectionStatus, string> = {
  pending: '진행 중',
  completed: '완료',
  issue_found: '이상 발견',
};

const STATUS_COLOR: Record<InspectionStatus, string> = {
  pending: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  completed:
    'bg-emerald-50 text-mint-500 dark:bg-emerald-900/30 dark:text-mint-500',
  issue_found:
    'bg-flame-100 text-flame-500 dark:bg-flame-500/20 dark:text-flame-100',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function ParentEquipmentInspectionPage() {
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const [teams, setTeams] = useState<ParentChildTeamItem[] | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [inspections, setInspections] = useState<EquipmentInspection[]>([]);
  const [filter, setFilter] = useState<InspectionStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });
  usePageReady(!isLoading);

  // 1) 자녀 소속 팀 목록 로드 (학부모 전용 엔드포인트)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listParentVisibleTeams();
      if (cancelled) return;
      if (res.success && res.data) {
        const myChildTeams = res.data.myChildTeams ?? [];
        setTeams(myChildTeams);
        if (myChildTeams.length > 0 && !selectedTeamId) {
          setSelectedTeamId(myChildTeams[0].id);
        } else if (myChildTeams.length === 0) {
          setIsLoading(false);
        }
      } else {
        setTeams([]);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  // 2) 선택 팀의 점검 리포트 로드
  const loadInspections = useCallback(async () => {
    if (!selectedTeamId) {
      setInspections([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const res = await equipmentInspectionService.list(selectedTeamId, {
      status: filter === 'all' ? undefined : filter,
      limit: 50,
    });
    if (res.success && res.data) {
      setInspections(res.data.data);
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.network);
      setInspections([]);
    }
    setIsLoading(false);
  }, [selectedTeamId, filter, toast]);

  useEffect(() => {
    void loadInspections();
  }, [loadInspections]);

  const statusCounts = useMemo(() => {
    const counts = { pending: 0, completed: 0, issue_found: 0 };
    for (const i of inspections) counts[i.status] += 1;
    return counts;
  }, [inspections]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="장비 점검 현황" forceNative />

      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-24 hide-scrollbar">
        {/* 자녀가 어디 팀에도 속해있지 않은 경우 안내 */}
        {teams && teams.length === 0 && (
          <div className="rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-6 text-center">
            <Icon
              name="construction"
              className="text-3xl text-wtext-3 dark:text-rink-300 mx-auto mb-2"
              aria-hidden="true"
            />
            <p className="text-card-body text-wtext-2 dark:text-rink-100 mb-1">
              자녀가 소속된 팀이 없습니다.
            </p>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300">
              자녀의 팀 가입이 완료되면 점검 이력이 표시됩니다.
            </p>
          </div>
        )}

        {/* 팀 선택 */}
        {teams && teams.length > 1 && (
          <div className="mb-3 flex gap-2 overflow-x-auto hide-scrollbar">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTeamId(t.id)}
                className={cn(
                  'shrink-0 rounded-w-pill px-3 py-1.5 text-card-body font-bold transition-colors',
                  selectedTeamId === t.id
                    ? 'bg-ice-500 text-white'
                    : 'bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border border-wline dark:border-rink-700',
                )}
              >
                {t.name ?? '팀'}
              </button>
            ))}
          </div>
        )}

        {/* 상태 요약 */}
        {teams && teams.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            {(['pending', 'completed', 'issue_found'] as InspectionStatus[]).map(
              (s) => (
                <div
                  key={s}
                  className="rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-3 text-center"
                >
                  <div className="text-card-meta text-wtext-3 dark:text-rink-300">
                    {STATUS_LABEL[s]}
                  </div>
                  <div className="mt-1 text-card-section font-extrabold text-wtext-1 dark:text-white tabular-nums">
                    {statusCounts[s]}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {/* 필터 */}
        {teams && teams.length > 0 && (
          <div className="mb-3 flex gap-2">
            {(['all', 'pending', 'completed', 'issue_found'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'flex-1 rounded-w-md py-2 text-card-body font-bold transition-colors',
                  filter === f
                    ? 'bg-ice-500 text-white'
                    : 'bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border border-wline dark:border-rink-700',
                )}
              >
                {f === 'all' ? '전체' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        )}

        {/* 리스트 */}
        {teams && teams.length > 0 && (
          isLoading ? (
            <div className="py-12 text-center text-wtext-3">불러오는 중…</div>
          ) : inspections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name="construction"
                  className="text-2xl text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-title text-wtext-3 dark:text-rink-300">
                등록된 점검 리포트가 없습니다.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {inspections.map((ins) => (
                <li key={ins.id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/parent-equipment-inspection/${ins.id}`)
                    }
                    className="w-full rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-4 text-left transition-colors hover:bg-wline-2/40 dark:hover:bg-rink-700/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'rounded-w-pill px-2 py-0.5 text-card-meta font-bold',
                          STATUS_COLOR[ins.status],
                        )}
                      >
                        {STATUS_LABEL[ins.status]}
                      </span>
                      <span className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
                        {formatDate(ins.inspectedAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-card-body text-wtext-2 dark:text-rink-100">
                      <Icon name="person" className="text-[16px]" aria-hidden="true" />
                      <span>{ins.inspector?.firstName ?? '점검자'}</span>
                      {ins.items && (
                        <span className="ml-auto text-wtext-3">
                          항목 {ins.items.length}
                        </span>
                      )}
                    </div>
                    {ins.notes && (
                      <p className="mt-2 text-card-body text-wtext-3 dark:text-rink-300 line-clamp-2">
                        {ins.notes}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </main>
    </MobileContainer>
  );
}
