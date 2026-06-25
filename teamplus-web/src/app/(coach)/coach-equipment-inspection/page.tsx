'use client';

/**
 * 장비 점검 리포트 목록 (코치/감독)
 *
 * - 자기 팀의 점검 이력 조회 (status 필터)
 * - 신규 점검 시작 / 상세 조회 진입
 *
 * Backend: GET /api/v1/equipment-inspections/teams/:teamId
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { listManagedTeams, type TeamListItem } from '@/services/team.service';
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

// 상태 배지 — 완료=초록 · 이상=red · 대기=ink (ICETIMES_ROLLOUT §3)
const STATUS_COLOR: Record<InspectionStatus, string> = {
  pending: 'bg-it-line text-it-ink-700 dark:bg-rink-700 dark:text-wtext-4',
  completed:
    'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  issue_found:
    'bg-it-red-500/10 text-it-red-500 dark:bg-it-red-500/20 dark:text-it-red-500',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function EquipmentInspectionPage() {
  const { user } = useSessionAuth();
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const [teams, setTeams] = useState<TeamListItem[] | null>(null);
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

  // 1) 팀 목록 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listManagedTeams();
      if (cancelled) return;
      if (res.success && res.data) {
        setTeams(res.data);
        if (res.data.length > 0 && !selectedTeamId) {
          setSelectedTeamId(res.data[0].id);
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
    const counts = {
      pending: 0,
      completed: 0,
      issue_found: 0,
    };
    for (const i of inspections) counts[i.status] += 1;
    return counts;
  }, [inspections]);

  const isAuthorized = useMemo(() => {
    const role = (user?.userType ?? '').toString().toUpperCase();
    return ['COACH', 'DIRECTOR', 'ACADEMY_DIRECTOR', 'ADMIN'].includes(role);
  }, [user]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="장비 점검" forceNative />

      <main
        className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck hide-scrollbar !pb-8"
        role="main"
        aria-label="장비 점검 목록"
      >
        {!isAuthorized && (
          <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-4">
            <div className="flex items-start gap-2.5 rounded-w-md bg-it-red-500/10 border-[1.5px] border-it-red-500/30 p-3.5">
              <Icon name="error" className="text-it-red-500 text-card-title shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-card-body text-it-red-500 leading-relaxed">
                장비 점검은 코치/감독만 조회/등록 가능합니다.
              </p>
            </div>
          </section>
        )}

        {/* 팀 선택 — flat 흰 섹션 (칩) */}
        {teams && teams.length > 1 && (
          <>
            <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-4" aria-label="팀 선택">
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTeamId(t.id)}
                    className={cn(
                      'shrink-0 h-9 rounded-w-pill px-4 text-[14px] font-bold border-[1.5px] transition-colors duration-150 ease-ios motion-reduce:transition-none active:brightness-95',
                      selectedTeamId === t.id
                        ? 'bg-it-blue-500 border-it-blue-500 text-white'
                        : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-wtext-4 border-it-line-strong dark:border-rink-700',
                    )}
                  >
                    {t.name ?? '팀'}
                  </button>
                ))}
              </div>
            </section>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
          </>
        )}

        {/* 상태 요약 — flat 흰 섹션 (hairline 구분 3열) */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5" aria-label="점검 상태 요약">
          <div className="grid grid-cols-3 gap-2">
            {(['pending', 'completed', 'issue_found'] as InspectionStatus[]).map(
              (s) => (
                <div
                  key={s}
                  className="rounded-w-md bg-it-fill dark:bg-rink-800 py-3 text-center"
                >
                  <div className="text-card-meta text-it-ink-500 dark:text-wtext-4">
                    {STATUS_LABEL[s]}
                  </div>
                  <div className="mt-1 text-card-section font-extrabold text-it-ink-800 dark:text-white font-num tabular-nums">
                    {statusCounts[s]}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 점검 목록 — flat 흰 섹션 (필터 + hairline 행) */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7" aria-label="점검 리포트 목록">
          {/* 필터 — 컴팩트 inline 토글 */}
          <div
            className="mb-4 flex gap-1 rounded-w-md bg-it-fill dark:bg-rink-800 p-1"
            role="tablist"
            aria-label="상태 필터"
          >
            {(['all', 'pending', 'completed', 'issue_found'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'flex-1 rounded-w-md py-2 text-[13px] font-bold transition-colors duration-150 ease-ios motion-reduce:transition-none',
                  filter === f
                    ? 'bg-it-surface dark:bg-rink-700 text-it-blue-500 shadow-sm'
                    : 'text-it-ink-500 dark:text-wtext-4',
                )}
              >
                {f === 'all' ? '전체' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          {isLoading ? null : inspections.length === 0 ? (
            // 빈 상태 — 1줄 텍스트 + 인라인 링크
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
                <Icon
                  name="construction"
                  className="text-2xl text-it-ink-400 dark:text-wtext-4"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body font-medium text-it-ink-700 dark:text-wtext-4 text-center">
                등록된 점검 리포트가 없습니다.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {inspections.map((ins, idx) => {
                const isLast = idx === inspections.length - 1;
                return (
                  <button
                    key={ins.id}
                    type="button"
                    onClick={() =>
                      navigate(`/coach-equipment-inspection/${ins.id}`)
                    }
                    style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                    className={cn(
                      'w-full py-[14px] text-left transition-colors duration-150 ease-ios motion-reduce:transition-none active:brightness-95',
                      !isLast && 'border-b border-it-line dark:border-rink-700',
                    )}
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
                      <span className="text-card-meta text-it-ink-500 dark:text-wtext-4 font-num tabular-nums">
                        {formatDate(ins.inspectedAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-card-body text-it-ink-700 dark:text-wtext-4">
                      <Icon name="person" className="text-[16px] text-it-blue-500" aria-hidden="true" />
                      <span>{ins.inspector?.firstName ?? '점검자'}</span>
                      {ins.items && (
                        <span className="ml-auto text-it-ink-500 dark:text-wtext-4">
                          항목 {ins.items.length}
                        </span>
                      )}
                    </div>
                    {ins.notes && (
                      <p className="mt-2 text-card-body text-it-ink-500 dark:text-wtext-4 line-clamp-2">
                        {ins.notes}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
