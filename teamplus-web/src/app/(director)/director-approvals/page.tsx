'use client';

/**
 * 회원 승인 내역 (감독 전용)
 * ──────────────────────────────────────────────────
 * [2026-06-18 개편] 단일 통합 목록 — 모드 토글(처리 이력)·대기/승인 필터 탭·이력 기간/상태 필터 제거.
 *   대기/승인/반려 전체 회원을 한 목록에 노출(대기 우선 정렬)하고, 각 선수 카드에서 직접
 *   '승인'/'반려'를 선택할 수 있게 한다. 현재 상태와 같은 액션 버튼은 비활성화.
 *
 * 상태 관리는 useDirectorApprovals 커스텀 훅에 위임 (allRecords + approveById/rejectById 단건 처리).
 */

import { useCallback, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBirthDateLabel } from '@/components/shared';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';
import {
  useDirectorApprovals,
  type ApprovalRecord,
} from '@/hooks/useDirectorApprovals';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_BADGE_STYLES = {
  approved: {
    label: '승인 완료',
    className: 'bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-500',
  },
  rejected: {
    label: '반려',
    className: 'bg-flame-100 text-flame-700 dark:bg-flame-500/15 dark:text-flame-500',
  },
  pending: {
    label: '대기 중',
    className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-wtext-4',
  },
} as const;

const PAGE_SIZE = 20;

/**
 * 날짜+시간을 "2026.05.14 21:35" 컴팩트 포맷으로 출력.
 * 좁은 화면(App webview 360~414px) 가독성 확보용.
 */
