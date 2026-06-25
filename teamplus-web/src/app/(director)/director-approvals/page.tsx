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

// ICETIMES flat — 상태 배지(정규=초록·대기=ink·반려=red SoT)
const STATUS_BADGE_STYLES = {
  approved: {
    label: '승인 완료',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
  rejected: {
    label: '반려',
    className: 'bg-it-red-50 text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-400',
  },
  pending: {
    label: '대기 중',
    className: 'bg-it-line text-it-ink-600 dark:bg-it-blue-900/40 dark:text-it-ink-200',
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
    // ICETIMES flat — 카드 박스 제거. 부모 섹션의 divide-it-line hairline 으로 행 구분.
    <div className="py-4">
      {/* 이름 + 생년월일 + (자녀) + 상태 배지 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
          {record.name}
        </span>
        {ageLabel && (
          <span className="text-[13px] font-medium text-it-ink-500 dark:text-it-ink-300 tabular-nums">
            {ageLabel}
          </span>
        )}
        {record.parentName && record.parentName !== '-' && (
          <span className="text-[13px] font-medium text-it-ink-500 dark:text-it-ink-300">
            (자녀)
          </span>
        )}
        <span
          className={`ml-auto inline-flex items-center rounded-w-pill px-2 py-0.5 text-[12px] font-bold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {/* 부모 (자녀인 경우) */}
      {record.parentName && record.parentName !== '-' && (
        <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-it-ink-500 dark:text-it-ink-300">
          <Icon name="family_restroom" className="text-[13px] text-it-blue-500" aria-hidden="true" />
          부모: {record.parentName}
        </p>
      )}

      {/* 신청·처리 일시 — 한 줄 인라인 */}
      <p className="mt-2 text-[13px] text-it-ink-600 dark:text-it-ink-200 tabular-nums">
        <span className="text-it-ink-400 dark:text-it-ink-300">신청</span> {appliedDateTime}
        {processedDateTime !== '-' && (
          <>
            <span className="mx-1.5 text-it-ink-300 dark:text-it-ink-400" aria-hidden="true">·</span>
            <span className="text-it-ink-400 dark:text-it-ink-300">처리</span> {processedDateTime}
          </>
        )}
      </p>

      {/* 반려 사유 (반려 상태만 표시) — flat inset */}
      {isRejected && record.rejectReason && (
        <div className="mt-2.5 rounded-w-md border border-it-red-100 dark:border-it-red-500/30 bg-it-red-50 dark:bg-it-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <Icon
              name="info"
              className="mt-0.5 shrink-0 text-card-emphasis text-it-red-600 dark:text-it-red-400"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-wider text-it-red-600 dark:text-it-red-400">
                반려 사유
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-it-ink-700 dark:text-it-ink-200">
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
            className="h-10 flex-1 rounded-w-md border-[1.5px] border-it-red-500 text-card-body font-semibold text-it-red-600 transition-colors motion-reduce:transition-none hover:bg-it-red-50 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-it-red-500/40 disabled:cursor-not-allowed disabled:opacity-40 dark:border-it-red-400 dark:text-it-red-400 dark:hover:bg-it-red-500/10"
          >
            반려
          </button>
          <button
            type="button"
            onClick={() => onApprove(record)}
            disabled={busy || isRejected}
            aria-label={`${record.name} 승인`}
            className="h-10 flex-1 rounded-w-md bg-it-blue-500 text-card-body font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            승인
          </button>
        </div>
      )}
    </div>
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
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="회원 승인 내역"
      >
        {isLoading ? null : loadError ? (
          // 에러 — full-bleed 흰 섹션
          <section className="bg-it-surface dark:bg-it-blue-950">
            <div
              className="flex flex-col items-center justify-center py-16 gap-3 px-5"
              role="alert"
            >
              <div className="w-14 h-14 rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15 flex items-center justify-center">
                <Icon
                  name="error_outline"
                  className="text-3xl text-it-red-600 dark:text-it-red-400"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body text-it-ink-500 dark:text-it-ink-300 text-center">
                {MESSAGES.error.network}
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-1 inline-flex items-center gap-1 rounded-w-md bg-it-blue-500 px-4 py-2 text-card-body font-bold text-white hover:bg-it-blue-600 transition-colors motion-reduce:transition-none active:brightness-95"
              >
                <Icon name="refresh" className="text-card-title" aria-hidden="true" />
                {MESSAGES.dashboard.errorRetry}
              </button>
            </div>
          </section>
        ) : displayed.length === 0 ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <EmptyState
              variant="filter"
              title="조회 결과가 없어요"
              description="아직 가입 신청한 회원이 없습니다."
              icon="inbox"
            />
          </section>
        ) : (
          // 회원 목록 — full-bleed 흰 섹션 + hairline 구분 행 (카드 박스 제거)
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7" aria-label="회원 목록">
            <div className="flex items-baseline gap-2 pb-1">
              <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                회원 목록
              </h2>
              <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                {sortedRecords.length}
              </span>
            </div>

            <ul
              className="flex flex-col divide-y divide-it-line dark:divide-it-blue-900"
              role="list"
              aria-label="회원 목록"
            >
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
                className="mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-surface dark:bg-it-blue-950 text-card-body font-semibold text-it-ink-700 dark:text-it-ink-200 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-it-blue-900/40 active:brightness-95"
              >
                <span>더보기</span>
                <Icon
                  name="expand_more"
                  className="text-card-emphasis"
                  aria-hidden="true"
                />
              </button>
            )}
          </section>
        )}
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
              className="h-12 flex-1 rounded-w-md bg-it-fill text-card-title font-semibold text-it-ink-700 transition-colors motion-reduce:transition-none hover:bg-it-line active:brightness-95 dark:bg-it-blue-900/40 dark:text-it-ink-200 dark:hover:bg-it-blue-900/60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void submitReject()}
              disabled={!rejectReason.trim() || busyId === rejectTarget?.id}
              className="h-12 flex-1 rounded-w-md bg-it-red-500 text-card-title font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-red-600 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              반려하기
            </button>
          </div>
        }
      >
        <div className="mt-2">
          <label
            htmlFor="reject-reason"
            className="block text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300 mb-1.5"
          >
            반려 사유 <span className="text-it-red-500 dark:text-it-red-400">*</span>
          </label>
          <textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={MESSAGES.placeholders.enterRejectReason}
            rows={3}
            className="w-full rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-4 py-3 text-card-body text-it-ink-800 placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 resize-none transition-colors motion-reduce:transition-none dark:border-it-blue-900 dark:bg-it-blue-900/40 dark:text-white dark:placeholder:text-it-ink-300"
          />
          {!rejectReason.trim() && (
            <p className="mt-1 text-card-meta text-it-red-500 dark:text-it-red-400">
              반려 사유는 필수 입력입니다.
            </p>
          )}
        </div>
      </BottomSheet>
    </MobileContainer>
  );
}
