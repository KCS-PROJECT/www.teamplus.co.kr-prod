'use client';

/**
 * PaymentSourceBadge — 결제 출처(수업/대회) + 선후불 칩 2개
 *
 * 결제 5화면(history/receipt/complete/postpaid)과 감독 거래 내역에서 공용.
 * 백엔드 파생 필드 sourceType·billingTiming 이 **둘 다 non-null 일 때만**
 * 렌더한다(무관계 결제 매치·쇼핑 오라벨 방지). 출처와 결제방식은 정보 축이
 * 달라 독립 칩으로 분리 — 출처는 중립 회색, 결제방식은 통계 화면
 * BillingModeBadge 와 동일 색 문법(선불=blue · 후불=success).
 */

import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { PaymentSourceType, PaymentBillingTiming } from '@/types/payment';

export interface PaymentSourceBadgeProps {
  sourceType?: PaymentSourceType | null;
  billingTiming?: PaymentBillingTiming | null;
  className?: string;
}

export function PaymentSourceBadge({
  sourceType,
  billingTiming,
  className,
}: PaymentSourceBadgeProps) {
  // 무관계 결제(매치·쇼핑 등)는 둘 중 하나라도 없으면 배지 미표시.
  if (!sourceType || !billingTiming) return null;

  const sourceLabel =
    sourceType === 'TOURNAMENT'
      ? MESSAGES.payment2.sourceTournament
      : MESSAGES.payment2.sourceClass;
  const timingLabel =
    billingTiming === 'POSTPAID'
      ? MESSAGES.payment2.postpaid
      : MESSAGES.payment2.prepaid;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="rounded-w-pill bg-it-fill px-1.5 py-0.5 text-card-meta font-semibold text-it-ink-600 dark:bg-rink-700 dark:text-rink-100">
        {sourceLabel}
      </span>
      <span
        className={cn(
          'rounded-w-pill px-1.5 py-0.5 text-card-meta font-semibold',
          billingTiming === 'POSTPAID'
            ? 'bg-success-100 text-success dark:bg-success-700/20 dark:text-success'
            : 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500',
        )}
      >
        {timingLabel}
      </span>
    </span>
  );
}

export default PaymentSourceBadge;
