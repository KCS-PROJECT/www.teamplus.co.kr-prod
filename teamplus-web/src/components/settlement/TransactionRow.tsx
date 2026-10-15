'use client';

import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { kstYearMonth } from '@/lib/kst-month';
import { PaymentSourceBadge } from '@/components/payment/PaymentSourceBadge';
import { formatCurrency, staggerDelay } from '@/components/settlement/settlement-format';
import type { TeamTransactionItem } from '@/services/payment';

/** 거래 상태 표시 — completed/refunded(부분 포함)/cancelled/refund_processing. */
const TXN_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  completed: {
    label: MESSAGES.settlement.txnStatusCompleted,
    cls: 'text-success',
    dot: 'bg-mint-500',
  },
  refunded: {
    label: MESSAGES.settlement.txnStatusRefunded,
    cls: 'text-it-red-500',
    dot: 'bg-it-red-500',
  },
  partially_refunded: {
    label: MESSAGES.settlement.txnStatusRefunded,
    cls: 'text-it-red-500',
    dot: 'bg-it-red-500',
  },
  cancelled: {
    label: MESSAGES.settlement.txnStatusCancelled,
    cls: 'text-it-red-500',
    dot: 'bg-it-red-500',
  },
  refund_processing: {
    label: MESSAGES.settlement.txnRefundProcessing,
    cls: 'text-it-ink-500 dark:text-wtext-4',
    dot: 'bg-sun-500',
  },
};

/** KST 일시 파트 — 일자 헤더("MM.DD (요일)" — 연월 문맥은 Hero 월 선택기가 제공)와
 *  행 시각("HH:mm") 분리 표기용. */
function txnKstParts(iso: string): { dateLabel: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? '';
  return {
    dateLabel: `${g('month')}.${g('day')} (${g('weekday')})`,
    time: `${g('hour')}:${g('minute')}`,
  };
}

/** 거래를 KST 일자별로 그룹핑 — 은행앱 거래내역 패턴(최신순 유지, 연속 동일 일자 묶음). */
export function groupTxnsByDate(
  items: TeamTransactionItem[],
): { dateLabel: string; items: TeamTransactionItem[] }[] {
  const groups: { dateLabel: string; items: TeamTransactionItem[] }[] = [];
  for (const item of items) {
    const dateLabel = txnKstParts(item.completedAt)?.dateLabel ?? '';
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.dateLabel === dateLabel) {
      lastGroup.items.push(item);
    } else {
      groups.push({ dateLabel, items: [item] });
    }
  }
  return groups;
}

/** 귀속 월 칩 문구 — 결제 월(KST)과 다른 건만 구분한다(같은 달이면 소음). 연도가 다르면
 *  "YYYY년 M월분", 같은 해면 "M월분". 귀속 근거가 없거나 결제 시각이 깨졌으면 null. */
export function resolveAttributionChip(item: TeamTransactionItem): string | null {
  if (!item.attributionMonth) return null;
  const paidAt = new Date(item.completedAt);
  if (Number.isNaN(paidAt.getTime())) return null;
  const paidYm = kstYearMonth(paidAt);
  if (item.attributionMonth === paidYm) return null;
  const [y, m] = item.attributionMonth.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return y === Number(paidYm.slice(0, 4))
    ? MESSAGES.settlement.attributionMonthChip(m)
    : MESSAGES.settlement.attributionMonthYearChip(y, m);
}

/** 일자 그룹 헤더 — "YYYY.MM.DD (요일)" (결제내역 월 헤더와 동일 톤). */
export function TxnDateHeader({ label }: { label: string }) {
  return (
    <h3 className="pb-1 pt-4 font-num text-[12.5px] font-extrabold tabular-nums text-it-ink-400 dark:text-wtext-3">
      {label}
    </h3>
  );
}

/** 거래 내역 행 — 결제 1건. 타이틀 줄=출처 배지+선수명(볼드)+결제 보호자(옅은 톤),
 *  메타 줄=상품명·시각(구분 기호 없이 간격 구분). 선수 연결이 없으면 상품명이 타이틀로 승격. */
export function TransactionRow({
  item,
  index = 0,
  last,
}: {
  item: TeamTransactionItem;
  index?: number;
  last?: boolean;
}) {
  const status = TXN_STATUS[item.paymentStatus] ?? TXN_STATUS.completed;
  const struck =
    item.paymentStatus === 'refunded' || item.paymentStatus === 'cancelled';
  const subjectAsTitle = !item.childName && !!item.subjectName;
  const title = item.childName ?? item.subjectName ?? item.payerName ?? '';
  const payer = item.payerName === title ? null : item.payerName;
  const metaSubject = subjectAsTitle ? null : item.subjectName;
  const time = txnKstParts(item.completedAt)?.time ?? null;
  const attributionChip = resolveAttributionChip(item);
  const showPartialRefund =
    item.paymentStatus === 'partially_refunded' && item.refundedAmount > 0;
  return (
    <article
      className={cn(
        'animate-slide-up py-[14px] motion-reduce:animate-none',
        !last && 'border-b border-it-line dark:border-rink-700',
      )}
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <PaymentSourceBadge
              sourceType={item.sourceType}
              billingTiming={item.billingTiming}
              className="shrink-0 self-center"
            />
            <p className="min-w-0 truncate text-[15px] font-bold text-it-ink-800 dark:text-white">
              {title}
            </p>
            {payer && (
              <span className="shrink-0 text-[13px] text-it-ink-500 dark:text-wtext-4">
                {payer}
              </span>
            )}
          </div>
          {/* 시각 선행 — 일자 헤더와 세로 스캔축 일치 + 고정폭이라 유사 컬럼 정렬. */}
          <p className="mt-0.5 flex items-center gap-x-3 font-num text-[13px] tabular-nums text-it-ink-500 dark:text-wtext-4">
            {time && <span className="shrink-0">{time}</span>}
            {attributionChip && (
              <span className="shrink-0 rounded-w-pill bg-it-fill px-1.5 py-px text-[11px] font-semibold text-it-ink-500 dark:bg-rink-700 dark:text-wtext-4">
                {attributionChip}
              </span>
            )}
            {metaSubject && (
              <span className="min-w-0 truncate">{metaSubject}</span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'text-[15px] font-extrabold tabular-nums',
              struck
                ? 'text-it-ink-400 line-through decoration-it-ink-300/50'
                : 'text-it-ink-800 dark:text-white',
            )}
          >
            {formatCurrency(item.amount)}
            <span className="ml-0.5 text-[12px] font-medium">
              {MESSAGES.settlement.won}
            </span>
          </p>
          <span
            className={cn(
              'mt-0.5 inline-flex items-center gap-1 text-card-meta font-semibold',
              status.cls,
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-w-pill', status.dot)}
              aria-hidden="true"
            />
            {status.label}
          </span>
          {showPartialRefund && (
            <p className="mt-0.5 text-card-meta font-semibold text-it-red-500 tabular-nums">
              {MESSAGES.settlement.txnPartialRefund(formatCurrency(item.refundedAmount))}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