function formatDateTimeCompact(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

// ---------------------------------------------------------------------------
// MemberApprovalCard — 상태 표시 + 카드별 승인/반려 액션
// ---------------------------------------------------------------------------

function MemberApprovalCard({
  record,
  busy,
  onApprove,
  onReject,
}: {
  record: ApprovalRecord;
  busy: boolean;
  onApprove: (r: ApprovalRecord) => void;
  onReject: (r: ApprovalRecord) => void;
}) {
  const badge = STATUS_BADGE_STYLES[record.status];
  const appliedDateTime = formatDateTimeCompact(record.appliedAt);
  const processedDateTime = formatDateTimeCompact(record.processedAt);

  // 생년월일 우선("2015.03.21"), 없으면 출생연도("2015년생"), 그래도 없으면 나이("8세").
  const ageLabel =
    formatBirthDateLabel(record.birthDate) ??
    (typeof record.birthYear === 'number'
      ? `${record.birthYear}년생`
      : typeof record.age === 'number'
        ? `${record.age}세`
        : undefined);

  const isApproved = record.status === 'approved';
  const isRejected = record.status === 'rejected';

  return (
    <article className="overflow-hidden rounded-w-lg border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 shadow-sh-1">
      <div className="p-4">
        {/* 이름 + 생년월일 + (자녀) + 상태 배지 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-card-title font-bold text-wtext-1 dark:text-white">
            {record.name}
          </span>
          {ageLabel && (
            <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 tabular-nums">
              {ageLabel}
            </span>
          )}
          {record.parentName && record.parentName !== '-' && (
            <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
              (자녀)
            </span>
          )}
          <span
            className={`ml-auto inline-flex items-center rounded-w-pill px-2 py-0.5 text-card-meta font-bold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        {/* 부모 (자녀인 경우) */}
        {record.parentName && record.parentName !== '-' && (
          <p className="mt-1 inline-flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300">
            <Icon name="family_restroom" className="text-[13px]" aria-hidden="true" />
            부모: {record.parentName}
          </p>
        )}

        {/* 신청·처리 일시 — 한 줄 인라인 */}
        <p className="mt-2 text-card-meta text-wtext-2 dark:text-rink-100 tabular-nums">
          <span className="text-wtext-3 dark:text-rink-400">신청</span> {appliedDateTime}
          {processedDateTime !== '-' && (
            <>
              <span className="mx-1.5 text-wtext-4 dark:text-rink-500" aria-hidden="true">·</span>
              <span className="text-wtext-3 dark:text-rink-400">처리</span> {processedDateTime}
            </>
          )}
        </p>

        {/* 반려 사유 (반려 상태만 표시) */}
        {isRejected && record.rejectReason && (
          <div className="mt-2.5 rounded-w-md border border-flame-100 dark:border-flame-500/30 bg-flame-100/40 dark:bg-flame-500/10 p-3">
            <div className="flex items-start gap-2">
              <Icon
                name="info"
                className="mt-0.5 shrink-0 text-card-emphasis text-flame-700 dark:text-flame-500"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-card-meta font-bold uppercase tracking-wider text-flame-700 dark:text-flame-500">
                  반려 사유
                </p>
                <p className="mt-0.5 text-card-meta leading-relaxed text-wtext-2 dark:text-rink-100">
                  {record.rejectReason}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 카드별 액션 — 반려 / 승인. [2026-06-18]
            · 이미 '승인 완료'된 회원: 액션 버튼 숨김(재처리 불필요).
            · '반려'된 회원: 반려/승인 둘 다 비활성화 — 부모가 '다시 신청'해서 '대기'로 돌아와야 승인 가능.
            · '대기' 회원만 반려/승인 모두 활성. */}
        {!isApproved && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onReject(record)}
              disabled={busy || isRejected}
              aria-label={`${record.name} 반려`}
              className="h-10 flex-1 rounded-w-md border border-flame-500 text-card-body font-semibold text-flame-600 transition-colors motion-reduce:transition-none hover:bg-flame-100 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-flame-500/40 disabled:cursor-not-allowed disabled:opacity-40 dark:border-flame-500 dark:text-flame-500 dark:hover:bg-flame-500/10"
            >
              반려
            </button>
            <button
              type="button"
              onClick={() => onApprove(record)}
              disabled={busy || isRejected}
              aria-label={`${record.name} 승인`}
              className="h-10 flex-1 rounded-w-md bg-ice-500 text-card-body font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-ice-600 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-ice-500/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              승인
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DirectorApprovalsPage() {
  const { toast } = useToast();
  const { allRecords, isLoading, loadError, approveById, rejectById, refresh } =
    useDirectorApprovals();

  usePageReady(!isLoading);

  // 정렬 — 대기(처리 필요) 우선, 그 다음 처리/신청 일시 최신순.
  const sortedRecords = useMemo(() => {
    const rank = (s: ApprovalRecord['status']) => (s === 'pending' ? 0 : 1);
    return [...allRecords].sort((a, b) => {
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      const ad = new Date(a.processedAt ?? a.appliedAt ?? 0).getTime();
      const bd = new Date(b.processedAt ?? b.appliedAt ?? 0).getTime();
      return bd - ad;
    });
  }, [allRecords]);

  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const displayed = sortedRecords.slice(0, displayCount);
  const hasMore = sortedRecords.length > displayCount;

  // 카드별 처리 중 busy 표시 + 반려 사유 시트 대상.
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = useCallback(
    async (record: ApprovalRecord) => {
      setBusyId(record.id);
      try {
        await approveById(record.id);
        toast.success(MESSAGES.approvalExt.approveSuccess);
      } catch {
        toast.error(MESSAGES.error.general);
      } finally {
        setBusyId(null);
      }
    },
    [approveById, toast],
  );

  const openReject = useCallback((record: ApprovalRecord) => {
    setRejectReason('');
    setRejectTarget(record);
  }, []);

  const submitReject = useCallback(async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error(MESSAGES.directorApproval.rejectReasonRequired);
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      await rejectById(rejectTarget.id, rejectReason.trim());
      toast.success(MESSAGES.approvalExt.rejectSuccess);
      setRejectTarget(null);
      setRejectReason('');
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setBusyId(null);
    }
  }, [rejectTarget, rejectReason, rejectById, toast]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="회원 승인 내역" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-rink-900"
        role="main"
        aria-label="회원 승인 내역"
      >
        <div className="p-4 space-y-3">
          {isLoading ? null : loadError ? (
            <div
              className="flex flex-col items-center justify-center py-16 gap-3"
              role="alert"
            >
              <div className="w-14 h-14 rounded-w-pill bg-flame-100 dark:bg-flame-500/15 flex items-center justify-center">
                <Icon
                  name="error_outline"
                  className="text-3xl text-flame-700 dark:text-flame-500"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center">
                {MESSAGES.error.network}
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-1 inline-flex items-center gap-1 rounded-w-md bg-ice-500 px-4 py-2 text-card-body font-bold text-white hover:bg-ice-600 transition-colors motion-reduce:transition-none active:brightness-95"
              >
                <Icon name="refresh" className="text-card-title" aria-hidden="true" />
                {MESSAGES.dashboard.errorRetry}
              </button>
            </div>
          ) : displayed.length === 0 ? (
            <EmptyState
              variant="filter"
              title="조회 결과가 없어요"
              description="아직 가입 신청한 회원이 없습니다."
              icon="inbox"
            />
          ) : (
            <>
              <ul className="space-y-3" role="list" aria-label="회원 목록">
                {displayed.map((record) => (
                  <li key={record.id}>
                    <MemberApprovalCard
                      record={record}
                      busy={busyId === record.id}
                      onApprove={handleApprove}
                      onReject={openReject}
                    />
                  </li>
                ))}
              </ul>

              {hasMore && (
                <button
                  type="button"
                  onClick={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
                  className="flex h-12 w-full items-center justify-center gap-1.5 rounded-w-lg border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 text-card-body font-semibold text-wtext-2 dark:text-rink-100 shadow-sh-1 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95"
                >
                  <span>더보기</span>
                  <Icon
                    name="expand_more"
                    className="text-card-emphasis"
                    aria-hidden="true"
                  />
                </button>
              )}
            </>
          )}
        </div>
      </main>

      {/* 반려 시트 — 공통 BottomSheet + 사유 입력 (단건) */}
      <BottomSheet
        isOpen={rejectTarget !== null}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason('');
        }}
        title={rejectTarget ? `${rejectTarget.name} 반려` : '반려'}
        footer={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
              className="h-12 flex-1 rounded-w-md bg-wbg text-card-title font-semibold text-wtext-2 transition-colors motion-reduce:transition-none hover:bg-wline-2 active:brightness-95 dark:bg-rink-700/40 dark:text-rink-100 dark:hover:bg-rink-700/60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void submitReject()}
              disabled={!rejectReason.trim() || busyId === rejectTarget?.id}
              className="h-12 flex-1 rounded-w-md bg-flame-600 text-card-title font-semibold text-white transition-colors motion-reduce:transition-none hover:brightness-95 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              반려하기
            </button>
          </div>
        }
      >
        <div className="mt-2">
          <label
            htmlFor="reject-reason"
            className="block text-card-meta font-bold text-wtext-3 dark:text-rink-300 mb-1.5"
          >
            반려 사유 <span className="text-flame-700 dark:text-flame-500">*</span>
          </label>
          <textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={MESSAGES.placeholders.enterRejectReason}
            rows={3}
            className="w-full rounded-w-md border border-wline bg-wbg px-4 py-3 text-card-body text-wtext-1 placeholder:text-wtext-4 focus:outline-none focus:ring-2 focus:ring-ice-500/40 focus:border-ice-500 resize-none transition-colors motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-700/40 dark:text-white dark:placeholder:text-wtext-3"
          />
          {!rejectReason.trim() && (
            <p className="mt-1 text-card-meta text-flame-700 dark:text-flame-500">
              반려 사유는 필수 입력입니다.
            </p>
          )}
        </div>
      </BottomSheet>
    </MobileContainer>
  );
}
