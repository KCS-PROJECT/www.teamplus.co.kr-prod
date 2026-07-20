'use client';

/**
 * SettlementItemCard — 정산 소계 카드 (공유 모듈)
 *
 * 팀 허브(director-payments)와 오픈클래스(academy) 정산 탭이 재사용한다.
 * 훈련(수업)/대회 소계를 하나의 카드 형태(SettlementCardData)로 정규화하여 렌더하며,
 * 5-state 배지·선불/후불/미설정 인원·청구/수납/미수·예상 배지·차단 사유·detailPath 드릴다운을 담당한다.
 *
 * ⚠️ director-payments 인라인 정의에서 기계적으로 추출 — 동작·스타일 100% 동일.
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type {
  ClassSettlementSummary,
  SettlementSubtotalStatus,
  SettlementBlockedReasonCode,
} from '@/services/payment';
import { formatCurrency, staggerDelay } from './settlement-format';

/** 훈련/대회 카드 공통 정규화 형태 — 두 소계 타입을 하나의 카드 컴포넌트로 렌더. */
export interface SettlementCardData {
  title: string;
  subtitle: string | null;
  settlementStatus: SettlementSubtotalStatus;
  total: number;
  paidCount: number;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  estimatedAmount: number;
  mixedBilling: boolean;
  /** 선불/후불/미설정 인원 요약 텍스트 조각(대회는 빈 배열). */
  timingParts: string[];
  blockedReasonCode: SettlementBlockedReasonCode;
  detailPath: string;
}

// ─── 5-state 정산 상태 배지 (it-* 토큰) ──────────────
export const SETTLEMENT_STATUS_BADGE: Record<
  SettlementSubtotalStatus,
  { label: string; className: string }
> = {
  CONFIRMED: {
    label: MESSAGES.settlement.statusConfirmed,
    className: 'bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-500',
  },
  NOT_READY: {
    label: MESSAGES.settlement.statusNotReady,
    className:
      'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-900/30 dark:text-it-blue-300',
  },
  DRAFT: {
    label: MESSAGES.settlement.statusDraft,
    className: 'bg-sun-100 text-it-ink-800 dark:bg-sun-500/15 dark:text-sun-500',
  },
  PARTIAL_BILLED: {
    label: MESSAGES.settlement.statusPartialBilled,
    className:
      'bg-it-red-50 text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-300',
  },
  NOT_REQUIRED: {
    label: MESSAGES.settlement.statusNotRequired,
    className: 'bg-it-ink-100 text-it-ink-500 dark:bg-rink-700 dark:text-wtext-4',
  },
};

export const BLOCKED_REASON_LABEL: Record<
  Exclude<SettlementBlockedReasonCode, null>,
  string
> = {
  MONTH_NOT_ENDED: MESSAGES.settlement.blockedMonthNotEnded,
  NO_ATTENDANCE: MESSAGES.settlement.blockedNoAttendance,
  UNIT_PRICE_MISSING: MESSAGES.settlement.blockedUnitPriceMissing,
  TOURNAMENT_NOT_ENDED: MESSAGES.settlement.blockedTournamentNotEnded,
  BILLING_TIMING_UNASSIGNED: MESSAGES.settlement.blockedBillingTimingUnassigned,
};

/** 수업 소계 → 카드 데이터(선불/후불/미설정 인원 요약 포함). */
export function classToCardData(item: ClassSettlementSummary): SettlementCardData {
  const timingParts: string[] = [];
  const { prepaid, postpaid, unassigned, person } = MESSAGES.settlement;
  if (item.prepaidCount > 0) timingParts.push(`${prepaid} ${item.prepaidCount}${person}`);
  if (item.postpaidCount > 0) timingParts.push(`${postpaid} ${item.postpaidCount}${person}`);
  if (item.unassignedCount > 0)
    timingParts.push(`${unassigned} ${item.unassignedCount}${person}`);
  return {
    title: item.className,
    subtitle: item.teamName,
    settlementStatus: item.settlementStatus,
    total: item.total,
    paidCount: item.paidCount,
    billedAmount: item.billedAmount,
    paidAmount: item.paidAmount,
    outstandingAmount: item.outstandingAmount,
    estimatedAmount: item.estimatedAmount,
    mixedBilling: item.mixedBilling,
    timingParts,
    blockedReasonCode: item.blockedReasonCode,
    detailPath: item.detailPath,
  };
}

