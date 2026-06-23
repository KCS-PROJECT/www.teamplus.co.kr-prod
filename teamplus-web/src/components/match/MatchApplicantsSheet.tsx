'use client';

/**
 * MatchApplicantsSheet — 매치 신청자 관리 BottomSheet
 *
 * 등록된 매치 카드의 "신청자" 버튼에서 열린다.
 * - 데이터: GET /matches/:id/applicants ({ totalSlots, approvedCount, applicants })
 * - 승인/거절: PATCH /matches/:id/applicants/:applicantId { status }
 * - 자체 fetch + 처리. 변경 시 onChanged 로 부모(목록 정원) 갱신 트리거.
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

interface Applicant {
  id: string;
  position?: string | null;
  level?: string | null;
  status: string; // pending | approved | rejected
  user?: { id: string; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null } | null;
}

interface ApplicantsResponse {
  matchId: string;
  totalSlots: number;
  approvedCount: number;
  applicants: Applicant[];
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  approved: { label: '승인됨', cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  rejected: { label: '거절됨', cls: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300' },
  pending: { label: '대기 중', cls: 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100' },
};

export function MatchApplicantsSheet({
  isOpen,
  onClose,
  matchId,
  onChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  matchId: string | null;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<ApplicantsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!matchId) return;
    setIsLoading(true);
    try {
      const res = await api.get<ApplicantsResponse>(`/matches/${matchId}/applicants`);
      setData(
        res.success && res.data
          ? res.data
          : { matchId, totalSlots: 0, approvedCount: 0, applicants: [] },
      );
    } catch {
      toast.error(MESSAGES.matchManage.applicantsLoadFailed);
      setData({ matchId, totalSlots: 0, approvedCount: 0, applicants: [] });
    } finally {
      setIsLoading(false);
    }
  }, [matchId, toast]);

  useEffect(() => {
    if (isOpen && matchId) void load();
  }, [isOpen, matchId, load]);

  const handleStatus = async (applicantId: string, status: 'approved' | 'rejected') => {
    if (!matchId) return;
    setBusyId(applicantId);
    try {
      const res = await api.patch(`/matches/${matchId}/applicants/${applicantId}`, { status });
      if (res.success) {
        toast.success(
          status === 'approved'
            ? MESSAGES.matchManage.applicantApproved
            : MESSAGES.matchManage.applicantRejected,
        );
        await load();
        onChanged?.();
      } else {
        toast.error(res.error?.message ?? MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setBusyId(null);
    }
  };

  const fullName = (a: Applicant) =>
    `${a.user?.lastName ?? ''}${a.user?.firstName ?? ''}`.trim() || '이름 미정';

  const applicants = data?.applicants ?? [];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="신청자 관리">
      <div className="flex flex-col gap-4">
        {/* 정원 요약 */}
        {data && (
          <div className="flex items-center justify-between rounded-xl bg-wbg dark:bg-rink-700/50 px-4 py-3">
            <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
              승인 인원
            </span>
            <span className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
              {data.approvedCount}/{data.totalSlots}명
            </span>
          </div>
        )}

        {/* 목록 */}
        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Icon name="progress_activity" className="text-3xl text-wtext-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </div>
        ) : applicants.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center">
            <Icon name="group_off" className="text-[40px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            <p className="mt-3 text-card-body font-semibold text-wtext-2 dark:text-rink-100">
              {MESSAGES.matchManage.applicantsEmpty}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {applicants.map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META.pending;
              const isBusy = busyId === a.id;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-3"
                >
                  <div className="size-10 shrink-0 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center overflow-hidden">
                    {a.user?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={a.user.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <Icon name="person" className="text-xl text-wtext-3" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                      {fullName(a)}
                    </p>
                    <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                      {[a.position, a.level].filter(Boolean).join(' · ') || '정보 없음'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-w-pill px-2 py-1 text-[10px] font-bold ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {a.status !== 'approved' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleStatus(a.id, 'approved')}
                        aria-label={`${fullName(a)} 승인`}
                        className="h-9 px-3 rounded-lg bg-ice-500 hover:bg-ice-700 text-white text-card-meta font-bold transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
                      >
                        승인
                      </button>
                    )}
                    {a.status !== 'rejected' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleStatus(a.id, 'rejected')}
                        aria-label={`${fullName(a)} 거절`}
                        className="h-9 px-3 rounded-lg bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 text-card-meta font-bold hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        거절
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

export default MatchApplicantsSheet;
