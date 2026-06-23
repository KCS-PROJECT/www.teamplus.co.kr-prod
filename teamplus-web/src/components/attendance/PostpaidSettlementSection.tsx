'use client';

/**
 * PostpaidSettlementSection (Phase B-5-3)
 *
 * attendance-manage 페이지 내 "후불 정산" 섹션 — 신규 페이지 없이 출석 이력 화면에 임베드.
 * 후불(POSTPAID·1회 수업료 설정) 수업에서만 노출(draft.unitPrice/status 로 자체 판단).
 * 감독이 월별 회원 출석×단가 검수 후 "정산 확정"으로 회원 결제 요청 일괄 발송.
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import {
  getPostpaidDraft,
  confirmPostpaidSettlement,
  type PostpaidDraft,
} from '@/services/postpaid-billing.service';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function PostpaidSettlementSection({ classId }: { classId: string }) {
  const { toast } = useToast();
  const [yearMonth, setYearMonth] = useState<string>(() => currentYearMonth());
  const [draft, setDraft] = useState<PostpaidDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getPostpaidDraft(classId, yearMonth);
    setDraft(d);
    setLoading(false);
  }, [classId, yearMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  // 후불 단가 미설정(=선불 수업) + 정산 이력 없음 → 섹션 자체 숨김.
  if (
    !loading &&
    draft &&
    draft.unitPrice <= 0 &&
    draft.status === 'none' &&
    draft.items.length === 0
  ) {
    return null;
  }
  if (!draft) return null;

  const isConfirmed = draft.status === 'confirmed';
  const isPastMonth = yearMonth < currentYearMonth(); // YYYY-MM 사전식 = 시간순
  const canConfirm =
    !isConfirmed && !submitting && draft.items.length > 0 && isPastMonth;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    const res = await confirmPostpaidSettlement(classId, yearMonth);
    setSubmitting(false);
    if (!res) {
      toast.error(MESSAGES.error.general);
      return;
    }
    toast.success(MESSAGES.postpaidSettlement.confirmedToast);
    await load();
  };

  return (
    <section className="mx-4 mt-3 rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm p-5">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
          {MESSAGES.postpaidSettlement.title}
        </h2>
        {isConfirmed && (
          <span className="px-2 py-0.5 rounded-w-pill text-card-caption font-bold bg-mint/15 text-mint">
            {MESSAGES.postpaidSettlement.confirmedBadge}
          </span>
        )}
      </header>

      {/* 월 선택 */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setYearMonth((ym) => shiftMonth(ym, -1))}
          aria-label={MESSAGES.postpaidSettlement.prevMonth}
          className="flex size-9 items-center justify-center rounded-w-lg border border-wline-2 dark:border-rink-700 text-wtext-2 dark:text-rink-200"
        >
          <Icon name="chevron_left" aria-hidden="true" />
        </button>
        <span className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
          {MESSAGES.postpaidSettlement.monthLabel(yearMonth)}
        </span>
        <button
          type="button"
          onClick={() => setYearMonth((ym) => shiftMonth(ym, 1))}
          disabled={yearMonth >= currentYearMonth()}
          aria-label={MESSAGES.postpaidSettlement.nextMonth}
          className="flex size-9 items-center justify-center rounded-w-lg border border-wline-2 dark:border-rink-700 text-wtext-2 dark:text-rink-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="chevron_right" aria-hidden="true" />
        </button>
      </div>

      {/* 회원별 내역 */}
      {loading ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <li
              key={i}
              className="h-14 rounded-w-lg bg-wline-2 dark:bg-rink-700 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </ul>
      ) : draft.items.length === 0 ? (
        <p className="py-6 text-center text-card-meta text-wtext-3 dark:text-rink-300">
          {MESSAGES.postpaidSettlement.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {draft.items.map((it) => (
            <li
              key={it.userId}
              className="flex items-center justify-between rounded-w-lg border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40 px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                  {it.name}
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                  {MESSAGES.postpaidSettlement.attendanceUnit(
                    it.attendanceCount,
                    draft.unitPrice,
                  )}
                </p>
              </div>
              <span className="shrink-0 text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
                {it.amount.toLocaleString()}원
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 합계 */}
      <div className="mt-4 flex items-center justify-between border-t border-wline-2 dark:border-rink-700 pt-3">
        <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
          {MESSAGES.postpaidSettlement.total}
        </span>
        <span className="text-card-emphasis font-bold text-wtext-1 dark:text-white tabular-nums">
          {draft.totalAmount.toLocaleString()}원
        </span>
      </div>

      {/* 확정 버튼 */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className={cn(
          'mt-3 w-full h-12 rounded-xl font-bold text-card-title transition-colors motion-reduce:transition-none',
          canConfirm
            ? 'bg-ice-500 text-white hover:bg-ice-500/90 active:brightness-95'
            : 'bg-wline dark:bg-rink-700 text-wtext-3 cursor-not-allowed',
        )}
      >
        {isConfirmed
          ? MESSAGES.postpaidSettlement.confirmedBadge
          : submitting
            ? MESSAGES.postpaidSettlement.confirming
            : MESSAGES.postpaidSettlement.confirmCta}
      </button>
      {!isConfirmed && (
        <p className="mt-2 text-card-caption text-wtext-3 dark:text-rink-300 leading-relaxed">
          {isPastMonth
            ? MESSAGES.postpaidSettlement.confirmHint
            : MESSAGES.postpaidSettlement.monthNotEndedHint}
        </p>
      )}
    </section>
  );
}

export default PostpaidSettlementSection;
