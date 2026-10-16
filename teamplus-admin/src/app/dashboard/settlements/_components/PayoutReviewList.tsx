'use client';

/**
 * PayoutReviewList - 결과 조회가 운영자 확인(needsReview)을 켠 지급 요청 목록 + 확인 완료(메모 필수)
 *
 * 정산 상세 팝업의 지급 요청 이력 위에 놓인다. 닫는 것은 운영자뿐이고, 닫아도 정산·요청 상태와 돈은 바뀌지 않는다.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MESSAGES } from '@/lib/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/services/api-client';
import { getApiErrorMessage } from '@/lib/api-error';
import { isoToKstDateTimeLabel } from '@/lib/kst-date';
import { getPayoutRequestStatusMeta, type PayoutRequestInfo } from './payoutRequestMeta';

function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return MESSAGES.settlementDynamic.amountWon(value.toLocaleString());
}

interface PayoutReviewListProps {
  /** needsReview 가 켜진 요청만 넘긴다 */
  requests: PayoutRequestInfo[];
  /** 확인 완료가 끝난 뒤 — 부모가 상세·목록을 다시 불러온다. */
  onResolved: () => void;
  onError: (message: string) => void;
}

export function PayoutReviewList({ requests, onResolved, onError }: PayoutReviewListProps) {
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [memoErrors, setMemoErrors] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleResolve = async (request: PayoutRequestInfo) => {
    const memo = (memos[request.id] ?? '').trim();
    if (memo.length === 0) {
      setMemoErrors((prev) => ({ ...prev, [request.id]: MESSAGES.settlement.reviewMemoRequired }));
      return;
    }
    setMemoErrors((prev) => ({ ...prev, [request.id]: '' }));
    setResolvingId(request.id);
    try {
      await api.post(`/settlements/payout-requests/${request.id}/review`, { memo });
      setMemos((prev) => ({ ...prev, [request.id]: '' }));
      onResolved();
    } catch (error) {
      onError(getApiErrorMessage(error, MESSAGES.settlement.reviewResolveError));
    } finally {
      setResolvingId(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <ul className="space-y-2">
      {requests.map((r) => {
        // 돈이 두 번 나갔을 수 있는 사유(서버 판정)는 빨간 표시, 나머지는 노란 표시.
        const suspect = r.duplicateSuspected === true;
        const statusMeta = getPayoutRequestStatusMeta(r.status, r.statusLabel);
        return (
          <li
            key={r.id}
            className={`rounded-lg border p-3 space-y-2 ${
              suspect
                ? 'border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-900/10'
                : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-900/10'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                className={`px-1.5 py-0 text-[11px] ${
                  suspect
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }`}
              >
                {r.reviewReasonLabel ?? MESSAGES.settlement.reviewOpenBadge}
              </Badge>
              <Badge className={`${statusMeta.badge} px-1.5 py-0 text-[11px]`}>{statusMeta.label}</Badge>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {MESSAGES.settlement.payoutHistoryColPayDate} {r.settlementDate?.slice(0, 10) ?? '-'}
              </span>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {MESSAGES.settlement.payoutHistoryColNiceSeq} {r.niceSeq ?? '-'}
              </span>
              <span className="text-slate-900 dark:text-white tabular-nums">{formatAmount(r.amount)}</span>
              {r.niceStatusNm && (
                <span className="text-slate-500 dark:text-slate-400">
                  {MESSAGES.settlement.reviewColNiceStatus} {r.niceStatusNm}
                </span>
              )}
              {r.lastCheckedAt && (
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {MESSAGES.settlement.reviewColLastChecked} {isoToKstDateTimeLabel(r.lastCheckedAt)}
                </span>
              )}
            </div>
            {r.errReason && <p className="text-xs text-slate-600 dark:text-slate-300">{r.errReason}</p>}
            {/* 실패 건의 나이스 재진행은 확인 완료해도 다음 조회가 다시 켠다 — 풀리는 길은 나이스 쪽 실패·삭제뿐이다 */}
            {r.reviewReason === 'REOPENED_IN_PROGRESS' && (
              <p className="flex items-start gap-1.5 rounded-md bg-white/70 dark:bg-slate-900/40 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {MESSAGES.settlement.reviewReopenedNotice}
              </p>
            )}
            <div className="space-y-1">
              <Textarea
                value={memos[r.id] ?? ''}
                onChange={(e) => setMemos((prev) => ({ ...prev, [r.id]: e.target.value }))}
                placeholder={MESSAGES.settlement.reviewMemoPlaceholder}
                rows={2}
                maxLength={500}
                disabled={resolvingId === r.id}
                aria-label={MESSAGES.settlement.reviewMemoPlaceholder}
              />
              {memoErrors[r.id] && (
                <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                  {memoErrors[r.id]}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={() => void handleResolve(r)} disabled={resolvingId === r.id}>
                  {resolvingId === r.id ? MESSAGES.settlement.reviewResolving : MESSAGES.settlement.reviewResolveButton}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