/** 5-state 정산 상태 배지. */
function SettlementStatusBadge({ status }: { status: SettlementSubtotalStatus }) {
  const cfg = SETTLEMENT_STATUS_BADGE[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-w-sm px-2 py-0.5 text-[11.5px] font-bold',
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

/** 훈련/대회 소계 카드 — 클릭 시 detailPath 드릴다운. */
export function SettlementItemCard({
  data,
  index = 0,
  last,
  onOpen,
}: {
  data: SettlementCardData;
  index?: number;
  last?: boolean;
  onOpen: (path: string) => void;
}) {
  const showEstimated =
    data.settlementStatus !== 'CONFIRMED' && data.estimatedAmount > 0;
  const hasOutstanding = data.outstandingAmount > 0;
  const { won, billed, paid, outstanding, estimated, mixed, paidRatio } =
    MESSAGES.settlement;

  return (
    <button
      type="button"
      onClick={() => onOpen(data.detailPath)}
      className={cn(
        'animate-slide-up block w-full py-[14px] text-left active:brightness-[0.98] motion-reduce:animate-none',
        !last && 'border-b border-it-line dark:border-rink-700',
      )}
      style={{ animationDelay: staggerDelay(index) }}
    >
      {/* 제목 + 상태 배지 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold text-it-ink-800 dark:text-white">
            {data.title}
          </h3>
          {data.subtitle && (
            <p className="mt-0.5 truncate text-[13px] text-it-ink-500 dark:text-wtext-4">
              {data.subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SettlementStatusBadge status={data.settlementStatus} />
          <Icon
            name="chevron_right"
            className="text-[18px] text-it-ink-300 dark:text-rink-500"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* 결제방식 인원 요약 (수업 전용) + 혼합 태그 */}
      {(data.timingParts.length > 0 || data.mixedBilling) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-it-ink-500 dark:text-wtext-4">
          {data.timingParts.length > 0 && <span>{data.timingParts.join(' · ')}</span>}
          {data.mixedBilling && (
            <span className="inline-flex items-center rounded-w-sm bg-it-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-it-blue-600 dark:bg-it-blue-900/30 dark:text-it-blue-300">
              {mixed}
            </span>
          )}
        </p>
      )}

      {/* 완납 인원 + 예상 배지 */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-it-ink-500 dark:text-wtext-4">
          {paidRatio(data.paidCount, data.total)}
        </span>
        {showEstimated && (
          <span className="inline-flex items-center gap-1 rounded-w-sm bg-it-blue-50 px-1.5 py-0.5 text-[11.5px] font-bold text-it-blue-600 tabular-nums dark:bg-it-blue-900/30 dark:text-it-blue-300">
            {estimated} {formatCurrency(data.estimatedAmount)}
            {won}
          </span>
        )}
      </div>

      {/* 청구 · 수납 · 미수 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] tabular-nums">
        <span className="text-it-ink-500 dark:text-wtext-4">
          {billed}{' '}
          <strong className="font-bold text-it-ink-800 dark:text-white">
            {formatCurrency(data.billedAmount)}
          </strong>
        </span>
        <span className="text-it-ink-500 dark:text-wtext-4">
          {paid}{' '}
          <strong className="font-bold text-it-ink-800 dark:text-white">
            {formatCurrency(data.paidAmount)}
          </strong>
        </span>
        <span className={cn(hasOutstanding ? 'text-it-red-500' : 'text-it-ink-500 dark:text-wtext-4')}>
          {outstanding} <strong className="font-bold">{formatCurrency(data.outstandingAmount)}</strong>
        </span>
      </div>

      {/* 차단 사유 칩 */}
      {data.blockedReasonCode && (
        <p className="mt-2.5 inline-flex items-center gap-1 rounded-w-sm bg-sun-100 px-2 py-1 text-[12px] font-medium text-it-ink-700 dark:bg-sun-500/12 dark:text-wtext-3">
          <Icon name="info" className="text-[14px] text-sun-500" aria-hidden="true" />
          {BLOCKED_REASON_LABEL[data.blockedReasonCode]}
        </p>
      )}
    </button>
  );
}
