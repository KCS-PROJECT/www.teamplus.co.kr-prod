"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import {
  fetchMatchApplicants,
  updateApplicantStatus,
  bulkRejectApplicants,
} from "@/services/matches-api";
import { MESSAGES } from "@/lib/messages";
import {
  MatchApplicantRow,
  MatchProgressBar,
  MatchBulkActionBar,
  MatchRejectDialog,
  MatchErrorState,
  type MatchApplicantRowData,
  type ApplicantStatus,
} from "@/components/match";
import { usePageReady } from '@/hooks/usePageReady';
import type { MatchApplicantsResponse, MatchApplicant } from "@/types/match";
import { devError } from '@/lib/logger';

// ── 변환 ────────────────────────────────────────────────────
function toRowData(applicant: MatchApplicant): MatchApplicantRowData {
  return {
    id: applicant.id,
    name: applicant.user.name || MESSAGES.match.applicants.anonymous,
    position: applicant.position ?? undefined,
    level: applicant.level ?? undefined,
    paymentStatus: applicant.paymentStatus,
    status: applicant.status as ApplicantStatus,
    appliedAt: applicant.appliedAt,
  };
}

// ── 페이지 ──────────────────────────────────────────────────
export default function MatchApplicantsPage() {
  const params = useParams();
  const matchId = (params?.id as string) ?? "";
  const { back } = useNavigation();

  const [data, setData] = useState<MatchApplicantsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // 거절 다이얼로그 상태
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetIds, setRejectTargetIds] = useState<string[]>([]);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const loadApplicants = useCallback(async () => {
    if (!matchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMatchApplicants(matchId);
      setData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadApplicants();
  }, [loadApplicants]);

  const changeStatus = useCallback(
    async (applicantId: string, status: "approved" | "rejected") => {
      setProcessingId(applicantId);
      try {
        await updateApplicantStatus(matchId, applicantId, { status });
        setData((prev) => {
          if (!prev) return prev;
          const nextApplicants = prev.applicants.map((a) =>
            a.id === applicantId ? { ...a, status } : a,
          );
          const approvedCount = nextApplicants.filter(
            (a) => a.status === "approved",
          ).length;
          return { ...prev, applicants: nextApplicants, approvedCount };
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(applicantId);
          return next;
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        devError("[applicants] changeStatus failed", e);
        if (typeof window !== "undefined") {
          window.alert(
            e instanceof Error ? e.message : MESSAGES.match.error.actionFailed,
          );
        }
      } finally {
        setProcessingId(null);
      }
    },
    [matchId],
  );

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pendingApplicants = useMemo(
    () => (data?.applicants ?? []).filter((a) => a.status === "pending"),
    [data],
  );
  const approvedApplicants = useMemo(
    () => (data?.applicants ?? []).filter((a) => a.status === "approved"),
    [data],
  );
  const rejectedApplicants = useMemo(
    () => (data?.applicants ?? []).filter((a) => a.status === "rejected"),
    [data],
  );

  const allPendingSelected =
    pendingApplicants.length > 0 &&
    pendingApplicants.every((a) => selectedIds.has(a.id));

  const selectAllPending = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingApplicants.map((a) => a.id)));
    }
  };

  const approveSelected = async () => {
    setBulkProcessing(true);
    try {
      for (const id of Array.from(selectedIds)) {
        // eslint-disable-next-line no-await-in-loop
        await changeStatus(id, "approved");
      }
      setSelectedIds(new Set());
    } finally {
      setBulkProcessing(false);
    }
  };

  // 다이얼로그 열기 (단일/일괄)
  const openRejectDialog = (ids: string[]) => {
    if (ids.length === 0) return;
    setRejectTargetIds(ids);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async (reason: string) => {
    setRejectSubmitting(true);
    try {
      if (rejectTargetIds.length > 1) {
        // 2명 이상: bulk-reject 엔드포인트 사용 (Phase 2-A 신규)
        await bulkRejectApplicants(matchId, {
          applicantIds: rejectTargetIds,
          rejectionReason: reason,
        });
      } else if (rejectTargetIds.length === 1) {
        // 1명: 단건 PATCH
        await updateApplicantStatus(matchId, rejectTargetIds[0], {
          status: "rejected",
          rejectionReason: reason,
        });
      }

      // 로컬 상태 업데이트
      setData((prev) => {
        if (!prev) return prev;
        const targetSet = new Set(rejectTargetIds);
        const nextApplicants = prev.applicants.map((a) =>
          targetSet.has(a.id)
            ? { ...a, status: "rejected" as ApplicantStatus }
            : a,
        );
        const approvedCount = nextApplicants.filter(
          (a) => a.status === "approved",
        ).length;
        return { ...prev, applicants: nextApplicants, approvedCount };
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rejectTargetIds.forEach((id) => next.delete(id));
        return next;
      });
      setRejectDialogOpen(false);
      setRejectTargetIds([]);
    } catch (e) {
      // eslint-disable-next-line no-console
      devError("[applicants] reject failed", e);
      if (typeof window !== "undefined") {
        window.alert(
          e instanceof Error ? e.message : MESSAGES.match.error.rejectFailed,
        );
      }
    } finally {
      setRejectSubmitting(false);
    }
  };

  // 선택된 ID → 신청자 이름 리스트 (다이얼로그 표시용)
  const rejectTargetNames = useMemo(() => {
    if (!data) return [];
    return rejectTargetIds.map((id) => {
      const applicant = data.applicants.find((a) => a.id === id);
      return applicant
        ? applicant.user.name || MESSAGES.match.applicants.anonymous
        : MESSAGES.common.unknown;
    });
  }, [data, rejectTargetIds]);

  // ── 데이터 로딩 ──
  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar
          title={MESSAGES.match.applicants.title}
          onBack={() => back()}
          forceNative
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-ice-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    );
  }

  // ── 에러 ──
  if (error || !data) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar
          title={MESSAGES.match.applicants.title}
          onBack={() => back()}
          forceNative
        />
        <MatchErrorState
          message={error ?? MESSAGES.error.general}
          onRetry={loadApplicants}
        />
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title={MESSAGES.match.applicants.title}
        onBack={() => back()}
        forceNative
      />

      <main className="flex-1 overflow-y-auto pb-30">
        {/* 매치 요약 */}
        <section className="p-4">
          <div className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center shrink-0">
                <Icon name="sports_hockey" className="text-ice-500 text-xl" />
              </div>
              <div>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                  {MESSAGES.match.applicants.listTitle}
                </p>
                <p className="font-bold text-wtext-1 dark:text-white">
                  {MESSAGES.match.applicants.summary(
                    data.approvedCount,
                    data.totalSlots,
                  )}
                </p>
              </div>
              <span className="ml-auto text-card-meta font-semibold text-amber-600 dark:text-amber-400">
                {MESSAGES.match.applicants.remaining(
                  Math.max(0, data.totalSlots - data.approvedCount),
                )}
              </span>
            </div>
            <MatchProgressBar
              current={data.approvedCount}
              total={data.totalSlots}
            />
          </div>
        </section>

        {/* 대기 중 섹션 */}
        {pendingApplicants.length > 0 && (
          <section className="px-4 pt-4 pb-2">
            <h2 className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider mb-3">
              {MESSAGES.match.applicants.pending} ({pendingApplicants.length})
            </h2>
            <div className="space-y-3">
              {pendingApplicants.map((applicant) => (
                <MatchApplicantRow
                  key={applicant.id}
                  data={toRowData(applicant)}
                  selected={selectedIds.has(applicant.id)}
                  onToggleSelect={() => toggleSelect(applicant.id)}
                  processing={processingId === applicant.id || bulkProcessing}
                  onApprove={() => changeStatus(applicant.id, "approved")}
                  onReject={() => openRejectDialog([applicant.id])}
                />
              ))}
            </div>
          </section>
        )}

        {/* 승인됨 섹션 */}
        {approvedApplicants.length > 0 && (
          <section className="px-4 pt-4 pb-2">
            <h2 className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider mb-3">
              {MESSAGES.match.applicants.approved} ({approvedApplicants.length})
            </h2>
            <div className="space-y-3">
              {approvedApplicants.map((applicant) => (
                <MatchApplicantRow
                  key={applicant.id}
                  data={toRowData(applicant)}
                  readOnly
                />
              ))}
            </div>
          </section>
        )}

        {/* 거절 섹션 */}
        {rejectedApplicants.length > 0 && (
          <section className="px-4 pt-4 pb-2">
            <h2 className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider mb-3">
              {MESSAGES.match.applicants.rejected} ({rejectedApplicants.length})
            </h2>
            <div className="space-y-3">
              {rejectedApplicants.map((applicant) => (
                <MatchApplicantRow
                  key={applicant.id}
                  data={toRowData(applicant)}
                  readOnly
                />
              ))}
            </div>
          </section>
        )}

        {/* 빈 상태 */}
        {data.applicants.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="person_search" className="text-5xl text-wtext-4" />
            <p className="text-card-body text-wtext-3">{MESSAGES.empty("신청자")}</p>
          </div>
        )}
      </main>

      {/* Sticky bottom 일괄 액션 바 (Phase 2-B) */}
      {pendingApplicants.length > 0 && (
        <MatchBulkActionBar
          selectedCount={selectedIds.size}
          totalCount={pendingApplicants.length}
          onSelectAll={selectAllPending}
          onBulkApprove={approveSelected}
          onBulkReject={() => openRejectDialog(Array.from(selectedIds))}
          isProcessing={bulkProcessing}
        />
      )}

      {/* 거절 사유 다이얼로그 */}
      <MatchRejectDialog
        isOpen={rejectDialogOpen}
        onClose={() => !rejectSubmitting && setRejectDialogOpen(false)}
        onConfirm={handleRejectConfirm}
        applicantNames={rejectTargetNames}
        isSubmitting={rejectSubmitting}
      />
    </MobileContainer>
  );
}
